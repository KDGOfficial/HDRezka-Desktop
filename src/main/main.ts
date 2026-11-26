import { app, BrowserWindow, net, session, webContents, webFrameMain } from 'electron';
import { createMainWindow, getMainWindow } from './window';
import { registerIpcHandlers, runPendingUpdateOnExit } from './ipc';
import { AppDatabase } from './database';
import { ProviderManager } from '../core/providers/manager';
import {
  DEFAULT_MIRRORS,
  OPEN_MIRROR_SEEDS,
  IPC_CHANNELS,
  isBadMirrorUrl,
  BROWSER_USER_AGENT,
  isAdUrl,
  isCrossOriginPopupAd,
  shouldStripExternalScriptCache,
} from '../shared/constants';
import { buildShortcutFromEvent } from '../shared/utils';

const SUBFRAME_ADBLOCK_SCRIPT = `
  (() => {
    window.__hdrezkaAdBlockEnabled = true;
    if (!document.getElementById('hdrezka-adblock-css')) {
      const style = document.createElement('style');
      style.id = 'hdrezka-adblock-css';
      style.textContent =
        '[id*="adfox"],[class*="adfox"],[class*="ad-overlay"],[class*="ad_overlay"],[class*="vast-"],' +
        '[class*="branding-"],.brand-link,a.branding,.teasers,.teaser-block,' +
        'iframe[src*="adfox"],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],' +
        'iframe[src*="exoclick"],iframe[src*="adsterra"],iframe[src*="mgid"],' +
        'iframe[src*="1xbet"],iframe[src*="mostbet"],iframe[src*="pinup"],iframe[src*="vavada"],iframe[src*="melbet"],' +
        'a[href*="1xbet"],a[href*="1win"],a[href*="mostbet"],a[href*="pinup"],a[href*="vulcan"],' +
        'a[href*="vulkan"],a[href*="azino"],a[href*="vavada"],a[href*="melbet"],a[href*="fonbet"],' +
        'a[href*="winline"],a[href*="betboom"],a[href*="betcity"],a[href*="parimatch"],' +
        'div[style*="z-index: 2147483647"]:not(:has(video)):not(:has(iframe)),div[style*="z-index:2147483647"]:not(:has(video)):not(:has(iframe)),' +
        'div[style*="z-index: 9999999"]:not(:has(video)):not(:has(iframe)),div[style*="z-index:9999999"]:not(:has(video)):not(:has(iframe)),' +
        'a[style*="z-index: 2147483647"],a[style*="z-index:2147483647"],a[style*="z-index: 9999999"],a[style*="z-index:9999999"]' +
        '{display:none!important;visibility:hidden!important;pointer-events:none!important;}';
      (document.head || document.documentElement)?.appendChild(style);
    }
    if (window.__hdrezkaSubframeAdBlock) return;
    window.__hdrezkaSubframeAdBlock = true;
    const baseDom = (h) => h.replace(/^www\\./i, '').split('.').slice(-2).join('.').toLowerCase();
    const origOpen = window.open;
    window.open = function(url, target, features) {
      if (window.__hdrezkaAdBlockEnabled) {
        try {
          if (!url) return null;
          const u = new URL(String(url), location.href);
          if (baseDom(u.hostname) !== baseDom(location.hostname)) return null;
        } catch {
          return null;
        }
      }
      return origOpen ? origOpen.call(window, url, target, features) : null;
    };
    const skipAdRe = /^(?:пропустить(?:\\s+рекламу)?|skip\\s*ad(?:s)?)(?:[\\s»›>→➜▶✕×!.]*)$/i;
    const isSafeSkipEl = (el) => {
      if (el.tagName === 'A') {
        const href = (el.getAttribute('href') || '').trim();
        if (href && /^https?:/i.test(href)) {
          try {
            if (baseDom(new URL(href, location.href).hostname) !== baseDom(location.hostname)) return false;
          } catch {
            return false;
          }
        }
      }
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && (el.offsetParent !== null || st.position === 'fixed');
    };
    const clean = () => {
      if (!window.__hdrezkaAdBlockEnabled) return;
      document.querySelectorAll('a[target="_blank"], div[onclick], div[style*="fixed"], div[style*="absolute"]').forEach((el) => {
        if (el.closest('video') || el.querySelector('video')) return;
        const st = getComputedStyle(el);
        const z = parseInt(st.zIndex, 10) || 0;
        if ((st.position === 'fixed' || st.position === 'absolute') && z >= 999) {
          const r = el.getBoundingClientRect();
          const covers = r.width >= window.innerWidth * 0.55 && r.height >= window.innerHeight * 0.45;
          const transparent = parseFloat(st.opacity) < 0.15 || st.backgroundColor === 'rgba(0, 0, 0, 0)';
          if (covers && transparent && (el.tagName === 'A' || !(el.textContent || '').trim())) {
            el.remove();
          }
        }
      });
      const skipMatches = Array.from(document.querySelectorAll('button, div, span, a')).filter((btn) =>
        skipAdRe.test((btn.textContent || '').trim()) && isSafeSkipEl(btn)
      );
      skipMatches.forEach((btn) => {
        if (!skipMatches.some((other) => other !== btn && btn.contains(other))) {
          btn.click();
        }
      });
    };
    clean();
    let timer = null;
    const obs = new MutationObserver(() => {
      if (timer || !window.__hdrezkaAdBlockEnabled) return;
      timer = setTimeout(() => { timer = null; clean(); }, 250);
    });
    if (document.documentElement) obs.observe(document.documentElement, { childList: true, subtree: true });
  })();
`;

const SUBFRAME_ADBLOCK_DISABLE_SCRIPT = `
  (() => {
    window.__hdrezkaAdBlockEnabled = false;
    document.getElementById('hdrezka-adblock-css')?.remove();
  })();
`;

let browserAdBlockEnabled = true;
let browserAdBlockedCount = 0;

export function setBrowserAdBlockEnabled(enabled: boolean): { enabled: boolean; blockedCount: number } {
  browserAdBlockEnabled = Boolean(enabled);
  try {
    for (const wc of webContents.getAllWebContents()) {
      if (wc.getType() !== 'webview' || wc.isDestroyed()) continue;
      const frames = wc.mainFrame?.framesInSubtree || [];
      for (const frame of frames) {
        if (frame === wc.mainFrame || !/^https?:/i.test(frame.url || '')) continue;
        frame
          .executeJavaScript(browserAdBlockEnabled ? SUBFRAME_ADBLOCK_SCRIPT : SUBFRAME_ADBLOCK_DISABLE_SCRIPT)
          .catch(() => {});
      }
    }
  } catch {}
  return { enabled: browserAdBlockEnabled, blockedCount: browserAdBlockedCount };
}

export function getBrowserAdBlockStats(): { enabled: boolean; blockedCount: number } {
  return { enabled: browserAdBlockEnabled, blockedCount: browserAdBlockedCount };
}

// Ensure consistent app name, Windows AppUserModelId, and userData path across Setup and Portable
app.name = 'hdrezka-desktop';
if (process.platform === 'win32') {
  app.setAppUserModelId('com.hdrezka.desktop');
}

// Disable hardware acceleration to eliminate Windows 11 DWM / GPU composition black window bug
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

// Run Chromium audio in-process without AppContainer sandbox so Portable (%TEMP% extraction) always has sound on Windows
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,AudioServiceSandbox');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Same UA as provider requests, so the site's bot-check cookie matches between the check window and fetches
app.userAgentFallback = BROWSER_USER_AGENT;

// Acquire single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Ensure defaultSession userAgent matches exactly
    if (session?.defaultSession) {
      session.defaultSession.setUserAgent(BROWSER_USER_AGENT);
    }

    // Chromium network stack shares session cookies with app windows (needed for HDRezka session / anti-bot check)
    // Default cache: 'no-store' prevents main-process mirror HTML/JS fetches from writing third-party scripts to Cache_Data
    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      net.fetch(input as any, { ...init, cache: init?.cache ?? 'no-store' })) as typeof fetch;

    // Block malvertising/scam scripts & prevent external JS from being written to Chromium Cache_Data before any mirror requests run
    const hardenSession = (targetSession: Electron.Session, respectBrowserToggle: boolean) => {
      targetSession.webRequest.onBeforeRequest((details, callback) => {
        if ((!respectBrowserToggle || browserAdBlockEnabled) && isAdUrl(details.url)) {
          if (respectBrowserToggle) browserAdBlockedCount += 1;
          return callback({ cancel: true });
        }
        return callback({});
      });
      targetSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = details.responseHeaders || {};
        const ctKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
        const contentType = ctKey ? (Array.isArray(headers[ctKey]) ? headers[ctKey][0] : String(headers[ctKey])) : '';
        if (shouldStripExternalScriptCache(details.url, details.resourceType, contentType)) {
          const cleaned: Record<string, string[]> = {};
          for (const [k, v] of Object.entries(headers)) {
            const lower = k.toLowerCase();
            if (lower === 'cache-control' || lower === 'etag' || lower === 'expires' || lower === 'last-modified' || lower === 'pragma') {
              continue;
            }
            cleaned[k] = v;
          }
          cleaned['Cache-Control'] = ['no-store, no-cache, must-revalidate, max-age=0'];
          cleaned['Pragma'] = ['no-cache'];
          return callback({ responseHeaders: cleaned });
        }
        return callback({ responseHeaders: details.responseHeaders });
      });
    };

    if (session?.defaultSession) {
      hardenSession(session.defaultSession, false);
      session.defaultSession.clearCache().catch(() => {});
    }

    // Setup AdBlock network interceptor for built-in cinema browser webview partition
    const browserSession = session.fromPartition('persist:cinema-browser');
    browserSession.setUserAgent(BROWSER_USER_AGENT);
    hardenSession(browserSession, true);
    browserSession.clearCache().catch(() => {});

    // 1. Initialize DB and Provider
    const db = AppDatabase.getInstance();
    const settings = db.getSettings();
    const provider = ProviderManager.getInstance().getProvider();

    // Seed verified open mirrors and strip dead/phishing entries
    const userMirrors = settings.app?.mirrors || [];
    const cleanedMirrors = userMirrors.filter((m) => !isBadMirrorUrl(m));
    const baseMirrors = cleanedMirrors.length > 0 ? cleanedMirrors : DEFAULT_MIRRORS;
    const finalMirrors = Array.from(new Set([...OPEN_MIRROR_SEEDS, ...baseMirrors]));
    provider.setMirrors(finalMirrors);

    const currentMirror = settings.app?.activeMirror;
    const isBad = isBadMirrorUrl(currentMirror || '');
    const workingMirror = isBad ? (finalMirrors[0] || OPEN_MIRROR_SEEDS[0]) : currentMirror;
    provider.setActiveMirror(workingMirror);

    if (
      workingMirror !== currentMirror ||
      finalMirrors.join('|') !== userMirrors.join('|')
    ) {
      db.saveSettings({
        app: {
          ...settings.app,
          activeMirror: workingMirror,
          mirrors: finalMirrors,
        },
      });
    }

    const persistBestMirror = (bestMirror: string) => {
      const curSettings = db.getSettings();
      const mergedMirrors = provider.getMirrors();
      const targetMirror = bestMirror || provider.getActiveMirror();
      if (
        (targetMirror && targetMirror !== curSettings.app?.activeMirror) ||
        mergedMirrors.join('|') !== (curSettings.app?.mirrors || []).join('|')
      ) {
        db.saveSettings({
          app: {
            ...curSettings.app,
            activeMirror: targetMirror || curSettings.app?.activeMirror,
            mirrors: mergedMirrors,
          },
        });
      }
    };

    // Discover fresh mirrors, prune protected/unreachable ones, and persist clean mirror list
    provider
      .findOnlineMirrors()
      .then(() => provider.pruneProtectedMirrors())
      .then(persistBestMirror)
      .catch(() => {
        provider.pruneProtectedMirrors().then(persistBestMirror).catch(() => {});
      });

    // Warm up home sections and top movie sources in the background during startup splash
    provider
      .getHomeSections()
      .then((sections: any) => {
        if (!sections) return;
        const candidates = [
          sections.hero,
          ...(sections.popular || []).slice(0, 4),
          ...(sections.newReleases || []).slice(0, 3),
          ...(sections.topMovies || []).slice(0, 2),
        ].filter(Boolean);
        if (candidates.length > 0 && typeof (provider as any).prefetchDetails === 'function') {
          (provider as any).prefetchDetails(candidates);
        }
      })
      .catch(() => {});

    // 2. Register all IPC handlers
    registerIpcHandlers();

    // Configure built-in cinema browser webview: match desktop UA, block ad popups & redirects, forward cinema hotkeys
    app.on('web-contents-created', (_, contents) => {
      if (contents.getType() === 'webview') {
        contents.setUserAgent(BROWSER_USER_AGENT);
        contents.setWindowOpenHandler(({ url }) => {
          if (browserAdBlockEnabled && isCrossOriginPopupAd(url, contents.getURL())) {
            browserAdBlockedCount += 1;
            return { action: 'deny' };
          }
          if (/^https?:\/\//i.test(url)) {
            contents.loadURL(url).catch(() => {});
          }
          return { action: 'deny' };
        });
        contents.on('will-navigate', (event, url) => {
          if (browserAdBlockEnabled && isAdUrl(url)) {
            event.preventDefault();
            browserAdBlockedCount += 1;
          }
        });
        contents.on('will-redirect', (event, url) => {
          if (browserAdBlockEnabled && isAdUrl(url)) {
            event.preventDefault();
            browserAdBlockedCount += 1;
          }
        });
        // Protect cross-origin embedded player iframes from clickunder overlays & skippable pre-roll ads
        contents.on('did-frame-finish-load', (_event, isMainFrame, frameProcessId, frameRoutingId) => {
          if (isMainFrame || !browserAdBlockEnabled) return;
          try {
            const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
            if (frame && /^https?:/i.test(frame.url || '')) {
              frame.executeJavaScript(SUBFRAME_ADBLOCK_SCRIPT).catch(() => {});
            }
          } catch {}
        });
        contents.on('before-input-event', (_event, input) => {
          if (input.type !== 'keyDown' || input.isAutoRepeat || input.meta) return;
          if (input.code === 'Escape' && !input.control && !input.alt && !input.shift) {
            getMainWindow()?.webContents.send(IPC_CHANNELS.BROWSER_WEBVIEW_KEY, 'Escape');
            return;
          }
          const combo = buildShortcutFromEvent({
            code: input.code,
            ctrlKey: input.control,
            altKey: input.alt,
            shiftKey: input.shift,
            metaKey: input.meta,
          });
          if (!combo) return;
          const hk = db.getSettings().hotkeys;
          const cinemaCombos = [hk.toggleUi, hk.togglePin, hk.cycleScale, hk.fullscreen];
          if (cinemaCombos.includes(combo)) {
            getMainWindow()?.webContents.send(IPC_CHANNELS.BROWSER_WEBVIEW_KEY, combo);
          }
        });
      }
    });

    // 3. Create window
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('will-quit', () => {
    runPendingUpdateOnExit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
