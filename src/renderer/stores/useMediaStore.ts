import { create } from 'zustand';
import { MediaItem, MediaDetails, FavoriteItem, WatchHistoryEntry } from '../../shared/types';
import { useSettingsStore } from './useSettingsStore';

export type AppPage =
  | 'home'
  | 'whatToWatch'
  | 'catalog'
  | 'films'
  | 'series'
  | 'cartoons'
  | 'animation'
  | 'erotica'
  | 'collections'
  | 'favorites'
  | 'history'
  | 'search'
  | 'browser'
  | 'settings'
  | 'details';

export interface NavHistoryEntry {
  page: AppPage;
  mediaId?: string | null;
  mediaDetails?: MediaDetails | null;
  searchQuery?: string;
  scrollTop?: number;
}

interface MediaState {
  currentPage: AppPage;
  lastContentPage: Exclude<AppPage, 'details'>;
  navHistory: NavHistoryEntry[];
  navIndex: number;
  pendingScrollTop: number | null;
  selectedMediaId: string | null;
  selectedMediaDetails: MediaDetails | null;
  searchQuery: string;
  browserQuery: string;
  browserUrl: string;
  favorites: FavoriteItem[];
  watchHistory: WatchHistoryEntry[];
  collectionModalItem: MediaItem | null;

  setPage: (page: AppPage) => void;
  goBack: () => boolean;
  goForward: () => boolean;
  saveCurrentScroll: (scrollTop: number) => void;
  clearPendingScroll: () => void;
  openDetails: (mediaId: string, preloaded?: Partial<MediaItem | MediaDetails>) => void;
  openBrowser: (queryOrUrl?: string) => void;
  setSelectedMediaDetails: (details: MediaDetails | null) => void;
  setSearchQuery: (query: string) => void;
  setFavorites: (favorites: FavoriteItem[]) => void;
  loadFavorites: () => Promise<void>;
  toggleFavorite: (item: MediaItem) => Promise<boolean>;
  setWatchHistory: (history: WatchHistoryEntry[]) => void;
  loadWatchHistory: () => Promise<void>;
  removeFromWatchHistory: (historyId: string) => Promise<void>;
  openCollectionModal: (item: MediaItem | null) => void;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  currentPage: 'home',
  lastContentPage: 'home',
  navHistory: [{ page: 'home', scrollTop: 0 }],
  navIndex: 0,
  pendingScrollTop: null,
  selectedMediaId: null,
  selectedMediaDetails: null,
  searchQuery: '',
  browserQuery: '',
  browserUrl: 'https://kinobase.org/',
  favorites: [],
  watchHistory: [],
  collectionModalItem: null,

  saveCurrentScroll: (scrollTop) => {
    const { navHistory, navIndex } = get();
    if (!navHistory[navIndex]) return;
    const updated = navHistory.slice();
    updated[navIndex] = { ...updated[navIndex], scrollTop };
    set({ navHistory: updated });
  },

  clearPendingScroll: () => set({ pendingScrollTop: null }),

  setPage: (page) => {
    const state = get();
    if (state.currentPage === page && page !== 'search') return;
    const mainEl = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-main-scroll]') : null;
    const history = state.navHistory.slice(0, state.navIndex + 1);
    if (history[state.navIndex] && mainEl) {
      history[state.navIndex] = { ...history[state.navIndex], scrollTop: mainEl.scrollTop };
    }
    const entry: NavHistoryEntry = {
      page,
      searchQuery: page === 'search' ? state.searchQuery : undefined,
      scrollTop: 0,
    };
    const nextHistory = [...history, entry].slice(-50);
    set({
      currentPage: page,
      lastContentPage: page === 'details' ? state.lastContentPage : page,
      navHistory: nextHistory,
      navIndex: nextHistory.length - 1,
      pendingScrollTop: 0,
    });
  },

  goBack: () => {
    const state = get();
    if (state.navIndex <= 0) return false;
    const mainEl = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-main-scroll]') : null;
    const history = state.navHistory.slice();
    if (history[state.navIndex] && mainEl) {
      history[state.navIndex] = { ...history[state.navIndex], scrollTop: mainEl.scrollTop };
    }
    const nextIndex = state.navIndex - 1;
    const target = history[nextIndex];
    set({
      navHistory: history,
      navIndex: nextIndex,
      currentPage: target.page,
      lastContentPage: target.page === 'details' ? state.lastContentPage : target.page,
      selectedMediaId: target.page === 'details' ? (target.mediaId ?? state.selectedMediaId) : state.selectedMediaId,
      selectedMediaDetails:
        target.page === 'details' ? (target.mediaDetails ?? state.selectedMediaDetails) : state.selectedMediaDetails,
      searchQuery: target.page === 'search' && target.searchQuery !== undefined ? target.searchQuery : state.searchQuery,
      pendingScrollTop: target.scrollTop ?? 0,
    });
    return true;
  },

  goForward: () => {
    const state = get();
    if (state.navIndex >= state.navHistory.length - 1) return false;
    const mainEl = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-main-scroll]') : null;
    const history = state.navHistory.slice();
    if (history[state.navIndex] && mainEl) {
      history[state.navIndex] = { ...history[state.navIndex], scrollTop: mainEl.scrollTop };
    }
    const nextIndex = state.navIndex + 1;
    const target = history[nextIndex];
    set({
      navHistory: history,
      navIndex: nextIndex,
      currentPage: target.page,
      lastContentPage: target.page === 'details' ? state.lastContentPage : target.page,
      selectedMediaId: target.page === 'details' ? (target.mediaId ?? state.selectedMediaId) : state.selectedMediaId,
      selectedMediaDetails:
        target.page === 'details' ? (target.mediaDetails ?? state.selectedMediaDetails) : state.selectedMediaDetails,
      searchQuery: target.page === 'search' && target.searchQuery !== undefined ? target.searchQuery : state.searchQuery,
      pendingScrollTop: target.scrollTop ?? 0,
    });
    return true;
  },

  openBrowser: (queryOrUrl) => {
    const raw = (queryOrUrl || '').trim();
    if (!raw) {
      get().setPage('browser');
      return;
    }
    if (/^https?:\/\//i.test(raw)) {
      set({ browserUrl: raw });
      get().setPage('browser');
      return;
    }
    const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(`${raw} смотреть онлайн бесплатно в хорошем качестве HD`)}`;
    set({ browserQuery: raw, browserUrl: targetUrl });
    get().setPage('browser');
  },

  openDetails: (mediaId, preloaded) => {
    let preloadedDetails: MediaDetails | null = null;
    if (preloaded) {
      preloadedDetails = {
        id: preloaded.id || mediaId,
        title: preloaded.title || '',
        origTitle: preloaded.origTitle || '',
        url: preloaded.url || mediaId,
        poster: preloaded.poster || '',
        backdrop: (preloaded as any).backdrop || preloaded.poster || '',
        year: preloaded.year || 2024,
        country: preloaded.country || 'США',
        type: preloaded.type || 'films',
        ratingRezka: (preloaded as any).ratingRezka || (preloaded as Partial<MediaItem>).rating || 7.8,
        ratingImdb: (preloaded as any).ratingImdb || 7.6,
        ratingKp: (preloaded as any).ratingKp || 7.5,
        genres: (preloaded as any).genres || ['Боевик', 'Приключения'],
        description: (preloaded as Partial<MediaItem>).info || (preloaded as any).description || 'Загрузка информации о фильме...',
        directors: (preloaded as any).directors || [],
        actors: (preloaded as any).actors || [],
        translators: (preloaded as any).translators || [],
        currentTranslatorId: (preloaded as any).currentTranslatorId || 0,
        seasons: (preloaded as any).seasons || [],
        similar: (preloaded as any).similar || [],
      };
    }

    const state = get();
    const mainEl = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-main-scroll]') : null;
    const history = state.navHistory.slice(0, state.navIndex + 1);
    if (history[state.navIndex] && mainEl) {
      history[state.navIndex] = { ...history[state.navIndex], scrollTop: mainEl.scrollTop };
    }
    const entry: NavHistoryEntry = {
      page: 'details',
      mediaId,
      mediaDetails: preloadedDetails,
      scrollTop: 0,
    };
    const nextHistory = [...history, entry].slice(-50);

    set({
      selectedMediaId: mediaId,
      selectedMediaDetails: preloadedDetails,
      currentPage: 'details',
      navHistory: nextHistory,
      navIndex: nextHistory.length - 1,
      pendingScrollTop: 0,
    });
  },

  setSelectedMediaDetails: (details) => set({ selectedMediaDetails: details }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFavorites: (favorites) => set({ favorites }),

  loadFavorites: async () => {
    if (window.api) {
      try {
        const favs = await window.api.getFavorites();
        set({ favorites: favs });
      } catch (err) {
        console.error('Failed to load favorites:', err);
      }
    }
  },

  toggleFavorite: async (item) => {
    if (!window.api) return false;
    const isFav = get().favorites.some((f) => f.mediaId === item.id);
    try {
      if (isFav) {
        await window.api.removeFavorite(item.id);
        set((state) => ({
          favorites: state.favorites.filter((f) => f.mediaId !== item.id),
        }));
        return false;
      } else {
        const favItem: FavoriteItem = {
          mediaId: item.id,
          title: item.title,
          origTitle: item.origTitle,
          poster: item.poster,
          type: item.type,
          year: item.year,
          rating: item.rating,
          addedAt: Date.now(),
        };
        await window.api.addFavorite(favItem);
        set((state) => ({
          favorites: [favItem, ...state.favorites],
        }));
        useSettingsStore.getState().recordTasteSignal(item, 'favorite');
        return true;
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
      return isFav;
    }
  },

  setWatchHistory: (watchHistory) => set({ watchHistory }),

  loadWatchHistory: async () => {
    if (window.api) {
      try {
        const history = await window.api.getWatchHistory();
        set({ watchHistory: history });
      } catch (err) {
        console.error('Failed to load watch history:', err);
      }
    }
  },

  removeFromWatchHistory: async (historyId: string) => {
    if (!historyId) return;
    set((state) => ({
      watchHistory: state.watchHistory.filter((h) => h.id !== historyId),
    }));
    if (window.api?.deleteWatchHistory) {
      try {
        await window.api.deleteWatchHistory(historyId);
      } catch (err) {
        console.error('Failed to delete watch history item:', err);
        get().loadWatchHistory();
      }
    }
  },

  openCollectionModal: (item) => set({ collectionModalItem: item }),
}));