use std::collections::HashMap;
use std::sync::Mutex;

use chrono::{DateTime, Months, NaiveDate, Utc};
use sqlx::{Row, SqlitePool};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::status::{compute_status, MaintenanceStatus};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct NotificationState {
    pub last_notified: Mutex<HashMap<i64, DateTime<Utc>>>,
}

impl NotificationState {
    pub fn new() -> Self {
        Self {
            last_notified: Mutex::new(HashMap::new()),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers for computing remaining days / km (used in notification body)
// ---------------------------------------------------------------------------

fn parse_date(s: &str) -> Option<NaiveDate> {
    if let Ok(dt) = s.parse::<DateTime<Utc>>() {
        return Some(dt.date_naive());
    }
    if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.3fZ") {
        return Some(ndt.date());
    }
    None
}

/// Returns remaining days until the time-based service is due.
/// Positive = future, negative = overdue.
fn days_remaining(
    interval_months: i64,
    last_serviced_at: Option<&str>,
    item_created_at: &str,
) -> Option<i64> {
    let baseline_str = last_serviced_at.unwrap_or(item_created_at);
    let baseline = parse_date(baseline_str)?;
    let next_due = baseline.checked_add_months(Months::new(interval_months as u32))?;
    let today = Utc::now().date_naive();
    Some((next_due - today).num_days())
}

/// Returns remaining km until the km-based service is due.
/// Positive = not yet due, negative = overdue.
fn km_remaining(
    interval_km: i64,
    last_odometer_at_service: Option<i64>,
    current_odometer: i64,
) -> Option<i64> {
    let baseline_km = last_odometer_at_service?;
    let next_due_km = baseline_km + interval_km;
    Some(next_due_km - current_odometer)
}

// ---------------------------------------------------------------------------
// Build notification body
// ---------------------------------------------------------------------------

fn build_body(
    vehicle_name: &str,
    item_name: &str,
    status: &MaintenanceStatus,
    interval_months: Option<i64>,
    interval_km: Option<i64>,
    last_serviced_at: Option<&str>,
    last_odometer_at_service: Option<i64>,
    current_odometer: i64,
    item_created_at: &str,
) -> String {
    match status {
        MaintenanceStatus::Overdue => {
            format!("{vehicle_name} \u{2014} {item_name} is overdue")
        }
        MaintenanceStatus::DueSoon => {
            let days = interval_months
                .and_then(|m| days_remaining(m, last_serviced_at, item_created_at))
                .filter(|&d| d >= 0 && d <= 30);

            let km = interval_km
                .and_then(|k| km_remaining(k, last_odometer_at_service, current_odometer))
                .filter(|&k| k >= 0 && k <= 500);

            let suffix = match (days, km) {
                (Some(d), Some(k)) => format!("due in {d} days / {k} km"),
                (Some(d), None) => format!("due in {d} days"),
                (None, Some(k)) => format!("due in {k} km"),
                // Fallback: at least one interval must have triggered DueSoon
                (None, None) => "due soon".to_string(),
            };

            format!("{vehicle_name} \u{2014} {item_name} {suffix}")
        }
        // Ok / Unknown should never reach here, but handle gracefully
        _ => format!("{vehicle_name} \u{2014} {item_name} needs attention"),
    }
}

// ---------------------------------------------------------------------------
// Core check
// ---------------------------------------------------------------------------

/// Run the notification check once. Called at startup and every hour.
pub async fn run_check(pool: &SqlitePool, app: &AppHandle, state: &NotificationState) {
    // 1. Fetch all non-archived vehicles.
    let vehicles = match sqlx::query(
        "SELECT id, name, current_odometer FROM vehicles WHERE archived = 0",
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            eprintln!("[notifications] failed to query vehicles: {e}");
            return;
        }
    };

    let now = Utc::now();

    for vehicle_row in &vehicles {
        let vehicle_id: i64 = vehicle_row.get("id");
        let vehicle_name: String = vehicle_row.get("name");
        let current_odometer: i64 = vehicle_row.get("current_odometer");

        // 2. Fetch maintenance items with most-recent service record for this vehicle.
        let items = match sqlx::query(
            "SELECT mi.id, mi.name, mi.interval_months, mi.interval_km, mi.created_at, \
                    sr.serviced_at, sr.odometer_at_service \
             FROM maintenance_items mi \
             LEFT JOIN ( \
                 SELECT maintenance_item_id, serviced_at, odometer_at_service \
                 FROM service_records \
                 WHERE id IN ( \
                     SELECT MAX(id) FROM service_records GROUP BY maintenance_item_id \
                 ) \
             ) sr ON sr.maintenance_item_id = mi.id \
             WHERE mi.vehicle_id = ?",
        )
        .bind(vehicle_id)
        .fetch_all(pool)
        .await
        {
            Ok(rows) => rows,
            Err(e) => {
                eprintln!(
                    "[notifications] failed to query items for vehicle {vehicle_id}: {e}"
                );
                continue;
            }
        };

        for item_row in &items {
            let item_id: i64 = item_row.get("id");
            let item_name: String = item_row.get("name");
            let interval_months: Option<i64> = item_row.get("interval_months");
            let interval_km: Option<i64> = item_row.get("interval_km");
            let item_created_at: String = item_row.get("created_at");
            let last_serviced_at: Option<String> = item_row.get("serviced_at");
            let last_odometer_at_service: Option<i64> = item_row.get("odometer_at_service");

            // 3. Compute status.
            let status = compute_status(
                interval_months,
                interval_km,
                last_serviced_at.as_deref(),
                last_odometer_at_service,
                current_odometer,
                &item_created_at,
            );

            // 4. Only notify for Overdue or DueSoon.
            if status != MaintenanceStatus::Overdue && status != MaintenanceStatus::DueSoon {
                continue;
            }

            // 5. Check 24-hour cooldown.
            {
                let map = state.last_notified.lock().unwrap();
                if let Some(&last) = map.get(&item_id) {
                    if (now - last).num_hours() < 24 {
                        continue;
                    }
                }
            }

            // 6. Build and fire notification.
            let body = build_body(
                &vehicle_name,
                &item_name,
                &status,
                interval_months,
                interval_km,
                last_serviced_at.as_deref(),
                last_odometer_at_service,
                current_odometer,
                &item_created_at,
            );

            app.notification()
                .builder()
                .title("GarageLog")
                .body(&body)
                .show()
                .ok();

            // 7. Record notification time.
            {
                let mut map = state.last_notified.lock().unwrap();
                map.insert(item_id, now);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri command: trigger a check immediately
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
pub async fn check_notifications_now(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
    state: tauri::State<'_, NotificationState>,
) -> Result<(), String> {
    run_check(&pool, &app, &state).await;
    Ok(())
}
