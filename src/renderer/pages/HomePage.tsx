import React, { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { HeroBanner } from '../components/HeroBanner';
import { MediaSlider } from '../components/MediaSlider';
import { MediaItem } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';

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

  // Map watch history to MediaItem with progress
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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px]">
        <div className="relative w-14 h-14 mb-4">
          <div className="w-14 h-14 border-4 border-brand-red/20 border-t-brand-red rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-3 h-3 rounded-full bg-brand-red shadow-glow" />
          </div>
        </div>
        <span className="text-zinc-400 text-xs font-semibold tracking-wide animate-pulse">
          {t.home.loadingCatalog}
        </span>
      </div>
    );
  }

  const hasAnyContent = hero || popular.length > 0 || newReleases.length > 0 || topMovies.length > 0;

  if (!hasAnyContent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[460px] text-center p-6 animate-fadeIn">
        <div className="w-16 h-16 rounded-3xl bg-[#14151e] border border-white/10 flex items-center justify-center text-brand-red mb-4 shadow-elevated">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg md:text-xl font-black text-white mb-2">{t.home.catalogUnavailable}</h2>
        <p className="text-xs text-zinc-400 max-w-md mb-6 leading-relaxed font-normal">
          {t.home.catalogUnavailableDesc}
        </p>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => loadHomeData()}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white text-xs font-bold transition-all shadow-glow active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t.home.retry}</span>
          </button>
          <button
            onClick={() => setPage('settings')}
            className="px-5 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all active:scale-95"
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
      {showVerifyBanner && (
        <div className="mb-6 p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 min-w-0">
            <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="leading-snug">{t.details.antiBotWarning}</span>
          </div>
          <button
            onClick={() => verifyMirror(settings.app.activeMirror)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all flex-shrink-0 shadow-sm cursor-pointer active:scale-95"
          >
            {t.details.passVerification}
          </button>
        </div>
      )}

      {/* Hero Banner */}
      {homeSections.hero && hero && <HeroBanner item={hero} />}

      {/* Continue Watching Section */}
      {homeSections.continueWatching && continueWatchingItems.length > 0 && (
        <MediaSlider
          title={t.home.continueWatching}
          items={continueWatchingItems}
          onViewAll={() => setPage('history')}
          showProgress={true}
        />
      )}

      {/* Popular */}
      {homeSections.popular && popular.length > 0 && (
        <MediaSlider
          title={t.home.popular}
          items={popular}
          onViewAll={() => setPage('catalog')}
        />
      )}

      {/* New Releases */}
      {homeSections.newReleases && newReleases.length > 0 && (
        <MediaSlider
          title={t.home.newReleases}
          items={newReleases}
          onViewAll={() => setPage('catalog')}
        />
      )}

      {/* Top Movies */}
      {homeSections.topMovies && topMovies.length > 0 && (
        <MediaSlider
          title={t.home.topMovies}
          items={topMovies}
          onViewAll={() => setPage('films')}
        />
      )}

      {/* Top Series */}
      {homeSections.topSeries && topSeries.length > 0 && (
        <MediaSlider
          title={t.home.topSeries}
          items={topSeries}
          onViewAll={() => setPage('series')}
        />
      )}

      {/* Recommendations */}
      {homeSections.recommendations && recommendations.length > 0 && (
        <MediaSlider
          title={t.home.recommendations}
          items={recommendations}
        />
      )}

      {/* Expected */}
      {homeSections.expected && expected.length > 0 && (
        <MediaSlider
          title={t.home.expected}
          items={expected}
        />
      )}
    </div>
  );
};
