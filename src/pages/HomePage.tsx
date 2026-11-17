import React, { useState, useEffect } from 'react';
import { HeroBanner } from '../components/home/HeroBanner';
import { ContentRow } from '../components/home/ContentRow';
import { MediaItem } from '../types/media';
import { WatchHistoryItem } from '../types/database';
import {
  getHeroItems,
  getPopular,
  getNewReleases,
  getWatchHistory,
} from '../services/api';
import { useSettingsStore } from '../stores/settingsStore';
import { useNavigationStore } from '../stores/navigationStore';

export const HomePage: React.FC = () => {
  const [heroItems, setHeroItems] = useState<MediaItem[]>([]);
  const [popularMovies, setPopularMovies] = useState<MediaItem[]>([]);
  const [newReleases, setNewReleases] = useState<MediaItem[]>([]);
  const [popularSeries, setPopularSeries] = useState<MediaItem[]>([]);
  const [animeItems, setAnimeItems] = useState<MediaItem[]>([]);
  const [cartoonsItems, setCartoonsItems] = useState<MediaItem[]>([]);
  const [historyItems, setHistoryItems] = useState<WatchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { settings } = useSettingsStore();
  const { setActiveTab } = useNavigationStore();

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    Promise.all([
      getHeroItems(),
      getPopular('movie'),
      getNewReleases('movie'),
      getPopular('series'),
      getPopular('anime'),
      getPopular('cartoons'),
      getWatchHistory(),
    ]).then(([hero, movies, releases, series, anime, cartoons, hist]) => {
      if (!mounted) return;
      setHeroItems(hero);
      setPopularMovies(movies);
      setNewReleases(releases);
      setPopularSeries(series);
      setAnimeItems(anime);
      setCartoonsItems(cartoons);
      setHistoryItems(hist);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Map history progress to media items for continue watching
  const continueItems: MediaItem[] = historyItems
    .filter((h) => !h.completed)
    .map((h) => ({
      id: h.mediaId,
      title: h.title,
      url: `/watch/${h.mediaId}`,
      poster: h.poster,
      year: 2024,
      genres: [h.episodeTitle || (h.type === 'series' ? 'Сериал' : 'Фильм')],
      type: h.type,
    }));

  const progressMap: Record<string, number> = {};
  historyItems.forEach((h) => {
    progressMap[h.mediaId] = h.percentage;
  });

  const { homeSections } = settings;

  return (
    <div className="space-y-8 pb-16 animate-fade-in">
      {/* Hero Section */}
      <HeroBanner items={heroItems} />

      {/* Continue Watching Row */}
      {homeSections.continueWatching && continueItems.length > 0 && (
        <ContentRow
          title="Продолжить просмотр"
          items={continueItems}
          isLoading={isLoading}
          onViewAll={() => setActiveTab('continue')}
          size={settings.cardSize}
          progressMap={progressMap}
        />
      )}

      {/* Popular Movies Row */}
      {homeSections.popular && (
        <ContentRow
          title="Популярное сейчас"
          items={popularMovies}
          isLoading={isLoading}
          onViewAll={() => setActiveTab('movies')}
          size={settings.cardSize}
        />
      )}

      {/* New Releases Row */}
      {homeSections.newReleases && (
        <ContentRow
          title="Новинки кино"
          items={newReleases}
          isLoading={isLoading}
          onViewAll={() => setActiveTab('movies')}
          size={settings.cardSize}
        />
      )}

      {/* New Series Row */}
      {homeSections.newSeries && (
        <ContentRow
          title="Лучшие сериалы"
          items={popularSeries}
          isLoading={isLoading}
          onViewAll={() => setActiveTab('series')}
          size={settings.cardSize}
        />
      )}

      {/* Anime Row */}
      {homeSections.anime && (
        <ContentRow
          title="Популярное аниме"
          items={animeItems}
          isLoading={isLoading}
          onViewAll={() => setActiveTab('anime')}
          size={settings.cardSize}
        />
      )}

      {/* Cartoons Row */}
      {homeSections.cartoons && (
        <ContentRow
          title="Мультфильмы"
          items={cartoonsItems}
          isLoading={isLoading}
          onViewAll={() => setActiveTab('cartoons')}
          size={settings.cardSize}
        />
      )}
    </div>
  );
};
