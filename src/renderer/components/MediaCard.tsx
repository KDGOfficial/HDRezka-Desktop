import React from 'react';
import { Star, Heart, Play, Plus } from 'lucide-react';
import { MediaItem } from '../../shared/types';
import { getRatingColor } from '../../shared/utils';
import { useMediaStore } from '../stores/useMediaStore';

interface MediaCardProps {
  item: MediaItem;
  size?: 'small' | 'medium' | 'large';
  showProgress?: boolean;
}

export const MediaCard: React.FC<MediaCardProps> = ({ item, size = 'medium', showProgress = false }) => {
  const { openDetails, favorites, toggleFavorite, openCollectionModal } = useMediaStore();
  const isFav = favorites.some((f) => f.mediaId === item.id);

  const sizeClasses = {
    small: 'w-36 md:w-40',
    medium: 'w-44 md:w-48',
    large: 'w-52 md:w-60',
  }[size];

  const posterHeight = {
    small: 'h-52 md:h-56',
    medium: 'h-64 md:h-72',
    large: 'h-76 md:h-88',
  }[size];

  const handleCardClick = () => {
    openDetails(item.url || item.id, item);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(item);
  };

  const handleCollectionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openCollectionModal(item);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative flex flex-col cursor-pointer transition-card hover:scale-[1.03] select-none ${sizeClasses}`}
    >
      {/* Poster Container */}
      <div className={`relative w-full ${posterHeight} rounded-2xl overflow-hidden bg-dark-surface border border-white/5 shadow-card group-hover:shadow-glow group-hover:border-brand-red/40 transition-all`}>
        {item.poster ? (
          <img
            src={item.poster}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://via.placeholder.com/300x450/191A20/ffffff?text=HDREZKA';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-dark-surfaceLight font-semibold text-sm">
            Нет постера
          </div>
        )}

        {/* Gradient Overlay on Hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-dark-bg/90 via-dark-bg/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
          {/* Top badges */}
          <div className="flex justify-between items-start">
            {item.rating ? (
              <span className={`px-2 py-0.5 rounded-lg text-xs font-bold flex items-center space-x-1 ${getRatingColor(item.rating)}`}>
                <Star className="w-3 h-3 fill-current mr-0.5" />
                {item.rating.toFixed(1)}
              </span>
            ) : <span />}

            <div className="flex space-x-1">
              <button
                onClick={handleCollectionClick}
                className="p-1.5 rounded-lg bg-dark-surface/80 hover:bg-white/20 text-white transition-colors"
                title="В коллекцию"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleFavoriteClick}
                className={`p-1.5 rounded-lg bg-dark-surface/80 hover:bg-white/20 transition-colors ${
                  isFav ? 'text-brand-red fill-brand-red' : 'text-white'
                }`}
                title={isFav ? 'Удалить из избранного' : 'В избранное'}
              >
                <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-brand-red' : ''}`} />
              </button>
            </div>
          </div>

          {/* Center Play Icon */}
          <div className="self-center w-12 h-12 rounded-full bg-brand-red/90 text-white flex items-center justify-center shadow-glow transform scale-75 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 fill-white ml-0.5" />
          </div>

          {/* Bottom hover info */}
          <div className="text-left">
            {item.info && (
              <div className="text-[11px] font-medium text-zinc-300 line-clamp-1 mb-0.5">
                {item.info}
              </div>
            )}
            {item.genres && item.genres.length > 0 && (
              <div className="text-[10px] text-zinc-400 line-clamp-1">
                {item.genres.slice(0, 2).join(' • ')}
              </div>
            )}
          </div>
        </div>

        {/* Always visible Rating badge when not hovered */}
        {item.rating && (
          <div className="group-hover:opacity-0 transition-opacity absolute top-2 left-2">
            <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center ${getRatingColor(item.rating)}`}>
              <Star className="w-2.5 h-2.5 fill-current mr-1" />
              {item.rating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Watch Progress Bar */}
        {showProgress && item.watchProgress !== undefined && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
            <div
              className="h-full bg-brand-red"
              style={{ width: `${Math.min(100, Math.max(0, item.watchProgress))}%` }}
            />
          </div>
        )}
      </div>

      {/* Info Block */}
      <div className="mt-2.5 px-0.5 text-left">
        <h3 className="text-sm font-semibold text-white truncate group-hover:text-brand-red transition-colors">
          {item.title}
        </h3>
        <div className="flex items-center space-x-1.5 text-xs text-zinc-400 mt-0.5">
          {item.year && <span>{item.year}</span>}
          {item.year && item.country && <span>•</span>}
          {item.country && <span className="truncate">{item.country}</span>}
        </div>
      </div>
    </div>
  );
};
