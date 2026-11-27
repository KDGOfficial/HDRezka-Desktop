import { UserSettings, HotkeysConfig, SubtitleStyle, UpdateTier } from '../types';

export const APP_NAME = 'HDREZKA Desktop';
export const APP_VERSION = '0.2.5';
export const GITHUB_RELEASES_LATEST_URL = 'https://github.com/KDGOfficial/HDRezka-Desktop/releases/latest';
export const TELEGRAM_CHANNEL_URL = 'https://t.me/HDRezkaPC';
export const AUTHOR_YOUTUBE_URL = 'https://www.youtube.com/@KanalDobrogoGamera';
export const AUTHOR_TELEGRAM_URL = 'https://t.me/kdg_yt';
export const AUTHOR_GITHUB_URL = 'https://github.com/KDGOfficial';
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
  'https://rezka.ac',
  'https://rezka.ai',
  'https://kinogo.film',
  'http://hdstudio.org',
];

/** Former open mirrors now behind captcha/dead: kept in the background pool and auto-restored once they answer cleanly. */
export const RETIRED_MIRRORS = [
  'https://kinobase.org',
  'https://www.kinobase.org',
  'https://kinovod.pro',
];

/** Remote curated mirror list (edit mirrors.json in the repo: all clients pick it up without a new release). jsDelivr is a fallback when raw.githubusercontent is blocked. */
export const REMOTE_MIRROR_LIST_URLS = [
  'https://raw.githubusercontent.com/KDGOfficial/HDRezka-Desktop/main/mirrors.json',
  'https://cdn.jsdelivr.net/gh/KDGOfficial/HDRezka-Desktop@main/mirrors.json',
];

export const ANIME_MIRROR_SEEDS = [
  'https://aniliberty.top',
  'https://anilibria.wtf',
  'https://api.yani.tv',
  'https://smotret-anime.org',
  'https://anime365.ru',
  'https://api.animetop.info',
  'https://api.animevost.org',
  'https://animego.me',
  'https://animego.org',
  'https://uakino.biz',
];

const AD_HOST_RE =
  /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google\.|imasdk\.googleapis\.com|securepubads\.g\.doubleclick\.net|adtrafficquality\.google|adnxs\.com|adfox\.ru|an\.yandex\.ru|bs\.yandex\.ru|awaps\.yandex\.ru|mc\.yandex\.ru|metrika\.yandex\.|direct\.yandex\.|mgid\.com|mgid\.ru|marketgid\.com|lentainform\.com|exoclick\.com|exosrv\.com|exdynsrv\.com|realsrv\.com|tsyndicate\.com|propellerads\.com|popads\.net|popcash\.net|clickadu\.com|clickadilla\.com|adsterra\.com|hilltopads\.net|juicyads\.com|trafficjunky\.net|trafficfactory\.biz|trafmag\.com|traffichunt\.com|traforet\.com|traffcore\.com|uniontraff\.com|adriver\.ru|adskeeper\.co\.uk|adskeeper\.com|admixer\.net|adrtx\.net|adhigh\.net|adtelligent\.com|adsrvr\.org|aniview\.com|bidswitch\.net|bidgear\.com|lkqd\.net|vidoomy\.com|a-ads\.com|outbrain\.com|taboola\.com|criteo\.com|rtbhouse\.com|betweendigital\.com|videoroll\.net|vidroll\.ru|viqeo\.tv|mixmarket\.biz|market-place\.su|directadvert\.ru|recreativ\.ru|smi2\.ru|teasernet\.com|tizerlady\.net|pay-click\.ru|mclick\.ru|bodyclick\.net|gnezdo\.ru|advmaker\.net|octoclick\.net|kadam\.net|adspyglass\.com|admaven\.com|ad-maven\.com|monetag\.com|richads\.com|evadav\.com|pushhouse\.net|pushame\.com|pushprofit\.ru|rollerads\.com|galaksion\.com|acint\.net|nativeroll\.tv|videonow\.ru|buzzoola\.com|pladform\.ru|rutarget\.ru|target\.my\.com|ad\.mail\.ru|r\.mail\.ru|top\.mail\.ru|top-fwz1\.mail\.ru|yadro\.ru|tns-counter\.ru|relap\.io|teads\.tv|pubmatic\.com|rubiconproject\.com|openx\.net|casalemedia\.com|smartadserver\.com|connatix\.com|springserve\.com|spotxchange\.com|onclkds\.com|popunder\.net|clickunder\.ru|zeroredirect\.com|bidvertiser\.com|revcontent\.com|mellowads\.com|luxup\.ru|scorecardresearch\.com|quantserve\.com|clarity\.ms|hotjar\.com|acscdn\.com|dtscout\.com|amung\.us|histats\.com|clkmon\.com|reimageplus\.com|webpushs\.com|gravitec\.net|notix\.io|1xbet|1x-bet|1win|1xslots|mostbet|most-bet|pinup|pin-up|vulcan|vulkan|azino|melbet|mel-bet|fonbet|fon-bet|vavada|joycasino|parimatch|betwinner|betboom|olimpbet|leonbets|pokerdom|ggbet|winline|betcity|ligastavok|liga-stavok|marathonbet|zenitbet|tennisi|catcasino|freshcasino|solcasino|jetcasino|dripcasino|starda|r7casino|dragonmoney|linebet|megapari|betandyou|888starz|spinbetter|bc\.game|stake\.com)/i;

const AD_VIDEO_PATH_RE =
  /(?:\/(?:vast|vpaid|vmap|preroll|midroll|reklama|ad_video|adv_video|ad-video|advideo|video_ad|commercials?|outstream|instream|ads|adv)\/(?:[^?#]*)|[?&](?:vast|vpaid|vmap|ad_tag|ad_url|preroll|midroll|adv)=)/i;

const AD_PATH_RE =
  /(?:\/(?:vast|vpaid|vmap|preroll|midroll|popunder|clickunder|adserver|adsystem|ad_banner|banners\/|teasers\/|branding\/|reklama|doubleclick|pcode\/adfox|pagead\/|ads\/|adv\/|cryxos|push-sdk)|\/(?:pop|popunder|clickunder|vast|vmap)\.(?:js|xml|json)(?:$|\?)|[?&](?:vast|vpaid|vmap|ad_tag|ad_url|preroll|popunder|clickunder)=)/i;

/**
 * External remote JS/HTML from streaming mirrors can carry obfuscated popunder/scam scripts
 * (e.g. JS:Trojan.Cryxos) that trigger antivirus alerts if Chromium writes them to Cache_Data.
 */
export function shouldStripExternalScriptCache(
  url: string,
  resourceType?: string,
  contentType?: string
): boolean {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return false;
  if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return false;
  const rt = (resourceType || '').toLowerCase();
  if (rt === 'script' || rt === 'subframe' || rt === 'mainframe') return true;
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('javascript') || ct.includes('ecmascript') || ct.includes('text/html')) return true;
  if (/\.(?:m?js|cjs)(?:$|\?)/i.test(url)) return true;
  // Also prevent third-party XHR/fetch payloads (e.g. text/plain or octet-stream scripts) from writing to Cache_Data
  if (
    (rt === 'xhr' || rt === 'other') &&
    !ct.startsWith('image/') &&
    !ct.startsWith('video/') &&
    !ct.startsWith('audio/') &&
    !ct.startsWith('font/') &&
    !ct.includes('text/css')
  ) {
    return true;
  }
  return false;
}

const TRUSTED_MEDIA_PORTAL_RE =
  /(?:^|\.)(?:kinobase\.org|kinovod\.pro|hdstudio\.org|insertunit\.ws|delivembed\.cc|embf\.net|showvid\.ws|kinogo\.[a-z]+|aniliberty\.top|anilibria\.[a-z]+|libria\.fun|animetop\.info|animevost\.org|yummyanime\.[a-z]+|yummyani\.me|yani\.tv|smotret-anime\.[a-z]+|anime365\.ru|animego\.[a-z]+|uakino\.[a-z]+|rezka\.[a-z]+|hdrezka[^.]*\.[a-z]+|google\.[a-z]+|vkvideo\.ru|vk\.com|rutube\.ru|youtube\.com|youtu\.be|kinopoisk\.ru|imdb\.com)$/i;

const GOOGLE_SEARCH_HOST_RE = /(?:^|\.)google\.[a-z]{2,}(?:\.[a-z]{2})?$/i;

export function isAdUrl(url: string): boolean {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return false;
  try {
    const parsed = new URL(url);
    if (AD_HOST_RE.test(parsed.hostname)) return true;
    const pathAndQuery = parsed.pathname + parsed.search;
    // Block explicit pre-roll/VAST video ad assets even when served as .mp4/.m3u8
    if (AD_VIDEO_PATH_RE.test(pathAndQuery)) return true;
    // Never block actual movie HLS/MP4/subtitle media segments on known streaming CDNs
    if (/\.(?:m3u8|ts|mp4|m4s|vtt|srt)(?:$|\?)/i.test(parsed.pathname)) return false;
    return AD_PATH_RE.test(pathAndQuery);
  } catch {
    return false;
  }
}

export function isCrossOriginPopupAd(popupUrl: string, sourceUrl?: string): boolean {
  if (!popupUrl || (!popupUrl.startsWith('http://') && !popupUrl.startsWith('https://'))) return true;
  if (isAdUrl(popupUrl)) return true;
  try {
    const target = new URL(popupUrl);
    if (TRUSTED_MEDIA_PORTAL_RE.test(target.hostname)) return false;
    if (!sourceUrl || (!sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://'))) return true;
    const source = new URL(sourceUrl);
    // Allow clicking non-ad search results that open in a new tab from Google Search
    if (GOOGLE_SEARCH_HOST_RE.test(source.hostname)) return false;
    const baseDomain = (h: string) => h.replace(/^www\./i, '').split('.').slice(-2).join('.').toLowerCase();
    // Cross-origin window.open() on streaming sites is overwhelmingly popunder/clickunder ad traffic
    return baseDomain(target.hostname) !== baseDomain(source.hostname);
  } catch {
    return true;
  }
}

export const HDREZKA_MIRRORS = [
  'https://rezka.ag',
  'https://hdrezka.me',
  'https://hdrezka.club',
  'https://rezka-tv.org',
  'https://hdrezka.sh',
  'https://rezka.pub',
  'https://hdrezka.kim',
  'https://hdrezka-home.tv',
  'https://rezka-ua.org',
];

export const DEFAULT_MIRRORS = [...OPEN_MIRROR_SEEDS];

export const DEFAULT_HOTKEYS: HotkeysConfig = {
  playPause: 'Space',
  seekBackward: 'ArrowLeft',
  seekForward: 'ArrowRight',
  volumeUp: 'ArrowUp',
  volumeDown: 'ArrowDown',
  fullscreen: 'KeyF',
  mute: 'KeyM',
  toggleUi: 'KeyH',
  togglePin: 'KeyP',
  cycleScale: 'KeyZ',
  focusSearch: 'Ctrl+KeyK',
};

export const DEFAULT_USER_INTERESTS = {
  onboardingCompleted: false,
  favoriteGenres: [] as string[],
  favoriteTypes: [] as Array<'films' | 'series' | 'cartoons' | 'animation' | 'shows'>,
  genreScores: {} as Record<string, { weight: number; updatedAt: number }>,
  typeScores: {} as Partial<Record<'films' | 'series' | 'cartoons' | 'animation' | 'shows', { weight: number; updatedAt: number }>>,
  updatedAt: 0,
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: 100,
  position: 10,
  color: '#FFFFFF',
  background: 0.75,
  bold: true,
  delay: 0,
};

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
  hotkeys: { ...DEFAULT_HOTKEYS },
  subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
  interests: { ...DEFAULT_USER_INTERESTS },
  app: {
    autoLaunch: false,
    checkUpdatesOnStart: true,
    autoInstallMinorUpdates: true,
    updateChannel: 'stable',
    activeMirror: 'https://rezka.ac',
    mirrors: DEFAULT_MIRRORS,
    requestTimeoutMs: 25000,
  },
};

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = (v || '').trim().replace(/^v/i, '');
    const [core, pre = ''] = clean.split('-', 2);
    const nums = core.split('.').map((n) => parseInt(n, 10) || 0);
    return { nums, pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa.nums[i] || 0) - (pb.nums[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  if (!pa.pre && !pb.pre) return 0;
  if (!pa.pre) return 1; // stable > prerelease of same version
  if (!pb.pre) return -1;
  return pa.pre.localeCompare(pb.pre, undefined, { numeric: true });
}

export function getUpdateTier(currentVersion: string, latestVersion: string): UpdateTier | null {
  if (compareVersions(latestVersion, currentVersion) <= 0) return null;
  const parseCore = (v: string) => {
    const clean = (v || '').trim().replace(/^v/i, '');
    const [core] = clean.split('-', 2);
    const parts = core.split('.').map((n) => parseInt(n, 10) || 0);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };
  const cur = parseCore(currentVersion);
  const lat = parseCore(latestVersion);
  if (lat[0] > cur[0]) return 'major';
  if (lat[1] > cur[1]) return 'minor';
  return 'patch';
}

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
  PREFETCH_DETAILS: 'provider:prefetchDetails',
  GET_SERIES_EPISODES: 'provider:getSeriesEpisodes',
  GET_STREAM: 'provider:getStream',
  SEARCH_FAST: 'provider:searchFast',
  SEARCH_ADVANCED: 'provider:searchAdvanced',
  CHECK_MIRRORS: 'provider:checkMirrors',
  SET_ACTIVE_MIRROR: 'provider:setActiveMirror',
  VERIFY_MIRROR: 'provider:verifyMirror',
  FIND_ONLINE_MIRRORS: 'provider:findOnlineMirrors',
  TRANSLATE_TITLES: 'provider:translateTitles',
  GET_SUBTITLE_TRACK: 'provider:getSubtitleTrack',

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
  SCHEDULE_UPDATE_ON_EXIT: 'app:scheduleUpdateOnExit',
  ON_UPDATE_PROGRESS: 'app:updateProgress',
  CLEAR_CACHE: 'app:clearCache',
  OPEN_EXTERNAL_URL: 'app:openExternal',
  CHECK_JUST_UPDATED: 'app:checkJustUpdated',
  APP_NAVIGATE: 'app:navigate',

  // Browser AdBlock & Cinema Hotkeys
  BROWSER_SET_ADBLOCK: 'browser:setAdBlock',
  BROWSER_GET_ADBLOCK: 'browser:getAdBlock',
  BROWSER_WEBVIEW_KEY: 'browser:webviewKey',
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
  { id: 'erotica', title: 'Эротика 18+' },
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
