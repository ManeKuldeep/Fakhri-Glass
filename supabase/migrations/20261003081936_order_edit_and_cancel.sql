-- Migration: order_edit_and_cancel
-- 1. Allow 'cancelled' in orders.status check constraint.
-- 2. Add cancel_order RPC (reverts cut plans and stock, marks status = 'cancelled').
-- 3. Add update_order_with_items RPC (reverts old cut plans if any, updates customer & items, sets status = 'new').

-- 1. Update constraint on orders.status
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new', 'cutting', 'cut', 'delivered', 'cancelled'));

-- 2. cancel_order RPC
create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid := auth_shop_id();
  v_order orders%rowtype;
  v_plan_ids uuid[];
  v_consumed_ids uuid[];
  v_offcut_ids uuid[];
begin
  select * into v_order
    from orders
   where id = p_order_id and shop_id = v_shop_id
   for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('success', true, 'message', 'Order is already cancelled');
  end if;

  -- Find and revert cut plans for this order
  select array_agg(id) into v_plan_ids
    from cut_plans
   where order_id = p_order_id and shop_id = v_shop_id;

  if v_plan_ids is not null and array_length(v_plan_ids, 1) > 0 then
    -- Identify consumed sheets
    select array_agg(distinct stock_item_id) into v_consumed_ids
      from cut_pieces
     where plan_id = any(v_plan_ids) and shop_id = v_shop_id;

    if v_consumed_ids is not null and array_length(v_consumed_ids, 1) > 0 then
      update stock_items
         set status = 'available'
       where id = any(v_consumed_ids)
         and shop_id = v_shop_id;

      insert into stock_movements (shop_id, stock_item_id, type, ref_type, ref_id)
      select v_shop_id, unnest(v_consumed_ids), 'revert', 'order', p_order_id;
    end if;

    -- Identify generated offcuts
    select array_agg(distinct stock_item_id) into v_offcut_ids
      from stock_movements
     where ref_type = 'cut_plan'
       and ref_id = any(v_plan_ids)
       and shop_id = v_shop_id;

    if v_offcut_ids is not null and array_length(v_offcut_ids, 1) > 0 then
      update stock_items
         set status = 'removed'
       where id = any(v_offcut_ids)
         and shop_id = v_shop_id;

      insert into stock_movements (shop_id, stock_item_id, type, ref_type, ref_id)
      select v_shop_id, unnest(v_offcut_ids), 'revert', 'order', p_order_id;
    end if;

    -- Delete the cut plans (cascades to cut_pieces)
    delete from cut_plans
     where id = any(v_plan_ids)
       and shop_id = v_shop_id;
  end if;

  -- Set order status to cancelled
  update orders
     set status = 'cancelled'
   where id = p_order_id and shop_id = v_shop_id;

  perform log_event('Order #' || v_order.order_no || ' cancelled');

  return jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;

-- 3. update_order_with_items RPC
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
set search_path = public
as $$
declare
  v_shop_id uuid := auth_shop_id();
  v_order orders%rowtype;
  v_total numeric;
  v_plan_ids uuid[];
  v_consumed_ids uuid[];
  v_offcut_ids uuid[];
begin
  select * into v_order
    from orders
   where orders.id = p_order_id and orders.shop_id = v_shop_id
   for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'An order must have at least one item';
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
   where order_items.order_id = p_order_id;

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
