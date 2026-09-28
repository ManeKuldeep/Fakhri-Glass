create function confirm_cut_plan(
  p_order_id uuid,
  p_product_id uuid,
  p_kerf_mm int,
  p_max_wastage_pct numeric,
  p_pieces jsonb,   -- [{order_item_id, stock_item_id, x_mm, y_mm, w_mm, h_mm, rotated}]
  p_offcuts jsonb   -- [{parent_id, width_mm, height_mm}]
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_plan_id uuid;
  v_expected int;
  v_stock_ids uuid[];
  v_locked int;
begin
  if exists (select 1 from cut_plans where order_id = p_order_id and product_id = p_product_id) then
    raise exception 'Cut plan already confirmed for this order and product';
  end if;

  select coalesce(sum(qty), 0) into v_expected
    from order_items where order_id = p_order_id and product_id = p_product_id;
  if v_expected = 0 or jsonb_array_length(p_pieces) <> v_expected then
    raise exception 'Piece count (%) does not match ordered quantity (%)',
      jsonb_array_length(p_pieces), v_expected;
  end if;

  select array_agg(distinct (e->>'stock_item_id')::uuid) into v_stock_ids
    from jsonb_array_elements(p_pieces) e;

  select count(*) into v_locked from (
    select id from stock_items
     where id = any(v_stock_ids) and status = 'available' and product_id = p_product_id
     for update) s;
  if v_locked <> coalesce(array_length(v_stock_ids, 1), 0) then
    raise exception 'One or more sheets are no longer available';
  end if;

  update stock_items set status = 'consumed' where id = any(v_stock_ids);

  insert into stock_movements (stock_item_id, type, ref_type, ref_id)
  select unnest(v_stock_ids), 'consume', 'order', p_order_id;

  insert into cut_plans (order_id, product_id, kerf_mm, max_wastage_pct)
  values (p_order_id, p_product_id, p_kerf_mm, p_max_wastage_pct)
  returning id into v_plan_id;

  insert into cut_pieces (plan_id, order_item_id, stock_item_id, x_mm, y_mm, w_mm, h_mm, rotated)
  select v_plan_id, (e->>'order_item_id')::uuid, (e->>'stock_item_id')::uuid,
         (e->>'x_mm')::int, (e->>'y_mm')::int, (e->>'w_mm')::int, (e->>'h_mm')::int,
         coalesce((e->>'rotated')::boolean, false)
  from jsonb_array_elements(p_pieces) e;

  with new_off as (
    insert into stock_items (product_id, width_mm, height_mm, source, parent_id, vertical_line_height_mm)
    select p_product_id, (o->>'width_mm')::int, (o->>'height_mm')::int, 'offcut',
           (o->>'parent_id')::uuid,
           (select s.vertical_line_height_mm from stock_items s where s.id = (o->>'parent_id')::uuid)
    from jsonb_array_elements(p_offcuts) o
    returning id
  )
  insert into stock_movements (stock_item_id, type, ref_type, ref_id)
  select id, 'offcut_created', 'cut_plan', v_plan_id from new_off;

  update orders set status = case
    when exists (
      select 1 from order_items oi
      where oi.order_id = p_order_id
        and not exists (select 1 from cut_plans cp
                        where cp.order_id = p_order_id and cp.product_id = oi.product_id)
    ) then 'cutting' else 'cut' end
  where id = p_order_id and status in ('new','cutting');

  return v_plan_id;
end $$;