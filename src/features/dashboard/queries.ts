import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/database';

export type LowStockItem = Database['public']['Views']['low_stock']['Row'];

export const dashboardKeys = {
  all: ['dashboard'] as const,
  lowStock: () => [...dashboardKeys.all, 'lowStock'] as const,
};

async function fetchLowStock(): Promise<LowStockItem[]> {
  const { data, error } = await supabase
    .from('low_stock')
    .select('*')
    .order('name');

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export function useLowStock() {
  return useQuery({
    queryKey: dashboardKeys.lowStock(),
    queryFn: fetchLowStock,
    staleTime: 60_000,
  });
}
