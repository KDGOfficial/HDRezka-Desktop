import { UserSettings } from '../types';

export const APP_NAME = 'HDREZKA Desktop';
export const APP_VERSION = '0.0.36';
export const TELEGRAM_CHANNEL_URL = 'https://t.me/HDRezkaPC';
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

export const BAD_MIRROR_PATTERNS = [
  'hdrezka.ag',
  'rezka-ua.tv',
  'rezka.fi',
  'hdrezka.is',
  'rezkify.com',
];

export function isBadMirrorUrl(url: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return BAD_MIRROR_PATTERNS.some((p) => lower.includes(p));
}

const CAMRIP_RE = /(?:^|[\s([,/|_-])(?:camrip|cam|ts|tc|telesync|telecine|экранка|тс)(?=$|[\s)\],/|_-])/i;

export function isCamRipText(text?: string): boolean {
  return Boolean(text && CAMRIP_RE.test(text));
}

export const OPEN_MIRROR_SEEDS = [
  'https://kinobase.org',
  'https://www.kinobase.org',
  'https://kinogo.film',
];

export const DEFAULT_MIRRORS = [
  'https://kinobase.org',
  'https://www.kinobase.org',
  'https://kinogo.film',
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'dark',
  cardSize: 'medium',
  homeSections: {
    hero: true,
    continueWatching: true,
    popular: true,
    newReleases: true,
    topMovies: true,
    topSeries: true,
    recommendations: true,
    expected: true,
  },
  language: 'ru',
  player: {
    autoPlay: true,
    autoPlayNextEpisode: true,
    defaultQuality: '1080p',
    playbackSpeed: 1.0,
    volume: 0.8,
    fullscreenOnPlay: false,
  },
  app: {
    autoLaunch: false,
    checkUpdatesOnStart: true,
    activeMirror: 'https://kinobase.org',
    mirrors: DEFAULT_MIRRORS,
    requestTimeoutMs: 8000,
  },
};

export const IPC_CHANNELS = {
  // Window
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_UNMAXIMIZE: 'window:unmaximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_SET_ALWAYS_ON_TOP: 'window:setAlwaysOnTop',
  WINDOW_IS_ALWAYS_ON_TOP: 'window:isAlwaysOnTop',
  WINDOW_SET_BOUNDS: 'window:setBounds',
  WINDOW_GET_BOUNDS: 'window:getBounds',

  // Provider & Catalog
  GET_HOME_SECTIONS: 'provider:getHomeSections',
  GET_CATALOG: 'provider:getCatalog',
  GET_DETAILS: 'provider:getDetails',
  GET_SERIES_EPISODES: 'provider:getSeriesEpisodes',
  GET_STREAM: 'provider:getStream',
  SEARCH_FAST: 'provider:searchFast',
  SEARCH_ADVANCED: 'provider:searchAdvanced',
  CHECK_MIRRORS: 'provider:checkMirrors',
  SET_ACTIVE_MIRROR: 'provider:setActiveMirror',
  VERIFY_MIRROR: 'provider:verifyMirror',
  FIND_ONLINE_MIRRORS: 'provider:findOnlineMirrors',

  // Database - History
  GET_WATCH_HISTORY: 'db:getWatchHistory',
  SAVE_WATCH_HISTORY: 'db:saveWatchHistory',
  DELETE_WATCH_HISTORY: 'db:deleteWatchHistory',
  CLEAR_WATCH_HISTORY: 'db:clearWatchHistory',

  // Database - Progress
  GET_PROGRESS: 'db:getProgress',
  SAVE_PROGRESS: 'db:saveProgress',

  // Database - Favorites
  GET_FAVORITES: 'db:getFavorites',
  ADD_FAVORITE: 'db:addFavorite',
  REMOVE_FAVORITE: 'db:removeFavorite',
  IS_FAVORITE: 'db:isFavorite',

  // Database - Collections
  GET_COLLECTIONS: 'db:getCollections',
  CREATE_COLLECTION: 'db:createCollection',
  RENAME_COLLECTION: 'db:renameCollection',
  DELETE_COLLECTION: 'db:deleteCollection',
  GET_COLLECTION_ITEMS: 'db:getCollectionItems',
  ADD_TO_COLLECTION: 'db:addToCollection',
  REMOVE_FROM_COLLECTION: 'db:removeFromCollection',
  EXPORT_DATA: 'db:exportData',
  IMPORT_DATA: 'db:importData',

  // Database - Search History
  GET_SEARCH_HISTORY: 'db:getSearchHistory',
  ADD_SEARCH_HISTORY: 'db:addSearchHistory',
  DELETE_SEARCH_HISTORY: 'db:deleteSearchHistory',
  CLEAR_SEARCH_HISTORY: 'db:clearSearchHistory',

  // Settings
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',

  // System & Updates
  CHECK_FOR_UPDATES: 'app:checkUpdates',
  DOWNLOAD_UPDATE: 'app:downloadUpdate',
  INSTALL_UPDATE: 'app:installUpdate',
  ON_UPDATE_PROGRESS: 'app:updateProgress',
  CLEAR_CACHE: 'app:clearCache',
  OPEN_EXTERNAL_URL: 'app:openExternal',
  CHECK_JUST_UPDATED: 'app:checkJustUpdated',
};

export const GENRES = [
  { id: '', title: 'Все жанры' },
  { id: 'action', title: 'Боевики' },
  { id: 'adventures', title: 'Приключения' },
  { id: 'animation', title: 'Мультфильмы' },
  { id: 'biographical', title: 'Биографические' },
  { id: 'comedy', title: 'Комедии' },
  { id: 'crime', title: 'Криминал' },
  { id: 'detective', title: 'Детективы' },
  { id: 'documentary', title: 'Документальные' },
  { id: 'drama', title: 'Драмы' },
  { id: 'family', title: 'Семейные' },
  { id: 'fantasy', title: 'Фэнтези' },
  { id: 'fiction', title: 'Фантастика' },
  { id: 'historical', title: 'Исторические' },
  { id: 'horror', title: 'Ужасы' },
  { id: 'melodrama', title: 'Мелодрамы' },
  { id: 'musical', title: 'Мюзиклы' },
  { id: 'sport', title: 'Спортивные' },
  { id: 'thriller', title: 'Триллеры' },
  { id: 'war', title: 'Военные' },
  { id: 'western', title: 'Вестерны' },
];

export const SORT_OPTIONS = [
  { id: 'last', title: 'Последние поступления' },
  { id: 'popular', title: 'По популярности' },
  { id: 'watching', title: 'Сейчас смотрят' },
];
