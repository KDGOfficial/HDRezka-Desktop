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
  resumeOfferTime: number | null;
  isLoading: boolean;
  error: string | null;
  trailerUrl?: string;

  openPlayer: (params: {
    details: MediaDetails;
    translatorId: number;
    seasonId?: number;
    episodeId?: number;
    startTime?: number;
  }) => Promise<void>;
  closePlayer: () => void;
  dismissResumeOffer: () => void;
  setQuality: (quality: string, resumeAt?: number) => void;
  syncHlsQualities: (streams: VideoQualityStream[], activeQuality?: string) => void;
  setSubtitle: (language: string) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  switchEpisode: (seasonId: number, episodeId: number) => Promise<void>;
  switchTranslator: (translatorId: number, resumeAt?: number) => Promise<void>;
  retryPlayback: () => Promise<void>;
}

let playRequestSeq = 0;

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
  resumeOfferTime: null,
  isLoading: false,
  error: null,
  trailerUrl: undefined,

  openPlayer: async ({ details, translatorId, seasonId, episodeId, startTime }) => {
    const seq = ++playRequestSeq;
    const explicitStart = typeof startTime === 'number' && Number.isFinite(startTime) ? Math.max(0, startTime) : 0;
    set({
      isOpen: true,
      mediaDetails: details,
      translatorId,
      seasonId,
      episodeId,
      isLoading: true,
      error: null,
      streamData: null,
      currentStreamUrl: '',
      trailerUrl: undefined,
      initialTime: explicitStart,
      resumeOfferTime: null,
    });

    try {
      // Always start cleanly from 0:00 unless caller explicitly requested a resume timestamp;
      // offer saved progress as a 1-click pill instead of silently cutting the movie intro.
      if (startTime === undefined && window.api) {
        const prog = await window.api.getProgress(details.id, seasonId || 0, episodeId || 0);
        if (seq !== playRequestSeq) return;
        if (prog && prog.currentTime >= 45 && prog.duration > 120 && prog.currentTime < prog.duration - 60) {
          set({ resumeOfferTime: prog.currentTime });
        }
      }

      const activeTranslatorId = (typeof translatorId === 'number')
        ? translatorId
        : ((typeof details.currentTranslatorId === 'number')
            ? details.currentTranslatorId
            : (details.translators?.[0]?.id ?? 0));
      const tr = details.translators?.find((t) => t.id === activeTranslatorId);
      const stream = await window.api.getStream({
        mediaId: details.id,
        translatorId: activeTranslatorId,
        season: seasonId,
        episode: episodeId,
        isCamRip: tr?.camrip,
        isAds: tr?.ads,
        isDirector: tr?.director,
        title: details.title,
        origTitle: details.origTitle,
        year: details.year,
        translatorName: tr?.name,
      });
      if (seq !== playRequestSeq) return;

      if (!stream || !stream.streams || stream.streams.length === 0) {
        throw new Error('Потоки для данного перевода временно недоступны.');
      }

      // Prefer crisp FullHD/4K/HD quality first; avoid auto-selecting low/camrip streams
      const streams = stream.streams;
      const preferredOrder = ['1080p Ultra', '1080p', '2160p', '1440p', '720p'];
      const targetQuality =
        preferredOrder.map((q) => streams.find((s: VideoQualityStream) => s.quality === q)).find(Boolean) ||
        [...streams].sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0))[0];

      const useHls = !!targetQuality.hls;
      const streamUrl = targetQuality.hls || targetQuality.mp4;

      set({
        streamData: stream,
        currentQuality: targetQuality.quality,
        currentStreamUrl: streamUrl,
        isHls: useHls,
        trailerUrl: stream.trailerUrl,
        isLoading: false,
      });
    } catch (err: any) {
      if (seq !== playRequestSeq) return;
      console.error('[usePlayerStore] Open error:', err);
      let message = err?.message || 'Ошибка воспроизведения видео';
      // Clean up internal Electron IPC prefixes
      message = message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      if (message.includes('сесси') || message.includes('бот') || message.includes('проверку')) {
        message = 'HDRezka требует пройти проверку «Я не бот» или обновить сессию. Нажмите «Пройти проверку» ниже.';
      } else if (message.includes('<!doctype') || message.includes('Unexpected token') || message.includes('is not valid JSON')) {
        message = 'Видеопоток временно недоступен или ограничен правообладателем на серверах HDRezka. Попробуйте сменить зеркало в Настройках.';
      }

      let trailerUrl = get().streamData?.trailerUrl;
      const tMatch = message.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s"']+/);
      if (tMatch) {
        trailerUrl = tMatch[0];
      }

      set({
        isLoading: false,
        error: message,
        trailerUrl,
      });
    }
  },

  closePlayer: () => {
    ++playRequestSeq;
    set({
      isOpen: false,
      mediaDetails: null,
      streamData: null,
      currentStreamUrl: '',
      trailerUrl: undefined,
      initialTime: 0,
      resumeOfferTime: null,
      isLoading: false,
      error: null,
    });
  },

  dismissResumeOffer: () => set({ resumeOfferTime: null }),

  setQuality: (quality: string, resumeAt?: number) => {
    const { streamData, currentStreamUrl } = get();
    if (!streamData) return;
    const match = streamData.streams.find((s) => s.quality === quality);
    if (match) {
      const nextUrl = match.hls || match.mp4;
      const useHls = !!match.hls;
      set({
        currentQuality: quality,
        currentStreamUrl: nextUrl,
        isHls: useHls,
        ...(nextUrl !== currentStreamUrl && typeof resumeAt === 'number' && Number.isFinite(resumeAt) && resumeAt >= 0
          ? { initialTime: resumeAt }
          : {}),
      });
    }
  },

  syncHlsQualities: (streams: VideoQualityStream[], activeQuality?: string) => {
    const { streamData } = get();
    if (!streamData || streams.length === 0) return;
    set({
      streamData: { ...streamData, streams },
      ...(activeQuality ? { currentQuality: activeQuality } : {}),
    });
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

  switchTranslator: async (translatorId: number, resumeAt?: number) => {
    const { mediaDetails, seasonId, episodeId } = get();
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
      startTime: typeof resumeAt === 'number' && resumeAt > 0 ? resumeAt : 0,
    });
  },

  retryPlayback: async () => {
    const { mediaDetails, translatorId, seasonId, episodeId } = get();
    if (!mediaDetails) return;

    let detailsToUse = mediaDetails;
    if (window.api && (!mediaDetails.translators || mediaDetails.translators.length === 0)) {
      try {
        const fresh = await window.api.getDetails(mediaDetails.id);
        if (fresh && fresh.translators && fresh.translators.length > 0) {
          detailsToUse = fresh;
        }
      } catch (_) {}
    }

    await get().openPlayer({
      details: detailsToUse,
      translatorId: detailsToUse.currentTranslatorId || translatorId || detailsToUse.translators?.[0]?.id || 56,
      seasonId,
      episodeId,
      startTime: 0,
    });
  },
}));
