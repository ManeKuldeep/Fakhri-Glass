# MANUAL_TESTS.md — Fakhri Glass Manual QA Checklist

This document contains test procedures for all **27 MANUAL use cases** defined in `TEST_PLAN.md`, plus the new flows for order cancellation, editing, and the concurrency status guard error message (post BUG-01 and BUG-05 fix).

---

## Screen 1: Login Screen (`app/login.tsx`)

### 1. AUTH-01: Login Success
- **Preconditions:** Valid user account exists (e.g., `mumbai@fakhriglass.test`, password `Password123!`).
- **Test Data:**
  - Email: `mumbai@fakhriglass.test`
  - Password: `Password123!`
- **Steps:**
  1. Launch app to login screen.
  2. Tap Email field, enter `mumbai@fakhriglass.test`.
  3. Tap Password field, enter `Password123!`.
  4. Tap "Sign In" button.
- **Expected Result:**
  - Spinner shows briefly.
  - User session is established.
  - Navigates immediately to the landing tab (`/orders`).
  - Activity log records: `Login` event for the user.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 2. AUTH-02: Login with Wrong Password
- **Preconditions:** Valid email registered.
- **Test Data:**
  - Email: `mumbai@fakhriglass.test`
  - Password: `WrongPassword999!`
- **Steps:**
  1. Enter email `mumbai@fakhriglass.test`.
  2. Enter incorrect password `WrongPassword999!`.
  3. Tap "Sign In".
- **Expected Result:**
  - Red banner / alert displayed: `"Invalid email or password. Please try again."`
  - Remains on login screen; password field is cleared or highlighted.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 3. AUTH-04: Login Rate Limiting
- **Preconditions:** Valid account exists.
- **Steps:**
  1. Enter invalid password.
  2. Tap "Sign In" 10+ times in rapid succession.
- **Expected Result:**
  - Error message displayed: `"Too many attempts. Please wait a minute and try again."`
  - Login attempts are temporarily throttled by Supabase Auth.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 4. AUTH-05: Session Restore After App Kill
- **Preconditions:** User is logged in.
- **Steps:**
  1. Log in successfully.
  2. Swipe app away from Android Recent Apps / force close app (`adb shell am force-stop com.fakhriglass`).
  3. Relaunch app from app drawer.
- **Expected Result:**
  - App displays splash screen briefly, then immediately restores session without prompting for login.
  - User is returned to their assigned landing tab.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 5. AUTH-06: Landing Tab by Assignment (Store Staff — Mumbai)
- **Preconditions:** User profile has `assignment = 'mumbai'`.
- **Steps:**
  1. Log in with Mumbai user credentials.
- **Expected Result:**
  - App navigates directly to **Orders** tab (`/(tabs)/orders`).
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 6. AUTH-07: Landing Tab by Assignment (Cutter)
- **Preconditions:** User profile has `assignment = 'cutter'`.
- **Steps:**
  1. Log in with Cutter user credentials.
- **Expected Result:**
  - App navigates directly to **Cut** tab (`/(tabs)/cut`).
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

## Screen 2: Orders Screen (`app/(tabs)/orders.tsx`)

### 7. ORD-12: Default Store Filter by Assignment (Mumbai Staff)
- **Preconditions:** User logged in with `assignment = 'mumbai'`.
- **Steps:**
  1. Navigate to Orders tab.
  2. Observe store filter pills at top of list.
- **Expected Result:**
  - The "Mumbai" pill is selected by default; orders are filtered to Mumbai store.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 8. ORD-13: Default Store Filter by Assignment (Cutter)
- **Preconditions:** User logged in with `assignment = 'cutter'`.
- **Steps:**
  1. Navigate to Orders tab.
- **Expected Result:**
  - The "All" store pill is selected by default (storeFilter is undefined).
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 9. ORD-14: Order List Search by Customer Name
- **Preconditions:** Orders exist for customer "Ali Asghar".
- **Steps:**
  1. Open Orders tab.
  2. Tap search bar, type `Ali`.
- **Expected Result:**
  - Only orders belonging to customers matching "Ali" are displayed.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 10. ORD-15: Order List Search by Order Number
- **Preconditions:** Order `#104` exists.
- **Steps:**
  1. Tap search bar, type `104`.
- **Expected Result:**
  - Only Order `#104` is displayed in the results list.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 11. ORD-16: Order List Search by Phone Number
- **Preconditions:** Customer with phone `9930930445` has active orders.
- **Steps:**
  1. Tap search bar, type `99309`.
- **Expected Result:**
  - Orders associated with phone `9930930445` are displayed.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 12. ORD-17: Order Detail Modal Inspection
- **Preconditions:** An order with items and customer information exists.
- **Steps:**
  1. Tap on an order card in the list.
  2. Inspect the opened Order Detail modal.
- **Expected Result:**
  - Displays Order number (`#...`), Store (`Mumbai` or `Sanpada`), Status chip (`New`, `Cutting`, `Cut`, `Delivered`, `Cancelled`).
  - Total amount (₹), Paid amount (₹), Payment method (e.g., `Cash`, `UPI`), Notes.
  - Customer Name, Phone, and Address.
  - Complete items list showing: Product name, Quantity, Dimensions (W × H mm and ft-in), Unit price, Polish indicator.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 13. [NEW] Cancel Order with Confirmed Cut Plans (BUG-01 Fix Verification)
- **Preconditions:** An order is in `cutting` or `cut` status with confirmed cut plans.
- **Steps:**
  1. Open Order Detail modal for the cut order.
  2. Tap "Cancel Order" button.
  3. Confirmation dialog appears: `"Are you sure you want to cancel Order #N? This will restore stock sheets."`
  4. Tap "Confirm Cancel".
- **Expected Result:**
  - Order status updates to `Cancelled`.
  - Previously consumed stock sheets are restored to `Available` in Inventory.
  - Any generated offcuts are soft-removed (`status = 'removed'`).
  - Cut plans are deleted.
  - Activity log registers `revert` stock movement and `cancelled` order update.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 14. [NEW] Edit Order with Confirmed Cut Plans (BUG-01 Fix Verification)
- **Preconditions:** Order has confirmed cut plans.
- **Steps:**
  1. Open Order Detail modal -> Tap "Edit Order".
  2. Change piece dimensions (e.g. from 500×500 to 600×600) and tap "Save Changes".
- **Expected Result:**
  - Successfully saves without PostgreSQL constraint violation.
  - Consumed sheets return to `Available`.
  - Order status resets to `New`.
  - Cutting queue refreshes with updated dimensions.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

## Screen 3: Inventory Screen (`app/(tabs)/inventory.tsx`)

### 15. INV-08: Filter by Category
- **Preconditions:** Stock items exist across multiple categories (e.g., Clear Float, Tinted, Figured).
- **Steps:**
  1. Open Inventory tab.
  2. Tap Category filter dropdown / chips, select `Clear Float`.
- **Expected Result:**
  - Only stock items belonging to `Clear Float` category are displayed.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 16. INV-09: Filter by Product
- **Preconditions:** Multiple glass products exist under a category.
- **Steps:**
  1. Select Category `Clear Float` -> Select Product `5mm Clear`.
- **Expected Result:**
  - Only `5mm Clear` stock sheets are visible.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 17. INV-10: Filter by Source (Full vs Offcut)
- **Preconditions:** Inventory contains both full sheets and offcuts.
- **Steps:**
  1. Tap Source filter toggle -> Select "Offcuts only".
  2. Then tap Source filter toggle -> Select "Full sheets only".
- **Expected Result:**
  - "Offcuts only" displays only items with `source = 'offcut'`.
  - "Full sheets only" displays only items with `source = 'full'`.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 18. INV-11: Default Status Filter is 'Available'
- **Preconditions:** Stock items exist in `available`, `consumed`, and `removed` statuses.
- **Steps:**
  1. Navigate to Inventory tab without selecting custom status filters.
- **Expected Result:**
  - Only `Available` sheets are shown. Consumed and removed sheets are excluded.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 19. INV-27: Unit Toggle mm ↔ ft-in
- **Preconditions:** Inventory items displayed with millimeter dimensions.
- **Steps:**
  1. On Inventory list screen, locate the unit toggle button (`mm` / `in` or `ft-in`).
  2. Tap the unit toggle.
- **Expected Result:**
  - Dimensions seamlessly switch from millimeters (e.g. `1220 × 2440 mm`) to feet-inches with 16th fractions (e.g. `4' 0" × 8' 0"`).
  - Tapping again switches back to millimeters.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

## Screen 4: Cutting Workspace Screen (`app/(tabs)/cut.tsx`)

### 20. CUT-11: Rotate Control Hidden for Lining Glass
- **Preconditions:** An order item with figured/lining glass (`is_lining = true`) is in cutting queue.
- **Steps:**
  1. Open Cut tab -> Select the lining glass order.
  2. Load pieces onto canvas.
  3. Tap on a lining glass piece to open piece actions.
- **Expected Result:**
  - Rotate button/handle is strictly hidden or disabled.
  - Lining piece cannot be rotated on the sheet.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 21. [NEW] Status Guard Concurrency Error Message (BUG-05 Fix Verification)
- **Preconditions:** Cutter has loaded an order into the cutting workspace, but the order is cancelled or delivered by another session before confirmation.
- **Steps:**
  1. Cutter opens layout for Order #N on the Cut screen.
  2. In parallel (or via another device/session), Order #N is cancelled.
  3. Cutter taps "Confirm Cut Plan".
- **Expected Result:**
  - Cut confirmation is rejected by the database guard.
  - App displays friendly translated error alert:
    `"This order was cancelled or already completed. Please refresh the cutting queue."`
  - Stock is NOT consumed and cutting workspace allows refreshing queue.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

## Screen 5: Piece Labels Flow (`src/features/labels/`)

### 22. LBL-11: Piece Labels Print & Log Event
- **Preconditions:** Order with multiple cut pieces exists.
- **Steps:**
  1. Open Order Detail -> Tap "Print Labels" or "Generate Labels".
  2. Print preview modal opens showing labels with store, order #, piece count (1/N), product, and dimensions.
  3. Tap "Print" or "Share PDF".
- **Expected Result:**
  - Print dialog triggers on Android.
  - Activity log verifies entry: `Labels printed for order #N`.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

## Screen 6: Dashboard / Home Screen (`app/(tabs)/index.tsx`)

### 23. LOW-05: Low-Stock Warning Banner
- **Preconditions:** Total available stock for a product drops below the threshold (< 3 full sheets).
- **Steps:**
  1. Navigate to Home / Dashboard tab.
- **Expected Result:**
  - Low-stock warning banner is visible at the top of the screen.
  - Lists the product name and current available sheet count with alert icon.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

## Screen 7: Activity Log Screen (`app/activity-log.tsx`)

### 24. LOG-13: Activity Log Screen Loads & Displays Grouped Entries
- **Preconditions:** Audit activity exists in the database.
- **Steps:**
  1. Navigate to Settings -> Tap "Activity Log".
- **Expected Result:**
  - Activity log screen loads with chronological audit trail.
  - Events are grouped by date (Today, Yesterday, etc.).
  - Shows user name, store assignment (`Name · Mumbai`), timestamp, and formatted event summary.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 25. LOG-14: Activity Log Filter by Category
- **Preconditions:** Diverse log entries exist (orders, stock, auth).
- **Steps:**
  1. On Activity Log screen, tap "Orders" filter chip.
  2. Tap "Stock" filter chip.
- **Expected Result:**
  - Tapping "Orders" filters list to order creations, updates, cuts, and cancellations.
  - Tapping "Stock" filters list to stock additions, edits, and movements.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

## Screen 8: Settings & Backup Screen (`app/(tabs)/settings.tsx`)

### 26. AUTH-08 & AUTH-09: Logout with Confirmation Dialog
- **Preconditions:** User is logged in.
- **Steps:**
  1. Navigate to Settings tab -> Tap "Log Out".
  2. Dialog appears with "Cancel" and "Log Out" options.
  3. Tap "Cancel" -> Dialog dismisses, user remains logged in.
  4. Tap "Log Out" again -> Tap "Log Out" confirmation.
- **Expected Result:**
  - User session is invalidated.
  - Navigates back to Login screen (`app/login.tsx`).
  - Activity log records `Logout` event.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)

---

### 27. BAK-01, BAK-02, BAK-03: Backup Export Flow & Error Handling
- **Preconditions:** User is on Settings screen.
- **Steps:**
  1. Tap "Export Backup" button.
  2. Observe system share dialog opening with JSON file.
  3. Inspect downloaded JSON: verify presence of `categories`, `products`, `stock_items`, `customers`, `orders`, `order_items`.
  4. Activity log records `Backup exported`.
  5. (Error handling): If device is offline or query fails, user receives descriptive error alert.
- **Expected Result:**
  - Valid structured JSON backup exported across all 6 core business tables.
  - Audit event logged.
  - Errors handled gracefully without app crashing.
- **Result:** [ ] Pass  [ ] Fail  (Tester: ________ Date: ________)
