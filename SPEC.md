# SPEC.md: Fakhri Glass requirements

## 1. Business

A small glass vendor with two stores (Mumbai and Sanpada) and one glass cutter.
The app tracks inventory, takes customer orders, and helps the cutter cut ordered
pieces efficiently from available stock (offcuts first).

## 2. Users and access

- 3 personal accounts (Supabase email/password), sign-ups disabled, no sign-up screen.
- `profiles.assignment` is `mumbai`, `sanpada` or `cutter`. It is a LABEL, not a
  permission: everyone can see and do everything.
- Current accounts:

| Name | Assignment |
|---|---|
| Murtuza | mumbai |
| Qutub | sanpada |
| Hussain | cutter |

- Assignment is used only to:
  - preselect the store on new orders (Mumbai/Sanpada users; always changeable),
  - open the cutter on the Cut tab and everyone else on Orders,
  - default the order list filter to the user's own store (cutter defaults to All),
  - show "Name · Mumbai" in the activity log.
- `cutter` is not a store. It never appears in the order Store dropdown or on labels.

## 3. Product catalogue (already seeded: 8 categories, 50 products, editable later)

| Category | Products |
|---|---|
| Clear Glass (6) | 4, 5, 6, 8, 10, 12 mm |
| Extra Clear Glass (6) | 4, 5, 6, 8, 10, 12 mm |
| Mirror Glass (9) | 4/5/6 mm Clear; 4/5/6 mm Extra Clear; 5 mm Grey; 5 mm Brown; 5 mm Rose Gold |
| Tinted Glass (10) | Grey 4/5/8/10/12; Brown 4/5/8/10/12 mm |
| Reflective Glass (9) | Grey, Brown, Clear, each 3.5, 4, 5 mm |
| Figure Glass (6, lining) | 5 mm Clear Moru; 5 mm Clear (Reverse Moru); 5 mm Clear Flute Lite; 5 mm Grey Moru; 5 mm Brown Moru; 8 mm Clear Moru |
| Backpainted Glass (2) | 4 mm White B/P, 6 mm White B/P |
| Frosted Glass (2) | 4 mm, 5 mm |

**Lining rule.** Products with `is_lining = true` (Figure Glass): when adding a full sheet,
the user must enter the "vertical line height" in a fixed input box, with a visible note
that it is critical for the glass optimiser. The database rejects a lining full sheet
without it. Lining pieces are cut vertically only and are never rotated.

## 4. Features

### 4.1 Inventory
- Add and edit stock with dimensions. Each physical sheet or offcut is ONE `stock_items` row;
  adding quantity N inserts N rows.
- Filter by category, product, size.
- Soft delete only (`status = 'removed'`), always with a confirmation dialog.

### 4.2 Orders
- Customer name, phone, address; multiple items (product, width, height, quantity,
  price per item); several pieces of the same product with different sizes; several
  products per order; total; payment method; notes.
- REQUIRED "Store" dropdown with exactly two values: Mumbai and Sanpada (stored as
  `mumbai` / `sanpada`). Needed because each piece label prints the store.
- Order status: `new`, `cutting`, `cut`, `delivered`.
- Payment methods allowed by the database: cash, upi, card, bank_transfer, credit, other.

### 4.3 Piece labels
- One label per physical piece (quantity 3 gives 3 labels: 1/3, 2/3, 3/3).
- Shows store, order number, customer, product, size, piece number.
- Printed via PDF. Printer and label size decided later (see open questions).

### 4.4 Cutting optimiser (cutter's screen)
- For each product in an order, show a visual layout of how to cut the ordered pieces
  from available stock: offcuts first, smallest sufficient first, then a new full sheet
  only when needed.
- Guillotine cutting only (glass is scored edge to edge).
- Leftovers are saved as offcuts (new stock rows with a parent link) unless smaller than
  the minimum usable size.
- Lining glass: vertical cuts only, no rotation.
- Interactive: drag pieces (snap to edges, live collision check), rotate (not lining),
  move a piece to another sheet, add a new sheet.
- Settings: kerf (blade loss), minimum usable offcut size, maximum wastage %.
- On confirm: ONE atomic database transaction (`confirm_cut_plan`) deducts the used
  sheets, creates offcuts, saves the plan and pieces, and updates the order status.
- Example: one 7 ft x 10 ft sheet in stock, order of 3 pieces of 300 x 400 mm. The
  optimiser proposes a layout and saves the remainder as offcuts.

### 4.5 Low-stock notification
- Home screen banner, per-product minimum sheet count (`products.min_stock_sheets`).
- Counts available FULL sheets only; offcuts do not count. Read from the `low_stock` view.
- All minimums are currently 0, so nothing is flagged until the user sets them.

### 4.6 Activity log (read-only)
- Who did what and when, for all actions, shown as "Name · Assignment".
- Filled by database triggers and the `log_event` RPC; the app can only read it.

## 5. Build phases (one Antigravity conversation each, Planning mode on)

1. Auth and app shell: login, session, tabs (Home, Inventory, Orders, Cut, Settings), `log_event`.
2. Inventory: list, filters, add stock with lining validation and note, edit/remove.
3. Orders: customer, items loop, store dropdown, pricing, payment, list/detail.
4. Optimiser core: pure TypeScript, tests first.
5. Optimiser UI: Skia canvas, drag, snap, new sheet, kerf, wastage.
6. Confirm flow: `confirm_cut_plan` integration, cutter queue, and database hardening (see ARCHITECTURE.md, backlog).
7. Low-stock banner and notification, backup export. 7b: Activity log screen.
8. Piece labels (PDF).

## 6. Not now

3-year data cleanup, offline queue, roles/permissions, iOS, web.

## 7. Open questions (agents must ask, not guess)

Ask the user one at a time when the relevant phase starts.

- What "vertical line height" physically means for figure glass (needed before phase 2 UI copy and phase 4).
- Standard stock sheet sizes.
- Kerf and edge trim values.
- Pricing: per sq ft or per piece? GST invoicing needed? (`products.rate_per_sqft` exists but is empty.)
- May pieces from different orders share a sheet? (`confirm_cut_plan` currently handles one order and one product per call.)
- Label printer type and label size; barcode/QR needed or not.