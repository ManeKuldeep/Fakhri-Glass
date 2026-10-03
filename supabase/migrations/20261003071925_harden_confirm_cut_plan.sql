-- Hardening confirm_cut_plan:
-- 1. SECURITY DEFINER with fixed search_path = public
-- 2. Explicit shop isolation check via auth_shop_id()
-- 3. Verify order exists and belongs to caller's shop
-- 4. Verify all pieces belong to the order and product being confirmed (Requirement 5b)
-- 5. Verify each offcut's parent_id is one of the sheets actually consumed in this call (Requirement 5b)
-- 6. Lock used sheets FOR UPDATE and verify availability & shop ownership
-- 7. Grant execute to authenticated

create or replace function confirm_cut_plan(
  p_order_id uuid,
  p_product_id uuid,
  p_kerf_mm int,
  p_max_wastage_pct numeric,
  p_pieces jsonb,   -- [{order_item_id, stock_item_id, x_mm, y_mm, w_mm, h_mm, rotated}]
  p_offcuts jsonb   -- [{parent_id, width_mm, height_mm}]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_shop_id uuid;
  v_plan_id uuid;
  v_expected int;
  v_stock_ids uuid[];
  v_locked int;
begin
  -- 1. Ensure caller is authenticated and resolve shop_id
  v_shop_id := auth_shop_id();
  if v_shop_id is null then
    raise exception 'Not authenticated or missing shop profile';
  end if;

  -- 2. Verify order exists and belongs to caller's shop
  if not exists (select 1 from orders where id = p_order_id and shop_id = v_shop_id) then
    raise exception 'Order not found or does not belong to your shop';
  end if;

  -- 3. Reject if a plan already exists for this order and product
  if exists (
    select 1 from cut_plans
    where order_id = p_order_id
      and product_id = p_product_id
      and shop_id = v_shop_id
  ) then
    raise exception 'Cut plan already confirmed for this order and product';
  end if;

  -- 4. Verify all pieces belong to the order and product being confirmed (Requirement 5b)
  if exists (
    select 1 from jsonb_array_elements(p_pieces) e
    where not exists (
      select 1 from order_items oi
      where oi.id = (e->>'order_item_id')::uuid
        and oi.order_id = p_order_id
        and oi.product_id = p_product_id
        and oi.shop_id = v_shop_id
    )
  ) then
    raise exception 'One or more pieces do not belong to this order and product';
  end if;

  -- 5. Check piece count equals ordered quantity
  select coalesce(sum(qty), 0) into v_expected
    from order_items
   where order_id = p_order_id
     and product_id = p_product_id
     and shop_id = v_shop_id;

  if v_expected = 0 or jsonb_array_length(p_pieces) <> v_expected then
    raise exception 'Piece count (%) does not match ordered quantity (%)',
      jsonb_array_length(p_pieces), v_expected;
  end if;

  -- 6. Lock used sheets FOR UPDATE and verify availability & shop ownership
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

  -- 7. Verify each offcut's parent_id is one of the sheets actually consumed (Requirement 5b)
  if exists (
    select 1 from jsonb_array_elements(p_offcuts) o
    where not ((o->>'parent_id')::uuid = any(v_stock_ids))
  ) then
    raise exception 'Offcut parent sheet is not one of the consumed sheets';
  end if;

  -- 8. Mark used sheets as consumed
  update stock_items
     set status = 'consumed'
   where id = any(v_stock_ids)
     and shop_id = v_shop_id;

  -- 9. Record consume ledger rows
  insert into stock_movements (shop_id, stock_item_id, type, ref_type, ref_id)
  select v_shop_id, unnest(v_stock_ids), 'consume', 'order', p_order_id;

  -- 10. Insert cut plan
  insert into cut_plans (shop_id, order_id, product_id, kerf_mm, max_wastage_pct)
  values (v_shop_id, p_order_id, p_product_id, p_kerf_mm, p_max_wastage_pct)
  returning id into v_plan_id;

  -- 11. Insert cut pieces
  insert into cut_pieces (shop_id, plan_id, order_item_id, stock_item_id, x_mm, y_mm, w_mm, h_mm, rotated)
  select v_shop_id, v_plan_id, (e->>'order_item_id')::uuid, (e->>'stock_item_id')::uuid,
         (e->>'x_mm')::int, (e->>'y_mm')::int, (e->>'w_mm')::int, (e->>'h_mm')::int,
         coalesce((e->>'rotated')::boolean, false)
    from jsonb_array_elements(p_pieces) e;

  -- 12. Insert created offcuts and ledger rows (copying vertical_line_height_mm from parent)
  with new_off as (
    insert into stock_items (shop_id, product_id, width_mm, height_mm, source, parent_id, vertical_line_height_mm)
    select v_shop_id, p_product_id, (o->>'width_mm')::int, (o->>'height_mm')::int, 'offcut',
           (o->>'parent_id')::uuid,
           (select s.vertical_line_height_mm from stock_items s where s.id = (o->>'parent_id')::uuid)
      from jsonb_array_elements(p_offcuts) o
    returning id
  )
  insert into stock_movements (shop_id, stock_item_id, type, ref_type, ref_id)
  select v_shop_id, id, 'offcut_created', 'cut_plan', v_plan_id from new_off;

  -- 13. Update order status: 'cut' if all products for this order have cut plans, else 'cutting'
  update orders set status = case
    when exists (
      select 1 from order_items oi
      where oi.order_id = p_order_id
        and oi.shop_id = v_shop_id
        and not exists (
          select 1 from cut_plans cp
          where cp.order_id = p_order_id
            and cp.product_id = oi.product_id
            and cp.shop_id = v_shop_id
        )
    ) then 'cutting' else 'cut' end
  where id = p_order_id and status in ('new','cutting') and shop_id = v_shop_id;

  return v_plan_id;
end $$;

-- Explicitly ensure permissions
revoke all on function public.confirm_cut_plan(uuid, uuid, integer, numeric, jsonb, jsonb)
  from public, anon;
grant execute on function public.confirm_cut_plan(uuid, uuid, integer, numeric, jsonb, jsonb)
  to authenticated;
