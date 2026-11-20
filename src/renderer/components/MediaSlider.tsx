import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { MediaItem } from '../../shared/types';
import { MediaCard } from './MediaCard';
import { useTranslation } from '../i18n';

interface MediaSliderProps {
  title: string;
  items: MediaItem[];
  onViewAll?: () => void;
  showProgress?: boolean;
}

export const MediaSlider: React.FC<MediaSliderProps> = ({ title, items, onViewAll, showProgress = false }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 640;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="w-full mb-10 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center space-x-2.5">
          <span className="w-1.5 h-4 rounded-full bg-gradient-to-b from-brand-red to-orange-500 shadow-glow-sm" />
          <h2 className="text-lg md:text-xl font-black text-white tracking-tight">{title}</h2>
        </div>

        <div className="flex items-center space-x-2">
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="group flex items-center space-x-1 text-xs font-bold text-zinc-400 hover:text-brand-red transition-colors mr-2"
            >
              <span>{t.home.viewAll}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}

          <button
            onClick={() => scroll('left')}
            className="p-2 rounded-xl bg-[#12131a] border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10 hover:border-white/15 transition-all shadow-sm"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-2 rounded-xl bg-[#12131a] border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10 hover:border-white/15 transition-all shadow-sm"
            aria-label="Scroll right"
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
