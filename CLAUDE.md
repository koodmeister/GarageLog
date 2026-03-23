# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

GarageLog — a Tauri 2 desktop app for tracking vehicle maintenance. Tracks multiple vehicles, recurring maintenance items with time/mileage intervals, service history, and fires OS notifications when items are overdue or due soon.

Full design spec: `docs/superpowers/specs/2026-03-22-garagelog-design.md`
Implementation plan: `docs/superpowers/plans/2026-03-22-garagelog.md`

## Commands

```bash
# Frontend dev server only (port 1420)
npm run dev

# Full app (Rust + React) in dev mode
npm run tauri dev

# Frontend build
npm run build

# Rust build only
cd src-tauri && cargo build

# Rust tests only
cd src-tauri && cargo test

# Frontend tests (Vitest)
npm test

# Run a single frontend test file
npx vitest run src/stores/vehicles.test.ts

# Production build
npm run tauri build
```

## Architecture

Two-layer split: all data lives in Rust, React only renders and calls commands.

**Rust (`src-tauri/src/`)** — sole owner of SQLite. Exposes async Tauri commands to the frontend. Background task fires OS notifications every hour and at startup.

**React (`src/`)** — calls `invoke()` wrappers in `src/lib/commands.ts`. State managed by focused Zustand stores (`src/stores/`). Never touches SQLite directly.

**Data flow:** React action → `commands.ts` typed invoke → Tauri command → sqlx → SQLite → response → Zustand store update → re-render.

**Database** — SQLite in Tauri's app data dir. Migrations run automatically via `sqlx::migrate!()` on startup from `src-tauri/migrations/`. Four tables: `vehicles`, `maintenance_items`, `service_records`, `odometer_readings`.

**Status computation** — overdue/due-soon/ok is computed at query time in Rust (`src-tauri/src/status.rs`), never stored. Due-soon threshold: 30 days or 500 km.

**Notifications** — one per overdue/due-soon item. In-memory `HashMap<item_id, last_notified_at>` prevents re-notify within 24h. Archived vehicles are excluded.

## Key Conventions

- All DATETIME values stored as UTC.
- `vehicles.current_odometer` always mirrors the latest `odometer_readings` entry — update both atomically.
- Service log entries that exceed `current_odometer` implicitly append an odometer reading with `recorded_at` = midnight UTC of `serviced_at`.
- Status computation uses `maintenance_items.created_at` as baseline when no service records exist.
- `(name, year)` uniqueness on vehicles is a soft heuristic for import deduplication only — not enforced by DB constraint.
- Tauri command errors surface as dismissible toast notifications. Controls are disabled while commands are in-flight.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 |
| Frontend | React 19, TypeScript, Vite |
| State | Zustand |
| Database | SQLite via sqlx (async, migrations) |
| Notifications | tauri-plugin-notification |
| Testing (frontend) | Vitest + @testing-library/react |
| Testing (Rust) | `#[cfg(test)]` with in-memory SQLite |
