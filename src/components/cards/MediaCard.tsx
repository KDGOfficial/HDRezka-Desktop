import React, { useState, useEffect } from 'react';
import { Play, Heart, Info, Star } from 'lucide-react';
import { MediaItem } from '../../types/media';
import { useNavigationStore } from '../../stores/navigationStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { isFavorite, toggleFavorite } from '../../services/api';

interface MediaCardProps {
  item: MediaItem;
  size?: 'small' | 'medium' | 'large';
  progressPercentage?: number;
  onSelect?: (item: MediaItem) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  size = 'medium',
  progressPercentage,
  onSelect,
}) => {
  const { openDetails, startPlayback } = useNavigationStore();
  const { notify } = useNotificationStore();
  const [favorite, setFavorite] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let mounted = true;
    isFavorite(item.id).then((fav) => {
      if (mounted) setFavorite(fav);
    });
    return () => {
      mounted = false;
    };
  }, [item.id]);

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = await toggleFavorite(item);
    setFavorite(next);
    notify({
      type: next ? 'success' : 'info',
      title: next ? 'Добавлено в избранное' : 'Удалено из избранного',
      message: item.title,
      duration: 2000,
    });
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    startPlayback(item);
  };

  const handleDetailsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(item);
    } else {
      openDetails(item);
    }
  };

  const sizeClasses = {
    small: 'w-36 h-56 text-xs',
    medium: 'w-44 h-68 text-sm',
    large: 'w-56 h-84 text-base',
  }[size];

  const typeLabels: Record<string, string> = {
    movie: 'Фильм',
    series: 'Сериал',
    cartoon: 'Мультфильм',
    anime: 'Аниме',
    show: 'Шоу',
  };

  const posterFallback = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80';

  return (
    <div
      onClick={handleDetailsClick}
      className={`group relative rounded-xl overflow-hidden bg-[#1D1F26] border border-[#292B32]/70 cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-black/70 hover:border-zinc-500/40 shrink-0 select-none flex flex-col ${sizeClasses}`}
    >
      {/* Poster Image */}
      <div className="relative w-full flex-1 overflow-hidden bg-[#141519]">
        {!imgLoaded && !imgError && (
          <div className="absolute inset-0 bg-zinc-800/40 animate-pulse" />
        )}
        <img
          src={imgError ? posterFallback : item.poster}
          alt={item.title}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgError(true);
            setImgLoaded(true);
          }}
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
          {item.rating !== undefined && item.rating > 0 && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[11px] font-bold text-amber-400 border border-amber-500/20 shadow-md">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{item.rating.toFixed(1)}</span>
            </div>
          )}

          <div className="ml-auto px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-medium text-zinc-300 border border-white/10 uppercase tracking-wider">
            {typeLabels[item.type] || item.type}
          </div>
        </div>

        {/* Watch Progress Bar */}
        {progressPercentage !== undefined && progressPercentage > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60 z-10">
            <div
              className="h-full bg-[#E50914]"
              style={{ width: `${Math.min(100, progressPercentage)}%` }}
            />
          </div>
        )}

        {/* Hover Quick Actions Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 z-20">
          <div className="flex items-center justify-between">
            <button
              onClick={handlePlayClick}
              title="Смотреть сейчас"
              className="w-10 h-10 rounded-full bg-[#E50914] text-white flex items-center justify-center shadow-lg shadow-red-900/40 hover:scale-110 active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </button>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleFavoriteClick}
                title={favorite ? 'Удалить из избранного' : 'В избранное'}
                className={`p-2 rounded-full backdrop-blur-md transition-all cursor-pointer ${
                  favorite
                    ? 'bg-[#E50914] text-white'
                    : 'bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80'
                }`}
              >
                <Heart className={`w-4 h-4 ${favorite ? 'fill-current' : ''}`} />
              </button>

              <button
                onClick={handleDetailsClick}
                title="Подробнее"
                className="p-2 rounded-full bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-white backdrop-blur-md transition-all cursor-pointer"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Card Footer Info */}
      <div className="p-2.5 bg-[#17181D] flex flex-col justify-between shrink-0">
        <h4 className="font-semibold text-zinc-100 truncate text-xs leading-tight group-hover:text-[#E50914] transition-colors" title={item.title}>
          {item.title}
        </h4>
        <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-1">
          <span>{item.year || '—'}</span>
          {item.genres && item.genres.length > 0 && (
            <span className="truncate max-w-[90px] text-zinc-500" title={item.genres.join(', ')}>
              {item.genres[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
