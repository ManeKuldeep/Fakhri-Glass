# Fakhri Glass — Android Management System

A purpose-built Android application for **Fakhri Glass** to manage retail store counters (**Mumbai** and **Sanpada**) and warehouse cutting operations. The app streamlines inventory tracking (full sheets and usable offcuts), custom customer order booking, 2D guillotine cutting layout optimization, thermal piece label printing, and retail invoicing.

---

## Table of Contents

1. [System Roles & Access](#1-system-roles--access)
2. [Core Features & Workflows](#2-core-features--workflows)
   - [Precision Dimension System (1/16" Fractions & Integer mm)](#precision-dimension-system)
   - [Inventory & Offcut Tracking](#inventory--offcut-tracking)
   - [Order Lifecycle & Polished Edge Finish](#order-lifecycle--polished-edge-finish)
   - [Customer Invoicing & WhatsApp Sharing](#customer-invoicing--whatsapp-sharing)
   - [2D Glass Cutting Optimizer (Skia Canvas)](#2d-glass-cutting-optimizer)
   - [Thermal Piece Labels (100 × 50 mm)](#thermal-piece-labels)
   - [Order-Grouped Activity Log](#order-grouped-activity-log)
3. [Architecture & Technology Stack](#3-architecture--technology-stack)
4. [Android Build & Size Optimization](#4-android-build--size-optimization)
5. [Development & Verification](#5-development--verification)

---

## 1. System Roles & Access

The application serves three dedicated staff profiles with shared operational visibility across all inventory and orders. A user's profile assignment drives intelligent default routing, store preselection, and activity attribution:

| Staff Member | Profile Assignment | Primary Focus | Default Landing Tab | Default Filter |
| :--- | :--- | :--- | :--- | :--- |
| **Murtuza** | `mumbai` | Mumbai Counter Sales | **Orders** | Mumbai Store |
| **Qutub** | `sanpada` | Sanpada Counter Sales | **Orders** | Sanpada Store |
| **Hussain** | `cutter` | Warehouse Glass Cutting | **Cut** | All Orders |

> **Store Rule:** Stores are strictly `Mumbai` and `Sanpada`. `Cutter` is an operational assignment and never a store location (it is excluded from store selection dropdowns and customer piece labels).

---

## 2. Core Features & Workflows

### Precision Dimension System
Glass cutting requires tight tolerances and clear unit conversions:
- **Database Storage:** All dimensions are stored strictly as whole **integer millimetres** (`mm`). Floats or decimals are never persisted to the database.
- **Dual-Unit Input:** Input screens support switching between `mm` and `ft / in` (feet, inches, and fractions).
- **Whole-Number mm Enforcement:** In `mm` mode, inputs accept only whole numbers (digits only).
- **1/16" Fractional Precision:** In `in / ft` mode, users select precise 1/16" increments (`0`, `1/16"`, `1/8"`, `3/16"`, ..., `15/16"`).
- **Smart Decimal Snapping:** If a user types a decimal point into an inch/feet input (e.g., `10.5` or `6.25`), the app automatically snaps the fractional part to the nearest 1/16" fraction (`10 8/16"` / `10 1/2"` or `6 4/16"` / `6 1/4"`), preventing rounding inconsistencies before converting to integer millimetres.

### Inventory & Offcut Tracking
- **Physical Sheet Tracking:** Each physical sheet or offcut corresponds to one individual row in the database. Adding quantity $N$ creates $N$ distinct stock rows.
- **Figured / Lining Glass:** Products with `is_lining = true` (e.g., Moru fluted glass) require entering a **Vertical Line Height** upon creation. Flute alignment is maintained through cutting calculations.
- **Interactive Visualizer:** Every stock item and offcut includes a proportional visual thumbnail and an inspection modal showing surface area ($\text{sq. ft}$ and $\text{m}^2$), aspect ratio, and comparison with an 8' × 6' full sheet.
- **Soft Deletes Only:** Stock deletion marks items as `status = 'removed'`, preserving historical cutting audit trails.

### Order Lifecycle & Polished Edge Finish
- **Order Progression:** Orders move through four operational states:
  $$\text{New} \longrightarrow \text{Cutting} \longrightarrow \text{Cut} \longrightarrow \text{Delivered}$$
- **Order Editing & Cancel Rollback:** Orders can be edited or cancelled. If an order with confirmed cut plans is modified or cancelled, previously deducted sheets are safely restored back to available inventory.
- **Polished Glass Allowance (+3 mm):**
  - Order items can be marked as **Polished (+3mm)** or **Non-Polished**.
  - Polishing requires edge grinding. The app adds an extra $+3\text{ mm}$ allowance to both width and height during cutting optimization (e.g., a $600 \times 900\text{ mm}$ finished piece is cut at $603 \times 903\text{ mm}$).
  - Bills, invoices, and customer views retain the exact requested finished dimensions ($600 \times 900\text{ mm}$) with a distinct `[POLISHED]` badge.

### Customer Invoicing & WhatsApp Sharing
- **Instant WhatsApp Billing:** Generates pre-formatted WhatsApp order confirmations displaying store location, line items with dimensions, total amount, advance paid, and balance due.
- **A4 Tax & Retail Invoice Generation:** Native PDF generation via `expo-print` and `expo-sharing`. Generates clean, professional A4 invoices with company headers, itemized breakdowns, square footage calculations, payment terms, and balance dues.
- **Order Handover:** A prominent **"Mark as Delivered"** action on cut orders records the delivery timestamp, updates the status, and provides an immediate one-tap invoice export.

### 2D Glass Cutting Optimizer
- **Guillotine Scoring:** Proposes edge-to-edge scoring cuts suitable for physical glass cutting tables.
- **Offcuts First:** The engine prioritizes existing usable offcuts before consuming a new full sheet.
- **0 mm Default Kerf:** Glass scoring wheels score and snap glass without blade material loss. Kerf defaults to $0\text{ mm}$ (adjustable in settings if needed).
- **Interactive Skia Canvas:**
  - Touch drag-and-drop piece placement.
  - Magnetic edge and piece snapping.
  - Real-time collision detection (conflicting pieces highlight in bright red).
  - Figured/lining glass rotation lock (preserves vertical fluting direction).
  - Multi-sheet layout switcher and unplaced piece tray.
- **Atomic Plan Confirmation:** Execution of `confirm_cut_plan` runs as a single database transaction, simultaneously marking parent sheets as consumed, inserting generated offcuts, and updating order status.

### Thermal Piece Labels
- **Standard Format:** Direct 100 × 50 mm (4" × 2") thermal roll layout.
- **Individual Piece Labels:** Generates 1 label per physical piece (e.g. Quantity 3 creates `Piece 1/3`, `Piece 2/3`, `Piece 3/3`).
- **Label Details:** Displays Store Header (`FAKHRI GLASS · MUMBAI`), Order #, Customer Name, Product Type, dual dimensions (`mm` + `ft/in`), and polished cut size tags.

### Order-Grouped Activity Log
- The real-time activity log automatically aggregates multiple events related to the same order (created, cut confirmed, labels printed, delivered) into a single, clean timeline card per order.

---

## 3. Architecture & Technology Stack

```
fakhri-glass/
├── app/                  # Expo Router screens (tabs, modals, stacks)
├── src/
│   ├── components/       # Shared UI primitives (Buttons, Modals, Headers)
│   ├── constants/        # Fixed domain values (Stores, Statuses, Units)
│   ├── features/
│   │   ├── auth/         # Supabase session & profile assignment
│   │   ├── cutting/      # Skia canvas, gestures, sheet visualizers
│   │   ├── inventory/    # Stock queries, mutations, DimensionInput (1/16")
│   │   ├── orders/       # Order management, delivery, A4 invoice generator
│   │   └── settings/     # Activity log timeline grouping & backup exports
│   ├── hooks/            # Shared React hooks (notifications, UI)
│   ├── optimizer/        # Pure TypeScript 2D guillotine packing engine
│   ├── services/         # Supabase client & RPC wrappers
│   └── types/            # Database schema types & optimizer models
└── supabase/
    └── migrations/       # Version-controlled SQL migrations & RPCs
```

### Core Technologies
- **Runtime & UI:** React Native 0.86, Expo SDK 57 (Bare workflow via Prebuild).
- **Navigation:** Expo Router v5.
- **Graphics & Canvas:** `@shopify/react-native-skia` for 60fps interactive cutting layouts.
- **State Management:** `@tanstack/react-query` v5 (server data) + `zustand` v5 (local session and UI state).
- **Backend & Database:** Supabase PostgreSQL with Row Level Security (RLS) policies and security definer RPCs (`confirm_cut_plan`, `log_event`).
- **Printing & Sharing:** `expo-print` and `expo-sharing`.

---

## 4. Android Build & Size Optimization

The Android release build is optimized using **R8 code minification**, **resource shrinking**, **native library compression**, and **ABI splitting**.

### APK Artifacts (`android/app/build/outputs/apk/release/`)

| APK Name | Target Architecture | File Size | Description |
| :--- | :--- | :--- | :--- |
| **`app-arm64-v8a-release.apk`** | 64-bit ARM | **27 MB** | **Recommended** for modern Android phones/tablets |
| **`app-armeabi-v7a-release.apk`** | 32-bit ARM | **25 MB** | Legacy Android devices |
| **`app-universal-release.apk`** | All ABIs | **59 MB** | Universal bundle containing all native binaries |

*(Original unoptimized universal debug build: ~145 MB $\rightarrow$ Optimized release: **27 MB**).*

To compile release APKs locally:
```bash
cd android
./gradlew assembleRelease
```

---

## 5. Development & Verification

### Prerequisites
- Node.js 20+
- Android SDK & Java 17 (JDK)
- Expo CLI

### Environment Setup
Create a `.env` file in the root directory:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Key Commands

```bash
# Start Expo development server
npm start

# Run on connected Android device / emulator
npm run android

# Run test suite (Jest + fast-check property tests)
npm test

# Type checking
npm run typecheck

# Linting
npx eslint .
```

---

## License

Proprietary software developed for Fakhri Glass. All rights reserved.
