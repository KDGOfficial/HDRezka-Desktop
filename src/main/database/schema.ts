export const SCHEMA_V1 = `
-- 1. Movies Cache
CREATE TABLE IF NOT EXISTS movies_cache (
  id TEXT PRIMARY KEY,
  url TEXT,
  title TEXT NOT NULL,
  orig_title TEXT,
  poster TEXT,
  type TEXT,
  year INTEGER,
  country TEXT,
  genres TEXT,
  rating REAL,
  details_json TEXT,
  cached_at INTEGER NOT NULL
);

-- 2. Favorites
CREATE TABLE IF NOT EXISTS favorites (
  media_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  orig_title TEXT,
  poster TEXT,
  type TEXT NOT NULL,
  year INTEGER,
  rating REAL,
  added_at INTEGER NOT NULL
);

-- 3. Collections
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 4. Collection Items
CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  title TEXT NOT NULL,
  poster TEXT,
  type TEXT NOT NULL,
  year INTEGER,
  rating REAL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (collection_id, media_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

-- 5. Watch History
CREATE TABLE IF NOT EXISTS watch_history (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  title TEXT NOT NULL,
  orig_title TEXT,
  poster TEXT,
  type TEXT NOT NULL,
  season INTEGER,
  episode INTEGER,
  current_time REAL NOT NULL,
  duration REAL NOT NULL,
  percent REAL NOT NULL,
  last_watched_at INTEGER NOT NULL
);

-- 6. Search History
CREATE TABLE IF NOT EXISTS search_history (
  query TEXT PRIMARY KEY,
  searched_at INTEGER NOT NULL
);

-- 7. User Settings
CREATE TABLE IF NOT EXISTS user_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 8. Providers
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active_mirror TEXT NOT NULL,
  mirrors_json TEXT NOT NULL,
  is_enabled INTEGER DEFAULT 1,
  config_json TEXT
);

-- 9. Playback Progress
CREATE TABLE IF NOT EXISTS playback_progress (
  media_id TEXT NOT NULL,
  season INTEGER NOT NULL DEFAULT 0,
  episode INTEGER NOT NULL DEFAULT 0,
  current_time REAL NOT NULL,
  duration REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (media_id, season, episode)
);

-- Indices for rapid querying
CREATE INDEX IF NOT EXISTS idx_watch_history_time ON watch_history(last_watched_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_added ON favorites(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_items_col ON collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_search_history_time ON search_history(searched_at DESC);
`;
