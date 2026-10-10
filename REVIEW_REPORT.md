# REVIEW_REPORT.md — Fakhri Glass Security & Code Quality Audit

**Date:** 2026-10-10  
**Target:** Fakhri Glass (Android App & Supabase Backend)  
**Scope:** `app/`, `src/`, `tests/`, `supabase/migrations/`, `app.json`, `package.json`, `.gitignore`, jest configs, git history  
**Auditor:** Code Reviewer & Security Auditor Agent

---

## 1. Executive Summary

This comprehensive security and code quality review evaluated the Fakhri Glass codebase across four critical dimensions:
1. **Secret Leaks** (service_role keys, JWT tokens, environment files, git history, signing keys)
2. **Data Leaks & Multi-Tenant Isolation** (PII in logs/alerts, file caching, release configuration, RLS/grants, SECURITY DEFINER functions)
3. **Memory & Resource Leaks** (hook cleanup, subscription lifecycle, query cache, reanimated/gesture memory, list virtualization, optimizer performance)
4. **General Code Quality** (dead code, unused dependencies, error handling, atomicity of mutations, TypeScript strictness)

### Summary of Findings & Resolution Status
- **High Severity:**
  - FINDING-01: **RESOLVED (Fixed)** — `queryClient.clear()` called on sign-out and user ID change.
  - FINDING-02: **RESOLVED (Fixed)** — Temporary label, invoice, and backup files purged before new export and on logout.
  - FINDING-03: **RESOLVED (Fixed)** — `android.allowBackup` set to `false` in `app.json`.
  - FINDING-04: **RESOLVED (Fixed)** — Existing customers queried by exact phone match before insert and reused without overwriting.
- **Medium Severity:**
  - FINDING-05: **RESOLVED (Fixed)** — Central `friendlyDatabaseError` sanitizer implemented and wired across all alerts.
  - FINDING-06: **PENDING PUSH (Migration Prepared)** — New migration `20261010111511_add_shop_ownership_to_order_rpcs.sql` authored with shop-ownership checks.
  - FINDING-07: **WON'T FIX** — No measured performance problem.
- **Low Severity:**
  - FINDING-08: **DEFERRED** — Deferred to cleanup step.
  - FINDING-09: **DEFERRED** — Deferred to cleanup step.
  - FINDING-10: **DEFERRED** — Deferred to cleanup step.
  - FINDING-11: **WON'T FIX (Accepted)** — Synchronous multi-strategy optimizer accepted for vendor scale.
- **Current Test Status:** TypeScript (`tsc --noEmit`), ESLint (`eslint .`), Unit Tests (`jest`: 162/162 passing across 18 test suites), and Database Tests (`test:db`: 95/95 passing across 9 test suites) all PASS.

---

## 2. Findings Ranked by Severity

### HIGH SEVERITY

---

#### FINDING-01 [SEC-15]: TanStack Query Cache Not Cleared on User Logout
- **Severity:** High
- **Status:** ✅ **RESOLVED (Fixed in Commit `3ab4056`)**
- **Location:** `app/(tabs)/settings.tsx`, `app/_layout.tsx`, `src/lib/queryClient.ts`
- **What was wrong:**
  When a user signed out via `handleLogout()` or `onAuthStateChange`, `queryClient.clear()` was never invoked.
- **Why it mattered:**
  Previously loaded query cache data (orders, customer names, phone numbers, addresses, stock items, and audit activity logs) remained in the in-memory `QueryClient` cache across user session switches on the same shared physical phone.
- **Fix Implemented:**
  1. Created `handleAuthUserChange(newUserId, queryClient)` in `src/lib/queryClient.ts`.
  2. Integrated cache clearing on logout and when a different authenticated user ID signs in.
  3. Added comprehensive automated test in `src/lib/__tests__/queryCacheLogout.test.ts` verifying that cached orders, stock items, and activity logs are completely evicted upon logout.

---

#### FINDING-02 [SEC-16]: Temporary PDF Files with Customer PII Left Permanently on Device Storage
- **Severity:** High
- **Status:** ✅ **RESOLVED (Fixed in Commit `d354206`)**
- **Location:** `src/lib/tempFileManager.ts`, `src/features/labels/services.ts`, `src/features/orders/invoiceServices.ts`, `src/features/settings/utils/exportBackup.ts`, `app/(tabs)/settings.tsx`, `app/_layout.tsx`
- **What was wrong:**
  Generated label PDFs, invoice PDFs, and backup JSON files accumulated permanently in `FileSystem.cacheDirectory`. Deleting immediately after `Sharing.shareAsync` was problematic because external printer/viewer apps may still be reading the file.
- **Why it mattered:**
  Unencrypted temporary files containing customer PII (names, delivery addresses, phone numbers, items, amounts) and entire shop backup dumps persisted indefinitely in application cache.
- **Fix Implemented:**
  1. Implemented `cleanupAppTempFiles` in `src/lib/tempFileManager.ts`, which safely purges only app-created temp files (`label-*.pdf`, `invoice-*.pdf`, `fakhri-glass-backup-*.json`) from the cache directory.
  2. Wired cleanup to run proactively at the start of each new PDF/backup generation and on user logout.
  3. Preserved file availability during active sharing so native printer and viewer apps can complete reading.
  4. Added unit tests in `src/lib/__tests__/tempFileManager.test.ts`.

---

#### FINDING-03 [SEC-17]: Android Application Backup Enabled (`allowBackup="true"`)
- **Severity:** High
- **Status:** ✅ **RESOLVED (Fixed in Commit `c183a37`)**
- **Location:** `app.json`
- **What was wrong:**
  `app.json` did not configure `"allowBackup": false` under `"android"`.
- **Why it mattered:**
  Allowed ADB data extraction (`adb backup com.fakhriglass.app`) on devices with USB debugging enabled, exposing local app storage and cached data.
- **Fix Implemented:**
  Configured `"allowBackup": false` under `"android"` in `app.json`. As instructed, did not run prebuild and did not modify anything in `android/`.

---

#### FINDING-04 [ATOM-04]: Client-Side Customer Insertion Creates Orphan Rows & Duplicate Phone Entries
- **Severity:** High
- **Status:** ✅ **RESOLVED (Fixed in Commit `a926c4d`)**
- **Location:** `src/features/orders/mutations.ts`, `src/features/orders/components/CreateOrderForm.tsx`
- **What was wrong:**
  Typing an existing customer's phone number previously created a duplicate customer row in `customers` table rather than reusing the existing record.
- **Why it mattered:**
  Fragmented customer order history and created multiple duplicate customer records with identical phone numbers.
- **Fix Implemented:**
  1. Updated `useCreateOrder` in `src/features/orders/mutations.ts` to query `customers` by exact phone match before insert. If found, reuses existing customer ID without overwriting its name or address without explicit confirmation.
  2. Added phone lookup suggestion in `CreateOrderForm.tsx`, alerting the user when an existing customer matches the entered phone number.
  3. Added unit tests in `src/features/orders/__tests__/customerReuse.test.ts`. Orphan-customer creation remains documented as a known low issue per instructions.

---

### MEDIUM SEVERITY

---

#### FINDING-05 [ERR-01]: Raw Database & SQL Error Messages Exposed Directly to Users
- **Severity:** Medium
- **Status:** ✅ **RESOLVED (Fixed in Commit `f6b28bf`)**
- **Location:** `src/lib/friendlyDatabaseError.ts`, `src/features/inventory/utils.ts`, `src/features/cutting/utils.ts`, `src/features/orders/mutations.ts`, `src/features/orders/components/CreateOrderForm.tsx`, `src/features/orders/components/EditOrderModal.tsx`, `src/features/orders/components/OrderDetail.tsx`, `src/features/cutting/components/CutWorkspace.tsx`, `app/(tabs)/settings.tsx`, `app/login.tsx`
- **What was wrong:**
  When database constraints or RPC calls failed, raw PostgreSQL error messages (leaking table names, column types, SQLSTATE codes) were shown in UI alerts.
- **Why it mattered:**
  Exposed internal schema details to end users and presented confusing technical errors.
- **Fix Implemented:**
  1. Created centralized `friendlyDatabaseError` helper in `src/lib/friendlyDatabaseError.ts`.
  2. Mapped known constraint patterns (checks, dimensions, stores, lining glass trigger, network connectivity, auth session expiry).
  3. Preserved intentional plain-language RPC messages from custom stored procedures.
  4. Suppressed technical SQL schema leaks with safe fallback messages.
  5. Wired `friendlyDatabaseError` into all error display locations and mutation catches.
  6. Added comprehensive unit tests in `src/lib/__tests__/friendlyDatabaseError.test.ts`.

---

#### FINDING-06 [MULTI-01]: Order RPCs Lack Multi-Tenant Verification on Customer and Product IDs
- **Severity:** Medium
- **Status:** ⏳ **PENDING PUSH (Migration Prepared in `supabase/migrations/20261010111511_add_shop_ownership_to_order_rpcs.sql`)**
- **Location:** `supabase/migrations/20261010111511_add_shop_ownership_to_order_rpcs.sql`
- **What was wrong:**
  `create_order_with_items` and `update_order_with_items` accepted `p_customer_id` and line item `product_id` without verifying that they belong to the caller's shop (`v_shop_id := auth_shop_id()`).
- **Why it mattered:**
  A client could reference a customer or product UUID from another tenant, creating an order that references cross-tenant resources.
- **Fix Implemented:**
  Authored a new migration file based on the live `pg_proc` function definitions, adding:
  - Customer ownership check: `if not exists (select 1 from public.customers where id = p_customer_id and shop_id = v_shop_id) then raise exception 'Customer not found or belongs to another shop'; end if;`
  - Line item product ownership check: `if exists (select 1 from jsonb_array_elements(p_items) e where not exists (select 1 from public.products where id = (e->>'product_id')::uuid and shop_id = v_shop_id)) then raise exception 'One or more products not found or belong to another shop'; end if;`
  - Read-only diagnostic query prepared for user verification. Awaiting user go-ahead to push.

---

#### FINDING-07 [MEM-01]: Gesture Handlers Instantiated on Every Render in `InteractivePiece.tsx`
- **Severity:** Medium
- **Status:** 🛑 **WON'T FIX (Per user decision: no measured performance issue)**
- **Location:** `src/features/cutting/components/InteractivePiece.tsx`

---

### LOW SEVERITY

---

#### FINDING-08 [DEAD-01]: Dead Component File `StockItemCard.tsx`
- **Severity:** Low
- **Status:** ⏸️ **DEFERRED (Deferred to cleanup step)**
- **Location:** `src/features/inventory/components/StockItemCard.tsx`

---

#### FINDING-09 [DEPS-01]: Unused Dependencies in `package.json`
- **Severity:** Low
- **Status:** ⏸️ **DEFERRED (Deferred to cleanup step)**
- **Location:** `package.json` (`expo-notifications`, `expo-constants`, `expo-system-ui`)

---

#### FINDING-10 [CONFIG-01]: Unused iOS and Web Configurations in `app.json`
- **Severity:** Low
- **Status:** ⏸️ **DEFERRED (Deferred to cleanup step)**
- **Location:** `app.json`

---

#### FINDING-11 [OPT-01]: Multi-Strategy Optimizer JS-Thread Execution Cost
- **Severity:** Low
- **Status:** 🛑 **WON'T FIX (Accepted per user decision)**
- **Location:** `src/optimizer/pack.ts`

---

## 3. Known & Accepted Items

The following items are acknowledged as known and accepted, and are not tracked as new defects:
- **SEC-14:** Role `authenticated` holds table-level `UPDATE` grants on `stock_items` and `orders` directly.
- **BUG-02:** `validatePlacements` checks only the sheet's `is_lining` flag.
- **KNOWN-ISSUE-01:** `useMarkOrderDelivered` triggers an automatic database activity log row and manually calls `logEvent`, resulting in two log entries for delivery.
- **Label Log Copy:** Activity log wording states "Labels printed" instead of "Labels exported".
- **Business Behavior:** `cancel_order` RPC restores sheets to available even if physically cut.
- **FINDING-04 Orphan Customer:** Client-side network drop during order placement leaving an orphan customer without orders is kept as a known low issue.

---

## 4. Release Build Review (Check & Report Only)

A dedicated audit of the Android release build configuration was conducted across `app.json`, `package.json`, `android/app/build.gradle`, and `android/app/src/main/AndroidManifest.xml`:

| Check | Status / Observation | Risk / Recommendation |
|---|---|---|
| **Debuggable Flag** | ✅ **Disabled in Release** | Standard Android Gradle Plugin behavior disables `android:debuggable` (`false`) in release variants. `android:usesCleartextTraffic` is only enabled in `android/app/src/debug/AndroidManifest.xml`. |
| **expo-dev-client & Dev Menu** | ⚠️ **Included in Production Dependencies** | `"expo-dev-client": "~57.0.19"` is declared in `package.json` under `"dependencies"` rather than `"devDependencies"`. While the developer menu gesture is disabled in release builds (`BuildConfig.DEBUG == false`), native launcher code from `expo-dev-client` is bundled into the release APK, increasing binary size. **Recommendation:** Move to `devDependencies` or exclude from release packaging during the cleanup step. |
| **Release Signing Config** | ⚠️ **Configured to Use Debug Keystore** | In `android/app/build.gradle` (lines 112–115): `release { signingConfig signingConfigs.debug }`. Release builds generated locally without EAS credentials are signed with the default insecure `debug.keystore`. **Recommendation:** Configure a production release keystore with environment-driven credentials prior to distribution. |
| **Source Maps** | ✅ **Excluded from APK Assets** | Hermes engine is enabled with flags `["-O", "-output-source-map"]`. Hermes bytecode compiler emits intermediate source maps to `build/generated/sourcemaps/react/release/` for crash symbolication; raw source maps are **not** bundled into the production APK assets. |
| **Unneeded Permissions** | ⚠️ **Sensitive Permissions in Manifest** | `android/app/src/main/AndroidManifest.xml` requests:<br>1. `android.permission.SYSTEM_ALERT_WINDOW` (line 4) — High-risk "Draw over other apps" permission required only by React Native debug overlay. Unnecessary in production.<br>2. `android.permission.READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` (lines 3, 6, `maxSdkVersion="32"`) — App uses private app cache and `expo-sharing` (FileProvider); does not read arbitrary public files.<br>3. `android.permission.VIBRATE` (line 5) — App has no haptic/vibration feedback calls.<br>**Recommendation:** Prune unnecessary permissions from `AndroidManifest.xml` / `app.json` plugins. |

---

## 5. Verification Checklist & Items Confirmed Clean

| Area | Status | Verification Details |
|---|---|---|
| **service_role Key** | ✅ CLEAN | 0 occurrences in `app/` and `src/`. Only used in `tests/db/` local test harness. |
| **Test Host Guard** | ✅ CLEAN | `tests/db/guard.ts` contains `assertLocalStackUrl`, strictly throwing fatal error if host is not `localhost` or `127.0.0.1`. |
| **.env Git Protection** | ✅ CLEAN | `.env`, `.env.test`, `.env*.local` are in `.gitignore`. Untracked in git. |
| **Git History Secrets** | ✅ CLEAN | History search confirmed `.env` and `.env.test` were never committed. No JWTs or private keys in history. |
| **Keystores & Properties**| ✅ CLEAN | No `*.jks`, `*.keystore`, `*.pem`, `google-services.json`, or `local.properties` committed. `android/` directory is gitignored. |
| **Environment Variables** | ✅ CLEAN | `src/lib/supabase.ts` reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` dynamically. No hardcoded keys. |
| **app.json Config** | ✅ CLEAN | `"allowBackup": false` set under `"android"`. No secrets in `extra` or metadata. |
| **Console Data Leakage** | ✅ CLEAN | Only two console calls exist (`logEvent.ts:11` warn, `_layout.tsx:35` error). Neither logs customer data, tokens, or sessions. |
| **External Telemetry** | ✅ CLEAN | No third-party network endpoints or analytics SDKs. Only Supabase and explicit user WhatsApp link (`wa.me`). |
| **SECURITY DEFINER RPCs**| ✅ CLEAN | All custom RPCs enforce `set search_path = public`, and revoke EXECUTE from anon and public. |
| **TypeScript Strictness** | ✅ CLEAN | Zero instances of `: any`, `<any>`, `as any`, or `@ts-ignore` in `app/` and `src/`. |
| **Test Suite Results** | ✅ PASS | `tsc --noEmit` (PASS, 0 errors)<br>`eslint .` (PASS, 0 errors)<br>`jest` (PASS, 18/18 test suites, 162/162 tests passed)<br>`npm run test:db` (PASS, 9/9 test suites, 101/101 tests passed) |

---

## 6. Commit History (Stage 2 Fixes)

All Stage 2 fixes were committed in small, isolated steps with Finding IDs in each commit message:
- `3ab4056` — `FINDING-01: Clear queryClient cache on sign-out and different user login`
- `d354206` — `FINDING-02: Manage temporary PDF and export files without immediate post-share deletion`
- `c183a37` — `FINDING-03: Disable Android application backup in app.json`
- `a926c4d` — `FINDING-04: Reuse existing customer by exact phone match and prevent silent overwriting`
- `f6b28bf` — `FINDING-05: Centralize friendly database error sanitization and protect user alerts`
- `7f993b0` — `FINDING-06: Add DB tests and migration for order RPC multi-tenant ownership checks`
