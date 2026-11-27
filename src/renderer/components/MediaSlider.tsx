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
  onRemoveItem?: (item: MediaItem) => void;
}

export const MediaSlider: React.FC<MediaSliderProps> = ({
  title,
  items,
  onViewAll,
  showProgress = false,
  onRemoveItem,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = Math.max(520, scrollRef.current.clientWidth * 0.78);
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="w-full mb-11 select-none">
      {/* Row Header */}
      <div className="flex items-center justify-between mb-4 px-0.5">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-1.5 h-5 rounded-full flex-shrink-0 shadow-glow-sm"
            style={{ background: 'linear-gradient(180deg, #FF124F 0%, #FF7A00 100%)' }}
          />
          <h2 className="font-display text-lg md:text-xl font-black text-white tracking-tight truncate">
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-xs font-bold text-zinc-300 hover:text-brand-orange mr-1 cursor-pointer"
            >
              <span>{t.home.viewAll}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}

          <button
            type="button"
            onClick={() => scroll('left')}
            className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-300 hover:text-white cursor-pointer active:scale-95"
            aria-label={t.common.scrollLeft}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-300 hover:text-white cursor-pointer active:scale-95"
            aria-label={t.common.scrollRight}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Filmstrip */}
      <div
        ref={scrollRef}
        className="flex items-start gap-4 overflow-x-auto pb-4 pt-1.5 px-0.5 scrollbar-none scroll-smooth"
      >
        {items.map((item, idx) => (
          <div key={item.historyId || (item.id ? `${item.id}-${idx}` : idx)} className="flex-shrink-0 w-[168px] md:w-[192px]">
            <MediaCard item={item} showProgress={showProgress} onRemove={onRemoveItem} />
          </div>
        ))}
      </div>
    </section>
  );
};
