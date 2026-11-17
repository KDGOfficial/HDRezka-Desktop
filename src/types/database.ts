import { MediaItem, MediaType } from './media';

export interface FavoriteItem {
  id: string;
  mediaId: string;
  title: string;
  poster: string;
  year: number;
  rating?: number;
  type: MediaType;
  genres: string[];
  addedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  itemCount: number;
  coverPoster?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  mediaItem: MediaItem;
  addedAt: string;
}

export interface WatchHistoryItem {
  id: string;
  mediaId: string;
  title: string;
  poster: string;
  type: MediaType;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  positionSeconds: number;
  durationSeconds: number;
  percentage: number;
  watchedAt: string;
  completed: boolean;
}

export interface MirrorConfig {
  id: string;
  url: string;
  name: string;
  isActive: boolean;
  isCustom: boolean;
  latencyMs?: number;
  isOnline: boolean;
  lastChecked?: string;
}

export interface UserSettings {
  theme: 'dark' | 'light' | 'system';
  cardSize: 'small' | 'medium' | 'large';
  animationsEnabled: boolean;
  sidebarCollapsed: boolean;
  language: string;
  homeSections: {
    popular: boolean;
    newReleases: boolean;
    newSeries: boolean;
    bestMovies: boolean;
    bestSeries: boolean;
    anime: boolean;
    cartoons: boolean;
    continueWatching: boolean;
    recommendations: boolean;
  };
  player: {
    defaultQuality: string;
    autoplay: boolean;
    autoNextEpisode: boolean;
    defaultPlaybackSpeed: number;
    defaultVolume: number;
    subtitlesEnabled: boolean;
    rememberPosition: boolean;
  };
}
