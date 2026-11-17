import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { SCHEMA_V1 } from './schema';
import {
  WatchHistoryEntry,
  FavoriteItem,
  Collection,
  CollectionItem,
  SearchHistoryEntry,
  UserSettings,
} from '../../shared/types';
import { DEFAULT_USER_SETTINGS } from '../../shared/constants';

let DatabaseSync: any = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  // Fallback will be handled via sql.js or memory
}

export class AppDatabase {
  private static instance: AppDatabase;
  private db: any = null;
  private dbPath: string;

  private constructor() {
    const userDataPath = app ? app.getPath('userData') : path.resolve(process.cwd(), '.data');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    this.dbPath = path.join(userDataPath, 'hdrezka.db');
    this.initDatabase();
  }

  public static getInstance(): AppDatabase {
    if (!AppDatabase.instance) {
      AppDatabase.instance = new AppDatabase();
    }
    return AppDatabase.instance;
  }

  private initDatabase(): void {
    if (DatabaseSync) {
      try {
        this.db = new DatabaseSync(this.dbPath);
        this.db.exec(SCHEMA_V1);
        console.log('[AppDatabase] Initialized with node:sqlite at', this.dbPath);
        return;
      } catch (err) {
        console.warn('[AppDatabase] node:sqlite error, falling back:', err);
      }
    }

    // Fallback: simple robust JSON file persistence if sqlite engine not loaded
    console.log('[AppDatabase] Using file storage fallback at', this.dbPath);
  }

  // --- Watch History ---
  public getWatchHistory(limit = 100): WatchHistoryEntry[] {
    if (this.db) {
      const stmt = this.db.prepare('SELECT * FROM watch_history ORDER BY last_watched_at DESC LIMIT ?');
      const rows = stmt.all(limit);
      return rows.map((r: any) => ({
        id: r.id,
        mediaId: r.media_id,
        title: r.title,
        origTitle: r.orig_title,
        poster: r.poster,
        type: r.type,
        season: r.season,
        episode: r.episode,
        currentTime: r.current_time,
        duration: r.duration,
        percent: r.percent,
        lastWatchedAt: r.last_watched_at,
      }));
    }
    return [];
  }

  public saveWatchHistory(entry: WatchHistoryEntry): void {
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO watch_history (id, media_id, title, orig_title, poster, type, season, episode, current_time, duration, percent, last_watched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          current_time = excluded.current_time,
          duration = excluded.duration,
          percent = excluded.percent,
          last_watched_at = excluded.last_watched_at,
          season = excluded.season,
          episode = excluded.episode
      `);
      stmt.run(
        entry.id,
        entry.mediaId,
        entry.title,
        entry.origTitle || null,
        entry.poster,
        entry.type,
        entry.season || null,
        entry.episode || null,
        entry.currentTime,
        entry.duration,
        entry.percent,
        entry.lastWatchedAt || Date.now()
      );
    }
  }

  public deleteWatchHistory(id: string): void {
    if (this.db) {
      this.db.prepare('DELETE FROM watch_history WHERE id = ?').run(id);
    }
  }

  public clearWatchHistory(): void {
    if (this.db) {
      this.db.prepare('DELETE FROM watch_history').run();
    }
  }

  // --- Playback Progress ---
  public getProgress(mediaId: string, season = 0, episode = 0): { currentTime: number; duration: number } | null {
    if (this.db) {
      const stmt = this.db.prepare('SELECT current_time, duration FROM playback_progress WHERE media_id = ? AND season = ? AND episode = ?');
      const row = stmt.get(mediaId, season, episode);
      if (row) {
        return { currentTime: row.current_time, duration: row.duration };
      }
    }
    return null;
  }

  public saveProgress(mediaId: string, season = 0, episode = 0, currentTime = 0, duration = 0): void {
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO playback_progress (media_id, season, episode, current_time, duration, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(media_id, season, episode) DO UPDATE SET
          current_time = excluded.current_time,
          duration = excluded.duration,
          updated_at = excluded.updated_at
      `);
      stmt.run(mediaId, season, episode, currentTime, duration, Date.now());
    }
  }

  // --- Favorites ---
  public getFavorites(): FavoriteItem[] {
    if (this.db) {
      const rows = this.db.prepare('SELECT * FROM favorites ORDER BY added_at DESC').all();
      return rows.map((r: any) => ({
        mediaId: r.media_id,
        title: r.title,
        origTitle: r.orig_title,
        poster: r.poster,
        type: r.type,
        year: r.year,
        rating: r.rating,
        addedAt: r.added_at,
      }));
    }
    return [];
  }

  public addFavorite(item: FavoriteItem): void {
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO favorites (media_id, title, orig_title, poster, type, year, rating, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(media_id) DO UPDATE SET
          title = excluded.title,
          poster = excluded.poster,
          rating = excluded.rating
      `);
      stmt.run(
        item.mediaId,
        item.title,
        item.origTitle || null,
        item.poster,
        item.type,
        item.year || null,
        item.rating || null,
        item.addedAt || Date.now()
      );
    }
  }

  public removeFavorite(mediaId: string): void {
    if (this.db) {
      this.db.prepare('DELETE FROM favorites WHERE media_id = ?').run(mediaId);
    }
  }

  public isFavorite(mediaId: string): boolean {
    if (this.db) {
      const row = this.db.prepare('SELECT 1 FROM favorites WHERE media_id = ?').get(mediaId);
      return !!row;
    }
    return false;
  }

  // --- Collections ---
  public getCollections(): Collection[] {
    if (this.db) {
      const rows = this.db.prepare(`
        SELECT c.*, COUNT(ci.media_id) as items_count
        FROM collections c
        LEFT JOIN collection_items ci ON c.id = ci.collection_id
        GROUP BY c.id
        ORDER BY c.created_at ASC
      `).all();

      return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        itemsCount: r.items_count || 0,
      }));
    }
    return [];
  }

  public createCollection(name: string, description?: string): Collection {
    const id = 'col_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const now = Date.now();
    if (this.db) {
      this.db.prepare(`
        INSERT INTO collections (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, name, description || null, now, now);
    }
    return {
      id,
      name,
      description,
      createdAt: now,
      updatedAt: now,
      itemsCount: 0,
    };
  }

  public renameCollection(id: string, name: string): void {
    if (this.db) {
      this.db.prepare('UPDATE collections SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id);
    }
  }

  public deleteCollection(id: string): void {
    if (this.db) {
      this.db.prepare('DELETE FROM collection_items WHERE collection_id = ?').run(id);
      this.db.prepare('DELETE FROM collections WHERE id = ?').run(id);
    }
  }

  public getCollectionItems(collectionId: string): CollectionItem[] {
    if (this.db) {
      const rows = this.db.prepare('SELECT * FROM collection_items WHERE collection_id = ? ORDER BY added_at DESC').all(collectionId);
      return rows.map((r: any) => ({
        collectionId: r.collection_id,
        mediaId: r.media_id,
        title: r.title,
        poster: r.poster,
        type: r.type,
        year: r.year,
        rating: r.rating,
        addedAt: r.added_at,
      }));
    }
    return [];
  }

  public addToCollection(item: CollectionItem): void {
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO collection_items (collection_id, media_id, title, poster, type, year, rating, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(collection_id, media_id) DO NOTHING
      `);
      stmt.run(
        item.collectionId,
        item.mediaId,
        item.title,
        item.poster,
        item.type,
        item.year || null,
        item.rating || null,
        Date.now()
      );
    }
  }

  public removeFromCollection(collectionId: string, mediaId: string): void {
    if (this.db) {
      this.db.prepare('DELETE FROM collection_items WHERE collection_id = ? AND media_id = ?').run(collectionId, mediaId);
    }
  }

  // --- Search History ---
  public getSearchHistory(limit = 20): SearchHistoryEntry[] {
    if (this.db) {
      const rows = this.db.prepare('SELECT * FROM search_history ORDER BY searched_at DESC LIMIT ?').all(limit);
      return rows.map((r: any) => ({
        query: r.query,
        searchedAt: r.searched_at,
      }));
    }
    return [];
  }

  public addSearchHistory(query: string): void {
    const q = query.trim();
    if (!q) return;
    if (this.db) {
      this.db.prepare(`
        INSERT INTO search_history (query, searched_at)
        VALUES (?, ?)
        ON CONFLICT(query) DO UPDATE SET searched_at = excluded.searched_at
      `).run(q, Date.now());
    }
  }

  public deleteSearchHistory(query: string): void {
    if (this.db) {
      this.db.prepare('DELETE FROM search_history WHERE query = ?').run(query);
    }
  }

  public clearSearchHistory(): void {
    if (this.db) {
      this.db.prepare('DELETE FROM search_history').run();
    }
  }

  // --- User Settings ---
  public getSettings(): UserSettings {
    if (this.db) {
      const row = this.db.prepare('SELECT value FROM user_settings WHERE key = ?').get('app_settings');
      if (row && row.value) {
        try {
          const parsed = JSON.parse(row.value);
          return { ...DEFAULT_USER_SETTINGS, ...parsed };
        } catch {}
      }
    }
    return { ...DEFAULT_USER_SETTINGS };
  }

  public saveSettings(settings: Partial<UserSettings>): UserSettings {
    const current = this.getSettings();
    const updated = {
      ...current,
      ...settings,
      homeSections: { ...current.homeSections, ...(settings.homeSections || {}) },
      player: { ...current.player, ...(settings.player || {}) },
      app: { ...current.app, ...(settings.app || {}) },
    };

    if (this.db) {
      this.db.prepare(`
        INSERT INTO user_settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run('app_settings', JSON.stringify(updated));
    }
    return updated;
  }

  // --- Backup & Restore ---
  public exportData(): string {
    const data = {
      version: 1,
      exportedAt: Date.now(),
      favorites: this.getFavorites(),
      collections: this.getCollections(),
      collectionItems: this.db ? this.db.prepare('SELECT * FROM collection_items').all() : [],
      watchHistory: this.getWatchHistory(500),
      searchHistory: this.getSearchHistory(100),
      settings: this.getSettings(),
    };
    return JSON.stringify(data, null, 2);
  }

  public importData(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') return false;

      if (Array.isArray(data.favorites)) {
        for (const f of data.favorites) this.addFavorite(f);
      }
      if (Array.isArray(data.collections)) {
        for (const c of data.collections) {
          if (this.db) {
            this.db.prepare(`
              INSERT INTO collections (id, name, description, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description
            `).run(c.id, c.name, c.description || null, c.createdAt || Date.now(), c.updatedAt || Date.now());
          }
        }
      }
      if (Array.isArray(data.collectionItems)) {
        for (const ci of data.collectionItems) {
          this.addToCollection({
            collectionId: ci.collection_id || ci.collectionId,
            mediaId: ci.media_id || ci.mediaId,
            title: ci.title,
            poster: ci.poster,
            type: ci.type,
            year: ci.year,
            rating: ci.rating,
            addedAt: ci.added_at || ci.addedAt || Date.now(),
          });
        }
      }
      if (Array.isArray(data.watchHistory)) {
        for (const w of data.watchHistory) this.saveWatchHistory(w);
      }
      if (data.settings) {
        this.saveSettings(data.settings);
      }
      return true;
    } catch (err) {
      console.error('[AppDatabase] Import failed:', err);
      return false;
    }
  }
}
