import React, { useState, useRef } from 'react';
import {
  Wand2,
  Film,
  Tv,
  Smile,
  Sparkles,
  Play,
  Heart,
  Plus,
  Star,
  RefreshCw,
  SlidersHorizontal,
  ArrowLeft,
  Info,
  AlertCircle,
} from 'lucide-react';
import { ContentType, MediaItem } from '../../shared/types';
import { GENRES } from '../../shared/constants';
import {
  ScoredRecommendation,
  getTopGenres,
  pickWhatToWatchCandidate,
} from '../../shared/recommendations';
import { useMediaStore } from '../stores/useMediaStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';
import appLogo from '../assets/logo.png';

const CATEGORY_CARDS: Array<{
  id: ContentType;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { id: 'films', icon: Film, accent: 'from-[#FF124F]/25 to-[#FF7A00]/15' },
  { id: 'series', icon: Tv, accent: 'from-[#FF551A]/25 to-[#FFB830]/15' },
  { id: 'cartoons', icon: Smile, accent: 'from-[#FFB830]/25 to-[#FF333D]/15' },
  { id: 'animation', icon: Sparkles, accent: 'from-[#FF124F]/25 to-[#A855F7]/20' },
];

export const WhatToWatchPage: React.FC = () => {
  const { openDetails, favorites, toggleFavorite, openCollectionModal, watchHistory } = useMediaStore();
  const { settings, setInterestsModalOpen } = useSettingsStore();
  const { t, translateGenre } = useTranslation();

  const [step, setStep] = useState<'choose' | 'result'>('choose');
  const [selectedCategory, setSelectedCategory] = useState<ContentType | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPick, setCurrentPick] = useState<ScoredRecommendation | null>(null);
  const [allSeenNotice, setAllSeenNotice] = useState(false);

  const poolRef = useRef<MediaItem[]>([]);
  const pageRef = useRef<number>(1);
  const excludedIdsRef = useRef<Set<string>>(new Set());
  const requestSeqRef = useRef<number>(0);

  const topGenres = getTopGenres(settings.interests, 6);
  const selectableGenres = GENRES.filter((g) => g.id !== '');

  const fetchCandidatesFor = async (category: ContentType, genre: string, page: number): Promise<MediaItem[]> => {
    if (!window.api) return [];
    const requests: Array<Promise<MediaItem[]>> = [];

    const effectiveGenre = genre || topGenres[0]?.id || undefined;
    // Fetch genre-targeted batch (when a genre is chosen or known from taste profile) + popular category batch
    if (effectiveGenre && page === 1) {
      requests.push(
        window.api
          .getCatalog({ type: category, genre: effectiveGenre, sort: 'popular', page: 1 })
          .then((r) => r?.items || [])
          .catch(() => [])
      );
    }
    requests.push(
      window.api
        .getCatalog({ type: category, genre: genre || undefined, sort: 'popular', page })
        .then((r) => r?.items || [])
        .catch(() => [])
    );
    if (page === 1) {
      requests.push(
        window.api
          .getCatalog({ type: category, sort: 'last', page: 1 })
          .then((r) => r?.items || [])
          .catch(() => [])
      );
    }

    const batches = await Promise.all(requests);
    const merged: MediaItem[] = [];
    const seen = new Set<string>();
    for (const batch of batches) {
      for (const item of batch) {
        if (!item?.poster) continue;
        const key = (item.id || item.url || item.title || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }
    return merged;
  };

  const runRecommendation = async (
    category: ContentType,
    genre: string,
    opts?: { resetPool?: boolean; fetchNextPage?: boolean }
  ) => {
    const seq = ++requestSeqRef.current;
    setSelectedCategory(category);
    setStep('result');
    setLoading(true);
    setError(null);
    setAllSeenNotice(false);

    try {
      if (opts?.resetPool) {
        poolRef.current = [];
        pageRef.current = 1;
        excludedIdsRef.current = new Set();
      }

      if (poolRef.current.length === 0 || opts?.fetchNextPage) {
        const targetPage = opts?.fetchNextPage ? pageRef.current + 1 : 1;
        const fresh = await fetchCandidatesFor(category, genre, targetPage);
        if (seq !== requestSeqRef.current) return;
        pageRef.current = targetPage;
        const existingKeys = new Set(poolRef.current.map((i) => (i.id || i.url || '').toLowerCase()));
        for (const item of fresh) {
          const k = (item.id || item.url || '').toLowerCase();
          if (k && !existingKeys.has(k)) {
            existingKeys.add(k);
            poolRef.current.push(item);
          }
        }
      }

      let pick = pickWhatToWatchCandidate({
        candidates: poolRef.current,
        category,
        genreOverride: genre || undefined,
        profile: settings.interests,
        watchHistory,
        excludedIds: excludedIdsRef.current,
      });

      // If all local candidates were shown, load the next catalog page once before wrapping
      if (!pick && pageRef.current < 4) {
        const nextPage = pageRef.current + 1;
        const more = await fetchCandidatesFor(category, genre, nextPage);
        if (seq !== requestSeqRef.current) return;
        pageRef.current = nextPage;
        const existingKeys = new Set(poolRef.current.map((i) => (i.id || i.url || '').toLowerCase()));
        for (const item of more) {
          const k = (item.id || item.url || '').toLowerCase();
          if (k && !existingKeys.has(k)) {
            existingKeys.add(k);
            poolRef.current.push(item);
          }
        }
        pick = pickWhatToWatchCandidate({
          candidates: poolRef.current,
          category,
          genreOverride: genre || undefined,
          profile: settings.interests,
          watchHistory,
          excludedIds: excludedIdsRef.current,
        });
      }

      if (!pick && poolRef.current.length > 0 && excludedIdsRef.current.size > 0) {
        excludedIdsRef.current.clear();
        setAllSeenNotice(true);
        pick = pickWhatToWatchCandidate({
          candidates: poolRef.current,
          category,
          genreOverride: genre || undefined,
          profile: settings.interests,
          watchHistory,
          excludedIds: excludedIdsRef.current,
        });
      }

      if (seq !== requestSeqRef.current) return;

      if (!pick) {
        setCurrentPick(null);
        setError(t.whatToWatch.noResults);
      } else {
        const pickedKey = (pick.item.id || pick.item.url || '').trim();
        if (pickedKey) excludedIdsRef.current.add(pickedKey);
        if (pick.item.url) excludedIdsRef.current.add(pick.item.url);
        setCurrentPick(pick);
      }
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      console.error('[WhatToWatch] Failed to pick recommendation:', err);
      setCurrentPick(null);
      setError(t.whatToWatch.noResults);
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSelectCategory = (category: ContentType) => {
    runRecommendation(category, selectedGenre, { resetPool: true });
  };

  const handleSuggestAnother = () => {
    if (!selectedCategory) return;
    runRecommendation(selectedCategory, selectedGenre, { resetPool: false });
  };

  const handleChangeGenreOrCategory = () => {
    ++requestSeqRef.current;
    setLoading(false);
    setError(null);
    setAllSeenNotice(false);
    setStep('choose');
  };

  const pickedItem = currentPick?.item;
  const isFav = pickedItem ? favorites.some((f) => f.mediaId === pickedItem.id) : false;

  const reasonLabel = (() => {
    if (!currentPick) return '';
    if (currentPick.matchedGenres.length > 0) {
      const names = currentPick.matchedGenres.slice(0, 2).map((g) => translateGenre(g)).join(', ');
      return t.whatToWatch.matchedGenre.replace('{genres}', names);
    }
    if (currentPick.matchedType) return t.whatToWatch.matchedTaste;
    return t.whatToWatch.highRated;
  })();

  return (
    <div className="w-full max-w-5xl mx-auto pb-20 text-left select-none animate-fadeIn">
      {/* Page Header */}
      <div className="mb-8 pb-5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl play-squircle flex items-center justify-center flex-shrink-0">
              <Wand2 className="w-5 h-5 text-white" aria-hidden="true" />
            </span>
            <span>{t.whatToWatch.title}</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed max-w-2xl">
            {t.whatToWatch.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setInterestsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full cinema-panel hover:border-brand-ember/50 text-xs font-bold text-zinc-200 hover:text-white cursor-pointer active:scale-95 self-start sm:self-center"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
          <span>{t.whatToWatch.editInterests}</span>
        </button>
      </div>

      {step === 'choose' ? (
        <div className="space-y-7 animate-fadeIn">
          {/* Assistant Prompt Banner */}
          <section className="relative p-6 sm:p-8 rounded-3xl cinema-panel border border-brand-ember/30 overflow-hidden">
            <div
              className="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-25 blur-3xl pointer-events-none"
              style={{ background: 'radial-gradient(circle, #FF124F 0%, transparent 70%)' }}
            />
            <div className="relative z-10 space-y-5">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full btn-ember text-[10px] font-display font-black uppercase tracking-[0.14em]">
                  <Sparkles className="w-3 h-3 text-[#FFE29A]" aria-hidden="true" />
                  <span>{t.whatToWatch.chooseCategory}</span>
                </span>
                <p className="text-sm sm:text-base font-bold text-white leading-relaxed max-w-3xl">
                  {t.whatToWatch.introMessage}
                </p>
              </div>

              {/* Active user taste summary */}
              {topGenres.length > 0 && (
                <div className="flex items-center flex-wrap gap-2">
                  {topGenres.map((g) => (
                    <span
                      key={g.id}
                      className="px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-bold text-zinc-200"
                    >
                      {translateGenre(g.id)}
                    </span>
                  ))}
                </div>
              )}

              {/* 4 Category Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                {CATEGORY_CARDS.map((cat) => {
                  const Icon = cat.icon;
                  const label = t.catalog.categories[cat.id];
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat.id)}
                      className={`group relative p-6 rounded-3xl bg-gradient-to-br ${cat.accent} border border-white/[0.1] hover:border-brand-ember/70 text-left flex flex-col items-start justify-between gap-5 cursor-pointer cinema-card shadow-elevated`}
                    >
                      <div className="w-12 h-12 rounded-2xl play-squircle flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Icon className="w-6 h-6 text-white" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="font-display text-base font-black text-white group-hover:text-brand-orange transition-colors">
                          {label}
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-1 font-semibold">
                          {t.whatToWatch.pickForMe}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Optional Genre Preference Filter */}
          <section className="p-6 rounded-3xl cinema-panel space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-display text-xs font-black uppercase tracking-[0.14em] text-zinc-400">
                {t.whatToWatch.optionalGenre}
              </h2>
              {selectedGenre && (
                <button
                  type="button"
                  onClick={() => setSelectedGenre('')}
                  className="text-[11px] font-bold text-brand-orange hover:underline cursor-pointer"
                >
                  {t.whatToWatch.anyGenre}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={selectedGenre === ''}
                onClick={() => setSelectedGenre('')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border cursor-pointer active:scale-95 ${
                  selectedGenre === ''
                    ? 'btn-ember border-transparent text-white'
                    : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.08] text-zinc-300'
                }`}
              >
                {t.whatToWatch.anyGenre}
              </button>
              {selectableGenres.map((g) => {
                const active = selectedGenre === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedGenre(active ? '' : g.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold border cursor-pointer active:scale-95 ${
                      active
                        ? 'bg-brand-crimson/25 border-brand-ember text-white shadow-glow-sm'
                        : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.08] text-zinc-300 hover:text-white'
                    }`}
                  >
                    {translateGenre(g.id)}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6 animate-fadeIn">
          {/* Top navigation strip back to category/genre choice */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              type="button"
              onClick={handleChangeGenreOrCategory}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-zinc-200 hover:text-white cursor-pointer active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
              <span>{t.whatToWatch.changeGenre}</span>
            </button>

            <div className="flex items-center gap-2">
              {selectedCategory && (
                <span className="logo-pill px-3 py-1 rounded-full text-xs font-bold text-white">
                  {t.catalog.categories[selectedCategory]}
                </span>
              )}
              {selectedGenre && (
                <span className="px-3 py-1 rounded-full bg-brand-crimson/20 border border-brand-ember/40 text-xs font-bold text-amber-200">
                  {translateGenre(selectedGenre)}
                </span>
              )}
            </div>
          </div>

          {allSeenNotice && (
            <div className="p-3.5 rounded-2xl bg-amber-950/35 border border-amber-500/35 text-amber-200 text-xs font-medium">
              {t.whatToWatch.allSeenNotice}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 rounded-3xl cinema-panel">
              <div className="relative w-20 h-20 mb-5 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-[3px] border-brand-crimson/20 border-t-brand-orange border-r-brand-crimson animate-spin" />
                <img src={appLogo} alt="" className="w-12 h-12 rounded-full object-cover shadow-glow" />
              </div>
              <span className="text-zinc-300 text-xs font-bold tracking-wider uppercase animate-pulse">
                {t.whatToWatch.picking}
              </span>
            </div>
          ) : error || !pickedItem ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 rounded-3xl cinema-panel text-center">
              <AlertCircle className="w-10 h-10 text-brand-orange mb-3" />
              <p className="text-sm font-bold text-white mb-5">{error || t.whatToWatch.noResults}</p>
              <div className="flex items-center gap-3 flex-wrap justify-center">
                {selectedCategory && (
                  <button
                    type="button"
                    onClick={() => runRecommendation(selectedCategory, selectedGenre, { resetPool: true })}
                    className="px-5 py-2.5 rounded-full btn-ember text-white text-xs font-extrabold cursor-pointer active:scale-95"
                  >
                    {t.whatToWatch.retry}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleChangeGenreOrCategory}
                  className="px-5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white text-xs font-bold cursor-pointer"
                >
                  {t.whatToWatch.changeGenre}
                </button>
              </div>
            </div>
          ) : (
            <section className="cinema-player-surface relative rounded-3xl overflow-hidden border border-brand-ember/35 shadow-elevated">
              {/* Atmospheric backdrop */}
              <img
                src={pickedItem.poster}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-35 brightness-50 pointer-events-none"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B070A] via-[#0B070A]/90 to-[#0B070A]/55 pointer-events-none" />

              <div className="relative z-10 p-6 sm:p-10 flex flex-col md:flex-row items-center md:items-start gap-8">
                {/* Poster */}
                <button
                  type="button"
                  onClick={() => openDetails(pickedItem.url || pickedItem.id, pickedItem)}
                  aria-label={`${t.whatToWatch.watchNow} ${pickedItem.title}`}
                  className="w-52 sm:w-60 flex-shrink-0 group cursor-pointer rounded-[22px] p-[2px] bg-gradient-to-br from-white/30 via-brand-ember/55 to-brand-crimson/55 shadow-[0_24px_60px_rgba(0,0,0,0.9)]"
                >
                  <div className="relative rounded-[20px] overflow-hidden bg-dark-surface">
                    <img
                      src={pickedItem.poster}
                      alt={pickedItem.title}
                      className="w-full aspect-[2/3] object-cover group-hover:scale-105 transition-transform duration-500 block"
                    />
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-16 h-16 rounded-[18px] play-squircle flex items-center justify-center">
                        <Play className="w-7 h-7 fill-white text-white ml-0.5" aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                </button>

                {/* Info & Actions */}
                <div className="flex-1 min-w-0 space-y-4">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full btn-ember text-[10px] font-display font-black uppercase tracking-[0.14em]">
                      <Wand2 className="w-3 h-3 text-[#FFE29A]" aria-hidden="true" />
                      <span>{t.whatToWatch.yourPick}</span>
                    </span>

                    {Boolean(pickedItem.rating && pickedItem.rating > 0) && (
                      <span className="logo-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-brand-gold text-xs font-extrabold tabular-nums">
                        <Star className="w-3.5 h-3.5 fill-brand-gold" aria-hidden="true" />
                        <span>{pickedItem.rating!.toFixed(1)}</span>
                      </span>
                    )}

                    {pickedItem.year && (
                      <span className="logo-pill px-2.5 py-1 rounded-full text-zinc-200 text-xs font-bold tabular-nums">
                        {pickedItem.year}
                      </span>
                    )}

                    {pickedItem.country && (
                      <span className="logo-pill px-2.5 py-1 rounded-full text-zinc-300 text-xs font-semibold">
                        {pickedItem.country}
                      </span>
                    )}
                  </div>

                  <h2 className="font-display text-2xl sm:text-3xl font-black text-white leading-tight">
                    {pickedItem.title}
                  </h2>

                  {pickedItem.origTitle && (
                    <p className="text-xs font-semibold text-zinc-400">{pickedItem.origTitle}</p>
                  )}

                  {/* Why this matches */}
                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-brand-crimson/15 border border-brand-ember/35 text-xs font-semibold text-amber-200">
                    <Sparkles className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" aria-hidden="true" />
                    <span>
                      {t.whatToWatch.whyMatch}: {reasonLabel}
                    </span>
                  </div>

                  {pickedItem.info && (
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-2xl">
                      {pickedItem.info}
                    </p>
                  )}

                  {/* Primary Watch CTA */}
                  <div className="flex items-center flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => openDetails(pickedItem.url || pickedItem.id, pickedItem)}
                      className="flex items-center gap-2.5 px-7 py-3.5 rounded-full btn-ember text-white font-display font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" aria-hidden="true" />
                      <span>{t.whatToWatch.watchNow}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openDetails(pickedItem.url || pickedItem.id, pickedItem)}
                      className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-white/[0.08] hover:bg-white/[0.16] text-white font-bold text-xs border border-white/[0.14] active:scale-95 cursor-pointer"
                    >
                      <Info className="w-4 h-4 text-brand-orange" aria-hidden="true" />
                      <span>{t.home.details}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFavorite(pickedItem)}
                      aria-label={isFav ? t.home.inFavorites : t.home.addToFavorites}
                      aria-pressed={isFav}
                      className={`p-3.5 rounded-full border active:scale-95 cursor-pointer ${
                        isFav
                          ? 'bg-brand-crimson/20 text-brand-crimson border-brand-crimson/55'
                          : 'bg-black/45 hover:bg-white/[0.14] text-zinc-200 border-white/[0.14]'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isFav ? 'fill-brand-crimson' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => openCollectionModal(pickedItem)}
                      aria-label={t.home.addToCollection}
                      className="p-3.5 rounded-full bg-black/45 hover:bg-white/[0.14] text-zinc-200 border border-white/[0.14] active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Secondary Recommender Controls: Suggest Another / Change Genre */}
                  <div className="flex items-center flex-wrap gap-3 pt-4 border-t border-white/[0.08]">
                    <button
                      type="button"
                      onClick={handleSuggestAnother}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/[0.1] hover:bg-white/[0.18] border border-white/[0.16] text-white text-xs font-extrabold active:scale-95 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
                      <span>{t.whatToWatch.suggestAnother}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleChangeGenreOrCategory}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.12] text-zinc-200 hover:text-white text-xs font-bold active:scale-95 cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
                      <span>{t.whatToWatch.changeGenre}</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
