import { UserSettings } from '../types';

export const APP_NAME = 'HDREZKA Desktop';
export const APP_VERSION = '0.0.10';

export const DEFAULT_MIRRORS = [
  'https://hdrezka-home.tv',
  'https://hdrezka.me',
  'https://rezka.ag',
  'https://rezkify.com',
  'https://hdrezka.ag',
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
    activeMirror: 'https://hdrezka-home.tv',
    mirrors: DEFAULT_MIRRORS,
    requestTimeoutMs: 8000,
  },
};

export const IPC_CHANNELS = {
  // Window
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',

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
  CLEAR_CACHE: 'app:clearCache',
  OPEN_EXTERNAL_URL: 'app:openExternal',
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
