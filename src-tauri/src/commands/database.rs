use tauri::State;
use crate::models::{FavoriteItem, Collection, WatchHistoryItem, MediaItem};
use crate::commands::rezka::AppState;

#[tauri::command]
pub fn db_get_favorites(state: State<'_, AppState>) -> Result<Vec<FavoriteItem>, String> {
    state.db.get_favorites().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_is_favorite(state: State<'_, AppState>, media_id: String) -> Result<bool, String> {
    state.db.is_favorite(&media_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_toggle_favorite(state: State<'_, AppState>, item: MediaItem) -> Result<bool, String> {
    state.db.toggle_favorite(item).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_get_collections(state: State<'_, AppState>) -> Result<Vec<Collection>, String> {
    state.db.get_collections().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_create_collection(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
) -> Result<Collection, String> {
    state.db.create_collection(&name, description).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_delete_collection(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_collection(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_get_history(state: State<'_, AppState>) -> Result<Vec<WatchHistoryItem>, String> {
    state.db.get_history().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_save_progress(
    state: State<'_, AppState>,
    media_id: String,
    title: String,
    poster: String,
    media_type: String,
    position_seconds: i32,
    duration_seconds: i32,
    percentage: i32,
    season_number: Option<i32>,
    episode_number: Option<i32>,
    episode_title: Option<String>,
    completed: bool,
) -> Result<(), String> {
    state
        .db
        .save_progress(
            &media_id,
            &title,
            &poster,
            &media_type,
            position_seconds,
            duration_seconds,
            percentage,
            season_number,
            episode_number,
            episode_title,
            completed,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_clear_history(state: State<'_, AppState>) -> Result<(), String> {
    state.db.clear_history().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_delete_history_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_history_item(&id).map_err(|e| e.to_string())
}
