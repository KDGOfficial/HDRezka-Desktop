import React from 'react';
import { Play, Plus, Heart, Star, Info } from 'lucide-react';
import { MediaItem } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { useTranslation } from '../i18n';

interface HeroBannerProps {
  item: MediaItem;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ item }) => {
  const { openDetails, favorites, toggleFavorite, openCollectionModal } = useMediaStore();
  const { t } = useTranslation();
  const isFav = favorites.some((f) => f.mediaId === item.id);

  return (
    <div className="relative w-full h-[450px] rounded-3xl overflow-hidden mb-10 border border-white/10 shadow-elevated group select-none">
      {/* Background Poster Image */}
      <img
        src={item.poster}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover object-center filter brightness-90 group-hover:scale-105 transition-transform duration-700"
      />

      {/* Cinematic Multi-Stop Ambient Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#08080c] via-[#08080c]/80 to-transparent w-full md:w-3/4" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#08080c] via-transparent to-transparent h-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-end p-8 md:p-12 max-w-2xl text-left z-10">
        {/* Badges */}
        <div className="flex items-center space-x-2.5 mb-3 flex-wrap gap-y-1.5">
          <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-brand-red to-orange-600 text-white text-[11px] font-black uppercase tracking-wider shadow-glow">
            {t.home.premiere}
          </span>
          {item.rating && (
            <span className="flex items-center px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-amber-400 text-xs font-bold border border-amber-500/20">
              <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" />
              {item.rating.toFixed(1)}
            </span>
          )}
          {item.year && (
            <span className="px-2 py-0.5 rounded-lg bg-white/10 backdrop-blur-md text-zinc-300 text-xs font-semibold">
              {item.year}
            </span>
          )}
          {item.country && (
            <span className="px-2 py-0.5 rounded-lg bg-white/10 backdrop-blur-md text-zinc-300 text-xs font-semibold">
              {item.country}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-3 line-clamp-2 drop-shadow-lg">
          {item.title}
        </h1>

        {/* Info / Description */}
        <p className="text-xs md:text-sm text-zinc-300 line-clamp-3 mb-6 max-w-xl font-normal leading-relaxed drop-shadow">
          {item.info || 'HDRezka Desktop — смотрите в высоком качестве Full HD и 4K с лучшим переводом и озвучкой.'}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <button
            onClick={() => openDetails(item.url || item.id, item)}
            className="flex items-center space-x-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-red via-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white font-black text-xs shadow-glow transition-all active:scale-95"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{t.home.watch}</span>
          </button>

          <button
            onClick={() => openDetails(item.url || item.id, item)}
            className="flex items-center space-x-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-semibold text-xs border border-white/10 transition-all active:scale-95"
          >
            <Info className="w-4 h-4" />
            <span>{t.home.details}</span>
          </button>

          <button
            onClick={() => toggleFavorite(item)}
            className={`p-3 rounded-2xl bg-black/40 hover:bg-white/20 backdrop-blur-md border border-white/10 transition-all active:scale-95 ${
              isFav ? 'text-brand-red border-brand-red/40' : 'text-zinc-300'
            }`}
            title={isFav ? t.home.inFavorites : t.home.addToFavorites}
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-brand-red' : ''}`} />
          </button>

          <button
            onClick={() => openCollectionModal(item)}
            className="p-3 rounded-2xl bg-black/40 hover:bg-white/20 backdrop-blur-md text-zinc-300 border border-white/10 transition-all active:scale-95"
            title={t.home.addToCollection}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
