use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

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
    pub vin: Option<String>,
    pub license_plate: Option<String>,
}

pub fn now_utc() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

pub fn row_to_vehicle(r: sqlx::sqlite::SqliteRow) -> Vehicle {
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
        vin: r.get("vin"),
        license_plate: r.get("license_plate"),
    }
}
