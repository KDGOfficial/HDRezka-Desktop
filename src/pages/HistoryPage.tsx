import React, { useState, useEffect } from 'react';
import {
  History as HistoryIcon,
  Play,
  Trash2,
  CheckCircle,
  Clock,
  EyeOff,
  Sparkles
} from 'lucide-react';
import { WatchHistoryItem } from '../types/database';
import { getWatchHistory, clearWatchHistory, deleteHistoryItem, getMediaDetails } from '../services/api';
import { useNavigationStore } from '../stores/navigationStore';
import { usePlayerStore } from '../stores/playerStore';
import { useNotificationStore } from '../stores/notificationStore';

export const HistoryPage: React.FC = () => {
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [hideCompleted, setHideCompleted] = useState(false);
  const { startPlayback } = useNavigationStore();
  const { initPlayer } = usePlayerStore();
  const { notify } = useNotificationStore();

  const loadData = () => {
    getWatchHistory().then(setHistory);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResume = async (item: WatchHistoryItem) => {
    const details = await getMediaDetails(item.mediaId);
    const media = {
      id: item.mediaId,
      title: item.title,
      url: `/watch/${item.mediaId}`,
      poster: item.poster,
      year: 2024,
      type: item.type,
      genres: [item.type === 'series' ? 'Сериал' : 'Фильм'],
    };
    initPlayer(media, details, item.seasonNumber || 1, item.episodeNumber || 1);
    startPlayback(media, item.seasonNumber, item.episodeNumber);
  };

  const handleDelete = async (id: string) => {
    await deleteHistoryItem(id);
    loadData();
    notify({
      type: 'info',
      title: 'Удалено из истории',
    });
  };

  const handleClearAll = async () => {
    if (confirm('Вы уверены, что хотите полностью очистить историю просмотров?')) {
      await clearWatchHistory();
      setHistory([]);
      notify({
        type: 'info',
        title: 'История очищена',
      });
    }
  };

  const filtered = hideCompleted ? history.filter((h) => !h.completed) : history;

  const formatSecs = (secs: number) => {
    const m = Math.floor(secs / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h} ч ${m % 60} мин`;
    return `${m} мин`;
  };

  return (
    <div className="space-y-6 pb-16 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#292B32] pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center space-x-2">
            <HistoryIcon className="w-7 h-7 text-[#E50914]" />
            <span>История просмотров</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/30">
              {history.length}
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Все начатые и завершенные просмотры с точной позицией
          </p>
        </div>

        {/* Toolbar Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setHideCompleted(!hideCompleted)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
              hideCompleted
                ? 'bg-[#E50914]/20 border-[#E50914] text-[#E50914]'
                : 'bg-[#17181D] border-[#292B32] text-zinc-400 hover:text-white'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Скрыть просмотренные</span>
          </button>

          {history.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-[#17181D] hover:bg-red-950/30 border border-[#292B32] hover:border-red-900/50 text-xs font-medium text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Очистить историю</span>
            </button>
          )}
        </div>
      </div>

      {/* History List */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group bg-[#17181D] hover:bg-[#1D1F26] border border-[#292B32] hover:border-[#E50914]/40 rounded-2xl p-4 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-center space-x-4 min-w-0">
                {/* Poster with overlay progress */}
                <div className="relative w-16 h-24 rounded-xl overflow-hidden bg-zinc-900 shrink-0">
                  <img
                    src={item.poster}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                  {item.percentage > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
                      <div
                        className="h-full bg-[#E50914]"
                        style={{ width: `${Math.min(100, item.percentage)}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-1">
                  <h3 className="text-base font-bold text-white group-hover:text-[#E50914] transition-colors truncate">
                    {item.title}
                  </h3>

                  <div className="flex items-center space-x-2 text-xs text-zinc-400">
                    {item.seasonNumber && item.episodeNumber ? (
                      <span className="font-semibold text-zinc-300">
                        Сезон {item.seasonNumber}, Серия {item.episodeNumber}
                        {item.episodeTitle && ` — ${item.episodeTitle}`}
                      </span>
                    ) : (
                      <span>{item.type === 'movie' ? 'Фильм' : 'Сериал'}</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 text-[11px] text-zinc-500 pt-1">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatSecs(item.positionSeconds)} из {formatSecs(item.durationSeconds)}</span>
                    </span>
                    <span>•</span>
                    <span>{item.percentage}% просмотрено</span>
                    <span>•</span>
                    <span>{new Date(item.watchedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => handleResume(item)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#E50914] hover:bg-[#F40612] text-white text-xs font-bold transition-all shadow-md shadow-red-900/30 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span>Продолжить</span>
                </button>

                <button
                  onClick={() => handleDelete(item.id)}
                  title="Удалить запись"
                  className="p-2 text-zinc-500 hover:text-red-400 rounded-xl bg-[#14151A] border border-[#292B32] transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-[#17181D] rounded-3xl border border-[#292B32] space-y-3">
          <HistoryIcon className="w-12 h-12 text-zinc-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">История просмотров пуста</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Здесь будут отображаться просмотренные фильмы и сериалы с сохранением прогресса воспроизведения.
          </p>
        </div>
      )}
    </div>
  );
};
