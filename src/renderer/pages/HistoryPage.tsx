import React, { useEffect, useState } from 'react';
import { History, Play, Trash2, Clock } from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { formatRelativeTime, formatDuration, getResumableTime } from '../../shared/utils';
import { useTranslation } from '../i18n';
import appLogo from '../assets/logo.png';

export const HistoryPage: React.FC = () => {
  const { watchHistory, loadWatchHistory, openDetails } = useMediaStore();
  const { openPlayer } = usePlayerStore();
  const { t } = useTranslation();
  const [failedPosters, setFailedPosters] = useState<Record<string, boolean>>({});

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

  const handleResume = async (
    idOrUrl: string,
    season?: number,
    episode?: number,
    currentTime?: number,
    duration?: number
  ) => {
    if (!window.api) return;
    try {
      const details = await window.api.getDetails(idOrUrl);
      const startTime = getResumableTime(currentTime, duration);
      openPlayer({
        details,
        translatorId: details.currentTranslatorId ?? details.translators?.[0]?.id ?? 0,
        seasonId: season,
        episodeId: episode,
        startTime,
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-full pb-16 text-left select-none animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-5 border-b border-white/[0.06]">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <span className="w-9 h-9 rounded-2xl play-squircle flex items-center justify-center flex-shrink-0">
              <History className="w-4 h-4 text-white" />
            </span>
            <span>{t.history.title}</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1.5">
            {watchHistory.length} {t.history.itemsCount}
          </p>
        </div>

        {watchHistory.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.05] hover:bg-rose-950/50 border border-white/[0.09] hover:border-rose-500/40 text-xs font-bold text-zinc-300 hover:text-rose-300 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t.history.clearHistory}</span>
          </button>
        )}
      </div>

      {/* History List */}
      {watchHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-zinc-500">
          <div className="w-16 h-16 rounded-3xl cinema-panel flex items-center justify-center mb-4">
            <Clock className="w-7 h-7 text-brand-orange" />
          </div>
          <p className="font-display text-base font-black text-zinc-200">{t.history.emptyTitle}</p>
          <p className="text-xs text-zinc-400 mt-1.5 max-w-sm text-center leading-relaxed">
            {t.history.emptyDesc}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {watchHistory.map((item) => (
            <div
              key={item.id}
              className="group flex items-center justify-between p-4 rounded-3xl cinema-panel hover:border-brand-ember/45 transition-all"
            >
              <div
                className="flex items-center gap-4 cursor-pointer flex-1 min-w-0"
                onClick={() => openDetails(item.url || item.mediaId, item)}
              >
                <div className="cinema-player-surface relative w-16 h-24 rounded-2xl overflow-hidden flex-shrink-0 shadow-md border border-white/[0.08]">
                  {item.poster && !failedPosters[item.id] ? (
                    <img
                      src={item.poster}
                      alt={item.title}
                      onError={() => setFailedPosters((prev) => ({ ...prev, [item.id]: true }))}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1C1218] via-[#120B10] to-[#090608]">
                      <img src={appLogo} alt="" className="w-8 h-8 rounded-full object-cover opacity-80" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-8 rounded-xl play-squircle flex items-center justify-center">
                      <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm md:text-base font-black text-white group-hover:text-brand-orange transition-colors truncate">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                    {item.season && item.episode ? (
                      <span className="font-bold text-zinc-200">
                        {t.details.season} {item.season}, {t.details.episode} {item.episode}
                      </span>
                    ) : (
                      <span className="font-semibold">{t.catalog.categories.films}</span>
                    )}
                    <span className="text-zinc-600">·</span>
                    <span>{formatRelativeTime(item.lastWatchedAt)}</span>
                  </div>

                  {/* Ember Progress Bar */}
                  <div className="mt-3 flex items-center gap-3 max-w-md">
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, item.percent)}%`,
                          background: 'linear-gradient(90deg, #FF124F 0%, #FF7A00 100%)',
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400 flex-shrink-0 tabular-nums">
                      {formatDuration(item.currentTime)} / {formatDuration(item.duration)} ({item.percent}%)
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 pl-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleResume(item.url || item.mediaId, item.season, item.episode, item.currentTime, item.duration)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-full btn-ember text-white text-xs font-extrabold active:scale-95 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span className="hidden sm:inline">{t.history.resume}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  aria-label={t.history.deleteEntry}
                  className="p-2.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.1] cursor-pointer"
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
