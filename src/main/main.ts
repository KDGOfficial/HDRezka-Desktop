import { app, BrowserWindow, net, session } from 'electron';
import { createMainWindow, getMainWindow } from './window';
import { registerIpcHandlers } from './ipc';
import { AppDatabase } from './database';
import { ProviderManager } from '../core/providers/manager';
import { DEFAULT_MIRRORS, isBadMirrorUrl, BROWSER_USER_AGENT } from '../shared/constants';

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

    // Clean user settings from dead or phishing mirrors (hdrezka.is, rezka.fi, rezkify.com, etc.)
    const userMirrors = settings.app?.mirrors || [];
    const cleanedMirrors = userMirrors.filter((m) => !isBadMirrorUrl(m));
    const baseMirrors = cleanedMirrors.length > 0 ? cleanedMirrors : DEFAULT_MIRRORS;
    const finalMirrors = baseMirrors.includes('https://kinobase.org')
      ? baseMirrors
      : ['https://kinobase.org', ...baseMirrors];
    provider.setMirrors(finalMirrors);

    const currentMirror = settings.app?.activeMirror;
    const isBad = isBadMirrorUrl(currentMirror || '');
    const workingMirror = isBad ? (finalMirrors[0] || 'https://kinobase.org') : currentMirror;
    provider.setActiveMirror(workingMirror);

    if (
      workingMirror !== currentMirror ||
      cleanedMirrors.length !== userMirrors.length ||
      finalMirrors.length !== baseMirrors.length
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
      if (!bestMirror) return;
      const curSettings = db.getSettings();
      const mergedMirrors = provider.getMirrors();
      if (bestMirror !== curSettings.app?.activeMirror || mergedMirrors.length !== (curSettings.app?.mirrors?.length || 0)) {
        db.saveSettings({
          app: {
            ...curSettings.app,
            activeMirror: bestMirror,
            mirrors: mergedMirrors,
          },
        });
      }
    };

    // Automatically discover fresh mirrors online and select best reachable mirror in background
    provider.findOnlineMirrors().then(() => {
      return provider.selectBestMirror();
    }).then(persistBestMirror).catch(() => {
      provider.selectBestMirror().then(persistBestMirror).catch(() => {});
    });

    // 2. Register all IPC handlers
    registerIpcHandlers();

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
