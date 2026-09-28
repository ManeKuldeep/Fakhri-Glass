# ARCHITECTURE.md: decisions and current database state

Decisions below are made. Do not re-debate them.

## 1. Tech stack

- Expo (React Native) with a development build, TypeScript strict, Expo Router. Android only.
- TanStack Query (server state), Zustand (UI/session state).
- supabase-js with AsyncStorage session, `react-native-url-polyfill`.
- Skia + Gesture Handler + Reanimated for the optimiser canvas.
- Jest + fast-check for tests.
- Supabase (free tier) is the database. Online-first: the app talks to Supabase
  directly. No local SQLite, no offline queue, no separate backend server.
- Supabase CLI installed per project (`npm i -D supabase`), always run with `npx supabase`.
- Dimensions: integer millimetres everywhere. ft/in conversion only in the UI.

## 2. Suggested folder layout

```
app/                    Expo Router screens (tabs: index, inventory, orders, cut, settings)
src/constants/stores.ts single source of truth for stores ('mumbai' | 'sanpada')
src/lib/supabase.ts     supabase client (anon key from EXPO_PUBLIC_* env vars)
src/types/database.ts   generated types (npx supabase gen types typescript --linked)
src/features/<name>/    queries, mutations, components per feature
src/optimizer/          pure TypeScript, NO React imports, fully unit tested
supabase/migrations/    the only way the schema changes
```

## 3. Migration history (all applied to the remote database)

| Migration | Purpose |
|---|---|
| 20260928065723, ...065805, ...075158 | Initial schema: 12 tables, `low_stock` view, functions, triggers, RLS |
| 20260928090121_fix_profiles_assignment | Replaced old value `turbhe` with `mumbai` in the assignment check |
| add_orders_store | Added required `orders.store` with check ('mumbai','sanpada') |
| fix_grants | Reset table and function privileges (see section 6) |
| seed_catalogue | Seeded 8 categories and 50 products |

Data set by hand (not in a migration): one shop, "Fakhri Glass", and 3 profiles
(Murtuza mumbai, Qutub sanpada, Hussain cutter). Auth users were created in the dashboard.

## 4. Data model

Every business table has `shop_id uuid not null default auth_shop_id()`.

| Table | Key columns (known) |
|---|---|
| shops | id, name |
| profiles | id (= auth user id), shop_id, full_name, assignment |
| categories | id, shop_id, name, sort_order. UNIQUE (shop_id, name) |
| products | id, shop_id, category_id, name, thickness_mm, color, is_lining, min_stock_sheets, rate_per_sqft (nullable), active. UNIQUE (shop_id, category_id, name) |
| stock_items | id, shop_id, product_id, width_mm, height_mm, source ('full'/'offcut'), status ('available'/'consumed'/'removed'), parent_id, vertical_line_height_mm |
| stock_movements | append-only ledger: stock_item_id, type, ref_type, ref_id |
| customers | id, shop_id, name (plus contact fields) |
| orders | id, order_no (identity, always generated), shop_id, customer_id, store, status, payment_method, total, paid, notes, created_at, created_by |
| order_items | id, order_id, product_id, width_mm, height_mm, qty (plus price fields) |
| cut_plans | id, order_id, product_id, kerf_mm, max_wastage_pct. UNIQUE (order_id, product_id) |
| cut_pieces | plan_id, order_item_id, stock_item_id, x_mm, y_mm, w_mm, h_mm, rotated |
| activity_log | shop_id, user_id, user_name, user_assignment, action, table_name, record_id, summary, old_data, new_data, created_at |
| low_stock (view) | product_id, name, min_stock_sheets, sheets. security_invoker = true |

Columns marked "plus" or not fully listed were not inspected. Use the generated types
file as the source of truth.

Constraints in place: assignment in (mumbai, sanpada, cutter); store in (mumbai, sanpada);
order status in (new, cutting, cut, delivered); stock status and source as above;
width and height > 0; line height null or > 0.

## 5. Row level security

- RLS is enabled on all 12 tables.
- Data tables: one policy `shop_isolation`, FOR ALL, to `authenticated`,
  `USING` and `WITH CHECK` `shop_id = auth_shop_id()`.
- Read-only for the app: `activity_log` (`log_read`), `profiles` (`profile_read`), `shops` (`shop_read`).
- `auth_shop_id()`: SQL, STABLE, SECURITY DEFINER, `search_path = public`;
  returns the caller's `shop_id` from `profiles` via `auth.uid()`.
- Policies alone are not enough: Postgres checks grants first (section 6).

## 6. Grants (role `authenticated`; `anon` has nothing)

| Tables | Privileges |
|---|---|
| categories, products, stock_items, customers, orders | SELECT, INSERT, UPDATE |
| order_items | SELECT, INSERT, UPDATE, DELETE |
| cut_plans, cut_pieces, stock_movements | SELECT, INSERT |
| activity_log, profiles, shops, low_stock | SELECT |

No TRUNCATE, REFERENCES or TRIGGER for any app role. EXECUTE is granted to
`authenticated` only on `auth_shop_id()`, `log_event(text)` and `confirm_cut_plan(...)`.
New tables and functions get NO access until a migration grants it explicitly.

## 7. Functions and triggers

- `log_activity()`: SECURITY DEFINER trigger function. AFTER INSERT/UPDATE/DELETE on
  categories, products, stock_items, customers, orders, order_items, cut_plans. Fills user name and
  assignment from `profiles`, and writes a readable `summary`.
- `check_lining_stock()`: BEFORE INSERT/UPDATE on stock_items. A full sheet of a lining
  product must have `vertical_line_height_mm`, else it raises an exception.
- `log_event(p_summary text)`: SECURITY DEFINER RPC. Writes an 'event' row for login,
  logout, label printing, backup export.
- `confirm_cut_plan(p_order_id uuid, p_product_id uuid, p_kerf_mm integer,
  p_max_wastage_pct numeric, p_pieces jsonb, p_offcuts jsonb) returns uuid`
  (runs as the caller, `search_path = public`), in one transaction:
  1. rejects if a plan already exists for this order and product;
  2. checks the piece count equals the ordered quantity;
  3. locks the used sheets (`FOR UPDATE`) and requires them to be available and of this product;
  4. marks them `consumed` and writes 'consume' ledger rows;
  5. inserts the cut plan and pieces;
  6. inserts offcuts (copying `vertical_line_height_mm` from the parent) and 'offcut_created' ledger rows;
  7. sets order status to `cutting` (some products still uncut) or `cut` (all done).

  `p_pieces` items: `order_item_id, stock_item_id, x_mm, y_mm, w_mm, h_mm, rotated`.
  `p_offcuts` items: `width_mm, height_mm, parent_id`.
  The client applies the minimum-usable-offcut rule BEFORE sending offcuts.

## 8. Optimiser design (src/optimizer)

- Pure functions. Input: sheets (id, w, h, source, lining line height), pieces
  (id, w, h, lining flag), settings (kerf, min offcut, max wastage %).
  Output: placements per sheet, offcuts, waste %, warnings.
- Guillotine packing, offcuts first (smallest sufficient first), then a new full sheet.
- Lining: no rotation, vertical cuts only.
- Invariants tested with fast-check: no overlaps, all pieces inside their sheet,
  area conserved, no rotation when disallowed, kerf respected.
- The UI only renders and edits the plan; it re-runs the collision check live.

## 9. Hardening backlog (known gaps, not blocking early phases)

Handle these in the phase named. Each is a new migration, verified with a diagnostic query.

| Gap | Fix | When |
|---|---|---|
| `confirm_cut_plan` runs as the caller, so users hold UPDATE on stock_items and orders, and the client could change stock directly | Make it SECURITY DEFINER with a fixed search_path and explicit shop checks; restrict direct stock status/order status updates | Phase 6 |
| `confirm_cut_plan` does not verify each offcut's `parent_id` is a consumed sheet, nor that pieces belong to the order's items | Add validation inside the function | Phase 6 |
| `profiles.assignment` and `full_name` are nullable | Set NOT NULL | Before phase 1 login work is finished |
| No constraint tying `source = 'offcut'` to a non-null `parent_id` | Add a check | Phase 2 |
| Payment method list was chosen by the original schema, not the business | Confirm with the user | Phase 3 |

## 10. Working agreements

- Never run destructive SQL (drop, truncate, delete, reset) without the user's explicit OK.
- Before assuming database state, ask for or run a read-only diagnostic query.
- Explain errors in plain language and give the exact fix.