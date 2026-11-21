import React, { useRef, useState, useEffect } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume1,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  SkipForward,
  Settings,
  Subtitles,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Sliders,
  Tv,
  Pin,
  EyeOff,
  Move,
  Scaling,
  Globe,
  ShieldCheck,
  Clock,
  X,
} from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useMediaStore } from '../stores/useMediaStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { HorizontalSlider } from './HorizontalSlider';
import { useTranslation } from '../i18n';
import { formatDuration } from '../../shared/utils';
import appLogo from '../assets/logo.png';

function getHlsLevelQualityRank(level: { width?: number; height?: number }): number {
  const w = level.width || 0;
  const h = level.height || 0;
  if (w >= 3800 || h >= 2000) return 2160;
  if (w >= 2500 || h >= 1350) return 1440;
  if (w >= 1800 || h >= 1000) return 1080;
  if (w >= 1200 || h >= 680) return 720;
  if (w >= 800 || h >= 450) return 480;
  if (w >= 500 || h >= 300) return 360;
  return h;
}

function getTargetQualityRank(label: string): number {
  const q = (label || '').toLowerCase();
  if (q.includes('2160') || q.includes('4k')) return 2160;
  if (q.includes('1440')) return 1440;
  if (q.includes('1080')) return 1080;
  if (q.includes('720')) return 720;
  if (q.includes('480')) return 480;
  if (q.includes('360')) return 360;
  return parseInt(q.replace(/[^\d]/g, ''), 10) || 1080;
}

function findBestHlsLevelIndex(
  levels: Array<{ width?: number; height?: number; bitrate?: number }>,
  targetQuality: string
): number {
  if (!levels || levels.length === 0) return -1;
  const targetRank = getTargetQualityRank(targetQuality);

  // 1. Exact resolution class match -> pick highest bitrate so picture is crisp, never pixelated
  let bestExactIdx = -1;
  let bestExactBitrate = -1;
  levels.forEach((lvl, idx) => {
    const rank = getHlsLevelQualityRank(lvl);
    const br = lvl.bitrate || 0;
    if (rank === targetRank && br >= bestExactBitrate) {
      bestExactBitrate = br;
      bestExactIdx = idx;
    }
  });
  if (bestExactIdx !== -1) return bestExactIdx;

  // 2. Fallback: for FullHD/4K pick highest resolution + bitrate available; otherwise closest <= target
  if (targetRank >= 1080) {
    let bestIdx = 0;
    let bestRank = -1;
    let bestBr = -1;
    levels.forEach((lvl, idx) => {
      const rank = getHlsLevelQualityRank(lvl);
      const br = lvl.bitrate || 0;
      if (rank > bestRank || (rank === bestRank && br > bestBr)) {
        bestRank = rank;
        bestBr = br;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  let closestIdx = 0;
  let closestDiff = Infinity;
  let closestBr = -1;
  levels.forEach((lvl, idx) => {
    const rank = getHlsLevelQualityRank(lvl);
    const diff = Math.abs(rank - targetRank);
    const br = lvl.bitrate || 0;
    if (diff < closestDiff || (diff === closestDiff && br > closestBr)) {
      closestDiff = diff;
      closestBr = br;
      closestIdx = idx;
    }
  });
  return closestIdx;
}

export const VideoPlayer: React.FC = () => {
  const { t } = useTranslation();
  const {
    isOpen,
    mediaDetails,
    translatorId,
    seasonId,
    episodeId,
    streamData,
    currentQuality,
    currentStreamUrl,
    isHls,
    currentSubtitle,
    playbackSpeed,
    volume,
    initialTime,
    resumeOfferTime,
    isLoading,
    error,
    closePlayer,
    dismissResumeOffer,
    setQuality,
    syncHlsQualities,
    setSubtitle,
    setPlaybackSpeed,
    setVolume,
    switchEpisode,
    switchTranslator,
    retryPlayback,
  } = usePlayerStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [activeMenu, setActiveMenu] = useState<'none' | 'quality' | 'speed' | 'subtitles' | 'translator' | 'episodes'>('none');
  const [episodeMenuSeasonId, setEpisodeMenuSeasonId] = useState<number | undefined>(seasonId);
  const [isUiLocked, setIsUiLocked] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showScaleMenu, setShowScaleMenu] = useState(false);
  const [videoFit, setVideoFit] = useState<'contain' | '16:10' | '21:9' | '4:3' | 'cover' | 'fill'>('contain');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const hideTimerRef = useRef<any>(null);
  const toastTimerRef = useRef<any>(null);
  const lastVolumeRef = useRef(volume > 0 ? volume : 0.8);
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const userSeekedRef = useRef(false);
  const lastUiSyncRef = useRef(0);
  const showControlsRef = useRef(showControls);
  const currentQualityRef = useRef(currentQuality);
  const announcedStreamRef = useRef<string | null>(null);

  showControlsRef.current = showControls;
  currentQualityRef.current = currentQuality;

  useEffect(() => {
    setEpisodeMenuSeasonId(seasonId);
  }, [seasonId, mediaDetails?.id]);

  // Sync displayed time immediately when OSD reappears after being hidden
  useEffect(() => {
    if (showControls && videoRef.current) {
      setCurrentTime(videoRef.current.currentTime || 0);
      if (videoRef.current.buffered.length > 0) {
        setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
      }
    }
  }, [showControls]);

  // Auto-dismiss optional resume pill after 12 seconds so it never clutters playback
  useEffect(() => {
    if (!resumeOfferTime) return;
    const tmr = setTimeout(() => dismissResumeOffer(), 12000);
    return () => clearTimeout(tmr);
  }, [resumeOfferTime, dismissResumeOffer]);

  const subtitleTrack = streamData?.subtitles?.find((s) => s.language === currentSubtitle);
  const activeTranslator =
    mediaDetails?.translators?.find((tr) => tr.id === translatorId) || mediaDetails?.translators?.[0];
  const effectiveVolume = isMuted ? 0 : volume;
  const effectivePercent = Math.round(effectiveVolume * 100);
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  // Sync window pin state on mount or open
  useEffect(() => {
    if (isOpen && window.api?.isAlwaysOnTop) {
      window.api.isAlwaysOnTop().then(setIsPinned);
    }
  }, [isOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2600);
  };

  const toggleUiLock = () => {
    setIsUiLocked((prev) => {
      const next = !prev;
      if (next) {
        setShowControls(false);
        showToast(t.player.uiLocked);
      } else {
        setShowControls(true);
        showToast(t.player.uiUnlocked);
      }
      return next;
    });
  };

  const handleTogglePin = async () => {
    if (window.api?.setAlwaysOnTop) {
      const next = !isPinned;
      if (next) {
        if (document.fullscreenElement) {
          try {
            await document.exitFullscreen();
          } catch (_) {}
          setIsFullscreen(false);
        }
        if (window.api.unmaximize) {
          await window.api.unmaximize();
        }
        if (window.api.getBounds && window.api.setBounds) {
          const b = await window.api.getBounds();
          if (b && (b.width > 1200 || b.height > 750)) {
            await window.api.setBounds({ width: 854, height: 480 });
          }
        }
      }
      await window.api.setAlwaysOnTop(next);
      setIsPinned(next);
      showToast(next ? t.player.pinned : t.player.unpinned);
    }
  };

  const handleResizePreset = async (w: number, h: number) => {
    if (window.api?.setBounds) {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch (_) {}
        setIsFullscreen(false);
      }
      if (window.api.unmaximize) await window.api.unmaximize();
      await window.api.setBounds({ width: w, height: h });
      setShowScaleMenu(false);
      showToast(`${w}×${h}`);
    }
  };

  const handleStartResize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.api?.getBounds || !window.api?.setBounds) return;
    const cur = await window.api.getBounds();
    if (!cur) return;
    isResizingRef.current = true;
    resizeStartRef.current = { x: e.screenX, y: e.screenY, w: cur.width, h: cur.height };

    const onMove = (moveEvt: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = moveEvt.screenX - resizeStartRef.current.x;
      const dy = moveEvt.screenY - resizeStartRef.current.y;
      const targetW = Math.max(320, Math.round(resizeStartRef.current.w + dx));
      const targetH = Math.max(180, Math.round(resizeStartRef.current.h + dy));
      window.api?.setBounds({ width: targetW, height: targetH });
    };

    const onUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const cycleVideoFit = () => {
    const order: Array<'contain' | '16:10' | '21:9' | '4:3' | 'cover' | 'fill'> = [
      'contain',
      '16:10',
      '21:9',
      '4:3',
      'cover',
      'fill',
    ];
    const labels: Record<(typeof order)[number], string> = {
      contain: t.player.scaleOriginal,
      '16:10': 'Масштаб: 16:10',
      '21:9': 'Масштаб: 21:9 (Ultrawide)',
      '4:3': 'Масштаб: 4:3',
      cover: t.player.scaleCover,
      fill: t.player.scaleFill,
    };
    setVideoFit((prev) => {
      const next = order[(order.indexOf(prev) + 1) % order.length];
      showToast(labels[next]);
      return next;
    });
  };

  // Dynamically inserted <track default> is not always shown by Chromium; force it on
  useEffect(() => {
    const tracks = videoRef.current?.textTracks;
    if (tracks) for (const track of Array.from(tracks)) track.mode = 'showing';
  }, [subtitleTrack?.url]);

  const resetHideTimer = () => {
    if (isUiLocked) return;
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying && activeMenu === 'none') {
        setShowControls(false);
      }
    }, 3500);
  };

  useEffect(() => {
    const handleMouseMove = () => {
      if (!isUiLocked) resetHideTimer();
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying, activeMenu, isUiLocked]);

  useEffect(() => {
    if (!isOpen) {
      announcedStreamRef.current = null;
    }
    if (!isOpen || !currentStreamUrl) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    }
  }, [isOpen, currentStreamUrl]);

  useEffect(() => {
    if (!isLoading) return;
    const stallTimer = setTimeout(() => {
      usePlayerStore.setState({
        isLoading: false,
        error: 'Подключение к видеопотоку превысило лимит ожидания. Попробуйте выбрать другое зеркало или озвучку.',
      });
    }, 25000);
    return () => clearTimeout(stallTimer);
  }, [isLoading]);

  // HLS & Video Stream initialization
  useEffect(() => {
    if (!isOpen || !videoRef.current) return;

    if (!currentStreamUrl) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
      setIsBuffering(false);
      return;
    }

    const video = videoRef.current;
    const startSec = initialTime > 0 ? initialTime : 0;
    userSeekedRef.current = false;
    setIsBuffering(true);
    setCurrentTime(startSec);
    video.volume = volume;
    video.defaultPlaybackRate = playbackSpeed;

    const streamAnnounceKey = streamData
      ? `${mediaDetails?.id || ''}|${seasonId || 0}|${episodeId || 0}|${translatorId}|${streamData.sourceName || ''}|${streamData.upgradedMirror ? 'up' : 'base'}`
      : null;
    if (streamData && streamAnnounceKey && announcedStreamRef.current !== streamAnnounceKey) {
      announcedStreamRef.current = streamAnnounceKey;
      if (streamData.upgradedMirror && streamData.upgradedFromQuality) {
        showToast(
          `Автопереключение на ${currentQualityRef.current} (${streamData.sourceName || 'зеркало HD'}) вместо ${streamData.upgradedFromQuality}`
        );
      } else if (streamData.isAlternative) {
        showToast(`Источник: ${streamData.sourceName || 'альтернативный поток'}`);
      }
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let cleanedUp = false;
    let onNativeLoadedMetadata: (() => void) | null = null;
    let onHlsLoadedData: (() => void) | null = null;

    if (isHls && Hls.isSupported()) {
      let networkRetries = 0;
      let mediaRetries = 0;
      let firstFragStart = 0;
      let introGuardDone = startSec !== 0;
      let triedAltHls = false;

      const hls = new Hls({
        enableWorker: true,
        // Wait for MANIFEST_PARSED to lock exact 1080p level before fetching fragment 0 (no pixelated intro!)
        autoStartLoad: false,
        // Prefetch next VOD fragment to eliminate micro-stutters between segments
        startFragPrefetch: true,
        // VOD movies must NOT use LL-HLS lowLatencyMode (it starves buffer and skips intro segments)
        lowLatencyMode: false,
        startPosition: startSec,
        maxBufferLength: 60,
        maxMaxBufferLength: 180,
        maxBufferSize: 120 * 1000 * 1000,
        maxBufferHole: 1.0,
        backBufferLength: 30,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 8,
        // Assume broadband desktop connection so master playlists start crisp instead of pixelated 360p
        abrEwmaDefaultEstimate: 10_000_000,
        capLevelToPlayerSize: false,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 500,
        fragLoadingMaxRetryTimeout: 8000,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
      });
      hlsRef.current = hls;
      hls.loadSource(currentStreamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cleanedUp) return;

        // Lock HLS level to requested resolution (highest bitrate variant) BEFORE loading fragment 0
        if (hls.levels && hls.levels.length > 1) {
          const targetIdx = findBestHlsLevelIndex(hls.levels, currentQualityRef.current);
          if (targetIdx >= 0) {
            hls.currentLevel = targetIdx;
            hls.nextLevel = targetIdx;
            hls.loadLevel = targetIdx;
          }

          // If provider exposed only a single master entry, populate real parsed resolutions in the Quality menu
          if (streamData?.streams && streamData.streams.length <= 1) {
            const byLabel = new Map<string, { rank: number; bitrate: number }>();
            for (const lvl of hls.levels) {
              const rank = getHlsLevelQualityRank(lvl);
              if (rank < 300) continue;
              const label = `${rank}p`;
              const prev = byLabel.get(label);
              if (!prev || (lvl.bitrate || 0) > prev.bitrate) {
                byLabel.set(label, { rank, bitrate: lvl.bitrate || 0 });
              }
            }
            if (byLabel.size > 1) {
              const discovered = Array.from(byLabel.entries())
                .sort((a, b) => b[1].rank - a[1].rank)
                .map(([quality]) => ({ quality, hls: currentStreamUrl, mp4: currentStreamUrl }));
              const activeRank = targetIdx >= 0 ? getHlsLevelQualityRank(hls.levels[targetIdx]) : 0;
              syncHlsQualities(discovered, activeRank >= 300 ? `${activeRank}p` : discovered[0].quality);
            }
          }
        }

        // Start loading explicitly from startSec (0:00 for fresh playback) so intro is never cut off
        hls.startLoad(startSec);
        video.play().catch(() => setIsPlaying(false));
      });

      // Record fragment 0 start on playlist load; run one-shot intro guard once first media actually buffers/decodes
      const checkIntroGuard = (markDone: boolean) => {
        if (cleanedUp || introGuardDone) return;
        if (startSec !== 0 || userSeekedRef.current) {
          introGuardDone = true;
          return;
        }
        if (video.currentTime > firstFragStart + 1.5 && video.currentTime < 45) {
          video.currentTime = firstFragStart;
          introGuardDone = true;
          return;
        }
        if (markDone) {
          introGuardDone = true;
        }
      };

      hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
        if (cleanedUp || introGuardDone) return;
        const start = data?.details?.fragments?.[0]?.start;
        if (typeof start === 'number' && Number.isFinite(start)) {
          firstFragStart = start;
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, (_, data) => {
        if (cleanedUp || introGuardDone) return;
        if (data?.frag?.type === 'main') {
          checkIntroGuard(false);
        }
      });

      onHlsLoadedData = () => checkIntroGuard(true);
      video.addEventListener('loadeddata', onHlsLoadedData, { once: true });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (cleanedUp) return;
        if (!data.fatal) {
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR && video.readyState < 3) {
            setIsBuffering(true);
          }
          return;
        }

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR: {
            if (networkRetries === 0 && (currentStreamUrl.includes('voidboost') || currentStreamUrl.includes('ukrtelcdn'))) {
              const unblocked = currentStreamUrl
                .replace(/https?:\/\/stream\.voidboost\.(?:cc|top|club|link)/i, 'https://femeretes.org')
                .replace(/https?:\/\/[a-z0-9.-]+\.ukrtelcdn\.net/i, 'https://vdbmate.org');
              if (unblocked !== currentStreamUrl) {
                networkRetries += 1;
                showToast('Переключение на резервный CDN...');
                hls.loadSource(unblocked);
                hls.startLoad(video.currentTime || startSec);
                return;
              }
            }
            if (networkRetries < 3) {
              networkRetries += 1;
              hls.startLoad(video.currentTime || startSec);
              return;
            }
            // Try an alternate HLS stream before falling back to direct MP4
            if (!triedAltHls) {
              const altHls = streamData?.streams?.find(
                (s) => s.hls && s.hls !== currentStreamUrl && /\.m3u8(?:$|\?)/i.test(s.hls)
              )?.hls;
              if (altHls) {
                triedAltHls = true;
                networkRetries = 1;
                showToast('Переключение на резервный поток...');
                hls.loadSource(altHls);
                hls.startLoad(video.currentTime || startSec);
                return;
              }
            }
            // Only assign genuine non-HLS MP4 URLs to native <video src> (Chromium cannot play .m3u8 natively)
            const altMp4 = streamData?.streams?.find(
              (s) => s.mp4 && s.mp4 !== currentStreamUrl && !/\.m3u8(?:$|\?)/i.test(s.mp4)
            )?.mp4;
            if (altMp4 && videoRef.current) {
              hls.destroy();
              hlsRef.current = null;
              const resumePos = videoRef.current.currentTime || startSec;
              videoRef.current.src = altMp4;
              videoRef.current.load();
              videoRef.current.currentTime = resumePos;
              videoRef.current.play().catch(() => setIsPlaying(false));
              return;
            }
            hls.destroy();
            hlsRef.current = null;
            setIsBuffering(false);
            usePlayerStore.setState({
              error: 'Не удалось загрузить видеопоток. Попробуйте выбрать другое качество или сменить активное зеркало в Настройках.',
            });
            break;
          }
          case Hls.ErrorTypes.MEDIA_ERROR:
            if (mediaRetries < 3) {
              mediaRetries += 1;
              hls.recoverMediaError();
            } else {
              hls.destroy();
              hlsRef.current = null;
              setIsBuffering(false);
              usePlayerStore.setState({
                error: 'Ошибка декодирования видеопотока. Попробуйте выбрать другое качество или озвучку.',
              });
            }
            break;
          default:
            hls.destroy();
            hlsRef.current = null;
            setIsBuffering(false);
            usePlayerStore.setState({
              error: 'Не удалось загрузить видеопоток. Попробуйте выбрать другое качество или сменить активное зеркало в Настройках.',
            });
            break;
        }
      });
    } else {
      video.src = currentStreamUrl;
      onNativeLoadedMetadata = () => {
        if (cleanedUp) return;
        video.currentTime = startSec;
        video.play().catch(() => setIsPlaying(false));
      };
      video.addEventListener('loadedmetadata', onNativeLoadedMetadata, { once: true });
      video.load();
    }

    return () => {
      cleanedUp = true;
      if (onNativeLoadedMetadata) {
        video.removeEventListener('loadedmetadata', onNativeLoadedMetadata);
      }
      if (onHlsLoadedData) {
        video.removeEventListener('loadeddata', onHlsLoadedData);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentStreamUrl, isHls, isOpen]);

  // Periodic progress saving (stable 5s interval — never re-armed on every timeupdate frame)
  useEffect(() => {
    if (!isOpen || !mediaDetails) return;

    const interval = setInterval(() => {
      if (window.api && videoRef.current) {
        const time = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        if (!Number.isFinite(time) || !Number.isFinite(dur) || time <= 0 || dur <= 0) return;
        const percent = (time / dur) * 100;

        window.api.saveProgress(mediaDetails.id, seasonId || 0, episodeId || 0, time, dur);

        window.api.saveWatchHistory({
          id: `${mediaDetails.id}_${seasonId || 0}_${episodeId || 0}`,
          mediaId: mediaDetails.id,
          title: mediaDetails.title,
          origTitle: mediaDetails.origTitle,
          poster: mediaDetails.poster,
          type: mediaDetails.type,
          season: seasonId,
          episode: episodeId,
          currentTime: time,
          duration: dur,
          percent: Math.min(100, Math.round(percent)),
          lastWatchedAt: Date.now(),
          url: mediaDetails.url || undefined,
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOpen, mediaDetails, seasonId, episodeId]);

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      switch (e.code) {
        case 'KeyH':
          e.preventDefault();
          toggleUiLock();
          break;
        case 'KeyP':
          e.preventDefault();
          handleTogglePin();
          break;
        case 'KeyZ':
          e.preventDefault();
          cycleVideoFit();
          break;
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekDelta(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekDelta(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'Escape':
          e.preventDefault();
          if (isUiLocked) {
            setIsUiLocked(false);
            setShowControls(true);
            showToast(t.player.uiUnlocked);
          } else if (activeMenu !== 'none') {
            setActiveMenu('none');
          } else if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            handleClose();
          }
          break;
      }
      if (!isUiLocked) {
        resetHideTimer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPlaying, isMuted, volume, activeMenu, isUiLocked, t]);

  if (!isOpen) return null;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seekDelta = (delta: number) => {
    if (!videoRef.current) return;
    userSeekedRef.current = true;
    dismissResumeOffer();
    const next = Math.max(0, Math.min(videoRef.current.currentTime + delta, duration || videoRef.current.duration || 0));
    videoRef.current.currentTime = next;
    setCurrentTime(next);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    userSeekedRef.current = true;
    dismissResumeOffer();
    setCurrentTime(target);
    if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
  };

  const handleSelectQuality = (qualityLabel: string, streamUrlForQuality: string) => {
    const hls = hlsRef.current;
    if (isHls && hls && streamUrlForQuality === currentStreamUrl && hls.levels && hls.levels.length > 1) {
      const targetIdx = findBestHlsLevelIndex(hls.levels, qualityLabel);
      if (targetIdx >= 0) {
        hls.currentLevel = targetIdx;
        hls.nextLevel = targetIdx;
        hls.loadLevel = targetIdx;
      }
      setQuality(qualityLabel);
      showToast(`Качество: ${qualityLabel}`);
    } else {
      const resumePos = videoRef.current?.currentTime || 0;
      setQuality(qualityLabel, resumePos);
      showToast(`Качество: ${qualityLabel}`);
    }
    setActiveMenu('none');
  };

  const handleVolumeChange = (newVol: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(newVol * 100) / 100));
    setVolume(clamped);
    if (clamped > 0) {
      lastVolumeRef.current = clamped;
      setIsMuted(false);
      if (videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.volume = clamped;
      }
    } else {
      setIsMuted(true);
      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.volume = 0;
      }
    }
  };

  const adjustVolume = (delta: number) => {
    const current = isMuted ? 0 : volume;
    handleVolumeChange(current + delta);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      const restored = lastVolumeRef.current > 0 ? lastVolumeRef.current : 0.8;
      setIsMuted(false);
      setVolume(restored);
      videoRef.current.muted = false;
      videoRef.current.volume = restored;
    } else {
      lastVolumeRef.current = volume > 0 ? volume : 0.8;
      setIsMuted(true);
      videoRef.current.muted = true;
    }
  };

  const handleVolumeWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    adjustVolume(delta);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleClose = () => {
    if (videoRef.current && mediaDetails) {
      const time = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      if (dur > 0 && window.api) {
        window.api.saveProgress(mediaDetails.id, seasonId || 0, episodeId || 0, time, dur);
      }
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    closePlayer();
  };

  const handleOpenSettings = () => {
    handleClose();
    useMediaStore.getState().setPage('settings');
  };

  const currentSeason = mediaDetails?.seasons?.find((s) => s.id === seasonId);
  const currentEpIndex = currentSeason?.episodes.findIndex((e) => e.episodeId === episodeId) ?? -1;
  const nextEpisode = currentSeason?.episodes[currentEpIndex + 1];

  const handleNextEpisode = () => {
    if (seasonId !== undefined && nextEpisode) {
      switchEpisode(seasonId, nextEpisode.episodeId);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`cinema-player-surface fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden ${
        isUiLocked ? 'cursor-none' : ''
      }`}
    >
      {/* On-screen Toast Notification */}
      {toastMessage && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-[#140E12]/92 border border-white/20 text-white text-xs font-bold shadow-elevated flex items-center gap-2.5 pointer-events-none animate-fade-in">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Optional 1-click Resume Pill (never auto-cuts movie intro) */}
      {resumeOfferTime && !isLoading && !error && (
        <div className="absolute bottom-28 left-6 z-40 flex items-center gap-2 px-4 py-2 rounded-full cinema-glass border border-brand-orange/40 shadow-elevated animate-fade-in">
          <button
            type="button"
            onClick={() => {
              userSeekedRef.current = true;
              if (videoRef.current) {
                videoRef.current.currentTime = resumeOfferTime;
                setCurrentTime(resumeOfferTime);
              }
              dismissResumeOffer();
              showToast(`Продолжено с ${formatDuration(resumeOfferTime)}`);
            }}
            className="flex items-center gap-2 text-xs font-extrabold text-white hover:text-brand-orange cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
            <span>Продолжить с {formatDuration(resumeOfferTime)}</span>
          </button>
          <button
            type="button"
            onClick={dismissResumeOffer}
            aria-label="Смотреть сначала"
            className="p-1 rounded-full hover:bg-white/[0.15] text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Subtle Mid-Playback Buffering Indicator */}
      {isBuffering && !isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-12 h-12 rounded-full border-[3px] border-white/15 border-t-brand-orange border-r-brand-crimson animate-spin" />
        </div>
      )}

      {/* Video Element */}
      <video
        ref={videoRef}
        className={`cursor-pointer transition-all duration-200 ${
          videoFit === 'cover'
            ? 'w-full h-full object-cover'
            : videoFit === 'fill'
              ? 'w-full h-full object-fill'
              : videoFit === '16:10'
                ? 'w-[min(100%,calc(100dvh*16/10))] h-[min(100%,calc(100dvw*10/16))] object-cover'
                : videoFit === '21:9'
                  ? 'w-[min(100%,calc(100dvh*21/9))] h-[min(100%,calc(100dvw*9/21))] object-cover'
                  : videoFit === '4:3'
                    ? 'w-[min(100%,calc(100dvh*4/3))] h-[min(100%,calc(100dvw*3/4))] object-cover'
                    : 'w-full h-full object-contain'
        }`}
        onClick={togglePlay}
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (!v) return;
          // Skip React re-renders while OSD is hidden to prevent software-compositor frame drops
          if (!showControlsRef.current) return;
          const now = performance.now();
          if (now - lastUiSyncRef.current < 250) return;
          lastUiSyncRef.current = now;
          setCurrentTime(v.currentTime);
          if (v.buffered.length > 0) {
            setBuffered(v.buffered.end(v.buffered.length - 1));
          }
        }}
        onDurationChange={() => {
          if (videoRef.current) setDuration(videoRef.current.duration);
        }}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onPlaying={() => {
          setIsPlaying(true);
          setIsBuffering(false);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false);
          usePlayerStore.setState({
            error: 'Ошибка воспроизведения видеопотока. Попробуйте сменить качество видео или зеркало в Настройках.',
          });
        }}
        onEnded={() => {
          setIsPlaying(false);
          if (nextEpisode) handleNextEpisode();
        }}
      >
        {subtitleTrack && (
          <track key={subtitleTrack.url} kind="subtitles" src={subtitleTrack.url} default srcLang="ru" label={subtitleTrack.language} />
        )}
      </video>

      {/* Cinema Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070507] z-20 pointer-events-none">
          <div className="relative w-20 h-20 mb-5 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-[3px] border-brand-crimson/20 border-t-brand-orange border-r-brand-crimson animate-spin" />
            <img src={appLogo} alt="" className="w-12 h-12 rounded-full object-cover shadow-glow" />
          </div>
          <span className="font-display text-white text-sm font-black tracking-wide">{t.player.loading}</span>
          <span className="text-zinc-500 text-xs mt-1.5">Поиск доступного потока в сети...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070507]/96 p-6 z-30">
          <div className="w-16 h-16 rounded-3xl bg-brand-crimson/15 border border-brand-ember/40 flex items-center justify-center text-brand-orange mb-4 shadow-glow-sm">
            <AlertCircle className="w-9 h-9" />
          </div>
          <h3 className="font-display text-xl font-black text-white mb-2">Не удалось воспроизвести видео</h3>
          <p className="text-sm text-zinc-400 max-w-md text-center mb-6 leading-relaxed">{error}</p>

          {(streamData?.trailerUrl || usePlayerStore.getState().trailerUrl) && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => {
                  const tr = streamData?.trailerUrl || usePlayerStore.getState().trailerUrl;
                  if (tr && window.api?.openExternalUrl) {
                    window.api.openExternalUrl(tr);
                  }
                }}
                className="flex items-center gap-2 px-6 py-3 rounded-full btn-ember text-white font-display font-black text-xs uppercase tracking-wider cursor-pointer active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Смотреть официальный трейлер онлайн</span>
              </button>
            </div>
          )}

          {mediaDetails?.translators && mediaDetails.translators.length > 1 && (
            <div className="w-full max-w-2xl mb-5 space-y-2" aria-label="Выбор озвучки">
              <span className="block w-full text-center text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Попробовать другую озвучку ({mediaDetails.translators.length})
              </span>
              <HorizontalSlider
                ariaLabel="Выбор озвучки"
                compact
                itemCount={mediaDetails.translators.length}
                trackClassName="flex items-center gap-2"
              >
                {mediaDetails.translators.map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => switchTranslator(tr.id, 0)}
                    aria-pressed={translatorId === tr.id}
                    className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-bold cursor-pointer ${
                      translatorId === tr.id
                        ? 'btn-ember text-white'
                        : 'bg-white/[0.08] text-zinc-200 hover:bg-white/[0.16] border border-white/10'
                    }`}
                  >
                    {tr.name}
                  </button>
                ))}
              </HorizontalSlider>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {window.api?.verifyMirror &&
              (() => {
                const needsVerifyHighlight = Boolean(
                  error &&
                    (error.includes('не бот') ||
                      error.includes('сесси') ||
                      error.includes('проверку') ||
                      error.includes('лимит ожидания') ||
                      error.includes('недоступен'))
                );
                return (
                  <button
                    type="button"
                    disabled={isVerifying}
                    onClick={async () => {
                      setIsVerifying(true);
                      try {
                        await useSettingsStore.getState().verifyMirror(mediaDetails?.url || undefined);
                        await retryPlayback();
                      } catch (_) {
                      } finally {
                        setIsVerifying(false);
                      }
                    }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-extrabold cursor-pointer ${
                      isVerifying
                        ? 'bg-amber-500/50 text-black/60 cursor-not-allowed'
                        : needsVerifyHighlight
                        ? 'bg-amber-400 text-black hover:bg-amber-300 shadow-glow active:scale-95'
                        : 'bg-white/[0.08] text-white hover:bg-white/[0.16] border border-white/10'
                    }`}
                  >
                    <ShieldCheck className={`w-4 h-4 ${isVerifying ? 'animate-spin' : ''}`} />
                    <span>{isVerifying ? 'Идет проверка...' : 'Пройти проверку'}</span>
                  </button>
                );
              })()}
            <button
              type="button"
              onClick={retryPlayback}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full btn-ember text-white text-xs font-extrabold cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Повторить</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                showToast('Поиск рабочих зеркал в сети...');
                if (window.api?.findOnlineMirrors) {
                  await window.api.findOnlineMirrors();
                }
                retryPlayback();
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/[0.08] text-white text-xs font-bold hover:bg-white/[0.16] border border-white/10 cursor-pointer"
            >
              <Globe className="w-4 h-4 text-brand-orange" />
              <span>Зеркала в сети</span>
            </button>
            <button
              type="button"
              onClick={handleOpenSettings}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/[0.08] text-white text-xs font-bold hover:bg-white/[0.16] border border-white/10 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>Настройки</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 rounded-full bg-white/[0.08] text-white text-xs font-bold hover:bg-white/[0.16] border border-white/10 cursor-pointer"
            >
              Назад
            </button>
          </div>
        </div>
      )}

      {/* Cinema OSD Controls Overlay (visibility:hidden when faded out prevents software compositor overdraw) */}
      <div
        className={`absolute inset-0 flex flex-col justify-between p-6 pointer-events-none transition-opacity duration-300 ${
          showControls && !error ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
      >
        {/* Top Floating Glass Bar */}
        <div className="flex items-center justify-between pointer-events-auto bg-gradient-to-b from-[#070507]/90 via-[#070507]/50 to-transparent p-5 -m-6 mb-0 drag-region">
          <div className="flex items-center gap-3.5 no-drag min-w-0">
            <button
              type="button"
              onClick={handleClose}
              aria-label={t.player.back}
              className="p-2.5 rounded-full bg-[#140E12]/85 hover:bg-white/[0.2] border border-white/10 text-white cursor-pointer active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="font-display text-base font-black text-white leading-tight truncate">
                {mediaDetails?.title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-zinc-300 mt-0.5">
                {seasonId !== undefined && episodeId !== undefined && (
                  <span className="font-semibold text-brand-orange">
                    {t.details.season} {seasonId}, {t.details.episode} {episodeId}
                  </span>
                )}
                {activeTranslator && (
                  <>
                    {seasonId !== undefined && <span className="text-zinc-500">·</span>}
                    <span className="text-zinc-300 truncate">{activeTranslator.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Top Bar Quick Actions */}
          <div className="flex items-center gap-2 no-drag flex-shrink-0">
            {isPinned && (
              <>
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.1] text-zinc-200 text-xs font-semibold select-none cursor-grab active:cursor-grabbing border border-white/15 drag-region"
                  title={t.player.pinnedDragTip}
                >
                  <Move className="w-3.5 h-3.5 text-brand-gold" />
                  <span className="hidden sm:inline text-[11px] font-bold">{t.player.moveWindow}</span>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowScaleMenu((prev) => !prev)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#140E12]/85 hover:bg-white/[0.2] text-zinc-200 hover:text-white text-[11px] font-bold border border-white/15 cursor-pointer"
                    title={t.player.pinnedPresets}
                  >
                    <Scaling className="w-3.5 h-3.5 text-brand-orange" />
                    <span className="hidden sm:inline">{t.player.pinnedPresets}</span>
                  </button>

                  {showScaleMenu && (
                    <div className="absolute right-0 top-full mt-2 w-44 rounded-2xl cinema-glass p-1.5 shadow-elevated z-50 animate-fadeIn space-y-1">
                      <div className="px-2.5 py-1 text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">
                        {t.player.pinnedPresets}
                      </div>
                      {[
                        { w: 480, h: 270, label: t.player.sizeCompact, tag: '16:9 S' },
                        { w: 720, h: 405, label: t.player.sizeMedium, tag: '16:9 M' },
                        { w: 800, h: 500, label: '800×500', tag: '16:10 M' },
                        { w: 960, h: 540, label: t.player.sizeLarge, tag: '16:9 L' },
                        { w: 1280, h: 800, label: '1280×800', tag: '16:10' },
                        { w: 1280, h: 720, label: t.player.sizeStandard, tag: 'HD' },
                      ].map((p) => (
                        <button
                          key={p.tag}
                          type="button"
                          onClick={() => handleResizePreset(p.w, p.h)}
                          className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-200 hover:bg-brand-crimson/25 hover:text-white flex items-center justify-between cursor-pointer"
                        >
                          <span>{p.label}</span>
                          <span className="text-[10px] text-zinc-400 font-mono">{p.tag}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={toggleUiLock}
              aria-label={t.player.hideUi}
              className="p-2.5 rounded-full bg-[#140E12]/85 hover:bg-white/[0.2] border border-white/10 text-zinc-200 hover:text-white cursor-pointer"
              title={t.player.hideUi}
            >
              <EyeOff className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleTogglePin}
              aria-label={isPinned ? t.player.unpinWindow : t.player.pinWindow}
              aria-pressed={isPinned}
              className={`p-2.5 rounded-full border cursor-pointer ${
                isPinned
                  ? 'btn-ember border-white/25 text-white'
                  : 'bg-[#140E12]/85 hover:bg-white/[0.2] border-white/10 text-zinc-200 hover:text-white'
              }`}
              title={isPinned ? t.player.unpinWindow : t.player.pinWindow}
            >
              <Pin className={`w-4 h-4 ${isPinned ? 'fill-current rotate-45' : ''}`} />
            </button>
          </div>
        </div>

        {/* Center Glossy 3D Play Squircle (when paused) */}
        {!isPlaying && !isLoading && !error && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Воспроизвести"
            className="self-center pointer-events-auto w-20 h-20 rounded-[24px] play-squircle text-white flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-transform"
          >
            <Play className="w-9 h-9 fill-white ml-1" aria-hidden="true" />
          </button>
        )}

        {/* Bottom Cinema Controls Dock */}
        <div className="pointer-events-auto bg-gradient-to-t from-[#070507]/95 via-[#070507]/65 to-transparent px-6 pb-5 pt-10 -m-6 mt-0 space-y-3.5">
          {/* Ember Gradient Seekbar */}
          <div className="relative group w-full flex items-center py-1">
            <div className="relative w-full h-1.5 group-hover:h-2 bg-white/20 rounded-full overflow-hidden cursor-pointer transition-all">
              <div
                className="absolute top-0 left-0 bottom-0 bg-white/30"
                style={{ width: `${bufferedPercent}%` }}
              />
              <div
                className="absolute top-0 left-0 bottom-0 rounded-full"
                style={{
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg, #FF124F 0%, #FF4D1A 55%, #FF8400 100%)',
                }}
              />
            </div>
            {/* Glowing Scrubber Thumb */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,122,0,0.95)] pointer-events-none transform -translate-x-1/2 scale-0 group-hover:scale-100 transition-transform"
              style={{ left: `${progressPercent}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Перемотка видео"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between text-white gap-3">
            {/* Left Transport Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
                className="p-2.5 rounded-full bg-white/[0.1] hover:bg-white/[0.2] text-white cursor-pointer"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
              </button>

              <button
                type="button"
                onClick={() => seekDelta(-10)}
                aria-label="10 секунд назад"
                className="p-2 rounded-full hover:bg-white/[0.12] text-zinc-200 hover:text-white cursor-pointer"
                title="10 сек. назад"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => seekDelta(10)}
                aria-label="10 секунд вперед"
                className="p-2 rounded-full hover:bg-white/[0.12] text-zinc-200 hover:text-white cursor-pointer"
                title="10 сек. вперед"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {nextEpisode && (
                <button
                  type="button"
                  onClick={handleNextEpisode}
                  aria-label="Следующая серия"
                  className="p-2 rounded-full hover:bg-white/[0.12] text-zinc-200 hover:text-white cursor-pointer"
                  title="Следующая серия"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}

              {/* Volume Control */}
              <div
                className="flex items-center gap-2 group relative py-1 ml-1"
                onWheel={handleVolumeWheel}
                title={`Громкость: ${effectivePercent}% (колесико мыши)`}
              >
                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-2 rounded-full hover:bg-white/[0.12] text-zinc-200 hover:text-white cursor-pointer"
                  title={isMuted || volume === 0 ? 'Включить звук (M)' : 'Выключить звук (M)'}
                  aria-label="Тумблер звука"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-brand-crimson" />
                  ) : volume < 0.5 ? (
                    <Volume1 className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>

                <div className="relative flex items-center w-24 h-6">
                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-75"
                      style={{
                        width: `${effectivePercent}%`,
                        background: 'linear-gradient(90deg, #FF124F 0%, #FF7A00 100%)',
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={effectiveVolume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    aria-label="Регулировка громкости"
                  />
                  <div
                    className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-md pointer-events-none transform -translate-x-1/2 transition-all duration-75"
                    style={{ left: `${effectivePercent}%` }}
                  />
                </div>

                <span className="text-[11px] font-bold text-zinc-300 w-8 select-none tabular-nums font-mono">
                  {effectivePercent}%
                </span>
              </div>

              <span className="text-xs font-mono font-semibold text-zinc-300 tabular-nums ml-1">
                {formatDuration(currentTime)} <span className="text-zinc-500">/</span> {formatDuration(duration)}
              </span>
            </div>

            {/* Right Cinema Controls */}
            <div className="flex items-center gap-2 relative">
              {mediaDetails?.seasons && mediaDetails.seasons.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveMenu(activeMenu === 'episodes' ? 'none' : 'episodes')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${
                    activeMenu === 'episodes'
                      ? 'btn-ember border-white/25 text-white'
                      : 'bg-white/[0.08] border-white/15 text-zinc-200 hover:text-white hover:bg-white/[0.15]'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>Серии</span>
                </button>
              )}

              {mediaDetails?.translators && mediaDetails.translators.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveMenu(activeMenu === 'translator' ? 'none' : 'translator')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${
                    activeMenu === 'translator'
                      ? 'btn-ember border-white/25 text-white'
                      : 'bg-white/[0.08] border-white/15 text-zinc-200 hover:text-white hover:bg-white/[0.15]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5 text-brand-orange" />
                  <span className="max-w-[145px] truncate">
                    {activeTranslator ? activeTranslator.name : 'Озвучка'}
                  </span>
                </button>
              )}

              {streamData?.subtitles && streamData.subtitles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveMenu(activeMenu === 'subtitles' ? 'none' : 'subtitles')}
                  aria-label="Субтитры"
                  className={`p-2 rounded-full hover:bg-white/[0.15] cursor-pointer ${
                    subtitleTrack ? 'text-brand-orange' : 'text-zinc-200'
                  }`}
                  title="Субтитры"
                >
                  <Subtitles className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === 'quality' ? 'none' : 'quality')}
                className="px-3 py-1.5 rounded-full logo-pill text-xs font-display font-black text-white hover:border-brand-orange/60 cursor-pointer"
              >
                {currentQuality}
              </button>

              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === 'speed' ? 'none' : 'speed')}
                className="px-2.5 py-1.5 rounded-full hover:bg-white/[0.12] text-xs font-mono font-bold text-zinc-200 hover:text-white cursor-pointer"
              >
                {playbackSpeed}x
              </button>

              <button
                type="button"
                onClick={cycleVideoFit}
                className="px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-xs font-bold text-zinc-200 hover:text-white border border-white/15 cursor-pointer"
                title={t.player.scale}
              >
                {videoFit === 'contain' ? '16:9' : videoFit === 'cover' ? 'Кадр' : videoFit === 'fill' ? 'Растянуть' : videoFit}
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Полный экран"
                className="p-2 rounded-full hover:bg-white/[0.15] text-zinc-200 hover:text-white cursor-pointer"
                title="Полный экран (F)"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Quality Menu Popup */}
        {activeMenu === 'quality' && streamData?.streams && (
          <div className="absolute bottom-24 right-6 cinema-glass rounded-2xl p-2 shadow-elevated pointer-events-auto min-w-[155px] space-y-1">
            <div className="text-[10px] uppercase font-extrabold tracking-wider text-zinc-400 px-2.5 py-1">
              Качество
            </div>
            {streamData.streams.map((s) => (
              <button
                key={s.quality}
                type="button"
                onClick={() => handleSelectQuality(s.quality, s.hls || s.mp4)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  currentQuality === s.quality
                    ? 'btn-ember text-white'
                    : 'text-zinc-200 hover:bg-white/[0.1] hover:text-white'
                }`}
              >
                <span>{s.quality}</span>
                {s.isPremium && <span className="text-[9px] bg-brand-gold/20 text-brand-gold px-1.5 py-0.5 rounded-full">PRO</span>}
              </button>
            ))}
          </div>
        )}

        {/* Speed Menu Popup */}
        {activeMenu === 'speed' && (
          <div className="absolute bottom-24 right-6 cinema-glass rounded-2xl p-2 shadow-elevated pointer-events-auto min-w-[140px] space-y-1">
            <div className="text-[10px] uppercase font-extrabold tracking-wider text-zinc-400 px-2.5 py-1">
              Скорость
            </div>
            {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => {
                  setPlaybackSpeed(spd);
                  if (videoRef.current) videoRef.current.playbackRate = videoRef.current.defaultPlaybackRate = spd;
                  setActiveMenu('none');
                }}
                className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  playbackSpeed === spd
                    ? 'btn-ember text-white'
                    : 'text-zinc-200 hover:bg-white/[0.1] hover:text-white'
                }`}
              >
                {spd}x {spd === 1.0 ? '(Обычная)' : ''}
              </button>
            ))}
          </div>
        )}

        {/* Subtitles Menu Popup */}
        {activeMenu === 'subtitles' && streamData?.subtitles && (
          <div className="absolute bottom-24 right-6 cinema-glass rounded-2xl p-2 shadow-elevated pointer-events-auto min-w-[165px] space-y-1">
            <div className="text-[10px] uppercase font-extrabold tracking-wider text-zinc-400 px-2.5 py-1">
              Субтитры
            </div>
            <button
              type="button"
              onClick={() => {
                setSubtitle('off');
                setActiveMenu('none');
              }}
              className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                currentSubtitle === 'off'
                  ? 'btn-ember text-white'
                  : 'text-zinc-200 hover:bg-white/[0.1] hover:text-white'
              }`}
            >
              Выключены
            </button>
            {streamData.subtitles.map((sub, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setSubtitle(sub.language);
                  setActiveMenu('none');
                }}
                className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  currentSubtitle === sub.language
                    ? 'btn-ember text-white'
                    : 'text-zinc-200 hover:bg-white/[0.1] hover:text-white'
                }`}
              >
                {sub.language}
              </button>
            ))}
          </div>
        )}

        {/* Translator Menu Popup (uses HorizontalSlider when many voiceovers) */}
        {activeMenu === 'translator' && mediaDetails?.translators && (
          mediaDetails.translators.length > 8 ? (
            <div className="absolute bottom-24 right-6 cinema-glass rounded-2xl p-3.5 shadow-elevated pointer-events-auto w-[420px] max-w-[92vw] space-y-2.5">
              <div className="flex items-center justify-between text-[10px] uppercase font-extrabold tracking-wider text-zinc-400 px-1">
                <span>Выбор озвучки</span>
                <span className="font-mono text-zinc-400 tabular-nums">{mediaDetails.translators.length}</span>
              </div>
              <HorizontalSlider
                ariaLabel="Выбор озвучки"
                compact
                itemCount={mediaDetails.translators.length}
                trackClassName="grid grid-rows-3 grid-flow-col auto-cols-[185px] gap-1.5"
              >
                {mediaDetails.translators.map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    aria-pressed={translatorId === tr.id}
                    onClick={() => {
                      switchTranslator(tr.id, videoRef.current?.currentTime || 0);
                      setActiveMenu('none');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer ${
                      translatorId === tr.id
                        ? 'btn-ember text-white'
                        : 'bg-white/[0.06] text-zinc-200 hover:bg-white/[0.14] hover:text-white'
                    }`}
                  >
                    <span className="truncate pr-1.5">{tr.name}</span>
                    {tr.premium && <span className="text-[9px] bg-brand-gold/20 text-brand-gold px-1.5 py-0.5 rounded-full flex-shrink-0">PRO</span>}
                  </button>
                ))}
              </HorizontalSlider>
            </div>
          ) : (
            <div className="absolute bottom-24 right-6 cinema-glass rounded-2xl p-2 shadow-elevated pointer-events-auto min-w-[260px] max-w-[340px] max-h-72 overflow-y-auto space-y-1">
              <div className="flex items-center justify-between text-[10px] uppercase font-extrabold tracking-wider text-zinc-400 px-2.5 py-1">
                <span>Выбор озвучки</span>
                <span className="font-mono text-zinc-500">{mediaDetails.translators.length}</span>
              </div>
              {mediaDetails.translators.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  aria-pressed={translatorId === tr.id}
                  onClick={() => {
                    switchTranslator(tr.id, videoRef.current?.currentTime || 0);
                    setActiveMenu('none');
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer ${
                    translatorId === tr.id
                      ? 'btn-ember text-white'
                      : 'text-zinc-200 hover:bg-white/[0.1] hover:text-white'
                  }`}
                >
                  <span className="truncate pr-2">{tr.name}</span>
                  {tr.premium && <span className="text-[9px] bg-brand-gold/20 text-brand-gold px-1.5 py-0.5 rounded-full">PRO</span>}
                </button>
              ))}
            </div>
          )
        )}

        {/* Episodes Menu Popup (with Season & Episode Sliders) */}
        {activeMenu === 'episodes' && mediaDetails?.seasons && mediaDetails.seasons.length > 0 && (() => {
          const menuSeason =
            mediaDetails.seasons.find((s) => s.id === episodeMenuSeasonId) ||
            currentSeason ||
            mediaDetails.seasons[0];
          const eps = menuSeason?.episodes || [];
          return (
            <div className="absolute bottom-24 right-6 cinema-glass rounded-2xl p-3.5 shadow-elevated pointer-events-auto w-[360px] max-w-[90vw] space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-display text-xs font-black text-white">
                  Серии ({menuSeason.title || `Сезон ${menuSeason.id}`})
                </div>
                <span className="text-[10px] font-mono font-bold text-zinc-400">{eps.length} сер.</span>
              </div>

              {mediaDetails.seasons.length > 1 && (
                <HorizontalSlider
                  ariaLabel="Выбор сезона"
                  compact
                  itemCount={mediaDetails.seasons.length}
                  trackClassName="flex items-center gap-1.5"
                >
                  {mediaDetails.seasons.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={menuSeason.id === s.id}
                      onClick={() => setEpisodeMenuSeasonId(s.id)}
                      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                        menuSeason.id === s.id
                          ? 'btn-ember text-white'
                          : 'bg-white/[0.08] hover:bg-white/[0.16] text-zinc-300'
                      }`}
                    >
                      {s.title || `Сезон ${s.id}`}
                    </button>
                  ))}
                </HorizontalSlider>
              )}

              {eps.length > 12 ? (
                <HorizontalSlider
                  ariaLabel="Выбор серии"
                  compact
                  itemCount={eps.length}
                  trackClassName="grid grid-rows-3 grid-flow-col auto-cols-[74px] gap-1.5"
                >
                  {eps.map((ep) => (
                    <button
                      key={ep.episodeId}
                      type="button"
                      aria-pressed={seasonId === menuSeason.id && episodeId === ep.episodeId}
                      onClick={() => {
                        switchEpisode(menuSeason.id, ep.episodeId);
                        setActiveMenu('none');
                      }}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-bold cursor-pointer ${
                        seasonId === menuSeason.id && episodeId === ep.episodeId
                          ? 'btn-ember text-white'
                          : 'bg-white/[0.08] hover:bg-white/[0.16] text-zinc-200'
                      }`}
                    >
                      {ep.episodeId} сер.
                    </button>
                  ))}
                </HorizontalSlider>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                  {eps.map((ep) => (
                    <button
                      key={ep.episodeId}
                      type="button"
                      onClick={() => {
                        switchEpisode(menuSeason.id, ep.episodeId);
                        setActiveMenu('none');
                      }}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-bold cursor-pointer ${
                        seasonId === menuSeason.id && episodeId === ep.episodeId
                          ? 'btn-ember text-white'
                          : 'bg-white/[0.08] hover:bg-white/[0.16] text-zinc-200'
                      }`}
                    >
                      {ep.episodeId} сер.
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Persistent top drag handle when pinned */}
      {isPinned && (
        <div
          className="absolute top-0 left-0 right-0 h-6 drag-region pointer-events-auto z-40 cursor-grab active:cursor-grabbing"
          title={t.player.pinnedDragTip}
        />
      )}

      {/* Corner Resize Handle */}
      <div
        onMouseDown={handleStartResize}
        className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize z-50 flex items-end justify-end p-2 opacity-40 hover:opacity-100 transition-opacity no-drag group"
        title={t.player.pinnedPresets}
      >
        <svg
          className="w-4 h-4 text-white/70 group-hover:text-brand-orange drop-shadow transition-colors"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="14" cy="14" r="1.5" />
          <circle cx="14" cy="9" r="1.5" />
          <circle cx="9" cy="14" r="1.5" />
          <circle cx="14" cy="4" r="1.5" />
          <circle cx="9" cy="9" r="1.5" />
          <circle cx="4" cy="14" r="1.5" />
        </svg>
      </div>
    </div>
  );
};
