import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Info,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  EyeOff,
  Flame,
  Brain,
  Moon,
  Zap,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  History,
} from 'lucide-react';
import { ContentType, MediaItem } from '../../shared/types';
import { GENRES } from '../../shared/constants';
import {
  EnrichedTitleSignal,
  InteractiveFeedbackAction,
  InteractiveRecommendation,
  InteractiveSessionState,
  MOOD_PRESETS,
  MoodId,
  analyzeUserTaste,
  applyInteractiveFeedback,
  createEmptyInteractiveSession,
  rankInteractiveRecommendations,
} from '../../shared/recommendations';
import { useMediaStore } from '../stores/useMediaStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';
import { useLocalizedTitle } from '../hooks/useLocalizedTitle';
import appLogo from '../assets/logo.png';

const DISMISSED_STORAGE_KEY = 'hdrezka_wtw_dismissed_v1';
const MAX_PERSISTED_DISMISSED = 200;

// Module-level cache so revisiting the tab doesn't re-fetch details for the same watched titles
const detailsSignalCache = new Map<string, EnrichedTitleSignal>();

function loadPersistedDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  } catch {
    return [];
  }
}

function savePersistedDismissed(ids: string[]): void {
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(ids.slice(-MAX_PERSISTED_DISMISSED)));
  } catch {}
}

const CATEGORY_OPTIONS: Array<{
  id: ContentType | 'auto';
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'auto', icon: Wand2 },
  { id: 'films', icon: Film },
  { id: 'series', icon: Tv },
  { id: 'cartoons', icon: Smile },
  { id: 'animation', icon: Sparkles },
];

const MOOD_OPTIONS: Array<{
  id: MoodId;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'auto', icon: Sparkles },
  { id: 'adrenaline', icon: Zap },
  { id: 'relax', icon: Smile },
  { id: 'mindbend', icon: Brain },
  { id: 'dark', icon: Moon },
  { id: 'fresh', icon: Flame },
];

export const WhatToWatchPage: React.FC = () => {
  const { openDetails, favorites, toggleFavorite, openCollectionModal, watchHistory } = useMediaStore();
  const { settings, setInterestsModalOpen, recordTasteSignal } = useSettingsStore();
  const { t, translateGenre } = useTranslation();

  const [selectedCategory, setSelectedCategory] = useState<ContentType | 'auto'>('auto');
  const [selectedMood, setSelectedMood] = useState<MoodId>('auto');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [showGenresDrawer, setShowGenresDrawer] = useState(false);

  const [enrichedMap, setEnrichedMap] = useState<Record<string, EnrichedTitleSignal>>(() =>
    Object.fromEntries(detailsSignalCache.entries())
  );
  const [enrichingHistory, setEnrichingHistory] = useState(false);

  const [pool, setPool] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allSeenNotice, setAllSeenNotice] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [spotlightOverrideId, setSpotlightOverrideId] = useState<string | null>(null);

  const [session, setSession] = useState<InteractiveSessionState>(() =>
    createEmptyInteractiveSession(loadPersistedDismissed())
  );
  const [skippedIds, setSkippedIds] = useState<string[]>([]);

  const pageRef = useRef<number>(1);
  const requestSeqRef = useRef<number>(0);
  const feedbackTimerRef = useRef<number | null>(null);

  const selectableGenres = useMemo(() => GENRES.filter((g) => g.id !== ''), []);

  // 1. Live analysis of what the user watches (watchHistory + favorites + adaptive profile + enriched details)
  const analysis = useMemo(
    () =>
      analyzeUserTaste({
        watchHistory,
        favorites,
        profile: settings.interests,
        enrichedDetailsMap: enrichedMap,
      }),
    [watchHistory, favorites, settings.interests, enrichedMap]
  );

  // 2. Background enrichment of top 3 watched/favorited titles to learn their exact genres & "similar" movies
  useEffect(() => {
    if (!window.api?.getDetails) return;
    const targets = analysis.recentAnchors
      .slice(0, 3)
      .filter((a) => !detailsSignalCache.has(a.id) && (!a.url || !detailsSignalCache.has(a.url)));

    if (targets.length === 0) return;

    let cancelled = false;
    setEnrichingHistory(true);

    Promise.all(
      targets.map(async (anchor) => {
        try {
          const details = await window.api.getDetails(anchor.url || anchor.id);
          if (!details) return;
          const signal: EnrichedTitleSignal = {
            id: anchor.id,
            title: details.title || anchor.title,
            genres: details.genres || [],
            year: details.year,
            rating: details.ratingImdb || details.ratingKp || details.ratingRezka,
            type: details.type || anchor.type,
            similar: Array.isArray(details.similar) ? details.similar.slice(0, 12) : [],
          };
          detailsSignalCache.set(anchor.id, signal);
          if (anchor.url) detailsSignalCache.set(anchor.url, signal);
        } catch {
          // Non-fatal: keep working with history metadata & catalog signals
        }
      })
    ).finally(() => {
      if (!cancelled) {
        setEnrichedMap(Object.fromEntries(detailsSignalCache.entries()));
        setEnrichingHistory(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [analysis.recentAnchors]);

  const showFeedbackToast = useCallback((message: string) => {
    setFeedbackBanner(message);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedbackBanner(null);
    }, 3400);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // 3. Fetch catalog candidates tailored to active category, mood, genre & top analyzed genres
  const fetchCandidateBatch = useCallback(
    async (
      category: ContentType | 'auto',
      mood: MoodId,
      genre: string,
      page: number,
      topGenreIds: string[],
      dominantType: ContentType,
      secondaryType?: ContentType
    ): Promise<MediaItem[]> => {
      if (!window.api?.getCatalog) return [];
      const requests: Array<Promise<MediaItem[]>> = [];

      const primaryType: ContentType = category === 'auto' ? dominantType : category;
      const moodGenres = MOOD_PRESETS[mood].genres;
      const targetedGenre = genre || moodGenres[0] || topGenreIds[0] || undefined;
      const secondGenre = !genre ? moodGenres[1] || topGenreIds[1] : undefined;

      // Primary personalized / filtered batch
      requests.push(
        window.api
          .getCatalog({
            type: primaryType,
            genre: targetedGenre,
            sort: mood === 'fresh' ? 'last' : 'popular',
            page,
          })
          .then((r) => r?.items || [])
          .catch(() => [])
      );

      // Secondary genre batch on page 1 for richer variety
      if (page === 1 && secondGenre && secondGenre !== targetedGenre) {
        requests.push(
          window.api
            .getCatalog({ type: primaryType, genre: secondGenre, sort: 'popular', page: 1 })
            .then((r) => r?.items || [])
            .catch(() => [])
        );
      }

      // Broad popular / fresh fallback in the chosen category
      if (targetedGenre) {
        requests.push(
          window.api
            .getCatalog({
              type: primaryType,
              sort: mood === 'fresh' ? 'last' : 'popular',
              page,
            })
            .then((r) => r?.items || [])
            .catch(() => [])
        );
      } else if (page === 1) {
        requests.push(
          window.api
            .getCatalog({ type: primaryType, sort: 'last', page: 1 })
            .then((r) => r?.items || [])
            .catch(() => [])
        );
      }

      // In 'auto' mode, also pull user's secondary favorite type (e.g. series alongside films)
      if (category === 'auto' && page === 1) {
        const altType =
          secondaryType && secondaryType !== primaryType
            ? secondaryType
            : primaryType === 'films'
              ? 'series'
              : 'films';
        requests.push(
          window.api
            .getCatalog({
              type: altType,
              genre: genre || moodGenres[0] || topGenreIds[0] || undefined,
              sort: mood === 'fresh' ? 'last' : 'popular',
              page: 1,
            })
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
          const key = (item.id || item.url || item.title || '').trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          merged.push(item);
        }
      }
      return merged;
    },
    []
  );

  // Trigger fresh candidate fetch when category, mood, or explicit genre changes
  const topGenreKey = analysis.topGenres
    .slice(0, 2)
    .map((g) => g.id)
    .join(',');
  const dominantType = analysis.dominantType;
  const secondaryType = analysis.topTypes[1]?.type;

  const loadInitialPool = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    setAllSeenNotice(false);
    setSpotlightOverrideId(null);
    pageRef.current = 1;

    try {
      const topIds = topGenreKey ? topGenreKey.split(',').filter(Boolean) : [];
      const items = await fetchCandidateBatch(
        selectedCategory,
        selectedMood,
        selectedGenre,
        1,
        topIds,
        dominantType,
        secondaryType
      );
      if (seq !== requestSeqRef.current) return;
      setPool(items);
      if (items.length === 0 && analysis.similarCandidates.length === 0) {
        setError(t.whatToWatch.noResults);
      }
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      console.error('[WhatToWatch] Failed to load candidates:', err);
      setError(t.whatToWatch.noResults);
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [
    selectedCategory,
    selectedMood,
    selectedGenre,
    topGenreKey,
    dominantType,
    secondaryType,
    fetchCandidateBatch,
    analysis.similarCandidates.length,
    t.whatToWatch.noResults,
  ]);

  useEffect(() => {
    loadInitialPool();
  }, [loadInitialPool]);

  const loadNextPage = useCallback(async () => {
    if (loadingMore || pageRef.current >= 4) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    try {
      const topIds = topGenreKey ? topGenreKey.split(',').filter(Boolean) : [];
      const more = await fetchCandidateBatch(
        selectedCategory,
        selectedMood,
        selectedGenre,
        nextPage,
        topIds,
        dominantType,
        secondaryType
      );
      pageRef.current = nextPage;
      if (more.length > 0) {
        setPool((prev) => {
          const existing = new Set(prev.map((i) => (i.id || i.url || '').toLowerCase()));
          const additions = more.filter((m) => {
            const k = (m.id || m.url || '').toLowerCase();
            return k && !existing.has(k);
          });
          return additions.length > 0 ? [...prev, ...additions] : prev;
        });
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, topGenreKey, selectedCategory, selectedMood, selectedGenre, dominantType, secondaryType, fetchCandidateBatch]);

  // 4. Rank all available candidates live using analyzed taste + mood + session reactions
  const excludedSet = useMemo(() => new Set(skippedIds), [skippedIds]);

  const rankedPicks = useMemo<InteractiveRecommendation[]>(
    () =>
      rankInteractiveRecommendations({
        candidates: pool,
        analysis,
        category: selectedCategory,
        genreOverride: selectedGenre || undefined,
        mood: selectedMood,
        watchHistory,
        session,
        excludedIds: excludedSet,
        limit: 24,
      }),
    [pool, analysis, selectedCategory, selectedGenre, selectedMood, watchHistory, session, excludedSet]
  );

  // Automatically prefetch next page when unseen deck gets low
  useEffect(() => {
    if (!loading && !loadingMore && pool.length > 0 && rankedPicks.length <= 3 && pageRef.current < 4) {
      loadNextPage();
    }
  }, [loading, loadingMore, pool.length, rankedPicks.length, loadNextPage]);

  // Determine active spotlight pick (either user-clicked runner-up or #1 ranked)
  const currentPick = useMemo<InteractiveRecommendation | null>(() => {
    if (rankedPicks.length === 0) return null;
    if (spotlightOverrideId) {
      const found = rankedPicks.find((r) => (r.item.id || r.item.url) === spotlightOverrideId);
      if (found) return found;
    }
    return rankedPicks[0];
  }, [rankedPicks, spotlightOverrideId]);

  const upNextPicks = useMemo<InteractiveRecommendation[]>(() => {
    if (!currentPick) return [];
    const currentKey = currentPick.item.id || currentPick.item.url;
    return rankedPicks.filter((r) => (r.item.id || r.item.url) !== currentKey).slice(0, 5);
  }, [rankedPicks, currentPick]);

  // 5. Interactive reaction handlers
  const handleReaction = useCallback(
    (action: InteractiveFeedbackAction) => {
      if (!currentPick) return;
      const item = currentPick.item;
      setSpotlightOverrideId(null);
      setAllSeenNotice(false);

      setSession((prev) => {
        const next = applyInteractiveFeedback(prev, item, action);
        if (action === 'not_for_me' || action === 'already_seen') {
          savePersistedDismissed(next.dismissedIds);
        }
        return next;
      });

      if (action === 'more_like_this') {
        recordTasteSignal(item, 'view');
        showFeedbackToast(t.whatToWatch.feedbackMore.replace('{title}', item.title));
      } else if (action === 'not_for_me') {
        showFeedbackToast(t.whatToWatch.feedbackNotForMe.replace('{title}', item.title));
      } else if (action === 'already_seen') {
        showFeedbackToast(t.whatToWatch.feedbackSeen.replace('{title}', item.title));
      }
    },
    [currentPick, recordTasteSignal, showFeedbackToast, t.whatToWatch]
  );

  const handleSuggestAnother = useCallback(() => {
    if (!currentPick) {
      if (skippedIds.length > 0) {
        setSkippedIds([]);
        setAllSeenNotice(true);
      } else {
        loadInitialPool();
      }
      return;
    }
    setSpotlightOverrideId(null);
    const key = currentPick.item.id || currentPick.item.url;
    const url = currentPick.item.url;
    if (rankedPicks.length <= 1) {
      // Loop skipped items smoothly so user is never stuck
      setSkippedIds([]);
      setAllSeenNotice(true);
      return;
    }
    setAllSeenNotice(false);
    setSkippedIds((prev) => {
      const next = [...prev];
      if (key) next.push(key);
      if (url && url !== key) next.push(url);
      return next;
    });
  }, [currentPick, rankedPicks.length, skippedIds.length, loadInitialPool]);

  const handleResetHidden = useCallback(() => {
    savePersistedDismissed([]);
    setSession(createEmptyInteractiveSession([]));
    setSkippedIds([]);
    setSpotlightOverrideId(null);
    setAllSeenNotice(false);
  }, []);

  // Keyboard shortcuts for snappy desktop interaction
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }
      if (loading || !currentPick) return;

      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleReaction('not_for_me');
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSuggestAnother();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        handleReaction('more_like_this');
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        handleReaction('already_seen');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, currentPick, handleReaction, handleSuggestAnother]);

  const pickedItem = currentPick?.item;
  const pickedDisplayTitle = useLocalizedTitle(pickedItem?.title, pickedItem?.origTitle);
  const isFav = pickedItem ? favorites.some((f) => f.mediaId === pickedItem.id) : false;

  const reasonParts = useMemo(() => {
    if (!currentPick) return [];
    const parts: string[] = [];
    if (currentPick.similarToTitle) {
      parts.push(t.whatToWatch.similarTo.replace('{title}', currentPick.similarToTitle));
    }
    if (currentPick.matchedGenres.length > 0) {
      const names = currentPick.matchedGenres
        .slice(0, 2)
        .map((g) => translateGenre(g))
        .join(', ');
      parts.push(t.whatToWatch.matchedGenre.replace('{genres}', names));
    }
    if (currentPick.matchedMood && currentPick.matchedMood !== 'auto') {
      const moodTitle = t.whatToWatch.moods[currentPick.matchedMood];
      parts.push(t.whatToWatch.matchedMood.replace('{mood}', moodTitle));
    }
    if (parts.length === 0) {
      if (currentPick.matchedType) parts.push(t.whatToWatch.matchedTaste);
      else parts.push(t.whatToWatch.highRated);
    }
    return parts;
  }, [currentPick, t.whatToWatch, translateGenre]);

  const hiddenCount = session.dismissedIds.length;

  return (
    <div className="w-full max-w-5xl mx-auto pb-20 text-left select-none animate-fadeIn space-y-6">
      {/* Page Header */}
      <div className="pb-5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

        <div className="flex items-center flex-wrap gap-2 self-start sm:self-center">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={handleResetHidden}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.09] text-xs font-bold text-zinc-300 hover:text-white cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
              <span>
                {t.whatToWatch.resetSeen} ({hiddenCount})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setInterestsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full cinema-panel hover:border-brand-ember/50 text-xs font-bold text-zinc-200 hover:text-white cursor-pointer active:scale-95"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
            <span>{t.whatToWatch.editInterests}</span>
          </button>
        </div>
      </div>

      {/* Live Taste DNA Strip (Analyzed from watchHistory + favorites + interests) */}
      <section className="p-4 sm:p-5 rounded-3xl cinema-panel border border-white/[0.08] space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-brand-orange flex-shrink-0" aria-hidden="true" />
            <h2 className="font-display text-xs font-black uppercase tracking-[0.13em] text-zinc-200">
              {t.whatToWatch.tasteDnaTitle}
            </h2>
            {enrichingHistory && (
              <span className="text-[11px] font-semibold text-brand-orange animate-pulse">
                · {t.whatToWatch.analyzingHistory}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-400 tabular-nums">
            <span className="px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08]">
              {t.whatToWatch.tasteWatchedCount.replace('{count}', String(analysis.watchedCount))}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08]">
              {t.whatToWatch.tasteFavoritesCount.replace('{count}', String(analysis.favoritesCount))}
            </span>
          </div>
        </div>

        {analysis.hasHistorySignal ? (
          <div className="space-y-3">
            {/* Interactive Top Analyzed Genres with live affinity bars */}
            {analysis.topGenres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {analysis.topGenres.slice(0, 6).map((g) => {
                  const active = selectedGenre === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setSelectedGenre(active ? '' : g.id);
                        setSkippedIds([]);
                      }}
                      className={`group relative overflow-hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold cursor-pointer active:scale-95 ${
                        active
                          ? 'btn-ember border-transparent text-white'
                          : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.09] text-zinc-200 hover:text-white'
                      }`}
                    >
                      <span>{translateGenre(g.id)}</span>
                      <span
                        className={`w-10 h-1.5 rounded-full overflow-hidden ${
                          active ? 'bg-black/30' : 'bg-white/[0.1]'
                        }`}
                        aria-hidden="true"
                      >
                        <span
                          className={`block h-full rounded-full ${
                            active ? 'bg-white' : 'bg-gradient-to-r from-brand-crimson to-brand-orange'
                          }`}
                          style={{ width: `${g.sharePercent}%` }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Recent watched/favorited anchor titles */}
            {analysis.recentAnchors.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-zinc-400">
                <span className="font-bold text-zinc-300 mr-1">{t.whatToWatch.tasteBasedOn}:</span>
                {analysis.recentAnchors.map((anchor) => (
                  <button
                    key={anchor.id}
                    type="button"
                    onClick={() =>
                      openDetails(anchor.url || anchor.id, {
                        id: anchor.id,
                        title: anchor.title,
                        poster: anchor.poster,
                        type: anchor.type,
                        url: anchor.url || anchor.id,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.07] text-zinc-200 hover:text-white font-semibold cursor-pointer active:scale-95"
                  >
                    {anchor.poster && (
                      <img src={anchor.poster} alt="" className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0" />
                    )}
                    <span className="max-w-[160px] truncate">{anchor.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-400 leading-relaxed">{t.whatToWatch.tasteEmptyHint}</p>
        )}
      </section>

      {/* Interactive Filter Dock: Category + Mood + Optional Genre Drawer */}
      <section className="p-4 sm:p-5 rounded-3xl cinema-panel space-y-4">
        {/* Category Row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="wtw-snap-strip gap-2 pb-1 flex-1 min-w-0">
            {CATEGORY_OPTIONS.map((cat) => {
              const Icon = cat.icon;
              const active = selectedCategory === cat.id;
              const label =
                cat.id === 'auto' ? t.whatToWatch.categoryAuto : t.catalog.categories[cat.id];
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setSkippedIds([]);
                  }}
                  className={`wtw-snap-item flex-shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-extrabold cursor-pointer active:scale-95 ${
                    active
                      ? 'btn-ember border-transparent text-white'
                      : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.09] text-zinc-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-expanded={showGenresDrawer}
            onClick={() => setShowGenresDrawer((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-bold cursor-pointer active:scale-95 ${
              selectedGenre
                ? 'bg-brand-crimson/20 border-brand-ember/60 text-white'
                : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.09] text-zinc-300 hover:text-white'
            }`}
          >
            <span>{selectedGenre ? translateGenre(selectedGenre) : t.whatToWatch.changeGenre}</span>
            {showGenresDrawer ? (
              <ChevronUp className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Mood / Vibe Selector */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[10px] font-display font-black uppercase tracking-[0.14em] text-zinc-400 flex-shrink-0">
            {t.whatToWatch.moodLabel}:
          </span>
          <div className="wtw-snap-strip gap-1.5 pb-1 flex-1 min-w-0">
            {MOOD_OPTIONS.map((mood) => {
              const Icon = mood.icon;
              const active = selectedMood === mood.id;
              return (
                <button
                  key={mood.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedMood(mood.id);
                    setSkippedIds([]);
                  }}
                  className={`wtw-snap-item flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold cursor-pointer active:scale-95 ${
                    active
                      ? 'bg-brand-crimson/25 border-brand-ember text-white shadow-glow-sm'
                      : 'bg-white/[0.03] hover:bg-white/[0.09] border-white/[0.08] text-zinc-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-3 h-3 text-brand-orange flex-shrink-0" aria-hidden="true" />
                  <span>{t.whatToWatch.moods[mood.id]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Collapsible Genre Pills */}
        {showGenresDrawer && (
          <div className="pt-3 border-t border-white/[0.07] flex flex-wrap gap-1.5 animate-fadeIn">
            <button
              type="button"
              aria-pressed={selectedGenre === ''}
              onClick={() => {
                setSelectedGenre('');
                setSkippedIds([]);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer active:scale-95 ${
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
                  onClick={() => {
                    setSelectedGenre(active ? '' : g.id);
                    setSkippedIds([]);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer active:scale-95 ${
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
        )}
      </section>

      {/* Live Status / Feedback Banners */}
      {feedbackBanner && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-2.5 rounded-2xl bg-brand-crimson/15 border border-brand-ember/40 text-xs font-bold text-amber-200 flex items-center gap-2 animate-fadeIn"
        >
          <Sparkles className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" aria-hidden="true" />
          <span>{feedbackBanner}</span>
        </div>
      )}

      {allSeenNotice && (
        <div className="p-3.5 rounded-2xl bg-amber-950/35 border border-amber-500/35 text-amber-200 text-xs font-medium">
          {t.whatToWatch.allSeenNotice}
        </div>
      )}

      {/* Interactive Spotlight Recommendation Card */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-3xl cinema-panel">
          <div className="relative w-20 h-20 mb-5 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-[3px] border-brand-crimson/20 border-t-brand-orange border-r-brand-crimson animate-spin" />
            <img src={appLogo} alt="" className="w-12 h-12 rounded-full object-cover shadow-glow" />
          </div>
          <span className="text-zinc-300 text-xs font-bold tracking-wider uppercase animate-pulse text-center px-4">
            {t.whatToWatch.picking}
          </span>
        </div>
      ) : error || !pickedItem || !currentPick ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 rounded-3xl cinema-panel text-center">
          <AlertCircle className="w-10 h-10 text-brand-orange mb-3" aria-hidden="true" />
          <p className="text-sm font-bold text-white mb-5">{error || t.whatToWatch.noResults}</p>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button
              type="button"
              onClick={loadInitialPool}
              className="px-5 py-2.5 rounded-full btn-ember text-white text-xs font-extrabold cursor-pointer active:scale-95"
            >
              {t.whatToWatch.retry}
            </button>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={handleResetHidden}
                className="px-5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white text-xs font-bold cursor-pointer active:scale-95"
              >
                {t.whatToWatch.resetSeen}
              </button>
            )}
          </div>
        </div>
      ) : (
        <section
          key={pickedItem.id || pickedItem.url}
          className="cinema-player-surface wtw-card-enter relative rounded-3xl overflow-hidden border border-brand-ember/40 shadow-elevated"
        >
          {/* Atmospheric blurred backdrop */}
          <img
            src={pickedItem.poster}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-35 brightness-50 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B070A] via-[#0B070A]/90 to-[#0B070A]/55 pointer-events-none" />

          <div className="relative z-10 p-6 sm:p-9 flex flex-col md:flex-row items-center md:items-start gap-7 sm:gap-8">
            {/* Interactive Poster */}
            <button
              type="button"
              onClick={() => openDetails(pickedItem.url || pickedItem.id, pickedItem)}
              aria-label={`${t.whatToWatch.watchNow} ${pickedItem.title}`}
              className="wtw-poster-trigger w-52 sm:w-60 flex-shrink-0 group cursor-pointer rounded-[22px] p-[2px] bg-gradient-to-br from-white/30 via-brand-ember/55 to-brand-crimson/55 shadow-[0_24px_60px_rgba(0,0,0,0.9)] active:scale-[0.98]"
            >
              <div className="relative rounded-[20px] overflow-hidden bg-dark-surface">
                <img
                  src={pickedItem.poster}
                  alt={pickedItem.title}
                  className="w-full aspect-[2/3] object-cover group-hover:scale-105 transition-transform duration-500 block"
                />
                <div className="wtw-poster-overlay absolute inset-0 bg-black/45 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-[18px] play-squircle flex items-center justify-center">
                    <Play className="w-7 h-7 fill-white text-white ml-0.5" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </button>

            {/* Details, Match Explanation & Live Controls */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="flex items-center flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full btn-ember text-[10px] font-display font-black uppercase tracking-[0.14em] tabular-nums">
                  <Sparkles className="w-3 h-3 text-[#FFE29A]" aria-hidden="true" />
                  <span>{t.whatToWatch.matchBadge.replace('{percent}', String(currentPick.matchPercent))}</span>
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

                <span className="logo-pill px-2.5 py-1 rounded-full text-zinc-300 text-xs font-semibold">
                  {t.catalog.categories[pickedItem.type] || pickedItem.type}
                </span>

                {pickedItem.country && (
                  <span className="logo-pill px-2.5 py-1 rounded-full text-zinc-300 text-xs font-semibold">
                    {pickedItem.country}
                  </span>
                )}
              </div>

              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-black text-white leading-tight">
                  {pickedDisplayTitle || pickedItem.title}
                </h2>
                {pickedItem.origTitle && (
                  <p className="text-xs font-semibold text-zinc-400 mt-1">{pickedItem.origTitle}</p>
                )}
              </div>

              {/* Transparent Match Reason */}
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-brand-crimson/15 border border-brand-ember/35 text-xs font-semibold text-amber-200">
                <Wand2 className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" aria-hidden="true" />
                <span>
                  {t.whatToWatch.whyMatch}: {reasonParts.join(' · ')}
                </span>
              </div>

              {pickedItem.info && (
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-2xl">
                  {pickedItem.info}
                </p>
              )}

              {/* Primary Watch CTA Row */}
              <div className="flex items-center flex-wrap gap-3 pt-1">
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

              {/* Live Interactive Feedback Bar (trains the recommender immediately) */}
              <div className="pt-4 border-t border-white/[0.09] space-y-2.5">
                <div className="flex items-center flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleReaction('more_like_this')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-emerald-200 hover:text-white text-xs font-extrabold active:scale-95 cursor-pointer"
                  >
                    <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span>{t.whatToWatch.moreLikeThis}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleReaction('not_for_me')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-rose-200 hover:text-white text-xs font-extrabold active:scale-95 cursor-pointer"
                  >
                    <ThumbsDown className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                    <span>{t.whatToWatch.notForMe}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleReaction('already_seen')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.14] text-zinc-200 hover:text-white text-xs font-bold active:scale-95 cursor-pointer"
                  >
                    <EyeOff className="w-3.5 h-3.5 text-zinc-300" aria-hidden="true" />
                    <span>{t.whatToWatch.alreadySeen}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSuggestAnother}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.1] hover:bg-white/[0.18] border border-white/[0.18] text-white text-xs font-extrabold active:scale-95 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
                    <span>{t.whatToWatch.suggestAnother}</span>
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 font-medium">{t.whatToWatch.hotkeysHint}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Interactive "Up Next" Runner-Up Strip */}
      {!loading && upNextPicks.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h3 className="font-display text-sm font-black uppercase tracking-[0.12em] text-zinc-200">
              {t.whatToWatch.upNextTitle}
            </h3>
            <span className="text-[11px] text-zinc-400">{t.whatToWatch.upNextHint}</span>
          </div>

          <div
            className="wtw-snap-strip gap-3.5 pb-2"
            role="region"
            aria-label={t.whatToWatch.upNextTitle}
          >
            {upNextPicks.map((rec) => {
              const key = rec.item.id || rec.item.url;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSpotlightOverrideId(key)}
                  className="wtw-snap-item group flex-shrink-0 w-36 sm:w-40 rounded-2xl cinema-panel hover:border-brand-ember/60 p-2 text-left cursor-pointer cinema-card active:scale-95"
                >
                  <div className="relative rounded-xl overflow-hidden bg-dark-surface aspect-[2/3] mb-2">
                    <img
                      src={rec.item.poster}
                      alt={rec.item.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 block"
                    />
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full btn-ember text-[10px] font-display font-black tabular-nums">
                      {rec.matchPercent}%
                    </span>
                    {Boolean(rec.item.rating && rec.item.rating > 0) && (
                      <span className="absolute bottom-1.5 right-1.5 logo-pill px-1.5 py-0.5 rounded-full text-[10px] font-extrabold text-brand-gold tabular-nums inline-flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-brand-gold" aria-hidden="true" />
                        {rec.item.rating!.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-extrabold text-white group-hover:text-brand-orange transition-colors line-clamp-2 leading-snug">
                    {rec.item.title}
                  </div>
                  {rec.similarToTitle && (
                    <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                      ≈ {rec.similarToTitle}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
