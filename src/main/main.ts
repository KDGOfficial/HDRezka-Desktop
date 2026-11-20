import { app, BrowserWindow, net } from 'electron';
import { createMainWindow, getMainWindow } from './window';
import { registerIpcHandlers } from './ipc';
import { AppDatabase } from './database';
import { ProviderManager } from '../core/providers/manager';

// Ensure consistent app name and userData path across versions and packaging
app.name = 'hdrezka-desktop';

// Disable hardware acceleration to eliminate Windows 11 DWM / GPU composition black window bug
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

// Same UA as provider requests, so the site's bot-check cookie matches between the check window and fetches
app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
    const { session } = require('electron');
    if (session?.defaultSession) {
      session.defaultSession.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );
    }

    // Chromium network stack shares session cookies with app windows (needed for HDRezka session / anti-bot check)
    globalThis.fetch = net.fetch as typeof fetch;

    // 1. Initialize DB and Provider
    const db = AppDatabase.getInstance();
    const settings = db.getSettings();
    const provider = ProviderManager.getInstance().getProvider();
    const currentMirror = settings.app?.activeMirror;
    const isBadMirror = !currentMirror || currentMirror.includes('hdrezka.ag') || currentMirror.includes('rezka-ua.tv') || currentMirror.includes('rezka.fi') || currentMirror.includes('hdrezka.is');
    const workingMirror = isBadMirror ? 'https://hdrezka.kim' : currentMirror;
    provider.setActiveMirror(workingMirror);
    if (workingMirror !== currentMirror) {
      db.saveSettings({ app: { ...settings.app, activeMirror: workingMirror } });
    }

    // Automatically discover fresh mirrors online and select best reachable mirror in background
    provider.findOnlineMirrors().then((res) => {
      if (res.added.length > 0) {
        const curSettings = db.getSettings();
        db.saveSettings({
          app: {
            ...curSettings.app,
            mirrors: provider.getMirrors(),
          },
        });
      }
      return provider.selectBestMirror();
    }).catch(() => {
      provider.selectBestMirror().catch(() => {});
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
