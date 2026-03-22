# GarageLog — Design Spec
**Date:** 2026-03-22

## Overview

GarageLog is a personal desktop application for tracking vehicle maintenance. It lets users manage multiple vehicles, define recurring maintenance items with time and/or mileage intervals, log service history, and receive OS-level notifications when maintenance is overdue or coming due — even when the app window is closed.

---

## 1. Architecture

The app is built with **Tauri + React + SQLite**, split into two layers:

**Rust (backend)**
All database access, file I/O, notification scheduling, and export/import logic. Exposed to the frontend as thin async Tauri commands. The Rust layer is the sole owner of all data — the frontend never touches SQLite directly.

**React (frontend)**
Renders UI and manages local UI state with **Zustand**. Calls Tauri commands to read/write data. State is organized into focused stores close to the features they serve (vehicles store, maintenance items store) — no global mega-store.

**Background process**
A Tauri background task runs every hour (fixed in v1, not user-configurable) to check for overdue/due-soon items across all **non-archived** vehicles and fire OS notifications. A check also runs once at app startup. Archived vehicles and their maintenance items are excluded from all notification checks and status computation. OS notifications fire regardless of window visibility — no in-app suppression in v1.

**Notifications**
One OS notification is fired per overdue or due-soon item. Format: `"[Vehicle Name] — [Item Name] is overdue"` or `"[Vehicle Name] — [Item Name] due in X days / Y km"`. An item will not re-notify within 24 hours of its last notification.

**Datetime storage**
All DATETIME values are stored as UTC throughout the app.

**Database**
SQLite stored in Tauri's app data directory. Schema migrations run automatically on startup via **sqlx**. A migration failure shows a blocking error dialog before the app exits.

**Loading & error states**
All Tauri command calls disable the triggering control while in-flight and show an inline spinner for operations expected to take >200ms. Long operations (import, export) show a modal progress indicator. All Tauri command errors surface as a dismissible toast notification.

---

## 2. Data Model

### `vehicles`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK NOT NULL | |
| name | TEXT NOT NULL | |
| year | INTEGER NOT NULL | |
| type | TEXT NOT NULL | car / motorcycle / truck / other |
| current_odometer | INTEGER NOT NULL | Always mirrors latest odometer_readings entry |
| odometer_updated_at | DATETIME NOT NULL | Always updated together with current_odometer |
| archived | BOOLEAN NOT NULL | |
| archived_at | DATETIME | nullable |
| created_at | DATETIME NOT NULL | |

`(name, year)` is **not** enforced as a unique DB constraint. It is used only as a soft heuristic for duplicate detection during import. The app allows two vehicles with the same name and year to coexist.

### `maintenance_items`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK NOT NULL | |
| vehicle_id | INTEGER FK NOT NULL | |
| name | TEXT NOT NULL | e.g. "Oil Change" |
| interval_months | INTEGER | nullable |
| interval_km | INTEGER | nullable |
| notes | TEXT | nullable |
| created_at | DATETIME NOT NULL | |

At least one of `interval_months` or `interval_km` must be set. When both are set, status is computed from whichever threshold is hit first. If one interval cannot be computed (Unknown — no odometer baseline), the other interval's status is used. If both are Unknown, the item status is Unknown.

Maintenance items of archived vehicles are excluded from notification checks and status badges.

### `service_records`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK NOT NULL | |
| maintenance_item_id | INTEGER FK NOT NULL | |
| serviced_at | DATETIME NOT NULL | |
| odometer_at_service | INTEGER | nullable |
| cost | REAL | nullable |
| shop | TEXT | nullable |
| notes | TEXT | nullable |

To query all service records for a vehicle, join through `maintenance_items.vehicle_id` — no direct FK from `service_records` to `vehicles` by design.

When `odometer_at_service` is null on the most recent record, km-interval status is shown as "Unknown."

**No-history baseline:** If a maintenance item has no service records, status is computed using `maintenance_items.created_at` as the baseline. If the item has only a km interval and no odometer baseline, status is "Unknown" until the first service is logged.

**Month arithmetic:** `interval_months` intervals use calendar months (e.g. 3 months from Jan 31 = Apr 30). Stored as UTC; displayed in local time.

**Status computation** (overdue / due soon / ok) is derived at query time — not stored. "Due soon" threshold is 30 days or 500 km remaining, hardcoded in v1 and not user-configurable. The km-remaining calculation uses `vehicles.current_odometer` as the current position, subtracted from the projected next-due odometer.

### `odometer_readings`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK NOT NULL | |
| vehicle_id | INTEGER FK NOT NULL | |
| reading | INTEGER NOT NULL | |
| recorded_at | DATETIME NOT NULL | |

Append-only log of all odometer updates. `vehicles.current_odometer` always reflects the latest reading.

When a Log Service entry implicitly creates an odometer reading (entered km > current), `recorded_at` is set to midnight UTC of `serviced_at`.

---

## 3. UI & Navigation

### System Tray
- App starts minimized to tray
- Left-click: show/hide window
- Right-click menu: Open, Settings, Check Now (force notification check), Quit

### Dashboard (home screen)
- Vehicle cards grid, each showing: name, year, type icon, current odometer, status badge (worst status across all maintenance items)
- Status badges: Overdue (red), Due Soon (yellow), All Good (green)
- Active vehicle cards have an overflow menu with: Edit, Archive
- "+ Add Vehicle" card always appears at the end of the active section, immediately before the archived vehicles toggle row
- Archived vehicles collapsed at the bottom with a toggle row ("X archived vehicles ▶"). Clicking expands them in-place within the grid; state is not persisted across sessions.
- Archived vehicle cards have an overflow menu with: Restore
- **Empty state:** When no vehicles exist, the grid shows: "No vehicles yet. Add your first one to get started." with an "+ Add Vehicle" button. No first-run wizard in v1.

### Vehicle Detail
- Back button to dashboard
- Vehicle name + year + type, with an "Edit" link and an "Update Odometer" button
- Current odometer displayed alongside the Update Odometer button
- Filter tabs: All / Overdue / Due Soon / OK
- Maintenance items as rows with color-coded left border
- Each row: name, interval, last serviced date + km, next-due date/km, status label
- Per-row actions: "Log Service", "History", overflow menu with Edit and Delete
- **Empty state:** "No maintenance items yet. Add your first one." with an "+ Add Item" button.

### Update Odometer Modal
Fields: new odometer reading (required), date (defaults to today).

Validation:
- Must be ≥ current value (hard block with inline error: "Odometer cannot go backwards.")
- Must not exceed current value by more than 10,000 km (soft warning: "This is X km more than your current reading. Are you sure?" with Confirm / Cancel — does not hard-block.)

On submit: appends a row to `odometer_readings` and updates `vehicles.current_odometer` and `vehicles.odometer_updated_at`.

### Log Service Modal
Fields: date (defaults to today), odometer at service (pre-filled with `vehicles.current_odometer`, optional — clearing it stores null), cost (optional), shop (optional), notes (optional).

Odometer validation:
- Values below `vehicles.current_odometer` are accepted for the service record (to support historical entry) but do not trigger an odometer update, and display an inline advisory: "This is below your current odometer — the reading won't be updated."
- Values above current by more than 10,000 km show the same soft warning as the Update Odometer modal.

On submit: creates a service record. If the entered odometer is greater than `vehicles.current_odometer` (and confirmed if warned), also appends a row to `odometer_readings` with `recorded_at` = midnight UTC of `serviced_at`, and updates `vehicles.current_odometer` and `vehicles.odometer_updated_at`.

### Service History Modal
Read-only list of all past service records for the item, newest first. Editing and deleting service records are out of scope for v1.

**Empty state:** "No service history yet. Use Log Service to record the first entry."

### Add/Edit Vehicle Modal
**Add mode fields:** name (required, non-empty), year (required, 4-digit integer, 1900–current year + 1), type picker (required), initial odometer (required, ≥ 0, ≤ 10,000,000). Submitting creates the vehicle and appends the initial reading to `odometer_readings`.

**Edit mode fields:** name, year, type picker only. The odometer field is absent — odometer updates are done via the "Update Odometer" button on Vehicle Detail.

Reached from the dashboard "+ Add Vehicle" card or a card's overflow Edit action.

### Add/Edit Maintenance Item Modal
Fields: name (required, non-empty), interval months (optional integer ≥ 1), interval km (optional integer ≥ 1), notes (optional). At least one interval field must be filled — inline error if both are empty on submit.

Reached from Vehicle Detail via "+ Add Item" or a row's overflow Edit action.

### Delete Flows
- **Delete maintenance item:** Confirmation dialog warns all service history will also be deleted (cascade). Hard delete.
- **Delete vehicle:** Not in scope for v1 — use Archive instead. If a user needs to reset a vehicle's odometer (e.g. instrument cluster replacement), the supported path is to archive the old vehicle and add a new one.
- **Delete service record:** Not in scope for v1.

### Settings Screen
Accessible from the tray right-click menu or a nav icon in the app window. Contains: Export data, Import data, notification preferences (enable/disable). Due-soon thresholds (30 days / 500 km) are not user-configurable in v1.

---

## 4. Export / Import

### Export
Triggered from Settings. Two formats offered side by side:
- **JSON** — single file, all data (vehicles, maintenance items, service records, odometer readings)
- **CSV** — one file per table, delivered as a zip

File saved to a user-chosen location via OS file picker. Write failures surface as a dismissible error dialog. Exported JSON includes a `schema_version` field.

### Import
- Accepts JSON format only — the import file picker filters to `.json` files, and the UI label makes this clear
- Selecting a non-JSON file (e.g. a CSV zip) shows an immediate error: "Only JSON exports can be imported. Use the JSON export option to create a compatible file."
- OS file picker to select file
- Validates structure; parse failures display the specific error before any confirmation step
- Presents summary: "X vehicles, Y maintenance items, Z service records found"
- If conflicts exist (same name + year), a single batch-resolution screen lists all conflicting vehicles in a table with a per-row Merge / Skip toggle, before the user confirms the full import
  - If multiple local vehicles share the same name + year, only the first local match is used as the merge target — this edge case is out of scope for v1
  - **Merge:** all maintenance items and service records from the imported vehicle are appended to the existing vehicle. Duplicate item names are not de-duplicated — user is responsible for cleanup.
  - **Skip:** the vehicle and all its children are dropped. No orphaned records are created.
- User confirms before any data is written
- Import rejects files from future schema versions with a clear error message

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Desktop shell | Tauri |
| Frontend framework | React |
| State management | Zustand |
| Database | SQLite via sqlx (async, migrations) |
| Notifications | Tauri notification plugin |
| System tray | Tauri tray plugin |
