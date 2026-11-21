import { ipcMain, app, BrowserWindow, shell, session } from 'electron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { spawn } from 'child_process';
import { IPC_CHANNELS, APP_VERSION, DEFAULT_MIRRORS, isBadMirrorUrl } from '../../shared/constants';
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

  ipcMain.handle(IPC_CHANNELS.WINDOW_UNMAXIMIZE, () => {
    const win = getMainWindow();
    if (win && win.isMaximized()) {
      win.unmaximize();
    }
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_BOUNDS, (_, bounds: { x?: number; y?: number; width?: number; height?: number }) => {
    const win = getMainWindow();
    if (!win) return null;
    if (win.isMaximized()) win.unmaximize();
    const cur = win.getBounds();
    win.setBounds({
      x: bounds.x !== undefined ? Math.round(bounds.x) : cur.x,
      y: bounds.y !== undefined ? Math.round(bounds.y) : cur.y,
      width: bounds.width !== undefined ? Math.max(320, Math.round(bounds.width)) : cur.width,
      height: bounds.height !== undefined ? Math.max(180, Math.round(bounds.height)) : cur.height,
    });
    return win.getBounds();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_BOUNDS, () => {
    const win = getMainWindow();
    return win ? win.getBounds() : null;
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, (_, flag?: boolean) => {
    const win = getMainWindow();
    if (!win) return false;
    const newState = flag !== undefined ? flag : !win.isAlwaysOnTop();
    win.setAlwaysOnTop(newState);
    return newState;
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_ALWAYS_ON_TOP, () => {
    return getMainWindow()?.isAlwaysOnTop() ?? false;
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
    const curSettings = db.getSettings();
    const mirrors = (curSettings.app?.mirrors || DEFAULT_MIRRORS).filter((m) => !isBadMirrorUrl(m));
    return await provider.checkMirrors(mirrors);
  });

  ipcMain.handle(IPC_CHANNELS.FIND_ONLINE_MIRRORS, async () => {
    const provider = providerManager.getProvider();
    const result = await provider.findOnlineMirrors();
    if (result.added.length > 0) {
      const curSettings = db.getSettings();
      // Combine newly found mirrors with existing settings, filtering out bad domains
      const existing = (curSettings.app?.mirrors || []).filter((m) => !isBadMirrorUrl(m));
      const validAdded = result.added.filter((m) => !isBadMirrorUrl(m));
      const merged = Array.from(new Set([...existing, ...validAdded]));
      db.saveSettings({
        app: {
          ...curSettings.app,
          mirrors: merged,
        },
      });
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.SET_ACTIVE_MIRROR, (_, mirror: string) => {
    const provider = providerManager.getProvider();
    provider.setActiveMirror(mirror);
    db.saveSettings({ app: { ...db.getSettings().app, activeMirror: mirror } });
    return provider.getActiveMirror();
  });

  // Helper to remove any stale bot verification cookies that cause HTTP 500 blank screen
  async function clearStaleVerificationCookies(targetDomainOrUrl: string) {
    try {
      let host = 'hdrezka.kim';
      try {
        if (targetDomainOrUrl.startsWith('http')) {
          host = new URL(targetDomainOrUrl).hostname;
        } else {
          host = targetDomainOrUrl;
        }
      } catch (_) {}

      const allCookies = await session.defaultSession.cookies.get({}).catch(() => []);
      for (const c of allCookies) {
        const name = c.name.toLowerCase();
        if (
          name.includes('anubis') ||
          name.includes('cf_clearance') ||
          name.includes('_vc_id') ||
          name.includes('challenge')
        ) {
          const cookieDomain = c.domain?.startsWith('.') ? c.domain.slice(1) : (c.domain || host);
          const urlsToTry = [
            `https://${cookieDomain}${c.path || '/'}`,
            `http://${cookieDomain}${c.path || '/'}`,
          ];
          for (const u of urlsToTry) {
            await session.defaultSession.cookies.remove(u, c.name).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('[VerifyMirror] Failed to clear stale cookies:', e);
    }
  }

  // Opens the mirror in a visible window so the user passes the site's bot check; cookies land in the shared session
  ipcMain.handle(IPC_CHANNELS.VERIFY_MIRROR, async (event, targetMirrorOrUrl?: string) => {
    const activeMirror = providerManager.getProvider().getActiveMirror();
    let mirror = activeMirror;
    let loadUrl = activeMirror;

    const rawTarget = targetMirrorOrUrl?.trim();
    if (rawTarget) {
      if (rawTarget.startsWith('http')) {
        try {
          const parsed = new URL(rawTarget);
          if (parsed.pathname && parsed.pathname.length > 1) {
            // Target is a specific page URL: use activeMirror as origin
            mirror = activeMirror;
            loadUrl = `${activeMirror}${parsed.pathname}${parsed.search}`;
          } else {
            // Target is a mirror origin
            mirror = parsed.origin;
            loadUrl = parsed.origin;
          }
        } catch (_) {
          loadUrl = activeMirror;
          mirror = activeMirror;
        }
      } else if (rawTarget.startsWith('/') && rawTarget.includes('.html')) {
        mirror = activeMirror;
        loadUrl = `${activeMirror}${rawTarget}`;
      } else {
        const id = rawTarget.replace(/[^\d]/g, '');
        const canonical = id ? (providerManager.getProvider() as any).mediaUrlCache?.get(id) : '';
        if (canonical && canonical.startsWith('http')) {
          try {
            const parsed = new URL(canonical);
            loadUrl = `${activeMirror}${parsed.pathname}`;
          } catch (_) {
            loadUrl = canonical;
          }
        } else {
          loadUrl = activeMirror;
        }
        mirror = activeMirror;
      }
    }

    // Normalize known dead/broken/phishing mirrors to active stable HDRezka mirror
    if (isBadMirrorUrl(mirror)) {
      mirror = DEFAULT_MIRRORS[0];
      loadUrl = DEFAULT_MIRRORS[0];
      providerManager.getProvider().setActiveMirror(mirror);
      db.saveSettings({ app: { ...db.getSettings().app, activeMirror: mirror } });
    }

    // Proactively clear stale verification cookies to avoid HTTP 500
    await clearStaleVerificationCookies(mirror);

    return new Promise<boolean>((resolve) => {
      const win = new BrowserWindow({
        width: 960,
        height: 720,
        center: true,
        title: 'Проверка HDRezka — Пройдите проверку (окно закроется автоматически)',
        backgroundColor: '#090a0f',
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
          // 1. Inspect DOM state in verification window
          const domState = await win.webContents.executeJavaScript(`
            (() => {
              const hasRezkaContent = !!(
                document.querySelector('.b-content') ||
                document.querySelector('.b-post') ||
                document.querySelector('.b-top') ||
                document.querySelector('#search-field') ||
                document.querySelector('.b-users__login') ||
                document.querySelector('.b-sidecover')
              );
              const isChallengeActive = !!(
                document.querySelector('#anubis_challenge') ||
                document.querySelector('#anubis-main') ||
                document.querySelector('#challenge-running') ||
                document.querySelector('.cf-browser-verification') ||
                document.querySelector('#cf-wrapper') ||
                (document.title && (
                  document.title.includes('Проверяем, что вы не бот') ||
                  document.title.includes('Just a moment') ||
                  document.title.includes('Attention Required')
                ))
              );
              return { hasRezkaContent, isChallengeActive };
            })()
          `).catch(() => ({ hasRezkaContent: false, isChallengeActive: true }));

          // NEVER close while challenge is actively running on page
          if (domState.isChallengeActive) {
            return;
          }

          // 2. Check if valid Anubis / Cloudflare verification auth cookies are present
          const sessionCookies = await session.defaultSession.cookies.get({ url: mirror }).catch(() => []);
          const hasValidAuthCookie = sessionCookies.some(
            (c) =>
              (c.name.toLowerCase().includes('anubis-auth') && c.value && c.value.length > 10) ||
              (c.name.toLowerCase().includes('cf_clearance') && c.value && c.value.length > 10)
          );

          // Verification is passed when real content loaded or valid auth cookie present without active challenge
          if (domState.hasRezkaContent || hasValidAuthCookie) {
            isClosed = true;
            clearInterval(timer);
            cleanupCookieListener();
            providerManager.getProvider().setActiveMirror(mirror);
            db.saveSettings({ app: { ...db.getSettings().app, activeMirror: mirror } });
            setTimeout(() => {
              if (!win.isDestroyed()) win.close();
            }, 600);
          }
        } catch (_) {}
      };

      // Instantly react when Anubis sets a newly solved auth cookie in session
      const onCookieChanged = (_: any, cookie: any, __: any, removed: boolean) => {
        if (!removed && cookie?.name && cookie.name.toLowerCase().includes('anubis-auth') && cookie.value && cookie.value.length > 10) {
          setTimeout(checkPassed, 400);
        }
      };
      session.defaultSession.cookies.on('changed', onCookieChanged);
      const cleanupCookieListener = () => {
        try {
          session.defaultSession.cookies.removeListener('changed', onCookieChanged);
        } catch (_) {}
      };

      const timer = setInterval(checkPassed, 800);
      win.webContents.on('did-finish-load', () => setTimeout(checkPassed, 400));

      win.on('closed', () => {
        isClosed = true;
        clearInterval(timer);
        cleanupCookieListener();
        resolve(true);
      });

      win.loadURL(loadUrl).catch(() => {});
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
      let isDone = false;
      const finishOnce = (err?: any) => {
        if (isDone) return;
        isDone = true;
        if (err) {
          fs.unlink(destPath, () => {});
          reject(err);
        } else {
          resolve();
        }
      };

      const makeRequest = (currentUrl: string, redirectCount = 0) => {
        if (redirectCount > 8) {
          return finishOnce(new Error('Too many redirects'));
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
              res.resume();
              return makeRequest(res.headers.location, redirectCount + 1);
            }
            if ((res.statusCode || 0) >= 400) {
              return finishOnce(new Error(`Download failed with status ${res.statusCode}`));
            }
            const total = parseInt(res.headers['content-length'] || '0', 10);
            let transferred = 0;
            const file = fs.createWriteStream(destPath);

            res.on('data', (chunk: Buffer) => {
              transferred += chunk.length;
              onProgress(transferred, total);
              if (total > 0 && transferred >= total) {
                setTimeout(() => finishOnce(), 250);
              }
            });

            res.pipe(file);

            file.on('finish', () => {
              finishOnce();
            });

            file.on('error', (err) => {
              finishOnce(err);
            });

            res.on('error', (err) => {
              finishOnce(err);
            });
          }
        );

        req.on('error', (err) => {
          finishOnce(err);
        });

        req.setTimeout(60000, () => {
          req.destroy(new Error('Download connection timeout'));
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
        // If no direct .exe asset is attached to GitHub release yet,
        // open the GitHub releases page in default browser
        const fallbackUrl = 'https://github.com/KDGOfficial/HDRezka-Desktop/releases/latest';
        shell.openExternal(fallbackUrl);
        return {
          success: true,
          openedInBrowser: true,
          error: 'Файл обновления формируется на CI/CD или доступен на странице релиза GitHub.',
        };
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
        const finalStat = await fs.promises.stat(destPath).catch(() => null);
        const finalSize = finalStat ? finalStat.size : 0;
        win?.webContents.send(IPC_CHANNELS.ON_UPDATE_PROGRESS, {
          percent: 100,
          transferredBytes: finalSize,
          totalBytes: finalSize,
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

  let justUpdatedFlag = process.argv.includes('--just-updated');

  ipcMain.handle(IPC_CHANNELS.CHECK_JUST_UPDATED, () => {
    const flag = justUpdatedFlag;
    justUpdatedFlag = false;
    return flag;
  });

  ipcMain.handle(IPC_CHANNELS.INSTALL_UPDATE, async () => {
    // Save a comprehensive library & settings safety backup before proceeding with installer
    try {
      db.createSafetyBackup();
    } catch (e) {
      console.warn('[AutoUpdate] Safety backup warning:', e);
    }
    if (!downloadedUpdatePath || !fs.existsSync(downloadedUpdatePath)) {
      const tempDir = app.getPath('temp');
      const candidatePaths = [
        path.join(tempDir, 'HDREZKA-Setup-update.exe'),
        path.join(tempDir, 'HDREZKA-Setup.exe'),
      ];
      const found = candidatePaths.find((p) => fs.existsSync(p));
      if (found) {
        downloadedUpdatePath = found;
      } else {
        return false;
      }
    }
    const win = getMainWindow();
    try {
      // Notify UI that installation process has begun
      win?.webContents.send(IPC_CHANNELS.ON_UPDATE_PROGRESS, {
        percent: 100,
        transferredBytes: 0,
        totalBytes: 0,
        status: 'installing',
      } as UpdateProgress);

      const pid = process.pid;
      const installerPath = downloadedUpdatePath;
      const tempDir = app.getPath('temp');
      const targetExe = process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe');

      const batPath = path.join(tempDir, 'hdrezka-update-runner.bat');
      const vbsPath = path.join(tempDir, 'hdrezka-update-runner.vbs');

      const batContent = `@echo off
setlocal
set "PARENT_PID=${pid}"
set "INSTALLER=${installerPath}"
set "APP_EXE=${targetExe}"

:wait_pid
timeout /t 1 /nobreak >nul
tasklist /fi "PID eq %PARENT_PID%" 2>nul | find "%PARENT_PID%" >nul
if not errorlevel 1 goto wait_pid

:: Run installer silently to apply update quickly without dialog deadlocks
start /wait "" "%INSTALLER%" /S

:: Give the system a brief moment to finish writing files
timeout /t 2 /nobreak >nul

:: Relaunch the updated application
if exist "%APP_EXE%" (
    start "" "%APP_EXE%" --just-updated
    exit
)

set "DEFAULT_EXE=%LOCALAPPDATA%\\Programs\\hdrezka-desktop\\HDREZKA Desktop.exe"
if exist "%DEFAULT_EXE%" (
    start "" "%DEFAULT_EXE%" --just-updated
    exit
)

set "PROG_EXE=%ProgramFiles%\\HDREZKA Desktop\\HDREZKA Desktop.exe"
if exist "%PROG_EXE%" (
    start "" "%PROG_EXE%" --just-updated
    exit
)
exit
`;
      fs.writeFileSync(batPath, batContent, 'utf-8');

      // VBS wrapper to run the batch script completely hidden (no black CMD popup)
      const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run Chr(34) & "${batPath.replace(/\\/g, '\\\\')}" & Chr(34), 0, False\n`;
      fs.writeFileSync(vbsPath, vbsContent, 'utf-8');

      try {
        const runner = spawn('wscript.exe', [vbsPath], {
          detached: true,
          stdio: 'ignore',
        });
        runner.unref();
      } catch {
        // Fallback to direct cmd spawn if wscript is restricted
        const runner = spawn('cmd.exe', ['/c', batPath], {
          detached: true,
          stdio: 'ignore',
        });
        runner.unref();
      }

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
    if (
      typeof url === 'string' &&
      /^https:\/\/(github\.com|objects\.githubusercontent\.com|t\.me|telegram\.me)\//i.test(url)
    ) {
      return shell.openExternal(url);
    }
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
