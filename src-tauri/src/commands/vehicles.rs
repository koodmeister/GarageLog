use sqlx::{Row, SqlitePool};

use crate::models::{now_utc, row_to_vehicle, Vehicle};

// ---------------------------------------------------------------------------
// Inner functions — contain the real logic, accept &SqlitePool directly
// ---------------------------------------------------------------------------

async fn get_vehicles_inner(pool: &SqlitePool) -> Result<Vec<Vehicle>, String> {
    let rows = sqlx::query(
        "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
         FROM vehicles ORDER BY archived ASC, id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(row_to_vehicle).collect())
}

async fn create_vehicle_inner(
    pool: &SqlitePool,
    name: String,
    year: i64,
    vehicle_type: String,
    initial_odometer: i64,
) -> Result<Vehicle, String> {
    let now = now_utc();

    // Begin transaction so vehicle INSERT and odometer INSERT are atomic.
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let result = sqlx::query(
        "INSERT INTO vehicles (name, year, type, current_odometer, odometer_updated_at, archived, created_at) \
         VALUES (?, ?, ?, ?, ?, 0, ?) RETURNING id",
    )
    .bind(&name)
    .bind(year)
    .bind(&vehicle_type)
    .bind(initial_odometer)
    .bind(&now)
    .bind(&now)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let vehicle_id: i64 = result.get("id");

    sqlx::query(
        "INSERT INTO odometer_readings (vehicle_id, reading, recorded_at) VALUES (?, ?, ?)",
    )
    .bind(vehicle_id)
    .bind(initial_odometer)
    .bind(&now)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    // SELECT after commit, against pool.
    let vehicle_row = sqlx::query(
        "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
         FROM vehicles WHERE id = ?",
    )
    .bind(vehicle_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row_to_vehicle(vehicle_row))
}

async fn update_vehicle_inner(
    pool: &SqlitePool,
    id: i64,
    name: String,
    year: i64,
    vehicle_type: String,
) -> Result<Vehicle, String> {
    let result = sqlx::query("UPDATE vehicles SET name = ?, year = ?, type = ? WHERE id = ?")
        .bind(&name)
        .bind(year)
        .bind(&vehicle_type)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err(format!("vehicle with id {} not found", id));
    }

    let vehicle_row = sqlx::query(
        "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
         FROM vehicles WHERE id = ?",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row_to_vehicle(vehicle_row))
}

async fn archive_vehicle_inner(pool: &SqlitePool, id: i64) -> Result<(), String> {
    let now = now_utc();
    let result = sqlx::query("UPDATE vehicles SET archived = 1, archived_at = ? WHERE id = ?")
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err(format!("vehicle with id {} not found", id));
    }

    Ok(())
}

async fn restore_vehicle_inner(pool: &SqlitePool, id: i64) -> Result<(), String> {
    let result = sqlx::query("UPDATE vehicles SET archived = 0, archived_at = NULL WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err(format!("vehicle with id {} not found", id));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands — thin wrappers around the inner functions
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
pub async fn get_vehicles(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<Vehicle>, String> {
    get_vehicles_inner(&pool).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_vehicle(
    pool: tauri::State<'_, SqlitePool>,
    name: String,
    year: i64,
    vehicle_type: String,
    initial_odometer: i64,
) -> Result<Vehicle, String> {
    create_vehicle_inner(&pool, name, year, vehicle_type, initial_odometer).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_vehicle(
    pool: tauri::State<'_, SqlitePool>,
    id: i64,
    name: String,
    year: i64,
    vehicle_type: String,
) -> Result<Vehicle, String> {
    update_vehicle_inner(&pool, id, name, year, vehicle_type).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn archive_vehicle(pool: tauri::State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    archive_vehicle_inner(&pool, id).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn restore_vehicle(pool: tauri::State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    restore_vehicle_inner(&pool, id).await
}

// ---------------------------------------------------------------------------
// Tests — call inner functions directly
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

    // -------------------------------------------------------------------------
    // Test 1: create_vehicle inserts vehicle and odometer reading
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_create_vehicle_inserts_vehicle_and_odometer_reading() {
        let pool = setup_test_db().await;

        let vehicle = create_vehicle_inner(&pool, "My Truck".into(), 2020, "truck".into(), 50000)
            .await
            .unwrap();

        assert_eq!(vehicle.name, "My Truck");
        assert_eq!(vehicle.year, 2020);
        assert_eq!(vehicle.r#type, "truck");
        assert_eq!(vehicle.current_odometer, 50000);
        assert!(!vehicle.archived);

        let o_count: i64 =
            sqlx::query("SELECT COUNT(*) as cnt FROM odometer_readings WHERE vehicle_id = ? AND reading = 50000")
                .bind(vehicle.id)
                .fetch_one(&pool)
                .await
                .map(|r| r.get("cnt"))
                .unwrap();
        assert_eq!(o_count, 1, "odometer reading row should exist");
    }

    // -------------------------------------------------------------------------
    // Test 2: get_vehicles returns created vehicles
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_get_vehicles_returns_all() {
        let pool = setup_test_db().await;

        create_vehicle_inner(&pool, "Car A".into(), 2019, "car".into(), 10000)
            .await
            .unwrap();
        create_vehicle_inner(&pool, "Car B".into(), 2021, "truck".into(), 20000)
            .await
            .unwrap();

        let vehicles = get_vehicles_inner(&pool).await.unwrap();

        assert_eq!(vehicles.len(), 2, "should return 2 vehicles");
        assert_eq!(vehicles[0].name, "Car A");
        assert_eq!(vehicles[1].name, "Car B");
    }

    // -------------------------------------------------------------------------
    // Test 3: update_vehicle updates name/year/type only; odometer unchanged
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_update_vehicle_updates_name_year_type_only() {
        let pool = setup_test_db().await;
        let created =
            create_vehicle_inner(&pool, "Old Name".into(), 2015, "car".into(), 30000)
                .await
                .unwrap();

        let updated =
            update_vehicle_inner(&pool, created.id, "New Name".into(), 2022, "truck".into())
                .await
                .unwrap();

        assert_eq!(updated.name, "New Name");
        assert_eq!(updated.year, 2022);
        assert_eq!(updated.r#type, "truck");
        assert_eq!(updated.current_odometer, 30000, "odometer should be unchanged");
    }

    // -------------------------------------------------------------------------
    // Test 4: archive_vehicle sets archived=true and archived_at
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_archive_vehicle_sets_archived_and_archived_at() {
        let pool = setup_test_db().await;
        let created =
            create_vehicle_inner(&pool, "My Van".into(), 2018, "van".into(), 15000)
                .await
                .unwrap();

        archive_vehicle_inner(&pool, created.id).await.unwrap();

        let vehicles = get_vehicles_inner(&pool).await.unwrap();
        let v = vehicles.iter().find(|v| v.id == created.id).unwrap();
        assert!(v.archived, "archived should be true");
        assert!(v.archived_at.is_some(), "archived_at should be set");
    }

    // -------------------------------------------------------------------------
    // Test 5: restore_vehicle sets archived=false and archived_at=NULL
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_restore_vehicle_clears_archived_and_archived_at() {
        let pool = setup_test_db().await;
        let created =
            create_vehicle_inner(&pool, "My Van".into(), 2018, "van".into(), 15000)
                .await
                .unwrap();

        archive_vehicle_inner(&pool, created.id).await.unwrap();
        restore_vehicle_inner(&pool, created.id).await.unwrap();

        let vehicles = get_vehicles_inner(&pool).await.unwrap();
        let v = vehicles.iter().find(|v| v.id == created.id).unwrap();
        assert!(!v.archived, "archived should be false");
        assert!(v.archived_at.is_none(), "archived_at should be NULL");
    }
}
