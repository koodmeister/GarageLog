use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use crate::models::now_utc;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct ServiceRecord {
    pub id: i64,
    pub maintenance_item_id: i64,
    pub serviced_at: String,
    pub odometer_at_service: Option<i64>,
    pub cost: Option<f64>,
    pub shop: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum LogServiceResult {
    Logged { record: ServiceRecord },
    BelowCurrentAdvisory { record: ServiceRecord },
    LargeJumpWarning { km_above_current: i64 },
}

// ---------------------------------------------------------------------------
// Helper: map a row to a ServiceRecord
// ---------------------------------------------------------------------------

fn row_to_service_record(row: sqlx::sqlite::SqliteRow) -> ServiceRecord {
    ServiceRecord {
        id: row.get("id"),
        maintenance_item_id: row.get("maintenance_item_id"),
        serviced_at: row.get("serviced_at"),
        odometer_at_service: row.get("odometer_at_service"),
        cost: row.get("cost"),
        shop: row.get("shop"),
        notes: row.get("notes"),
    }
}

// ---------------------------------------------------------------------------
// Inner functions
// ---------------------------------------------------------------------------

pub async fn log_service_inner(
    pool: &SqlitePool,
    maintenance_item_id: i64,
    serviced_at: String,
    odometer_at_service: Option<i64>,
    cost: Option<f64>,
    shop: Option<String>,
    notes: Option<String>,
    force: bool,
) -> Result<LogServiceResult, String> {
    // Fetch the vehicle's current_odometer via maintenance_items → vehicles join.
    let vehicle_row = sqlx::query(
        "SELECT v.current_odometer FROM maintenance_items mi \
         JOIN vehicles v ON mi.vehicle_id = v.id \
         WHERE mi.id = ?",
    )
    .bind(maintenance_item_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("maintenance item with id {} not found", maintenance_item_id))?;

    let current_odometer: i64 = vehicle_row.get("current_odometer");

    let serviced_at_stored = format!("{}T00:00:00.000Z", serviced_at);

    match odometer_at_service {
        Some(odo) => {
            let jump = odo - current_odometer;

            // Large jump guard: more than 10 000 km above current, force not set.
            if jump > 10_000 && !force {
                return Ok(LogServiceResult::LargeJumpWarning {
                    km_above_current: jump,
                });
            }

            if odo > current_odometer {
                // Odometer is advancing — full write inside a transaction.
                let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

                let result = sqlx::query(
                    "INSERT INTO service_records \
                     (maintenance_item_id, serviced_at, odometer_at_service, cost, shop, notes) \
                     VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
                )
                .bind(maintenance_item_id)
                .bind(&serviced_at_stored)
                .bind(odo)
                .bind(cost)
                .bind(&shop)
                .bind(&notes)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                let record_id: i64 = result.get("id");

                let recorded_at = format!("{}T00:00:00.000Z", serviced_at);
                let updated_at = now_utc();

                // Determine vehicle_id for odometer_readings insert.
                let vehicle_id_row = sqlx::query(
                    "SELECT vehicle_id FROM maintenance_items WHERE id = ?",
                )
                .bind(maintenance_item_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
                let vehicle_id: i64 = vehicle_id_row.get("vehicle_id");

                sqlx::query(
                    "INSERT INTO odometer_readings (vehicle_id, reading, recorded_at) \
                     VALUES (?, ?, ?)",
                )
                .bind(vehicle_id)
                .bind(odo)
                .bind(&recorded_at)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                sqlx::query(
                    "UPDATE vehicles SET current_odometer = ?, odometer_updated_at = ? \
                     WHERE id = ?",
                )
                .bind(odo)
                .bind(&updated_at)
                .bind(vehicle_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                tx.commit().await.map_err(|e| e.to_string())?;

                // Fetch the inserted record to return.
                let record_row = sqlx::query(
                    "SELECT id, maintenance_item_id, serviced_at, odometer_at_service, \
                     cost, shop, notes FROM service_records WHERE id = ?",
                )
                .bind(record_id)
                .fetch_one(pool)
                .await
                .map_err(|e| e.to_string())?;

                Ok(LogServiceResult::Logged {
                    record: row_to_service_record(record_row),
                })
            } else {
                // Odometer at or below current — insert service record only.
                let result = sqlx::query(
                    "INSERT INTO service_records \
                     (maintenance_item_id, serviced_at, odometer_at_service, cost, shop, notes) \
                     VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
                )
                .bind(maintenance_item_id)
                .bind(&serviced_at_stored)
                .bind(odo)
                .bind(cost)
                .bind(&shop)
                .bind(&notes)
                .fetch_one(pool)
                .await
                .map_err(|e| e.to_string())?;

                let record_id: i64 = result.get("id");

                let record_row = sqlx::query(
                    "SELECT id, maintenance_item_id, serviced_at, odometer_at_service, \
                     cost, shop, notes FROM service_records WHERE id = ?",
                )
                .bind(record_id)
                .fetch_one(pool)
                .await
                .map_err(|e| e.to_string())?;

                Ok(LogServiceResult::BelowCurrentAdvisory {
                    record: row_to_service_record(record_row),
                })
            }
        }
        None => {
            // No odometer provided — insert service record only.
            let result = sqlx::query(
                "INSERT INTO service_records \
                 (maintenance_item_id, serviced_at, odometer_at_service, cost, shop, notes) \
                 VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
            )
            .bind(maintenance_item_id)
            .bind(&serviced_at_stored)
            .bind(None::<i64>)
            .bind(cost)
            .bind(&shop)
            .bind(&notes)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

            let record_id: i64 = result.get("id");

            let record_row = sqlx::query(
                "SELECT id, maintenance_item_id, serviced_at, odometer_at_service, \
                 cost, shop, notes FROM service_records WHERE id = ?",
            )
            .bind(record_id)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

            Ok(LogServiceResult::Logged {
                record: row_to_service_record(record_row),
            })
        }
    }
}

pub async fn get_service_history_inner(
    pool: &SqlitePool,
    maintenance_item_id: i64,
) -> Result<Vec<ServiceRecord>, String> {
    let rows = sqlx::query(
        "SELECT id, maintenance_item_id, serviced_at, odometer_at_service, cost, shop, notes \
         FROM service_records \
         WHERE maintenance_item_id = ? \
         ORDER BY serviced_at DESC",
    )
    .bind(maintenance_item_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(row_to_service_record).collect())
}

// ---------------------------------------------------------------------------
// Tauri commands — thin wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn log_service(
    pool: tauri::State<'_, SqlitePool>,
    maintenance_item_id: i64,
    serviced_at: String,
    odometer_at_service: Option<i64>,
    cost: Option<f64>,
    shop: Option<String>,
    notes: Option<String>,
    force: bool,
) -> Result<LogServiceResult, String> {
    log_service_inner(
        &pool,
        maintenance_item_id,
        serviced_at,
        odometer_at_service,
        cost,
        shop,
        notes,
        force,
    )
    .await
}

#[tauri::command]
pub async fn get_service_history(
    pool: tauri::State<'_, SqlitePool>,
    maintenance_item_id: i64,
) -> Result<Vec<ServiceRecord>, String> {
    get_service_history_inner(&pool, maintenance_item_id).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            "CREATE TABLE vehicles (
                id INTEGER PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                year INTEGER NOT NULL,
                type TEXT NOT NULL,
                current_odometer INTEGER NOT NULL,
                odometer_updated_at DATETIME NOT NULL,
                archived BOOLEAN NOT NULL DEFAULT 0,
                archived_at DATETIME,
                created_at DATETIME NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE maintenance_items (
                id INTEGER PRIMARY KEY NOT NULL,
                vehicle_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                interval_months INTEGER,
                interval_km INTEGER,
                notes TEXT,
                created_at DATETIME NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE service_records (
                id INTEGER PRIMARY KEY NOT NULL,
                maintenance_item_id INTEGER NOT NULL,
                serviced_at DATETIME NOT NULL,
                odometer_at_service INTEGER,
                cost REAL,
                shop TEXT,
                notes TEXT
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE odometer_readings (
                id INTEGER PRIMARY KEY NOT NULL,
                vehicle_id INTEGER NOT NULL,
                reading INTEGER NOT NULL,
                recorded_at DATETIME NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    async fn insert_vehicle(pool: &SqlitePool, current_odometer: i64) -> i64 {
        let now = now_utc();
        let row = sqlx::query(
            "INSERT INTO vehicles \
             (name, year, type, current_odometer, odometer_updated_at, archived, created_at) \
             VALUES ('Test Vehicle', 2020, 'car', ?, ?, 0, ?) RETURNING id",
        )
        .bind(current_odometer)
        .bind(&now)
        .bind(&now)
        .fetch_one(pool)
        .await
        .unwrap();
        row.get("id")
    }

    async fn insert_maintenance_item(pool: &SqlitePool, vehicle_id: i64) -> i64 {
        let now = now_utc();
        let row = sqlx::query(
            "INSERT INTO maintenance_items \
             (vehicle_id, name, interval_months, interval_km, notes, created_at) \
             VALUES (?, 'Oil Change', 6, 8000, NULL, ?) RETURNING id",
        )
        .bind(vehicle_id)
        .bind(&now)
        .fetch_one(pool)
        .await
        .unwrap();
        row.get("id")
    }

    // -------------------------------------------------------------------------
    // Test 1: log_service with no odometer → Logged, no odometer_readings row
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_log_service_no_odometer_logged() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;
        let item_id = insert_maintenance_item(&pool, vehicle_id).await;

        let result = log_service_inner(
            &pool,
            item_id,
            "2026-03-23".to_string(),
            None,
            Some(45.00),
            Some("Jiffy Lube".to_string()),
            None,
            false,
        )
        .await
        .unwrap();

        match result {
            LogServiceResult::Logged { record } => {
                assert_eq!(record.maintenance_item_id, item_id);
                assert_eq!(record.serviced_at, "2026-03-23T00:00:00.000Z");
                assert!(record.odometer_at_service.is_none());
                assert_eq!(record.cost, Some(45.00));
                assert_eq!(record.shop, Some("Jiffy Lube".to_string()));
            }
            other => panic!("expected Logged, got {:?}", other),
        }

        // No odometer_readings row should have been created.
        let count: i64 =
            sqlx::query("SELECT COUNT(*) as cnt FROM odometer_readings WHERE vehicle_id = ?")
                .bind(vehicle_id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("cnt"))
                .unwrap();
        assert_eq!(count, 0, "no odometer_readings row should exist");

        // Vehicle odometer unchanged.
        let odo: i64 = sqlx::query("SELECT current_odometer FROM vehicles WHERE id = ?")
            .bind(vehicle_id)
            .fetch_one(&pool)
            .await
            .map(|r| r.get("current_odometer"))
            .unwrap();
        assert_eq!(odo, 50_000);
    }

    // -------------------------------------------------------------------------
    // Test 2: log_service with odometer > current → Logged, odometer updated
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_log_service_odometer_above_current_updates_vehicle() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;
        let item_id = insert_maintenance_item(&pool, vehicle_id).await;

        let result = log_service_inner(
            &pool,
            item_id,
            "2026-03-23".to_string(),
            Some(51_000),
            None,
            None,
            None,
            false,
        )
        .await
        .unwrap();

        match result {
            LogServiceResult::Logged { record } => {
                assert_eq!(record.odometer_at_service, Some(51_000));
            }
            other => panic!("expected Logged, got {:?}", other),
        }

        // odometer_readings row created.
        let count: i64 = sqlx::query(
            "SELECT COUNT(*) as cnt FROM odometer_readings WHERE vehicle_id = ? AND reading = 51000",
        )
        .bind(vehicle_id)
        .fetch_one(&pool)
        .await
        .map(|r| r.get("cnt"))
        .unwrap();
        assert_eq!(count, 1, "odometer_readings row should exist");

        // Vehicle odometer updated.
        let odo: i64 = sqlx::query("SELECT current_odometer FROM vehicles WHERE id = ?")
            .bind(vehicle_id)
            .fetch_one(&pool)
            .await
            .map(|r| r.get("current_odometer"))
            .unwrap();
        assert_eq!(odo, 51_000);
    }

    // -------------------------------------------------------------------------
    // Test 3: log_service with odometer < current → BelowCurrentAdvisory, no update
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_log_service_odometer_below_current_advisory() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;
        let item_id = insert_maintenance_item(&pool, vehicle_id).await;

        let result = log_service_inner(
            &pool,
            item_id,
            "2026-01-01".to_string(),
            Some(48_000),
            None,
            None,
            None,
            false,
        )
        .await
        .unwrap();

        match result {
            LogServiceResult::BelowCurrentAdvisory { record } => {
                assert_eq!(record.odometer_at_service, Some(48_000));
            }
            other => panic!("expected BelowCurrentAdvisory, got {:?}", other),
        }

        // No odometer_readings row.
        let count: i64 =
            sqlx::query("SELECT COUNT(*) as cnt FROM odometer_readings WHERE vehicle_id = ?")
                .bind(vehicle_id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("cnt"))
                .unwrap();
        assert_eq!(count, 0, "no odometer_readings row should exist");

        // Vehicle odometer unchanged.
        let odo: i64 = sqlx::query("SELECT current_odometer FROM vehicles WHERE id = ?")
            .bind(vehicle_id)
            .fetch_one(&pool)
            .await
            .map(|r| r.get("current_odometer"))
            .unwrap();
        assert_eq!(odo, 50_000);
    }

    // -------------------------------------------------------------------------
    // Test 4: large jump without force → LargeJumpWarning, nothing inserted
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_log_service_large_jump_without_force_returns_warning() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;
        let item_id = insert_maintenance_item(&pool, vehicle_id).await;

        let result = log_service_inner(
            &pool,
            item_id,
            "2026-03-23".to_string(),
            Some(61_000),
            None,
            None,
            None,
            false,
        )
        .await
        .unwrap();

        match result {
            LogServiceResult::LargeJumpWarning { km_above_current } => {
                assert_eq!(km_above_current, 11_000);
            }
            other => panic!("expected LargeJumpWarning, got {:?}", other),
        }

        // No service record inserted.
        let count: i64 =
            sqlx::query("SELECT COUNT(*) as cnt FROM service_records WHERE maintenance_item_id = ?")
                .bind(item_id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("cnt"))
                .unwrap();
        assert_eq!(count, 0, "no service_records row should exist");

        // No odometer update.
        let odo: i64 = sqlx::query("SELECT current_odometer FROM vehicles WHERE id = ?")
            .bind(vehicle_id)
            .fetch_one(&pool)
            .await
            .map(|r| r.get("current_odometer"))
            .unwrap();
        assert_eq!(odo, 50_000);
    }

    // -------------------------------------------------------------------------
    // Test 5: large jump + force=true → Logged, odometer updated
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_log_service_large_jump_with_force_logs_and_updates() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;
        let item_id = insert_maintenance_item(&pool, vehicle_id).await;

        let result = log_service_inner(
            &pool,
            item_id,
            "2026-03-23".to_string(),
            Some(61_000),
            None,
            None,
            None,
            true,
        )
        .await
        .unwrap();

        match result {
            LogServiceResult::Logged { record } => {
                assert_eq!(record.odometer_at_service, Some(61_000));
            }
            other => panic!("expected Logged, got {:?}", other),
        }

        // odometer_readings row created.
        let count: i64 = sqlx::query(
            "SELECT COUNT(*) as cnt FROM odometer_readings WHERE vehicle_id = ? AND reading = 61000",
        )
        .bind(vehicle_id)
        .fetch_one(&pool)
        .await
        .map(|r| r.get("cnt"))
        .unwrap();
        assert_eq!(count, 1, "odometer_readings row should exist");

        // Vehicle odometer updated.
        let odo: i64 = sqlx::query("SELECT current_odometer FROM vehicles WHERE id = ?")
            .bind(vehicle_id)
            .fetch_one(&pool)
            .await
            .map(|r| r.get("current_odometer"))
            .unwrap();
        assert_eq!(odo, 61_000);
    }

    // -------------------------------------------------------------------------
    // Test 6: get_service_history returns records newest first
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_get_service_history_newest_first() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 70_000).await;
        let item_id = insert_maintenance_item(&pool, vehicle_id).await;

        // Insert three service records with different dates.
        for (date, odo) in [
            ("2025-01-01", 50_000_i64),
            ("2025-06-15", 55_000_i64),
            ("2026-01-10", 60_000_i64),
        ] {
            sqlx::query(
                "INSERT INTO service_records \
                 (maintenance_item_id, serviced_at, odometer_at_service) \
                 VALUES (?, ?, ?)",
            )
            .bind(item_id)
            .bind(format!("{}T00:00:00.000Z", date))
            .bind(odo)
            .execute(&pool)
            .await
            .unwrap();
        }

        let records = get_service_history_inner(&pool, item_id).await.unwrap();

        assert_eq!(records.len(), 3);
        // Newest first.
        assert_eq!(records[0].serviced_at, "2026-01-10T00:00:00.000Z");
        assert_eq!(records[1].serviced_at, "2025-06-15T00:00:00.000Z");
        assert_eq!(records[2].serviced_at, "2025-01-01T00:00:00.000Z");
    }
}
