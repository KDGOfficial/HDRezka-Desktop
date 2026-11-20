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
      {/* Ambient Blurred Backdrop Layer — eliminates low-res pixelation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        <img
          src={item.backdrop || item.poster}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover object-center filter blur-3xl scale-125 opacity-40 brightness-75 transition-opacity duration-700"
        />
      </div>

      {/* Cinematic Multi-Stop Ambient Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#08080c] via-[#08080c]/90 via-55% to-transparent w-full z-0 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#08080c] via-transparent to-black/30 z-0 pointer-events-none" />

      {/* Content Container */}
      <div className="relative w-full h-full flex items-center justify-between z-10 px-6 sm:px-10 md:px-12 py-8">
        {/* Left: Metadata & Action Buttons */}
        <div className="max-w-xl md:max-w-2xl flex flex-col justify-end text-left h-full flex-1">
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

        {/* Right: Crisp, High-Quality Vertical Poster Card in Natural Proportions */}
        <div className="hidden sm:flex relative flex-shrink-0 items-center justify-center pl-6">
          <div
            className="relative cursor-pointer group/card transition-transform duration-500 hover:scale-[1.03]"
            onClick={() => openDetails(item.url || item.id, item)}
            title={item.title}
          >
            <img
              src={item.poster}
              alt={item.title}
              className="w-48 md:w-56 lg:w-64 h-[320px] md:h-[360px] object-cover rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-white/15 ring-1 ring-white/10"
              loading="eager"
            />
            {/* Soft inner vignette and play button on hover */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-brand-red/90 flex items-center justify-center shadow-glow border border-white/20">
                <Play className="w-6 h-6 fill-white text-white ml-0.5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
