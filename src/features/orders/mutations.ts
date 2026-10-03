import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { orderKeys } from './queries';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderItemInput {
  productId: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  unitPrice: number;
}

interface CreateOrderInput {
  /** Existing customer id to reuse, or undefined to create new */
  existingCustomerId: string | undefined;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  store: string;
  paymentMethod?: string;
  notes: string;
  items: OrderItemInput[];
}

// ─── Mutation ────────────────────────────────────────────────────────────────

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      // 1. Upsert customer
      let customerId = input.existingCustomerId;

      if (customerId) {
        // Update existing customer info if changed
        const { error: updateErr } = await supabase
          .from('customers')
          .update({
            name: input.customerName,
            phone: input.customerPhone || null,
            address: input.customerAddress || null,
          })
          .eq('id', customerId);

        if (updateErr) {
          throw new Error(`Failed to update customer: ${updateErr.message}`);
        }
      } else {
        // Create new customer
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({
            name: input.customerName,
            phone: input.customerPhone || null,
            address: input.customerAddress || null,
          })
          .select('id')
          .single();

        if (custErr) {
          throw new Error(`Failed to create customer: ${custErr.message}`);
        }
        customerId = newCustomer.id;
      }

      // 2. Call atomic RPC: inserts order + items in one transaction.
      //    No orphaned orders possible — if any item fails, everything rolls back.
      const itemsJson = input.items.map((item) => ({
        product_id: item.productId,
        width_mm: item.widthMm,
        height_mm: item.heightMm,
        qty: item.qty,
        unit_price: item.unitPrice,
      }));

      const { data, error: rpcErr } = await supabase
        .rpc('create_order_with_items', {
          p_customer_id: customerId,
          p_store: input.store,
          p_payment_method: input.paymentMethod || undefined,
          p_notes: input.notes || undefined,
          p_items: itemsJson,
        })
        .single();

      if (rpcErr) {
        throw new Error(`Failed to create order: ${rpcErr.message}`);
      }

      // RPC returns { id, order_no }
      const result = data as { id: string; order_no: number };
      return { orderId: result.id, orderNo: result.order_no };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}
