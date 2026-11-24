import { ipcMain, app, BrowserWindow, shell, session } from 'electron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { spawn } from 'child_process';
import { IPC_CHANNELS, APP_VERSION, DEFAULT_MIRRORS, OPEN_MIRROR_SEEDS, HDREZKA_MIRRORS, isBadMirrorUrl, BROWSER_USER_AGENT } from '../../shared/constants';
import { getMainWindow, restoreDefaultWindowBounds } from '../window';
import { setBrowserAdBlockEnabled, getBrowserAdBlockStats } from '../main';
import { ProviderManager } from '../../core/providers/manager';
import { clearStaleAnubisCookies } from '../../core/providers/rezka/provider';
import { translateTitlesBatch, fetchSubtitleTrack } from '../../core/providers/rezka/localization';
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
    const wasPinned = win.isAlwaysOnTop();
    const newState = flag !== undefined ? flag : !wasPinned;
    win.setAlwaysOnTop(newState);
    if (wasPinned && !newState) {
      restoreDefaultWindowBounds(win);
    }
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

  ipcMain.handle(IPC_CHANNELS.PREFETCH_DETAILS, (_, items: any[]) => {
    const provider = providerManager.getProvider();
    if (Array.isArray(items) && items.length > 0 && typeof (provider as any).prefetchDetails === 'function') {
      (provider as any).prefetchDetails(items);
    }
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

  ipcMain.handle(IPC_CHANNELS.TRANSLATE_TITLES, async (_, titles: string[], targetLang: 'uk' | 'en') => {
    if (!Array.isArray(titles) || (targetLang !== 'uk' && targetLang !== 'en')) return {};
    return await translateTitlesBatch(titles, targetLang);
  });

  ipcMain.handle(IPC_CHANNELS.GET_SUBTITLE_TRACK, async (_, params: any) => {
    if (!params || (params.lang !== 'ru' && params.lang !== 'uk' && params.lang !== 'en')) return null;
    return await fetchSubtitleTrack(params);
  });

  ipcMain.handle(IPC_CHANNELS.CHECK_MIRRORS, async () => {
    const provider = providerManager.getProvider();
    const curSettings = db.getSettings();
    const cleanedMirrors = (curSettings.app?.mirrors || DEFAULT_MIRRORS).filter((m) => !isBadMirrorUrl(m));
    const seededMirrors = Array.from(new Set([...OPEN_MIRROR_SEEDS, ...HDREZKA_MIRRORS, ...cleanedMirrors]));
    const statuses = await provider.checkMirrors(seededMirrors);
    const cleanStatuses = statuses.filter((s) => s.isAvailable && !s.needsVerification);

    if (cleanStatuses.length > 0) {
      const isRezkaOpen = (url: string) =>
        !url.includes('kinobase.org') &&
        !url.includes('kinovod.pro') &&
        !url.includes('kinogo.') &&
        !url.includes('hdstudio.org');
      const sortedClean = cleanStatuses.slice().sort((a, b) => {
        const aRezka = isRezkaOpen(a.url) ? 0 : 1;
        const bRezka = isRezkaOpen(b.url) ? 0 : 1;
        if (aRezka !== bRezka) return aRezka - bRezka;
        return a.latencyMs - b.latencyMs;
      });
      const prunedMirrors = sortedClean.map((s) => s.url);
      const nextActive = isRezkaOpen(sortedClean[0].url)
        ? sortedClean[0].url
        : prunedMirrors.includes(provider.getActiveMirror())
          ? provider.getActiveMirror()
          : prunedMirrors[0];
      provider.setMirrors(prunedMirrors);
      provider.setActiveMirror(nextActive);
      if (
        nextActive !== curSettings.app?.activeMirror ||
        prunedMirrors.join('|') !== (curSettings.app?.mirrors || []).join('|')
      ) {
        db.saveSettings({
          app: {
            ...curSettings.app,
            activeMirror: nextActive,
            mirrors: prunedMirrors,
          },
        });
      }
      return sortedClean;
    }

    if (
      !curSettings.app?.mirrors ||
      seededMirrors.join('|') !== curSettings.app.mirrors.join('|')
    ) {
      db.saveSettings({ app: { ...curSettings.app, mirrors: seededMirrors } });
    }
    return statuses;
  });

  ipcMain.handle(IPC_CHANNELS.FIND_ONLINE_MIRRORS, async () => {
    const provider = providerManager.getProvider();
    const result = await provider.findOnlineMirrors();
    const best = await provider.pruneProtectedMirrors();
    const curSettings = db.getSettings();
    const merged = Array.from(
      new Set([...(provider.getMirrors() || [])].filter((m) => !isBadMirrorUrl(m)))
    );
    const nextActive = merged.includes(best)
      ? best
      : merged.includes(curSettings.app?.activeMirror)
        ? curSettings.app.activeMirror
        : (merged[0] || curSettings.app?.activeMirror);
    if (merged.length > 0) {
      provider.setMirrors(merged);
      if (nextActive) provider.setActiveMirror(nextActive);
      if (
        nextActive !== curSettings.app?.activeMirror ||
        merged.join('|') !== (curSettings.app?.mirrors || []).join('|')
      ) {
        db.saveSettings({
          app: {
            ...curSettings.app,
            activeMirror: nextActive,
            mirrors: merged,
          },
        });
      }
    }
    return { ...result, all: provider.getMirrors() };
  });

  ipcMain.handle(IPC_CHANNELS.SET_ACTIVE_MIRROR, (_, mirror: string) => {
    const provider = providerManager.getProvider();
    provider.setActiveMirror(mirror);
    db.saveSettings({ app: { ...db.getSettings().app, activeMirror: mirror } });
    return provider.getActiveMirror();
  });

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

    // Proactively clear stale verification cookies for this mirror host to avoid HTTP 500
    await clearStaleAnubisCookies(mirror);

    return new Promise<boolean>((resolve) => {
      const win = new BrowserWindow({
        width: 1040,
        height: 760,
        center: true,
        title: `Проверка HDRezka — ${mirror}`,
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
      let stableContentTicks = 0;

      // Injects the interactive top control bar into the verification page
      const injectVerifyBar = async () => {
        if (isClosed || win.isDestroyed()) return;
        try {
          await win.webContents.executeJavaScript(`
            (() => {
              if (document.getElementById('hdrezka-verify-banner')) return;
              const banner = document.createElement('div');
              banner.id = 'hdrezka-verify-banner';
              banner.style.cssText = 'position:fixed;top:0;left:0;right:0;height:48px;background:#12131a;color:#fff;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:2px solid #e50914;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.6);user-select:none;box-sizing:border-box;';
              banner.innerHTML = \`
                <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                  <span style="font-weight:900;color:#e50914;font-size:14px;letter-spacing:0.5px;flex-shrink:0;">HDREZKA</span>
                  <span id="hdrezka-verify-status" style="font-size:12px;color:#d1d5db;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    Пройдите проверку на странице ниже (если требуется). Когда появится сайт, нажмите «Готово».
                  </span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                  <button id="hdrezka-verify-reload" style="background:rgba(255,255,255,0.08);color:#d1d5db;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;">⟳ Обновить</button>
                  <button id="hdrezka-verify-done" style="background:#e50914;color:#fff;border:none;border-radius:8px;padding:7px 18px;font-size:12px;font-weight:bold;cursor:pointer;box-shadow:0 0 12px rgba(229,9,20,0.4);">✓ Я прошёл проверку</button>
                </div>
              \`;
              document.documentElement.appendChild(banner);
              if (document.body) {
                document.body.style.paddingTop = '52px';
              }
              const reloadBtn = document.getElementById('hdrezka-verify-reload');
              if (reloadBtn) reloadBtn.onclick = () => window.location.reload();
              const doneBtn = document.getElementById('hdrezka-verify-done');
              if (doneBtn) doneBtn.onclick = () => { window.__hdrezka_verify_done = true; };
            })()
          `);
        } catch (_) {}
      };

      const closeAndResolve = async () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(timer);
        await session.defaultSession.cookies.flushStore().catch(() => {});
        providerManager.getProvider().setActiveMirror(mirror);
        db.saveSettings({ app: { ...db.getSettings().app, activeMirror: mirror } });
        if (!win.isDestroyed()) {
          win.close();
        }
        resolve(true);
      };

      const checkState = async () => {
        if (isClosed || win.isDestroyed()) return;
        try {
          await injectVerifyBar();

          const result = await win.webContents.executeJavaScript(`
            (() => {
              const isDoneClicked = !!window.__hdrezka_verify_done;
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
                document.querySelector('#anubis_version') ||
                document.querySelector('#anubis_base_prefix') ||
                document.querySelector('a[href*="anubis.techaro.lol"]') ||
                document.querySelector('script[src*="anubis"]') ||
                document.querySelector('#challenge-running') ||
                document.querySelector('.cf-browser-verification') ||
                document.querySelector('#cf-wrapper') ||
                document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
                (document.title && (
                  document.title.includes('Проверяем, что вы не бот') ||
                  document.title.includes("Making sure you're not a bot") ||
                  document.title.includes('Just a moment') ||
                  document.title.includes('Один момент') ||
                  document.title.includes('Attention Required')
                ))
              );
              const isSuccessScreen = !!document.getElementById('hdrezka-btn-finish');

              const statusEl = document.getElementById('hdrezka-verify-status');
              const doneBtn = document.getElementById('hdrezka-verify-done');
              if (statusEl && doneBtn) {
                if (hasRezkaContent || isSuccessScreen) {
                  statusEl.textContent = '✓ Проверка успешно пройдена! Нажмите «Готово» или окно закроется автоматически.';
                  statusEl.style.color = '#34d399';
                  doneBtn.style.background = '#10b981';
                  doneBtn.style.boxShadow = '0 0 12px rgba(16,185,129,0.5)';
                  doneBtn.textContent = '✓ Готово (Закрыть)';
                } else if (isChallengeActive) {
                  statusEl.textContent = '⏳ Выполняется проверка защиты... Решите капчу на странице, если требуется.';
                  statusEl.style.color = '#fbbf24';
                }
              }

              return { isDoneClicked, hasRezkaContent, isChallengeActive, isSuccessScreen };
            })()
          `).catch(() => ({ isDoneClicked: false, hasRezkaContent: false, isChallengeActive: false, isSuccessScreen: false }));

          // 1. User explicitly clicked "Я прошёл проверку" or "Завершить"
          if (result.isDoneClicked) {
            closeAndResolve();
            return;
          }

          // 2. If a challenge is active, NEVER auto-close. Reset stability ticks.
          if (result.isChallengeActive) {
            stableContentTicks = 0;
            return;
          }

          // 3. Real Rezka content or success confirmation screen is stable
          if (result.hasRezkaContent || result.isSuccessScreen) {
            stableContentTicks++;
            if (stableContentTicks >= 4) {
              closeAndResolve();
              return;
            }
          } else {
            stableContentTicks = 0;
          }
        } catch (_) {}
      };

      // Handles HTTP 500 empty screen from upstream Express when Anubis passes
      const renderSuccessScreen = async () => {
        if (isClosed || win.isDestroyed()) return;
        try {
          await win.webContents.executeJavaScript(`
            (() => {
              if (document.getElementById('hdrezka-btn-finish')) return;
              document.documentElement.innerHTML = \`
                <head>
                  <title>Проверка пройдена — HDRezka</title>
                  <meta charset="utf-8">
                </head>
                <body style="margin:0;padding:0;background:#090a0f;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;box-sizing:border-box;user-select:none;">
                  <div style="width:72px;height:72px;border-radius:50%;background:rgba(16,185,129,0.15);border:2px solid #10b981;display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 0 30px rgba(16,185,129,0.3);">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <h2 style="font-size:22px;font-weight:900;margin:0 0 10px 0;color:#fff;letter-spacing:0.3px;">Проверка защиты успешно пройдена!</h2>
                  <p style="font-size:14px;color:#9ca3af;max-width:460px;line-height:1.6;margin:0 0 28px 0;text-align:center;">
                    Токен защиты получен и сохранён в сессии приложения. Вы можете нажать кнопку ниже, чтобы вернуться к просмотру.
                  </p>
                  <button id="hdrezka-btn-finish" style="background:linear-gradient(to right,#e50914,#ea580c);color:#fff;border:none;border-radius:14px;padding:14px 36px;font-size:14px;font-weight:bold;cursor:pointer;box-shadow:0 4px 20px rgba(229,9,20,0.5);transition:transform 0.15s ease;">
                    ✓ Завершить и вернуться в приложение
                  </button>
                </body>
              \`;
              const btn = document.getElementById('hdrezka-btn-finish');
              if (btn) btn.onclick = () => { window.__hdrezka_verify_done = true; };
            })()
          `);
        } catch (_) {}
      };

      win.webContents.on('did-navigate', async (e, url, statusCode) => {
        if (statusCode === 500) {
          mirror = 'https://kinobase.org';
          await renderSuccessScreen();
          await injectVerifyBar();
          setTimeout(checkState, 300);
        }
      });

      const timer = setInterval(checkState, 800);
      win.webContents.on('did-finish-load', () => {
        injectVerifyBar();
        setTimeout(checkState, 500);
      });

      win.on('closed', async () => {
        if (!isClosed) {
          isClosed = true;
          clearInterval(timer);
          await session.defaultSession.cookies.flushStore().catch(() => {});
          providerManager.getProvider().setActiveMirror(mirror);
          db.saveSettings({ app: { ...db.getSettings().app, activeMirror: mirror } });
          resolve(true);
        }
      });

      win.webContents.setUserAgent(BROWSER_USER_AGENT);
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
    const s = db.getSettings();
    if (s.app?.mirrors) {
      const cleaned = s.app.mirrors.filter((m) => !isBadMirrorUrl(m));
      const seeded = Array.from(new Set([...OPEN_MIRROR_SEEDS, ...cleaned]));
      const nextActive = cleaned.length === 0 || isBadMirrorUrl(s.app.activeMirror)
        ? seeded[0]
        : s.app.activeMirror;
      if (seeded.join('|') !== s.app.mirrors.join('|') || nextActive !== s.app.activeMirror) {
        return db.saveSettings({ app: { ...s.app, activeMirror: nextActive, mirrors: seeded } });
      }
    }
    return s;
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
    async (_, assetUrl?: string): Promise<{ success: boolean; filePath?: string; openedInBrowser?: boolean; error?: string }> => {
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

  let justUpdatedFlag = process.argv.includes('--just-updated') || process.argv.includes('--updated');

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
    const installerPath = downloadedUpdatePath;
    try {
      // Notify UI that installation process has begun
      win?.webContents.send(IPC_CHANNELS.ON_UPDATE_PROGRESS, {
        percent: 100,
        transferredBytes: 0,
        totalBytes: 0,
        status: 'installing',
      } as UpdateProgress);

      // Launch the NSIS installer directly without generating temporary .bat/.vbs scripts in %TEMP%.
      // NSIS built-in flags:
      //   /S           - silent update without wizard dialogs
      //   --updated    - waits for the running app to close, keeps shortcuts & user data, passes --updated on relaunch
      //   --force-run  - automatically relaunches HDREZKA Desktop.exe once installation finishes
      const launchResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        let settled = false;
        const done = (res: { ok: boolean; error?: string }) => {
          if (settled) return;
          settled = true;
          resolve(res);
        };

        try {
          const child = spawn(installerPath, ['/S', '--updated', '--force-run'], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          });

          child.once('error', (err: NodeJS.ErrnoException) => {
            done({ ok: false, error: err?.message || String(err) });
          });

          child.once('exit', (code) => {
            // Immediate non-zero exit before app.quit() indicates OS policy block (e.g. Smart App Control / UAC denial)
            if (code !== null && code !== 0) {
              done({ ok: false, error: `Installer exited immediately with code ${code}` });
            }
          });

          child.once('spawn', () => {
            child.unref();
            // Brief grace check to catch synchronous OS policy blocks before quitting the running app
            setTimeout(() => done({ ok: true }), 450);
          });
        } catch (err: any) {
          done({ ok: false, error: err?.message || String(err) });
        }
      });

      if (!launchResult.ok) {
        const msg =
          'Windows заблокировал запуск установщика (Smart App Control / политика безопасности). Откройте страницу релиза на GitHub для ручной установки.';
        win?.webContents.send(IPC_CHANNELS.ON_UPDATE_PROGRESS, {
          percent: 0,
          transferredBytes: 0,
          totalBytes: 0,
          status: 'error',
          error: msg,
        } as UpdateProgress);
        console.error('[AutoUpdate] Native installer launch failed:', launchResult.error);
        return false;
      }

      setTimeout(() => {
        app.quit();
      }, 600);
      return true;
    } catch (e: any) {
      console.error('[AutoUpdate] Launch installer failed:', e);
      win?.webContents.send(IPC_CHANNELS.ON_UPDATE_PROGRESS, {
        percent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        status: 'error',
        error: e?.message || 'Не удалось запустить установщик обновления.',
      } as UpdateProgress);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL_URL, (_, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      return shell.openExternal(url).then(() => true).catch(() => false);
    }
    return false;
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_SET_ADBLOCK, (_, enabled: boolean) => {
    return setBrowserAdBlockEnabled(enabled);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_GET_ADBLOCK, () => {
    return getBrowserAdBlockStats();
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
