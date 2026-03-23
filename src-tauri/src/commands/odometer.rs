use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use crate::models::{now_utc, row_to_vehicle, Vehicle};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum OdometerResult {
    Updated { vehicle: Vehicle },
    LargeJumpWarning { km_above_current: i64 },
}

// ---------------------------------------------------------------------------
// Inner function — contains the real logic, accepts &SqlitePool directly
// ---------------------------------------------------------------------------

async fn update_odometer_inner(
    pool: &SqlitePool,
    vehicle_id: i64,
    new_reading: i64,
    date: String,
    force: bool,
) -> Result<OdometerResult, String> {
    // Fetch current odometer for the vehicle.
    let row = sqlx::query("SELECT current_odometer FROM vehicles WHERE id = ?")
        .bind(vehicle_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("vehicle with id {} not found", vehicle_id))?;

    let current_odometer: i64 = row.get("current_odometer");

    // Hard block: odometer cannot go backwards.
    if new_reading < current_odometer {
        return Err("Odometer cannot go backwards.".to_string());
    }

    // Soft warning: large jump without force flag.
    let jump = new_reading - current_odometer;
    if jump > 10_000 && !force {
        return Ok(OdometerResult::LargeJumpWarning {
            km_above_current: jump,
        });
    }

    // Proceed with the write inside a transaction.
    let recorded_at = format!("{}T00:00:00.000Z", date);
    let updated_at = now_utc();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO odometer_readings (vehicle_id, reading, recorded_at) VALUES (?, ?, ?)",
    )
    .bind(vehicle_id)
    .bind(new_reading)
    .bind(&recorded_at)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let result = sqlx::query(
        "UPDATE vehicles SET current_odometer = ?, odometer_updated_at = ? WHERE id = ?",
    )
    .bind(new_reading)
    .bind(&updated_at)
    .bind(vehicle_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err(format!("vehicle with id {} not found", vehicle_id));
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // Fetch and return the updated vehicle.
    let vehicle_row = sqlx::query(
        "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
         FROM vehicles WHERE id = ?",
    )
    .bind(vehicle_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(OdometerResult::Updated {
        vehicle: row_to_vehicle(vehicle_row),
    })
}

// ---------------------------------------------------------------------------
// Tauri command — thin wrapper around the inner function
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
pub async fn update_odometer(
    pool: tauri::State<'_, SqlitePool>,
    vehicle_id: i64,
    new_reading: i64,
    date: String,
    force: bool,
) -> Result<OdometerResult, String> {
    update_odometer_inner(&pool, vehicle_id, new_reading, date, force).await
}

// ---------------------------------------------------------------------------
// Tests — call inner function directly
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

    /// Helper: insert a vehicle with a given odometer and return its id.
    async fn insert_vehicle(pool: &SqlitePool, odometer: i64) -> i64 {
        let now = now_utc();
        let row = sqlx::query(
            "INSERT INTO vehicles (name, year, type, current_odometer, odometer_updated_at, archived, created_at) \
             VALUES ('Test Vehicle', 2020, 'car', ?, ?, 0, ?) RETURNING id",
        )
        .bind(odometer)
        .bind(&now)
        .bind(&now)
        .fetch_one(pool)
        .await
        .unwrap();
        row.get("id")
    }

    // -------------------------------------------------------------------------
    // Test 1: Normal update — new_reading >= current → writes to both tables,
    //         returns Updated with the new odometer value.
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_normal_update_writes_and_returns_updated() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;

        let result =
            update_odometer_inner(&pool, vehicle_id, 51_000, "2026-03-23".into(), false)
                .await
                .unwrap();

        match result {
            OdometerResult::Updated { vehicle } => {
                assert_eq!(vehicle.current_odometer, 51_000);
                assert_eq!(vehicle.id, vehicle_id);
            }
            other => panic!("expected Updated, got {:?}", other),
        }

        // Verify odometer_readings row was inserted.
        let count: i64 = sqlx::query(
            "SELECT COUNT(*) as cnt FROM odometer_readings WHERE vehicle_id = ? AND reading = 51000",
        )
        .bind(vehicle_id)
        .fetch_one(&pool)
        .await
        .map(|r| r.get("cnt"))
        .unwrap();
        assert_eq!(count, 1, "odometer_readings row should exist");

        // Verify vehicles table was updated.
        let db_reading: i64 =
            sqlx::query("SELECT current_odometer FROM vehicles WHERE id = ?")
                .bind(vehicle_id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("current_odometer"))
                .unwrap();
        assert_eq!(db_reading, 51_000);
    }

    // -------------------------------------------------------------------------
    // Test 2: Backwards — new_reading < current → returns Err, no DB writes.
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_backwards_reading_returns_err() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;

        let err =
            update_odometer_inner(&pool, vehicle_id, 49_999, "2026-03-23".into(), false)
                .await
                .unwrap_err();

        assert_eq!(err, "Odometer cannot go backwards.");

        // No new odometer_readings rows should have been inserted.
        let count: i64 =
            sqlx::query("SELECT COUNT(*) as cnt FROM odometer_readings WHERE vehicle_id = ?")
                .bind(vehicle_id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("cnt"))
                .unwrap();
        assert_eq!(count, 0, "no odometer_readings rows should exist");
    }

    // -------------------------------------------------------------------------
    // Test 3: Large jump without force → returns LargeJumpWarning, no DB writes.
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_large_jump_without_force_returns_warning() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;

        let result =
            update_odometer_inner(&pool, vehicle_id, 61_000, "2026-03-23".into(), false)
                .await
                .unwrap();

        match result {
            OdometerResult::LargeJumpWarning { km_above_current } => {
                assert_eq!(km_above_current, 11_000);
            }
            other => panic!("expected LargeJumpWarning, got {:?}", other),
        }

        // No writes should have been performed.
        let count: i64 =
            sqlx::query("SELECT COUNT(*) as cnt FROM odometer_readings WHERE vehicle_id = ?")
                .bind(vehicle_id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("cnt"))
                .unwrap();
        assert_eq!(count, 0, "no odometer_readings rows should exist");

        let db_reading: i64 =
            sqlx::query("SELECT current_odometer FROM vehicles WHERE id = ?")
                .bind(vehicle_id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("current_odometer"))
                .unwrap();
        assert_eq!(db_reading, 50_000, "vehicle odometer should be unchanged");
    }

    // -------------------------------------------------------------------------
    // Test 4: Large jump with force=true → writes succeed, returns Updated.
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_large_jump_with_force_writes_and_returns_updated() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;

        let result =
            update_odometer_inner(&pool, vehicle_id, 61_000, "2026-03-23".into(), true)
                .await
                .unwrap();

        match result {
            OdometerResult::Updated { vehicle } => {
                assert_eq!(vehicle.current_odometer, 61_000);
            }
            other => panic!("expected Updated, got {:?}", other),
        }

        let count: i64 = sqlx::query(
            "SELECT COUNT(*) as cnt FROM odometer_readings WHERE vehicle_id = ? AND reading = 61000",
        )
        .bind(vehicle_id)
        .fetch_one(&pool)
        .await
        .map(|r| r.get("cnt"))
        .unwrap();
        assert_eq!(count, 1, "odometer_readings row should exist");
    }
}
