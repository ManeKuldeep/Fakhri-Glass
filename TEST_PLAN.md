# TEST_PLAN.md — Fakhri Glass QA (v2.1)

## 1. Inventory of What Is Implemented

### 1.1 Build Phases vs. Reality

| Phase | SPEC.md Description | Status |
|-------|-------------------|--------|
| 1 | Auth, app shell, tabs, `log_event` | ✅ Built |
| 2 | Inventory: list, filters, add stock, lining validation, edit/remove | ✅ Built |
| 3 | Orders: customer, items loop, store dropdown, pricing, payment, list/detail | ✅ Built |
| 4 | Optimiser core: pure TypeScript | ✅ Built |
| 5 | Optimiser UI: Skia canvas, drag, snap, new sheet, kerf, wastage | ✅ Built |
| 6 | Confirm flow: `confirm_cut_plan`, cutter queue, database hardening | ✅ Built |
| 7 | Low-stock banner, backup export, activity log screen | ✅ Built |
| 8 | Piece labels (PDF) | ✅ Built |

**Additional features implemented beyond original phase descriptions:**
- Order editing (`update_order_with_items` RPC)
- Order cancellation (`cancel_order` RPC)
- `cancelled` order status
- Mark order delivered (`useMarkOrderDelivered`)
- Invoice generation (HTML → PDF, print/share via `invoiceServices.ts`)
- `is_polished` column on order items (+3mm allowance)
- Batch cutting (`confirm_batch_cut_plan` RPC) — multiple orders on one sheet
- Partial cutting — multiple cut sessions per order/product (unique constraint dropped)
- Cut settings modal (kerf, min offcut, max wastage %)
- Multi-strategy optimizer tournament (6 sorters × 7 strategies)

### 1.2 Screens

| Screen | File | Purpose |
|--------|------|---------|
| Login | `app/login.tsx` | Email/password sign-in |
| Home / Dashboard | `app/(tabs)/index.tsx` | Welcome, low stock banner, quick actions |
| Inventory | `app/(tabs)/inventory.tsx` | Stock list, filters, add/edit modals |
| Orders | `app/(tabs)/orders.tsx` | Order list, search, filters, create/detail/edit modals |
| Cut | `app/(tabs)/cut.tsx` | Cutting queue → interactive workspace |
| Settings | `app/(tabs)/settings.tsx` | Profile, activity log link, backup export, logout |
| Activity Log | `app/activity-log.tsx` | Read-only audit history with filters and pagination |

### 1.3 Feature Modules (`src/features/`)

| Module | Files | Purpose |
|--------|-------|---------|
| `inventory/` | queries, mutations, utils, components | Stock CRUD, mm↔ft-in conversion |
| `orders/` | queries, mutations, constants, invoiceUtils, invoiceServices, components | Order CRUD, customer search, invoice PDF |
| `cutting/` | queries, mutations, utils, types, stores, components | Cutting queue, workspace, confirm plan |
| `dashboard/` | queries, components | Low stock banner data |
| `labels/` | utils, types, services | Piece label generation & printing |
| `settings/` | queries, utils/, components | Activity log, backup export |

### 1.4 Database Functions and Triggers

| Function | Type | Security | Defined in Migration |
|----------|------|----------|----------------------|
| `auth_shop_id()` | SQL helper | SECURITY DEFINER | `20260928065723_init_schema.sql` |
| `check_lining_stock()` | Trigger fn (BEFORE INSERT/UPDATE on stock_items) | — | `20260928065723_init_schema.sql` |
| `log_activity()` | Trigger fn (AFTER INSERT/UPDATE/DELETE on 7 tables) | SECURITY DEFINER | `20260928065723_init_schema.sql`, `20260928075158_user_assignment.sql` |
| `log_event(text)` | RPC | SECURITY DEFINER | `20260928075158_user_assignment.sql` |
| `create_order_with_items(...)` | RPC | SECURITY INVOKER (Intentional: RLS & caller grants apply) | `20261003044537`, `20261003050344`, `20261003080625` |
| `update_order_with_items(...)` | RPC | SECURITY DEFINER | `20261003081936_order_edit_and_cancel.sql` |
| `cancel_order(uuid)` | RPC | SECURITY DEFINER | `20261003081936_order_edit_and_cancel.sql` |
| `confirm_batch_cut_plan(...)` | RPC | SECURITY DEFINER | `20261009111747`, `20261010042441` |
| `confirm_cut_plan(...)` | RPC wrapper (delegates to batch) | SECURITY DEFINER | `20261009111747`, `20261010042441` |

### 1.5 RLS Policies (From Migrations)

| Table | Policy Name | Command | Roles | USING / WITH CHECK Expression | Migration |
|-------|-------------|---------|-------|-------------------------------|-----------|
| `categories` | `shop_isolation` | ALL | authenticated | `shop_id = auth_shop_id()` | `20260928065723` |
| `products` | `shop_isolation` | ALL | authenticated | `shop_id = auth_shop_id()` | `20260928065723` |
| `stock_items` | `shop_isolation` | ALL | authenticated | `shop_id = auth_shop_id()` | `20260928065723` |
| `stock_movements` | `shop_isolation` | ALL | authenticated | `shop_id = auth_shop_id()` | `20260928065723` |
| `customers` | `shop_isolation` | ALL | authenticated | `shop_id = auth_shop_id()` | `20260928065723` |
| `orders` | `shop_isolation` | ALL | authenticated | `shop_id = auth_shop_id()` | `20260928065723` |
| `order_items` | `shop_isolation` | ALL | authenticated | `shop_id = auth_shop_id()` | `20260928065723` |
| `cut_plans` | `shop_isolation` | ALL | authenticated | `shop_id = auth_shop_id()` | `20260928065723` |
| `cut_pieces` | `shop_isolation` | ALL | authenticated | `shop_id = auth_shop_id()` | `20260928065723` |
| `shops` | `shop_read` | SELECT | authenticated | `id = auth_shop_id()` | `20260928065723` |
| `profiles` | `profile_read` | SELECT | authenticated | `shop_id = auth_shop_id()` | `20260928065723` |
| `activity_log` | `log_read` | SELECT | authenticated | `shop_id = auth_shop_id()` | `20260928075158` |

### 1.6 Grants (From Migrations)

**Privileges granted to `authenticated`:**
- `categories`, `products`, `stock_items`, `customers`, `orders`: `SELECT, INSERT, UPDATE` (`20260928091309_fix_grants.sql`)
- `order_items`: `SELECT, INSERT, UPDATE, DELETE` (`20260928091309_fix_grants.sql`)
- `cut_plans`, `cut_pieces`, `stock_movements`: `SELECT, INSERT` (`20260928091309_fix_grants.sql`)
- `activity_log`, `profiles`, `shops`, `low_stock`: `SELECT` (`20260928091309_fix_grants.sql`)
- Execution granted on RPCs: `auth_shop_id`, `log_event`, `create_order_with_items`, `update_order_with_items`, `cancel_order`, `confirm_cut_plan`, `confirm_batch_cut_plan`.

**Privileges for `anon`:**
- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;` (`20260928091309_fix_grants.sql`)
- `REVOKE ALL ON FUNCTION ... FROM anon;` for all RPCs.

---

## 2. Use Cases

### 2.1 Auth (13 use cases: 3 UNIT, 2 DB, 8 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| AUTH-01 | Login success | Valid account exists | Enter email + password, tap Sign In | Auth state change fires, profile fetched, redirect to landing tab, `log_event('Login')` called | MANUAL |
| AUTH-02 | Login with wrong password | Valid account exists | Enter email + wrong password, tap Sign In | Error message: "Invalid email or password. Please try again." | MANUAL |
| AUTH-03 | Login with empty fields | — | Tap Sign In with empty email or password | Error message: "Please enter both email and password." Client-side, no network call | UNIT |
| AUTH-04 | Login rate limiting | — | Enter wrong password 10+ times rapidly | Error message: "Too many attempts. Please wait a minute and try again." | MANUAL |
| AUTH-05 | Session restore after app kill | User was logged in, app killed | Relaunch app | onAuthStateChange fires INITIAL_SESSION, profile loaded, redirect to correct landing tab | MANUAL |
| AUTH-06 | Landing tab by assignment (mumbai) | Profile assignment = 'mumbai' | Login or session restore | Redirect to `/(tabs)/orders` | MANUAL |
| AUTH-07 | Landing tab by assignment (cutter) | Profile assignment = 'cutter' | Login or session restore | Redirect to `/(tabs)/cut` | MANUAL |
| AUTH-08 | Logout | User is logged in | Settings → Log Out → confirm | `log_event('Logout')` called, `signOut()`, redirect to /login | MANUAL |
| AUTH-09 | Logout confirmation dialog | User is logged in | Settings → Log Out | Alert with "Cancel" and "Log out" buttons; Cancel does nothing | MANUAL |
| AUTH-10 | No sign-up screen exists | — | Inspect all routes | No sign-up route or registration form exists anywhere in code | UNIT |
| AUTH-11 | `friendlyError` maps known messages | — | Call `friendlyError` with known Supabase error strings | Returns user-friendly text, not raw JSON | UNIT |
| AUTH-12 | log_event for login writes activity_log row | User is authenticated | Call `logEvent('Login')` | activity_log row with action='event', table_name='app', summary='Login', correct user_name and user_assignment | DB |
| AUTH-13 | log_event for logout writes activity_log row | User is authenticated | Call `logEvent('Logout')` | Same as above with summary='Logout' | DB |

### 2.2 Inventory (29 use cases: 13 UNIT, 11 DB, 5 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| INV-01 | Add stock inserts N rows for qty N | Product exists | Call `useAddStock` with qty=3, widthMm=1000, heightMm=2000 | 3 separate rows in stock_items, each with source='full', status='available' | DB |
| INV-02 | Add lining stock requires vertical_line_height_mm | Product with is_lining=true exists | Insert stock_item with source='full', no vertical_line_height_mm | DB rejects: "vertical_line_height_mm is required for lining glass" | DB |
| INV-03 | Add lining stock with vertical_line_height_mm succeeds | Product with is_lining=true exists | Insert stock_item with source='full', vertical_line_height_mm=500 | Succeeds, value stored | DB |
| INV-04 | Non-lining stock allows null vertical_line_height_mm | Product with is_lining=false exists | Insert stock_item with source='full', no vertical_line_height_mm | Succeeds | DB |
| INV-05 | Edit stock updates dimensions | Stock item exists | Call `useUpdateStock` with new width/height | stock_items row updated | DB |
| INV-06 | Soft remove stock sets status='removed' | Stock item exists with status='available' | Call `useRemoveStock` with id | status changed to 'removed', never deleted | DB |
| INV-07 | Hard DELETE denied on stock_items | Stock item exists | Attempt `DELETE FROM stock_items` as authenticated | Permission denied (no DELETE grant) | DB |
| INV-08 | Filter by category | Stock exists across categories | Set categoryId filter | Only items with matching category shown | MANUAL |
| INV-09 | Filter by product | Stock exists across products | Set productId filter | Only items with matching product shown | MANUAL |
| INV-10 | Filter by source (full/offcut) | Both full and offcut items exist | Set source filter | Only items with matching source shown | MANUAL |
| INV-11 | Default status filter is 'available' | Available and removed items exist | Load inventory list (no status filter) | Only available items shown | MANUAL |
| INV-12 | mm to ft/in conversion round-trip | — | Convert 1219 mm → ft/in → mm | Result is within ±1mm of original | UNIT |
| INV-13 | parseDimensionInput pure mm | — | parseDimensionInput("1200") | Returns 1200 | UNIT |
| INV-14 | parseDimensionInput ft/in | — | parseDimensionInput("4'6\"") | Returns ftInToMm(4, 6) = 1372 | UNIT |
| INV-15 | parseDimensionInput feet only | — | parseDimensionInput("4'") | Returns ftInToMm(4, 0) = 1219 | UNIT |
| INV-16 | parseDimensionInput inches only | — | parseDimensionInput("48\"") | Returns ftInToMm(0, 48) = 1219 | UNIT |
| INV-17 | parseDimensionInput with fraction | — | parseDimensionInput("4' 6 3/16\"") | Returns ftInToMm(4, 6.1875) | UNIT |
| INV-18 | parseDimensionInput empty/invalid | — | parseDimensionInput("") / parseDimensionInput("abc") | Returns null | UNIT |
| INV-19 | parseDimensionInput mm with fraction | — | parseDimensionInput("100 1/2") | Returns 101 (Math.round(100.5)) | UNIT |
| INV-20 | formatFtIn known values | — | formatFtIn(1219) | Returns "4'" (4 feet exactly) | UNIT |
| INV-21 | formatMm known values | — | formatMm(0), formatMm(100) | "0 mm", "100 mm" | UNIT |
| INV-22 | Width/height must be > 0 | — | Insert stock_item with width_mm=0 | DB rejects (check constraint) | DB |
| INV-23 | vertical_line_height_mm must be > 0 or null | — | Insert with vertical_line_height_mm=-1 | DB rejects (check constraint) | DB |
| INV-24 | calculateAreaSqFt correctness | — | calculateAreaSqFt(1000, 1000) | ~10.76 sq ft | UNIT |
| INV-25 | calculateAreaSqM correctness | — | calculateAreaSqM(1000, 1000) | 1.00 sq m | UNIT |
| INV-26 | friendlyStockError translates lining error | — | friendlyStockError("check_lining_stock...") | "Figured glass (lining) requires a vertical line height…" | UNIT |
| INV-27 | Unit toggle mm↔in | User on inventory screen | Tap unit toggle button | Display switches between mm and ft-in | MANUAL |
| INV-28 | Activity log on stock insert | — | Insert a stock_item | activity_log row created with action='insert', table_name='stock_items' | DB |
| INV-29 | Activity log on stock update | — | Update a stock_item | activity_log row created with action='update' | DB |

### 2.3 Orders (31 use cases: 3 UNIT, 22 DB, 6 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| ORD-01 | Store is required | — | Call `create_order_with_items` with p_store=NULL | DB rejects (NOT NULL) | DB |
| ORD-02 | Store must be 'mumbai' or 'sanpada' | — | Call `create_order_with_items` with p_store='cutter' | DB rejects (check constraint) | DB |
| ORD-03 | Store dropdown has exactly two values | — | Check STORES constant | Contains 'mumbai' and 'sanpada' only, no 'cutter' | UNIT |
| ORD-04 | Create order with items atomically (RPC) | Customer, products exist | Call `create_order_with_items` with 2 items | Order and both items inserted in one transaction | DB |
| ORD-05 | Create order with zero items rejected | — | Call `create_order_with_items` with p_items='[]' | Exception: "An order must have at least one item" | DB |
| ORD-06 | Total = sum(unit_price × qty) | — | Create order with items: [(qty=2, price=100), (qty=3, price=200)] | order.total = 800 | DB |
| ORD-07 | Payment method validation | — | Insert order with payment_method='invalid' | DB rejects (check constraint) | DB |
| ORD-08 | All valid payment methods accepted | — | Try each of: cash, upi, card, bank_transfer, credit, other | All succeed | DB |
| ORD-09 | NULL payment method allowed | — | Create order with p_payment_method=NULL | Succeeds | DB |
| ORD-10 | Customer lookup by exact phone | Customer with phone='9930930445' exists | Call `fetchCustomerByPhone('9930930445')` | Returns matching customer | DB |
| ORD-11 | Customer lookup by phone - no match | — | Call `fetchCustomerByPhone('0000000000')` | Returns null | DB |
| ORD-12 | Default store filter by assignment (mumbai) | Profile assignment='mumbai' | Open orders tab | storeFilter defaults to 'mumbai' | MANUAL |
| ORD-13 | Default store filter by assignment (cutter) | Profile assignment='cutter' | Open orders tab | storeFilter defaults to undefined (All) | MANUAL |
| ORD-14 | Order list search by customer name | Orders exist | Type customer name in search bar | Matching orders shown | MANUAL |
| ORD-15 | Order list search by order number | Orders exist | Type order number in search bar | Matching order shown | MANUAL |
| ORD-16 | Order list search by phone | Orders with customer phone exist | Type phone in search bar | Matching orders shown | MANUAL |
| ORD-17 | Order detail shows all fields | Order with items exists | Open order detail modal | Shows order_no, store, status, total, paid, payment_method, notes, customer info, all items with dimensions | MANUAL |
| ORD-18 | Edit order via RPC | Order exists in 'new' status | Call `update_order_with_items` with changed items | Order updated, items replaced, status reset to 'new' | DB |
| ORD-19 | Cancel order via RPC | Order exists | Call `cancel_order` | Order status='cancelled', cut plans deleted, consumed stock restored to 'available', generated offcuts marked 'removed' | DB |
| ORD-20 | Cancel already cancelled order | Order status='cancelled' | Call `cancel_order` again | Returns success message "Order is already cancelled" | DB |
| ORD-21 | Mark order delivered | Order exists in 'cut' status | Call `useMarkOrderDelivered` | Order status='delivered', log_event called | DB |
| ORD-22 | ORDER_STATUSES constant includes 'cancelled' | — | Check ORDER_STATUSES array | Contains 'cancelled' value | UNIT |
| ORD-23 | PAYMENT_METHODS constant matches DB | — | Check PAYMENT_METHODS array values | Matches: cash, upi, card, bank_transfer, credit, other | UNIT |
| ORD-24 | Order items width/height > 0 | — | Insert order_item with width_mm=0 | DB rejects | DB |
| ORD-25 | Order items qty > 0 | — | Insert order_item with qty=0 | DB rejects | DB |
| ORD-26 | is_polished column defaults to false | — | Create order item without is_polished | Value is false | DB |
| ORD-27 | Activity log on order insert | — | Create an order | activity_log rows for orders and order_items inserts | DB |
| ORD-28 | Cancel delivered order state transition | Order in 'delivered' status | Call `cancel_order` | Documents whether cancelling delivered order is blocked or allowed | DB |
| ORD-29 | Mark cancelled or uncut order delivered | Order in 'new' or 'cancelled' | Execute `useMarkOrderDelivered` path | Documents absence of status transition guard on direct update | DB |
| ORD-30 | Edit order that has confirmed cut plans | Order has cut plans | Call `update_order_with_items` | Consumed stock restored to 'available', offcuts marked 'removed', plans deleted, status reset to 'new', 'revert' logged (Fixed in 20261010092909_fix_revert_type_and_cut_status_guard.sql) | DB |
| ORD-31 | cancel_order restores physically cut sheets | Order has confirmed cut plans | Call `cancel_order` | Consumed sheets restored to 'available' (documents business-rule question on physical inventory) | DB |

### 2.4 Order Creation Atomicity (4 use cases: 1 UNIT, 3 DB, 0 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| ATOM-01 | Current `useCreateOrder` workflow | — | Inspect `useCreateOrder` in mutations.ts | Calls `create_order_with_items` RPC for order and items, but customer creation/update is executed separately beforehand | UNIT |
| ATOM-02 | Order never exists without items (DB) | — | Call `create_order_with_items` with an item having invalid product_id | Transaction rolls back: no orphaned order row | DB |
| ATOM-03 | RPC calculates total correctly | — | Pass items with unit_price=150, qty=3 and unit_price=200, qty=2 | order.total = 150×3 + 200×2 = 850 | DB |
| ATOM-04 | Customer created but order RPC fails | — | Simulate customer insert success followed by order RPC error | Customer row remains created (orphan customer), documenting two-step non-atomic client flow | DB |

### 2.5 Optimizer (Pure TypeScript) (20 use cases: 20 UNIT, 0 DB, 0 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| OPT-01 | No overlaps between placements | Any optimizer result | Run packPieces, check every pair of placements | No pair overlaps (accounting for kerf) | UNIT |
| OPT-02 | Every piece inside sheet bounds | Any optimizer result | Check each placement | x + w ≤ sheet.width, y + h ≤ sheet.height | UNIT |
| OPT-03 | Area conservation | Any optimizer result | Sum piece areas + offcut areas + waste areas + kerf areas | Equals sheet area exactly | UNIT |
| OPT-04 | Lining pieces never rotated | Pieces with is_lining=true | Run optimizer | All lining placements have rotated=false | UNIT |
| OPT-05 | Offcuts-first rule | Both offcuts and full sheets available | Run optimizer | Offcuts used before full sheets | UNIT |
| OPT-06 | Smallest sufficient sheet first | Multiple offcuts of varying sizes | Run optimizer | Smaller offcuts preferred over larger | UNIT |
| OPT-07 | Empty pieces → empty result | No pieces, some sheets | Run packPieces(sheets, []) | plans=[], unplaced=[], warnings=[] | UNIT |
| OPT-08 | No sheets → warning | Some pieces, no sheets | Run packPieces([], pieces) | unplaced=all pieces, warning "No stock available" | UNIT |
| OPT-09 | Wastage warning when > max % | Settings with max_wastage_pct=5 | Run optimizer producing > 5% waste | Warning about wastage exceeding max | UNIT |
| OPT-10 | Kerf respected between pieces | kerf_mm=3 | Run optimizer with adjacent pieces | At least 3mm gap between adjacent pieces | UNIT |
| OPT-11 | Piece too large for any sheet | Sheet 1000×1000, piece 1500×1500 | Run optimizer | Piece in unplaced_pieces list | UNIT |
| OPT-12 | Exact fit → no waste | Sheet exactly matches piece dimensions | Run optimizer | wasted_area = 0, offcut_area = 0 | UNIT |
| OPT-13 | Property: no overlaps (fast-check) | Random sheets/pieces | Run 200+ random cases | No overlaps ever | UNIT |
| OPT-14 | Property: bounds respected (fast-check) | Random sheets/pieces | Run 200+ random cases | Every piece inside bounds | UNIT |
| OPT-15 | Property: area conservation (fast-check) | Random sheets/pieces | Run 200+ random cases | Area always conserved | UNIT |
| OPT-16 | Property: lining never rotated (fast-check) | Random lining sheets/pieces | Run 200+ random cases | rotated always false | UNIT |
| OPT-17 | isUsableOffcut rule | Various dimensions and min_offcut_mm | Check `isUsableOffcut(w, h, min)` | Wasted if BOTH w < min AND h < min; usable otherwise | UNIT |
| OPT-18 | piecesOverlap with kerf | Two adjacent pieces with gap = kerf | Check `piecesOverlap(a, b, kerf)` | Returns false (no overlap) | UNIT |
| OPT-19 | validatePlacements catches out-of-bounds | Placement exceeding sheet | Call validatePlacements | Returns error about exceeding bounds | UNIT |
| OPT-20 | verifyAreaConservation | Valid plan | Call verifyAreaConservation | isConserved=true, delta=0 | UNIT |

### 2.6 Cutting Feature (11 use cases: 10 UNIT, 0 DB, 1 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| CUT-01 | friendlyConfirmCutError translates "already confirmed" | — | Call with matching message | Returns user-friendly text | UNIT |
| CUT-02 | friendlyConfirmCutError translates "no longer available" | — | Call with matching message | Returns user-friendly text | UNIT |
| CUT-03 | computeSheetLeftovers empty sheet | No pieces on sheet | Call computeSheetLeftovers | Entire sheet is one offcut (if usable) or waste | UNIT |
| CUT-04 | computeSheetLeftovers single piece | One piece on sheet | Call computeSheetLeftovers | Produces offcuts and waste rects summing to remaining area | UNIT |
| CUT-05 | findBestPlacementOnSheet empty sheet | No existing pieces | Call findBestPlacementOnSheet | Returns {x:0, y:0} | UNIT |
| CUT-06 | findBestPlacementOnSheet avoids collision | One existing piece | Call findBestPlacementOnSheet | Returns position not overlapping existing | UNIT |
| CUT-07 | canFitPieceOnSheet normal glass | Non-lining sheet/piece | Check both orientations | Returns true if either orientation fits | UNIT |
| CUT-08 | canFitPieceOnSheet lining glass | Lining piece | Check without rotation | Returns true only if unrotated fits | UNIT |
| CUT-09 | canFitPieceOnSheet too large | Piece larger than sheet in both orientations | Check | Returns false | UNIT |
| CUT-10 | Polished piece +3mm allowance | order_item with is_polished=true | Check cutting query transform | widthMm and heightMm increased by 3 | UNIT |
| CUT-11 | Rotate control hidden for lining glass | Item has is_lining=true | Inspect piece actions on CutCanvas | Rotate button is strictly hidden (`!isLining`) | MANUAL |

### 2.7 confirm_cut_plan / confirm_batch_cut_plan (DB) (17 use cases: 0 UNIT, 17 DB, 0 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| CONF-01 | Partial cut: multiple plans for same order/product | Plan exists for order+product | Call confirm_batch_cut_plan again | Succeeds (unique constraint dropped) | DB |
| CONF-02 | Piece count exceeds ordered qty rejected | Order has qty=2, submit 3 pieces | Call confirm_batch_cut_plan | Exception about exceeding ordered quantity | DB |
| CONF-03 | Unavailable sheet rejected | Sheet with status='consumed' | Call confirm_batch_cut_plan referencing consumed sheet | Exception: "One or more sheets are no longer available" | DB |
| CONF-04 | Offcut with wrong parent rejected | Offcut parent_id not in consumed sheets | Call confirm_batch_cut_plan | Exception: "Offcut parent sheet is not one of the consumed sheets" | DB |
| CONF-05 | Successful confirm: stock consumed | Available sheets referenced | Call confirm_batch_cut_plan | Referenced sheets status='consumed' | DB |
| CONF-06 | Successful confirm: offcuts created | Valid offcuts in payload | Call confirm_batch_cut_plan | New stock_items with source='offcut', parent_id set, vertical_line_height_mm copied | DB |
| CONF-07 | Order status → 'cutting' when partial | Order has items for 2 products, confirm only 1 | Call confirm_batch_cut_plan | Order status changes to 'cutting' | DB |
| CONF-08 | Order status → 'cut' when all done | All products for order have cut plans | Call confirm_batch_cut_plan for last product | Order status changes to 'cut' | DB |
| CONF-09 | Stock movements ledger: consume entries | — | After confirm | stock_movements rows with type='consume' | DB |
| CONF-10 | Stock movements ledger: offcut_created entries | — | After confirm | stock_movements rows with type='offcut_created' | DB |
| CONF-11 | Cross-shop isolation (Multi-tenant test) | Order belongs to shop A | Authenticated as user from shop B, call confirm | Exception: "Order not found or does not belong to your shop" | DB |
| CONF-12 | Unauthenticated rejected | No session | Call confirm_batch_cut_plan | Exception: "Not authenticated or missing shop profile" | DB |
| CONF-13 | Pieces not belonging to order rejected | Piece references order_item from different order | Call confirm | Exception: "One or more pieces do not belong to the selected orders and product" | DB |
| CONF-14 | Batch: multiple orders on one sheet | Two orders for same product | Call confirm_batch_cut_plan with both order IDs | Both orders get cut_plans, shared sheets consumed once | DB |
| CONF-15 | Concurrent confirm race condition | Two sessions confirm using same sheet simultaneously | Run both calls concurrently | Exactly one succeeds, one fails with "no longer available" | DB |
| CONF-16 | Confirm plan on cancelled, delivered or fully cut order (BUG-05) | Order in 'cancelled', 'delivered' or 'cut' | Call confirm_batch_cut_plan | Rejected: "Cannot cut an order that is cancelled, delivered or already fully cut", no stock consumed, no plans/pieces created, status unchanged (Fixed in 20261010092909_fix_revert_type_and_cut_status_guard.sql) | DB |
| CONF-17 | Confirming same pieces twice rejected (Cumulative Qty) | Item has ordered qty=1, already cut in plan 1 | Submit second plan cutting same item | Rejected: piece count exceeds ordered quantity | DB |

### 2.8 Labels (11 use cases: 10 UNIT, 0 DB, 1 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| LBL-01 | Qty 3 → 3 labels (1/3, 2/3, 3/3) | Order item with qty=3 | Call generatePieceLabelsFromOrder | 3 labels with pieceIndex 1,2,3 and totalQty 3 | UNIT |
| LBL-02 | Label shows store (never 'cutter') | Order with store='mumbai' | Generate labels | Each label has store='mumbai', storeLabel='Mumbai' | UNIT |
| LBL-03 | Label shows order number | Order with order_no=42 | Generate labels | Each label has orderNo=42 | UNIT |
| LBL-04 | Label shows customer name | — | Generate labels | customerName matches order.customer.name | UNIT |
| LBL-05 | Label shows product info | — | Generate labels | productName, thicknessMm, color present | UNIT |
| LBL-06 | Label shows size in mm and ft-in | — | Generate labels | formattedDimensions contains both mm and ft-in | UNIT |
| LBL-07 | Polished label shows cut dimensions | is_polished=true, width=400, height=500 | Generate labels | formattedDimensions includes "Cut: 403 × 503 mm [POLISHED]" | UNIT |
| LBL-08 | HTML output valid structure | — | Call generateLabelsHtml | Contains DOCTYPE, label-page divs, proper escaping | UNIT |
| LBL-09 | Invalid store defaults to 'mumbai' | Order with store='cutter' (hypothetically) | Generate labels | Defaults to store='mumbai' | UNIT |
| LBL-10 | Empty order items → exception | Order with no items | Call printOrderLabels | Throws "This order has no pieces to generate labels for." | UNIT |
| LBL-11 | Current log wording for labels | — | Inspect `printOrderLabels` in services.ts | Calls `logEvent('Labels printed for order #N')` (divergence: logged as 'printed' vs 'exported') | MANUAL |

### 2.9 Invoice (4 use cases: 4 UNIT, 0 DB, 0 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| INV-I-01 | Invoice HTML contains all order data | Order with items | Call generateInvoiceHtml | HTML contains order_no, customer name, phone, address, all items with dimensions, totals | UNIT |
| INV-I-02 | Balance calculation | total=1000, paid=600 | Generate invoice | Balance shown as ₹400 | UNIT |
| INV-I-03 | Polished badge shown | Item with is_polished=true | Generate invoice | "POLISHED (+3mm)" badge in HTML | UNIT |
| INV-I-04 | HTML escaping | Customer name with `<script>` | Generate invoice | Properly escaped, no XSS | UNIT |

### 2.10 Low Stock (5 use cases: 0 UNIT, 4 DB, 1 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| LOW-01 | low_stock view counts only available full sheets | Product with min_stock_sheets=5, mix of available/consumed/removed, full/offcut | Query low_stock view | Only available + full sheets counted | DB |
| LOW-02 | low_stock view ignores inactive products | Product with active=false and min_stock_sheets > 0 | Query low_stock view | Product not in results | DB |
| LOW-03 | low_stock view ignores min_stock_sheets = 0 | Product with min_stock_sheets=0 | Query low_stock view | Product not in results | DB |
| LOW-04 | Dashboard alerts: out_of_stock for ordered product | Active order for product with 0 available stock | Call fetchLowStock | Item with reason='out_of_stock' | DB |
| LOW-05 | Dashboard banner rendered | Low stock items exist | Open Home tab | Low stock banner visible | MANUAL |

### 2.11 Activity Log (14 use cases: 0 UNIT, 12 DB, 2 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| LOG-01 | Insert on categories triggers log | — | Insert a category | activity_log row with action='insert', table_name='categories' | DB |
| LOG-02 | Update on products triggers log | — | Update a product | activity_log row with action='update', old_data and new_data populated | DB |
| LOG-03 | Insert on customers triggers log | — | Insert a customer | activity_log row with correct summary (customer name) | DB |
| LOG-04 | Insert on orders triggers log | — | Insert an order | activity_log row with summary including order number | DB |
| LOG-05 | Insert on order_items triggers log | — | Insert order_items | activity_log rows for each item | DB |
| LOG-06 | Insert on cut_plans triggers log | — | Confirm a cut plan | activity_log row for cut_plan insert | DB |
| LOG-07 | log_event writes 'event' action | — | Call log_event('Test event') | Row with action='event', table_name='app', summary='Test event' | DB |
| LOG-08 | log_event truncates summary to 200 chars | — | Call log_event with 300-char string | summary is first 200 chars | DB |
| LOG-09 | user_name and user_assignment filled | — | Any trigger or log_event | user_name matches profiles.full_name, user_assignment matches profiles.assignment | DB |
| LOG-10 | activity_log INSERT denied for authenticated | — | Direct INSERT into activity_log | Permission denied (INSERT revoked) | DB |
| LOG-11 | activity_log UPDATE denied | — | Direct UPDATE on activity_log | Permission denied (UPDATE revoked) | DB |
| LOG-12 | activity_log DELETE denied | — | Direct DELETE on activity_log | Permission denied (DELETE revoked) | DB |
| LOG-13 | Activity log screen loads and displays entries | Entries exist | Navigate to Settings → Activity Log | Log entries displayed, grouped, with filter chips | MANUAL |
| LOG-14 | Activity log filter: orders | Entries of different types | Tap "Orders" filter chip | Only order-related entries shown | MANUAL |

### 2.12 Backup Export (3 use cases: 0 UNIT, 0 DB, 3 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| BAK-01 | Export includes all 6 core tables | Data exists | Call exportShopBackup | JSON contains categories, products, stock_items, customers, orders, order_items | MANUAL |
| BAK-02 | Export calls log_event on share | — | Share successfully | logEvent('Backup exported') called | MANUAL |
| BAK-03 | Export handles query errors | — | If any Supabase query fails | Throws with error message | MANUAL |

### 2.13 Security (14 use cases: 3 UNIT, 11 DB, 0 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| SEC-01 | RLS enabled on all 12 tables | — | Check all tables | RLS enabled | DB |
| SEC-02 | Anon has no access to any table | — | As anon, SELECT from any table | Returns empty or denied | DB |
| SEC-03 | Authenticated can only see own shop's data (Multi-tenant) | Two shops & users exist | Query as user from shop A | Only shop A's data returned, shop B hidden | DB |
| SEC-04 | activity_log read-only for app | Authenticated user | Attempt INSERT, UPDATE, DELETE on activity_log | All denied | DB |
| SEC-05 | stock_movements: no UPDATE/DELETE | Authenticated user | Attempt UPDATE or DELETE on stock_movements | Denied | DB |
| SEC-06 | cut_plans: no UPDATE/DELETE via direct SQL | Authenticated user | Attempt UPDATE or DELETE on cut_plans | Denied | DB |
| SEC-07 | cut_pieces: no UPDATE/DELETE via direct SQL | Authenticated user | Attempt UPDATE or DELETE on cut_pieces | Denied | DB |
| SEC-08 | No service_role key in app/ or src/ application code | — | Search `app/` and `src/` (excluding tests) for 'service_role' | 0 matches | UNIT |
| SEC-09 | No secrets in .env tracked by git | — | Check .gitignore includes .env and .env.test | Both are gitignored | UNIT |
| SEC-10 | Supabase client uses only anon key | — | Inspect supabase.ts | Uses EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY | UNIT |
| SEC-11 | anon cannot execute log_event | — | As anon, call log_event | Permission denied | DB |
| SEC-12 | anon cannot execute confirm_cut_plan | — | As anon, call confirm_cut_plan | Permission denied | DB |
| SEC-13 | anon cannot execute create_order_with_items | — | As anon, call create_order_with_items | Permission denied | DB |
| SEC-14 | Direct UPDATE on stock_items and orders (Known Risk) | Authenticated user | Direct UPDATE `stock_items.status = 'consumed'` | Succeeds under current grants, documenting grant divergence from AGENTS.md rule | DB |

### 2.14 Edge Cases and Negative Tests (14 use cases: 9 UNIT, 5 DB, 0 MANUAL)

| ID | Scenario | Preconditions | Steps | Expected Result | Type |
|----|----------|---------------|-------|----------------|------|
| EDGE-01 | Zero dimension on stock item | — | Insert stock_item with width_mm=0 | DB rejects | DB |
| EDGE-02 | Negative dimension on stock item | — | Insert stock_item with height_mm=-100 | DB rejects | DB |
| EDGE-03 | Very large dimensions | — | Insert stock_item with width_mm=99999, height_mm=99999 | Succeeds (no upper bound in schema) | DB |
| EDGE-04 | parseDimensionInput zero | — | parseDimensionInput("0") | Returns null (asNumber not > 0) | UNIT |
| EDGE-05 | parseDimensionInput negative | — | parseDimensionInput("-100") | Returns null | UNIT |
| EDGE-06 | mmToFtIn(0) | — | Call mmToFtIn(0) | ft=0, inches=0, fracInches=0 | UNIT |
| EDGE-07 | formatFtIn(0) | — | Call formatFtIn(0) | Returns "0\"" | UNIT |
| EDGE-08 | Duplicate customer phone | Two customers with same phone | Query by phone | Returns one (maybeSingle) | DB |
| EDGE-09 | Order with many items | — | Create order with 50 items | Succeeds, total calculated correctly | DB |
| EDGE-10 | snapTo16th boundary values | — | snapTo16th(0.999), snapTo16th(0.001) | Rounds correctly to 1.0 and 0.0 | UNIT |
| EDGE-11 | getAspectRatioInfo square | — | getAspectRatioInfo(1000, 1000) | orientation='Square', ratioText='1 : 1' | UNIT |
| EDGE-12 | getAspectRatioInfo zero | — | getAspectRatioInfo(0, 0) | orientation='Square', ratioText='1 : 1' | UNIT |
| EDGE-13 | inToMm(0) | — | Call inToMm(0) | Returns 0 | UNIT |
| EDGE-14 | inToMm negative | — | Call inToMm(-5) | Returns 0 | UNIT |

---

## 3. Coverage Summary by Feature (Reconciled Exact Counts)

| Feature | Section | UNIT | DB | MANUAL | Total Use Cases |
|---------|---------|------|----|--------|-----------------|
| Auth | 2.1 | 3 | 2 | 8 | 13 |
| Inventory | 2.2 | 13 | 11 | 5 | 29 |
| Orders | 2.3 | 3 | 22 | 6 | 31 |
| Atomicity | 2.4 | 1 | 3 | 0 | 4 |
| Optimizer | 2.5 | 20 | 0 | 0 | 20 |
| Cutting | 2.6 | 10 | 0 | 1 | 11 |
| confirm_cut_plan | 2.7 | 0 | 17 | 0 | 17 |
| Labels | 2.8 | 10 | 0 | 1 | 11 |
| Invoice | 2.9 | 4 | 0 | 0 | 4 |
| Low Stock | 2.10 | 0 | 4 | 1 | 5 |
| Activity Log | 2.11 | 0 | 12 | 2 | 14 |
| Backup | 2.12 | 0 | 0 | 3 | 3 |
| Security | 2.13 | 3 | 11 | 0 | 14 |
| Edge Cases | 2.14 | 9 | 5 | 0 | 14 |
| **Total** | | **76** | **87** | **27** | **190** |

---

## 4. Traceability Table

| SPEC.md Requirement | Use Case IDs |
|---------------------|-------------|
| Phase 1: Auth (email/password, session restore) | AUTH-01..09 |
| Phase 1: Landing tab by assignment | AUTH-06, AUTH-07 |
| Phase 1: log_event for login/logout | AUTH-12, AUTH-13 |
| Phase 1: Activity log screen | LOG-13, LOG-14 |
| Phase 2: Stock items list, filters | INV-08..11 |
| Phase 2: Add stock (N rows for qty N) | INV-01 |
| Phase 2: Figured glass lining rule | INV-02..04, INV-26 |
| Phase 2: Edit/remove stock (soft delete) | INV-05..07 |
| Phase 2: mm ↔ ft-in input | INV-12..21, INV-27 |
| Phase 3: Customer search by phone | ORD-10, ORD-11 |
| Phase 3: Order items loop, pricing | ORD-04..06, ORD-24..26 |
| Phase 3: Store dropdown (Mumbai, Sanpada only) | ORD-01..03 |
| Phase 3: Payment method dropdown | ORD-07..09 |
| Phase 3: Order list, search, detail | ORD-14..17 |
| Phase 4: Optimizer pure TypeScript | OPT-01..20 |
| Phase 4: Fast-check properties | OPT-13..16 |
| Phase 5: Cutting workspace UI | CUT-03..06, CUT-11 |
| Phase 5: Polished glass +3mm allowance | CUT-10, LBL-07, INV-I-03 |
| Phase 6: confirm_cut_plan RPC | CONF-01..17 |
| Phase 6: Cutting queue | CONF-07, CONF-08 |
| Phase 6: Hardened database | SEC-01..14 |
| Phase 7: Low-stock banner | LOW-01..05 |
| Phase 7: Backup export | BAK-01..03 |
| Phase 8: Piece labels PDF | LBL-01..11 |
| Hard rule: No sign-up screen | AUTH-10 |
| Hard rule: No service_role key in app code | SEC-08..10 |
| Hard rule: Dimensions integer mm | INV-22, ORD-24 |
| Hard rule: Stock changes only in RPC | INV-07, SEC-05, SEC-14 |
| Hard rule: Soft-delete only | INV-06, INV-07 |

---

## 5. Bugs, Inconsistencies, and Known Issues

### BUG-01: `stock_movements.type` check constraint blocks 'revert'
- **Severity:** High
- **Status:** Fixed in migration `20261010092909_fix_revert_type_and_cut_status_guard.sql`
- **Details:** `cancel_order` and `update_order_with_items` write `type = 'revert'`. Constraint `stock_movements_type_check` has been updated to allow `'revert'`. Cancelling and editing orders with confirmed cut plans now succeeds cleanly, restoring sheets to 'available', marking offcuts 'removed', and writing 'revert' rows in `stock_movements`.

### BUG-02: Cutting workspace vs optimizer lining rotation rule & validator gap
- **Severity:** Medium
- **Status:** Confirmed.
- **Details:** Rotation is strictly disallowed in the optimizer engine (`guillotine.ts`, `pack.ts`). The UI hides the rotate control (`CutCanvas.tsx`). However, `validatePlacements` only checks `sheet.is_lining`, failing to flag a rotated piece if placed on a sheet without `is_lining: true` (tracked via `it.failing` in `liningRotation.test.ts`).

### Note on `create_order_with_items` RPC
- **Status:** Intentional design. `create_order_with_items` is `SECURITY INVOKER` so caller RLS and grants apply.

### KNOWN-ISSUE-01: `useMarkOrderDelivered` direct update & duplicate activity log
- **Details:** Direct `UPDATE` of `orders.status` to `'delivered'` has no state transition guard. The trigger `log_activity` writes an activity log row for the update, while the client's explicit `log_event` writes a second entry. Documented via test `ORD-29`.

### BUG-05: `confirm_batch_cut_plan` status update overwrites cancelled / delivered orders
- **Severity:** High
- **Status:** Fixed in migration `20261010092909_fix_revert_type_and_cut_status_guard.sql`
- **Details:** `confirm_batch_cut_plan` now locks active orders and enforces `status in ('new', 'cutting')`. Calling `confirm_batch_cut_plan` on a cancelled, delivered or already fully cut order is rejected with: "Cannot cut an order that is cancelled, delivered or already fully cut", consuming no stock and creating no cut plans or pieces.

### CONF-17: Cumulative cut pieces quantity validation
- **Status:** Verified working correctly in DB test (`tests/db/__tests__/high_risk.test.ts`). Attempts to cut pieces exceeding ordered quantity are rejected.

### KNOWN-RISK-01: Client holds direct UPDATE on `stock_items` and `orders`
- **Details:** Role `authenticated` holds table-level UPDATE grants on `stock_items` and `orders`, allowing clients to bypass RPCs. Documented via test `SEC-14`.

### Business Rule Question: cancel_order restores physically cut sheets
- **Details:** When an order is cancelled after cutting, `cancel_order` reverts consumed sheets back to status `'available'`. In practice, the sheet was physically cut into pieces. Documented via test `ORD-31`.
