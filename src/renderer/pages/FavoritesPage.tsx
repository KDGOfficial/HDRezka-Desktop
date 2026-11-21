import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { MediaCard } from '../components/MediaCard';
import { useMediaStore } from '../stores/useMediaStore';
import { MediaItem } from '../../shared/types';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-5 border-b border-white/[0.06]">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <span className="w-9 h-9 rounded-2xl play-squircle flex items-center justify-center flex-shrink-0">
              <Heart className="w-4 h-4 text-white fill-white" />
            </span>
            <span>{t.favorites.title}</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1.5">
            {favorites.length} {t.favorites.savedCount}
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filterType === tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer ${
                filterType === tab.id
                  ? 'btn-ember text-white'
                  : 'bg-white/[0.05] text-zinc-300 hover:text-white hover:bg-white/[0.1] border border-white/[0.08]'
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
          <div className="w-16 h-16 rounded-3xl cinema-panel flex items-center justify-center mb-4">
            <Heart className="w-7 h-7 text-brand-crimson" />
          </div>
          <p className="font-display text-base font-black text-zinc-200">{t.favorites.emptyTitle}</p>
          <p className="text-xs text-zinc-400 mt-1.5 max-w-sm text-center leading-relaxed">
            {t.favorites.emptyDesc}
          </p>
        </div>
      ) : (
        <div className="cinema-grid">
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
