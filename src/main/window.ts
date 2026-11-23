import { BrowserWindow, shell, session, screen } from 'electron';
import path from 'path';
import { ProviderManager } from '../core/providers/manager';
import { BROWSER_USER_AGENT } from '../shared/constants';
import { getDefaultWindowBounds } from '../shared/utils';

let mainWindow: BrowserWindow | null = null;

export function restoreDefaultWindowBounds(win: BrowserWindow): { x: number; y: number; width: number; height: number } | null {
  if (!win || win.isDestroyed() || win.isMaximized()) return null;
  if (win.isFullScreen()) {
    win.once('leave-full-screen', () => {
      if (!win.isDestroyed() && !win.isAlwaysOnTop()) {
        restoreDefaultWindowBounds(win);
      }
    });
    return null;
  }
  const display = screen.getDisplayMatching(win.getBounds());
  const target = getDefaultWindowBounds(display.workArea);
  win.setBounds(target);
  return win.getBounds();
}

export function createMainWindow(): BrowserWindow {
  // Adapt initial window dimensions to display aspect ratio (16:10, 16:9, 21:9, 4:3, HiDPI)
  const { width: initWidth, height: initHeight } = getDefaultWindowBounds(screen.getPrimaryDisplay().workArea);

  mainWindow = new BrowserWindow({
    width: initWidth,
    height: initHeight,
    minWidth: 320,
    minHeight: 180,
    frame: false,
    backgroundColor: '#070507',
    icon: path.join(__dirname, '../../resources/icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      webviewTag: true,
    },
  });

  // Setup stream CDN header interceptor to ensure voidboost / rezka CDN requests succeed
  const provider = ProviderManager.getInstance().getProvider();
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    // Only intercept remote external HTTP/HTTPS requests, NEVER local file:// or localhost
    if (!details.url.startsWith('http://') && !details.url.startsWith('https://')) {
      return callback({ requestHeaders: details.requestHeaders });
    }
    if (details.url.startsWith('http://localhost') || details.url.startsWith('http://127.0.0.1')) {
      return callback({ requestHeaders: details.requestHeaders });
    }

    // Never modify headers or inject Origin on top-level main or sub frame navigation requests
    if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
      return callback({ requestHeaders: details.requestHeaders });
    }

    // Do NOT modify requests originating from popup or verification windows
    if (mainWindow && details.webContentsId && details.webContentsId !== mainWindow.webContents.id) {
      return callback({ requestHeaders: details.requestHeaders });
    }

    const url = details.url.toLowerCase();

    // Never interfere with bot challenge / Techaro Anubis internal verification requests
    if (
      url.includes('within.website') ||
      url.includes('techaro.lol') ||
      url.includes('pass-challenge') ||
      url.includes('anubis')
    ) {
      return callback({ requestHeaders: details.requestHeaders });
    }

    const activeMirror = provider.getActiveMirror();

    if (
      url.includes('redcdn.org') ||
      url.includes('threnet.xyz') ||
      url.includes('kinobase.org') ||
      url.includes('kinovod.pro') ||
      url.includes('mvapspdmpg.com') ||
      url.includes('tazaromikaz.link')
    ) {
      const origin = url.includes('kinovod.pro') ? 'https://kinovod.pro' : 'https://kinobase.org';
      details.requestHeaders['Referer'] = `${origin}/`;
      details.requestHeaders['Origin'] = origin;
      details.requestHeaders['User-Agent'] = BROWSER_USER_AGENT;
      return callback({ requestHeaders: details.requestHeaders });
    }

    if (
      url.includes('insertunit.ws') ||
      url.includes('delivembed.cc') ||
      url.includes('interkh.com')
    ) {
      details.requestHeaders['Referer'] = 'https://apiplayers.insertunit.ws/';
      details.requestHeaders['Origin'] = 'https://apiplayers.insertunit.ws';
      details.requestHeaders['User-Agent'] = BROWSER_USER_AGENT;
      return callback({ requestHeaders: details.requestHeaders });
    }

    if (url.includes('hdstudio.org')) {
      details.requestHeaders['Referer'] = 'http://hdstudio.org/';
      details.requestHeaders['Origin'] = 'http://hdstudio.org';
      details.requestHeaders['User-Agent'] = BROWSER_USER_AGENT;
      return callback({ requestHeaders: details.requestHeaders });
    }

    if (url.includes('cinemar.cc') || url.includes('cinemap.cc')) {
      details.requestHeaders['Referer'] = 'https://cinemar.cc/';
      details.requestHeaders['Origin'] = 'https://cinemar.cc';
      details.requestHeaders['User-Agent'] = BROWSER_USER_AGENT;
      return callback({ requestHeaders: details.requestHeaders });
    }

    if (
      url.includes('libria.fun') ||
      url.includes('aniliberty.top') ||
      url.includes('anilibria.wtf') ||
      url.includes('animetop.info') ||
      url.includes('animevost.org')
    ) {
      delete details.requestHeaders['Referer'];
      delete details.requestHeaders['Origin'];
      details.requestHeaders['User-Agent'] = BROWSER_USER_AGENT;
      return callback({ requestHeaders: details.requestHeaders });
    }

    const isStreamOrApi =
      details.resourceType === 'media' ||
      details.resourceType === 'xhr' ||
      url.includes('voidboost') ||
      url.includes('femeretes.org') ||
      url.includes('vdbmate.org') ||
      url.includes('stream.') ||
      url.includes('.m3u8') ||
      url.includes('.ts') ||
      url.includes('.m4s') ||
      url.includes('.mp4') ||
      url.includes('.vtt');

    if (
      isStreamOrApi &&
      (url.includes('voidboost') ||
        url.includes('femeretes.org') ||
        url.includes('vdbmate.org') ||
        url.includes('stream.') ||
        url.includes('hdrezka') ||
        url.includes('rezka') ||
        url.includes('.m3u8') ||
        url.includes('.ts') ||
        url.includes('.m4s') ||
        url.includes('.mp4') ||
        url.includes('.vtt'))
    ) {
      details.requestHeaders['Referer'] = activeMirror + '/';
      details.requestHeaders['Origin'] = activeMirror;
      details.requestHeaders['User-Agent'] = BROWSER_USER_AGENT;
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Fallback to show window if ready-to-show hangs on some Windows GPUs
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 3000);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[MainWindow] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
  });

  // Open external links in default OS browser safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load URL or local build
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
