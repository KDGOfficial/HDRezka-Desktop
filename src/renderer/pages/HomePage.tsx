import React, { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { HeroBanner } from '../components/HeroBanner';
import { MediaSlider } from '../components/MediaSlider';
import { MediaItem } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';
import appLogo from '../assets/logo.png';

export const HomePage: React.FC = () => {
  const { setPage, watchHistory, loadWatchHistory } = useMediaStore();
  const { settings, mirrorsStatus, verificationEpoch, verifyMirror } = useSettingsStore();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [hero, setHero] = useState<MediaItem | null>(null);
  const [popular, setPopular] = useState<MediaItem[]>([]);
  const [newReleases, setNewReleases] = useState<MediaItem[]>([]);
  const [topMovies, setTopMovies] = useState<MediaItem[]>([]);
  const [topSeries, setTopSeries] = useState<MediaItem[]>([]);
  const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
  const [expected, setExpected] = useState<MediaItem[]>([]);

  useEffect(() => {
    loadWatchHistory();
    loadHomeData();
  }, [settings.app.activeMirror, verificationEpoch]);

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
    } catch (err) {
      console.error('Failed to load home sections:', err);
    } finally {
      setLoading(false);
    }
  };

  const continueWatchingItems: MediaItem[] = watchHistory.slice(0, 12).map((h) => ({
    id: h.mediaId,
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

  const heroSlides = [...popular.slice(0, 3), ...newReleases.slice(0, 2)].filter((x) => Boolean(x?.poster));

  return (
    <div className="w-full pb-16 animate-fadeIn">
      {/* Full-Bleed Hero Showcase */}
      {homeSections.hero && hero && <HeroBanner item={hero} slides={heroSlides} />}

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
          onViewAll={() => setPage('history')}
          showProgress={true}
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

      {homeSections.recommendations && recommendations.length > 0 && (
        <MediaSlider title={t.home.recommendations} items={recommendations} />
      )}

      {homeSections.expected && expected.length > 0 && (
        <MediaSlider title={t.home.expected} items={expected} />
      )}
    </div>
  );
};
