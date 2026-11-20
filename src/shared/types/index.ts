export type ContentType = 'films' | 'series' | 'cartoons' | 'animation' | 'shows';

export interface MediaItem {
  id: string;
  title: string;
  origTitle?: string;
  url: string;
  poster: string;
  year?: number;
  country?: string;
  genres?: string[];
  type: ContentType;
  rating?: number;
  info?: string;
  isWatched?: boolean;
  watchProgress?: number; // 0 to 100
}

export interface Translator {
  id: number;
  name: string;
  premium: boolean;
  camrip?: boolean;
  ads?: boolean;
  director?: boolean;
}

export interface Episode {
  id: number;
  title: string;
  seasonId: number;
  episodeId: number;
}

export interface Season {
  id: number;
  title: string;
  episodes: Episode[];
}

export interface VideoQualityStream {
  quality: string; // e.g. "360p", "720p", "1080p", "1080p Ultra"
  hls: string;
  mp4: string;
  isPremium?: boolean;
}

export interface SubtitleTrack {
  language: string;
  url: string;
}

export interface StreamData {
  streams: VideoQualityStream[];
  subtitles: SubtitleTrack[];
  thumbnails?: string;
}

export interface MediaDetails {
  id: string;
  title: string;
  origTitle: string;
  poster: string;
  backdrop?: string;
  year: number;
  country: string;
  genres: string[];
  type: ContentType;
  duration?: string;
  ageRating?: string;
  ratingRezka?: number;
  ratingImdb?: number;
  ratingKp?: number;
  description: string;
  directors: string[];
  actors: string[];
  translators: Translator[];
  currentTranslatorId?: number;
  seasons?: Season[];
  similar: MediaItem[];
  antiBot?: boolean; // site page was behind the bot check; translators are unknown until the user passes it
}

export interface CatalogFilter {
  type: ContentType;
  genre?: string;
  year?: string;
  country?: string;
  sort?: 'last' | 'popular' | 'rating' | 'watching';
  page: number;
}

export interface SearchResult {
  items: MediaItem[];
  page: number;
  hasMore: boolean;
}

export interface WatchHistoryEntry {
  id: string;
  mediaId: string;
  title: string;
  origTitle?: string;
  poster: string;
  type: ContentType;
  season?: number;
  episode?: number;
  currentTime: number;
  duration: number;
  percent: number;
  lastWatchedAt: number;
}

export interface FavoriteItem {
  mediaId: string;
  title: string;
  origTitle?: string;
  poster: string;
  type: ContentType;
  year?: number;
  rating?: number;
  addedAt: number;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  itemsCount?: number;
}

export interface CollectionItem {
  collectionId: string;
  mediaId: string;
  title: string;
  poster: string;
  type: ContentType;
  year?: number;
  rating?: number;
  addedAt: number;
}

export interface SearchHistoryEntry {
  query: string;
  searchedAt: number;
}

export interface UserSettings {
  theme: 'dark' | 'light' | 'oled' | 'system';
  cardSize: 'small' | 'medium' | 'large';
  homeSections: {
    hero: boolean;
    popular: boolean;
    newReleases: boolean;
    topMovies: boolean;
    topSeries: boolean;
    continueWatching: boolean;
    recommendations: boolean;
    expected: boolean;
  };
  language: 'ru' | 'uk' | 'en';
  player: {
    autoPlay: boolean;
    autoPlayNextEpisode: boolean;
    defaultQuality: string;
    playbackSpeed: number;
    volume: number;
    fullscreenOnPlay: boolean;
  };
  app: {
    autoLaunch: boolean;
    checkUpdatesOnStart: boolean;
    activeMirror: string;
    mirrors: string[];
    requestTimeoutMs: number;
  };
}

export interface MirrorStatus {
  url: string;
  isAvailable: boolean;
  latencyMs: number;
  lastChecked: number;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseNotes?: string;
  releaseDate?: string;
  downloadUrl?: string;
  assetName?: string;
  assetUrl?: string;
  assetSize?: number;
}

export interface UpdateProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'error' | 'opened_in_browser' | 'installing';
  error?: string;
  filePath?: string;
}
