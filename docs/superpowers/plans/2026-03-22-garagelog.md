# GarageLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri + React + SQLite desktop app for tracking vehicle maintenance with OS notifications.

**Architecture:** Rust backend owns all data access via SQLite (sqlx + migrations). React frontend calls Tauri commands and manages UI state with Zustand. A background Rust task fires hourly OS notifications for overdue/due-soon items.

**Tech Stack:** Tauri 2, React 18, TypeScript, Zustand, SQLite via sqlx, Vite, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-22-garagelog-design.md`

---

### Task 1: Project Scaffold

- [ ] Bootstrap with `npm create tauri-app@latest . -- --template react-ts`
- [ ] Add Rust deps to `src-tauri/Cargo.toml`: `sqlx` (sqlite, runtime-tokio), `serde`, `serde_json`, `tauri-plugin-notification`, `chrono`, `tokio`
- [ ] Add frontend deps: `zustand`, `@tauri-apps/api`, `@tauri-apps/plugin-notification`
- [ ] Verify `npm run tauri dev` launches without errors
- [ ] Commit: `chore: scaffold Tauri + React project`

---

### Task 2: Database Schema & Migrations

**Files:** `src-tauri/migrations/001_initial.sql`, `src-tauri/src/db.rs`

- [ ] Write migration SQL for all 4 tables: `vehicles`, `maintenance_items`, `service_records`, `odometer_readings` (see spec §2 for full schema)
- [ ] Write `db.rs`: open SQLite pool from Tauri app data dir, run `sqlx::migrate!()` on startup, show blocking error dialog on failure
- [ ] Test: run app, verify tables exist via `sqlite3`
- [ ] Commit: `feat: database schema and migrations`

---

### Task 3: Vehicle Commands (Rust)

**File:** `src-tauri/src/commands/vehicles.rs`

Commands: `get_vehicles`, `create_vehicle`, `update_vehicle`, `archive_vehicle`, `restore_vehicle`

- [ ] Write each command as `#[tauri::command]` async fn; `create_vehicle` also inserts initial row into `odometer_readings`
- [ ] Write unit tests in `#[cfg(test)]` module using an in-memory SQLite DB
- [ ] Run `cargo test` — all pass
- [ ] Commit: `feat: vehicle CRUD commands`

---

### Task 4: Odometer Command (Rust)

**File:** `src-tauri/src/commands/odometer.rs`

Command: `update_odometer`

- [ ] Validates reading ≥ current (hard error); >10,000 km above current returns a soft-warning flag in response (frontend confirms)
- [ ] Appends to `odometer_readings`, updates `vehicles.current_odometer` and `vehicles.odometer_updated_at`
- [ ] Tests for: normal update, backwards rejection, large-jump flag
- [ ] Commit: `feat: update_odometer command`

---

### Task 5: Maintenance Item Commands + Status Logic (Rust)

**Files:** `src-tauri/src/commands/maintenance.rs`, `src-tauri/src/status.rs`

Commands: `get_maintenance_items` (includes computed status), `create_maintenance_item`, `update_maintenance_item`, `delete_maintenance_item`

- [ ] Write `status.rs`: pure function `compute_status(item, last_record, current_odometer) -> Status` — handles all cases from spec §2 (no history baseline, unknown, both intervals, due-soon thresholds)
- [ ] `get_maintenance_items` joins last service record and calls `compute_status` for each item
- [ ] `delete_maintenance_item` cascades to `service_records`
- [ ] Tests for each status case (overdue, due soon, ok, unknown, both intervals)
- [ ] Commit: `feat: maintenance item commands and status computation`

---

### Task 6: Service Record Commands (Rust)

**File:** `src-tauri/src/commands/service_records.rs`

Commands: `log_service`, `get_service_history`

- [ ] `log_service`: inserts service record; if odometer entered > current, also updates odometer (same logic as Task 4, `recorded_at` = midnight UTC of `serviced_at`); below-current advisory is a response flag
- [ ] Tests for: normal log, implicit odometer update, below-current advisory
- [ ] Commit: `feat: service record commands`

---

### Task 7: Notifications (Rust)

**File:** `src-tauri/src/notifications.rs`

- [ ] On startup and every hour: query all non-archived vehicles + items, compute status, fire one OS notification per overdue/due-soon item
- [ ] Track `HashMap<item_id, last_notified_at>` in app state to skip re-notify within 24h
- [ ] Notification format from spec §1
- [ ] Commit: `feat: background notification task`

---

### Task 8: System Tray (Rust)

**File:** `src-tauri/src/tray.rs`

- [ ] Left-click: show/hide window
- [ ] Right-click menu: Open, Settings, Check Now (triggers notification check), Quit
- [ ] Configure app to launch minimized to tray (no visible window on startup)
- [ ] Wire up in `main.rs`
- [ ] Commit: `feat: system tray`

---

### Task 9: Export / Import (Rust)

**File:** `src-tauri/src/commands/export_import.rs`

- [ ] `export_json`: serializes all tables to JSON with `schema_version`; opens OS save dialog
- [ ] `export_csv`: one file per table as zip; opens OS save dialog
- [ ] `import_json`: parses file, validates schema version, returns summary + conflicts list
- [ ] `confirm_import`: applies import with per-vehicle merge/skip decisions
- [ ] Tests for merge, skip, version rejection, parse error
- [ ] Commit: `feat: export and import commands`

---

### Task 10: Frontend Foundation

**Files:** `src/lib/commands.ts`, `src/stores/vehicles.ts`, `src/stores/maintenance.ts`, `src/components/Toast.tsx`, `src/App.tsx`

- [ ] `commands.ts`: typed wrappers around `invoke()` for every Tauri command
- [ ] Zustand stores: vehicles store (list, selected vehicle), maintenance store (items by vehicle id)
- [ ] Toast provider: global dismissible error toast wired to catch all command errors
- [ ] Simple page routing in `App.tsx`: `dashboard | vehicle-detail | settings`
- [ ] Mock `@tauri-apps/api/core` in Vitest setup; write smoke tests for stores
- [ ] Commit: `feat: frontend foundation — stores, commands, toast`

---

### Task 11: Dashboard

**Files:** `src/pages/Dashboard.tsx`, `src/components/VehicleCard.tsx`

- [ ] Vehicle cards grid: name, year, type icon, odometer, status badge (worst status)
- [ ] Overflow menu on active cards: Edit, Archive
- [ ] "+ Add Vehicle" card at end of active section
- [ ] Archived vehicles toggle row; expands in-place; archived cards have overflow menu with Restore action
- [ ] Empty state
- [ ] Component tests with mocked store
- [ ] Commit: `feat: dashboard`

---

### Task 12: Vehicle Detail

**Files:** `src/pages/VehicleDetail.tsx`, `src/components/MaintenanceRow.tsx`

- [ ] Header: name, year, type, odometer, Edit link, Update Odometer button
- [ ] Filter tabs: All / Overdue / Due Soon / OK
- [ ] Maintenance rows: name, interval, last serviced, next due, status label, color-coded left border
- [ ] Per-row actions: Log Service, History, overflow (Edit, Delete)
- [ ] Empty state
- [ ] Component tests
- [ ] Commit: `feat: vehicle detail page`

---

### Task 13: Vehicle Modals

**Files:** `src/components/modals/AddEditVehicle.tsx`, `src/components/modals/UpdateOdometer.tsx`

- [ ] Add/Edit Vehicle: fields, validation from spec §3, add mode creates vehicle + initial odometer
- [ ] Update Odometer: soft warning for >10,000 km jump, hard block for backwards
- [ ] Tests for validation logic
- [ ] Commit: `feat: vehicle modals`

---

### Task 14: Maintenance & Service Modals

**Files:** `src/components/modals/AddEditMaintenanceItem.tsx`, `src/components/modals/LogService.tsx`, `src/components/modals/ServiceHistory.tsx`

- [ ] Add/Edit Maintenance Item: name, interval months, interval km, notes; at-least-one-interval validation
- [ ] Log Service: date, odometer (pre-filled), cost, shop, notes; below-current advisory; large-jump soft warning
- [ ] Service History: read-only list newest first; empty state
- [ ] Tests for validation
- [ ] Commit: `feat: maintenance and service modals`

---

### Task 15: Settings Page

**File:** `src/pages/Settings.tsx`

- [ ] Export JSON button, Export CSV button
- [ ] Import JSON flow: file picker → reject non-JSON immediately with error message → summary → conflict resolution table (merge/skip per row) → confirm
- [ ] Notification enable/disable toggle
- [ ] Commit: `feat: settings page`

---

### Task 16: Loading States & Error Handling

- [ ] All Tauri command calls: disable triggering control while in-flight; spinner for ops >200ms
- [ ] Long ops (import/export): modal progress indicator
- [ ] All errors surface as dismissible toast
- [ ] Commit: `feat: loading states and error handling`

---

### Task 17: End-to-End Smoke Test & Polish

- [ ] Manual test: add vehicle → add maintenance items → log service → verify status updates
- [ ] Verify notifications fire at startup and on "Check Now"
- [ ] Verify export/import round-trip
- [ ] Build release: `npm run tauri build`
- [ ] Commit: `chore: release build verified`
