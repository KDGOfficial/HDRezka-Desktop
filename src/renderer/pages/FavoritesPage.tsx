import React, { useState, useEffect } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import { MediaCard } from '../components/MediaCard';
import { useMediaStore } from '../stores/useMediaStore';
import { ContentType, MediaItem } from '../../shared/types';

export const FavoritesPage: React.FC = () => {
  const { favorites, loadFavorites } = useMediaStore();
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    loadFavorites();
  }, []);

  const filtered = favorites.filter((f) => {
    if (filterType === 'all') return true;
    return f.type === filterType;
  });

  const filterTabs = [
    { id: 'all', label: 'Все' },
    { id: 'films', label: 'Фильмы' },
    { id: 'series', label: 'Сериалы' },
    { id: 'cartoons', label: 'Мультфильмы' },
    { id: 'animation', label: 'Аниме' },
  ];

  return (
    <div className="w-full pb-16 text-left select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-dark-border">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center">
            <Heart className="w-6 h-6 text-brand-red fill-brand-red mr-2" />
            Избранное
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {favorites.length} сохранено в вашей коллекции
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filterType === tab.id
                  ? 'bg-brand-red text-white shadow-glow'
                  : 'bg-dark-surface text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
          <Heart className="w-16 h-16 text-zinc-700 mb-3" />
          <p className="text-base font-semibold">Список избранного пуст</p>
          <p className="text-xs text-zinc-600 mt-1">
            Нажимайте на сердечко на карточках, чтобы добавить сюда фильмы и сериалы
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {filtered.map((fav) => {
            const asMediaItem: MediaItem = {
              id: fav.mediaId,
              title: fav.title,
              origTitle: fav.origTitle,
              poster: fav.poster,
              type: fav.type,
              year: fav.year,
              rating: fav.rating,
              url: fav.mediaId,
            };
            return (
              <div key={fav.mediaId} className="flex justify-center">
                <MediaCard item={asMediaItem} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
