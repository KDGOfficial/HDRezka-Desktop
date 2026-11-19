import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem } from '../../shared/types';
import { MediaCard } from './MediaCard';

interface MediaSliderProps {
  title: string;
  items: MediaItem[];
  onViewAll?: () => void;
  showProgress?: boolean;
}

export const MediaSlider: React.FC<MediaSliderProps> = ({ title, items, onViewAll, showProgress = false }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 600;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="w-full mb-8 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>

        <div className="flex items-center space-x-2">
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="text-xs font-semibold text-zinc-400 hover:text-brand-red transition-colors mr-2"
            >
              Смотреть все
            </button>
          )}

          <button
            onClick={() => scroll('left')}
            className="p-1.5 rounded-lg bg-dark-surface border border-white/5 text-zinc-400 hover:text-white hover:bg-dark-surfaceLight transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-1.5 rounded-lg bg-dark-surface border border-white/5 text-zinc-400 hover:text-white hover:bg-dark-surfaceLight transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slider */}
      <div
        ref={scrollRef}
        className="flex items-start space-x-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item, idx) => (
          <div key={item.id ? `${item.id}-${idx}` : idx} className="flex-shrink-0">
            <MediaCard item={item} showProgress={showProgress} />
          </div>
        ))}
      </div>
    </div>
  );
};
