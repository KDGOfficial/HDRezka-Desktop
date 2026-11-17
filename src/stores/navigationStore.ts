import { create } from 'zustand';
import { NavTab } from '../types/navigation';
import { MediaItem } from '../types/media';

interface NavigationState {
  activeTab: NavTab;
  searchQuery: string;
  selectedMedia: MediaItem | null;
  isDetailsOpen: boolean;
  isPlaying: boolean;
  playingMedia: MediaItem | null;
  playingSeason?: number;
  playingEpisode?: number;
  
  setActiveTab: (tab: NavTab) => void;
  setSearchQuery: (query: string) => void;
  openDetails: (media: MediaItem) => void;
  closeDetails: () => void;
  startPlayback: (media: MediaItem, season?: number, episode?: number) => void;
  stopPlayback: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeTab: 'home',
  searchQuery: '',
  selectedMedia: null,
  isDetailsOpen: false,
  isPlaying: false,
  playingMedia: null,
  playingSeason: undefined,
  playingEpisode: undefined,

  setActiveTab: (tab) => set({ activeTab: tab, isPlaying: false, isDetailsOpen: false }),
  setSearchQuery: (searchQuery) => set({ searchQuery, activeTab: 'search' }),
  openDetails: (media) => set({ selectedMedia: media, isDetailsOpen: true }),
  closeDetails: () => set({ isDetailsOpen: false }),
  startPlayback: (media, season, episode) => set({
    playingMedia: media,
    playingSeason: season,
    playingEpisode: episode,
    isPlaying: true
  }),
  stopPlayback: () => set({ isPlaying: false, playingMedia: null })
}));
