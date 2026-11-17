import { create } from 'zustand';
import { MediaItem, MediaDetails, PlaybackSource, StreamQuality, SubtitleTrack } from '../types/media';
import { getPlaybackSources, saveProgress } from '../services/api';

interface PlayerState {
  media: MediaItem | null;
  details: MediaDetails | null;
  sources: PlaybackSource | null;
  selectedQuality: string;
  selectedTranslatorId: string;
  selectedSeason: number;
  selectedEpisode: number;
  selectedSubtitle: string | null;
  playbackSpeed: number;
  volume: number;
  isMuted: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  currentTime: number;
  duration: number;
  buffered: number;
  isFullscreen: boolean;

  initPlayer: (media: MediaItem, details: MediaDetails, season?: number, episode?: number) => Promise<void>;
  setPlaying: (isPlaying: boolean) => void;
  setQuality: (quality: string) => void;
  setTranslator: (translatorId: string) => Promise<void>;
  setEpisode: (season: number, episode: number) => Promise<void>;
  setSubtitle: (subtitle: string | null) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setTime: (currentTime: number) => void;
  setDuration: (duration: number) => void;
  setBuffered: (buffered: number) => void;
  setIsFullscreen: (isFullscreen: boolean) => void;
  setError: (error: string | null) => void;
  nextEpisode: () => Promise<void>;
  hasPreviousEpisode: () => boolean;
  hasNextEpisode: () => boolean;
  closePlayer: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  media: null,
  details: null,
  sources: null,
  selectedQuality: '1080p',
  selectedTranslatorId: '1',
  selectedSeason: 1,
  selectedEpisode: 1,
  selectedSubtitle: null,
  playbackSpeed: 1,
  volume: 80,
  isMuted: false,
  isPlaying: true,
  isLoading: true,
  error: null,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  isFullscreen: false,

  initPlayer: async (media, details, season = 1, episode = 1) => {
    set({
      media,
      details,
      selectedSeason: season,
      selectedEpisode: episode,
      isLoading: true,
      error: null,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      isPlaying: true
    });

    try {
      const defaultTranslator = details.translators && details.translators.length > 0
        ? details.translators[0].id
        : '1';

      set({ selectedTranslatorId: defaultTranslator });

      const isMovie = media.type === 'movie';
      const sources = await getPlaybackSources(
        media.id,
        defaultTranslator,
        season,
        episode,
        isMovie
      );

      const availableQualities = sources.streams.map(s => s.quality);
      const chosenQuality = availableQualities.includes('1080p')
        ? '1080p'
        : availableQualities[0] || '720p';

      set({
        sources,
        selectedQuality: chosenQuality,
        isLoading: false
      });
    } catch (err: any) {
      set({
        error: err?.message || 'Не удалось загрузить видеопоток. Попробуйте выбрать другое зеркало или перевод.',
        isLoading: false
      });
    }
  },

  setPlaying: (isPlaying) => set({ isPlaying }),
  setQuality: (selectedQuality) => set({ selectedQuality }),

  setTranslator: async (translatorId) => {
    const { media, selectedSeason, selectedEpisode } = get();
    if (!media) return;
    set({ selectedTranslatorId: translatorId, isLoading: true, error: null });

    try {
      const sources = await getPlaybackSources(
        media.id,
        translatorId,
        selectedSeason,
        selectedEpisode,
        media.type === 'movie'
      );
      set({ sources, isLoading: false });
    } catch (err: any) {
      set({ error: 'Ошибка загрузки озвучки', isLoading: false });
    }
  },

  setEpisode: async (season, episode) => {
    const { media, selectedTranslatorId } = get();
    if (!media) return;
    set({ selectedSeason: season, selectedEpisode: episode, isLoading: true, error: null, currentTime: 0 });

    try {
      const sources = await getPlaybackSources(
        media.id,
        selectedTranslatorId,
        season,
        episode,
        false
      );
      set({ sources, isLoading: false, isPlaying: true });
    } catch (err: any) {
      set({ error: 'Не удалось загрузить выбранную серию', isLoading: false });
    }
  },

  setSubtitle: (selectedSubtitle) => set({ selectedSubtitle }),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(100, volume));
    set({ volume: clamped, isMuted: clamped === 0 });
  },

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setTime: (currentTime) => {
    set({ currentTime });
    const { media, duration, selectedSeason, selectedEpisode } = get();
    // Throttle / periodic save progress
    if (media && duration > 0 && Math.floor(currentTime) % 10 === 0) {
      saveProgress(
        media.id,
        media.title,
        media.poster,
        media.type,
        Math.floor(currentTime),
        Math.floor(duration),
        selectedSeason,
        selectedEpisode
      );
    }
  },
  setDuration: (duration) => set({ duration }),
  setBuffered: (buffered) => set({ buffered }),
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
  setError: (error) => set({ error, isLoading: false }),

  hasPreviousEpisode: () => {
    const { details, selectedSeason, selectedEpisode } = get();
    if (!details?.seasons) return false;
    return selectedEpisode > 1 || selectedSeason > 1;
  },

  hasNextEpisode: () => {
    const { details, selectedSeason, selectedEpisode } = get();
    if (!details?.seasons) return false;
    const currentSeasonData = details.seasons.find(s => s.seasonNumber === selectedSeason);
    if (!currentSeasonData) return false;
    if (selectedEpisode < currentSeasonData.episodes.length) return true;
    return selectedSeason < details.seasons.length;
  },

  nextEpisode: async () => {
    const { details, selectedSeason, selectedEpisode, setEpisode } = get();
    if (!details?.seasons) return;
    const currentSeasonData = details.seasons.find(s => s.seasonNumber === selectedSeason);
    if (!currentSeasonData) return;

    if (selectedEpisode < currentSeasonData.episodes.length) {
      await setEpisode(selectedSeason, selectedEpisode + 1);
    } else if (selectedSeason < details.seasons.length) {
      await setEpisode(selectedSeason + 1, 1);
    }
  },

  closePlayer: () => {
    const { media, currentTime, duration, selectedSeason, selectedEpisode } = get();
    if (media && currentTime > 0) {
      saveProgress(
        media.id,
        media.title,
        media.poster,
        media.type,
        Math.floor(currentTime),
        Math.floor(duration),
        selectedSeason,
        selectedEpisode
      );
    }
    set({
      media: null,
      details: null,
      sources: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      error: null
    });
  }
}));
