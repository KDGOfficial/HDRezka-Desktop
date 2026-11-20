import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { MediaCard } from '../components/MediaCard';
import { useMediaStore } from '../stores/useMediaStore';
import { ContentType, MediaItem } from '../../shared/types';
import { useTranslation } from '../i18n';

export const FavoritesPage: React.FC = () => {
  const { favorites, loadFavorites } = useMediaStore();
  const { t } = useTranslation();
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    loadFavorites();
  }, []);

  const filtered = favorites.filter((f) => {
    if (filterType === 'all') return true;
    return f.type === filterType;
  });

  const filterTabs = [
    { id: 'all', label: t.favorites.all },
    { id: 'films', label: t.favorites.films },
    { id: 'series', label: t.favorites.series },
    { id: 'cartoons', label: t.favorites.cartoons },
    { id: 'animation', label: t.favorites.animation },
  ];

  return (
    <div className="w-full pb-16 text-left select-none animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-5 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center">
            <Heart className="w-6 h-6 text-brand-red fill-brand-red mr-2.5" />
            {t.favorites.title}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {favorites.length} {t.favorites.savedCount}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterType === tab.id
                  ? 'bg-gradient-to-r from-brand-red to-orange-600 text-white shadow-glow'
                  : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-28 text-zinc-500">
          <Heart className="w-16 h-16 text-zinc-700 mb-3" />
          <p className="text-base font-bold text-zinc-400">{t.favorites.emptyTitle}</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm text-center leading-relaxed">
            {t.favorites.emptyDesc}
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
