import { invoke } from '@tauri-apps/api/core';
import {
  MediaItem,
  MediaDetails,
  CatalogFilter,
  CatalogResponse,
  PlaybackSource,
  Season,
} from '../types/media';
import {
  FavoriteItem,
  Collection,
  WatchHistoryItem,
  UserSettings,
  MirrorConfig,
} from '../types/database';
import {
  MOCK_HERO_ITEMS,
  MOCK_POPULAR_MOVIES,
  MOCK_POPULAR_SERIES,
  MOCK_POPULAR_ANIME,
  MOCK_CARTOONS,
  getMockDetails,
  getMockPlaybackSources,
} from './mockData';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// Window control
export async function windowMinimize(): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('app_minimize');
    } catch (e) {
      console.warn('Failed to minimize window:', e);
    }
  }
}

export async function windowToggleMaximize(): Promise<boolean> {
  if (isTauri()) {
    try {
      return await invoke<boolean>('app_toggle_maximize');
    } catch (e) {
      console.warn('Failed to toggle maximize:', e);
    }
  }
  return false;
}

export async function windowClose(): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('app_close');
    } catch (e) {
      console.warn('Failed to close window:', e);
    }
  }
}

export async function windowIsMaximized(): Promise<boolean> {
  if (isTauri()) {
    try {
      return await invoke<boolean>('app_is_maximized');
    } catch {
      return false;
    }
  }
  return false;
}

// Provider Methods
export async function getHeroItems(): Promise<MediaItem[]> {
  if (isTauri()) {
    try {
      return await invoke<MediaItem[]>('rezka_get_hero');
    } catch (err) {
      console.warn('Fallback to mock hero items:', err);
    }
  }
  return MOCK_HERO_ITEMS;
}

export async function getPopular(category = 'all'): Promise<MediaItem[]> {
  if (isTauri()) {
    try {
      return await invoke<MediaItem[]>('rezka_get_popular', { category });
    } catch (err) {
      console.warn('Fallback to mock popular:', err);
    }
  }
  if (category === 'series') return MOCK_POPULAR_SERIES;
  if (category === 'anime') return MOCK_POPULAR_ANIME;
  if (category === 'cartoons') return MOCK_CARTOONS;
  return MOCK_POPULAR_MOVIES;
}

export async function getNewReleases(category = 'all'): Promise<MediaItem[]> {
  if (isTauri()) {
    try {
      return await invoke<MediaItem[]>('rezka_get_new_releases', { category });
    } catch (err) {
      console.warn('Fallback to mock new releases:', err);
    }
  }
  return [...MOCK_POPULAR_MOVIES].reverse();
}

export async function getCatalog(filter: CatalogFilter): Promise<CatalogResponse> {
  if (isTauri()) {
    try {
      return await invoke<CatalogResponse>('rezka_get_catalog', { filter });
    } catch (err) {
      console.warn('Fallback to mock catalog:', err);
    }
  }

  let items = [...MOCK_POPULAR_MOVIES, ...MOCK_POPULAR_SERIES, ...MOCK_POPULAR_ANIME, ...MOCK_CARTOONS];
  if (filter.category === 'movies') items = items.filter(x => x.type === 'movie');
  if (filter.category === 'series') items = items.filter(x => x.type === 'series');
  if (filter.category === 'cartoons') items = items.filter(x => x.type === 'cartoon');
  if (filter.category === 'anime') items = items.filter(x => x.type === 'anime');

  if (filter.genre) {
    items = items.filter(x => x.genres.some(g => g.toLowerCase().includes(filter.genre!.toLowerCase())));
  }

  if (filter.sort === 'rating') {
    items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (filter.sort === 'alphabetical') {
    items.sort((a, b) => a.title.localeCompare(b.title));
  } else if (filter.sort === 'release_date') {
    items.sort((a, b) => b.year - a.year);
  }

  return {
    items,
    page: filter.page,
    totalPages: 5,
    totalItems: items.length * 5,
  };
}

export async function searchMedia(query: string, page = 1): Promise<CatalogResponse> {
  if (!query.trim()) {
    return { items: [], page: 1, totalPages: 1, totalItems: 0 };
  }

  if (isTauri()) {
    try {
      return await invoke<CatalogResponse>('rezka_search', { query, page });
    } catch (err) {
      console.warn('Fallback to mock search:', err);
    }
  }

  const all = [...MOCK_HERO_ITEMS, ...MOCK_POPULAR_MOVIES, ...MOCK_POPULAR_SERIES, ...MOCK_POPULAR_ANIME, ...MOCK_CARTOONS];
  const q = query.toLowerCase();
  const matched = all.filter(x => 
    x.title.toLowerCase().includes(q) || 
    (x.originalTitle && x.originalTitle.toLowerCase().includes(q)) ||
    x.genres.some(g => g.toLowerCase().includes(q))
  );

  return {
    items: matched,
    page: 1,
    totalPages: 1,
    totalItems: matched.length
  };
}

export async function getMediaDetails(id: string, url?: string): Promise<MediaDetails> {
  if (isTauri()) {
    try {
      return await invoke<MediaDetails>('rezka_get_details', { id, url });
    } catch (err) {
      console.warn('Fallback to mock details:', err);
    }
  }
  return getMockDetails(id);
}

export async function getSeasons(id: string, translatorId: string): Promise<Season[]> {
  if (isTauri()) {
    try {
      return await invoke<Season[]>('rezka_get_seasons', { id, translatorId });
    } catch (err) {
      console.warn('Fallback to mock seasons:', err);
    }
  }
  const details = getMockDetails(id);
  return details.seasons || [];
}

export async function getPlaybackSources(
  id: string,
  translatorId?: string,
  season?: number,
  episode?: number,
  isMovie?: boolean
): Promise<PlaybackSource> {
  if (isTauri()) {
    try {
      return await invoke<PlaybackSource>('rezka_get_playback_sources', {
        id,
        translatorId,
        season,
        episode,
        isMovie: isMovie ?? true,
      });
    } catch (err) {
      console.warn('Fallback to mock playback sources:', err);
    }
  }
  return getMockPlaybackSources();
}

// Mirrors
export async function getMirrors(): Promise<MirrorConfig[]> {
  if (isTauri()) {
    try {
      return await invoke<MirrorConfig[]>('rezka_get_mirrors');
    } catch (e) {
      console.warn('Failed to load mirrors from backend:', e);
    }
  }
  return [
    { id: '1', url: 'https://hdrezka.ag', name: 'HDRezka Primary (.ag)', isActive: true, isCustom: false, isOnline: true, latencyMs: 65 },
    { id: '2', url: 'https://rezka.ag', name: 'Rezka Mirror (.ag)', isActive: false, isCustom: false, isOnline: true, latencyMs: 82 },
    { id: '3', url: 'https://hdrezka.cm', name: 'HDRezka Mirror (.cm)', isActive: false, isCustom: false, isOnline: false },
    { id: '4', url: 'https://hdrezka.me', name: 'HDRezka Mirror (.me)', isActive: false, isCustom: false, isOnline: true, latencyMs: 110 },
  ];
}

export async function addMirror(url: string, name: string): Promise<MirrorConfig> {
  if (isTauri()) {
    return await invoke<MirrorConfig>('rezka_add_mirror', { url, name });
  }
  return { id: String(Date.now()), url, name, isActive: false, isCustom: true, isOnline: true, latencyMs: 90 };
}

export async function removeMirror(id: string): Promise<void> {
  if (isTauri()) {
    await invoke('rezka_remove_mirror', { id });
  }
}

export async function setActiveMirror(id: string): Promise<void> {
  if (isTauri()) {
    await invoke('rezka_set_active_mirror', { id });
  }
}

export async function testMirror(id: string): Promise<{ isOnline: boolean; latencyMs?: number }> {
  if (isTauri()) {
    return await invoke<{ isOnline: boolean; latencyMs?: number }>('rezka_test_mirror', { id });
  }
  return { isOnline: true, latencyMs: Math.floor(Math.random() * 80) + 40 };
}

// Database / Library API
export async function getFavorites(): Promise<FavoriteItem[]> {
  if (isTauri()) {
    try {
      return await invoke<FavoriteItem[]>('db_get_favorites');
    } catch (e) {
      console.warn('Failed to load favorites from db:', e);
    }
  }
  const saved = localStorage.getItem('hdrezka_favorites');
  return saved ? JSON.parse(saved) : [];
}

export async function toggleFavorite(item: MediaItem): Promise<boolean> {
  if (isTauri()) {
    try {
      return await invoke<boolean>('db_toggle_favorite', { item });
    } catch (e) {
      console.warn('Failed to toggle favorite in db:', e);
    }
  }
  const favs = await getFavorites();
  const exists = favs.some(x => x.mediaId === item.id);
  let updated: FavoriteItem[];
  if (exists) {
    updated = favs.filter(x => x.mediaId !== item.id);
  } else {
    updated = [
      {
        id: String(Date.now()),
        mediaId: item.id,
        title: item.title,
        poster: item.poster,
        year: item.year,
        rating: item.rating,
        type: item.type,
        genres: item.genres,
        addedAt: new Date().toISOString(),
      },
      ...favs
    ];
  }
  localStorage.setItem('hdrezka_favorites', JSON.stringify(updated));
  return !exists;
}

export async function isFavorite(mediaId: string): Promise<boolean> {
  if (isTauri()) {
    try {
      return await invoke<boolean>('db_is_favorite', { mediaId });
    } catch {
      return false;
    }
  }
  const favs = await getFavorites();
  return favs.some(x => x.mediaId === mediaId);
}

export async function getCollections(): Promise<Collection[]> {
  if (isTauri()) {
    try {
      return await invoke<Collection[]>('db_get_collections');
    } catch (e) {
      console.warn('Failed to load collections from db:', e);
    }
  }
  const saved = localStorage.getItem('hdrezka_collections');
  if (saved) return JSON.parse(saved);

  const defaults: Collection[] = [
    { id: 'col-1', name: 'Любимые фильмы', description: 'Золотая коллекция киношедевров', itemCount: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'col-2', name: 'Посмотреть позже', description: 'Запланировано к просмотру на выходных', itemCount: 4, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'col-3', name: 'Лучшие комедии', description: 'Фильмы для поднятия настроения', itemCount: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ];
  localStorage.setItem('hdrezka_collections', JSON.stringify(defaults));
  return defaults;
}

export async function createCollection(name: string, description?: string): Promise<Collection> {
  if (isTauri()) {
    return await invoke<Collection>('db_create_collection', { name, description });
  }
  const cols = await getCollections();
  const newCol: Collection = {
    id: 'col-' + Date.now(),
    name,
    description,
    itemCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  cols.push(newCol);
  localStorage.setItem('hdrezka_collections', JSON.stringify(cols));
  return newCol;
}

export async function deleteCollection(id: string): Promise<void> {
  if (isTauri()) {
    await invoke('db_delete_collection', { id });
    return;
  }
  const cols = (await getCollections()).filter(x => x.id !== id);
  localStorage.setItem('hdrezka_collections', JSON.stringify(cols));
}

export async function getWatchHistory(): Promise<WatchHistoryItem[]> {
  if (isTauri()) {
    try {
      return await invoke<WatchHistoryItem[]>('db_get_history');
    } catch (e) {
      console.warn('Failed to load history from db:', e);
    }
  }
  const saved = localStorage.getItem('hdrezka_history');
  return saved ? JSON.parse(saved) : [
    {
      id: 'h-1',
      mediaId: 'hero-1',
      title: 'Дюна: Часть вторая',
      poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
      type: 'movie',
      positionSeconds: 3450,
      durationSeconds: 9960,
      percentage: 35,
      watchedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      completed: false,
    },
    {
      id: 'h-2',
      mediaId: 's-1',
      title: 'Очень странные дела',
      poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
      type: 'series',
      seasonNumber: 1,
      episodeNumber: 3,
      episodeTitle: 'Серия 3: Долгое эхо',
      positionSeconds: 2100,
      durationSeconds: 3200,
      percentage: 65,
      watchedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      completed: false,
    }
  ];
}

export async function saveProgress(
  mediaId: string,
  title: string,
  poster: string,
  type: string,
  positionSeconds: number,
  durationSeconds: number,
  seasonNumber?: number,
  episodeNumber?: number,
  episodeTitle?: string
): Promise<void> {
  const percentage = durationSeconds > 0 ? Math.round((positionSeconds / durationSeconds) * 100) : 0;
  const completed = percentage >= 90;

  if (isTauri()) {
    try {
      await invoke('db_save_progress', {
        mediaId,
        title,
        poster,
        mediaType: type,
        positionSeconds,
        durationSeconds,
        percentage,
        seasonNumber,
        episodeNumber,
        episodeTitle,
        completed,
      });
      return;
    } catch (e) {
      console.warn('Failed to save progress in db:', e);
    }
  }

  const hist = await getWatchHistory();
  const existingIdx = hist.findIndex(x => x.mediaId === mediaId);
  const updatedItem: WatchHistoryItem = {
    id: existingIdx >= 0 ? hist[existingIdx].id : 'h-' + Date.now(),
    mediaId,
    title,
    poster,
    type: type as any,
    seasonNumber,
    episodeNumber,
    episodeTitle,
    positionSeconds,
    durationSeconds,
    percentage,
    watchedAt: new Date().toISOString(),
    completed,
  };

  if (existingIdx >= 0) {
    hist.splice(existingIdx, 1);
  }
  hist.unshift(updatedItem);
  localStorage.setItem('hdrezka_history', JSON.stringify(hist));
}

export async function clearWatchHistory(): Promise<void> {
  if (isTauri()) {
    await invoke('db_clear_history');
    return;
  }
  localStorage.removeItem('hdrezka_history');
}

export async function deleteHistoryItem(id: string): Promise<void> {
  if (isTauri()) {
    await invoke('db_delete_history_item', { id });
    return;
  }
  const hist = (await getWatchHistory()).filter(x => x.id !== id);
  localStorage.setItem('hdrezka_history', JSON.stringify(hist));
}

export async function getUserSettings(): Promise<UserSettings> {
  const defaultSettings: UserSettings = {
    theme: 'dark',
    cardSize: 'medium',
    animationsEnabled: true,
    sidebarCollapsed: false,
    language: 'ru',
    homeSections: {
      popular: true,
      newReleases: true,
      newSeries: true,
      bestMovies: true,
      bestSeries: true,
      anime: true,
      cartoons: true,
      continueWatching: true,
      recommendations: true,
    },
    player: {
      defaultQuality: '1080p',
      autoplay: true,
      autoNextEpisode: true,
      defaultPlaybackSpeed: 1,
      defaultVolume: 80,
      subtitlesEnabled: false,
      rememberPosition: true,
    },
  };

  if (isTauri()) {
    try {
      return await invoke<UserSettings>('db_get_settings');
    } catch {
      // fallback
    }
  }

  const saved = localStorage.getItem('hdrezka_settings');
  return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('db_save_settings', { settings });
    } catch (e) {
      console.warn('Failed to save settings to db:', e);
    }
  }
  localStorage.setItem('hdrezka_settings', JSON.stringify(settings));
}
