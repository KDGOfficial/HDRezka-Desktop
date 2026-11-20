import React, { useEffect } from 'react';
import { History, Play, Trash2, Clock } from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { formatRelativeTime, formatDuration } from '../../shared/utils';
import { useTranslation } from '../i18n';

export const HistoryPage: React.FC = () => {
  const { watchHistory, loadWatchHistory, openDetails } = useMediaStore();
  const { openPlayer } = usePlayerStore();
  const { t } = useTranslation();

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
    <div className="w-full pb-16 text-left select-none animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-5 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center">
            <History className="w-6 h-6 text-brand-red mr-2.5" />
            {t.history.title}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {watchHistory.length} {t.history.itemsCount}
          </p>
        </div>

        {watchHistory.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-2xl bg-white/5 hover:bg-red-950/40 border border-white/5 hover:border-red-500/30 text-xs font-semibold text-zinc-400 hover:text-brand-red transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t.history.clear}</span>
          </button>
        )}
      </div>

      {/* History Items List */}
      {watchHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-zinc-500">
          <Clock className="w-16 h-16 text-zinc-700 mb-3" />
          <p className="text-base font-bold text-zinc-400">{t.history.emptyTitle}</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm text-center leading-relaxed">
            {t.history.emptyDesc}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {watchHistory.map((item) => (
            <div
              key={item.id}
              className="group flex items-center justify-between p-4 rounded-3xl bg-[#12131a] border border-white/5 hover:border-white/10 hover:bg-[#181a24] transition-all shadow-card"
            >
              {/* Left: Poster + Info */}
              <div
                className="flex items-center space-x-4 cursor-pointer flex-1 min-w-0"
                onClick={() => openDetails(item.mediaId, item)}
              >
                <div className="relative w-16 h-24 rounded-2xl overflow-hidden bg-dark-bg flex-shrink-0 shadow-md border border-white/5">
                  <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-5 h-5 fill-white text-white" />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-sm md:text-base font-bold text-white group-hover:text-brand-red transition-colors truncate">
                    {item.title}
                  </h3>
                  <div className="flex items-center space-x-2 text-xs text-zinc-400 mt-1">
                    {item.season && item.episode ? (
                      <span className="font-semibold text-zinc-300">
                        {t.details.season} {item.season}, {t.details.episode} {item.episode}
                      </span>
                    ) : (
                      <span className="font-medium">{t.catalog.categories.films}</span>
                    )}
                    <span className="text-zinc-600">•</span>
                    <span>{formatRelativeTime(item.lastWatchedAt)}</span>
                  </div>

                  {/* Progress Bar & Timestamp */}
                  <div className="mt-2.5 flex items-center space-x-3 max-w-md">
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-red to-orange-500 rounded-full"
                        style={{ width: `${Math.min(100, item.percent)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 flex-shrink-0">
                      {formatDuration(item.currentTime)} / {formatDuration(item.duration)} ({item.percent}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center space-x-2.5 pl-4 flex-shrink-0">
                <button
                  onClick={() => handleResume(item.mediaId, item.season, item.episode, item.currentTime)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-2xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white text-xs font-bold shadow-glow transition-all active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span className="hidden sm:inline">{t.history.resume}</span>
                </button>

                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-2 rounded-2xl text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                  title={t.history.deleteEntry}
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
