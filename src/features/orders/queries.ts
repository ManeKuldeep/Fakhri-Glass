import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// ─── Query keys ──────────────────────────────────────────────────────────────

export const orderKeys = {
  all: ['orders'] as const,
  list: (filters: OrderListFilters) =>
    [...orderKeys.all, 'list', filters] as const,
  detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
  cutPlans: (orderId: string) => [...orderKeys.all, 'cutPlans', orderId] as const,
  customerSearch: (name: string) =>
    [...orderKeys.all, 'customerSearch', name] as const,
  customerByPhone: (phone: string) =>
    [...orderKeys.all, 'customerByPhone', phone] as const,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OrderListFilters {
  store?: string;
  status?: string;
}

export interface OrderCutPiece {
  id: string;
  order_item_id: string;
  stock_item_id: string;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  rotated: boolean;
  stock_item: {
    id: string;
    width_mm: number;
    height_mm: number;
    source: string;
    vertical_line_height_mm: number | null;
  } | null;
}

export interface OrderCutPlan {
  id: string;
  order_id: string;
  product_id: string;
  kerf_mm: number;
  max_wastage_pct: number | null;
  created_at: string;
  product: {
    id: string;
    name: string;
    thickness_mm: number;
    color: string | null;
    is_lining: boolean;
  } | null;
  cut_pieces: OrderCutPiece[];
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
    .eq('id', id)
    .single();
}

export type OrderDetailData = NonNullable<Awaited<ReturnType<typeof fetchOrderDetail>>['data']>;

async function fetchCustomerByPhone(phone: string) {
  return supabase
    .from('customers')
    .select('id, name, phone, address')
    .eq('phone', phone)
    .maybeSingle();
}

async function fetchCustomersByName(name: string) {
  return supabase
    .from('customers')
    .select('id, name, phone, address')
    .ilike('name', `%${name.trim()}%`)
    .limit(5);
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

export function useCustomerSearch(name: string) {
  const query = name.trim();
  return useQuery({
    queryKey: orderKeys.customerSearch(query),
    queryFn: async () => {
      const { data, error } = await fetchCustomersByName(query);
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
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

async function fetchOrderCutPlans(orderId: string) {
  return supabase
    .from('cut_plans')
    .select(`
      id,
      order_id,
      product_id,
      kerf_mm,
      max_wastage_pct,
      created_at,
      product:products (
        id,
        name,
        thickness_mm,
        color,
        is_lining
      ),
      cut_pieces (
        id,
        order_item_id,
        stock_item_id,
        x_mm,
        y_mm,
        w_mm,
        h_mm,
        rotated,
        stock_item:stock_items (
          id,
          width_mm,
          height_mm,
          source,
          vertical_line_height_mm
        )
      )
    `)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
}

export function useOrderCutPlans(orderId: string) {
  return useQuery({
    queryKey: orderKeys.cutPlans(orderId),
    queryFn: async () => {
      const { data, error } = await fetchOrderCutPlans(orderId);
      if (error) throw new Error(error.message);
      return data as unknown as OrderCutPlan[];
    },
    enabled: !!orderId,
  });
}

