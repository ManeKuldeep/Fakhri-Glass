import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/database';

export type ActivityLogRow = Database['public']['Tables']['activity_log']['Row'];

export interface ActivityLogFilters {
  page?: number;
  pageSize?: number;
  actionCategory?: 'all' | 'orders' | 'stock' | 'events';
}

export const activityLogKeys = {
  all: ['activityLog'] as const,
  list: (filters: ActivityLogFilters) =>
    [...activityLogKeys.all, 'list', filters] as const,
};

const PAGE_SIZE = 30;

export async function fetchActivityLogs(filters: ActivityLogFilters) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? PAGE_SIZE;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('activity_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.actionCategory === 'orders') {
    query = query.in('table_name', ['orders', 'order_items']);
  } else if (filters.actionCategory === 'stock') {
    query = query.in('table_name', ['stock_items', 'products', 'categories']);
  } else if (filters.actionCategory === 'events') {
    query = query.eq('action', 'event');
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return {
    items: data ?? [],
    totalCount: count ?? 0,
    hasMore: count != null ? to + 1 < count : false,
  };
}

export function useActivityLog(filters: ActivityLogFilters) {
  return useQuery({
    queryKey: activityLogKeys.list(filters),
    queryFn: () => fetchActivityLogs(filters),
    staleTime: 30_000,
  });
}
