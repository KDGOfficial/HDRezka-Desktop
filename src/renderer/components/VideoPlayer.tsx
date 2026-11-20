import React, { useRef, useState, useEffect } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
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
} from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useMediaStore } from '../stores/useMediaStore';
import { formatDuration } from '../../shared/utils';

export const VideoPlayer: React.FC = () => {
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

  const hideTimerRef = useRef<any>(null);

  // Auto-hide controls
  const resetHideTimer = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying && activeMenu === 'none') {
        setShowControls(false);
      }
    }, 3500);
  };

  useEffect(() => {
    const handleMouseMove = () => resetHideTimer();
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying, activeMenu]);

  // HLS & Video Stream initialization
  useEffect(() => {
    if (!isOpen || !currentStreamUrl || !videoRef.current) return;

    const video = videoRef.current;
    video.volume = volume;

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
          if (activeMenu !== 'none') {
            setActiveMenu('none');
          } else if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            handleClose();
          }
          break;
      }
      resetHideTimer();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPlaying, isMuted, volume, activeMenu]);

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

  const adjustVolume = (delta: number) => {
    const next = Math.max(0, Math.min(1, volume + delta));
    setVolume(next);
    if (videoRef.current) {
      videoRef.current.volume = next;
      setIsMuted(next === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
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
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain cursor-pointer"
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
        {currentSubtitle !== 'off' && (
          <track kind="subtitles" src={currentSubtitle} default srcLang="ru" label="Русский" />
        )}
      </video>

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 pointer-events-none">
          <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin mb-4" />
          <span className="text-white text-sm font-semibold tracking-wide">Загрузка потока...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 z-30">
          <AlertCircle className="w-16 h-16 text-brand-red mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Не удалось воспроизвести видео</h3>
          <p className="text-sm text-zinc-400 max-w-md text-center mb-6">{error}</p>
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
        {/* Top bar */}
        <div className="flex items-center justify-between pointer-events-auto bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 -m-6 mb-0">
          <div className="flex items-center space-x-3">
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
                    Сезон {seasonId}, Серия {episodeId}
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

              {/* Volume */}
              <div className="flex items-center space-x-2 group relative">
                <button
                  onClick={toggleMute}
                  className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    if (videoRef.current) {
                      videoRef.current.volume = v;
                      setIsMuted(v === 0);
                    }
                  }}
                  className="w-20 h-1 bg-white/30 accent-brand-red rounded-lg cursor-pointer"
                />
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
              {mediaDetails?.translators && mediaDetails.translators.length > 1 && (
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
                    currentSubtitle !== 'off' ? 'text-brand-red' : 'text-zinc-300'
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
                  if (videoRef.current) videoRef.current.playbackRate = spd;
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
                  setSubtitle(sub.url);
                  setActiveMenu('none');
                }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  currentSubtitle === sub.url
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
    </div>
  );
};
