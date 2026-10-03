import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// ─── Query keys ──────────────────────────────────────────────────────────────

export const orderKeys = {
  all: ['orders'] as const,
  list: (filters: OrderListFilters) =>
    [...orderKeys.all, 'list', filters] as const,
  detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
  customerByPhone: (phone: string) =>
    [...orderKeys.all, 'customerByPhone', phone] as const,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OrderListFilters {
  store?: string;
  status?: string;
}

// ─── Fetch functions ─────────────────────────────────────────────────────────

async function fetchOrders(filters: OrderListFilters) {
  let query = supabase
    .from('orders')
    .select(
      `
      id,
      order_no,
      store,
      status,
      total,
      paid,
      payment_method,
      notes,
      created_at,
      customer:customers!inner (
        id,
        name,
        phone
      )
    `,
    )
    .order('created_at', { ascending: false });

  if (filters.store) {
    query = query.eq('store', filters.store);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  return query;
}

async function fetchOrderDetail(id: string) {
  return supabase
    .from('orders')
    .select(
      `
      id,
      order_no,
      store,
      status,
      total,
      paid,
      payment_method,
      notes,
      created_at,
      created_by,
      customer:customers!inner (
        id,
        name,
        phone,
        address
      ),
      order_items (
        id,
        product_id,
        width_mm,
        height_mm,
        qty,
        unit_price,
        line_total,
        product:products!inner (
          id,
          name,
          thickness_mm,
          color,
          category:categories!inner (
            name
          )
        )
      )
    `,
    )
    .eq('id', id)
    .single();
}

async function fetchCustomerByPhone(phone: string) {
  return supabase
    .from('customers')
    .select('id, name, phone, address')
    .eq('phone', phone)
    .maybeSingle();
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useOrders(filters: OrderListFilters) {
  return useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: async () => {
      const { data, error } = await fetchOrders(filters);
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useOrderDetail(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await fetchOrderDetail(id);
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!id,
  });
}

export function useCustomerByPhone(phone: string) {
  return useQuery({
    queryKey: orderKeys.customerByPhone(phone),
    queryFn: async () => {
      const { data, error } = await fetchCustomerByPhone(phone);
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: phone.length >= 5,
    staleTime: 30_000,
  });
}
