import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { cuttingKeys } from './queries';
import { orderKeys } from '../orders/queries';
import { inventoryKeys } from '../inventory/queries';
import { friendlyConfirmCutError } from './utils';
import type { Json } from '../../types/database';

export interface ConfirmPieceInput {
  order_item_id: string;
  stock_item_id: string;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  rotated: boolean;
}

export interface ConfirmOffcutInput {
  parent_id: string;
  width_mm: number;
  height_mm: number;
}

export interface ConfirmCutPlanInput {
  orderId: string;
  productId: string;
  kerfMm: number;
  maxWastagePct: number;
  pieces: ConfirmPieceInput[];
  offcuts: ConfirmOffcutInput[];
}

export function useConfirmCutPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ConfirmCutPlanInput) => {
      const { data, error } = await supabase.rpc('confirm_cut_plan', {
        p_order_id: input.orderId,
        p_product_id: input.productId,
        p_kerf_mm: input.kerfMm,
        p_max_wastage_pct: input.maxWastagePct,
        p_pieces: input.pieces as unknown as Json,
        p_offcuts: input.offcuts as unknown as Json,
      });

      if (error) {
        throw new Error(friendlyConfirmCutError(error.message));
      }

      return data as string; // returns plan_id uuid
    },
    onSuccess: () => {
      // Invalidate relevant queries so Orders, Inventory, and Cutting immediately update
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      void queryClient.invalidateQueries({ queryKey: cuttingKeys.all });
    },
  });
}
