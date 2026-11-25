import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Mic2,
  Tv,
  Search,
  X,
  Check,
  ArrowUpDown,
  Play,
  History,
  Hash,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Season, Translator } from '../../shared/types';
import { useTranslation } from '../i18n';

const EPISODE_CHUNK_SIZE = 50;

interface SeriesNavigationPanelProps {
  translators?: Translator[];
  selectedTranslatorId: number;
  onTranslatorChange: (translatorId: number) => void;
  seasons: Season[];
  selectedSeasonId: number;
  onSeasonChange: (seasonId: number) => void;
  loadingEpisodes?: boolean;
  onSelectEpisode: (seasonId: number, episodeId: number) => void;
  lastWatchedSeason?: number;
  lastWatchedEpisode?: number;
  isSeriesLike: boolean;
}

export function buildEpisodeChunks(episodes: Season['episodes'], chunkSize = EPISODE_CHUNK_SIZE) {
  const chunks: Array<{ index: number; label: string; startEp: number; endEp: number; episodes: Season['episodes'] }> = [];
  for (let i = 0; i < episodes.length; i += chunkSize) {
    const slice = episodes.slice(i, i + chunkSize);
    if (slice.length === 0) continue;
    const startEp = slice[0].episodeId;
    const endEp = slice[slice.length - 1].episodeId;
    chunks.push({
      index: chunks.length,
      label: startEp === endEp ? `${startEp}` : `${startEp}–${endEp}`,
      startEp,
      endEp,
      episodes: slice,
    });
  }
  return chunks;
}

interface SeasonScrollTrackProps {
  ariaLabel: string;
  activeKey: number | string;
  itemCount: number;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  trackClassName?: string;
  wrapperClassName?: string;
  compact?: boolean;
  prevLabel?: string;
  nextLabel?: string;
  sliderLabel?: string;
  children: React.ReactNode;
}

export const SeasonScrollTrack: React.FC<SeasonScrollTrackProps> = ({
  ariaLabel,
  activeKey,
  itemCount,
  onKeyDown,
  trackClassName = '',
  wrapperClassName = '',
  compact = false,
  prevLabel = 'Прокрутить сезоны влево',
  nextLabel = 'Прокрутить сезоны вправо',
  sliderLabel = 'Перемотка сезонов',
  children,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollPos, setScrollPos] = useState({ left: 0, max: 0 });

  const syncMetrics = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = Math.max(0, Math.round(el.scrollWidth - el.clientWidth));
    const left = Math.min(max, Math.max(0, Math.round(el.scrollLeft)));
    setScrollPos((prev) => (prev.left === left && prev.max === max ? prev : { left, max }));
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    syncMetrics();

    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        syncMetrics();
      });
    };

    const onWheel = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4 || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || e.deltaY === 0) return;
      const canForward = e.deltaY > 0 && el.scrollLeft < max - 1;
      const canBack = e.deltaY < 0 && el.scrollLeft > 1;
      if (canForward || canBack) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncMetrics) : null;
    ro?.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      ro?.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [syncMetrics, itemCount]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const activeTab = el.querySelector<HTMLElement>('[aria-selected="true"]');
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const id = requestAnimationFrame(syncMetrics);
    return () => cancelAnimationFrame(id);
  }, [activeKey, itemCount, syncMetrics]);

  const isOverflowing = scrollPos.max > 4;
  const canScrollLeft = scrollPos.left > 2;
  const canScrollRight = scrollPos.left < scrollPos.max - 2;

  // Redirect focus to the opposite control if the focused button reaches an end and disables
  useEffect(() => {
    if (!canScrollLeft && document.activeElement === prevBtnRef.current) {
      nextBtnRef.current?.focus();
    } else if (!canScrollRight && document.activeElement === nextBtnRef.current) {
      prevBtnRef.current?.focus();
    }
  }, [canScrollLeft, canScrollRight]);

  const stepScroll = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const step = Math.max(compact ? 180 : 260, Math.round(el.clientWidth * 0.72));
    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * step, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = trackRef.current;
    if (!el) return;
    const next = Number(e.target.value);
    el.scrollLeft = next;
    setScrollPos((prev) => ({ ...prev, left: next }));
  };

  const clampedLeft = Math.min(scrollPos.left, scrollPos.max);
  const progressPct = scrollPos.max > 0 ? Math.round((clampedLeft / scrollPos.max) * 100) : 0;

  return (
    <div className={wrapperClassName}>
      <div
        ref={trackRef}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className={`tabs-scroll-fade flex items-center gap-1.5 overflow-x-auto scrollbar-none ${trackClassName}`}
      >
        {children}
      </div>

      {isOverflowing && (
        <div className={`flex items-center gap-2 ${compact ? 'mt-1.5' : 'mt-2.5'}`}>
          <button
            ref={prevBtnRef}
            type="button"
            disabled={!canScrollLeft}
            onClick={() => stepScroll(-1)}
            aria-label={prevLabel}
            className="w-6 h-6 min-w-[24px] min-h-[24px] rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.1] text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-default cursor-pointer active:scale-95 flex-shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <input
            type="range"
            min={0}
            max={scrollPos.max}
            step={1}
            value={clampedLeft}
            onChange={handleRangeChange}
            aria-label={sliderLabel}
            aria-valuetext={`${progressPct}%`}
            style={
              {
                '--attr-min': 0,
                '--attr-max': scrollPos.max,
                '--control-value': clampedLeft,
              } as React.CSSProperties
            }
            className="ember-range flex-1"
          />

          <button
            ref={nextBtnRef}
            type="button"
            disabled={!canScrollRight}
            onClick={() => stepScroll(1)}
            aria-label={nextLabel}
            className="w-6 h-6 min-w-[24px] min-h-[24px] rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.1] text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-default cursor-pointer active:scale-95 flex-shrink-0"
          >
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};

export const SeriesNavigationPanel: React.FC<SeriesNavigationPanelProps> = ({
  translators = [],
  selectedTranslatorId,
  onTranslatorChange,
  seasons,
  selectedSeasonId,
  onSeasonChange,
  loadingEpisodes = false,
  onSelectEpisode,
  lastWatchedSeason,
  lastWatchedEpisode,
  isSeriesLike,
}) => {
  const { t } = useTranslation();
  const [translatorQuery, setTranslatorQuery] = useState('');
  const [episodeQuery, setEpisodeQuery] = useState('');
  const [reverseOrder, setReverseOrder] = useState(false);
  const [selectedChunkIdx, setSelectedChunkIdx] = useState(0);

  const currentSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) || seasons[0],
    [seasons, selectedSeasonId]
  );

  const rawEpisodes = currentSeason?.episodes || [];

  const orderedEpisodes = useMemo(
    () => (reverseOrder ? [...rawEpisodes].reverse() : rawEpisodes),
    [rawEpisodes, reverseOrder]
  );

  const chunks = useMemo(
    () => (orderedEpisodes.length > EPISODE_CHUNK_SIZE ? buildEpisodeChunks(orderedEpisodes, EPISODE_CHUNK_SIZE) : []),
    [orderedEpisodes]
  );

  // Auto-select the chunk containing the last-watched episode when switching seasons
  useEffect(() => {
    setEpisodeQuery('');
    if (chunks.length === 0) {
      setSelectedChunkIdx(0);
      return;
    }
    if (currentSeason && lastWatchedSeason === currentSeason.id && lastWatchedEpisode) {
      const idx = chunks.findIndex((c) => c.episodes.some((ep) => ep.episodeId === lastWatchedEpisode));
      if (idx >= 0) {
        setSelectedChunkIdx(idx);
        return;
      }
    }
    setSelectedChunkIdx(0);
  }, [currentSeason?.id, reverseOrder, chunks.length, lastWatchedSeason, lastWatchedEpisode]);

  const filteredTranslators = useMemo(() => {
    const q = translatorQuery.trim().toLowerCase();
    if (!q) return translators;
    return translators.filter((tr) => tr.name.toLowerCase().includes(q));
  }, [translators, translatorQuery]);

  const activeTranslator = useMemo(
    () => translators.find((tr) => tr.id === selectedTranslatorId) || translators[0],
    [translators, selectedTranslatorId]
  );

  const visibleEpisodes = useMemo(() => {
    const q = episodeQuery.trim().toLowerCase();
    if (q) {
      return orderedEpisodes.filter(
        (ep) =>
          String(ep.episodeId).includes(q) ||
          (ep.title && ep.title.toLowerCase().includes(q))
      );
    }
    if (chunks.length > 0) {
      return (chunks[selectedChunkIdx] || chunks[0])?.episodes || [];
    }
    return orderedEpisodes;
  }, [orderedEpisodes, episodeQuery, chunks, selectedChunkIdx]);

  const handleEpisodeJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSeason) return;
    const num = parseInt(episodeQuery.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(num) && num > 0) {
      const exact = rawEpisodes.find((ep) => ep.episodeId === num);
      if (exact) {
        onSelectEpisode(currentSeason.id, exact.episodeId);
        return;
      }
    }
    if (visibleEpisodes.length > 0) {
      onSelectEpisode(currentSeason.id, visibleEpisodes[0].episodeId);
    }
  };

  const handleTabListKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    ids: number[],
    activeId: number,
    onSelect: (id: number) => void
  ) => {
    const idx = ids.indexOf(activeId);
    if (idx < 0 || ids.length <= 1) return;
    let nextIdx = -1;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % ids.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = ids.length - 1;
    if (nextIdx >= 0) {
      e.preventDefault();
      onSelect(ids[nextIdx]);
      const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons[nextIdx]?.focus();
    }
  };

  const hasTranslators = translators.length > 0;
  const hasSeasons = isSeriesLike && seasons.length > 0;
  if (!hasTranslators && !hasSeasons) return null;

  const totalEpisodesAllSeasons = seasons.reduce((sum, s) => sum + (s.episodes?.length || 0), 0);

  return (
    <section className="mb-8 rounded-3xl cinema-panel overflow-hidden">
      {/* Voiceover / Translator Selector */}
      {hasTranslators && (
        <div className={`p-5 sm:p-6 ${hasSeasons ? 'border-b border-white/[0.06]' : ''}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center flex-wrap gap-2.5">
              <h2 className="font-display text-sm font-black text-white uppercase tracking-wider flex items-center gap-2.5">
                <span
                  className="w-1.5 h-4 rounded-full"
                  style={{ background: 'linear-gradient(180deg, #FF124F 0%, #FF7A00 100%)' }}
                />
                <Mic2 className="w-4 h-4 text-brand-orange" aria-hidden="true" />
                <span>{t.details.audioTranslation}</span>
              </h2>
              {translators.length > 1 && (
                <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[11px] font-mono font-bold text-zinc-300 tabular-nums">
                  {translators.length}
                </span>
              )}
              {activeTranslator && (
                <span className="logo-pill px-2.5 py-0.5 rounded-full text-[11px] font-bold text-zinc-200 max-w-[260px] truncate">
                  {activeTranslator.name}
                </span>
              )}
            </div>

            {translators.length > 6 && (
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  value={translatorQuery}
                  onChange={(e) => setTranslatorQuery(e.target.value)}
                  placeholder="Поиск озвучки..."
                  aria-label="Поиск озвучки"
                  className="w-full pl-8 pr-8 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.1] focus:border-brand-orange/60 text-xs text-white placeholder:text-zinc-500"
                />
                {translatorQuery && (
                  <button
                    type="button"
                    onClick={() => setTranslatorQuery('')}
                    aria-label="Очистить поиск озвучки"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto overscroll-contain pr-1">
            {filteredTranslators.map((tr) => {
              const isActive = selectedTranslatorId === tr.id;
              return (
                <button
                  key={tr.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onTranslatorChange(tr.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                    isActive
                      ? 'btn-ember text-white'
                      : 'bg-white/[0.05] hover:bg-white/[0.11] text-zinc-300 hover:text-white border border-white/[0.08]'
                  }`}
                >
                  {isActive && <Check className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />}
                  <span className="truncate max-w-[240px]">{tr.name}</span>
                  {tr.camrip && <span className="text-[10px] text-amber-300 font-semibold">(CamRip)</span>}
                </button>
              );
            })}
            {filteredTranslators.length === 0 && (
              <div className="text-xs text-zinc-500 py-2">Озвучка не найдена</div>
            )}
          </div>
        </div>
      )}

      {/* Seasons & Episodes Navigator */}
      {hasSeasons && (
        <div className="p-5 sm:p-6">
          {/* Header Row: Title, Total Count, Quick Resume, Season Dropdown (if many), Sort & Episode Jump */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
            <div className="flex items-center flex-wrap gap-2.5">
              <h2 className="font-display text-sm font-black text-white uppercase tracking-wider flex items-center gap-2.5">
                <span
                  className="w-1.5 h-4 rounded-full"
                  style={{ background: 'linear-gradient(180deg, #FF124F 0%, #FF7A00 100%)' }}
                />
                <Tv className="w-4 h-4 text-brand-orange" aria-hidden="true" />
                <span>{t.details.seasonsAndEpisodes}</span>
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-white/[0.08] text-[11px] font-mono font-bold text-zinc-300 tabular-nums">
                {seasons.length > 1
                  ? `${seasons.length} сез. · ${totalEpisodesAllSeasons} сер.`
                  : `${rawEpisodes.length} сер.`}
              </span>
              {lastWatchedSeason && lastWatchedEpisode && (
                <button
                  type="button"
                  onClick={() => onSelectEpisode(lastWatchedSeason, lastWatchedEpisode)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-orange/15 hover:bg-brand-orange/25 border border-brand-orange/40 text-brand-orange text-[11px] font-extrabold cursor-pointer tabular-nums"
                  title="Продолжить с последней просмотренной серии"
                >
                  <History className="w-3 h-3" aria-hidden="true" />
                  <span>С{lastWatchedSeason} · Э{lastWatchedEpisode}</span>
                </button>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {seasons.length > 8 && (
                <select
                  aria-label="Быстрый выбор сезона"
                  value={selectedSeasonId}
                  onChange={(e) => onSeasonChange(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-full bg-[#1D141A] border border-white/[0.12] text-xs font-bold text-zinc-200 cursor-pointer"
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#140E12] text-white">
                      {s.title || `${t.details.season} ${s.id}`} ({s.episodes?.length || 0})
                    </option>
                  ))}
                </select>
              )}

              {rawEpisodes.length > 16 && (
                <form onSubmit={handleEpisodeJumpSubmit} className="relative">
                  <Hash className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    type="text"
                    value={episodeQuery}
                    onChange={(e) => setEpisodeQuery(e.target.value)}
                    placeholder="№ серии..."
                    aria-label="Быстрый переход к серии"
                    className="w-36 pl-8 pr-7 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.1] focus:border-brand-orange/60 text-xs text-white placeholder:text-zinc-500 tabular-nums"
                  />
                  {episodeQuery && (
                    <button
                      type="button"
                      onClick={() => setEpisodeQuery('')}
                      aria-label="Очистить фильтр серий"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </form>
              )}

              {rawEpisodes.length > 12 && (
                <button
                  type="button"
                  onClick={() => setReverseOrder((v) => !v)}
                  aria-pressed={reverseOrder}
                  title={reverseOrder ? 'Сначала новые серии' : 'Сначала первые серии'}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer tabular-nums ${
                    reverseOrder
                      ? 'bg-brand-orange/15 border-brand-orange/45 text-brand-orange'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.1] text-zinc-300 hover:text-white'
                  }`}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{reverseOrder ? 'Новые ↓' : '1 → N'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Season Tabs with horizontal scroll slider & prev/next controls */}
          {seasons.length > 1 && (
            <SeasonScrollTrack
              ariaLabel={t.details.season}
              activeKey={selectedSeasonId}
              itemCount={seasons.length}
              onKeyDown={(e) =>
                handleTabListKeyDown(
                  e,
                  seasons.map((s) => s.id),
                  selectedSeasonId,
                  onSeasonChange
                )
              }
              wrapperClassName="pb-3 mb-4 border-b border-white/[0.07]"
              trackClassName="pb-1"
            >
              {seasons.map((s) => {
                const isSelected = selectedSeasonId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => onSeasonChange(s.id)}
                    className={`tab-indicator relative flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'btn-ember text-white'
                        : 'bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.09]'
                    }`}
                  >
                    <span>{s.title || `${t.details.season} ${s.id}`}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${
                        isSelected ? 'bg-black/25 text-white' : 'bg-white/[0.07] text-zinc-400'
                      }`}
                    >
                      {s.episodes?.length || 0}
                    </span>
                  </button>
                );
              })}
            </SeasonScrollTrack>
          )}

          {/* Episode Range Chunk Tabs with horizontal scroll slider & prev/next controls */}
          {chunks.length > 1 && !episodeQuery.trim() && (
            <SeasonScrollTrack
              ariaLabel="Диапазоны серий"
              activeKey={selectedChunkIdx}
              itemCount={chunks.length}
              prevLabel="Прокрутить серии влево"
              nextLabel="Прокрутить серии вправо"
              sliderLabel="Перемотка серий"
              onKeyDown={(e) =>
                handleTabListKeyDown(
                  e,
                  chunks.map((c) => c.index),
                  selectedChunkIdx,
                  setSelectedChunkIdx
                )
              }
              wrapperClassName="mb-3.5"
              trackClassName="pb-1"
            >
              {chunks.map((chunk) => {
                const isSelected = chunk.index === selectedChunkIdx;
                const hasWatched = Boolean(
                  currentSeason &&
                    lastWatchedSeason === currentSeason.id &&
                    lastWatchedEpisode &&
                    chunk.episodes.some((ep) => ep.episodeId === lastWatchedEpisode)
                );
                return (
                  <button
                    key={chunk.index}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => setSelectedChunkIdx(chunk.index)}
                    className={`tab-indicator relative flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono font-bold whitespace-nowrap cursor-pointer tabular-nums ${
                      isSelected
                        ? 'bg-brand-orange/20 border border-brand-orange/60 text-white'
                        : 'bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.07] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {hasWatched && <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" aria-hidden="true" />}
                    <span>{chunk.label}</span>
                  </button>
                );
              })}
            </SeasonScrollTrack>
          )}

          {/* Episodes Grid */}
          {loadingEpisodes ? (
            <div className="py-10 text-center text-xs text-zinc-400 animate-pulse font-semibold">
              {t.details.loadingEpisodes}
            </div>
          ) : currentSeason && visibleEpisodes.length > 0 ? (
            <div
              role="tabpanel"
              aria-label={currentSeason.title || `${t.details.season} ${currentSeason.id}`}
              className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-2 max-h-[340px] overflow-y-auto overscroll-contain pr-1"
            >
              {visibleEpisodes.map((ep) => {
                const isLastWatched =
                  lastWatchedSeason === currentSeason.id && lastWatchedEpisode === ep.episodeId;
                const cleanSub =
                  ep.title &&
                  !/^(?:серия|episode|эпизод)\s*\d+$/i.test(ep.title.trim()) &&
                  ep.title.trim() !== String(ep.episodeId)
                    ? ep.title.replace(new RegExp(`^${ep.episodeId}[.\\s-]+`), '').trim()
                    : '';
                return (
                  <button
                    key={`${currentSeason.id}-${ep.episodeId}`}
                    type="button"
                    onClick={() => onSelectEpisode(currentSeason.id, ep.episodeId)}
                    title={ep.title || `${t.details.episode} ${ep.episodeId}`}
                    className={`relative flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl border text-center group active:scale-95 cursor-pointer ${
                      isLastWatched
                        ? 'bg-brand-orange/20 border-brand-orange/65 text-white shadow-glow-sm'
                        : 'bg-white/[0.04] hover:bg-gradient-to-br hover:from-brand-crimson hover:to-brand-orange border-white/[0.07] hover:border-white/25 text-zinc-200 hover:text-white'
                    }`}
                  >
                    {isLastWatched && (
                      <span
                        className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-orange"
                        aria-hidden="true"
                      />
                    )}
                    <span className="font-display text-sm font-black tabular-nums leading-none flex items-center gap-1 text-white group-hover:text-white">
                      <Play className="w-2.5 h-2.5 fill-current opacity-0 group-hover:opacity-100 -ml-3 group-hover:ml-0 transition-all" aria-hidden="true" />
                      <span>{ep.episodeId}</span>
                    </span>
                    <span className="text-[10px] text-zinc-400 group-hover:text-white/90 truncate w-full mt-1">
                      {cleanSub || t.details.episode}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-zinc-500">{t.details.noEpisodes}</div>
          )}
        </div>
      )}
    </section>
  );
};
