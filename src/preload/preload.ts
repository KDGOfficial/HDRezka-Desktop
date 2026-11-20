import { contextBridge, ipcRenderer, webFrame } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';
import {
  CatalogFilter,
  WatchHistoryEntry,
  FavoriteItem,
  CollectionItem,
  UserSettings,
} from '../shared/types';

export const api = {
  // Window
  minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  unmaximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_UNMAXIMIZE),
  close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  setAlwaysOnTop: (flag?: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, flag),
  isAlwaysOnTop: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_ALWAYS_ON_TOP),
  setBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_BOUNDS, bounds),
  getBounds: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_BOUNDS),
  setZoomFactor: (factor: number): void => webFrame.setZoomFactor(factor),
  getZoomFactor: (): number => webFrame.getZoomFactor(),

  // Provider & Content
  getHomeSections: () => ipcRenderer.invoke(IPC_CHANNELS.GET_HOME_SECTIONS),
  getCatalog: (filter: CatalogFilter) => ipcRenderer.invoke(IPC_CHANNELS.GET_CATALOG, filter),
  getDetails: (urlOrId: string, meta?: any) => ipcRenderer.invoke(IPC_CHANNELS.GET_DETAILS, urlOrId, meta),
  getSeriesEpisodes: (mediaId: string, translatorId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SERIES_EPISODES, mediaId, translatorId),
  getStream: (params: {
    mediaId: string;
    translatorId: number;
    season?: number;
    episode?: number;
    isCamRip?: boolean;
    isAds?: boolean;
    isDirector?: boolean;
  }) => ipcRenderer.invoke(IPC_CHANNELS.GET_STREAM, params),
  searchFast: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_FAST, query),
  searchAdvanced: (query: string, page = 1) =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ADVANCED, query, page),
  checkMirrors: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_MIRRORS),
  setActiveMirror: (mirror: string) => ipcRenderer.invoke(IPC_CHANNELS.SET_ACTIVE_MIRROR, mirror),
  verifyMirror: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.VERIFY_MIRROR),
  findOnlineMirrors: (): Promise<{ added: string[]; all: string[] }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIND_ONLINE_MIRRORS),

  // Watch History
  getWatchHistory: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.GET_WATCH_HISTORY, limit),
  saveWatchHistory: (entry: WatchHistoryEntry) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_WATCH_HISTORY, entry),
  deleteWatchHistory: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_WATCH_HISTORY, id),
  clearWatchHistory: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_WATCH_HISTORY),

  // Playback Progress
  getProgress: (mediaId: string, season = 0, episode = 0) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PROGRESS, mediaId, season, episode),
  saveProgress: (
    mediaId: string,
    season = 0,
    episode = 0,
    currentTime = 0,
    duration = 0
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SAVE_PROGRESS,
      mediaId,
      season,
      episode,
      currentTime,
      duration
    ),

  // Favorites
  getFavorites: () => ipcRenderer.invoke(IPC_CHANNELS.GET_FAVORITES),
  addFavorite: (item: FavoriteItem) => ipcRenderer.invoke(IPC_CHANNELS.ADD_FAVORITE, item),
  removeFavorite: (mediaId: string) => ipcRenderer.invoke(IPC_CHANNELS.REMOVE_FAVORITE, mediaId),
  isFavorite: (mediaId: string) => ipcRenderer.invoke(IPC_CHANNELS.IS_FAVORITE, mediaId),

  // Collections
  getCollections: () => ipcRenderer.invoke(IPC_CHANNELS.GET_COLLECTIONS),
  createCollection: (name: string, description?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_COLLECTION, name, description),
  renameCollection: (id: string, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RENAME_COLLECTION, id, name),
  deleteCollection: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_COLLECTION, id),
  getCollectionItems: (collectionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_COLLECTION_ITEMS, collectionId),
  addToCollection: (item: CollectionItem) =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_TO_COLLECTION, item),
  removeFromCollection: (collectionId: string, mediaId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_FROM_COLLECTION, collectionId, mediaId),
  exportData: () => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_DATA),
  importData: (jsonString: string) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_DATA, jsonString),

  // Search History
  getSearchHistory: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.GET_SEARCH_HISTORY, limit),
  addSearchHistory: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.ADD_SEARCH_HISTORY, query),
  deleteSearchHistory: (query: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_SEARCH_HISTORY, query),
  clearSearchHistory: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_SEARCH_HISTORY),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  saveSettings: (settings: Partial<UserSettings>) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),

  // App & Updates
  checkForUpdates: (): Promise<import('../shared/types').UpdateInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES),
  downloadUpdate: (assetUrl?: string): Promise<{ success: boolean; filePath?: string; openedInBrowser?: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_UPDATE, assetUrl),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.INSTALL_UPDATE),
  checkJustUpdated: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.CHECK_JUST_UPDATED),
  onUpdateProgress: (callback: (progress: import('../shared/types').UpdateProgress) => void) => {
    const handler = (_: any, progress: import('../shared/types').UpdateProgress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.ON_UPDATE_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ON_UPDATE_PROGRESS, handler);
    };
  },
  openExternalUrl: (url: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL_URL, url),
  clearCache: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_CACHE),
};

contextBridge.exposeInMainWorld('api', api);
