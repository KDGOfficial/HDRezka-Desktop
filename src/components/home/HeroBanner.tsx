import React, { useState, useEffect } from 'react';
import { Play, Info, Heart, Star, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { MediaItem } from '../../types/media';
import { useNavigationStore } from '../../stores/navigationStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { isFavorite, toggleFavorite } from '../../services/api';

interface HeroBannerProps {
  items: MediaItem[];
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ items }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const { openDetails, startPlayback } = useNavigationStore();
  const { notify } = useNotificationStore();

  const currentItem = items[currentIndex] || items[0];

  useEffect(() => {
    if (!items || items.length === 0) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [items]);

  useEffect(() => {
    if (!currentItem) return;
    let mounted = true;
    isFavorite(currentItem.id).then((fav) => {
      if (mounted) setFavorite(fav);
    });
    return () => {
      mounted = false;
    };
  }, [currentItem?.id]);

  if (!currentItem) return null;

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  };

  const handleFavoriteToggle = async () => {
    const next = await toggleFavorite(currentItem);
    setFavorite(next);
    notify({
      type: next ? 'success' : 'info',
      title: next ? 'Добавлено в избранное' : 'Удалено из избранного',
      message: currentItem.title,
    });
  };

  const backdropUrl = currentItem.backdrop || currentItem.poster;

  return (
    <div className="relative w-full h-[480px] rounded-2xl overflow-hidden shadow-2xl border border-[#292B32]/60 select-none group">
      {/* Background Image with Cinematic Gradient overlays */}
      <div className="absolute inset-0">
        <img
          key={currentItem.id}
          src={backdropUrl}
          alt={currentItem.title}
          className="w-full h-full object-cover transition-opacity duration-1000 animate-fade-in"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101114] via-[#101114]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#101114] via-[#101114]/80 to-transparent" />
      </div>

      {/* Content details */}
      <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12 z-10 max-w-2xl">
        {/* Meta badges: Year, Rating, Duration, Genres */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {currentItem.rating && (
            <div className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs backdrop-blur-md">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>{currentItem.rating.toFixed(1)}</span>
            </div>
          )}
          <span className="px-2 py-0.5 rounded bg-white/10 text-zinc-300 text-xs font-medium backdrop-blur-sm">
            {currentItem.year}
          </span>
          {currentItem.duration && (
            <div className="flex items-center space-x-1 text-xs text-zinc-400 px-2 py-0.5 rounded bg-white/5">
              <Clock className="w-3 h-3" />
              <span>{currentItem.duration}</span>
            </div>
          )}
          {currentItem.genres && currentItem.genres.length > 0 && (
            <span className="text-xs text-zinc-400 font-medium">
              {currentItem.genres.slice(0, 3).join(' • ')}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-md leading-tight mb-2">
          {currentItem.title}
        </h1>

        {currentItem.originalTitle && (
          <h3 className="text-sm md:text-base text-zinc-400 font-medium mb-3">
            {currentItem.originalTitle}
          </h3>
        )}

        {/* Synopsis */}
        <p className="text-xs md:text-sm text-zinc-300 line-clamp-3 mb-6 leading-relaxed max-w-xl">
          {currentItem.details ||
            'Захватывающая история с непревзойденной актерской игрой и грандиозной постановкой.'}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => startPlayback(currentItem)}
            className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-[#E50914] hover:bg-[#F40612] text-white font-bold text-sm shadow-xl shadow-red-900/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current ml-0.5" />
            <span>Смотреть</span>
          </button>

          <button
            onClick={() => openDetails(currentItem)}
            className="flex items-center space-x-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm backdrop-blur-md border border-white/10 transition-all cursor-pointer"
          >
            <Info className="w-4 h-4" />
            <span>Подробнее</span>
          </button>

          <button
            onClick={handleFavoriteToggle}
            title={favorite ? 'Удалить из избранного' : 'Добавить в избранное'}
            className={`p-3 rounded-xl backdrop-blur-md border transition-all cursor-pointer ${
              favorite
                ? 'bg-[#E50914] text-white border-[#E50914]'
                : 'bg-black/50 text-zinc-300 hover:text-white border-white/10 hover:bg-black/70'
            }`}
          >
            <Heart className={`w-4 h-4 ${favorite ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Prev / Next controls */}
      <button
        onClick={handlePrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm border border-white/10 cursor-pointer z-20"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        onClick={handleNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm border border-white/10 cursor-pointer z-20"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Indicators */}
      <div className="absolute bottom-4 right-8 flex items-center space-x-1.5 z-20">
        {items.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`h-1.5 rounded-full transition-all cursor-pointer ${
              idx === currentIndex ? 'w-6 bg-[#E50914]' : 'w-1.5 bg-white/30 hover:bg-white/60'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
