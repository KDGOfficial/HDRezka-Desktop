import { ipcMain, app, BrowserWindow, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { IPC_CHANNELS, APP_VERSION } from '../../shared/constants';
import { getMainWindow } from '../window';
import { ProviderManager } from '../../core/providers/manager';
import { AppDatabase } from '../database';
import { CatalogFilter, WatchHistoryEntry, FavoriteItem, CollectionItem, UserSettings, UpdateInfo, UpdateProgress } from '../../shared/types';

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

  // Opens the mirror in a visible window so the user passes the site's bot check; cookies land in the shared session
  ipcMain.handle(IPC_CHANNELS.VERIFY_MIRROR, (event, targetMirror?: string) => {
    return new Promise<boolean>((resolve) => {
      let mirror = targetMirror || providerManager.getProvider().getActiveMirror();
      // hdrezka.ag has broken Anubis scripts (404 on main.mjs); redirect to working mirror
      if (!mirror || mirror.includes('hdrezka.ag')) {
        mirror = 'https://hdrezka-home.tv';
        providerManager.getProvider().setActiveMirror(mirror);
        db.saveSettings({ app: { ...db.getSettings().app, activeMirror: mirror } });
      }

      const win = new BrowserWindow({
        width: 960,
        height: 720,
        center: true,
        title: 'Проверка HDRezka — Пройдите проверку (окно закроется автоматически)',
        autoHideMenuBar: true,
        show: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      win.focus();

      let isClosed = false;
      const checkPassed = async () => {
        if (isClosed || win.isDestroyed()) return;
        try {
          const isSiteLoaded = await win.webContents.executeJavaScript(
            `!!(document.querySelector('.b-content') || document.querySelector('.b-post') || document.querySelector('.b-top') || document.querySelector('#search-field') || document.querySelector('.b-users__login') || document.querySelector('.b-sidecover'))`
          ).catch(() => false);

          if (isSiteLoaded) {
            isClosed = true;
            clearInterval(timer);
            providerManager.getProvider().setActiveMirror(mirror);
            db.saveSettings({ app: { ...db.getSettings().app, activeMirror: mirror } });
            setTimeout(() => {
              if (!win.isDestroyed()) win.close();
            }, 600);
          }
        } catch (_) {}
      };

      const timer = setInterval(checkPassed, 1000);
      win.webContents.on('did-finish-load', checkPassed);

      win.on('closed', () => {
        isClosed = true;
        clearInterval(timer);
        resolve(true);
      });

      win.loadURL(mirror).catch(() => {});
    });
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
  let downloadedUpdatePath: string | null = null;
  let isDownloading = false;

  function downloadFile(url: string, destPath: string, onProgress: (transferred: number, total: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const makeRequest = (currentUrl: string, redirectCount = 0) => {
        if (redirectCount > 8) {
          return reject(new Error('Too many redirects'));
        }
        const client = currentUrl.startsWith('https') ? https : http;
        const req = client.get(
          currentUrl,
          {
            headers: {
              'User-Agent': 'HDRezka-Desktop',
              'Accept': 'application/octet-stream, */*',
            },
          },
          (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
              return makeRequest(res.headers.location, redirectCount + 1);
            }
            if ((res.statusCode || 0) >= 400) {
              return reject(new Error(`Download failed with status ${res.statusCode}`));
            }
            const total = parseInt(res.headers['content-length'] || '0', 10);
            let transferred = 0;
            const file = fs.createWriteStream(destPath);
            res.on('data', (chunk: Buffer) => {
              transferred += chunk.length;
              onProgress(transferred, total);
            });
            res.pipe(file);
            file.on('finish', () => {
              file.close(() => resolve());
            });
            file.on('error', (err) => {
              fs.unlink(destPath, () => {});
              reject(err);
            });
          }
        );
        req.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      };
      makeRequest(url);
    });
  }

  ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, async (): Promise<UpdateInfo> => {
    const currentVersion = app.getVersion() || APP_VERSION;
    try {
      const res = await fetch('https://api.github.com/repos/KDGOfficial/HDRezka-Desktop/releases/latest', {
        headers: { 'User-Agent': 'HDRezka-Desktop' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const release = await res.json();
        const latestTag = release.tag_name ? release.tag_name.replace(/^v/, '') : currentVersion;
        const assets: any[] = Array.isArray(release.assets) ? release.assets : [];
        const setupAsset =
          assets.find((a) => a.name?.endsWith('.exe') && a.name?.includes('Setup')) ||
          assets.find((a) => a.name?.endsWith('.exe')) ||
          null;

        const hasUpdate = latestTag.localeCompare(currentVersion, undefined, { numeric: true }) > 0;

        return {
          currentVersion,
          latestVersion: latestTag,
          hasUpdate,
          releaseNotes: release.body || '',
          releaseDate: release.published_at,
          downloadUrl: release.html_url,
          assetName: setupAsset?.name,
          assetUrl: setupAsset?.browser_download_url,
          assetSize: setupAsset?.size,
        };
      }
    } catch (e) {
      console.warn('[AutoUpdate] Check failed:', e);
    }

    return {
      currentVersion,
      latestVersion: currentVersion,
      hasUpdate: false,
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.DOWNLOAD_UPDATE,
    async (_, assetUrl?: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      if (isDownloading) {
        return { success: false, error: 'Download already in progress' };
      }

      let targetUrl = assetUrl;
      let targetFileName = 'HDREZKA-Setup-update.exe';

      if (!targetUrl) {
        try {
          const res = await fetch('https://api.github.com/repos/KDGOfficial/HDRezka-Desktop/releases/latest', {
            headers: { 'User-Agent': 'HDRezka-Desktop' },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const release = await res.json();
            const assets: any[] = Array.isArray(release.assets) ? release.assets : [];
            const setupAsset =
              assets.find((a) => a.name?.endsWith('.exe') && a.name?.includes('Setup')) ||
              assets.find((a) => a.name?.endsWith('.exe'));
            if (setupAsset?.browser_download_url) {
              targetUrl = setupAsset.browser_download_url;
              targetFileName = setupAsset.name || targetFileName;
            }
          }
        } catch (err: any) {
          return { success: false, error: err?.message || 'Could not fetch release asset URL' };
        }
      }

      if (!targetUrl) {
        return { success: false, error: 'No download asset URL available' };
      }

      const tempDir = app.getPath('temp');
      const destPath = path.join(tempDir, targetFileName);
      isDownloading = true;
      const win = getMainWindow();

      try {
        win?.webContents.send(IPC_CHANNELS.ON_UPDATE_PROGRESS, {
          percent: 0,
          transferredBytes: 0,
          totalBytes: 0,
          status: 'downloading',
        } as UpdateProgress);

        let lastReport = 0;
        await downloadFile(targetUrl, destPath, (transferred, total) => {
          const now = Date.now();
          if (now - lastReport > 200 || transferred === total) {
            lastReport = now;
            const percent = total > 0 ? Math.round((transferred / total) * 100) : 0;
            win?.webContents.send(IPC_CHANNELS.ON_UPDATE_PROGRESS, {
              percent,
              transferredBytes: transferred,
              totalBytes: total,
              status: 'downloading',
              filePath: destPath,
            } as UpdateProgress);
          }
        });

        downloadedUpdatePath = destPath;
        win?.webContents.send(IPC_CHANNELS.ON_UPDATE_PROGRESS, {
          percent: 100,
          transferredBytes: 0,
          totalBytes: 0,
          status: 'ready',
          filePath: destPath,
        } as UpdateProgress);

        return { success: true, filePath: destPath };
      } catch (err: any) {
        win?.webContents.send(IPC_CHANNELS.ON_UPDATE_PROGRESS, {
          percent: 0,
          transferredBytes: 0,
          totalBytes: 0,
          status: 'error',
          error: err?.message || 'Download failed',
        } as UpdateProgress);
        return { success: false, error: err?.message };
      } finally {
        isDownloading = false;
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.INSTALL_UPDATE, async () => {
    if (!downloadedUpdatePath || !fs.existsSync(downloadedUpdatePath)) {
      return false;
    }
    try {
      shell.openPath(downloadedUpdatePath);
      setTimeout(() => {
        app.quit();
      }, 1500);
      return true;
    } catch (e) {
      console.error('[AutoUpdate] Launch installer failed:', e);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL_URL, (_, url: string) => {
    if (typeof url === 'string' && /^https:\/\/(github\.com|objects\.githubusercontent\.com)\//.test(url)) return shell.openExternal(url);
    return false;
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
