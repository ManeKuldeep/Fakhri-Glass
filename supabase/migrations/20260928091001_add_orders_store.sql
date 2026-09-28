-- Add required store to orders: 'mumbai' or 'sanpada' only.
-- Safe to re-run. Assumes the orders table has no rows yet.

alter table public.orders
  add column if not exists store text;

alter table public.orders
  drop constraint if exists orders_store_check;

alter table public.orders
  add constraint orders_store_check
  check (store in ('mumbai', 'sanpada'));

alter table public.orders
  alter column store set not null;