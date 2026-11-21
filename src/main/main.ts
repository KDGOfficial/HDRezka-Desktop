import { app, BrowserWindow, net, session, webFrameMain } from 'electron';
import { createMainWindow, getMainWindow } from './window';
import { registerIpcHandlers } from './ipc';
import { AppDatabase } from './database';
import { ProviderManager } from '../core/providers/manager';
import { DEFAULT_MIRRORS, OPEN_MIRROR_SEEDS, IPC_CHANNELS, isBadMirrorUrl, BROWSER_USER_AGENT, isAdUrl, isCrossOriginPopupAd } from '../shared/constants';

const SUBFRAME_ADBLOCK_SCRIPT = `
  (() => {
    window.__hdrezkaAdBlockEnabled = true;
    if (window.__hdrezkaSubframeAdBlock) return;
    window.__hdrezkaSubframeAdBlock = true;
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
        'div[style*="z-index: 2147483647"]:not(:has(video)),div[style*="z-index: 9999999"]:not(:has(video)),' +
        'a[style*="z-index: 2147483647"],a[style*="z-index: 9999999"]' +
        '{display:none!important;visibility:hidden!important;pointer-events:none!important;}';
      (document.head || document.documentElement)?.appendChild(style);
    }
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
      document.querySelectorAll('button, div, span, a').forEach((btn) => {
        const txt = (btn.textContent || '').trim();
        if (skipAdRe.test(txt)) {
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

let browserAdBlockEnabled = true;
let browserAdBlockedCount = 0;

export function setBrowserAdBlockEnabled(enabled: boolean): { enabled: boolean; blockedCount: number } {
  browserAdBlockEnabled = Boolean(enabled);
  return { enabled: browserAdBlockEnabled, blockedCount: browserAdBlockedCount };
}

export function getBrowserAdBlockStats(): { enabled: boolean; blockedCount: number } {
  return { enabled: browserAdBlockEnabled, blockedCount: browserAdBlockedCount };
}

// Ensure consistent app name and userData path across versions and packaging
app.name = 'hdrezka-desktop';

// Disable hardware acceleration to eliminate Windows 11 DWM / GPU composition black window bug
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

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
    globalThis.fetch = net.fetch as typeof fetch;

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

    // 2. Register all IPC handlers
    registerIpcHandlers();

    // Setup AdBlock network interceptor for built-in cinema browser webview partition
    const browserSession = session.fromPartition('persist:cinema-browser');
    browserSession.setUserAgent(BROWSER_USER_AGENT);
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      if (browserAdBlockEnabled && isAdUrl(details.url)) {
        browserAdBlockedCount += 1;
        return callback({ cancel: true });
      }
      return callback({});
    });

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
          if (
            input.type === 'keyDown' &&
            !input.isAutoRepeat &&
            !input.control &&
            !input.alt &&
            !input.meta &&
            ['Escape', 'KeyH', 'KeyP', 'KeyZ', 'KeyF'].includes(input.code)
          ) {
            getMainWindow()?.webContents.send(IPC_CHANNELS.BROWSER_WEBVIEW_KEY, input.code);
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

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
