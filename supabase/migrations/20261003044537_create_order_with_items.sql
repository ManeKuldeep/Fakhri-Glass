-- Atomic order creation: inserts the order and all its items in one transaction.
-- If any item fails validation, nothing is saved — no orphaned orders.
-- Safe to re-run (replaces the function definition; doesn't touch data).

create or replace function public.create_order_with_items(
  p_customer_id uuid,
  p_store text,
  p_payment_method text,
  p_notes text,
  p_items jsonb
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
  values (p_customer_id, p_store, p_payment_method, p_notes, v_total, 0)
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