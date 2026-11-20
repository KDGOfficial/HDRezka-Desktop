import { create } from 'zustand';
import { StreamData, VideoQualityStream, SubtitleTrack, MediaDetails } from '../../shared/types';

interface PlayerState {
  isOpen: boolean;
  mediaDetails: MediaDetails | null;
  translatorId: number;
  seasonId?: number;
  episodeId?: number;
  streamData: StreamData | null;
  currentQuality: string;
  currentStreamUrl: string;
  isHls: boolean;
  currentSubtitle: string; // subtitle language or 'off' (kept across episodes/translators)
  playbackSpeed: number;
  volume: number;
  initialTime: number;
  isLoading: boolean;
  error: string | null;

  openPlayer: (params: {
    details: MediaDetails;
    translatorId: number;
    seasonId?: number;
    episodeId?: number;
    startTime?: number;
  }) => Promise<void>;
  closePlayer: () => void;
  setQuality: (quality: string) => void;
  setSubtitle: (language: string) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  switchEpisode: (seasonId: number, episodeId: number) => Promise<void>;
  switchTranslator: (translatorId: number) => Promise<void>;
  retryPlayback: () => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  isOpen: false,
  mediaDetails: null,
  translatorId: 0,
  seasonId: undefined,
  episodeId: undefined,
  streamData: null,
  currentQuality: '1080p',
  currentStreamUrl: '',
  isHls: false,
  currentSubtitle: 'off',
  playbackSpeed: 1.0,
  volume: 0.8,
  initialTime: 0,
  isLoading: false,
  error: null,

  openPlayer: async ({ details, translatorId, seasonId, episodeId, startTime = 0 }) => {
    set({
      isOpen: true,
      mediaDetails: details,
      translatorId,
      seasonId,
      episodeId,
      isLoading: true,
      error: null,
      initialTime: startTime,
    });

    try {
      // Check saved progress if startTime not explicitly given
      let startPosition = startTime;
      if (startPosition === 0 && window.api) {
        const prog = await window.api.getProgress(details.id, seasonId || 0, episodeId || 0);
        if (prog && prog.currentTime > 10 && prog.currentTime < prog.duration - 30) {
          startPosition = prog.currentTime;
        }
      }
      set({ initialTime: startPosition });

      const tr = details.translators?.find((t) => t.id === translatorId);
      const stream = await window.api.getStream({
        mediaId: details.id,
        translatorId,
        season: seasonId,
        episode: episodeId,
        isCamRip: tr?.camrip,
        isAds: tr?.ads,
        isDirector: tr?.director,
      });

      if (!stream || !stream.streams || stream.streams.length === 0) {
        throw new Error('Потоки для данного перевода временно недоступны.');
      }

      // Find best quality or 1080p / 720p
      const streams = stream.streams;
      const targetQuality = streams.find((s) => s.quality === '1080p') ||
                            streams.find((s) => s.quality === '720p') ||
                            streams[0];

      const useHls = !!targetQuality.hls;
      const streamUrl = targetQuality.hls || targetQuality.mp4;

      set({
        streamData: stream,
        currentQuality: targetQuality.quality,
        currentStreamUrl: streamUrl,
        isHls: useHls,
        isLoading: false,
      });
    } catch (err: any) {
      console.error('[usePlayerStore] Open error:', err);
      let message = err?.message || 'Ошибка воспроизведения видео';
      // Clean up internal Electron IPC prefixes
      message = message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      if (message.includes('<!doctype') || message.includes('Unexpected token') || message.includes('is not valid JSON')) {
        message = 'Видеопоток временно недоступен или ограничен правообладателем на серверах HDRezka. Попробуйте сменить зеркало в Настройках.';
      }
      set({
        isLoading: false,
        error: message,
      });
    }
  },

  closePlayer: () => {
    set({
      isOpen: false,
      mediaDetails: null,
      streamData: null,
      error: null,
    });
  },

  setQuality: (quality: string) => {
    const { streamData } = get();
    if (!streamData) return;
    const match = streamData.streams.find((s) => s.quality === quality);
    if (match) {
      const useHls = !!match.hls;
      set({
        currentQuality: quality,
        currentStreamUrl: match.hls || match.mp4,
        isHls: useHls,
      });
    }
  },

  setSubtitle: (language: string) => set({ currentSubtitle: language }),
  setPlaybackSpeed: (speed: number) => set({ playbackSpeed: speed }),
  setVolume: (volume: number) => set({ volume }),

  switchEpisode: async (seasonId: number, episodeId: number) => {
    const { mediaDetails, translatorId } = get();
    if (!mediaDetails) return;
    await get().openPlayer({
      details: mediaDetails,
      translatorId,
      seasonId,
      episodeId,
      startTime: 0,
    });
  },

  switchTranslator: async (translatorId: number) => {
    const { mediaDetails, seasonId, episodeId, currentTime } = get();
    if (!mediaDetails) return;

    let updatedDetails = { ...mediaDetails, currentTranslatorId: translatorId };
    if (
      window.api &&
      (mediaDetails.type === 'series' || mediaDetails.type === 'animation' || mediaDetails.type === 'cartoons')
    ) {
      try {
        const newSeasons = await window.api.getSeriesEpisodes(mediaDetails.id, translatorId);
        if (newSeasons && newSeasons.length > 0) {
          updatedDetails.seasons = newSeasons;
        }
      } catch (_) {}
    }

    await get().openPlayer({
      details: updatedDetails,
      translatorId,
      seasonId,
      episodeId,
      startTime: currentTime || 0,
    });
  },

  retryPlayback: async () => {
    const { mediaDetails, translatorId, seasonId, episodeId } = get();
    if (!mediaDetails) return;
    await get().openPlayer({
      details: mediaDetails,
      translatorId,
      seasonId,
      episodeId,
      startTime: 0,
    });
  },
}));
