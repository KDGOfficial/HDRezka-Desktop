import React from 'react';
import { Play, Plus, Heart, Star, Info } from 'lucide-react';
import { MediaItem } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';

interface HeroBannerProps {
  item: MediaItem;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ item }) => {
  const { openDetails, favorites, toggleFavorite, openCollectionModal } = useMediaStore();
  const isFav = favorites.some((f) => f.mediaId === item.id);

  return (
    <div className="relative w-full h-[440px] rounded-3xl overflow-hidden mb-8 border border-white/10 shadow-2xl group select-none">
      {/* Background Image with Gradient Mask */}
      <img
        src={item.poster}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover object-center filter brightness-90 group-hover:scale-105 transition-transform duration-700"
      />

      <div className="absolute inset-0 bg-gradient-to-r from-dark-bg via-dark-bg/80 to-transparent w-full md:w-3/4" />
      <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-transparent to-transparent h-full" />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-end p-8 md:p-12 max-w-2xl text-left z-10">
        {/* Badges */}
        <div className="flex items-center space-x-2.5 mb-3">
          <span className="px-2.5 py-1 rounded-md bg-brand-red text-white text-xs font-bold uppercase tracking-wider shadow-glow">
            Премьера
          </span>
          {item.rating && (
            <span className="flex items-center px-2 py-0.5 rounded-md bg-white/10 backdrop-blur-md text-amber-400 text-xs font-bold border border-white/10">
              <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" />
              {item.rating.toFixed(1)}
            </span>
          )}
          {item.year && <span className="text-xs font-medium text-zinc-300">{item.year}</span>}
          {item.country && (
            <>
              <span className="text-zinc-600">•</span>
              <span className="text-xs font-medium text-zinc-300">{item.country}</span>
            </>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-3 line-clamp-2 drop-shadow-md">
          {item.title}
        </h1>

        {/* Info / Description */}
        <p className="text-sm md:text-base text-zinc-300 line-clamp-3 mb-6 max-w-xl font-normal leading-relaxed">
          {item.info || 'Смотрите в высоком качестве Full HD и 4K с лучшим переводом и озвучкой.'}
        </p>

        {/* Buttons */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => openDetails(item.url || item.id)}
            className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-sm shadow-glow transition-all active:scale-95"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Смотреть</span>
          </button>

          <button
            onClick={() => openDetails(item.url || item.id)}
            className="flex items-center space-x-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-semibold text-sm border border-white/10 transition-all"
          >
            <Info className="w-4 h-4" />
            <span>Подробнее</span>
          </button>

          <button
            onClick={() => toggleFavorite(item)}
            className={`p-3 rounded-xl bg-dark-surface/80 hover:bg-white/20 backdrop-blur-md border border-white/10 transition-all ${
              isFav ? 'text-brand-red' : 'text-zinc-300'
            }`}
            title={isFav ? 'В избранном' : 'Добавить в избранное'}
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-brand-red' : ''}`} />
          </button>

          <button
            onClick={() => openCollectionModal(item)}
            className="p-3 rounded-xl bg-dark-surface/80 hover:bg-white/20 backdrop-blur-md text-zinc-300 border border-white/10 transition-all"
            title="Добавить в коллекцию"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
