import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem } from '../../types/media';
import { MediaCard } from '../cards/MediaCard';
import { CardSkeleton } from '../cards/CardSkeleton';

interface ContentRowProps {
  title: string;
  items: MediaItem[];
  isLoading?: boolean;
  onViewAll?: () => void;
  size?: 'small' | 'medium' | 'large';
  progressMap?: Record<string, number>;
}

export const ContentRow: React.FC<ContentRowProps> = ({
  title,
  items,
  isLoading = false,
  onViewAll,
  size = 'medium',
  progressMap = {},
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const offset = direction === 'left' ? -600 : 600;
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  if (!isLoading && items.length === 0) return null;

  return (
    <section className="space-y-3 relative group">
      {/* Row Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-lg md:text-xl font-bold text-white tracking-wide flex items-center space-x-2">
          <span>{title}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#E50914]" />
        </h3>

        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs font-semibold text-zinc-400 hover:text-[#E50914] transition-colors cursor-pointer"
          >
            Смотреть все &rarr;
          </button>
        )}
      </div>

      {/* Row Carousel Area */}
      <div className="relative">
        {/* Left Arrow Button */}
        <button
          onClick={() => handleScroll('left')}
          className="absolute -left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/80 hover:bg-[#E50914] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-xl border border-white/10 z-30 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Right Arrow Button */}
        <button
          onClick={() => handleScroll('right')}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/80 hover:bg-[#E50914] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-xl border border-white/10 z-30 cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Scroll Container */}
        <div
          ref={scrollRef}
          className="flex items-center space-x-4 overflow-x-auto no-scrollbar py-2 px-1 scroll-smooth"
        >
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} size={size} />
              ))
            : items.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  size={size}
                  progressPercentage={progressMap[item.id]}
                />
              ))}
        </div>
      </div>
    </section>
  );
};
