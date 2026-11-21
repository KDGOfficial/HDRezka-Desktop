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
} from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useMediaStore } from '../stores/useMediaStore';
import { useTranslation } from '../i18n';
import { formatDuration } from '../../shared/utils';

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
    isLoading,
    error,
    closePlayer,
    setQuality,
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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [activeMenu, setActiveMenu] = useState<'none' | 'quality' | 'speed' | 'subtitles' | 'translator' | 'episodes'>('none');
  const [isUiLocked, setIsUiLocked] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [showScaleMenu, setShowScaleMenu] = useState(false);
  const [videoFit, setVideoFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const hideTimerRef = useRef<any>(null);
  const toastTimerRef = useRef<any>(null);
  const lastVolumeRef = useRef(volume > 0 ? volume : 0.8);
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const subtitleTrack = streamData?.subtitles?.find((s) => s.language === currentSubtitle);
  const effectiveVolume = isMuted ? 0 : volume;
  const effectivePercent = Math.round(effectiveVolume * 100);

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
        // Exit fullscreen and unmaximize so the pinned player can be moved and scaled freely
        if (document.fullscreenElement) {
          try {
            await document.exitFullscreen();
          } catch (_) {}
          setIsFullscreen(false);
        }
        if (window.api.unmaximize) {
          await window.api.unmaximize();
        }
        // Set a convenient floating default size (854x480) if window was full screen / maximized
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
    setVideoFit((prev) => {
      if (prev === 'contain') {
        showToast(t.player.scaleCover);
        return 'cover';
      } else if (prev === 'cover') {
        showToast(t.player.scaleFill);
        return 'fill';
      } else {
        showToast(t.player.scaleOriginal);
        return 'contain';
      }
    });
  };

  // Dynamically inserted <track default> is not always shown by Chromium; force it on
  useEffect(() => {
    const tracks = videoRef.current?.textTracks;
    if (tracks) for (const t of Array.from(tracks)) t.mode = 'showing';
  }, [subtitleTrack?.url]);

  // Auto-hide controls
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

  // HLS & Video Stream initialization
  useEffect(() => {
    if (!isOpen || !currentStreamUrl || !videoRef.current) return;

    const video = videoRef.current;
    video.volume = volume;
    video.defaultPlaybackRate = playbackSpeed; // survives source changes, unlike playbackRate

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;
      hls.loadSource(currentStreamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (initialTime > 0) {
          video.currentTime = initialTime;
        }
        video.play().catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Try MP4 fallback if HLS network fails
              const altMp4 = streamData?.streams?.find((s) => s.mp4 && s.mp4 !== currentStreamUrl)?.mp4;
              if (altMp4 && videoRef.current) {
                hls.destroy();
                hlsRef.current = null;
                videoRef.current.src = altMp4;
                videoRef.current.load();
                videoRef.current.play().catch(() => setIsPlaying(false));
                return;
              }
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              usePlayerStore.setState({
                error: 'Не удалось загрузить видеопоток. Попробуйте выбрать другое качество или сменить активное зеркало в Настройках.',
              });
              break;
          }
        }
      });
    } else {
      // Direct MP4 or native HLS
      video.src = currentStreamUrl;
      video.load();
      if (initialTime > 0) {
        video.currentTime = initialTime;
      }
      video.play().catch(() => setIsPlaying(false));
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentStreamUrl, isHls, isOpen]);

  // Periodic progress saving
  useEffect(() => {
    if (!isOpen || !mediaDetails || currentTime <= 0 || duration <= 0) return;

    const interval = setInterval(() => {
      if (window.api && videoRef.current) {
        const time = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        const percent = (time / dur) * 100;

        // Save progress
        window.api.saveProgress(mediaDetails.id, seasonId || 0, episodeId || 0, time, dur);

        // Save watch history
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
  }, [isOpen, mediaDetails, seasonId, episodeId, currentTime, duration]);

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
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + delta, duration));
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
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

  // Find next episode
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
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden ${
        isUiLocked ? 'cursor-none' : ''
      }`}
    >
      {/* On-screen Toast Notification */}
      {toastMessage && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-black/85 backdrop-blur-md border border-white/20 text-white text-sm font-semibold shadow-2xl flex items-center space-x-2.5 pointer-events-none animate-fade-in transition-all">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Video Element */}
      <video
        ref={videoRef}
        className={`w-full h-full cursor-pointer transition-all duration-200 ${
          videoFit === 'cover' ? 'object-cover' : videoFit === 'fill' ? 'object-fill' : 'object-contain'
        }`}
        onClick={togglePlay}
        onTimeUpdate={() => {
          if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
            if (videoRef.current.buffered.length > 0) {
              setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
            }
          }
        }}
        onDurationChange={() => {
          if (videoRef.current) setDuration(videoRef.current.duration);
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

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 pointer-events-none">
          <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin mb-4" />
          <span className="text-white text-sm font-semibold tracking-wide">{t.player.loading}</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 z-30">
          <AlertCircle className="w-16 h-16 text-brand-red mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Не удалось воспроизвести видео</h3>
          <p className="text-sm text-zinc-400 max-w-md text-center mb-6">{error}</p>
          {mediaDetails?.translators && mediaDetails.translators.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl mb-5" aria-label="Выбор озвучки">
              <span className="w-full text-center text-sm text-zinc-400">Попробовать другую озвучку</span>
              {mediaDetails.translators.map((tr) => (
                <button
                  key={tr.id}
                  onClick={() => switchTranslator(tr.id)}
                  aria-pressed={translatorId === tr.id}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold ${translatorId === tr.id ? 'bg-brand-red text-white' : 'bg-white/10 text-zinc-200 hover:bg-white/20'}`}
                >
                  {tr.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={retryPlayback}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-brand-red text-white font-bold hover:bg-brand-redHover shadow-glow transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Повторить</span>
            </button>
            <button
              onClick={handleOpenSettings}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>Настройки</span>
            </button>
            <button
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-all cursor-pointer"
            >
              Назад
            </button>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between p-6 pointer-events-none transition-opacity duration-300 ${
          showControls && !error ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top bar with drag-region for native window dragging */}
        <div className="flex items-center justify-between pointer-events-auto bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 -m-6 mb-0 drag-region">
          <div className="flex items-center space-x-3 no-drag">
            <button
              onClick={handleClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {mediaDetails?.title}
              </h2>
              <div className="flex items-center space-x-2 text-xs text-zinc-400">
                {seasonId !== undefined && episodeId !== undefined && (
                  <span>
                    {t.details.season} {seasonId}, {t.details.episode} {episodeId}
                  </span>
                )}
                {translatorId > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-zinc-300">
                      {mediaDetails?.translators?.find((t) => t.id === translatorId)?.name || 'Оригинал'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Top Bar Quick Action Controls */}
          <div className="flex items-center space-x-2 no-drag">
            {/* If pinned, show Move handle and Window Size Presets */}
            {isPinned && (
              <>
                <div
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 text-zinc-300 text-xs font-semibold select-none cursor-grab active:cursor-grabbing border border-white/10 drag-region"
                  title={t.player.pinnedDragTip}
                >
                  <Move className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline text-[11px] font-medium">{t.player.moveWindow}</span>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setShowScaleMenu((prev) => !prev)}
                    className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white backdrop-blur-md transition-colors text-[11px] font-bold border border-white/10"
                    title={t.player.pinnedPresets}
                  >
                    <Scaling className="w-3.5 h-3.5 text-orange-400" />
                    <span className="hidden sm:inline">{t.player.pinnedPresets}</span>
                  </button>

                  {showScaleMenu && (
                    <div className="absolute right-0 top-full mt-2 w-44 rounded-2xl bg-[#12131d]/95 backdrop-blur-xl border border-white/15 p-1.5 shadow-2xl z-50 animate-fadeIn space-y-1">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                        {t.player.pinnedPresets}
                      </div>
                      <button
                        onClick={() => handleResizePreset(480, 270)}
                        className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-200 hover:bg-brand-red/20 hover:text-white flex items-center justify-between transition-colors"
                      >
                        <span>{t.player.sizeCompact}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">16:9 S</span>
                      </button>
                      <button
                        onClick={() => handleResizePreset(720, 405)}
                        className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-200 hover:bg-brand-red/20 hover:text-white flex items-center justify-between transition-colors"
                      >
                        <span>{t.player.sizeMedium}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">16:9 M</span>
                      </button>
                      <button
                        onClick={() => handleResizePreset(960, 540)}
                        className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-200 hover:bg-brand-red/20 hover:text-white flex items-center justify-between transition-colors"
                      >
                        <span>{t.player.sizeLarge}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">16:9 L</span>
                      </button>
                      <button
                        onClick={() => handleResizePreset(1280, 720)}
                        className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-200 hover:bg-brand-red/20 hover:text-white flex items-center justify-between transition-colors"
                      >
                        <span>{t.player.sizeStandard}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">HD</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* UI Hide / Lock Shortcut button */}
            <button
              onClick={toggleUiLock}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white backdrop-blur-md transition-colors"
              title={t.player.hideUi}
            >
              <EyeOff className="w-4 h-4" />
            </button>

            {/* Pin / Always On Top Button */}
            <button
              onClick={handleTogglePin}
              className={`p-2 rounded-xl backdrop-blur-md transition-colors ${
                isPinned
                  ? 'bg-brand-red text-white shadow-glow'
                  : 'bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white'
              }`}
              title={isPinned ? t.player.unpinWindow : t.player.pinWindow}
            >
              <Pin className={`w-4 h-4 ${isPinned ? 'fill-current rotate-45' : ''}`} />
            </button>
          </div>
        </div>

        {/* Center Big Play Button (if paused) */}
        {!isPlaying && !isLoading && !error && (
          <div
            onClick={togglePlay}
            className="self-center pointer-events-auto w-20 h-20 rounded-full bg-brand-red/90 text-white flex items-center justify-center shadow-glow cursor-pointer hover:scale-110 active:scale-95 transition-all"
          >
            <Play className="w-10 h-10 fill-white ml-1.5" />
          </div>
        )}

        {/* Bottom Controls Bar */}
        <div className="pointer-events-auto bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 -m-6 mt-0 space-y-3">
          {/* Seekbar */}
          <div className="relative group w-full flex items-center">
            {/* Progress track */}
            <div className="relative w-full h-1.5 group-hover:h-2.5 bg-white/20 rounded-full overflow-hidden cursor-pointer transition-all">
              {/* Buffered bar */}
              <div
                className="absolute top-0 left-0 bottom-0 bg-white/30"
                style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }}
              />
              {/* Played bar */}
              <div
                className="absolute top-0 left-0 bottom-0 bg-brand-red"
                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between text-white">
            {/* Left buttons */}
            <div className="flex items-center space-x-3">
              <button
                onClick={togglePlay}
                className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
              </button>

              <button
                onClick={() => seekDelta(-10)}
                className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                title="10 сек. назад"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => seekDelta(10)}
                className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                title="10 сек. вперед"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {nextEpisode && (
                <button
                  onClick={handleNextEpisode}
                  className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                  title="Следующая серия"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}

              {/* Volume Control */}
              <div
                className="flex items-center space-x-2 group relative py-1"
                onWheel={handleVolumeWheel}
                title={`Громкость: ${effectivePercent}% (колесико мыши)`}
              >
                <button
                  onClick={toggleMute}
                  className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title={isMuted || volume === 0 ? 'Включить звук (M)' : 'Выключить звук (M)'}
                  aria-label="Тумблер звука"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-red-400" />
                  ) : volume < 0.5 ? (
                    <Volume1 className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>

                {/* Slider with styled filled track and thumb */}
                <div className="relative flex items-center w-24 h-6">
                  {/* Track background */}
                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    {/* Active filled track */}
                    <div
                      className="h-full bg-brand-red rounded-full transition-all duration-75"
                      style={{ width: `${effectivePercent}%` }}
                    />
                  </div>

                  {/* Range input overlay for clicking and dragging */}
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

                  {/* Thumb dot */}
                  <div
                    className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-md pointer-events-none transform -translate-x-1/2 transition-all duration-75"
                    style={{ left: `${effectivePercent}%` }}
                  />
                </div>

                {/* Percentage label */}
                <span className="text-[11px] font-semibold text-zinc-400 w-8 select-none tabular-nums">
                  {effectivePercent}%
                </span>
              </div>

              {/* Time display */}
              <span className="text-xs font-medium text-zinc-300">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </span>
            </div>

            {/* Right buttons */}
            <div className="flex items-center space-x-2 relative">
              {/* Episodes Selector for series */}
              {mediaDetails?.seasons && mediaDetails.seasons.length > 0 && (
                <button
                  onClick={() => setActiveMenu(activeMenu === 'episodes' ? 'none' : 'episodes')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    activeMenu === 'episodes'
                      ? 'bg-brand-red border-brand-red text-white'
                      : 'bg-white/10 border-white/10 text-zinc-300 hover:text-white'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>Серии</span>
                </button>
              )}

              {/* Translator / Voiceover Selector */}
              {mediaDetails?.translators && mediaDetails.translators.length > 0 && (
                <button
                  onClick={() => setActiveMenu(activeMenu === 'translator' ? 'none' : 'translator')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    activeMenu === 'translator'
                      ? 'bg-brand-red border-brand-red text-white'
                      : 'bg-white/10 border-white/10 text-zinc-300 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Озвучка</span>
                </button>
              )}

              {/* Subtitles */}
              {streamData?.subtitles && streamData.subtitles.length > 0 && (
                <button
                  onClick={() => setActiveMenu(activeMenu === 'subtitles' ? 'none' : 'subtitles')}
                  className={`p-2 rounded-lg hover:bg-white/10 transition-colors ${
                    subtitleTrack ? 'text-brand-red' : 'text-zinc-300'
                  }`}
                  title="Субтитры"
                >
                  <Subtitles className="w-4 h-4" />
                </button>
              )}

              {/* Quality */}
              <button
                onClick={() => setActiveMenu(activeMenu === 'quality' ? 'none' : 'quality')}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white border border-white/10 transition-colors"
              >
                {currentQuality}
              </button>

              {/* Speed */}
              <button
                onClick={() => setActiveMenu(activeMenu === 'speed' ? 'none' : 'speed')}
                className="px-2 py-1 rounded-lg hover:bg-white/10 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
              >
                {playbackSpeed}x
              </button>

              {/* Video Fit / Aspect Ratio Scale Toggle */}
              <button
                onClick={cycleVideoFit}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-zinc-300 hover:text-white border border-white/10 transition-colors"
                title={t.player.scale}
              >
                {videoFit === 'contain' ? '16:9' : videoFit === 'cover' ? 'Кадр' : 'Растянуть'}
              </button>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                title="Полный экран (F)"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Quality Menu Popup */}
        {activeMenu === 'quality' && streamData?.streams && (
          <div className="absolute bottom-20 right-6 bg-dark-surface/95 border border-white/15 rounded-xl p-2 shadow-2xl backdrop-blur-md pointer-events-auto min-w-[140px] space-y-1">
            <div className="text-[10px] uppercase font-bold text-zinc-500 px-2 py-1">Качество</div>
            {streamData.streams.map((s) => (
              <button
                key={s.quality}
                onClick={() => {
                  setQuality(s.quality);
                  setActiveMenu('none');
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  currentQuality === s.quality
                    ? 'bg-brand-red text-white'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{s.quality}</span>
                {s.isPremium && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded">PRO</span>}
              </button>
            ))}
          </div>
        )}

        {/* Speed Menu Popup */}
        {activeMenu === 'speed' && (
          <div className="absolute bottom-20 right-6 bg-dark-surface/95 border border-white/15 rounded-xl p-2 shadow-2xl backdrop-blur-md pointer-events-auto min-w-[120px] space-y-1">
            <div className="text-[10px] uppercase font-bold text-zinc-500 px-2 py-1">Скорость</div>
            {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((spd) => (
              <button
                key={spd}
                onClick={() => {
                  setPlaybackSpeed(spd);
                  if (videoRef.current) videoRef.current.playbackRate = videoRef.current.defaultPlaybackRate = spd;
                  setActiveMenu('none');
                }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  playbackSpeed === spd
                    ? 'bg-brand-red text-white'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {spd}x {spd === 1.0 ? '(Обычная)' : ''}
              </button>
            ))}
          </div>
        )}

        {/* Subtitles Menu Popup */}
        {activeMenu === 'subtitles' && streamData?.subtitles && (
          <div className="absolute bottom-20 right-6 bg-dark-surface/95 border border-white/15 rounded-xl p-2 shadow-2xl backdrop-blur-md pointer-events-auto min-w-[150px] space-y-1">
            <div className="text-[10px] uppercase font-bold text-zinc-500 px-2 py-1">Субтитры</div>
            <button
              onClick={() => {
                setSubtitle('off');
                setActiveMenu('none');
              }}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                currentSubtitle === 'off'
                  ? 'bg-brand-red text-white'
                  : 'text-zinc-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              Выключены
            </button>
            {streamData.subtitles.map((sub, i) => (
              <button
                key={i}
                onClick={() => {
                  setSubtitle(sub.language);
                  setActiveMenu('none');
                }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  currentSubtitle === sub.language
                    ? 'bg-brand-red text-white'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {sub.language}
              </button>
            ))}
          </div>
        )}

        {/* Translator Menu Popup */}
        {activeMenu === 'translator' && mediaDetails?.translators && (
          <div className="absolute bottom-20 right-6 bg-dark-surface/95 border border-white/15 rounded-xl p-2 shadow-2xl backdrop-blur-md pointer-events-auto min-w-[220px] max-h-72 overflow-y-auto space-y-1">
            <div className="text-[10px] uppercase font-bold text-zinc-500 px-2 py-1">Выбор озвучки</div>
            {mediaDetails.translators.map((tr) => (
              <button
                key={tr.id}
                onClick={() => {
                  switchTranslator(tr.id);
                  setActiveMenu('none');
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                  translatorId === tr.id
                    ? 'bg-brand-red text-white'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="truncate pr-2">{tr.name}</span>
                {tr.premium && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded">PRO</span>}
              </button>
            ))}
          </div>
        )}

        {/* Episodes Menu Popup */}
        {activeMenu === 'episodes' && currentSeason && currentSeason.episodes && (
          <div className="absolute bottom-20 right-6 bg-dark-surface/95 border border-white/15 rounded-xl p-3 shadow-2xl backdrop-blur-md pointer-events-auto w-80 max-h-80 overflow-y-auto space-y-2">
            <div className="text-xs font-bold text-white mb-2">Серии ({currentSeason.title})</div>
            <div className="grid grid-cols-4 gap-2">
              {currentSeason.episodes.map((ep) => (
                <button
                  key={ep.episodeId}
                  onClick={() => {
                    if (seasonId !== undefined) {
                      switchEpisode(seasonId, ep.episodeId);
                      setActiveMenu('none');
                    }
                  }}
                  className={`py-2 px-1 text-center rounded-lg text-xs font-semibold transition-all ${
                    episodeId === ep.episodeId
                      ? 'bg-brand-red text-white shadow-glow'
                      : 'bg-white/10 hover:bg-white/20 text-zinc-300'
                  }`}
                >
                  {ep.episodeId} сер.
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Persistent top drag handle when pinned (allows dragging window even when controls fade) */}
      {isPinned && (
        <div
          className="absolute top-0 left-0 right-0 h-6 drag-region pointer-events-auto z-40 cursor-grab active:cursor-grabbing"
          title={t.player.pinnedDragTip}
        />
      )}

      {/* Corner Resize Handle for Scaling Electron Window */}
      <div
        onMouseDown={handleStartResize}
        className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize z-50 flex items-end justify-end p-2 opacity-40 hover:opacity-100 transition-opacity no-drag group"
        title={t.player.pinnedPresets}
      >
        <svg
          className="w-4 h-4 text-white/70 group-hover:text-amber-400 drop-shadow transition-colors"
          viewBox="0 0 16 16"
          fill="currentColor"
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
