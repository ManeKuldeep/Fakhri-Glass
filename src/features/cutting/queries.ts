import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { CuttingQueueTask, CuttingSheet } from './types';

export const cuttingKeys = {
  all: ['cutting'] as const,
  queue: (store?: string) => [...cuttingKeys.all, 'queue', store ?? 'all'] as const,
  stockForProduct: (productId: string) =>
    [...cuttingKeys.all, 'stock', productId] as const,
};

interface FetchQueueFilters {
  store?: string;
}

export async function fetchCuttingQueue(filters?: FetchQueueFilters): Promise<CuttingQueueTask[]> {
  // 1. Fetch all confirmed cut plans to exclude already confirmed items
  const { data: confirmedPlans, error: plansErr } = await supabase
    .from('cut_plans')
    .select('order_id, product_id');

  if (plansErr) throw new Error(plansErr.message);

  const confirmedSet = new Set<string>();
  if (confirmedPlans) {
    for (const cp of confirmedPlans) {
      confirmedSet.add(`${cp.order_id}:${cp.product_id}`);
    }
  }

  // 2. Fetch orders in 'new' or 'cutting' status
  let query = supabase
    .from('orders')
    .select(
      `
      id,
      order_no,
      store,
      status,
      created_at,
      customer:customers!inner (
        id,
        name,
        phone
      ),
      order_items (
        id,
        product_id,
        width_mm,
        height_mm,
        qty,
        is_polished,
        product:products!inner (
          id,
          name,
          thickness_mm,
          color,
          is_lining,
          category:categories!inner (
            id,
            name
          )
        )
      )
    `,
    )
    .in('status', ['new', 'cutting'])
    .order('created_at', { ascending: true });

  if (filters?.store) {
    query = query.eq('store', filters.store);
  }

  const { data: orders, error } = await query;
  if (error) throw new Error(error.message);
  if (!orders) return [];

  // Group by (order_id, product_id)
  const taskMap = new Map<string, CuttingQueueTask>();

  for (const order of orders) {
    for (const item of order.order_items) {
      const prod = item.product;
      const key = `${order.id}:${prod.id}`;

      // Skip if this product in this order already has a confirmed cut plan
      if (confirmedSet.has(key)) continue;

      if (!taskMap.has(key)) {
        taskMap.set(key, {
          orderId: order.id,
          orderIds: [order.id],
          orderNo: order.order_no,
          orderNos: [order.order_no],
          store: order.store,
          customerName: order.customer.name,
          customerPhone: order.customer.phone,
          productId: prod.id,
          productName: prod.name,
          categoryName: prod.category.name,
          thicknessMm: prod.thickness_mm,
          color: prod.color,
          isLining: prod.is_lining,
          totalPiecesCount: 0,
          orderItems: [],
          ordersSummary: [
            {
              orderId: order.id,
              orderNo: order.order_no,
              customerName: order.customer.name,
              store: order.store,
              piecesCount: 0,
            },
          ],
        });
      }

      const task = taskMap.get(key)!;
      const isPolished = Boolean(item.is_polished);
      const allowance = isPolished ? 3 : 0;

      task.totalPiecesCount += item.qty;
      if (task.ordersSummary && task.ordersSummary.length > 0) {
        task.ordersSummary[0].piecesCount += item.qty;
      }
      task.orderItems.push({
        orderItemId: item.id,
        orderId: order.id,
        orderNo: order.order_no,
        customerName: order.customer.name,
        widthMm: item.width_mm + allowance,
        heightMm: item.height_mm + allowance,
        qty: item.qty,
        isPolished,
        finishedWidthMm: item.width_mm,
        finishedHeightMm: item.height_mm,
      });
    }
  }

  return Array.from(taskMap.values()).filter((t) => t.totalPiecesCount > 0);
}

/**
 * Merge multiple tasks of the same product into a single multi-order cutting task.
 */
export function mergeCuttingQueueTasks(tasks: CuttingQueueTask[]): CuttingQueueTask {
  if (tasks.length === 0) {
    throw new Error('No tasks to merge');
  }
  if (tasks.length === 1) {
    return tasks[0];
  }

  const base = tasks[0];
  const allOrderIds: string[] = [];
  const allOrderNos: number[] = [];
  const allOrderItems: CuttingQueueTask['orderItems'] = [];
  const allSummaries: NonNullable<CuttingQueueTask['ordersSummary']> = [];
  let totalPieces = 0;

  for (const t of tasks) {
    for (const oid of t.orderIds) {
      if (!allOrderIds.includes(oid)) allOrderIds.push(oid);
    }
    for (const ono of t.orderNos) {
      if (!allOrderNos.includes(ono)) allOrderNos.push(ono);
    }
    allOrderItems.push(...t.orderItems);
    totalPieces += t.totalPiecesCount;
    if (t.ordersSummary) {
      allSummaries.push(...t.ordersSummary);
    }
  }

  return {
    ...base,
    orderId: base.orderId,
    orderIds: allOrderIds,
    orderNo: base.orderNo,
    orderNos: allOrderNos,
    customerName: `${allOrderNos.length} Orders (${allOrderNos.map((n) => `#${n}`).join(', ')})`,
    totalPiecesCount: totalPieces,
    orderItems: allOrderItems,
    ordersSummary: allSummaries,
  };
}

export async function fetchStockForProduct(productId: string): Promise<CuttingSheet[]> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, width_mm, height_mm, source, status, vertical_line_height_mm')
    .eq('product_id', productId)
    .eq('status', 'available')
    .order('source', { ascending: false }); // offcut first, then full

  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map((item) => ({
    id: item.id,
    width_mm: item.width_mm,
    height_mm: item.height_mm,
    source: (item.source === 'offcut' ? 'offcut' : 'full') as 'full' | 'offcut',
    vertical_line_height_mm: item.vertical_line_height_mm,
  }));
}

export function useCuttingQueue(store?: string) {
  return useQuery({
    queryKey: cuttingKeys.queue(store),
    queryFn: () => fetchCuttingQueue({ store }),
  });
}

export function useStockForProduct(productId?: string) {
  return useQuery({
    queryKey: cuttingKeys.stockForProduct(productId ?? ''),
    queryFn: () => fetchStockForProduct(productId!),
    enabled: !!productId,
  });
}
