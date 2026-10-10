import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface LowStockItem {
  product_id: string | null;
  name: string | null;
  min_stock_sheets: number | null;
  sheets: number | null;
  pending_orders_count?: number;
  reason?: 'out_of_stock' | 'min_stock_breach';
  category_name?: string;
  thickness_mm?: number;
}

export const dashboardKeys = {
  all: ['dashboard'] as const,
  lowStock: () => [...dashboardKeys.all, 'lowStock'] as const,
};

export async function fetchLowStock(): Promise<LowStockItem[]> {
  const alertMap = new Map<string, LowStockItem>();

  // 1. Fetch catalog min stock breaches from low_stock view
  const { data: viewData, error: viewError } = await supabase
    .from('low_stock')
    .select('*')
    .order('name');

  if (viewError) {
    throw new Error(viewError.message);
  }

  if (viewData) {
    for (const item of viewData) {
      if (item.product_id && item.name) {
        alertMap.set(item.product_id, {
          product_id: item.product_id,
          name: item.name,
          min_stock_sheets: item.min_stock_sheets,
          sheets: item.sheets,
          pending_orders_count: 0,
          reason: 'min_stock_breach',
        });
      }
    }
  }

  // 2. Fetch active orders in 'new' or 'cutting' to detect ordered products with 0 stock
  const { data: activeOrders, error: ordersError } = await supabase
    .from('orders')
    .select(`
      id,
      order_no,
      status,
      order_items (
        id,
        product_id,
        qty,
        product:products (
          id,
          name,
          thickness_mm,
          min_stock_sheets,
          category:categories (
            name
          )
        )
      )
    `)
    .in('status', ['new', 'cutting']);

  if (!ordersError && activeOrders && activeOrders.length > 0) {
    const productOrdersMap = new Map<
      string,
      {
        product: {
          id: string;
          name: string;
          thickness_mm: number;
          min_stock_sheets: number | null;
          categoryName?: string;
        };
        orderIds: Set<string>;
      }
    >();

    for (const order of activeOrders) {
      for (const item of order.order_items) {
        const prod = item.product;
        if (!prod) continue;
        if (!productOrdersMap.has(prod.id)) {
          productOrdersMap.set(prod.id, {
            product: {
              id: prod.id,
              name: prod.name,
              thickness_mm: prod.thickness_mm,
              min_stock_sheets: prod.min_stock_sheets,
              categoryName: prod.category?.name,
            },
            orderIds: new Set(),
          });
        }
        productOrdersMap.get(prod.id)!.orderIds.add(order.id);
      }
    }

    const demandedProductIds = Array.from(productOrdersMap.keys());
    if (demandedProductIds.length > 0) {
      const { data: stockRows, error: stockError } = await supabase
        .from('stock_items')
        .select('product_id')
        .in('product_id', demandedProductIds)
        .eq('status', 'available');

      if (!stockError) {
        const stockCountMap = new Map<string, number>();
        if (stockRows) {
          for (const s of stockRows) {
            stockCountMap.set(s.product_id, (stockCountMap.get(s.product_id) || 0) + 1);
          }
        }

        for (const [prodId, demand] of productOrdersMap.entries()) {
          const availableCount = stockCountMap.get(prodId) ?? 0;
          // If available stock is 0 for an active ordered product, flag as out of stock!
          if (availableCount === 0) {
            alertMap.set(prodId, {
              product_id: prodId,
              name: demand.product.name,
              min_stock_sheets: demand.product.min_stock_sheets,
              sheets: 0,
              pending_orders_count: demand.orderIds.size,
              reason: 'out_of_stock',
              category_name: demand.product.categoryName,
              thickness_mm: demand.product.thickness_mm,
            });
          } else if (alertMap.has(prodId)) {
            const existing = alertMap.get(prodId)!;
            existing.pending_orders_count = demand.orderIds.size;
          }
        }
      }
    }
  }

  return Array.from(alertMap.values());
}

export function useLowStock() {
  return useQuery({
    queryKey: dashboardKeys.lowStock(),
    queryFn: fetchLowStock,
    staleTime: 10_000,
  });
}
