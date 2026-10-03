-- Refine create_order_with_items to accept optional/nullable payment_method and notes,
-- and safely map empty string to NULL to satisfy orders_payment_method_check.

create or replace function public.create_order_with_items(
  p_customer_id uuid,
  p_store text,
  p_payment_method text default null,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns table (id uuid, order_no bigint)
language plpgsql
set search_path to 'public'
as $$
declare
  v_order_id uuid;
  v_order_no bigint;
  v_total numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'An order must have at least one item';
  end if;

  select coalesce(sum((e->>'unit_price')::numeric * (e->>'qty')::numeric), 0)
    into v_total
  from jsonb_array_elements(p_items) e;

  insert into public.orders (customer_id, store, payment_method, notes, total, paid)
  values (p_customer_id, p_store, nullif(p_payment_method, ''), nullif(p_notes, ''), v_total, 0)
  returning public.orders.id, public.orders.order_no into v_order_id, v_order_no;

  insert into public.order_items (order_id, product_id, width_mm, height_mm, qty, unit_price, line_total)
  select
    v_order_id,
    (e->>'product_id')::uuid,
    (e->>'width_mm')::int,
    (e->>'height_mm')::int,
    (e->>'qty')::int,
    (e->>'unit_price')::numeric,
    (e->>'unit_price')::numeric * (e->>'qty')::numeric
  from jsonb_array_elements(p_items) e;

  return query select v_order_id, v_order_no;
end;
$$;

revoke all on function public.create_order_with_items(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.create_order_with_items(uuid, text, text, text, jsonb) to authenticated;
