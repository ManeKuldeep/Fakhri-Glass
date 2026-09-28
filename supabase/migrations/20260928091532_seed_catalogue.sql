-- Seed 8 categories and 50 products. Safe to re-run (existing rows are skipped).

do $$
declare
  v_shop uuid;
begin
  select id into v_shop from public.shops order by name limit 1;
  if v_shop is null then
    raise exception 'No shop found. Create the shop before seeding the catalogue.';
  end if;

  insert into public.categories (shop_id, name, sort_order)
  values
    (v_shop, 'Clear Glass',       1),
    (v_shop, 'Extra Clear Glass', 2),
    (v_shop, 'Mirror Glass',      3),
    (v_shop, 'Tinted Glass',      4),
    (v_shop, 'Reflective Glass',  5),
    (v_shop, 'Figure Glass',      6),
    (v_shop, 'Backpainted Glass', 7),
    (v_shop, 'Frosted Glass',     8)
  on conflict (shop_id, name) do nothing;

  insert into public.products (shop_id, category_id, name, thickness_mm, color, is_lining)
  select v_shop, c.id, v.name, v.thickness_mm, v.color, v.is_lining
  from (values
    -- Clear Glass (6)
    ('Clear Glass', '4mm Clear',  4,  'Clear', false),
    ('Clear Glass', '5mm Clear',  5,  'Clear', false),
    ('Clear Glass', '6mm Clear',  6,  'Clear', false),
    ('Clear Glass', '8mm Clear',  8,  'Clear', false),
    ('Clear Glass', '10mm Clear', 10, 'Clear', false),
    ('Clear Glass', '12mm Clear', 12, 'Clear', false),
    -- Extra Clear Glass (6)
    ('Extra Clear Glass', '4mm Extra Clear',  4,  'Extra Clear', false),
    ('Extra Clear Glass', '5mm Extra Clear',  5,  'Extra Clear', false),
    ('Extra Clear Glass', '6mm Extra Clear',  6,  'Extra Clear', false),
    ('Extra Clear Glass', '8mm Extra Clear',  8,  'Extra Clear', false),
    ('Extra Clear Glass', '10mm Extra Clear', 10, 'Extra Clear', false),
    ('Extra Clear Glass', '12mm Extra Clear', 12, 'Extra Clear', false),
    -- Mirror Glass (9)
    ('Mirror Glass', '4mm Clear Mirror',       4, 'Clear',       false),
    ('Mirror Glass', '5mm Clear Mirror',       5, 'Clear',       false),
    ('Mirror Glass', '6mm Clear Mirror',       6, 'Clear',       false),
    ('Mirror Glass', '4mm Extra Clear Mirror', 4, 'Extra Clear', false),
    ('Mirror Glass', '5mm Extra Clear Mirror', 5, 'Extra Clear', false),
    ('Mirror Glass', '6mm Extra Clear Mirror', 6, 'Extra Clear', false),
    ('Mirror Glass', '5mm Grey Mirror',        5, 'Grey',        false),
    ('Mirror Glass', '5mm Brown Mirror',       5, 'Brown',       false),
    ('Mirror Glass', '5mm Rose Gold Mirror',   5, 'Rose Gold',   false),
    -- Tinted Glass (10)
    ('Tinted Glass', '4mm Grey Tinted',   4,  'Grey',  false),
    ('Tinted Glass', '5mm Grey Tinted',   5,  'Grey',  false),
    ('Tinted Glass', '8mm Grey Tinted',   8,  'Grey',  false),
    ('Tinted Glass', '4mm Brown Tinted',  4,  'Brown', false),
    ('Tinted Glass', '5mm Brown Tinted',  5,  'Brown', false),
    ('Tinted Glass', '8mm Brown Tinted',  8,  'Brown', false),
    ('Tinted Glass', '10mm Brown Tinted', 10, 'Brown', false),
    ('Tinted Glass', '10mm Grey Tinted',  10, 'Grey',  false),
    ('Tinted Glass', '12mm Brown Tinted', 12, 'Brown', false),
    ('Tinted Glass', '12mm Grey Tinted',  12, 'Grey',  false),
    -- Reflective Glass (9)
    ('Reflective Glass', '3.5mm Grey Reflective',  3.5, 'Grey',  false),
    ('Reflective Glass', '4mm Grey Reflective',    4,   'Grey',  false),
    ('Reflective Glass', '5mm Grey Reflective',    5,   'Grey',  false),
    ('Reflective Glass', '3.5mm Brown Reflective', 3.5, 'Brown', false),
    ('Reflective Glass', '4mm Brown Reflective',   4,   'Brown', false),
    ('Reflective Glass', '5mm Brown Reflective',   5,   'Brown', false),
    ('Reflective Glass', '3.5mm Clear Reflective', 3.5, 'Clear', false),
    ('Reflective Glass', '4mm Clear Reflective',   4,   'Clear', false),
    ('Reflective Glass', '5mm Clear Reflective',   5,   'Clear', false),
    -- Figure Glass (6, all lining)
    ('Figure Glass', '5mm Clear Moru',            5, 'Clear', true),
    ('Figure Glass', '5mm Clear (Reverse Moru)',  5, 'Clear', true),
    ('Figure Glass', '5mm Clear Flute Lite',      5, 'Clear', true),
    ('Figure Glass', '5mm Grey Moru',             5, 'Grey',  true),
    ('Figure Glass', '5mm Brown Moru',            5, 'Brown', true),
    ('Figure Glass', '8mm Clear Moru',            8, 'Clear', true),
    -- Backpainted Glass (2)
    ('Backpainted Glass', '4mm White B/P', 4, 'White', false),
    ('Backpainted Glass', '6mm White B/P', 6, 'White', false),
    -- Frosted Glass (2)
    ('Frosted Glass', '4mm Frosted', 4, 'Frosted', false),
    ('Frosted Glass', '5mm Frosted', 5, 'Frosted', false)
  ) as v(category, name, thickness_mm, color, is_lining)
  join public.categories c
    on c.shop_id = v_shop and c.name = v.category
  on conflict (shop_id, category_id, name) do nothing;
end $$;