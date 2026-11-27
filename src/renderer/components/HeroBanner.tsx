import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Plus,
  Heart,
  Star,
  Info,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Flame,
  Wand2,
} from 'lucide-react';
import { MediaItem } from '../../shared/types';
import { DynamicHeroSlide } from '../../shared/recommendations';
import { useMediaStore } from '../stores/useMediaStore';
import { useTranslation } from '../i18n';
import { useLocalizedTitle } from '../hooks/useLocalizedTitle';
import { inferAgeRating, getAgeRatingBadgeClass } from '../../shared/utils';

interface HeroBannerProps {
  item: MediaItem;
  slides?: DynamicHeroSlide[];
}

const SLIDE_INTERVAL_MS = 7500;
const TRANSITION_CLEANUP_MS = 720;

interface HeroSlideLayerProps {
  slide: DynamicHeroSlide;
  slideLabel?: string;
  mode: 'enter' | 'exit' | 'static';
  direction: 'next' | 'prev';
  isFav: boolean;
  onOpenDetails: (item: MediaItem) => void;
  onToggleFavorite: (item: MediaItem) => void;
  onOpenCollection: (item: MediaItem) => void;
}

const HeroSlideLayer: React.FC<HeroSlideLayerProps> = ({
  slide,
  slideLabel,
  mode,
  direction,
  isFav,
  onOpenDetails,
  onToggleFavorite,
  onOpenCollection,
}) => {
  const { t, translateGenre } = useTranslation();
  const slideItem = slide.item;
  const displayTitle = useLocalizedTitle(slideItem.title, slideItem.origTitle);
  const ageRating = inferAgeRating(slideItem);

  const badgeMeta = useMemo(() => {
    if (slide.kind === 'new') {
      return { label: t.home.newBadge, icon: Flame };
    }
    if (slide.kind === 'recommended') {
      const topMatched = slide.matchedGenres?.[0];
      return {
        label: topMatched
          ? `${t.home.recommendedForYou} · ${translateGenre(topMatched)}`
          : t.home.recommendedForYou,
        icon: Wand2,
      };
    }
    return { label: t.home.premiere, icon: Sparkles };
  }, [slide, t.home.newBadge, t.home.recommendedForYou, t.home.premiere, translateGenre]);

  const BadgeIcon = badgeMeta.icon;
  const isExiting = mode === 'exit';

  const textAnimClass =
    mode === 'enter'
      ? direction === 'next'
        ? 'hero-slide-in-next'
        : 'hero-slide-in-prev'
      : mode === 'exit'
        ? direction === 'next'
          ? 'hero-slide-out-next'
          : 'hero-slide-out-prev'
        : '';

  const posterAnimClass =
    mode === 'enter'
      ? `hero-poster-enter ${direction === 'next' ? 'hero-poster-in-next' : 'hero-poster-in-prev'}`
      : mode === 'exit'
        ? direction === 'next'
          ? 'hero-poster-out-next'
          : 'hero-poster-out-prev'
        : 'hero-poster-enter';

  return (
    <div
      role={isExiting ? undefined : 'group'}
      aria-roledescription={isExiting ? undefined : 'slide'}
      aria-label={isExiting ? undefined : slideLabel}
      aria-hidden={isExiting ? true : undefined}
      {...(isExiting ? ({ inert: '' } as any) : {})}
      className={`col-start-1 row-start-1 flex items-center justify-between gap-8 ${
        isExiting ? 'pointer-events-none select-none z-0' : 'relative z-10'
      }`}
    >
      {/* Left: Editorial Cinema Typography & Actions */}
      <div className={`max-w-2xl flex flex-col justify-end text-left flex-1 min-w-0 ${textAnimClass}`}>
        {/* Logo-inspired Dynamic Metadata Pill Row */}
        <div className="flex items-center flex-wrap gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full btn-ember text-[11px] font-display font-black uppercase tracking-[0.12em]">
            <BadgeIcon className="w-3 h-3 text-[#FFE29A]" aria-hidden="true" />
            <span>{badgeMeta.label}</span>
          </span>

          {Boolean(slideItem.rating && slideItem.rating > 0) && (
            <span className="logo-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-brand-gold text-xs font-extrabold tabular-nums">
              <Star className="w-3.5 h-3.5 fill-brand-gold" aria-hidden="true" />
              <span>{slideItem.rating!.toFixed(1)}</span>
            </span>
          )}

          {slideItem.year && (
            <span className="logo-pill px-2.5 py-1 rounded-full text-zinc-200 text-xs font-bold tabular-nums">
              {slideItem.year}
            </span>
          )}

          {slideItem.country && (
            <span className="logo-pill px-2.5 py-1 rounded-full text-zinc-300 text-xs font-semibold truncate max-w-[180px]">
              {slideItem.country}
            </span>
          )}

          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-display font-black tabular-nums ${getAgeRatingBadgeClass(
              ageRating
            )}`}
            title={`${t.details.ageRating}: ${ageRating}`}
          >
            {ageRating}
          </span>

          <span className="logo-pill px-2.5 py-1 rounded-full text-[10px] font-display font-extrabold tracking-widest text-white uppercase">
            Full HD · 4K
          </span>
        </div>

        {/* Bold Geometric Display Title */}
        <h1 className="font-display text-[clamp(1.7rem,3.1vw,3.1rem)] font-black text-white tracking-tight leading-[1.08] mb-3.5 line-clamp-2 drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]">
          {displayTitle}
        </h1>

        {/* Synopsis */}
        <p className="text-xs sm:text-sm text-zinc-300/95 line-clamp-3 mb-7 max-w-xl font-medium leading-relaxed drop-shadow">
          {slideItem.info || t.home.defaultHeroDesc}
        </p>

        {/* Primary Cinema CTA Bar */}
        <div className="flex items-center flex-wrap gap-3">
          <button
            type="button"
            tabIndex={isExiting ? -1 : undefined}
            onClick={() => onOpenDetails(slideItem)}
            className="flex items-center gap-2.5 px-7 py-3.5 rounded-full btn-ember text-white font-display font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" aria-hidden="true" />
            <span>{t.home.watch}</span>
          </button>

          <button
            type="button"
            tabIndex={isExiting ? -1 : undefined}
            onClick={() => onOpenDetails(slideItem)}
            className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-white/[0.08] hover:bg-white/[0.16] backdrop-blur-xl text-white font-bold text-xs border border-white/[0.15] active:scale-95 cursor-pointer"
          >
            <Info className="w-4 h-4 text-brand-orange" aria-hidden="true" />
            <span>{t.home.details}</span>
          </button>

          <button
            type="button"
            tabIndex={isExiting ? -1 : undefined}
            onClick={() => onToggleFavorite(slideItem)}
            aria-label={isFav ? t.home.inFavorites : t.home.addToFavorites}
            aria-pressed={isFav}
            className={`p-3.5 rounded-full backdrop-blur-xl border active:scale-95 cursor-pointer ${
              isFav
                ? 'bg-brand-crimson/20 text-brand-crimson border-brand-crimson/55 shadow-glow-sm'
                : 'bg-black/45 hover:bg-white/[0.14] text-zinc-200 border-white/[0.14]'
            }`}
            title={isFav ? t.home.inFavorites : t.home.addToFavorites}
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-brand-crimson' : ''}`} />
          </button>

          <button
            type="button"
            tabIndex={isExiting ? -1 : undefined}
            onClick={() => onOpenCollection(slideItem)}
            aria-label={t.home.addToCollection}
            className="p-3.5 rounded-full bg-black/45 hover:bg-white/[0.14] backdrop-blur-xl text-zinc-200 border border-white/[0.14] active:scale-95 cursor-pointer"
            title={t.home.addToCollection}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right: Floating Vertical Poster Frame with Neon Ember Halo */}
      <div className={`hidden md:flex relative flex-shrink-0 items-center justify-center pr-2 ${posterAnimClass}`}>
        {/* Glowing Neon Ember Ring Accent behind poster */}
        <div
          className="absolute -inset-3 rounded-[28px] opacity-40 blur-2xl pointer-events-none"
          style={{ background: 'linear-gradient(135deg, #FF124F 0%, #FF7A00 100%)' }}
        />
        <button
          type="button"
          tabIndex={isExiting ? -1 : undefined}
          className="relative cursor-pointer group/poster transition-transform duration-500 hover:scale-[1.03] hover:-translate-y-1 rounded-[22px] text-left"
          onClick={() => onOpenDetails(slideItem)}
          aria-label={`${t.home.watch} ${slideItem.title}`}
        >
          <div className="p-[2px] rounded-[22px] bg-gradient-to-br from-white/30 via-brand-ember/50 to-brand-crimson/50 shadow-[0_26px_64px_rgba(0,0,0,0.92)]">
            <div className="relative rounded-[20px] overflow-hidden bg-dark-surface">
              <img
                src={slideItem.poster}
                alt={slideItem.title}
                className="w-56 lg:w-64 h-[335px] lg:h-[380px] object-cover block"
                loading="eager"
              />
              {/* Hover Play Squircle (echoes 3D play button from logo) */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#070507]/85 via-black/20 to-transparent opacity-0 group-hover/poster:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <div className="w-16 h-16 rounded-[18px] play-squircle flex items-center justify-center transform scale-90 group-hover/poster:scale-100 transition-transform duration-300">
                  <Play className="w-7 h-7 fill-white text-white ml-0.5" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

export const HeroBanner: React.FC<HeroBannerProps> = ({ item, slides }) => {
  const { openDetails, favorites, toggleFavorite, openCollectionModal } = useMediaStore();
  const { t } = useTranslation();

  const deck: DynamicHeroSlide[] = useMemo(() => {
    const raw: DynamicHeroSlide[] =
      slides && slides.length > 0 ? slides : [{ item, kind: 'premiere' }];
    const seen = new Set<string>();
    const unique: DynamicHeroSlide[] = [];
    for (const entry of raw) {
      if (!entry?.item) continue;
      const key = (entry.item.id || entry.item.title || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(entry);
      if (unique.length >= 6) break;
    }
    return unique.length > 0 ? unique : [{ item, kind: 'premiere' }];
  }, [item, slides]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev'>('next');
  const [transitionKey, setTransitionKey] = useState(0);
  const [isHoveredOrFocused, setIsHoveredOrFocused] = useState(false);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const manualNavigationRef = useRef(false);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deckKey = deck.map((s) => s.item.id || s.item.title).join('|');

  useEffect(() => {
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    setActiveIndex(0);
    setPrevIndex(null);
    setTransitionKey(0);
    setStatusAnnouncement('');
  }, [deckKey]);

  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mql) return;
    setReducedMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  const safeIndex = activeIndex < deck.length ? activeIndex : 0;

  const commitSlideChange = useCallback(
    (nextIdx: number, dir: 'next' | 'prev') => {
      if (deck.length <= 1 || nextIdx === safeIndex) return;
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      setPrevIndex(safeIndex);
      setSlideDirection(dir);
      setActiveIndex(nextIdx);
      setTransitionKey((k) => k + 1);
      cleanupTimerRef.current = setTimeout(() => {
        setPrevIndex(null);
        cleanupTimerRef.current = null;
      }, TRANSITION_CLEANUP_MS);
    },
    [deck.length, safeIndex]
  );

  const isAutoPaused = isHoveredOrFocused || isUserPaused || reducedMotion;

  useEffect(() => {
    if (deck.length <= 1 || isAutoPaused) return;
    const timer = setInterval(() => {
      manualNavigationRef.current = false;
      commitSlideChange((safeIndex + 1) % deck.length, 'next');
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [deck.length, isAutoPaused, safeIndex, commitSlideChange]);

  const activeSlide = deck[safeIndex] || deck[0];
  const activeItem = activeSlide.item;
  const exitingSlide =
    prevIndex !== null && prevIndex !== safeIndex && deck[prevIndex] ? deck[prevIndex] : null;

  useEffect(() => {
    if (activeItem && window.api?.prefetchDetails) {
      window.api.prefetchDetails([activeItem]);
    }
  }, [activeItem?.id, activeItem?.url]);

  useEffect(() => {
    if (!manualNavigationRef.current) return;
    const pos = t.home.slidePosition
      .replace('{current}', String(safeIndex + 1))
      .replace('{total}', String(deck.length));
    setStatusAnnouncement(`${activeItem.title} — ${pos}`);
  }, [safeIndex, deck.length, activeItem.title, t.home.slidePosition]);

  const navigateTo = (nextIdx: number) => {
    if (nextIdx === safeIndex) return;
    manualNavigationRef.current = true;
    commitSlideChange(nextIdx, nextIdx > safeIndex ? 'next' : 'prev');
  };

  const goPrev = () => {
    manualNavigationRef.current = true;
    commitSlideChange((safeIndex - 1 + deck.length) % deck.length, 'prev');
  };

  const goNext = () => {
    manualNavigationRef.current = true;
    commitSlideChange((safeIndex + 1) % deck.length, 'next');
  };

  const slideLabel = t.home.slidePosition
    .replace('{current}', String(safeIndex + 1))
    .replace('{total}', String(deck.length));

  const handleOpenDetails = useCallback(
    (target: MediaItem) => openDetails(target.url || target.id, target),
    [openDetails]
  );

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t.settings.secHero}
      onMouseEnter={() => setIsHoveredOrFocused(true)}
      onMouseLeave={() => setIsHoveredOrFocused(false)}
      onFocusCapture={() => setIsHoveredOrFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsHoveredOrFocused(false);
        }
      }}
      className="cinema-player-surface relative -mx-7 lg:-mx-9 -mt-6 mb-9 min-h-[clamp(360px,46dvh,540px)] overflow-hidden select-none border-b border-white/[0.06]"
    >
      {/* Persistent Full-Bleed Atmospheric Cinema Backdrop Crossfade Stack (zero flash) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {deck.map((slide, idx) => {
          const isCurrent = idx === safeIndex;
          const src = (slide.item as any).backdrop || slide.item.poster;
          return (
            <img
              key={slide.item.id || idx}
              src={src}
              alt=""
              aria-hidden="true"
              className={`hero-backdrop-layer absolute inset-0 w-full h-full object-cover object-center filter blur-2xl brightness-[0.65] saturate-125 ${
                isCurrent ? 'hero-backdrop-layer--active' : ''
              }`}
            />
          );
        })}
        {/* Warm Neon Ember Cinema Ambient Glow (mirrors logo halo) */}
        <div
          className="absolute -top-24 right-8 w-[460px] h-[460px] rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(255,122,0,0.55) 0%, rgba(255,18,79,0.4) 48%, transparent 72%)' }}
        />
        <div
          className="absolute -bottom-32 left-1/4 w-[420px] h-[320px] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(255,18,79,0.55) 0%, transparent 70%)' }}
        />
      </div>

      {/* Multi-stop Cinematic Vignettes melting into canvas */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B070A] via-[#0B070A]/88 via-52% to-[#0B070A]/25 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B070A] via-[#0B070A]/25 to-[#070507]/45 pointer-events-none" />

      {/* Polite status region for assistive technology */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusAnnouncement}
      </p>

      {/* Main Content Stage: Single-cell Grid overlay for silky simultaneous exit + entry */}
      <div className="relative z-10 w-full min-h-[clamp(360px,46dvh,540px)] px-7 lg:px-12 py-8 lg:py-10 flex flex-col justify-between gap-6">
        <div className="grid grid-cols-1 grid-rows-1 flex-1 items-center">
          {exitingSlide && (
            <HeroSlideLayer
              key={`exit-${transitionKey}-${exitingSlide.item.id || prevIndex}`}
              slide={exitingSlide}
              mode="exit"
              direction={slideDirection}
              isFav={favorites.some((f) => f.mediaId === exitingSlide.item.id)}
              onOpenDetails={handleOpenDetails}
              onToggleFavorite={toggleFavorite}
              onOpenCollection={openCollectionModal}
            />
          )}

          <HeroSlideLayer
            key={`enter-${transitionKey}-${activeItem.id || safeIndex}`}
            slide={activeSlide}
            slideLabel={slideLabel}
            mode={transitionKey > 0 ? 'enter' : 'static'}
            direction={slideDirection}
            isFav={favorites.some((f) => f.mediaId === activeItem.id)}
            onOpenDetails={handleOpenDetails}
            onToggleFavorite={toggleFavorite}
            onOpenCollection={openCollectionModal}
          />
        </div>

        {/* Pinned Slide Navigation Dots & Controls (never flash or shift during slide transitions) */}
        {deck.length > 1 && (
          <div className="relative z-20 flex items-center flex-wrap gap-3">
            <div className="flex items-center gap-0.5">
              {deck.map((slide, idx) => {
                const active = idx === safeIndex;
                return (
                  <button
                    key={slide.item.id || idx}
                    type="button"
                    onClick={() => navigateTo(idx)}
                    aria-label={`${slide.item.title} (${idx + 1}/${deck.length})`}
                    aria-current={active ? 'true' : undefined}
                    className="min-w-[24px] min-h-[24px] px-1 flex items-center justify-center cursor-pointer rounded-full touch-manipulation"
                  >
                    <span
                      className={`block h-1.5 rounded-full overflow-hidden transition-all duration-300 ${
                        active
                          ? 'w-11 bg-white/25 ring-1 ring-brand-orange/45'
                          : 'w-2.5 bg-white/30 hover:bg-white/60'
                      }`}
                    >
                      {active && (
                        <span
                          key={`prog-${safeIndex}-${isAutoPaused ? 'p' : 'r'}`}
                          className="block h-full rounded-full bg-gradient-to-r from-brand-crimson via-brand-ember to-brand-orange"
                          style={{
                            width: '100%',
                            transformOrigin: 'left center',
                            animation: isAutoPaused
                              ? 'none'
                              : `heroSlideProgress ${SLIDE_INTERVAL_MS}ms linear forwards`,
                          }}
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 ml-1">
              <button
                type="button"
                onClick={goPrev}
                aria-label={t.home.prevSlide}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.18] border border-white/[0.12] text-zinc-200 hover:text-white cursor-pointer active:scale-95 touch-manipulation"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label={t.home.nextSlide}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.18] border border-white/[0.12] text-zinc-200 hover:text-white cursor-pointer active:scale-95 touch-manipulation"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setIsUserPaused((p) => !p)}
                aria-label={isUserPaused ? t.home.resumeRotation : t.home.pauseRotation}
                aria-pressed={isUserPaused}
                title={isUserPaused ? t.home.resumeRotation : t.home.pauseRotation}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.18] border border-white/[0.12] text-zinc-200 hover:text-white cursor-pointer active:scale-95 touch-manipulation"
              >
                {isUserPaused ? (
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" aria-hidden="true" />
                ) : (
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
