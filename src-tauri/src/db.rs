use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use std::str::FromStr;
use tauri::Manager;

pub async fn setup_database(app: &tauri::App) -> Result<SqlitePool, sqlx::Error> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data directory");

    std::fs::create_dir_all(&app_data_dir).expect("failed to create app data directory");

    let db_path = app_data_dir.join("garagelog.db");
    let db_url = format!("sqlite:{}", db_path.to_string_lossy());

    let connect_options = SqliteConnectOptions::from_str(&db_url)
        .expect("failed to parse database URL")
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(connect_options).await?;

    if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
        eprintln!("Migration failed: {e}");
        std::process::exit(1);
    }

    Ok(pool)
}
