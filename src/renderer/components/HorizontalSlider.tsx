import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalSliderProps {
  children: React.ReactNode;
  ariaLabel: string;
  className?: string;
  trackClassName?: string;
  compact?: boolean;
  /** Re-measure when item count changes */
  itemCount?: number;
}

export const HorizontalSlider: React.FC<HorizontalSliderProps> = ({
  children,
  ariaLabel,
  className = '',
  trackClassName = 'flex items-center gap-2',
  compact = false,
  itemCount,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  const [scrollLeft, setScrollLeft] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const nextMax = Math.max(0, Math.round(el.scrollWidth - el.clientWidth));
    const nextLeft = Math.min(nextMax, Math.max(0, Math.round(el.scrollLeft)));
    setMaxScroll(nextMax);
    setScrollLeft(nextLeft);
  }, []);

  useEffect(() => {
    measure();
    const rafId = requestAnimationFrame(measure);
    const el = trackRef.current;
    if (!el) return () => cancelAnimationFrame(rafId);

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true });
    document.fonts?.ready?.then(measure).catch(() => {});

    // Bring active pressed item into view without hijacking vertical page scroll
    const activeEl = el.querySelector<HTMLElement>('[aria-pressed="true"], [data-active="true"]');
    if (activeEl && el.scrollWidth > el.clientWidth) {
      const targetLeft = activeEl.offsetLeft - el.clientWidth / 2 + activeEl.clientWidth / 2;
      el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, targetLeft));
      measure();
    }

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure, itemCount]);

  // Attach non-passive wheel listener so preventDefault() actually blocks vertical page scroll
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      const currentMax = Math.max(0, Math.round(el.scrollWidth - el.clientWidth));
      if (currentMax <= 4) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
        const hittingStart = e.deltaY < 0 && el.scrollLeft <= 0;
        const hittingEnd = e.deltaY > 0 && el.scrollLeft >= currentMax - 1;
        if (!hittingStart && !hittingEnd) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      }
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  const canScroll = maxScroll > 4;
  const atStart = scrollLeft <= 2;
  const atEnd = scrollLeft >= maxScroll - 2;
  const progressPercent = maxScroll > 0 ? Math.min(100, (scrollLeft / maxScroll) * 100) : 0;

  const scrollByStep = (direction: 'prev' | 'next') => {
    const el = trackRef.current;
    if (!el) return;
    const step = Math.max(compact ? 180 : 280, Math.round(el.clientWidth * 0.72));
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({
      left: direction === 'prev' ? -step : step,
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  // Redirect focus to the opposite control if the focused prev/next button becomes disabled at the end
  useEffect(() => {
    if (atStart && document.activeElement === prevBtnRef.current && !atEnd) {
      nextBtnRef.current?.focus();
    } else if (atEnd && document.activeElement === nextBtnRef.current && !atStart) {
      prevBtnRef.current?.focus();
    }
  }, [atStart, atEnd]);

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = Number(e.target.value);
    setScrollLeft(target);
    if (trackRef.current) {
      trackRef.current.scrollLeft = target;
    }
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      className={`relative min-w-0 ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {canScroll && (
          <button
            ref={prevBtnRef}
            type="button"
            disabled={atStart}
            onClick={() => scrollByStep('prev')}
            aria-label="Прокрутить влево"
            className={`flex-shrink-0 rounded-full bg-white/[0.06] hover:bg-white/[0.15] disabled:opacity-30 disabled:cursor-not-allowed border border-white/[0.1] text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer active:scale-95 ${
              compact ? 'w-7 h-7' : 'w-8 h-8'
            }`}
          >
            <ChevronLeft className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
          </button>
        )}

        <div
          ref={trackRef}
          onScroll={measure}
          className={`slider-track flex-1 min-w-0 overflow-x-auto scrollbar-none py-0.5 ${trackClassName}`}
        >
          {children}
        </div>

        {canScroll && (
          <button
            ref={nextBtnRef}
            type="button"
            disabled={atEnd}
            onClick={() => scrollByStep('next')}
            aria-label="Прокрутить вправо"
            className={`flex-shrink-0 rounded-full bg-white/[0.06] hover:bg-white/[0.15] disabled:opacity-30 disabled:cursor-not-allowed border border-white/[0.1] text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer active:scale-95 ${
              compact ? 'w-7 h-7' : 'w-8 h-8'
            }`}
          >
            <ChevronRight className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Interactive Ember Scrub Slider when items overflow — thumb & range share exact inner width */}
      {canScroll && (
        <div className={`${compact ? 'mt-2 px-8' : 'mt-3 px-10'} group`}>
          <div className="relative flex items-center w-full h-4">
            <div className="relative w-full h-1.5 bg-white/[0.1] rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 bottom-0 rounded-full"
                style={{
                  width: `${Math.max(8, progressPercent)}%`,
                  background: 'linear-gradient(90deg, #FF124F 0%, #FF4D1A 55%, #FF7A00 100%)',
                }}
              />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,122,0,0.85)] border-2 border-brand-orange pointer-events-none transform -translate-x-1/2"
              style={{ left: `${progressPercent}%` }}
            />
            <input
              type="range"
              min={0}
              max={maxScroll}
              value={scrollLeft}
              onChange={handleRangeChange}
              aria-label={`Прокрутка: ${ariaLabel}`}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
