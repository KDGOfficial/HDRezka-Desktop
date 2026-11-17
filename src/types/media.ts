export type MediaType = 'movie' | 'series' | 'cartoon' | 'anime' | 'show';

export interface MediaItem {
  id: string;
  title: string;
  originalTitle?: string;
  url: string;
  poster: string;
  backdrop?: string;
  year: number;
  country?: string;
  rating?: number;
  ratingCount?: number;
  genres: string[];
  type: MediaType;
  details?: string;
  duration?: string;
  episodesCount?: string;
}

export interface Translator {
  id: string;
  name: string;
  isCamrip?: boolean;
  isDirectorCut?: boolean;
}

export interface Season {
  id: string;
  seasonNumber: number;
  title: string;
  episodes: Episode[];
}

export interface Episode {
  id: string;
  episodeNumber: number;
  seasonNumber: number;
  title: string;
  duration?: string;
  thumbnail?: string;
  watched?: boolean;
  watchedProgress?: number;
}

export interface StreamQuality {
  quality: string; // e.g. "360p", "480p", "720p", "1080p", "1080p Ultra"
  url: string;
}

export interface SubtitleTrack {
  language: string;
  url: string;
}

export interface PlaybackSource {
  streams: StreamQuality[];
  subtitles: SubtitleTrack[];
  defaultQuality?: string;
  translatorId?: string;
}

export interface MediaDetails extends MediaItem {
  description: string;
  directors: string[];
  actors: string[];
  ageRating?: string;
  translators: Translator[];
  seasons?: Season[];
  similar: MediaItem[];
}

export interface CatalogFilter {
  category: 'all' | 'movies' | 'series' | 'cartoons' | 'anime' | 'shows';
  genre?: string;
  year?: string;
  country?: string;
  ratingMin?: number;
  sort: 'popular' | 'rating' | 'release_date' | 'added_date' | 'alphabetical';
  page: number;
}

export interface CatalogResponse {
  items: MediaItem[];
  page: number;
  totalPages: number;
  totalItems?: number;
}
