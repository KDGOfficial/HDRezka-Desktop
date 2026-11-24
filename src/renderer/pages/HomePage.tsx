import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, RefreshCw, ShieldCheck, Clock, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { HeroBanner } from '../components/HeroBanner';
import { MediaSlider } from '../components/MediaSlider';
import { MediaCard } from '../components/MediaCard';
import { MediaItem } from '../../shared/types';
import {
  buildDynamicHeroSlides,
  buildPersonalizedRecommendations,
  getTopGenres,
  getTopTypes,
} from '../../shared/recommendations';
import { useMediaStore } from '../stores/useMediaStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';
import appLogo from '../assets/logo.png';

export const HomePage: React.FC = () => {
  const { setPage, watchHistory, loadWatchHistory, removeFromWatchHistory } = useMediaStore();
  const { settings, mirrorsStatus, verificationEpoch, verifyMirror, setInterestsModalOpen } = useSettingsStore();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'all' | 'continue'>('all');
  const [loading, setLoading] = useState(true);
  const [hero, setHero] = useState<MediaItem | null>(null);
  const [popular, setPopular] = useState<MediaItem[]>([]);
  const [newReleases, setNewReleases] = useState<MediaItem[]>([]);
  const [topMovies, setTopMovies] = useState<MediaItem[]>([]);
  const [topSeries, setTopSeries] = useState<MediaItem[]>([]);
  const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
  const [expected, setExpected] = useState<MediaItem[]>([]);
  const [tasteBoostItems, setTasteBoostItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    loadWatchHistory();
    loadHomeData();
  }, [settings.app.activeMirror, verificationEpoch]);

  // Fetch extra genre/type candidates aligned with the user's evolving taste profile
  const tasteKey = useMemo(() => {
    const topGenres = getTopGenres(settings.interests, 2).map((g) => g.id);
    const topTypes = getTopTypes(settings.interests).slice(0, 1).map((x) => x.type);
    return `${topTypes.join(',')}|${topGenres.join(',')}`;
  }, [settings.interests]);

  useEffect(() => {
    if (!window.api) return;
    const topGenres = getTopGenres(settings.interests, 2);
    const topTypes = getTopTypes(settings.interests);
    if (topGenres.length === 0 && topTypes.length === 0) {
      setTasteBoostItems([]);
      return;
    }

    let cancelled = false;
    const preferredType = topTypes[0]?.type || 'films';
    const primaryGenre = topGenres[0]?.id;

    window.api
      .getCatalog({
        type: preferredType,
        genre: primaryGenre,
        sort: 'popular',
        page: 1,
      })
      .then((res) => {
        if (!cancelled && res?.items?.length) {
          setTasteBoostItems(res.items.slice(0, 16));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [tasteKey, settings.app.activeMirror, verificationEpoch]);

  const loadHomeData = async () => {
    if (!window.api) return;
    setLoading(true);
    try {
      const data = await window.api.getHomeSections();
      setHero(data.hero);
      setPopular(data.popular || []);
      setNewReleases(data.newReleases || []);
      setTopMovies(data.topMovies || []);
      setTopSeries(data.topSeries || []);
      setRecommendations(data.recommendations || []);
      setExpected(data.expected || []);
      if (window.api?.prefetchDetails) {
        const warmup = [
          data.hero,
          ...(data.popular || []).slice(0, 4),
          ...(data.newReleases || []).slice(0, 3),
        ].filter(Boolean);
        if (warmup.length > 0) window.api.prefetchDetails(warmup);
      }
    } catch (err) {
      console.error('Failed to load home sections:', err);
    } finally {
      setLoading(false);
    }
  };

  const continueWatchingItems: MediaItem[] = watchHistory.slice(0, 24).map((h) => ({
    id: h.mediaId,
    historyId: h.id,
    title: h.title,
    origTitle: h.origTitle,
    poster: h.poster,
    type: h.type,
    watchProgress: h.percent,
    info:
      h.season && h.episode
        ? `${t.details.season} ${h.season}, ${t.details.episode} ${h.episode}`
        : `${h.percent}% ${t.history.watched}`,
    url: h.url || h.mediaId,
  }));

  const personalizedRecs = useMemo(
    () =>
      buildPersonalizedRecommendations(
        [...tasteBoostItems, ...recommendations, ...topMovies, ...topSeries, ...popular, ...newReleases],
        settings.interests,
        watchHistory,
        16
      ),
    [tasteBoostItems, recommendations, topMovies, topSeries, popular, newReleases, settings.interests, watchHistory]
  );

  const personalizedRecItems = useMemo(() => personalizedRecs.map((r) => r.item), [personalizedRecs]);

  const heroSlides = useMemo(
    () =>
      buildDynamicHeroSlides({
        hero,
        newReleases,
        expected,
        personalizedRecs,
        popular,
        maxSlides: 6,
      }),
    [hero, newReleases, expected, personalizedRecs, popular]
  );

  const primaryHeroItem = heroSlides[0]?.item || hero;

  const handleRemoveContinueItem = (item: MediaItem) => {
    const targetId = item.historyId || watchHistory.find((h) => h.mediaId === item.id)?.id;
    if (targetId) {
      removeFromWatchHistory(targetId);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[540px]">
        <div className="relative w-20 h-20 mb-5 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[3px] border-brand-crimson/20 border-t-brand-orange border-r-brand-crimson animate-spin" />
          <img
            src={appLogo}
            alt=""
            className="w-12 h-12 rounded-full object-cover shadow-glow"
          />
        </div>
        <span className="text-zinc-300 text-xs font-bold tracking-wider uppercase animate-pulse">
          {t.home.loadingCatalog}
        </span>
      </div>
    );
  }

  const hasAnyContent = hero || popular.length > 0 || newReleases.length > 0 || topMovies.length > 0;

  if (!hasAnyContent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[480px] text-center p-6 animate-fadeIn">
        <div className="w-16 h-16 rounded-3xl cinema-panel flex items-center justify-center text-brand-orange mb-4 shadow-elevated">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="font-display text-xl font-black text-white mb-2">{t.home.catalogUnavailable}</h2>
        <p className="text-xs text-zinc-400 max-w-md mb-6 leading-relaxed">
          {t.home.catalogUnavailableDesc}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadHomeData()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full btn-ember text-white text-xs font-extrabold active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t.home.retry}</span>
          </button>
          <button
            type="button"
            onClick={() => setPage('settings')}
            className="px-5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white text-xs font-bold active:scale-95 cursor-pointer"
          >
            {t.home.mirrorSettings}
          </button>
        </div>
      </div>
    );
  }

  const { homeSections } = settings;
  const activeMirrorStatus = mirrorsStatus.find((m) => m.url === settings.app.activeMirror);
  const hasPlaceholderPosters =
    popular.length > 0 && popular.every((p) => p.poster?.includes('unsplash.com'));
  const showVerifyBanner = Boolean(activeMirrorStatus?.needsVerification) || hasPlaceholderPosters;

  return (
    <div className="w-full pb-16 animate-fadeIn">
      {/* Home Screen Tabs: Showcase vs Continue Watching + Interests Button */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3 relative z-20">
        <div className="inline-flex items-center gap-1.5 p-1 rounded-full cinema-panel">
          <button
            type="button"
            aria-pressed={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold cursor-pointer ${
              activeTab === 'all' ? 'btn-ember text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.nav.home}</span>
          </button>

          <button
            type="button"
            aria-pressed={activeTab === 'continue'}
            onClick={() => setActiveTab('continue')}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold cursor-pointer ${
              activeTab === 'continue' ? 'btn-ember text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.home.continueWatching}</span>
            {continueWatchingItems.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                  activeTab === 'continue' ? 'bg-black/25 text-white' : 'bg-white/[0.08] text-zinc-300'
                }`}
              >
                {continueWatchingItems.length}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setInterestsModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full cinema-panel hover:border-brand-ember/50 text-xs font-bold text-zinc-200 hover:text-white cursor-pointer active:scale-95"
        >
          <Wand2 className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
          <span>{t.home.customizeInterests}</span>
        </button>
      </div>

      {activeTab === 'continue' ? (
        <section className="animate-fadeIn">
          <div className="flex items-center justify-between mb-6 pb-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <span
                className="w-1.5 h-5 rounded-full flex-shrink-0 shadow-glow-sm"
                style={{ background: 'linear-gradient(180deg, #FF124F 0%, #FF7A00 100%)' }}
              />
              <h2 className="font-display text-lg md:text-xl font-black text-white">
                {t.home.continueWatching}
              </h2>
            </div>
            {continueWatchingItems.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  if (window.api?.clearWatchHistory) {
                    await window.api.clearWatchHistory();
                    loadWatchHistory();
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.05] hover:bg-rose-950/50 border border-white/[0.09] hover:border-rose-500/40 text-xs font-bold text-zinc-300 hover:text-rose-300 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.history.clearHistory}</span>
              </button>
            )}
          </div>

          {continueWatchingItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-3xl cinema-panel flex items-center justify-center mb-4">
                <Clock className="w-7 h-7 text-brand-orange" />
              </div>
              <p className="font-display text-base font-black text-zinc-200">{t.history.emptyTitle}</p>
              <p className="text-xs text-zinc-400 mt-1.5 max-w-sm leading-relaxed">{t.history.emptyDesc}</p>
            </div>
          ) : (
            <div className="cinema-grid">
              {continueWatchingItems.map((item) => (
                <div key={item.historyId || item.id} className="flex justify-center">
                  <MediaCard item={item} showProgress={true} onRemove={handleRemoveContinueItem} />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Full-Bleed Dynamic Hero Showcase */}
          {homeSections.hero && primaryHeroItem && (
            <div className="mt-6">
              <HeroBanner item={primaryHeroItem} slides={heroSlides} />
            </div>
          )}

          {showVerifyBanner && (
            <div className="mb-8 p-4 rounded-2xl bg-amber-950/35 border border-amber-500/35 text-amber-200 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="leading-snug font-medium">{t.details.antiBotWarning}</span>
              </div>
              <button
                type="button"
                onClick={() => verifyMirror(settings.app.activeMirror)}
                className="px-4 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs flex-shrink-0 shadow-sm cursor-pointer active:scale-95"
              >
                {t.details.passVerification}
              </button>
            </div>
          )}

          {homeSections.continueWatching && continueWatchingItems.length > 0 && (
            <MediaSlider
              title={t.home.continueWatching}
              items={continueWatchingItems}
              onViewAll={() => setActiveTab('continue')}
              showProgress={true}
              onRemoveItem={handleRemoveContinueItem}
            />
          )}

          {homeSections.popular && popular.length > 0 && (
            <MediaSlider
              title={t.home.popular}
              items={popular}
              onViewAll={() => setPage('catalog')}
            />
          )}

          {homeSections.newReleases && newReleases.length > 0 && (
            <MediaSlider
              title={t.home.newReleases}
              items={newReleases}
              onViewAll={() => setPage('catalog')}
            />
          )}

          {homeSections.topMovies && topMovies.length > 0 && (
            <MediaSlider
              title={t.home.topMovies}
              items={topMovies}
              onViewAll={() => setPage('films')}
            />
          )}

          {homeSections.topSeries && topSeries.length > 0 && (
            <MediaSlider
              title={t.home.topSeries}
              items={topSeries}
              onViewAll={() => setPage('series')}
            />
          )}

          {homeSections.recommendations && personalizedRecItems.length > 0 && (
            <MediaSlider title={t.home.recommendations} items={personalizedRecItems} />
          )}

          {homeSections.expected && expected.length > 0 && (
            <MediaSlider title={t.home.expected} items={expected} />
          )}
        </>
      )}
    </div>
  );
};
