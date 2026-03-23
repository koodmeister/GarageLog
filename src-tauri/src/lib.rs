mod commands;
mod db;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
