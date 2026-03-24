use std::collections::HashMap;
use std::io::Write as IoWrite;

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri_plugin_dialog::DialogExt;

// ---------------------------------------------------------------------------
// Import/export data structures
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportVehicle {
    pub id: i64,
    pub name: String,
    pub year: i64,
    #[serde(rename = "type")]
    pub vehicle_type: String,
    pub current_odometer: i64,
    pub odometer_updated_at: String,
    pub archived: bool,
    pub archived_at: Option<String>,
    pub created_at: String,
    pub vin: Option<String>,
    pub license_plate: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportMaintenanceItem {
    pub id: i64,
    pub vehicle_id: i64,
    pub name: String,
    pub interval_months: Option<i64>,
    pub interval_km: Option<i64>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportServiceRecord {
    pub id: i64,
    pub maintenance_item_id: i64,
    pub serviced_at: String,
    pub odometer_at_service: Option<i64>,
    pub cost: Option<f64>,
    pub shop: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOdometerReading {
    pub id: i64,
    pub vehicle_id: i64,
    pub reading: i64,
    pub recorded_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportPayload {
    pub schema_version: i64,
    pub vehicles: Vec<ExportVehicle>,
    pub maintenance_items: Vec<ExportMaintenanceItem>,
    pub service_records: Vec<ExportServiceRecord>,
    pub odometer_readings: Vec<ExportOdometerReading>,
}

// ---------------------------------------------------------------------------
// Import summary / conflict types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportConflict {
    pub imported_vehicle_name: String,
    pub imported_vehicle_year: i64,
    pub existing_vehicle_id: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportSummary {
    pub vehicle_count: usize,
    pub maintenance_item_count: usize,
    pub service_record_count: usize,
    pub conflicts: Vec<ImportConflict>,
    pub import_data: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VehicleResolution {
    pub imported_vehicle_index: usize,
    pub action: String,
    pub target_vehicle_id: Option<i64>,
}

// ---------------------------------------------------------------------------
// Helpers: fetch all data from DB
// ---------------------------------------------------------------------------

async fn fetch_all_vehicles(pool: &SqlitePool) -> Result<Vec<ExportVehicle>, String> {
    let rows = sqlx::query(
        "SELECT id, name, year, type, current_odometer, odometer_updated_at, \
         archived, archived_at, created_at, vin, license_plate FROM vehicles ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let archived_int: i64 = r.get("archived");
            ExportVehicle {
                id: r.get("id"),
                name: r.get("name"),
                year: r.get("year"),
                vehicle_type: r.get("type"),
                current_odometer: r.get("current_odometer"),
                odometer_updated_at: r.get("odometer_updated_at"),
                archived: archived_int != 0,
                archived_at: r.get("archived_at"),
                created_at: r.get("created_at"),
                vin: r.get("vin"),
                license_plate: r.get("license_plate"),
            }
        })
        .collect())
}

async fn fetch_all_maintenance_items(
    pool: &SqlitePool,
) -> Result<Vec<ExportMaintenanceItem>, String> {
    let rows = sqlx::query(
        "SELECT id, vehicle_id, name, interval_months, interval_km, notes, created_at \
         FROM maintenance_items ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| ExportMaintenanceItem {
            id: r.get("id"),
            vehicle_id: r.get("vehicle_id"),
            name: r.get("name"),
            interval_months: r.get("interval_months"),
            interval_km: r.get("interval_km"),
            notes: r.get("notes"),
            created_at: r.get("created_at"),
        })
        .collect())
}

async fn fetch_all_service_records(
    pool: &SqlitePool,
) -> Result<Vec<ExportServiceRecord>, String> {
    let rows = sqlx::query(
        "SELECT id, maintenance_item_id, serviced_at, odometer_at_service, cost, shop, notes \
         FROM service_records ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| ExportServiceRecord {
            id: r.get("id"),
            maintenance_item_id: r.get("maintenance_item_id"),
            serviced_at: r.get("serviced_at"),
            odometer_at_service: r.get("odometer_at_service"),
            cost: r.get("cost"),
            shop: r.get("shop"),
            notes: r.get("notes"),
        })
        .collect())
}

async fn fetch_all_odometer_readings(
    pool: &SqlitePool,
) -> Result<Vec<ExportOdometerReading>, String> {
    let rows = sqlx::query(
        "SELECT id, vehicle_id, reading, recorded_at FROM odometer_readings ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| ExportOdometerReading {
            id: r.get("id"),
            vehicle_id: r.get("vehicle_id"),
            reading: r.get("reading"),
            recorded_at: r.get("recorded_at"),
        })
        .collect())
}

// ---------------------------------------------------------------------------
// export_json
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
pub async fn export_json(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let path = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_save_file();

    let path = match path {
        Some(p) => p,
        None => return Ok(()), // user cancelled
    };

    let vehicles = fetch_all_vehicles(&pool).await?;
    let maintenance_items = fetch_all_maintenance_items(&pool).await?;
    let service_records = fetch_all_service_records(&pool).await?;
    let odometer_readings = fetch_all_odometer_readings(&pool).await?;

    let payload = ExportPayload {
        schema_version: 1,
        vehicles,
        maintenance_items,
        service_records,
        odometer_readings,
    };

    let json = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;

    std::fs::write(path.as_path().unwrap(), json.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// export_csv
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
pub async fn export_csv(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let path = app
        .dialog()
        .file()
        .add_filter("ZIP", &["zip"])
        .blocking_save_file();

    let path = match path {
        Some(p) => p,
        None => return Ok(()), // user cancelled
    };

    let vehicles = fetch_all_vehicles(&pool).await?;
    let maintenance_items = fetch_all_maintenance_items(&pool).await?;
    let service_records = fetch_all_service_records(&pool).await?;
    let odometer_readings = fetch_all_odometer_readings(&pool).await?;

    // Build in-memory zip.
    let buf = Vec::new();
    let cursor = std::io::Cursor::new(buf);
    let mut zip = zip::ZipWriter::new(cursor);

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // vehicles.csv
    {
        zip.start_file("vehicles.csv", options).map_err(|e| e.to_string())?;
        let mut wtr = csv::Writer::from_writer(Vec::new());
        wtr.write_record(&[
            "id", "name", "year", "type", "current_odometer",
            "odometer_updated_at", "archived", "archived_at", "created_at",
            "vin", "license_plate",
        ])
        .map_err(|e| e.to_string())?;
        for v in &vehicles {
            wtr.write_record(&[
                v.id.to_string(),
                v.name.clone(),
                v.year.to_string(),
                v.vehicle_type.clone(),
                v.current_odometer.to_string(),
                v.odometer_updated_at.clone(),
                (v.archived as i32).to_string(),
                v.archived_at.clone().unwrap_or_default(),
                v.created_at.clone(),
                v.vin.clone().unwrap_or_default(),
                v.license_plate.clone().unwrap_or_default(),
            ])
            .map_err(|e| e.to_string())?;
        }
        let csv_bytes = wtr.into_inner().map_err(|e| e.to_string())?;
        zip.write_all(&csv_bytes).map_err(|e| e.to_string())?;
    }

    // maintenance_items.csv
    {
        zip.start_file("maintenance_items.csv", options).map_err(|e| e.to_string())?;
        let mut wtr = csv::Writer::from_writer(Vec::new());
        wtr.write_record(&[
            "id", "vehicle_id", "name", "interval_months", "interval_km", "notes", "created_at",
        ])
        .map_err(|e| e.to_string())?;
        for m in &maintenance_items {
            wtr.write_record(&[
                m.id.to_string(),
                m.vehicle_id.to_string(),
                m.name.clone(),
                m.interval_months.map(|v| v.to_string()).unwrap_or_default(),
                m.interval_km.map(|v| v.to_string()).unwrap_or_default(),
                m.notes.clone().unwrap_or_default(),
                m.created_at.clone(),
            ])
            .map_err(|e| e.to_string())?;
        }
        let csv_bytes = wtr.into_inner().map_err(|e| e.to_string())?;
        zip.write_all(&csv_bytes).map_err(|e| e.to_string())?;
    }

    // service_records.csv
    {
        zip.start_file("service_records.csv", options).map_err(|e| e.to_string())?;
        let mut wtr = csv::Writer::from_writer(Vec::new());
        wtr.write_record(&[
            "id",
            "maintenance_item_id",
            "serviced_at",
            "odometer_at_service",
            "cost",
            "shop",
            "notes",
        ])
        .map_err(|e| e.to_string())?;
        for s in &service_records {
            wtr.write_record(&[
                s.id.to_string(),
                s.maintenance_item_id.to_string(),
                s.serviced_at.clone(),
                s.odometer_at_service.map(|v| v.to_string()).unwrap_or_default(),
                s.cost.map(|v| v.to_string()).unwrap_or_default(),
                s.shop.clone().unwrap_or_default(),
                s.notes.clone().unwrap_or_default(),
            ])
            .map_err(|e| e.to_string())?;
        }
        let csv_bytes = wtr.into_inner().map_err(|e| e.to_string())?;
        zip.write_all(&csv_bytes).map_err(|e| e.to_string())?;
    }

    // odometer_readings.csv
    {
        zip.start_file("odometer_readings.csv", options).map_err(|e| e.to_string())?;
        let mut wtr = csv::Writer::from_writer(Vec::new());
        wtr.write_record(&["id", "vehicle_id", "reading", "recorded_at"])
            .map_err(|e| e.to_string())?;
        for o in &odometer_readings {
            wtr.write_record(&[
                o.id.to_string(),
                o.vehicle_id.to_string(),
                o.reading.to_string(),
                o.recorded_at.clone(),
            ])
            .map_err(|e| e.to_string())?;
        }
        let csv_bytes = wtr.into_inner().map_err(|e| e.to_string())?;
        zip.write_all(&csv_bytes).map_err(|e| e.to_string())?;
    }

    let cursor = zip.finish().map_err(|e| e.to_string())?;
    let zip_bytes = cursor.into_inner();

    std::fs::write(path.as_path().unwrap(), &zip_bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// import_json
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
pub async fn import_json(
    pool: tauri::State<'_, SqlitePool>,
    app: tauri::AppHandle,
) -> Result<ImportSummary, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();

    let path = match path {
        Some(p) => p,
        None => return Err("No file selected".to_string()),
    };

    let contents = std::fs::read_to_string(path.as_path().unwrap())
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Validate JSON and structure.
    let value: serde_json::Value =
        serde_json::from_str(&contents).map_err(|e| format!("Invalid JSON: {}", e))?;

    let schema_version = value
        .get("schema_version")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| "Import failed: missing schema_version field".to_string())?;

    if schema_version > 1 {
        return Err(
            "Import failed: file was created by a newer version of GarageLog".to_string(),
        );
    }

    let payload: ExportPayload =
        serde_json::from_value(value).map_err(|e| format!("Invalid import structure: {}", e))?;

    let vehicle_count = payload.vehicles.len();
    let maintenance_item_count = payload.maintenance_items.len();
    let service_record_count = payload.service_records.len();

    // Find conflicts: imported vehicles where (name, year) matches an existing vehicle.
    let existing_vehicles = fetch_all_vehicles(&pool).await?;

    let mut conflicts = Vec::new();
    for imported in &payload.vehicles {
        if let Some(existing) = existing_vehicles
            .iter()
            .find(|e| e.name == imported.name && e.year == imported.year)
        {
            conflicts.push(ImportConflict {
                imported_vehicle_name: imported.name.clone(),
                imported_vehicle_year: imported.year,
                existing_vehicle_id: existing.id,
            });
        }
    }

    let import_data =
        serde_json::to_string(&payload).map_err(|e| e.to_string())?;

    Ok(ImportSummary {
        vehicle_count,
        maintenance_item_count,
        service_record_count,
        conflicts,
        import_data,
    })
}

// ---------------------------------------------------------------------------
// confirm_import
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
pub async fn confirm_import(
    pool: tauri::State<'_, SqlitePool>,
    import_data: String,
    resolutions: Vec<VehicleResolution>,
) -> Result<(), String> {
    let payload: ExportPayload =
        serde_json::from_str(&import_data).map_err(|e| format!("Invalid import data: {}", e))?;

    // Build a resolution lookup: imported_vehicle_index -> VehicleResolution
    let resolution_map: HashMap<usize, &VehicleResolution> =
        resolutions.iter().map(|r| (r.imported_vehicle_index, r)).collect();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // For each imported vehicle, determine what to do.
    // old_vehicle_id -> new_vehicle_id mapping (for new vehicles).
    let mut vehicle_id_map: HashMap<i64, i64> = HashMap::new();
    // old_vehicle_id -> target_vehicle_id mapping (for merged vehicles).
    let mut vehicle_merge_map: HashMap<i64, i64> = HashMap::new();
    // Set of skipped old vehicle ids.
    let mut skipped_vehicle_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();

    for (idx, imported_vehicle) in payload.vehicles.iter().enumerate() {
        match resolution_map.get(&idx) {
            Some(res) if res.action == "skip" => {
                skipped_vehicle_ids.insert(imported_vehicle.id);
            }
            Some(res) if res.action == "merge" => {
                let target_id = res
                    .target_vehicle_id
                    .ok_or_else(|| "merge resolution missing target_vehicle_id".to_string())?;
                vehicle_merge_map.insert(imported_vehicle.id, target_id);
            }
            // No resolution = non-conflicting vehicle, insert as new.
            _ => {
                let result = sqlx::query(
                    "INSERT INTO vehicles \
                     (name, year, type, current_odometer, odometer_updated_at, \
                      archived, archived_at, created_at, vin, license_plate) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&imported_vehicle.name)
                .bind(imported_vehicle.year)
                .bind(&imported_vehicle.vehicle_type)
                .bind(imported_vehicle.current_odometer)
                .bind(&imported_vehicle.odometer_updated_at)
                .bind(imported_vehicle.archived as i64)
                .bind(&imported_vehicle.archived_at)
                .bind(&imported_vehicle.created_at)
                .bind(&imported_vehicle.vin)
                .bind(&imported_vehicle.license_plate)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                let new_vehicle_id = result.last_insert_rowid();
                vehicle_id_map.insert(imported_vehicle.id, new_vehicle_id);
            }
        }
    }

    // old maintenance_item_id -> new maintenance_item_id mapping.
    let mut maint_id_map: HashMap<i64, i64> = HashMap::new();

    // Insert maintenance items for new vehicles and merged vehicles.
    for item in &payload.maintenance_items {
        // Determine target vehicle id.
        let target_vehicle_id = if let Some(&new_vid) = vehicle_id_map.get(&item.vehicle_id) {
            // New vehicle insert.
            new_vid
        } else if let Some(&merge_vid) = vehicle_merge_map.get(&item.vehicle_id) {
            // Merge: attach to existing vehicle.
            merge_vid
        } else if skipped_vehicle_ids.contains(&item.vehicle_id) {
            // Skip: drop this item.
            continue;
        } else {
            // Unresolved vehicle id (shouldn't happen for well-formed data) — skip.
            continue;
        };

        let result = sqlx::query(
            "INSERT INTO maintenance_items \
             (vehicle_id, name, interval_months, interval_km, notes, created_at) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(target_vehicle_id)
        .bind(&item.name)
        .bind(item.interval_months)
        .bind(item.interval_km)
        .bind(&item.notes)
        .bind(&item.created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let new_item_id = result.last_insert_rowid();
        maint_id_map.insert(item.id, new_item_id);
    }

    // Insert service records, remapping maintenance_item_id via maint_id_map.
    for record in &payload.service_records {
        let new_item_id = match maint_id_map.get(&record.maintenance_item_id) {
            Some(&id) => id,
            None => continue, // parent item was skipped or not found
        };

        sqlx::query(
            "INSERT INTO service_records \
             (maintenance_item_id, serviced_at, odometer_at_service, cost, shop, notes) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(new_item_id)
        .bind(&record.serviced_at)
        .bind(record.odometer_at_service)
        .bind(record.cost)
        .bind(&record.shop)
        .bind(&record.notes)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Insert odometer readings for new vehicles only (not merged — avoid duplicates).
    for reading in &payload.odometer_readings {
        let new_vehicle_id = match vehicle_id_map.get(&reading.vehicle_id) {
            Some(&id) => id,
            None => continue, // merged or skipped — skip odometer readings
        };

        sqlx::query(
            "INSERT INTO odometer_readings (vehicle_id, reading, recorded_at) VALUES (?, ?, ?)",
        )
        .bind(new_vehicle_id)
        .bind(reading.reading)
        .bind(&reading.recorded_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}
