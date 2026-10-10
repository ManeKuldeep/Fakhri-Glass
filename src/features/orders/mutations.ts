import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { cuttingKeys } from '../cutting/queries';
import { dashboardKeys } from '../dashboard/queries';
import { inventoryKeys } from '../inventory/queries';
import { orderKeys } from './queries';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OrderItemInput {
  productId: string;
  widthMm: number;
  heightMm: number;
  qty: number;
  unitPrice: number;
  isPolished?: boolean;
}

export interface CreateOrderInput {
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

export interface UpdateOrderInput {
  orderId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  store: string;
  paymentMethod?: string;
  notes: string;
  paid?: number;
  items: OrderItemInput[];
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      // 1. Resolve or create customer
      let customerId = input.existingCustomerId;

      // Look up existing customer by exact phone match (ignore empty phone) if not already resolved
      const trimmedPhone = input.customerPhone ? input.customerPhone.trim() : '';
      if (!customerId && trimmedPhone) {
        const { data: matchedCustomer } = await supabase
          .from('customers')
          .select('id, name, address')
          .eq('phone', trimmedPhone)
          .limit(1)
          .maybeSingle();

        if (matchedCustomer) {
          // If found, reuse it and do not overwrite its name or address without explicit confirmation
          customerId = matchedCustomer.id;
        }
      }

      if (customerId) {
        // Only update customer details if explicitly confirmed/selected by user (input.existingCustomerId)
        if (input.existingCustomerId) {
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
      const itemsJson = input.items.map((item) => ({
        product_id: item.productId,
        width_mm: item.widthMm,
        height_mm: item.heightMm,
        qty: item.qty,
        unit_price: item.unitPrice,
        is_polished: item.isPolished ?? false,
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

      const result = data as { id: string; order_no: number };
      return { orderId: result.id, orderNo: result.order_no };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: cuttingKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateOrderInput) => {
      // 1. Update customer details
      const { error: custErr } = await supabase
        .from('customers')
        .update({
          name: input.customerName,
          phone: input.customerPhone || null,
          address: input.customerAddress || null,
        })
        .eq('id', input.customerId);

      if (custErr) {
        throw new Error(`Failed to update customer: ${custErr.message}`);
      }

      // 2. Call atomic RPC: reverts old cut plans/stock if needed, updates order & items
      const itemsJson = input.items.map((item) => ({
        product_id: item.productId,
        width_mm: item.widthMm,
        height_mm: item.heightMm,
        qty: item.qty,
        unit_price: item.unitPrice,
        is_polished: item.isPolished ?? false,
      }));

      const { data, error: rpcErr } = await supabase
        .rpc('update_order_with_items', {
          p_order_id: input.orderId,
          p_customer_id: input.customerId,
          p_store: input.store,
          p_payment_method: input.paymentMethod || undefined,
          p_notes: input.notes || undefined,
          p_items: itemsJson,
          p_paid: input.paid,
        })
        .single();

      if (rpcErr) {
        throw new Error(`Failed to update order: ${rpcErr.message}`);
      }

      const result = data as { id: string; order_no: number };
      return { orderId: result.id, orderNo: result.order_no };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: cuttingKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('cancel_order', {
        p_order_id: orderId,
      });

      if (error) {
        throw new Error(`Failed to cancel order: ${error.message}`);
      }

      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: cuttingKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useMarkOrderDelivered() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data: orderData, error: fetchErr } = await supabase
        .from('orders')
        .select('order_no')
        .eq('id', orderId)
        .single();

      if (fetchErr) {
        throw new Error(`Failed to fetch order: ${fetchErr.message}`);
      }

      const { error } = await supabase
        .from('orders')
        .update({ status: 'delivered' })
        .eq('id', orderId);

      if (error) {
        throw new Error(`Failed to mark order as delivered: ${error.message}`);
      }

      await supabase.rpc('log_event', {
        p_summary: `Order #${orderData.order_no} marked as delivered`,
      });

      return { orderId, status: 'delivered' };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

