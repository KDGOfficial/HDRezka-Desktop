import { create } from 'zustand';
import { MediaItem, MediaDetails, ContentType, FavoriteItem, WatchHistoryEntry } from '../../shared/types';

export type AppPage =
  | 'home'
  | 'catalog'
  | 'films'
  | 'series'
  | 'cartoons'
  | 'animation'
  | 'collections'
  | 'favorites'
  | 'history'
  | 'search'
  | 'settings'
  | 'details';

interface MediaState {
  currentPage: AppPage;
  selectedMediaId: string | null;
  selectedMediaDetails: MediaDetails | null;
  searchQuery: string;
  favorites: FavoriteItem[];
  watchHistory: WatchHistoryEntry[];
  collectionModalItem: MediaItem | null;

  setPage: (page: AppPage) => void;
  openDetails: (mediaId: string) => void;
  setSelectedMediaDetails: (details: MediaDetails | null) => void;
  setSearchQuery: (query: string) => void;
  setFavorites: (favorites: FavoriteItem[]) => void;
  loadFavorites: () => Promise<void>;
  toggleFavorite: (item: MediaItem) => Promise<boolean>;
  setWatchHistory: (history: WatchHistoryEntry[]) => void;
  loadWatchHistory: () => Promise<void>;
  openCollectionModal: (item: MediaItem | null) => void;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  currentPage: 'home',
  selectedMediaId: null,
  selectedMediaDetails: null,
  searchQuery: '',
  favorites: [],
  watchHistory: [],
  collectionModalItem: null,

  setPage: (page) => set({ currentPage: page }),

  openDetails: (mediaId) => {
    set({
      selectedMediaId: mediaId,
      selectedMediaDetails: null,
      currentPage: 'details',
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

  openCollectionModal: (item) => set({ collectionModalItem: item }),
}));
