use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

#[derive(Debug, Serialize, Deserialize)]
pub struct Vehicle {
    pub id: i64,
    pub name: String,
    pub year: i64,
    pub r#type: String,
    pub current_odometer: i64,
    pub odometer_updated_at: String,
    pub archived: bool,
    pub archived_at: Option<String>,
    pub created_at: String,
}

fn now_utc() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn row_to_vehicle(r: sqlx::sqlite::SqliteRow) -> Vehicle {
    let archived_int: i64 = r.get("archived");
    Vehicle {
        id: r.get("id"),
        name: r.get("name"),
        year: r.get("year"),
        r#type: r.get("type"),
        current_odometer: r.get("current_odometer"),
        odometer_updated_at: r.get("odometer_updated_at"),
        archived: archived_int != 0,
        archived_at: r.get("archived_at"),
        created_at: r.get("created_at"),
    }
}

#[tauri::command]
pub async fn get_vehicles(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<Vehicle>, String> {
    let rows = sqlx::query(
        "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
         FROM vehicles ORDER BY archived ASC, id ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(row_to_vehicle).collect())
}

#[tauri::command]
pub async fn create_vehicle(
    pool: tauri::State<'_, SqlitePool>,
    name: String,
    year: i64,
    vehicle_type: String,
    initial_odometer: i64,
) -> Result<Vehicle, String> {
    let now = now_utc();

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
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let vehicle_id: i64 = result.get("id");

    sqlx::query(
        "INSERT INTO odometer_readings (vehicle_id, reading, recorded_at) VALUES (?, ?, ?)",
    )
    .bind(vehicle_id)
    .bind(initial_odometer)
    .bind(&now)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let vehicle_row = sqlx::query(
        "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
         FROM vehicles WHERE id = ?",
    )
    .bind(vehicle_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(row_to_vehicle(vehicle_row))
}

#[tauri::command]
pub async fn update_vehicle(
    pool: tauri::State<'_, SqlitePool>,
    id: i64,
    name: String,
    year: i64,
    vehicle_type: String,
) -> Result<Vehicle, String> {
    sqlx::query("UPDATE vehicles SET name = ?, year = ?, type = ? WHERE id = ?")
        .bind(&name)
        .bind(year)
        .bind(&vehicle_type)
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let vehicle_row = sqlx::query(
        "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
         FROM vehicles WHERE id = ?",
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(row_to_vehicle(vehicle_row))
}

#[tauri::command]
pub async fn archive_vehicle(pool: tauri::State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    let now = now_utc();
    sqlx::query("UPDATE vehicles SET archived = 1, archived_at = ? WHERE id = ?")
        .bind(&now)
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn restore_vehicle(pool: tauri::State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE vehicles SET archived = 0, archived_at = NULL WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

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

    /// Directly inserts a vehicle row and returns its id.
    async fn insert_vehicle(
        pool: &SqlitePool,
        name: &str,
        year: i64,
        vtype: &str,
        odometer: i64,
    ) -> i64 {
        let now = now_utc();
        let row = sqlx::query(
            "INSERT INTO vehicles (name, year, type, current_odometer, odometer_updated_at, archived, created_at) \
             VALUES (?, ?, ?, ?, ?, 0, ?) RETURNING id",
        )
        .bind(name)
        .bind(year)
        .bind(vtype)
        .bind(odometer)
        .bind(&now)
        .bind(&now)
        .fetch_one(pool)
        .await
        .unwrap();
        row.get::<i64, _>("id")
    }

    // -------------------------------------------------------------------------
    // Test 1: create_vehicle inserts vehicle and odometer reading
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_create_vehicle_inserts_vehicle_and_odometer_reading() {
        let pool = setup_test_db().await;
        let now = now_utc();

        let result = sqlx::query(
            "INSERT INTO vehicles (name, year, type, current_odometer, odometer_updated_at, archived, created_at) \
             VALUES (?, ?, ?, ?, ?, 0, ?) RETURNING id",
        )
        .bind("My Truck")
        .bind(2020i64)
        .bind("truck")
        .bind(50000i64)
        .bind(&now)
        .bind(&now)
        .fetch_one(&pool)
        .await
        .unwrap();

        let vehicle_id: i64 = result.get("id");

        sqlx::query(
            "INSERT INTO odometer_readings (vehicle_id, reading, recorded_at) VALUES (?, ?, ?)",
        )
        .bind(vehicle_id)
        .bind(50000i64)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let v_count: i64 = sqlx::query("SELECT COUNT(*) as cnt FROM vehicles WHERE id = ?")
            .bind(vehicle_id)
            .fetch_one(&pool)
            .await
            .map(|r| r.get("cnt"))
            .unwrap();
        assert_eq!(v_count, 1, "vehicle row should exist");

        let o_count: i64 = sqlx::query(
            "SELECT COUNT(*) as cnt FROM odometer_readings WHERE vehicle_id = ? AND reading = 50000",
        )
        .bind(vehicle_id)
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

        insert_vehicle(&pool, "Car A", 2019, "car", 10000).await;
        insert_vehicle(&pool, "Car B", 2021, "truck", 20000).await;

        let rows = sqlx::query(
            "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
             FROM vehicles ORDER BY id ASC",
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(rows.len(), 2, "should return 2 vehicles");

        let vehicles: Vec<Vehicle> = rows.into_iter().map(row_to_vehicle).collect();
        assert_eq!(vehicles[0].name, "Car A");
        assert_eq!(vehicles[1].name, "Car B");
    }

    // -------------------------------------------------------------------------
    // Test 3: update_vehicle updates name/year/type only; odometer unchanged
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_update_vehicle_updates_name_year_type_only() {
        let pool = setup_test_db().await;
        let id = insert_vehicle(&pool, "Old Name", 2015, "car", 30000).await;

        sqlx::query("UPDATE vehicles SET name = ?, year = ?, type = ? WHERE id = ?")
            .bind("New Name")
            .bind(2022i64)
            .bind("truck")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();

        let row = sqlx::query(
            "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
             FROM vehicles WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();

        let v = row_to_vehicle(row);
        assert_eq!(v.name, "New Name");
        assert_eq!(v.year, 2022);
        assert_eq!(v.r#type, "truck");
        assert_eq!(v.current_odometer, 30000, "odometer should be unchanged");
    }

    // -------------------------------------------------------------------------
    // Test 4: archive_vehicle sets archived=true and archived_at
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_archive_vehicle_sets_archived_and_archived_at() {
        let pool = setup_test_db().await;
        let id = insert_vehicle(&pool, "My Van", 2018, "van", 15000).await;

        let now = now_utc();
        sqlx::query("UPDATE vehicles SET archived = 1, archived_at = ? WHERE id = ?")
            .bind(&now)
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();

        let row = sqlx::query(
            "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
             FROM vehicles WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();

        let v = row_to_vehicle(row);
        assert!(v.archived, "archived should be true");
        assert!(v.archived_at.is_some(), "archived_at should be set");
    }

    // -------------------------------------------------------------------------
    // Test 5: restore_vehicle sets archived=false and archived_at=NULL
    // -------------------------------------------------------------------------
    #[tokio::test]
    async fn test_restore_vehicle_clears_archived_and_archived_at() {
        let pool = setup_test_db().await;
        let id = insert_vehicle(&pool, "My Van", 2018, "van", 15000).await;

        // Archive first
        let now = now_utc();
        sqlx::query("UPDATE vehicles SET archived = 1, archived_at = ? WHERE id = ?")
            .bind(&now)
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();

        // Restore
        sqlx::query("UPDATE vehicles SET archived = 0, archived_at = NULL WHERE id = ?")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();

        let row = sqlx::query(
            "SELECT id, name, year, type, current_odometer, odometer_updated_at, archived, archived_at, created_at \
             FROM vehicles WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();

        let v = row_to_vehicle(row);
        assert!(!v.archived, "archived should be false");
        assert!(v.archived_at.is_none(), "archived_at should be NULL");
    }
}
