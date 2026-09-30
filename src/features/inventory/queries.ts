import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// ─── Query keys ──────────────────────────────────────────────────────────────

export const inventoryKeys = {
  all: ['inventory'] as const,
  stockItems: (filters: StockFilters) =>
    [...inventoryKeys.all, 'stockItems', filters] as const,
  categories: () => [...inventoryKeys.all, 'categories'] as const,
  products: (categoryId?: string) =>
    [...inventoryKeys.all, 'products', categoryId ?? 'all'] as const,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StockFilters {
  categoryId?: string;
  productId?: string;
  source?: 'full' | 'offcut';
  status?: 'available' | 'removed' | 'consumed';
}

/**
 * Shape returned by the stock items query, with joined product + category.
 * Derived from the Supabase select — not hand-typed row types.
 */
export type StockItemWithProduct = NonNullable<
  Awaited<ReturnType<typeof fetchStockItems>>
>['data'] extends (infer T)[] | null
  ? T
  : never;

// ─── Fetch functions ─────────────────────────────────────────────────────────

async function fetchStockItems(filters: StockFilters) {
  let query = supabase
    .from('stock_items')
    .select(
      `
      id,
      product_id,
      width_mm,
      height_mm,
      source,
      status,
      parent_id,
      vertical_line_height_mm,
      created_at,
      product:products!inner (
        id,
        name,
        thickness_mm,
        color,
        is_lining,
        category_id,
        category:categories!inner (
          id,
          name
        )
      )
    `,
    )
    .order('created_at', { ascending: false });

  // Default: only show available items
  const statusFilter = filters.status ?? 'available';
  query = query.eq('status', statusFilter);

  if (filters.productId) {
    query = query.eq('product_id', filters.productId);
  }

  if (filters.categoryId) {
    query = query.eq('product.category_id', filters.categoryId);
  }

  if (filters.source) {
    query = query.eq('source', filters.source);
  }

  return query;
}

async function fetchCategories() {
  return supabase
    .from('categories')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true });
}

async function fetchProducts(categoryId?: string) {
  let query = supabase
    .from('products')
    .select('id, category_id, name, thickness_mm, color, is_lining, active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  return query;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useStockItems(filters: StockFilters) {
  return useQuery({
    queryKey: inventoryKeys.stockItems(filters),
    queryFn: async () => {
      const { data, error } = await fetchStockItems(filters);
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: inventoryKeys.categories(),
    queryFn: async () => {
      const { data, error } = await fetchCategories();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60 * 1000, // categories rarely change
  });
}

export function useProducts(categoryId?: string) {
  return useQuery({
    queryKey: inventoryKeys.products(categoryId),
    queryFn: async () => {
      const { data, error } = await fetchProducts(categoryId);
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
