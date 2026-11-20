import { ipcMain, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { getMainWindow } from '../window';
import { ProviderManager } from '../../core/providers/manager';
import { AppDatabase } from '../database';
import { CatalogFilter, WatchHistoryEntry, FavoriteItem, CollectionItem, UserSettings } from '../../shared/types';

export function registerIpcHandlers(): void {
  const providerManager = ProviderManager.getInstance();
  const db = AppDatabase.getInstance();

  // --- Window Controls ---
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    getMainWindow()?.close();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    return getMainWindow()?.isMaximized() ?? false;
  });

  // --- Provider & Catalog ---
  ipcMain.handle(IPC_CHANNELS.GET_HOME_SECTIONS, async () => {
    const provider = providerManager.getProvider();
    return await provider.getHomeSections();
  });

  ipcMain.handle(IPC_CHANNELS.GET_CATALOG, async (_, filter: CatalogFilter) => {
    const provider = providerManager.getProvider();
    return await provider.getCatalog(filter);
  });

  ipcMain.handle(IPC_CHANNELS.GET_DETAILS, async (_, urlOrId: string, meta?: any) => {
    const provider = providerManager.getProvider();
    return await provider.getDetails(urlOrId, meta);
  });

  ipcMain.handle(IPC_CHANNELS.GET_SERIES_EPISODES, async (_, mediaId: string, translatorId: number) => {
    const provider = providerManager.getProvider();
    return await provider.getSeriesEpisodes(mediaId, translatorId);
  });

  ipcMain.handle(IPC_CHANNELS.GET_STREAM, async (_, params: any) => {
    const provider = providerManager.getProvider();
    return await provider.getStream(params);
  });

  ipcMain.handle(IPC_CHANNELS.SEARCH_FAST, async (_, query: string) => {
    const provider = providerManager.getProvider();
    return await provider.searchFast(query);
  });

  ipcMain.handle(IPC_CHANNELS.SEARCH_ADVANCED, async (_, query: string, page = 1) => {
    const provider = providerManager.getProvider();
    return await provider.searchAdvanced(query, page);
  });

  ipcMain.handle(IPC_CHANNELS.CHECK_MIRRORS, async () => {
    const provider = providerManager.getProvider();
    return await provider.checkMirrors();
  });

  ipcMain.handle(IPC_CHANNELS.SET_ACTIVE_MIRROR, (_, mirror: string) => {
    const provider = providerManager.getProvider();
    provider.setActiveMirror(mirror);
    db.saveSettings({ app: { ...db.getSettings().app, activeMirror: mirror } });
    return provider.getActiveMirror();
  });

  // --- Watch History ---
  ipcMain.handle(IPC_CHANNELS.GET_WATCH_HISTORY, (_, limit?: number) => {
    return db.getWatchHistory(limit);
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_WATCH_HISTORY, (_, entry: WatchHistoryEntry) => {
    db.saveWatchHistory(entry);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.DELETE_WATCH_HISTORY, (_, id: string) => {
    db.deleteWatchHistory(id);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.CLEAR_WATCH_HISTORY, () => {
    db.clearWatchHistory();
    return true;
  });

  // --- Playback Progress ---
  ipcMain.handle(IPC_CHANNELS.GET_PROGRESS, (_, mediaId: string, season = 0, episode = 0) => {
    return db.getProgress(mediaId, season, episode);
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_PROGRESS, (_, mediaId: string, season = 0, episode = 0, currentTime = 0, duration = 0) => {
    db.saveProgress(mediaId, season, episode, currentTime, duration);
    return true;
  });

  // --- Favorites ---
  ipcMain.handle(IPC_CHANNELS.GET_FAVORITES, () => {
    return db.getFavorites();
  });

  ipcMain.handle(IPC_CHANNELS.ADD_FAVORITE, (_, item: FavoriteItem) => {
    db.addFavorite(item);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_FAVORITE, (_, mediaId: string) => {
    db.removeFavorite(mediaId);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.IS_FAVORITE, (_, mediaId: string) => {
    return db.isFavorite(mediaId);
  });

  // --- Collections ---
  ipcMain.handle(IPC_CHANNELS.GET_COLLECTIONS, () => {
    return db.getCollections();
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_COLLECTION, (_, name: string, description?: string) => {
    return db.createCollection(name, description);
  });

  ipcMain.handle(IPC_CHANNELS.RENAME_COLLECTION, (_, id: string, name: string) => {
    db.renameCollection(id, name);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.DELETE_COLLECTION, (_, id: string) => {
    db.deleteCollection(id);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.GET_COLLECTION_ITEMS, (_, collectionId: string) => {
    return db.getCollectionItems(collectionId);
  });

  ipcMain.handle(IPC_CHANNELS.ADD_TO_COLLECTION, (_, item: CollectionItem) => {
    db.addToCollection(item);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_FROM_COLLECTION, (_, collectionId: string, mediaId: string) => {
    db.removeFromCollection(collectionId, mediaId);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_DATA, () => {
    return db.exportData();
  });

  ipcMain.handle(IPC_CHANNELS.IMPORT_DATA, (_, jsonString: string) => {
    return db.importData(jsonString);
  });

  // --- Search History ---
  ipcMain.handle(IPC_CHANNELS.GET_SEARCH_HISTORY, (_, limit?: number) => {
    return db.getSearchHistory(limit);
  });

  ipcMain.handle(IPC_CHANNELS.ADD_SEARCH_HISTORY, (_, query: string) => {
    db.addSearchHistory(query);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.DELETE_SEARCH_HISTORY, (_, query: string) => {
    db.deleteSearchHistory(query);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.CLEAR_SEARCH_HISTORY, () => {
    db.clearSearchHistory();
    return true;
  });

  // --- User Settings ---
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return db.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (_, settings: Partial<UserSettings>) => {
    const updated = db.saveSettings(settings);
    if (settings.app?.activeMirror) {
      providerManager.getProvider().setActiveMirror(settings.app.activeMirror);
    }
    return updated;
  });

  // --- Updates & Cache ---
  ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, async () => {
    try {
      const res = await fetch('https://api.github.com/repos/KDGOfficial/HDRezka-Desktop/releases/latest', {
        headers: { 'User-Agent': 'HDRezka-Desktop' },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const release = await res.json();
        const latestTag = release.tag_name ? release.tag_name.replace(/^v/, '') : '1.0.0';
        const currentVersion = app.getVersion();
        return {
          currentVersion,
          latestVersion: latestTag,
          hasUpdate: latestTag !== currentVersion,
          releaseNotes: release.body,
          releaseDate: release.published_at,
          downloadUrl: release.html_url,
        };
      }
    } catch {}

    return {
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      hasUpdate: false,
    };
  });

  ipcMain.handle(IPC_CHANNELS.CLEAR_CACHE, async () => {
    const win = getMainWindow();
    if (win) {
      await win.webContents.session.clearCache();
      await win.webContents.session.clearStorageData({
        storages: ['cachestorage', 'serviceworkers'],
      });
      return true;
    }
    return false;
  });
}
