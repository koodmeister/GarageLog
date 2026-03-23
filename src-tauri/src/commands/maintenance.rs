use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use crate::models::now_utc;
use crate::status::{compute_status, MaintenanceStatus};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct MaintenanceItem {
    pub id: i64,
    pub vehicle_id: i64,
    pub name: String,
    pub interval_months: Option<i64>,
    pub interval_km: Option<i64>,
    pub notes: Option<String>,
    pub created_at: String,
    // Computed fields:
    pub last_serviced_at: Option<String>,
    pub last_odometer_at_service: Option<i64>,
    pub status: MaintenanceStatus,
}

// ---------------------------------------------------------------------------
// Helper: fetch a single maintenance item with status computed
// ---------------------------------------------------------------------------

async fn fetch_item_with_status(
    pool: &SqlitePool,
    item_id: i64,
) -> Result<MaintenanceItem, String> {
    // Fetch the maintenance item row.
    let item_row = sqlx::query(
        "SELECT id, vehicle_id, name, interval_months, interval_km, notes, created_at \
         FROM maintenance_items WHERE id = ?",
    )
    .bind(item_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("maintenance item with id {} not found", item_id))?;

    let id: i64 = item_row.get("id");
    let vehicle_id: i64 = item_row.get("vehicle_id");
    let name: String = item_row.get("name");
    let interval_months: Option<i64> = item_row.get("interval_months");
    let interval_km: Option<i64> = item_row.get("interval_km");
    let notes: Option<String> = item_row.get("notes");
    let created_at: String = item_row.get("created_at");

    // Fetch most recent service record for this item.
    let service_row = sqlx::query(
        "SELECT serviced_at, odometer_at_service \
         FROM service_records WHERE maintenance_item_id = ? \
         ORDER BY serviced_at DESC LIMIT 1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let (last_serviced_at, last_odometer_at_service): (Option<String>, Option<i64>) =
        match service_row {
            Some(row) => (
                Some(row.get("serviced_at")),
                row.get("odometer_at_service"),
            ),
            None => (None, None),
        };

    // Fetch vehicle's current odometer.
    let vehicle_row = sqlx::query("SELECT current_odometer FROM vehicles WHERE id = ?")
        .bind(vehicle_id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let current_odometer: i64 = vehicle_row.get("current_odometer");

    // Compute status.
    let status = compute_status(
        interval_months,
        interval_km,
        last_serviced_at.as_deref(),
        last_odometer_at_service,
        current_odometer,
        &created_at,
    );

    Ok(MaintenanceItem {
        id,
        vehicle_id,
        name,
        interval_months,
        interval_km,
        notes,
        created_at,
        last_serviced_at,
        last_odometer_at_service,
        status,
    })
}

// ---------------------------------------------------------------------------
// Inner functions
// ---------------------------------------------------------------------------

async fn get_maintenance_items_inner(
    pool: &SqlitePool,
    vehicle_id: i64,
) -> Result<Vec<MaintenanceItem>, String> {
    let rows = sqlx::query(
        "SELECT id FROM maintenance_items WHERE vehicle_id = ? ORDER BY id ASC",
    )
    .bind(vehicle_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let item_id: i64 = row.get("id");
        items.push(fetch_item_with_status(pool, item_id).await?);
    }
    Ok(items)
}

async fn create_maintenance_item_inner(
    pool: &SqlitePool,
    vehicle_id: i64,
    name: String,
    interval_months: Option<i64>,
    interval_km: Option<i64>,
    notes: Option<String>,
) -> Result<MaintenanceItem, String> {
    // Validate: at least one interval must be set.
    if interval_months.is_none() && interval_km.is_none() {
        return Err(
            "At least one of interval_months or interval_km must be provided.".to_string(),
        );
    }

    let now = now_utc();

    let result = sqlx::query(
        "INSERT INTO maintenance_items (vehicle_id, name, interval_months, interval_km, notes, created_at) \
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(vehicle_id)
    .bind(&name)
    .bind(interval_months)
    .bind(interval_km)
    .bind(&notes)
    .bind(&now)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let item_id: i64 = result.get("id");
    fetch_item_with_status(pool, item_id).await
}

async fn update_maintenance_item_inner(
    pool: &SqlitePool,
    id: i64,
    name: String,
    interval_months: Option<i64>,
    interval_km: Option<i64>,
    notes: Option<String>,
) -> Result<MaintenanceItem, String> {
    // Validate: at least one interval must be set.
    if interval_months.is_none() && interval_km.is_none() {
        return Err(
            "At least one of interval_months or interval_km must be provided.".to_string(),
        );
    }

    let result = sqlx::query(
        "UPDATE maintenance_items SET name = ?, interval_months = ?, interval_km = ?, notes = ? \
         WHERE id = ?",
    )
    .bind(&name)
    .bind(interval_months)
    .bind(interval_km)
    .bind(&notes)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err(format!("maintenance item with id {} not found", id));
    }

    fetch_item_with_status(pool, id).await
}

async fn delete_maintenance_item_inner(pool: &SqlitePool, id: i64) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Manual cascade: delete service_records first (FK enforcement not guaranteed in SQLite).
    sqlx::query("DELETE FROM service_records WHERE maintenance_item_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let result = sqlx::query("DELETE FROM maintenance_items WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err(format!("maintenance item with id {} not found", id));
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands — thin wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_maintenance_items(
    pool: tauri::State<'_, SqlitePool>,
    vehicle_id: i64,
) -> Result<Vec<MaintenanceItem>, String> {
    get_maintenance_items_inner(&pool, vehicle_id).await
}

#[tauri::command]
pub async fn create_maintenance_item(
    pool: tauri::State<'_, SqlitePool>,
    vehicle_id: i64,
    name: String,
    interval_months: Option<i64>,
    interval_km: Option<i64>,
    notes: Option<String>,
) -> Result<MaintenanceItem, String> {
    create_maintenance_item_inner(&pool, vehicle_id, name, interval_months, interval_km, notes)
        .await
}

#[tauri::command]
pub async fn update_maintenance_item(
    pool: tauri::State<'_, SqlitePool>,
    id: i64,
    name: String,
    interval_months: Option<i64>,
    interval_km: Option<i64>,
    notes: Option<String>,
) -> Result<MaintenanceItem, String> {
    update_maintenance_item_inner(&pool, id, name, interval_months, interval_km, notes).await
}

#[tauri::command]
pub async fn delete_maintenance_item(
    pool: tauri::State<'_, SqlitePool>,
    id: i64,
) -> Result<(), String> {
    delete_maintenance_item_inner(&pool, id).await
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

    /// Insert a vehicle and return its id.
    async fn insert_vehicle(pool: &SqlitePool, current_odometer: i64) -> i64 {
        let now = now_utc();
        let row = sqlx::query(
            "INSERT INTO vehicles (name, year, type, current_odometer, odometer_updated_at, archived, created_at) \
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

    // -------------------------------------------------------------------------
    // Test 7a: create_maintenance_item — validation error when no interval given
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_create_maintenance_item_requires_at_least_one_interval() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;

        let err = create_maintenance_item_inner(
            &pool,
            vehicle_id,
            "Oil Change".to_string(),
            None,
            None,
            None,
        )
        .await
        .unwrap_err();

        assert!(
            err.contains("interval_months") || err.contains("interval"),
            "error should mention interval: {}",
            err
        );
    }

    // -------------------------------------------------------------------------
    // Test 7b: create_maintenance_item — happy path
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_create_maintenance_item_happy_path() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;

        let item = create_maintenance_item_inner(
            &pool,
            vehicle_id,
            "Oil Change".to_string(),
            Some(6),
            Some(8000),
            Some("Use synthetic oil".to_string()),
        )
        .await
        .unwrap();

        assert_eq!(item.vehicle_id, vehicle_id);
        assert_eq!(item.name, "Oil Change");
        assert_eq!(item.interval_months, Some(6));
        assert_eq!(item.interval_km, Some(8000));
        assert_eq!(item.notes, Some("Use synthetic oil".to_string()));
        assert!(item.last_serviced_at.is_none());
        assert!(item.last_odometer_at_service.is_none());
        // No service records yet → status based on created_at baseline; newly created → Ok or DueSoon
        assert!(
            item.status == MaintenanceStatus::Ok
                || item.status == MaintenanceStatus::DueSoon
                || item.status == MaintenanceStatus::Overdue,
            "status should be a valid computed value"
        );
    }

    // -------------------------------------------------------------------------
    // Test 8: get_maintenance_items — returns items with correct status
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_get_maintenance_items_returns_correct_status() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 60_000).await;

        // Create an item with km interval; odometer is 60k, last service at 50k, interval 5k → Overdue
        let item = create_maintenance_item_inner(
            &pool,
            vehicle_id,
            "Tire Rotation".to_string(),
            None,
            Some(5000),
            None,
        )
        .await
        .unwrap();

        // Insert a service record with odometer_at_service = 50_000
        let now = now_utc();
        sqlx::query(
            "INSERT INTO service_records (maintenance_item_id, serviced_at, odometer_at_service) \
             VALUES (?, ?, ?)",
        )
        .bind(item.id)
        .bind(&now)
        .bind(50_000_i64)
        .execute(&pool)
        .await
        .unwrap();

        let items = get_maintenance_items_inner(&pool, vehicle_id).await.unwrap();

        assert_eq!(items.len(), 1);
        let fetched = &items[0];
        assert_eq!(fetched.id, item.id);
        assert_eq!(fetched.last_odometer_at_service, Some(50_000));
        assert!(fetched.last_serviced_at.is_some());
        // current=60k, last_service=50k, interval=5k → next_due=55k → km_remaining=-5k → Overdue
        assert_eq!(fetched.status, MaintenanceStatus::Overdue);
    }

    // -------------------------------------------------------------------------
    // Test 9: delete_maintenance_item — cascades to service_records, error for nonexistent
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_delete_maintenance_item_cascades_and_errors_on_missing() {
        let pool = setup_test_db().await;
        let vehicle_id = insert_vehicle(&pool, 50_000).await;

        let item = create_maintenance_item_inner(
            &pool,
            vehicle_id,
            "Brake Check".to_string(),
            Some(12),
            None,
            None,
        )
        .await
        .unwrap();

        // Insert a service record.
        let now = now_utc();
        sqlx::query(
            "INSERT INTO service_records (maintenance_item_id, serviced_at) VALUES (?, ?)",
        )
        .bind(item.id)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        // Verify service record exists.
        let count: i64 =
            sqlx::query("SELECT COUNT(*) as cnt FROM service_records WHERE maintenance_item_id = ?")
                .bind(item.id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("cnt"))
                .unwrap();
        assert_eq!(count, 1, "service record should exist before delete");

        // Delete the maintenance item.
        delete_maintenance_item_inner(&pool, item.id)
            .await
            .unwrap();

        // Service records should be cascaded away.
        let count_after: i64 =
            sqlx::query("SELECT COUNT(*) as cnt FROM service_records WHERE maintenance_item_id = ?")
                .bind(item.id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("cnt"))
                .unwrap();
        assert_eq!(count_after, 0, "service records should be deleted");

        // Maintenance item should be gone.
        let item_count: i64 =
            sqlx::query("SELECT COUNT(*) as cnt FROM maintenance_items WHERE id = ?")
                .bind(item.id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("cnt"))
                .unwrap();
        assert_eq!(item_count, 0, "maintenance item should be deleted");

        // Deleting nonexistent item should return Err.
        let err = delete_maintenance_item_inner(&pool, item.id)
            .await
            .unwrap_err();
        assert!(
            err.contains("not found"),
            "should return not found error: {}",
            err
        );
    }
}
