import {
  MediaItem,
  MediaDetails,
  CatalogFilter,
  SearchResult,
  StreamData,
  Season,
  MirrorStatus,
} from '../../shared/types';

export interface IProvider {
  id: string;
  name: string;
  version: string;

  // Mirror management
  getActiveMirror(): string;
  setActiveMirror(mirror: string): void;
  getMirrors(): string[];
  setMirrors(mirrors: string[]): void;
  checkMirrors(): Promise<MirrorStatus[]>;
  selectBestMirror(): Promise<string>;

  // Catalog & Content
  getHomeSections(): Promise<{
    hero: MediaItem | null;
    popular: MediaItem[];
    newReleases: MediaItem[];
    topMovies: MediaItem[];
    topSeries: MediaItem[];
    recommendations: MediaItem[];
    expected: MediaItem[];
  }>;

  getCatalog(filter: CatalogFilter): Promise<{
    items: MediaItem[];
    page: number;
    hasMore: boolean;
  }>;

  getDetails(urlOrId: string, meta?: Partial<MediaItem>): Promise<MediaDetails>;

  getSeriesEpisodes(mediaId: string, translatorId: number): Promise<Season[]>;

  getStream(params: {
    mediaId: string;
    translatorId: number;
    season?: number;
    episode?: number;
    isCamRip?: boolean;
    isAds?: boolean;
    isDirector?: boolean;
    title?: string;
    origTitle?: string;
    year?: number;
    translatorName?: string;
  }): Promise<StreamData>;

  // Search
  searchFast(query: string): Promise<Array<{ title: string; url: string; rating?: number }>>;
  searchAdvanced(query: string, page?: number): Promise<SearchResult>;
}
