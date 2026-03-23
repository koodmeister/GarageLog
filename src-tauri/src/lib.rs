mod commands;
mod db;
pub mod models;
pub mod status;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let pool = tauri::async_runtime::block_on(db::setup_database(app))
                .expect("failed to initialize database");
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vehicles::get_vehicles,
            commands::vehicles::create_vehicle,
            commands::vehicles::update_vehicle,
            commands::vehicles::archive_vehicle,
            commands::vehicles::restore_vehicle,
            commands::odometer::update_odometer,
            commands::maintenance::get_maintenance_items,
            commands::maintenance::create_maintenance_item,
            commands::maintenance::update_maintenance_item,
            commands::maintenance::delete_maintenance_item,
            commands::service_records::log_service,
            commands::service_records::get_service_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
