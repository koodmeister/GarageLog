mod commands;
mod db;
pub mod models;
pub mod notifications;
pub mod status;

use std::time::Duration;
use tauri::Manager;

use notifications::{check_notifications_now, run_check, NotificationState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let pool = tauri::async_runtime::block_on(db::setup_database(app))
                .expect("failed to initialize database");
            app.manage(pool);

            // Manage notification cooldown state.
            app.manage(NotificationState::new());

            // Spawn background task: startup check + hourly loop.
            let pool_for_notif = app.state::<sqlx::SqlitePool>().inner().clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<NotificationState>();
                // Startup check.
                run_check(&pool_for_notif, &app_handle, &state).await;
                // Hourly loop.
                loop {
                    tokio::time::sleep(Duration::from_secs(3600)).await;
                    run_check(&pool_for_notif, &app_handle, &state).await;
                }
            });

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
            check_notifications_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
