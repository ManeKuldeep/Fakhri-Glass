-- Reset table privileges: anon gets nothing, authenticated gets only what it needs.
-- Safe to re-run.

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select, insert, update
  on public.categories, public.products, public.stock_items,
     public.customers, public.orders
  to authenticated;

grant select, insert, update, delete
  on public.order_items
  to authenticated;

grant select, insert
  on public.cut_plans, public.cut_pieces, public.stock_movements
  to authenticated;

grant select
  on public.activity_log, public.profiles, public.shops, public.low_stock
  to authenticated;

-- Functions the app calls: logged-in users only
revoke all on function public.auth_shop_id() from public, anon;
grant execute on function public.auth_shop_id() to authenticated;

revoke all on function public.log_event(text) from public, anon;
grant execute on function public.log_event(text) to authenticated;

revoke all on function public.confirm_cut_plan(uuid, uuid, integer, numeric, jsonb, jsonb)
  from public, anon;
grant execute on function public.confirm_cut_plan(uuid, uuid, integer, numeric, jsonb, jsonb)
  to authenticated;