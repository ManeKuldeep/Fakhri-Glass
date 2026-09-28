Stack: Expo (dev build, Android), TypeScript strict, Expo Router, TanStack Query, Zustand,
supabase-js, Skia, Gesture Handler, Reanimated, Jest + fast-check.
Users: NO roles. Every authenticated user of a shop has full access. Screens: Home, Inventory, Orders, Cut, Settings.
Data rules:
- All dimensions are integer millimetres. Convert ft/in only in UI helpers (1 ft = 304.8 mm, round to int).
- Schema changes only via supabase/migrations/*.sql, applied with `npx supabase db push`.
- RLS is on for every table via shop_id. Never use the service_role key. Never disable RLS.
- Stock is only deducted inside the confirm_cut_plan RPC (one transaction). Never update stock status from the client.
- Prefer soft states (status, active) over deleting rows. Ask for confirmation before any destructive action.
Code rules:
- No business logic inside components. Supabase calls live in src/features/*/api.ts.
- src/optimizer has ZERO React or React Native imports and is fully unit tested.
- Lining glass (products.is_lining): vertical_line_height_mm is mandatory when adding stock, pieces are never rotated.
Workflow: one phase at a time. After each phase run `npx tsc --noEmit`, lint and tests, then summarise changes.