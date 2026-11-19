import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { HeroBanner } from '../components/HeroBanner';
import { MediaSlider } from '../components/MediaSlider';
import { MediaItem } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { useSettingsStore } from '../stores/useSettingsStore';

export const HomePage: React.FC = () => {
  const { setPage, watchHistory, loadWatchHistory } = useMediaStore();
  const { settings } = useSettingsStore();

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
  }, [settings.app.activeMirror]);

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
  const continueWatchingItems: MediaItem[] = watchHistory.slice(0, 10).map((h) => ({
    id: h.mediaId,
    title: h.title,
    origTitle: h.origTitle,
    poster: h.poster,
    type: h.type,
    watchProgress: h.percent,
    info: h.season && h.episode ? `Сезон ${h.season}, Серия ${h.episode}` : `${h.percent}% просмотрено`,
    url: h.mediaId,
  }));

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px]">
        <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-zinc-400 text-sm">Загрузка каталога HDRezka...</span>
      </div>
    );
  }

  const hasAnyContent = hero || popular.length > 0 || newReleases.length > 0 || topMovies.length > 0;

  if (!hasAnyContent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[450px] text-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-dark-surface border border-white/10 flex items-center justify-center text-brand-red mb-4 shadow-card">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Каталог временно недоступен</h2>
        <p className="text-xs text-zinc-400 max-w-md mb-6 leading-relaxed">
          Текущее зеркало заблокировано или не отвечает. Проверьте интернет-соединение или выберите другое зеркало в настройках.
        </p>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => loadHomeData()}
            className="px-5 py-2.5 rounded-xl bg-brand-red hover:bg-brand-redHover text-white text-xs font-bold transition-all shadow-glow"
          >
            Повторить попытку
          </button>
          <button
            onClick={() => setPage('settings')}
            className="px-5 py-2.5 rounded-xl bg-dark-surface hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all"
          >
            Настройки зеркал
          </button>
        </div>
      </div>
    );
  }

  const { homeSections } = settings;

  return (
    <div className="w-full pb-16">
      {/* Hero Banner */}
      {homeSections.hero && hero && <HeroBanner item={hero} />}

      {/* Continue Watching Section */}
      {homeSections.continueWatching && continueWatchingItems.length > 0 && (
        <MediaSlider
          title="Продолжить просмотр"
          items={continueWatchingItems}
          onViewAll={() => setPage('history')}
          showProgress={true}
        />
      )}

      {/* Popular */}
      {homeSections.popular && popular.length > 0 && (
        <MediaSlider
          title="Популярное сейчас"
          items={popular}
          onViewAll={() => setPage('catalog')}
        />
      )}

      {/* New Releases */}
      {homeSections.newReleases && newReleases.length > 0 && (
        <MediaSlider
          title="Свежие новинки"
          items={newReleases}
          onViewAll={() => setPage('catalog')}
        />
      )}

      {/* Top Movies */}
      {homeSections.topMovies && topMovies.length > 0 && (
        <MediaSlider
          title="Лучшие фильмы"
          items={topMovies}
          onViewAll={() => setPage('films')}
        />
      )}

      {/* Top Series */}
      {homeSections.topSeries && topSeries.length > 0 && (
        <MediaSlider
          title="Популярные сериалы"
          items={topSeries}
          onViewAll={() => setPage('series')}
        />
      )}

      {/* Recommendations */}
      {homeSections.recommendations && recommendations.length > 0 && (
        <MediaSlider
          title="Рекомендуем к просмотру"
          items={recommendations}
        />
      )}

      {/* Expected */}
      {homeSections.expected && expected.length > 0 && (
        <MediaSlider
          title="Скоро на HDRezka"
          items={expected}
        />
      )}
    </div>
  );
};
