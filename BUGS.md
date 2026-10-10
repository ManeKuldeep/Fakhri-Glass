# BUGS.md — Fakhri Glass Bug Tracker

This document records confirmed bugs and behavioral inconsistencies discovered during Stage 1 and Stage 2 testing.
Each confirmed bug is tracked by a test (using `test.failing` or explicit regression tests) that will flip when fixed.

---

### BUG-01: `stock_movements.type` check constraint blocks `'revert'`
- **Severity:** High (Data modification failure / rollback)
- **Status:** Fixed in migration `20261010092909_fix_revert_type_and_cut_status_guard.sql`
- **Location:** `supabase/migrations/20260928065723_init_schema.sql` vs `20261003081936_order_edit_and_cancel.sql`
- **Description:**
  The initial schema created table `stock_movements` with inline check constraint:
  `type text check (type in ('add','consume','offcut_created','adjust','remove'))`.
  Later, RPCs `cancel_order` and `update_order_with_items` write ledger entries with `type = 'revert'`.
  Because PostgreSQL check constraints apply unconditionally (including inside `SECURITY DEFINER` functions), attempting to cancel or edit an order that already has cut plans will fail with a check constraint violation on `stock_movements_type_check`.
- **Test:** DB test canceling an order with confirmed cut plans (`tests/db/high_risk.test.ts`).

---

### BUG-02: Validator fails to flag rotated piece when only the piece is lining
- **Severity:** Medium
- **Status:** Confirmed (Covered by `it.failing`)
- **Location:** `src/optimizer/validation.ts` line 74
- **Description:**
  `validatePlacements` checks:
  ```typescript
  if (p.rotated && sheet.is_lining) {
    errors.push(`Piece ${p.piece_id} is marked rotated on a lining sheet`);
  }
  ```
  `validatePlacements` only receives `sheet: OptimizerSheet` and `placements: PiecePlacement[]`. `PiecePlacement` does not preserve `is_lining`, and `validatePlacements` does not accept original `OptimizerPiece[]`. Therefore, if a piece is lining glass but placed on a non-lining sheet (or if `sheet.is_lining` is missing), the validator fails to flag the rotation.
- **Test:** `src/features/cutting/__tests__/liningRotation.test.ts` (`it.failing`).

---

### BUG-04 / KNOWN-ISSUE-01: Direct UPDATE on `orders.status` lacks transition guards and duplicates activity log
- **Severity:** Medium
- **Status:** Confirmed
- **Location:** `src/features/orders/mutations.ts` (`useMarkOrderDelivered`)
- **Description:**
  `useMarkOrderDelivered` directly executes:
  `supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)`.
  1. No state transition guard: any order (even 'cancelled' or newly created without cut plans) can be marked 'delivered'.
  2. Duplicate audit log: the database trigger `log_activity` automatically logs an 'update' row on `orders`, while `useMarkOrderDelivered` explicitly calls `logEvent('Order #... marked delivered')`, creating duplicate activity log entries for the same event.
- **Test:** Documented in `tests/db/high_risk.test.ts`.

---

### BUG-05: `confirm_batch_cut_plan` status update has no guard for cancelled or delivered orders
- **Severity:** High (State integrity violation)
- **Status:** Fixed in migration `20261010092909_fix_revert_type_and_cut_status_guard.sql`
- **Location:** `supabase/migrations/20261010042441_allow_partial_cut_plan.sql` lines 164–181
- **Description:**
  In `allow_partial_cut_plan.sql`, the status update in `confirm_batch_cut_plan` runs:
  `update orders set status = v_new_status where id = v_order_id and shop_id = v_shop_id;`
  The earlier guard (`and status in ('new', 'cutting')`) was removed. As a result, calling `confirm_batch_cut_plan` referencing an order that has already been delivered or cancelled will overwrite its status back to `'cutting'` or `'cut'`.
- **Test:** DB test confirming plan on cancelled or delivered order (`tests/db/high_risk.test.ts`).

---

### BUG-06 / CONF-17: Cumulative cut piece count validation across multiple cut sessions
- **Severity:** High
- **Status:** Pending DB test verification
- **Location:** `supabase/migrations/20261010042441_allow_partial_cut_plan.sql`
- **Description:**
  When confirming cut plans for an order, the system must enforce that the total cut quantity does not exceed the ordered quantity across multiple confirmation sessions. Confirming the same pieces twice or confirming more than the ordered quantity must be rejected.
- **Test:** Tested in `tests/db/high_risk.test.ts`.

---

### ISSUE-07: Optimizer does not enforce "vertical cuts only" on lining glass
- **Severity:** Low / Documented divergence from spec
- **Status:** Confirmed
- **Location:** `src/optimizer/guillotine.ts`
- **Description:**
  SPEC.md and AGENTS.md specify that lining glass pieces should be cut vertically only. While the optimizer strictly prevents rotating lining pieces, the guillotine cutting engine generates standard horizontal shelf splits across the sheet, producing horizontal kerf cuts on lining sheets.
- **Test:** Tested and documented in `src/features/cutting/__tests__/liningRotation.test.ts`.
