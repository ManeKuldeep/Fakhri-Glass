# AGENTS.md: Rules for AI agents working on Fakhri Glass

Android app for a glass vendor (stores: Mumbai, Sanpada; plus a glass cutter).
Read `SPEC.md` (what to build) and `ARCHITECTURE.md` (how it is built and what the
database already contains) before writing any code. If they conflict with a user
message, ask before proceeding.

## Workflow

1. Work in Planning mode. Show a short plan and wait for approval before editing files.
2. One build phase per conversation (see SPEC.md). Do not start work from a later phase.
3. Make small, reviewable changes. Commit-sized steps.
4. Before saying a task is done, run and pass:
   - `npx tsc --noEmit`
   - `npx eslint .`
   - `npx jest`
5. Report what you changed, what you tested, and anything you were unsure about.
6. If a requirement is unclear or is listed under "Open questions" in SPEC.md,
   stop and ask. Do not invent business rules (pricing, sheet sizes, kerf, label size).

## Hard rules (never break these)

**Security**
- NEVER use or ask for the Supabase `service_role` key. The app uses the anon key only,
  through `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env`.
- NEVER hardcode keys, passwords, emails or URLs. `.env` must stay in `.gitignore`.
- NEVER build a sign-up screen. Sign-ups are disabled; accounts are created in the
  Supabase dashboard.
- NEVER weaken RLS or grants to make a query work. If a query fails with
  "permission denied", tell the user; do not fix it by widening access.

**Data**
- NEVER deduct or change stock from the client. Stock changes only inside the
  `confirm_cut_plan` RPC (and adding or soft-removing stock rows in Inventory).
- NEVER hard-delete. Removal is `status = 'removed'`, always after a confirmation dialog.
  (The database also blocks DELETE on most tables.)
- NEVER write to `activity_log`, `stock_movements`, `cut_plans` or `cut_pieces` directly
  from screens. Activity rows come from database triggers and the `log_event` RPC.
- All dimensions are integer millimetres. Convert ft/in only in the UI layer.
  Never store floats for dimensions.
- Store values are exactly `'mumbai'` and `'sanpada'`, from `src/constants/stores.ts`.
  `'cutter'` is an assignment, not a store: never show it in the Store dropdown or on labels.
- `profiles.assignment` is a label, not a permission. Do not gate screens or actions on it.
  It only drives: default store on new orders, landing tab, default order-list filter,
  and the "Name · Mumbai" text in the activity log.

**Database changes**
- Schema changes ONLY through `supabase/migrations/*.sql`, created with
  `npx supabase migration new <name>` and applied with `npx supabase db push`.
- NEVER edit a migration that has already been pushed. Add a new one.
- NEVER change the schema by clicking in the Supabase dashboard.
- Write migrations to be safe to re-run (`if not exists`, `drop ... if exists`,
  `on conflict do nothing`). Ask the user to run a diagnostic query before assuming
  the current state.
- After a schema change, regenerate types:
  `npx supabase gen types typescript --linked > src/types/database.ts`
- New tables need: `shop_id uuid not null default auth_shop_id()`, RLS enabled,
  a shop-scoped policy, explicit grants (nothing is granted by default), and an audit
  trigger if the table holds business data.

**Code**
- TypeScript strict. No `any`, no `@ts-ignore` without a comment explaining why.
- `src/optimizer/` is pure TypeScript: zero imports from React, React Native, Expo,
  Skia or Supabase. It must be testable in plain Jest.
- Server state goes through TanStack Query. UI and session state goes in Zustand.
  Do not mix them.
- Use Expo Router for navigation. Android only; do not add iOS or web code.
- No local SQLite, no offline queue, no separate backend server (decided, not up for debate).
- Show Supabase errors in plain language to the user, not raw JSON.
- Call `log_event` (RPC) for: login, logout, label printing, backup export.

## Testing expectations

- Optimiser: unit tests plus fast-check property tests for: no overlaps, every piece
  inside its sheet, area conserved (used + offcuts + waste = sheet area), no rotation
  when disallowed, lining pieces cut vertically only.
- Write optimiser tests before the implementation (phase 4).
- Screens: test logic (validation, formatting, conversions) rather than pixels.

## Definition of done for a phase

- Meets the phase's requirements in SPEC.md, with no scope creep.
- tsc, eslint, jest all pass.
- Works on an Android emulator or device with a real login.
- No secrets in the diff.
- A short note on how the user can manually test it.