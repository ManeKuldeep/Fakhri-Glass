-- Migration: add_shop_ownership_to_order_rpcs
-- Adds shop-ownership checks for p_customer_id and line item product_id in
-- create_order_with_items and update_order_with_items to prevent cross-shop injection.
-- Based directly on live pg_proc function definitions.

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
  v_shop_id uuid := auth_shop_id();
  v_order_id uuid;
  v_order_no bigint;
  v_total numeric;
begin
  if v_shop_id is null then
    raise exception 'Not authenticated or missing shop profile';
  end if;

  -- 1. Validate customer belongs to caller's shop
  if not exists (
    select 1 from public.customers
    where customers.id = p_customer_id and customers.shop_id = v_shop_id
  ) then
    raise exception 'Customer not found or belongs to another shop';
  end if;

  -- 2. Validate items array is non-empty
  if jsonb_array_length(p_items) = 0 then
    raise exception 'An order must have at least one item';
  end if;

  -- 3. Validate every item product_id belongs to caller's shop
  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where not exists (
      select 1
      from public.products
      where products.id = (e->>'product_id')::uuid
        and products.shop_id = v_shop_id
    )
  ) then
    raise exception 'One or more products not found or belong to another shop';
  end if;

  select coalesce(sum((e->>'unit_price')::numeric * (e->>'qty')::numeric), 0)
    into v_total
  from jsonb_array_elements(p_items) e;

  insert into public.orders (customer_id, store, payment_method, notes, total, paid)
  values (p_customer_id, p_store, nullif(p_payment_method, ''), nullif(p_notes, ''), v_total, 0)
  returning public.orders.id, public.orders.order_no into v_order_id, v_order_no;

  insert into public.order_items (order_id, product_id, width_mm, height_mm, qty, unit_price, line_total, is_polished)
  select
    v_order_id,
    (e->>'product_id')::uuid,
    (e->>'width_mm')::int,
    (e->>'height_mm')::int,
    (e->>'qty')::int,
    (e->>'unit_price')::numeric,
    (e->>'unit_price')::numeric * (e->>'qty')::numeric,
    coalesce((e->>'is_polished')::boolean, false)
  from jsonb_array_elements(p_items) e;

  return query select v_order_id, v_order_no;
end;
$$;

revoke all on function public.create_order_with_items(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.create_order_with_items(uuid, text, text, text, jsonb) to authenticated;

create or replace function public.update_order_with_items(
  p_order_id uuid,
  p_customer_id uuid,
  p_store text,
  p_payment_method text default null,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb,
  p_paid numeric default null
)
returns table (id uuid, order_no bigint)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_shop_id uuid := auth_shop_id();
  v_order orders%rowtype;
  v_total numeric;
  v_plan_ids uuid[];
  v_consumed_ids uuid[];
  v_offcut_ids uuid[];
begin
  if v_shop_id is null then
    raise exception 'Not authenticated or missing shop profile';
  end if;

  select * into v_order
    from orders
   where orders.id = p_order_id and orders.shop_id = v_shop_id
   for update;

  if not found then
    raise exception 'Order not found';
  end if;

  -- 1. Validate customer belongs to caller's shop
  if not exists (
    select 1 from public.customers
    where customers.id = p_customer_id and customers.shop_id = v_shop_id
  ) then
    raise exception 'Customer not found or belongs to another shop';
  end if;

  -- 2. Validate items array is non-empty
  if jsonb_array_length(p_items) = 0 then
    raise exception 'An order must have at least one item';
  end if;

  -- 3. Validate every item product_id belongs to caller's shop
  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where not exists (
      select 1
      from public.products
      where products.id = (e->>'product_id')::uuid
        and products.shop_id = v_shop_id
    )
  ) then
    raise exception 'One or more products not found or belong to another shop';
  end if;

  -- If order has cut plans, revert them and restore stock
  select array_agg(cut_plans.id) into v_plan_ids
    from cut_plans
   where cut_plans.order_id = p_order_id and cut_plans.shop_id = v_shop_id;

  if v_plan_ids is not null and array_length(v_plan_ids, 1) > 0 then
    select array_agg(distinct cut_pieces.stock_item_id) into v_consumed_ids
      from cut_pieces
     where cut_pieces.plan_id = any(v_plan_ids) and cut_pieces.shop_id = v_shop_id;

    if v_consumed_ids is not null and array_length(v_consumed_ids, 1) > 0 then
      update stock_items
         set status = 'available'
       where stock_items.id = any(v_consumed_ids)
         and stock_items.shop_id = v_shop_id;

      insert into stock_movements (shop_id, stock_item_id, type, ref_type, ref_id)
      select v_shop_id, unnest(v_consumed_ids), 'revert', 'order', p_order_id;
    end if;

    select array_agg(distinct stock_movements.stock_item_id) into v_offcut_ids
      from stock_movements
     where stock_movements.ref_type = 'cut_plan'
       and stock_movements.ref_id = any(v_plan_ids)
       and stock_movements.shop_id = v_shop_id;

    if v_offcut_ids is not null and array_length(v_offcut_ids, 1) > 0 then
      update stock_items
         set status = 'removed'
       where stock_items.id = any(v_offcut_ids)
         and stock_items.shop_id = v_shop_id;

      insert into stock_movements (shop_id, stock_item_id, type, ref_type, ref_id)
      select v_shop_id, unnest(v_offcut_ids), 'revert', 'order', p_order_id;
    end if;

    delete from cut_plans
     where cut_plans.id = any(v_plan_ids)
       and cut_plans.shop_id = v_shop_id;
  end if;

  -- Compute total from line items
  select coalesce(sum((e->>'unit_price')::numeric * (e->>'qty')::numeric), 0)
    into v_total
  from jsonb_array_elements(p_items) e;

  -- Update order record
  update public.orders
     set customer_id = p_customer_id,
         store = p_store,
         payment_method = nullif(p_payment_method, ''),
         notes = nullif(p_notes, ''),
         total = v_total,
         paid = coalesce(p_paid, orders.paid),
         status = 'new'
   where orders.id = p_order_id and orders.shop_id = v_shop_id;

  -- Replace order items
  delete from public.order_items
   where order_items.order_id = p_order_id
     and order_items.shop_id = v_shop_id;

  insert into public.order_items (order_id, product_id, width_mm, height_mm, qty, unit_price, line_total, is_polished)
  select
    p_order_id,
    (e->>'product_id')::uuid,
    (e->>'width_mm')::int,
    (e->>'height_mm')::int,
    (e->>'qty')::int,
    (e->>'unit_price')::numeric,
    (e->>'unit_price')::numeric * (e->>'qty')::numeric,
    coalesce((e->>'is_polished')::boolean, false)
  from jsonb_array_elements(p_items) e;

  perform log_event('Order #' || v_order.order_no || ' updated');

  return query select p_order_id, v_order.order_no;
end;
$$;

revoke all on function public.update_order_with_items(uuid, uuid, text, text, text, jsonb, numeric) from public, anon;
grant execute on function public.update_order_with_items(uuid, uuid, text, text, text, jsonb, numeric) to authenticated;
