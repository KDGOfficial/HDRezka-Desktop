import React, { useState, useEffect, useMemo } from 'react';
import { Play, Plus, Heart, Star, Info, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { MediaItem } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { useTranslation } from '../i18n';

interface HeroBannerProps {
  item: MediaItem;
  slides?: MediaItem[];
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ item, slides }) => {
  const { openDetails, favorites, toggleFavorite, openCollectionModal } = useMediaStore();
  const { t } = useTranslation();

  const items = useMemo(() => {
    const raw = slides && slides.length > 0 ? [item, ...slides] : [item];
    const seen = new Set<string>();
    const unique: MediaItem[] = [];
    for (const entry of raw) {
      if (!entry) continue;
      const key = (entry.id || entry.title || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(entry);
      if (unique.length >= 5) break;
    }
    return unique.length > 0 ? unique : [item];
  }, [item, slides]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [item.id]);

  useEffect(() => {
    if (items.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, 9000);
    return () => clearInterval(timer);
  }, [items.length, isPaused]);

  const activeItem = items[activeIndex] || item;
  const isFav = favorites.some((f) => f.mediaId === activeItem.id);

  const goPrev = () => setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
  const goNext = () => setActiveIndex((prev) => (prev + 1) % items.length);

  return (
    <section
      aria-label={activeItem.title}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="cinema-player-surface relative -mx-7 lg:-mx-9 -mt-6 mb-9 min-h-[clamp(360px,46dvh,540px)] overflow-hidden select-none border-b border-white/[0.06]"
    >
      {/* Full-Bleed Atmospheric Cinema Backdrop */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img
          key={activeItem.id || activeItem.title}
          src={(activeItem as any).backdrop || activeItem.poster}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover object-center scale-110 filter blur-2xl opacity-45 brightness-[0.65] saturate-125 transition-all duration-700"
        />
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

      {/* Main Content Stage */}
      <div className="relative z-10 w-full h-full min-h-[clamp(360px,46dvh,540px)] px-7 lg:px-12 py-8 lg:py-10 flex items-center justify-between gap-8">
        {/* Left: Editorial Cinema Typography & Actions */}
        <div className="max-w-2xl flex flex-col justify-end text-left flex-1 min-w-0">
          {/* Logo-inspired Metadata Pill Row */}
          <div className="flex items-center flex-wrap gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full btn-ember text-[11px] font-display font-black uppercase tracking-[0.12em]">
              <Sparkles className="w-3 h-3 text-[#FFE29A]" aria-hidden="true" />
              <span>{t.home.premiere}</span>
            </span>

            {activeItem.rating && (
              <span className="logo-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-brand-gold text-xs font-extrabold tabular-nums">
                <Star className="w-3.5 h-3.5 fill-brand-gold" aria-hidden="true" />
                <span>{activeItem.rating.toFixed(1)}</span>
              </span>
            )}

            {activeItem.year && (
              <span className="logo-pill px-2.5 py-1 rounded-full text-zinc-200 text-xs font-bold tabular-nums">
                {activeItem.year}
              </span>
            )}

            {activeItem.country && (
              <span className="logo-pill px-2.5 py-1 rounded-full text-zinc-300 text-xs font-semibold truncate max-w-[180px]">
                {activeItem.country}
              </span>
            )}

            <span className="logo-pill px-2.5 py-1 rounded-full text-[10px] font-display font-extrabold tracking-widest text-white uppercase">
              Full HD · 4K
            </span>
          </div>

          {/* Bold Geometric Display Title */}
          <h1 className="font-display text-[clamp(1.7rem,3.1vw,3.1rem)] font-black text-white tracking-tight leading-[1.08] mb-3.5 line-clamp-2 drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]">
            {activeItem.title}
          </h1>

          {/* Synopsis */}
          <p className="text-xs sm:text-sm text-zinc-300/95 line-clamp-3 mb-7 max-w-xl font-medium leading-relaxed drop-shadow">
            {activeItem.info ||
              'Смотрите в максимальном качестве Full HD и 4K без рекламы — с выбором лучших студий озвучки и мгновенным стартом.'}
          </p>

          {/* Primary Cinema CTA Bar */}
          <div className="flex items-center flex-wrap gap-3">
            <button
              type="button"
              onClick={() => openDetails(activeItem.url || activeItem.id, activeItem)}
              className="flex items-center gap-2.5 px-7 py-3.5 rounded-full btn-ember text-white font-display font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" aria-hidden="true" />
              <span>{t.home.watch}</span>
            </button>

            <button
              type="button"
              onClick={() => openDetails(activeItem.url || activeItem.id, activeItem)}
              className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-white/[0.08] hover:bg-white/[0.16] backdrop-blur-xl text-white font-bold text-xs border border-white/[0.15] active:scale-95 cursor-pointer"
            >
              <Info className="w-4 h-4 text-brand-orange" aria-hidden="true" />
              <span>{t.home.details}</span>
            </button>

            <button
              type="button"
              onClick={() => toggleFavorite(activeItem)}
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
              onClick={() => openCollectionModal(activeItem)}
              aria-label={t.home.addToCollection}
              className="p-3.5 rounded-full bg-black/45 hover:bg-white/[0.14] backdrop-blur-xl text-zinc-200 border border-white/[0.14] active:scale-95 cursor-pointer"
              title={t.home.addToCollection}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Slide Navigation Dots (Modern Streaming Hero Switcher) */}
          {items.length > 1 && (
            <div className="flex items-center gap-3 mt-8">
              <div className="flex items-center gap-1.5">
                {items.map((slide, idx) => {
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={slide.id || idx}
                      type="button"
                      onClick={() => setActiveIndex(idx)}
                      aria-label={slide.title}
                      aria-current={active ? 'true' : undefined}
                      className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                        active
                          ? 'w-9 bg-gradient-to-r from-brand-crimson via-brand-ember to-brand-orange shadow-glow-sm'
                          : 'w-2.5 bg-white/25 hover:bg-white/50'
                      }`}
                    />
                  );
                })}
              </div>

              <div className="flex items-center gap-1 ml-2">
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Предыдущий слайд"
                  className="p-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] text-zinc-300 hover:text-white cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Следующий слайд"
                  className="p-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] text-zinc-300 hover:text-white cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Floating Vertical Poster Frame with Neon Ember Halo */}
        <div className="hidden md:flex relative flex-shrink-0 items-center justify-center pr-2">
          {/* Glowing Neon Ember Ring Accent behind poster */}
          <div
            className="absolute -inset-3 rounded-[28px] opacity-40 blur-2xl pointer-events-none"
            style={{ background: 'linear-gradient(135deg, #FF124F 0%, #FF7A00 100%)' }}
          />
          <button
            type="button"
            className="relative cursor-pointer group/poster transition-transform duration-500 hover:scale-[1.03] hover:-translate-y-1 rounded-[22px] text-left"
            onClick={() => openDetails(activeItem.url || activeItem.id, activeItem)}
            aria-label={`${t.home.watch} ${activeItem.title}`}
          >
            <div className="p-[2px] rounded-[22px] bg-gradient-to-br from-white/30 via-brand-ember/50 to-brand-crimson/50 shadow-[0_26px_64px_rgba(0,0,0,0.92)]">
              <div className="relative rounded-[20px] overflow-hidden bg-dark-surface">
                <img
                  src={activeItem.poster}
                  alt={activeItem.title}
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
    </section>
  );
};
