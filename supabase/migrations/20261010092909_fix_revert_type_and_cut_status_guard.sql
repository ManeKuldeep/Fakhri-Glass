-- Fix BUG-01: allow 'revert' in stock_movements.type (used by cancel_order and update_order_with_items).
-- Fix BUG-05: confirm_batch_cut_plan must not cut, or change the status of,
-- an order that is cancelled, delivered or already fully cut.
-- Safe to re-run. Does not change any existing rows.

alter table public.stock_movements
  drop constraint if exists stock_movements_type_check;

alter table public.stock_movements
  add constraint stock_movements_type_check
  check (type in ('add','consume','offcut_created','adjust','remove','revert'));

create or replace function public.confirm_batch_cut_plan(
  p_order_ids uuid[],
  p_product_id uuid,
  p_kerf_mm integer,
  p_max_wastage_pct numeric,
  p_pieces jsonb,
  p_offcuts jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_shop_id uuid;
  v_order_id uuid;
  v_plan_id uuid;
  v_plan_ids uuid[] := '{}';
  v_stock_ids uuid[];
  v_locked int;
  v_first_plan_id uuid;
  v_active_order_ids uuid[];
begin
  -- 1. Ensure caller is authenticated and resolve shop_id
  v_shop_id := auth_shop_id();
  if v_shop_id is null then
    raise exception 'Not authenticated or missing shop profile';
  end if;

  if p_order_ids is null or array_length(p_order_ids, 1) = 0 then
    raise exception 'No orders specified for cut plan';
  end if;

  if p_pieces is null or jsonb_array_length(p_pieces) = 0 then
    raise exception 'No pieces placed on this sheet to confirm';
  end if;

  -- 2. Verify all orders exist and belong to caller's shop
  if exists (
    select 1 from unnest(p_order_ids) oid
    where not exists (select 1 from orders where id = oid and shop_id = v_shop_id)
  ) then
    raise exception 'One or more orders not found or do not belong to your shop';
  end if;

  -- 3. Verify all pieces belong to one of the specified orders and product
  if exists (
    select 1 from jsonb_array_elements(p_pieces) e
    where not exists (
      select 1 from order_items oi
      where oi.id = (e->>'order_item_id')::uuid
        and oi.order_id = any(p_order_ids)
        and oi.product_id = p_product_id
        and oi.shop_id = v_shop_id
    )
  ) then
    raise exception 'One or more pieces do not belong to the selected orders and product';
  end if;

  -- 3b. NEW: identify the orders that have pieces in this plan, lock them
  -- (ordered, to avoid deadlocks), and refuse if any is not open for cutting.
  select array_agg(distinct oi.order_id) into v_active_order_ids
    from jsonb_array_elements(p_pieces) e
    join order_items oi on oi.id = (e->>'order_item_id')::uuid;

  perform 1
    from orders
   where id = any(v_active_order_ids)
     and shop_id = v_shop_id
   order by id
   for update;

  if exists (
    select 1 from orders
     where id = any(v_active_order_ids)
       and shop_id = v_shop_id
       and status not in ('new', 'cutting')
  ) then
    raise exception 'Cannot cut an order that is cancelled, delivered or already fully cut';
  end if;

  -- 4. Check that for each order item, total pieces cut (previous + new) does not exceed ordered qty
  if exists (
    select 1
    from (
      select (e->>'order_item_id')::uuid as oi_id, count(*) as new_cnt
      from jsonb_array_elements(p_pieces) e
      group by 1
    ) new_p
    join order_items oi on oi.id = new_p.oi_id
    left join (
      select cp.order_item_id as oi_id, count(*) as prev_cnt
      from cut_pieces cp
      where cp.shop_id = v_shop_id
      group by 1
    ) prev_p on prev_p.oi_id = new_p.oi_id
    where coalesce(prev_p.prev_cnt, 0) + new_p.new_cnt > oi.qty
  ) then
    raise exception 'Number of cut pieces exceeds ordered quantity for one or more items';
  end if;

  -- 5. Lock used sheets FOR UPDATE and verify availability & shop ownership
  select array_agg(distinct (e->>'stock_item_id')::uuid) into v_stock_ids
    from jsonb_array_elements(p_pieces) e;

  select count(*) into v_locked from (
    select id from stock_items
     where id = any(v_stock_ids)
       and status = 'available'
       and product_id = p_product_id
       and shop_id = v_shop_id
     for update) s;

  if v_locked <> coalesce(array_length(v_stock_ids, 1), 0) then
    raise exception 'One or more sheets are no longer available';
  end if;

  -- 6. Verify each offcut's parent_id is one of the sheets actually consumed
  if exists (
    select 1 from jsonb_array_elements(p_offcuts) o
    where not ((o->>'parent_id')::uuid = any(v_stock_ids))
  ) then
    raise exception 'Offcut parent sheet is not one of the consumed sheets';
  end if;

  -- 7. Mark used sheets as consumed
  update stock_items
     set status = 'consumed'
   where id = any(v_stock_ids)
     and shop_id = v_shop_id;

  -- 8. (active order ids are now computed in step 3b)

  -- 9. Record consume ledger rows in stock_movements for each active order
  foreach v_order_id in array v_active_order_ids loop
    insert into stock_movements (shop_id, stock_item_id, type, ref_type, ref_id)
    select v_shop_id, unnest(v_stock_ids), 'consume', 'order', v_order_id;
  end loop;

  -- 10. Insert cut plan and cut pieces per active order
  foreach v_order_id in array v_active_order_ids loop
    insert into cut_plans (shop_id, order_id, product_id, kerf_mm, max_wastage_pct)
    values (v_shop_id, v_order_id, p_product_id, p_kerf_mm, p_max_wastage_pct)
    returning id into v_plan_id;

    v_plan_ids := array_append(v_plan_ids, v_plan_id);

    if v_first_plan_id is null then
      v_first_plan_id := v_plan_id;
    end if;

    insert into cut_pieces (shop_id, plan_id, order_item_id, stock_item_id, x_mm, y_mm, w_mm, h_mm, rotated)
    select v_shop_id, v_plan_id, (e->>'order_item_id')::uuid, (e->>'stock_item_id')::uuid,
           (e->>'x_mm')::int, (e->>'y_mm')::int, (e->>'w_mm')::int, (e->>'h_mm')::int,
           coalesce((e->>'rotated')::boolean, false)
      from jsonb_array_elements(p_pieces) e
      join order_items oi on oi.id = (e->>'order_item_id')::uuid
     where oi.order_id = v_order_id;
  end loop;

  -- 11. Insert created offcuts and ledger rows
  if jsonb_array_length(p_offcuts) > 0 and v_first_plan_id is not null then
    with new_off as (
      insert into stock_items (shop_id, product_id, width_mm, height_mm, source, parent_id, vertical_line_height_mm)
      select v_shop_id, p_product_id, (o->>'width_mm')::int, (o->>'height_mm')::int, 'offcut',
             (o->>'parent_id')::uuid,
             (select s.vertical_line_height_mm from stock_items s where s.id = (o->>'parent_id')::uuid)
        from jsonb_array_elements(p_offcuts) o
      returning id
    )
    insert into stock_movements (shop_id, stock_item_id, type, ref_type, ref_id)
    select v_shop_id, id, 'offcut_created', 'cut_plan', v_first_plan_id from new_off;
  end if;

  -- 12. Update order status ('cut' if every item is fully cut, else 'cutting').
  -- NEW: only for orders still open (new/cutting); the guard in 3b makes this a safety net.
  foreach v_order_id in array v_active_order_ids loop
    update orders set status = case
      when exists (
        select 1
        from order_items oi
        left join (
          select cp.order_item_id, count(*) as cut_cnt
          from cut_pieces cp
          where cp.shop_id = v_shop_id
          group by cp.order_item_id
        ) cut on cut.order_item_id = oi.id
        where oi.order_id = v_order_id
          and oi.shop_id = v_shop_id
          and coalesce(cut.cut_cnt, 0) < oi.qty
      ) then 'cutting'
      else 'cut'
    end
    where id = v_order_id and shop_id = v_shop_id
      and status in ('new', 'cutting');
  end loop;

  return v_plan_ids;
end;
$function$;

-- Re-assert the grants (CREATE OR REPLACE keeps them; this is a safe belt-and-braces).
revoke all on function public.confirm_batch_cut_plan(uuid[], uuid, integer, numeric, jsonb, jsonb)
  from public, anon;
grant execute on function public.confirm_batch_cut_plan(uuid[], uuid, integer, numeric, jsonb, jsonb)
  to authenticated;