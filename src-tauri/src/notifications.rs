use std::collections::HashMap;
use std::sync::Mutex;

use chrono::{DateTime, Utc};
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

        // Collect all items that need a notification for this vehicle.
        let mut items_to_notify: Vec<(i64, String, MaintenanceStatus)> = Vec::new();

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

            items_to_notify.push((item_id, item_name, status));
        }

        if items_to_notify.is_empty() {
            continue;
        }

        // 6. Build a single combined notification for this vehicle.
        let overdue_count = items_to_notify
            .iter()
            .filter(|(_, _, s)| *s == MaintenanceStatus::Overdue)
            .count();
        let due_soon_count = items_to_notify.len() - overdue_count;

        let body = match (overdue_count, due_soon_count) {
            (o, 0) => format!(
                "{vehicle_name} \u{2014} {o} item{} overdue",
                if o == 1 { "" } else { "s" }
            ),
            (0, d) => format!(
                "{vehicle_name} \u{2014} {d} item{} due soon",
                if d == 1 { "" } else { "s" }
            ),
            (o, d) => format!(
                "{vehicle_name} \u{2014} {o} overdue, {d} due soon",
            ),
        };

        app.notification()
            .builder()
            .title("GarageLog")
            .body(&body)
            .show()
            .ok();

        // 7. Record notification time for all notified items.
        {
            let mut map = state.last_notified.lock().unwrap();
            for (item_id, _, _) in &items_to_notify {
                map.insert(*item_id, now);
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
