use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub title: String,
    pub original_title: Option<String>,
    pub url: String,
    pub poster: String,
    pub backdrop: Option<String>,
    pub year: i32,
    pub country: Option<String>,
    pub rating: Option<f64>,
    pub rating_count: Option<i32>,
    pub genres: Vec<String>,
    #[serde(rename = "type")]
    pub media_type: String,
    pub details: Option<String>,
    pub duration: Option<String>,
    pub episodes_count: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Translator {
    pub id: String,
    pub name: String,
    pub is_camrip: Option<bool>,
    pub is_director_cut: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub id: String,
    pub episode_number: i32,
    pub season_number: i32,
    pub title: String,
    pub duration: Option<String>,
    pub thumbnail: Option<String>,
    pub watched: Option<bool>,
    pub watched_progress: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Season {
    pub id: String,
    pub season_number: i32,
    pub title: String,
    pub episodes: Vec<Episode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamQuality {
    pub quality: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub language: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSource {
    pub streams: Vec<StreamQuality>,
    pub subtitles: Vec<SubtitleTrack>,
    pub default_quality: Option<String>,
    pub translator_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaDetails {
    pub id: String,
    pub title: String,
    pub original_title: Option<String>,
    pub url: String,
    pub poster: String,
    pub backdrop: Option<String>,
    pub year: i32,
    pub country: Option<String>,
    pub rating: Option<f64>,
    pub rating_count: Option<i32>,
    pub genres: Vec<String>,
    #[serde(rename = "type")]
    pub media_type: String,
    pub details: Option<String>,
    pub duration: Option<String>,
    pub episodes_count: Option<String>,
    pub description: String,
    pub directors: Vec<String>,
    pub actors: Vec<String>,
    pub age_rating: Option<String>,
    pub translators: Vec<Translator>,
    pub seasons: Option<Vec<Season>>,
    pub similar: Vec<MediaItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFilter {
    pub category: String,
    pub genre: Option<String>,
    pub year: Option<String>,
    pub country: Option<String>,
    pub rating_min: Option<f64>,
    pub sort: String,
    pub page: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogResponse {
    pub items: Vec<MediaItem>,
    pub page: i32,
    pub total_pages: i32,
    pub total_items: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteItem {
    pub id: String,
    pub media_id: String,
    pub title: String,
    pub poster: String,
    pub year: i32,
    pub rating: Option<f64>,
    #[serde(rename = "type")]
    pub media_type: String,
    pub genres: Vec<String>,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub item_count: i32,
    pub cover_poster: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchHistoryItem {
    pub id: String,
    pub media_id: String,
    pub title: String,
    pub poster: String,
    #[serde(rename = "type")]
    pub media_type: String,
    pub season_number: Option<i32>,
    pub episode_number: Option<i32>,
    pub episode_title: Option<String>,
    pub position_seconds: i32,
    pub duration_seconds: i32,
    pub percentage: i32,
    pub watched_at: String,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorConfig {
    pub id: String,
    pub url: String,
    pub name: String,
    pub is_active: bool,
    pub is_custom: bool,
    pub latency_ms: Option<i64>,
    pub is_online: bool,
    pub last_checked: Option<String>,
}
