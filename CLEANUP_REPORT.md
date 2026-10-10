# CLEANUP_REPORT.md — Fakhri Glass Post-Audit Cleanup Plan

**Date:** 2026-10-10  
**Branch:** `cleanup-20261010`  
**Target:** Fakhri Glass Android Project & Supabase Stack  
**Status:** STAGE 1 REPORT (No files deleted yet; awaiting user approval)

---

## 1. Files & Folders No Longer Imported or Referenced

| Path | Size | Reason Unneeded | How Verified | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| `src/features/inventory/components/StockItemCard.tsx` | 6.9 KB | Dead component. Inventory screen was rewritten to use `ProductStockCard.tsx` (FINDING-08). | Search across `app/`, `src/`, and `tests/` confirmed 0 imports or references outside the file itself. | **Delete** |
| `assets/favicon.png` | 7.0 KB | Web favicon in an Android-only project (FINDING-10). | Referenced only in `app.json` line 25 under `"web"`. Unused on Android. | **Delete** (with `web` block) |
| `assets/images/logo.svg` | 1.1 KB | Raw SVG source vector asset. Runtime UI (`FakhriLogo.tsx`) imports PNG assets (`logo.png`, `logo-white.png`, `logo-horizontal.png`). | Search confirmed 0 references in code or config. | **Ask me** (Default: Keep as design asset) |
| `assets/splash-icon.png` | 46.3 KB | Expo template splash icon. `app.json` specifies `"expo-splash-screen"` plugin without image parameter. | Search confirmed 0 references in code or config. | **Keep** (Safe fallback for Expo splash) |

---

## 2. Temporary & Generated Clutter

| Path | Size | Reason Unneeded | How Verified | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| `.DS_Store` (root) | 8.0 KB | macOS Finder desktop metadata file. | Untracked; present in `.gitignore`. | **Delete from disk** |
| `.expo/dev/logs/start.log` | 189 KB | Expo dev server session log from previous local runs. | Inside gitignored `.expo/` folder; not needed for code or runtime. | **Delete from disk** |
| `android/build/reports/` | 216 KB | Gradle problems and build reports. | Inside gitignored `android/` directory. | **Keep** (SAFETY RULE: do not touch `android/`) |
| `android/app/build/` | 6.1 GB | Compiled Android binaries, intermediate AAPT2 resources, and C++ CMake logs. | Inside gitignored `android/` directory. | **Keep** (SAFETY RULE: do not touch `android/`; user may run `./gradlew clean` manually if desired) |
| Scratch SQL / notes | 0 B | N/A | Search confirmed all SQL files reside strictly in `supabase/migrations/` (17 migration files). | **N/A (None found)** |

---

## 3. Test Leftovers & Local Docker Artefacts

| Item / Resource Name | Type | Current State / Details | Commands to Remove (DO NOT RUN NOW) | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| `Fakhri-Glass` containers | Docker Containers | Stopped cleanly via `npx supabase stop`. | `docker rm -f $(docker ps -aq --filter label=com.supabase.cli.project=Fakhri-Glass)` | **Keep** (Containers already removed by `stop`) |
| `supabase_db_Fakhri-Glass` | Docker Volume | Local PostgreSQL data directory (holds test data and migrations). | `docker volume rm supabase_db_Fakhri-Glass` | **Keep** (Required for local development and `npm run test:db`) |
| `supabase_edge_runtime_Fakhri-Glass` | Docker Volume | Edge runtime container volume. | `docker volume rm supabase_edge_runtime_Fakhri-Glass` | **Keep** (Required for local stack) |
| `supabase_storage_Fakhri-Glass` | Docker Volume | Local Supabase object storage volume. | `docker volume rm supabase_storage_Fakhri-Glass` | **Keep** (Required for local stack) |

> **Note on Resetting Test Database:** To fully reset local test data and start fresh, the user may run `npx supabase db reset` or `npx supabase stop --no-backup`. These commands must not be run automatically.

---

## 4. Unused Dependencies in `package.json`

| Package Name | Section | Size in node_modules | Reason Unneeded / Usage Proof | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| `expo-notifications` | `dependencies` | ~1.2 MB | **Unused.** 0 imports in `src/` or `app/`. Not in `app.json` plugins. Pulls in 12 unwanted Android permissions (`ShortcutBadger`, Firebase). 0 packages in `node_modules` depend on it (FINDING-09). | **Delete** (`npm uninstall expo-notifications`) |
| `expo-constants` | `dependencies` | ~450 KB | **Required by peer dependency.** Not imported directly in app code, but `expo-router@57.0.23` explicitly declares `expo-constants: ^57.0.19` as a required `peerDependency`. Also required by `expo-linking`, `expo-asset`, and `@expo/cli`. | **Keep** (Must NOT remove) |
| `expo-system-ui` | `dependencies` | ~300 KB | **Native UI dependency.** Not imported directly in app code, but autolinks `SystemUIModule` on Android to configure root view styling for `"userInterfaceStyle": "light"` in `app.json`. Cannot prove nothing needs it. | **Keep** (Must NOT remove) |
| `jest-expo` | `devDependencies` | ~1.8 MB | **Unused.** Project unit tests in `jest.config.js` and database tests in `jest.db.config.js` execute in pure Node environments with `ts-jest`. `jest-expo` is not referenced in configs. | **Ask me** (Default: Delete) |
| `@react-native/jest-preset` | `devDependencies` | ~800 KB | **Unused.** Companion preset to `jest-expo`. Not referenced in `jest.config.js` or `jest.db.config.js`. | **Ask me** (Default: Delete) |
| `expo-dev-client` | `dependencies` | ~3.4 MB | **Development Client.** Currently in `dependencies`. Safe to move to `devDependencies` (see Release Review Section below). | **Ask me** (Default: Move to `devDependencies`) |

---

## 5. The `android/` Folder Assessment

| Aspect | Status | Details | Recommendation |
| :--- | :--- | :--- | :--- |
| **Gitignored?** | ✅ **YES** | Configured in root `.gitignore` at line 43 (`/android`). | **Keep** |
| **Committed in Git?** | ✅ **NO** | `git ls-files android/` returns 0 files. Untracked. | **Keep** |
| **Total Disk Size** | 6.2 GB | 6.1 GB is transient build output in `android/app/build/`. Root Gradle files are ~300 KB. | **Keep** |
| **Generated by `expo prebuild`** | Structure | `build.gradle`, `settings.gradle`, `gradle.properties`, `gradlew`, `app/build.gradle`, `AndroidManifest.xml`, `MainActivity.kt`, `MainApplication.kt`, and `res/` resource files. | **Keep** (Never delete or edit directly per SAFETY RULES) |

---

## 6. Git Hygiene & Large Files

| Item / File | Category | Size | Finding & Action | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| Tracked files matching `.gitignore` | Hygiene | 0 files | `git ls-files -i -c --exclude-standard` returned empty. No tracked ignored files. | **Clean** |
| `.gitignore` Gaps | Hygiene | N/A | `.gitignore` currently does not ignore generic `*.log` or `coverage/`. Propose adding these entries. | **Update `.gitignore`** |
| `package-lock.json` | Large File | 572 KB | Standard dependency lockfile. | **Keep** |
| `src/features/cutting/components/CutWorkspace.tsx` | Large File | 56.8 KB | Largest TypeScript source file (complex interactive canvas UI). | **Keep** |
| `assets/icon.png` | Large File | 55.8 KB | App launcher icon. | **Keep** |
| `assets/images/logo.png` | Large File | 54.3 KB | High-resolution brand logo. | **Keep** |
| `assets/splash-icon.png` | Large File | 46.3 KB | Splash icon. | **Keep** |
| `TEST_PLAN.md` | Large File | 42.5 KB | Comprehensive test plan documentation. Protected file. | **Keep** |
| Repository Binary Check | Hygiene | 0 binaries | History and working tree free of accidental database dumps, videos, or keystore binaries. | **Clean** |

---

## 7. Documentation Clutter & Configuration Review

| Document | Size / Lines | Status | Details | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| `README.md` | 190 lines | Current | High-level system overview, technology stack, and build guide. | **Keep** |
| `docs/CLIENT_TESTING_GUIDE.md` | 211 lines | Current | End-to-end customer and staff testing walkthrough. | **Keep** |
| `.env.test.example` | 8 lines | Clean | Verified line-by-line. Currently contains exactly 8 lines with one single block of test environment variables. **No duplicate blocks exist.** | **Keep as is** |
| Protected Documents | Various | Protected | `AGENTS.md`, `SPEC.md`, `ARCHITECTURE.md`, `TEST_PLAN.md`, `BUGS.md`, `MANUAL_TESTS.md`, `REVIEW_REPORT.md` all intact. | **Keep (Protected)** |

---

## 8. Specific Audit Findings & Configuration Proposals

### FINDING-10: Remove Unused `ios` and `web` Blocks from `app.json`

`app.json` contains configuration blocks for platforms outside the project scope:
```json
    "ios": {
      "supportsTablet": true
    },
```
and
```json
    "web": {
      "favicon": "./assets/favicon.png"
    },
```

- **Impact on Android Build:**
  - Android Gradle and Expo compiler ignore `"ios"` and `"web"` blocks entirely.
  - Verification: Removing these blocks does not alter Android manifest generation, APK packaging, or Hermes JS bytecode output.
  - Consequent cleanup: `assets/favicon.png` (7.0 KB) is only referenced by `"web"` and can be safely deleted.
- **Proposed Diff for `app.json`:**
```diff
--- a/app.json
+++ b/app.json
@@ -7,9 +7,6 @@
     "orientation": "portrait",
     "icon": "./assets/icon.png",
     "userInterfaceStyle": "light",
-    "ios": {
-      "supportsTablet": true
-    },
     "android": {
       "package": "com.fakhriglass.app",
       "allowBackup": false,
@@ -21,9 +18,6 @@
       },
       "predictiveBackGestureEnabled": false
     },
-    "web": {
-      "favicon": "./assets/favicon.png"
-    },
     "plugins": [
       "expo-router",
       "expo-splash-screen"
```

---

### Release Build Review: `expo-dev-client` in `dependencies` vs `devDependencies`

- **Is moving `expo-dev-client` to `devDependencies` safe for development builds (`npx expo run:android`)?**
  - **YES.** Local development builds run in environments where `npm install` installs both `dependencies` and `devDependencies`. Expo autolinking scans `node_modules` and discovers `expo-dev-client` regardless of which section it is in. The developer menu and launcher remain fully operational in debug builds.
- **Is it safe for release builds?**
  - **YES.** In production release builds on CI/EAS (using `NODE_ENV=production` or `npm install --omit=dev`), omitting `expo-dev-client` from `dependencies` prevents the package from being installed, which excludes its native Java/Kotlin classes from the final APK, saving ~1–2 MB.
  - For local release builds (`./gradlew assembleRelease`) with an existing `node_modules` folder, Gradle compiles the linked classes but disables the dev menu (`BuildConfig.DEBUG == false`).
- **Recommendation:** Move `"expo-dev-client": "~57.0.19"` to `"devDependencies"`.

---

### Release Build Review: Android Permissions & Proposed `app.json` Settings

#### Permission Source Analysis:

1. **`android.permission.INTERNET`:**
   - **Source:** Default Expo template.
   - **Need:** Required for Supabase HTTP/WebSocket API communication. **Keep.**
2. **`android.permission.SYSTEM_ALERT_WINDOW`:**
   - **Source:** Default Expo Android template (`android/app/src/main/AndroidManifest.xml:4`).
   - **Need:** Used exclusively by React Native debug overlay (RedBox / dev menu). Unnecessary in production. **Block.**
3. **`android.permission.READ_EXTERNAL_STORAGE` & `WRITE_EXTERNAL_STORAGE` (`maxSdkVersion="32"`):**
   - **Source:** Default Expo Android template (`android/app/src/main/AndroidManifest.xml:3,6`).
   - **Need:** Unnecessary. App generates temporary PDFs and backups inside app-private cache (`FileSystem.cacheDirectory`) and shares them via `expo-sharing` (Android `FileProvider`). The app does not access arbitrary shared device storage. **Block.**
4. **`android.permission.VIBRATE`:**
   - **Source:** Default Expo Android template (`android/app/src/main/AndroidManifest.xml:5`).
   - **Need:** Unnecessary. App contains zero haptic feedback or vibration invocations. **Block.**
5. **12 Transitive Permissions (ShortcutBadger & Firebase Messaging):**
   - **Source:** Pulled transitively by `expo-notifications` (`ShortcutBadger:1.1.22` and `firebase-messaging:25.0.1`).
   - **Need:** Unnecessary. App has no push notification support.
   - **Resolution:** Removed automatically when `expo-notifications` is uninstalled.

#### Proposed `app.json` Configuration:
```json
    "android": {
      "package": "com.fakhriglass.app",
      "allowBackup": false,
      "adaptiveIcon": {
        "backgroundColor": "#FFFFFF",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false,
      "permissions": [
        "INTERNET"
      ],
      "blockedPermissions": [
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.VIBRATE"
      ]
    }
```
*(As instructed, no direct edits will be made to `android/`).*

---

## 9. Baseline Verification (Stage 1 Status)

All baseline verification checks were executed prior to proposing modifications:
- **`npx tsc --noEmit`:** ✅ Clean (0 errors).
- **`npx eslint .`:** ✅ Clean (0 errors).
- **`npx jest`:** ✅ 18 test suites passed, 162 tests passed.
- **`npx expo export --platform android`:** ✅ Bundled successfully (2,145 modules, hermes bytecode emitted).
- **`npx expo-doctor`:** ✅ 19/21 checks passed (2 advisory notices: `@expo/vector-icons` peer recommendation for `expo-font`, and patch version suggestions).

---

## 10. Open Questions & Ambiguities

1. Should `assets/images/logo.svg` (1.1 KB) be kept as a design source asset or deleted? Proposed default: **Keep**.
2. Should `assets/splash-icon.png` (46.3 KB) be kept as the fallback splash asset or deleted? Proposed default: **Keep**.
3. Should `jest-expo` and `@react-native/jest-preset` be deleted from `devDependencies` since all tests run via pure Node `ts-jest`? Proposed default: **Delete**.
4. Should `expo-dev-client` be moved from `dependencies` to `devDependencies` in `package.json`? Proposed default: **Move to devDependencies**.
5. `.env.test.example` currently contains only 8 lines with no duplicate block; confirm keeping it unchanged? Proposed default: **Keep unchanged**.
