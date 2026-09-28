-- 1. Assignment label on profiles
alter table profiles
  add column if not exists assignment text
  check (assignment in ('turbhe', 'sanpada', 'cutter'));

-- 2. Activity log table
create table activity_log (
  id bigint generated always as identity primary key,
  shop_id uuid not null references shops,
  user_id uuid references auth.users on delete set null,
  user_name text not null,
  user_assignment text,
  action text not null check (action in ('insert','update','delete','event')),
  table_name text not null,
  record_id uuid,
  summary text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index on activity_log (shop_id, created_at desc);
create index on activity_log (shop_id, user_id, created_at desc);
create index on activity_log (table_name, record_id);

alter table activity_log enable row level security;
create policy log_read on activity_log for select to authenticated
  using (shop_id = auth_shop_id());
revoke insert, update, delete on activity_log from anon, authenticated;

-- 3. Trigger function
create function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_product text;
  v_summary text;
begin
  select name into v_product from products where id = nullif(r->>'product_id','')::uuid;

  v_summary := case tg_table_name
    when 'orders' then 'Order #' || coalesce(r->>'order_no','') || ' · ' || coalesce(r->>'store','') || ' · ' || coalesce(r->>'status','')
    when 'order_items' then coalesce(v_product,'Item') || ' ' || (r->>'width_mm') || '×' || (r->>'height_mm') || ' mm, qty ' || (r->>'qty')
    when 'stock_items' then coalesce(v_product,'Stock') || ' ' || (r->>'width_mm') || '×' || (r->>'height_mm') || ' mm (' || (r->>'source') || ', ' || (r->>'status') || ')'
    when 'cut_plans' then 'Cut plan · ' || coalesce(v_product,'')
    when 'customers' then coalesce(r->>'name','')
    else coalesce(r->>'name', tg_table_name)
  end;

  insert into activity_log (shop_id, user_id, user_name, user_assignment, action,
                            table_name, record_id, summary, old_data, new_data)
  values (
    coalesce((r->>'shop_id')::uuid, auth_shop_id()),
    auth.uid(),
    coalesce((select full_name from profiles where id = auth.uid()), 'System'),
    (select assignment from profiles where id = auth.uid()),
    lower(tg_op), tg_table_name, (r->>'id')::uuid, v_summary,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

-- 4. Attach triggers
do $$
declare t text;
begin
  foreach t in array array['categories','products','stock_items','customers',
                           'orders','order_items','cut_plans'] loop
    execute format('drop trigger if exists trg_log_%1$s on %1$I', t);
    execute format(
      'create trigger trg_log_%1$s after insert or update or delete on %1$I
       for each row execute function log_activity()', t);
  end loop;
end $$;

-- 5. Manual event logging from the app
create function log_event(p_summary text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into activity_log (shop_id, user_id, user_name, user_assignment, action,
                            table_name, summary)
  values (auth_shop_id(), auth.uid(),
          coalesce((select full_name from profiles where id = auth.uid()), 'Unknown'),
          (select assignment from profiles where id = auth.uid()),
          'event', 'app', left(p_summary, 200));
end $$;
revoke execute on function log_event(text) from public, anon;
grant execute on function log_event(text) to authenticated;