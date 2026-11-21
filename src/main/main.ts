import { app, BrowserWindow, net, session } from 'electron';
import { createMainWindow, getMainWindow } from './window';
import { registerIpcHandlers } from './ipc';
import { AppDatabase } from './database';
import { ProviderManager } from '../core/providers/manager';
import { DEFAULT_MIRRORS, OPEN_MIRROR_SEEDS, IPC_CHANNELS, isBadMirrorUrl, BROWSER_USER_AGENT, isAdUrl } from '../shared/constants';

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
      if (
        browserAdBlockEnabled &&
        details.resourceType !== 'mainFrame' &&
        isAdUrl(details.url)
      ) {
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
          if (/^https?:\/\//i.test(url) && !(browserAdBlockEnabled && isAdUrl(url))) {
            contents.loadURL(url).catch(() => {});
          } else if (browserAdBlockEnabled && isAdUrl(url)) {
            browserAdBlockedCount += 1;
          }
          return { action: 'deny' };
        });
        contents.on('will-navigate', (event, url) => {
          if (browserAdBlockEnabled && isAdUrl(url)) {
            event.preventDefault();
            browserAdBlockedCount += 1;
          }
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
