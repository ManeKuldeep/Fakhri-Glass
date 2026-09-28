create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  shop_id uuid not null references shops,
  full_name text
);

create function auth_shop_id() returns uuid
language sql stable security definer set search_path = public as
$$ select shop_id from profiles where id = auth.uid() $$;

create table categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default auth_shop_id() references shops,
  name text not null,
  sort_order int not null default 0,
  unique (shop_id, name)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default auth_shop_id() references shops,
  category_id uuid not null references categories,
  name text not null,
  thickness_mm numeric(4,1) not null,
  color text,
  is_lining boolean not null default false,
  min_stock_sheets int not null default 0,
  rate_per_sqft numeric(10,2),
  active boolean not null default true,
  unique (shop_id, category_id, name)
);

create table stock_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default auth_shop_id() references shops,
  product_id uuid not null references products,
  width_mm int not null check (width_mm > 0),
  height_mm int not null check (height_mm > 0),
  source text not null check (source in ('full','offcut')),
  parent_id uuid references stock_items,
  vertical_line_height_mm int check (vertical_line_height_mm is null or vertical_line_height_mm > 0),
  status text not null default 'available' check (status in ('available','consumed','removed')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on stock_items (shop_id, product_id, status);

create function check_lining_stock() returns trigger language plpgsql as $$
begin
  if new.source = 'full'
     and exists (select 1 from products p where p.id = new.product_id and p.is_lining)
     and new.vertical_line_height_mm is null then
    raise exception 'vertical_line_height_mm is required for lining glass';
  end if;
  return new;
end $$;
create trigger trg_lining_stock before insert or update on stock_items
for each row execute function check_lining_stock();

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default auth_shop_id() references shops,
  stock_item_id uuid not null references stock_items on delete cascade,
  type text not null check (type in ('add','consume','offcut_created','adjust','remove')),
  ref_type text,
  ref_id uuid,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on stock_movements (stock_item_id);

create table customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default auth_shop_id() references shops,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);
create index on customers (shop_id, phone);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated always as identity,
  shop_id uuid not null default auth_shop_id() references shops,
  customer_id uuid not null references customers,
  status text not null default 'new' check (status in ('new','cutting','cut','delivered')),
  payment_method text check (payment_method in ('cash','upi','card','bank_transfer','credit','other')),
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on orders (shop_id, created_at);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default auth_shop_id() references shops,
  order_id uuid not null references orders on delete cascade,
  product_id uuid not null references products,
  width_mm int not null check (width_mm > 0),
  height_mm int not null check (height_mm > 0),
  qty int not null check (qty > 0),
  unit_price numeric(10,2) not null default 0,
  line_total numeric(12,2) not null default 0
);
create index on order_items (order_id);

create table cut_plans (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default auth_shop_id() references shops,
  order_id uuid not null references orders on delete cascade,
  product_id uuid not null references products,
  kerf_mm int not null default 0,
  max_wastage_pct numeric(5,2),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (order_id, product_id)
);

create table cut_pieces (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null default auth_shop_id() references shops,
  plan_id uuid not null references cut_plans on delete cascade,
  order_item_id uuid not null references order_items on delete cascade,
  stock_item_id uuid not null references stock_items,
  x_mm int not null, y_mm int not null,
  w_mm int not null, h_mm int not null,
  rotated boolean not null default false
);
create index on cut_pieces (plan_id);

-- Row level security: everyone in a shop sees and edits that shop's data
do $$
declare t text;
begin
  foreach t in array array['categories','products','stock_items','stock_movements',
    'customers','orders','order_items','cut_plans','cut_pieces'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy shop_isolation on %I for all to authenticated
      using (shop_id = auth_shop_id()) with check (shop_id = auth_shop_id())$p$, t);
  end loop;
end $$;

alter table shops enable row level security;
create policy shop_read on shops for select to authenticated using (id = auth_shop_id());
alter table profiles enable row level security;
create policy profile_read on profiles for select to authenticated using (shop_id = auth_shop_id());

create view low_stock with (security_invoker = true) as
select p.id as product_id, p.name, p.min_stock_sheets,
       count(s.id) filter (where s.status = 'available' and s.source = 'full') as sheets
from products p
left join stock_items s on s.product_id = p.id
where p.active and p.min_stock_sheets > 0
group by p.id
having count(s.id) filter (where s.status = 'available' and s.source = 'full') < p.min_stock_sheets;