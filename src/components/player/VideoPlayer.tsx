import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  ChevronLeft,
  SkipForward,
  Layers,
  Subtitles,
  Gauge,
  AlertCircle,
  RefreshCw,
  List
} from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { useNavigationStore } from '../../stores/navigationStore';
import { useNotificationStore } from '../../stores/notificationStore';

export const VideoPlayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<any>(null);

  const {
    media,
    details,
    sources,
    selectedQuality,
    selectedTranslatorId,
    selectedSeason,
    selectedEpisode,
    selectedSubtitle,
    playbackSpeed,
    volume,
    isMuted,
    isPlaying,
    isLoading,
    error,
    currentTime,
    duration,
    buffered,
    isFullscreen,
    setPlaying,
    setQuality,
    setTranslator,
    setEpisode,
    setSubtitle,
    setPlaybackSpeed,
    setVolume,
    toggleMute,
    setTime,
    setDuration,
    setBuffered,
    setIsFullscreen,
    setError,
    nextEpisode,
    hasNextEpisode,
    closePlayer
  } = usePlayerStore();

  const { stopPlayback } = useNavigationStore();
  const { notify } = useNotificationStore();

  const [showControls, setShowControls] = useState(true);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSeasonSelector, setShowSeasonSelector] = useState(false);
  const [activeMenu, setActiveMenu] = useState<'main' | 'quality' | 'translator' | 'speed' | 'subtitles'>('main');
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number>(0);

  // Auto-hide controls timer
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showSettingsMenu && !showSeasonSelector) {
        setShowControls(false);
      }
    }, 2500);
  }, [isPlaying, showSettingsMenu, showSeasonSelector]);

  const handleMouseMove = () => {
    resetControlsTimeout();
  };

  // Find active stream URL based on selectedQuality
  const activeStreamUrl = React.useMemo(() => {
    if (!sources || !sources.streams || sources.streams.length === 0) return null;
    const found = sources.streams.find((s) => s.quality === selectedQuality);
    return found ? found.url : sources.streams[0].url;
  }, [sources, selectedQuality]);

  // Setup HLS or direct HTML5 video stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStreamUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsStream = activeStreamUrl.includes('.m3u8') || activeStreamUrl.includes('m3u8');

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hlsRef.current = hls;
      hls.loadSource(activeStreamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => setPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setError('Ошибка загрузки потока. Попробуйте выбрать другое качество или зеркало.');
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || !isHlsStream) {
      video.src = activeStreamUrl;
      video.play().catch(() => setPlaying(false));
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeStreamUrl]);

  // Sync volume and playback speed
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume / 100;
    video.muted = isMuted;
    video.playbackRate = playbackSpeed;
  }, [volume, isMuted, playbackSpeed]);

  // Video element event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => {
      setTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDurationChange = () => setDuration(video.duration);
    const onEnded = () => {
      if (hasNextEpisode()) {
        notify({
          type: 'info',
          title: 'Следующая серия',
          message: 'Переход к следующей серии...',
          duration: 3000,
        });
        nextEpisode();
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('ended', onEnded);
    };
  }, [hasNextEpisode, nextEpisode]);

  // Hotkey handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          resetControlsTimeout();
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          resetControlsTimeout();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(volume + 5);
          resetControlsTimeout();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(volume - 5);
          resetControlsTimeout();
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen().catch(() => {});
            setIsFullscreen(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [volume, isFullscreen, resetControlsTimeout]);

  // Mouse wheel volume control
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setVolume(volume + 5);
    } else {
      setVolume(volume - 5);
    }
    resetControlsTimeout();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * duration;
  };

  const handleSeekMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPos(e.clientX - rect.left);
    setHoverTime(pos * duration);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleClose = () => {
    closePlayer();
    stopPlayback();
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  const currentSeasonData = details?.seasons?.find((s) => s.seasonNumber === selectedSeason);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      className="fixed inset-0 bg-black z-50 flex items-center justify-center select-none overflow-hidden"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        onClick={() => {
          if (videoRef.current) {
            if (videoRef.current.paused) videoRef.current.play();
            else videoRef.current.pause();
          }
        }}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs pointer-events-none z-30">
          <div className="w-14 h-14 rounded-full border-4 border-[#E50914] border-t-transparent animate-spin mb-4" />
          <span className="text-zinc-200 text-sm font-medium">Загрузка видеопотока...</span>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md z-40 p-6 text-center">
          <AlertCircle className="w-14 h-14 text-[#E50914] mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Ошибка воспроизведения</h2>
          <p className="text-sm text-zinc-400 max-w-md mb-6">{error}</p>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                setError(null);
                if (media && details) {
                  usePlayerStore
                    .getState()
                    .initPlayer(media, details, selectedSeason, selectedEpisode);
                }
              }}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-[#E50914] hover:bg-[#F40612] text-white font-medium text-sm transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Повторить попытку</span>
            </button>
            <button
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm transition-all cursor-pointer"
            >
              Закрыть плеер
            </button>
          </div>
        </div>
      )}

      {/* Controls Overlay Container */}
      <div
        className={`absolute inset-0 flex flex-col justify-between pointer-events-none transition-opacity duration-300 z-20 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Header Bar */}
        <div className="pointer-events-auto p-4 md:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleClose}
              title="Назад в каталог (Esc)"
              className="p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/10 backdrop-blur-md transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-base md:text-lg font-bold text-white leading-tight">
                {media?.title}
              </h2>
              {details?.seasons && (
                <div className="text-xs text-zinc-400 mt-0.5">
                  Сезон {selectedSeason}, Серия {selectedEpisode}
                </div>
              )}
            </div>
          </div>

          {/* Top Right Quick Actions */}
          {details?.seasons && (
            <button
              onClick={() => setShowSeasonSelector(!showSeasonSelector)}
              className="pointer-events-auto flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-black/50 hover:bg-black/80 text-white border border-white/10 backdrop-blur-md text-xs font-semibold transition-all cursor-pointer"
            >
              <List className="w-4 h-4" />
              <span>Серии и сезоны</span>
            </button>
          )}
        </div>

        {/* Center Play/Pause Large Action (on hover/click) */}
        <div className="flex items-center justify-center pointer-events-none">
          {/* Subtle watermark or icon if needed */}
        </div>

        {/* Bottom Controls Bar */}
        <div className="pointer-events-auto p-4 md:p-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent space-y-3">
          {/* Seek Bar with buffer & tooltip */}
          <div
            onClick={handleSeek}
            onMouseMove={handleSeekMouseMove}
            onMouseLeave={() => setHoverTime(null)}
            className="group/seek relative w-full h-2 hover:h-3 bg-white/20 rounded-full cursor-pointer transition-all flex items-center"
          >
            {/* Buffered bar */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-white/30 rounded-full transition-all"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Progress bar */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-[#E50914] rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Scrub thumb */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-md transform -translate-x-1/2 scale-0 group-hover/seek:scale-100 transition-transform"
              style={{ left: `${progressPercent}%` }}
            />

            {/* Hover Time Tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute -top-8 px-2 py-1 rounded bg-black/80 text-white text-[11px] font-mono border border-white/10 transform -translate-x-1/2 pointer-events-none"
                style={{ left: `${hoverPos}px` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          {/* Control Buttons Row */}
          <div className="flex items-center justify-between text-white">
            {/* Left Controls: Play, Rewind, Forward, Next, Volume, Time */}
            <div className="flex items-center space-x-2 md:space-x-3">
              <button
                onClick={() => {
                  if (videoRef.current) {
                    if (videoRef.current.paused) videoRef.current.play();
                    else videoRef.current.pause();
                  }
                }}
                className="p-2.5 rounded-full bg-white/10 hover:bg-[#E50914] text-white transition-all cursor-pointer"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime -= 10;
                }}
                title="Назад на 10 сек (Влево)"
                className="p-2 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime += 10;
                }}
                title="Вперед на 10 сек (Вправо)"
                className="p-2 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {hasNextEpisode() && (
                <button
                  onClick={nextEpisode}
                  title="Следующая серия"
                  className="p-2 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}

              {/* Volume */}
              <div className="flex items-center space-x-2 group/vol">
                <button
                  onClick={toggleMute}
                  title="Отключить звук (M)"
                  className="p-2 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-red-400" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-16 md:w-24 h-1 accent-[#E50914] bg-white/20 rounded-lg cursor-pointer"
                />
              </div>

              {/* Time display */}
              <div className="text-xs font-mono text-zinc-400 ml-2">
                <span>{formatTime(currentTime)}</span>
                <span className="mx-1.5 text-zinc-600">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls: Quality, Translator, Speed, Settings, Fullscreen */}
            <div className="flex items-center space-x-2 md:space-x-3 relative">
              {/* Quality Quick Button */}
              <button
                onClick={() => {
                  setActiveMenu(activeMenu === 'quality' && showSettingsMenu ? 'main' : 'quality');
                  setShowSettingsMenu(!showSettingsMenu || activeMenu !== 'quality');
                }}
                className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                {selectedQuality}
              </button>

              {/* Settings Menu Button */}
              <button
                onClick={() => {
                  setActiveMenu('main');
                  setShowSettingsMenu(!showSettingsMenu);
                }}
                title="Настройки воспроизведения"
                className="p-2 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                <Settings className="w-5 h-5" />
              </button>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                title="Полноэкранный режим (F)"
                className="p-2 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>

              {/* Popup Settings / Quality Menu */}
              {showSettingsMenu && (
                <div className="absolute bottom-12 right-0 w-64 bg-[#17181D]/95 backdrop-blur-xl border border-[#292B32] rounded-2xl p-3 shadow-2xl z-50 text-xs">
                  {/* Main Settings Menu */}
                  {activeMenu === 'main' && (
                    <div className="space-y-1">
                      <div className="px-2 py-1 font-bold text-zinc-400 uppercase tracking-wider text-[10px]">
                        Параметры видео
                      </div>

                      <button
                        onClick={() => setActiveMenu('quality')}
                        className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[#1D1F26] text-white transition-colors cursor-pointer"
                      >
                        <div className="flex items-center space-x-2">
                          <Layers className="w-4 h-4 text-zinc-400" />
                          <span>Качество</span>
                        </div>
                        <span className="font-bold text-[#E50914]">{selectedQuality}</span>
                      </button>

                      {details?.translators && details.translators.length > 0 && (
                        <button
                          onClick={() => setActiveMenu('translator')}
                          className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[#1D1F26] text-white transition-colors cursor-pointer"
                        >
                          <div className="flex items-center space-x-2">
                            <Layers className="w-4 h-4 text-zinc-400" />
                            <span>Озвучка</span>
                          </div>
                          <span className="truncate max-w-[100px] text-zinc-400">
                            {details.translators.find((t) => t.id === selectedTranslatorId)?.name || 'Дубляж'}
                          </span>
                        </button>
                      )}

                      <button
                        onClick={() => setActiveMenu('speed')}
                        className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[#1D1F26] text-white transition-colors cursor-pointer"
                      >
                        <div className="flex items-center space-x-2">
                          <Gauge className="w-4 h-4 text-zinc-400" />
                          <span>Скорость</span>
                        </div>
                        <span className="text-zinc-400">{playbackSpeed}x</span>
                      </button>

                      <button
                        onClick={() => setActiveMenu('subtitles')}
                        className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[#1D1F26] text-white transition-colors cursor-pointer"
                      >
                        <div className="flex items-center space-x-2">
                          <Subtitles className="w-4 h-4 text-zinc-400" />
                          <span>Субтитры</span>
                        </div>
                        <span className="text-zinc-400">{selectedSubtitle || 'Выкл'}</span>
                      </button>
                    </div>
                  )}

                  {/* Quality Submenu */}
                  {activeMenu === 'quality' && (
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 px-1 mb-2">
                        <button
                          onClick={() => setActiveMenu('main')}
                          className="text-zinc-400 hover:text-white"
                        >
                          &larr; Назад
                        </button>
                        <span className="font-bold text-white">Выбор качества</span>
                      </div>
                      {sources?.streams.map((stream) => (
                        <button
                          key={stream.quality}
                          onClick={() => {
                            setQuality(stream.quality);
                            setShowSettingsMenu(false);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer ${
                            selectedQuality === stream.quality
                              ? 'bg-[#E50914] text-white font-bold'
                              : 'hover:bg-[#1D1F26] text-zinc-300'
                          }`}
                        >
                          <span>{stream.quality}</span>
                          {selectedQuality === stream.quality && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Translator Submenu */}
                  {activeMenu === 'translator' && (
                    <div className="space-y-1 max-h-56 overflow-y-auto no-scrollbar">
                      <div className="flex items-center space-x-2 px-1 mb-2">
                        <button
                          onClick={() => setActiveMenu('main')}
                          className="text-zinc-400 hover:text-white"
                        >
                          &larr; Назад
                        </button>
                        <span className="font-bold text-white">Озвучка / Перевод</span>
                      </div>
                      {details?.translators.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setTranslator(t.id);
                            setShowSettingsMenu(false);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer text-left ${
                            selectedTranslatorId === t.id
                              ? 'bg-[#E50914] text-white font-bold'
                              : 'hover:bg-[#1D1F26] text-zinc-300'
                          }`}
                        >
                          <span className="truncate">{t.name}</span>
                          {selectedTranslatorId === t.id && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Speed Submenu */}
                  {activeMenu === 'speed' && (
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 px-1 mb-2">
                        <button
                          onClick={() => setActiveMenu('main')}
                          className="text-zinc-400 hover:text-white"
                        >
                          &larr; Назад
                        </button>
                        <span className="font-bold text-white">Скорость воспроизведения</span>
                      </div>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                        <button
                          key={spd}
                          onClick={() => {
                            setPlaybackSpeed(spd);
                            setShowSettingsMenu(false);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer ${
                            playbackSpeed === spd
                              ? 'bg-[#E50914] text-white font-bold'
                              : 'hover:bg-[#1D1F26] text-zinc-300'
                          }`}
                        >
                          <span>{spd === 1 ? 'Обычная (1x)' : `${spd}x`}</span>
                          {playbackSpeed === spd && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Subtitles Submenu */}
                  {activeMenu === 'subtitles' && (
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 px-1 mb-2">
                        <button
                          onClick={() => setActiveMenu('main')}
                          className="text-zinc-400 hover:text-white"
                        >
                          &larr; Назад
                        </button>
                        <span className="font-bold text-white">Субтитры</span>
                      </div>
                      <button
                        onClick={() => {
                          setSubtitle(null);
                          setShowSettingsMenu(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer ${
                          selectedSubtitle === null
                            ? 'bg-[#E50914] text-white font-bold'
                            : 'hover:bg-[#1D1F26] text-zinc-300'
                        }`}
                      >
                        <span>Выключены</span>
                        {selectedSubtitle === null && <span>✓</span>}
                      </button>
                      {sources?.subtitles?.map((sub) => (
                        <button
                          key={sub.language}
                          onClick={() => {
                            setSubtitle(sub.language);
                            setShowSettingsMenu(false);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer ${
                            selectedSubtitle === sub.language
                              ? 'bg-[#E50914] text-white font-bold'
                              : 'hover:bg-[#1D1F26] text-zinc-300'
                          }`}
                        >
                          <span>{sub.language}</span>
                          {selectedSubtitle === sub.language && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Episodes & Seasons Drawer Overlay */}
      {showSeasonSelector && details?.seasons && (
        <div className="absolute right-0 top-0 bottom-0 w-80 md:w-96 bg-[#17181D]/95 backdrop-blur-2xl border-l border-[#292B32] p-5 shadow-2xl z-50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Сезоны и серии</h3>
              <button
                onClick={() => setShowSeasonSelector(false)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded bg-[#1D1F26]"
              >
                Закрыть
              </button>
            </div>

            {/* Seasons Tabs */}
            <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pb-3 mb-3 border-b border-[#292B32]">
              {details.seasons.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setEpisode(s.seasonNumber, 1)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedSeason === s.seasonNumber
                      ? 'bg-[#E50914] text-white'
                      : 'bg-[#1D1F26] text-zinc-400 hover:text-white'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>

            {/* Episodes List */}
            <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-180px)] pr-1 no-scrollbar">
              {currentSeasonData?.episodes.map((ep) => {
                const isCurrent = ep.episodeNumber === selectedEpisode;
                return (
                  <button
                    key={ep.id}
                    onClick={() => {
                      setEpisode(selectedSeason, ep.episodeNumber);
                      setShowSeasonSelector(false);
                    }}
                    className={`w-full flex items-center space-x-3 p-2.5 rounded-xl text-left transition-colors cursor-pointer border ${
                      isCurrent
                        ? 'bg-[#E50914]/20 border-[#E50914] text-white font-medium'
                        : 'bg-[#1D1F26] border-transparent hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center font-bold text-xs text-white shrink-0">
                      {ep.episodeNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate font-medium">{ep.title}</div>
                      {ep.duration && (
                        <div className="text-[11px] text-zinc-500 mt-0.5">{ep.duration}</div>
                      )}
                    </div>
                    {isCurrent && <span className="text-[#E50914] text-xs font-bold">Играет</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
