pub mod commands;
pub mod database;
pub mod models;
pub mod providers;

use std::sync::Arc;
use tauri::Manager;
use crate::commands::rezka::AppState;
use crate::database::Database;
use crate::providers::ProviderManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("./data"));
            
            let db_path = app_dir.join("hdrezka.db");
            let db = Arc::new(Database::new(db_path).expect("Failed to initialize SQLite database"));
            let providers = Arc::new(ProviderManager::new(db.clone()));

            app.manage(AppState {
                db,
                providers,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window controls
            commands::window::app_minimize,
            commands::window::app_toggle_maximize,
            commands::window::app_close,
            commands::window::app_is_maximized,

            // HDRezka Provider commands
            commands::rezka::rezka_get_hero,
            commands::rezka::rezka_get_popular,
            commands::rezka::rezka_get_new_releases,
            commands::rezka::rezka_get_catalog,
            commands::rezka::rezka_search,
            commands::rezka::rezka_get_details,
            commands::rezka::rezka_get_playback_sources,
            commands::rezka::rezka_get_mirrors,
            commands::rezka::rezka_add_mirror,
            commands::rezka::rezka_remove_mirror,
            commands::rezka::rezka_set_active_mirror,
            commands::rezka::rezka_test_mirror,

            // Database commands
            commands::database::db_get_favorites,
            commands::database::db_is_favorite,
            commands::database::db_toggle_favorite,
            commands::database::db_get_collections,
            commands::database::db_create_collection,
            commands::database::db_delete_collection,
            commands::database::db_get_history,
            commands::database::db_save_progress,
            commands::database::db_clear_history,
            commands::database::db_delete_history_item,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
