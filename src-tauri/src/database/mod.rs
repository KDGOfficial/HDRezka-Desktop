use std::path::PathBuf;
use std::sync::Mutex;
use rusqlite::{params, Connection, Result};
use crate::models::{FavoriteItem, Collection, WatchHistoryItem, MirrorConfig, MediaItem};

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let conn = Connection::open(db_path)?;
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS favorites (
                id TEXT PRIMARY KEY,
                media_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                poster TEXT NOT NULL,
                year INTEGER NOT NULL,
                rating REAL,
                type TEXT NOT NULL,
                genres TEXT NOT NULL,
                added_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_favorites_added ON favorites(added_at DESC);

            CREATE TABLE IF NOT EXISTS collections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS collection_items (
                id TEXT PRIMARY KEY,
                collection_id TEXT NOT NULL,
                media_id TEXT NOT NULL,
                title TEXT NOT NULL,
                poster TEXT NOT NULL,
                year INTEGER NOT NULL,
                type TEXT NOT NULL,
                added_at TEXT NOT NULL,
                FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS watch_history (
                id TEXT PRIMARY KEY,
                media_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                poster TEXT NOT NULL,
                type TEXT NOT NULL,
                season_number INTEGER,
                episode_number INTEGER,
                episode_title TEXT,
                position_seconds INTEGER NOT NULL DEFAULT 0,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                percentage INTEGER NOT NULL DEFAULT 0,
                watched_at TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_history_watched ON watch_history(watched_at DESC);

            CREATE TABLE IF NOT EXISTS mirrors (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 0,
                is_custom INTEGER NOT NULL DEFAULT 0,
                latency_ms INTEGER,
                is_online INTEGER NOT NULL DEFAULT 1,
                last_checked TEXT
            );

            CREATE TABLE IF NOT EXISTS user_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )?;

        // Populate default mirrors if empty
        let count: i64 = conn.query_row("SELECT count(*) FROM mirrors", [], |r| r.get(0))?;
        if count == 0 {
            conn.execute(
                "INSERT INTO mirrors (id, url, name, is_active, is_custom, is_online, latency_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params!["1", "https://hdrezka.ag", "HDRezka Primary (.ag)", 1, 0, 1, 65],
            )?;
            conn.execute(
                "INSERT INTO mirrors (id, url, name, is_active, is_custom, is_online, latency_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params!["2", "https://rezka.ag", "Rezka Mirror (.ag)", 0, 0, 1, 80],
            )?;
            conn.execute(
                "INSERT INTO mirrors (id, url, name, is_active, is_custom, is_online, latency_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params!["3", "https://hdrezka.me", "HDRezka Mirror (.me)", 0, 0, 1, 105],
            )?;
        }

        // Populate default collections if empty
        let col_count: i64 = conn.query_row("SELECT count(*) FROM collections", [], |r| r.get(0))?;
        if col_count == 0 {
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params!["col-1", "Любимые фильмы", "Коллекция лучших шедевров кино", &now, &now],
            )?;
            conn.execute(
                "INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params!["col-2", "Посмотреть позже", "Список отложенных фильмов и сериалов", &now, &now],
            )?;
        }

        Ok(())
    }

    // Favorites
    pub fn get_favorites(&self) -> Result<Vec<FavoriteItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, media_id, title, poster, year, rating, type, genres, added_at FROM favorites ORDER BY added_at DESC")?;
        let rows = stmt.query_map([], |row| {
            let genres_str: String = row.get(7)?;
            let genres = serde_json::from_str(&genres_str).unwrap_or_default();
            Ok(FavoriteItem {
                id: row.get(0)?,
                media_id: row.get(1)?,
                title: row.get(2)?,
                poster: row.get(3)?,
                year: row.get(4)?,
                rating: row.get(5)?,
                media_type: row.get(6)?,
                genres,
                added_at: row.get(8)?,
            })
        })?;

        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn is_favorite(&self, media_id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT count(*) FROM favorites WHERE media_id = ?1",
            params![media_id],
            |r| r.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn toggle_favorite(&self, item: MediaItem) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let exists: i64 = conn.query_row(
            "SELECT count(*) FROM favorites WHERE media_id = ?1",
            params![&item.id],
            |r| r.get(0),
        )?;

        if exists > 0 {
            conn.execute("DELETE FROM favorites WHERE media_id = ?1", params![&item.id])?;
            Ok(false)
        } else {
            let id = format!("fav-{}", chrono::Utc::now().timestamp_millis());
            let now = chrono::Utc::now().to_rfc3339();
            let genres_json = serde_json::to_string(&item.genres).unwrap_or_else(|_| "[]".to_string());
            conn.execute(
                "INSERT INTO favorites (id, media_id, title, poster, year, rating, type, genres, added_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![id, item.id, item.title, item.poster, item.year, item.rating, item.media_type, genres_json, now],
            )?;
            Ok(true)
        }
    }

    // Collections
    pub fn get_collections(&self) -> Result<Vec<Collection>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
                   (SELECT count(*) FROM collection_items ci WHERE ci.collection_id = c.id) as item_count
            FROM collections c ORDER BY c.created_at ASC
            "#,
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                item_count: row.get(5)?,
                cover_poster: None,
            })
        })?;

        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn create_collection(&self, name: &str, description: Option<String>) -> Result<Collection> {
        let conn = self.conn.lock().unwrap();
        let id = format!("col-{}", chrono::Utc::now().timestamp_millis());
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![&id, name, &description, &now, &now],
        )?;

        Ok(Collection {
            id,
            name: name.to_string(),
            description,
            item_count: 0,
            cover_poster: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn delete_collection(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM collections WHERE id = ?1", params![id])?;
        Ok(())
    }

    // History & Progress
    pub fn get_history(&self) -> Result<Vec<WatchHistoryItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, media_id, title, poster, type, season_number, episode_number, episode_title, position_seconds, duration_seconds, percentage, watched_at, completed FROM watch_history ORDER BY watched_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            let completed_int: i32 = row.get(12)?;
            Ok(WatchHistoryItem {
                id: row.get(0)?,
                media_id: row.get(1)?,
                title: row.get(2)?,
                poster: row.get(3)?,
                media_type: row.get(4)?,
                season_number: row.get(5)?,
                episode_number: row.get(6)?,
                episode_title: row.get(7)?,
                position_seconds: row.get(8)?,
                duration_seconds: row.get(9)?,
                percentage: row.get(10)?,
                watched_at: row.get(11)?,
                completed: completed_int == 1,
            })
        })?;

        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn save_progress(
        &self,
        media_id: &str,
        title: &str,
        poster: &str,
        media_type: &str,
        position_seconds: i32,
        duration_seconds: i32,
        percentage: i32,
        season_number: Option<i32>,
        episode_number: Option<i32>,
        episode_title: Option<String>,
        completed: bool,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let id = format!("h-{}", chrono::Utc::now().timestamp_millis());

        conn.execute(
            r#"
            INSERT INTO watch_history (id, media_id, title, poster, type, season_number, episode_number, episode_title, position_seconds, duration_seconds, percentage, watched_at, completed)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            ON CONFLICT(media_id) DO UPDATE SET
                position_seconds = excluded.position_seconds,
                duration_seconds = excluded.duration_seconds,
                percentage = excluded.percentage,
                season_number = excluded.season_number,
                episode_number = excluded.episode_number,
                episode_title = excluded.episode_title,
                watched_at = excluded.watched_at,
                completed = excluded.completed
            "#,
            params![id, media_id, title, poster, media_type, season_number, episode_number, episode_title, position_seconds, duration_seconds, percentage, now, if completed { 1 } else { 0 }],
        )?;

        Ok(())
    }

    pub fn clear_history(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM watch_history", [])?;
        Ok(())
    }

    pub fn delete_history_item(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM watch_history WHERE id = ?1", params![id])?;
        Ok(())
    }

    // Mirrors
    pub fn get_mirrors(&self) -> Result<Vec<MirrorConfig>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, url, name, is_active, is_custom, latency_ms, is_online, last_checked FROM mirrors ORDER BY is_active DESC, is_online DESC")?;
        let rows = stmt.query_map([], |row| {
            let is_active_int: i32 = row.get(3)?;
            let is_custom_int: i32 = row.get(4)?;
            let is_online_int: i32 = row.get(6)?;
            Ok(MirrorConfig {
                id: row.get(0)?,
                url: row.get(1)?,
                name: row.get(2)?,
                is_active: is_active_int == 1,
                is_custom: is_custom_int == 1,
                latency_ms: row.get(5)?,
                is_online: is_online_int == 1,
                last_checked: row.get(7)?,
            })
        })?;

        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn add_mirror(&self, url: &str, name: &str) -> Result<MirrorConfig> {
        let conn = self.conn.lock().unwrap();
        let id = format!("m-{}", chrono::Utc::now().timestamp_millis());

        conn.execute(
            "INSERT INTO mirrors (id, url, name, is_active, is_custom, is_online, latency_ms) VALUES (?1, ?2, ?3, 0, 1, 1, 75)",
            params![&id, url, name],
        )?;

        Ok(MirrorConfig {
            id,
            url: url.to_string(),
            name: name.to_string(),
            is_active: false,
            is_custom: true,
            latency_ms: Some(75),
            is_online: true,
            last_checked: None,
        })
    }

    pub fn remove_mirror(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM mirrors WHERE id = ?1 AND is_custom = 1", params![id])?;
        Ok(())
    }

    pub fn set_active_mirror(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE mirrors SET is_active = 0", [])?;
        conn.execute("UPDATE mirrors SET is_active = 1 WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_mirror_status(&self, id: &str, is_online: bool, latency_ms: Option<i64>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE mirrors SET is_online = ?1, latency_ms = ?2, last_checked = ?3 WHERE id = ?4",
            params![if is_online { 1 } else { 0 }, latency_ms, now, id],
        )?;
        Ok(())
    }

    pub fn get_active_mirror_url(&self) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let url: Result<String> = conn.query_row(
            "SELECT url FROM mirrors WHERE is_active = 1 LIMIT 1",
            [],
            |r| r.get(0),
        );
        match url {
            Ok(u) => Ok(u),
            Err(_) => Ok("https://hdrezka.ag".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_schema().unwrap();
        db
    }

    #[test]
    fn test_favorites_crud() {
        let db = create_test_db();
        let item = MediaItem {
            id: "m-test-1".to_string(),
            title: "Test Movie".to_string(),
            original_title: None,
            url: "/films/test.html".to_string(),
            poster: "https://example.com/poster.jpg".to_string(),
            backdrop: None,
            year: 2024,
            country: Some("USA".to_string()),
            rating: Some(8.5),
            rating_count: None,
            genres: vec!["Action".to_string()],
            media_type: "movie".to_string(),
            details: None,
            duration: None,
            episodes_count: None,
        };

        assert!(!db.is_favorite("m-test-1").unwrap());
        let toggled = db.toggle_favorite(item.clone()).unwrap();
        assert!(toggled);
        assert!(db.is_favorite("m-test-1").unwrap());

        let favs = db.get_favorites().unwrap();
        assert_eq!(favs.len(), 1);
        assert_eq!(favs[0].title, "Test Movie");

        let toggled_off = db.toggle_favorite(item).unwrap();
        assert!(!toggled_off);
        assert!(!db.is_favorite("m-test-1").unwrap());
    }

    #[test]
    fn test_collections_crud() {
        let db = create_test_db();
        let initial = db.get_collections().unwrap();
        let initial_count = initial.len();

        let created = db.create_collection("My Series", Some("Best shows".to_string())).unwrap();
        assert_eq!(created.name, "My Series");

        let after = db.get_collections().unwrap();
        assert_eq!(after.len(), initial_count + 1);

        db.delete_collection(&created.id).unwrap();
        let final_cols = db.get_collections().unwrap();
        assert_eq!(final_cols.len(), initial_count);
    }

    #[test]
    fn test_history_and_progress() {
        let db = create_test_db();
        db.save_progress(
            "m-1",
            "Test Movie",
            "poster.jpg",
            "movie",
            1200,
            7200,
            16,
            None,
            None,
            None,
            false,
        ).unwrap();

        let history = db.get_history().unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].media_id, "m-1");
        assert_eq!(history[0].position_seconds, 1200);

        // Update progress
        db.save_progress(
            "m-1",
            "Test Movie",
            "poster.jpg",
            "movie",
            6500,
            7200,
            90,
            None,
            None,
            None,
            true,
        ).unwrap();

        let updated_history = db.get_history().unwrap();
        assert_eq!(updated_history.len(), 1);
        assert_eq!(updated_history[0].percentage, 90);
        assert!(updated_history[0].completed);

        db.clear_history().unwrap();
        let empty_history = db.get_history().unwrap();
        assert_eq!(empty_history.len(), 0);
    }

    #[test]
    fn test_mirrors_selection() {
        let db = create_test_db();
        let mirrors = db.get_mirrors().unwrap();
        assert!(!mirrors.is_empty());

        let active_url = db.get_active_mirror_url().unwrap();
        assert_eq!(active_url, "https://hdrezka.ag");

        let new_mirror = db.add_mirror("https://custom.mirror", "Custom Mirror").unwrap();
        assert!(new_mirror.is_custom);

        db.set_active_mirror(&new_mirror.id).unwrap();
        let new_active = db.get_active_mirror_url().unwrap();
        assert_eq!(new_active, "https://custom.mirror");
    }
}
