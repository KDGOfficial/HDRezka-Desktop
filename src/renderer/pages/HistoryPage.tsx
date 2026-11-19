import React, { useEffect } from 'react';
import { History, Play, Trash2, Clock, Calendar } from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { formatRelativeTime, formatDuration } from '../../shared/utils';

export const HistoryPage: React.FC = () => {
  const { watchHistory, loadWatchHistory, openDetails } = useMediaStore();
  const { openPlayer } = usePlayerStore();

  useEffect(() => {
    loadWatchHistory();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.api) {
      await window.api.deleteWatchHistory(id);
      loadWatchHistory();
    }
  };

  const handleClear = async () => {
    if (window.api) {
      await window.api.clearWatchHistory();
      loadWatchHistory();
    }
  };

  const handleResume = async (mediaId: string, season?: number, episode?: number, currentTime?: number) => {
    if (!window.api) return;
    try {
      const details = await window.api.getDetails(mediaId);
      openPlayer({
        details,
        translatorId: details.translators[0]?.id || 56,
        seasonId: season,
        episodeId: episode,
        startTime: currentTime || 0,
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-full pb-16 text-left select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-dark-border">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <History className="w-6 h-6 text-brand-red mr-2" />
            История просмотров
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {watchHistory.length} просмотренных фильмов и серий
          </p>
        </div>

        {watchHistory.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-dark-surface hover:bg-red-950/40 border border-white/5 hover:border-red-500/30 text-xs font-semibold text-zinc-400 hover:text-brand-red transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Очистить историю</span>
          </button>
        )}
      </div>

      {/* History Items List */}
      {watchHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
          <Clock className="w-16 h-16 text-zinc-700 mb-3" />
          <p className="text-base font-semibold">История просмотров пуста</p>
          <p className="text-xs text-zinc-600 mt-1">
            Здесь будут отображаться фильмы и сериалы, которые вы начали смотреть
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {watchHistory.map((item) => (
            <div
              key={item.id}
              className="group flex items-center justify-between p-3.5 rounded-2xl bg-dark-surface border border-white/5 hover:border-white/10 hover:bg-dark-surfaceLight/60 transition-all shadow-card"
            >
              {/* Left: Poster + Info */}
              <div
                className="flex items-center space-x-4 cursor-pointer flex-1 min-w-0"
                onClick={() => openDetails(item.mediaId)}
              >
                <div className="relative w-16 h-24 rounded-xl overflow-hidden bg-dark-bg flex-shrink-0 shadow-md">
                  <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-5 h-5 fill-white text-white" />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white group-hover:text-brand-red transition-colors truncate">
                    {item.title}
                  </h3>
                  <div className="flex items-center space-x-2 text-xs text-zinc-400 mt-1">
                    {item.season && item.episode ? (
                      <span className="font-semibold text-zinc-300">
                        Сезон {item.season}, Серия {item.episode}
                      </span>
                    ) : (
                      <span className="font-medium">Фильм</span>
                    )}
                    <span>•</span>
                    <span>{formatRelativeTime(item.lastWatchedAt)}</span>
                  </div>

                  {/* Progress Bar & Timestamp */}
                  <div className="mt-2.5 flex items-center space-x-3 max-w-md">
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-red rounded-full"
                        style={{ width: `${Math.min(100, item.percent)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-zinc-400 flex-shrink-0">
                      {formatDuration(item.currentTime)} / {formatDuration(item.duration)} ({item.percent}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center space-x-3 pl-4">
                <button
                  onClick={() => handleResume(item.mediaId, item.season, item.episode, item.currentTime)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover text-white text-xs font-bold shadow-glow transition-all active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span className="hidden sm:inline">Продолжить</span>
                </button>

                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                  title="Удалить из истории"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
