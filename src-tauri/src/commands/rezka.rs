use std::sync::Arc;
use tauri::State;
use crate::models::{
    CatalogFilter, CatalogResponse, MediaDetails, MediaItem, MirrorConfig, PlaybackSource,
};
use crate::database::Database;
use crate::providers::ProviderManager;

pub struct AppState {
    pub db: Arc<Database>,
    pub providers: Arc<ProviderManager>,
}

#[tauri::command]
pub async fn rezka_get_hero(state: State<'_, AppState>) -> Result<Vec<MediaItem>, String> {
    let filter = CatalogFilter {
        category: "movies".to_string(),
        genre: None,
        year: None,
        country: None,
        rating_min: None,
        sort: "popular".to_string(),
        page: 1,
    };
    let cat = state.providers.hdrezka.get_catalog(&filter).await?;
    Ok(cat.items.into_iter().take(5).collect())
}

#[tauri::command]
pub async fn rezka_get_popular(state: State<'_, AppState>, category: String) -> Result<Vec<MediaItem>, String> {
    let filter = CatalogFilter {
        category,
        genre: None,
        year: None,
        country: None,
        rating_min: None,
        sort: "popular".to_string(),
        page: 1,
    };
    let cat = state.providers.hdrezka.get_catalog(&filter).await?;
    Ok(cat.items)
}

#[tauri::command]
pub async fn rezka_get_new_releases(state: State<'_, AppState>, category: String) -> Result<Vec<MediaItem>, String> {
    let filter = CatalogFilter {
        category,
        genre: None,
        year: None,
        country: None,
        rating_min: None,
        sort: "release_date".to_string(),
        page: 1,
    };
    let cat = state.providers.hdrezka.get_catalog(&filter).await?;
    Ok(cat.items)
}

#[tauri::command]
pub async fn rezka_get_catalog(state: State<'_, AppState>, filter: CatalogFilter) -> Result<CatalogResponse, String> {
    state.providers.hdrezka.get_catalog(&filter).await
}

#[tauri::command]
pub async fn rezka_search(state: State<'_, AppState>, query: String, page: i32) -> Result<CatalogResponse, String> {
    state.providers.hdrezka.search(&query, page).await
}

#[tauri::command]
pub async fn rezka_get_details(
    state: State<'_, AppState>,
    id: String,
    url: Option<String>,
) -> Result<MediaDetails, String> {
    state.providers.hdrezka.get_details(&id, url.as_deref()).await
}

#[tauri::command]
pub async fn rezka_get_playback_sources(
    state: State<'_, AppState>,
    id: String,
    translator_id: Option<String>,
    season: Option<i32>,
    episode: Option<i32>,
    is_movie: bool,
) -> Result<PlaybackSource, String> {
    state
        .providers
        .hdrezka
        .get_playback_sources(&id, translator_id.as_deref(), season, episode, is_movie)
        .await
}

#[tauri::command]
pub fn rezka_get_mirrors(state: State<'_, AppState>) -> Result<Vec<MirrorConfig>, String> {
    state.db.get_mirrors().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rezka_add_mirror(state: State<'_, AppState>, url: String, name: String) -> Result<MirrorConfig, String> {
    state.db.add_mirror(&url, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rezka_remove_mirror(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.remove_mirror(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rezka_set_active_mirror(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.set_active_mirror(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rezka_test_mirror(
    state: State<'_, AppState>,
    id: String,
) -> Result<MirrorStatusResult, String> {
    let mirrors = state.db.get_mirrors().map_err(|e| e.to_string())?;
    let found = mirrors.into_iter().find(|m| m.id == id).ok_or("Mirror not found")?;

    let client = crate::providers::hdrezka::client::RezkaClient::new();
    let (is_online, latency) = client.ping(&found.url).await;

    let _ = state.db.update_mirror_status(&id, is_online, latency);

    Ok(MirrorStatusResult {
        is_online,
        latency_ms: latency,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorStatusResult {
    pub is_online: bool,
    pub latency_ms: Option<i64>,
}
