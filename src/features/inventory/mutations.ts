import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { inventoryKeys } from './queries';
import { friendlyStockError } from './utils';
import type { TablesInsert } from '../../types/database';

// ─── Add Stock ───────────────────────────────────────────────────────────────

interface AddStockInput {
  productId: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  /** Required for lining products, null otherwise */
  verticalLineHeightMm: number | null;
}

export function useAddStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddStockInput) => {
      const rows: TablesInsert<'stock_items'>[] = Array.from(
        { length: input.quantity },
        () => ({
          product_id: input.productId,
          width_mm: input.widthMm,
          height_mm: input.heightMm,
          source: 'full' as const,
          vertical_line_height_mm: input.verticalLineHeightMm,
        }),
      );

      const { data, error } = await supabase
        .from('stock_items')
        .insert(rows)
        .select('id');

      if (error) {
        throw new Error(friendlyStockError(error.message));
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

// ─── Update Stock ────────────────────────────────────────────────────────────

interface UpdateStockInput {
  id: string;
  widthMm: number;
  heightMm: number;
  verticalLineHeightMm: number | null;
}

export function useUpdateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateStockInput) => {
      const { error } = await supabase
        .from('stock_items')
        .update({
          width_mm: input.widthMm,
          height_mm: input.heightMm,
          vertical_line_height_mm: input.verticalLineHeightMm,
        })
        .eq('id', input.id);

      if (error) {
        throw new Error(friendlyStockError(error.message));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

// ─── Remove Stock (soft delete) ──────────────────────────────────────────────

export function useRemoveStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('stock_items')
        .update({ status: 'removed' })
        .eq('id', id);

      if (error) {
        throw new Error(friendlyStockError(error.message));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}
