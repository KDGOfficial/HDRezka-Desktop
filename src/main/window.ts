import { BrowserWindow, shell, session } from 'electron';
import path from 'path';
import { ProviderManager } from '../core/providers/manager';

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 320,
    minHeight: 180,
    frame: false,
    backgroundColor: '#090a0f',
    icon: path.join(__dirname, '../../resources/icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
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

    // Never interfere with bot challenge / Anubis internal API verification requests
    if (url.includes('within.website') || url.includes('pass-challenge') || url.includes('anubis')) {
      return callback({ requestHeaders: details.requestHeaders });
    }

    const activeMirror = provider.getActiveMirror();

    const isStreamOrApi =
      details.resourceType === 'media' ||
      details.resourceType === 'xhr' ||
      details.resourceType === 'fetch' ||
      url.includes('voidboost') ||
      url.includes('stream.') ||
      url.includes('.m3u8') ||
      url.includes('.mp4') ||
      url.includes('.vtt');

    if (isStreamOrApi && (url.includes('voidboost') || url.includes('stream.') || url.includes('hdrezka') || url.includes('rezka') || url.includes('.m3u8') || url.includes('.mp4') || url.includes('.vtt'))) {
      details.requestHeaders['Referer'] = activeMirror + '/';
      details.requestHeaders['Origin'] = activeMirror;
      details.requestHeaders['User-Agent'] =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
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
