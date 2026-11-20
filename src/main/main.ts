import { app, BrowserWindow, net } from 'electron';
import { createMainWindow, getMainWindow } from './window';
import { registerIpcHandlers } from './ipc';
import { AppDatabase } from './database';
import { ProviderManager } from '../core/providers/manager';

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
    // Chromium network stack shares session cookies with app windows (needed for HDRezka session / anti-bot check)
    globalThis.fetch = net.fetch as typeof fetch;

    // 1. Initialize DB and Provider
    const db = AppDatabase.getInstance();
    const settings = db.getSettings();
    const provider = ProviderManager.getInstance().getProvider();
    const currentMirror = settings.app?.activeMirror;
    const workingMirror = (!currentMirror || currentMirror.includes('hdrezka.ag')) ? 'https://hdrezka-home.tv' : currentMirror;
    provider.setActiveMirror(workingMirror);
    if (workingMirror !== currentMirror) {
      db.saveSettings({ app: { ...settings.app, activeMirror: workingMirror } });
    }
    // Automatically select the best reachable mirror in background
    provider.selectBestMirror().catch(() => {});

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
