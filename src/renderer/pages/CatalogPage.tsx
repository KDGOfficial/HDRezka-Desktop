import React, { useState, useEffect } from 'react';
import { MediaCard } from '../components/MediaCard';
import { MediaItem, ContentType } from '../../shared/types';
import { GENRES } from '../../shared/constants';
import { ChevronLeft, ChevronRight, Film, Tv, Smile, Sparkles, Clapperboard, Flame } from 'lucide-react';
import { useTranslation } from '../i18n';
import appLogo from '../assets/logo.png';

interface CatalogPageProps {
  initialType?: ContentType;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({ initialType = 'films' }) => {
  const { t, translateGenre } = useTranslation();
  const [contentType, setContentType] = useState<ContentType>(initialType);
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [selectedSort, setSelectedSort] = useState<'last' | 'popular' | 'watching'>('last');
  const [page, setPage] = useState<number>(1);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setContentType(initialType);
    setPage(1);
  }, [initialType]);

  useEffect(() => {
    loadCatalog();
  }, [contentType, selectedGenre, selectedSort, page]);

  const loadCatalog = async () => {
    if (!window.api) return;
    setLoading(true);
    try {
      const res = await window.api.getCatalog({
        type: contentType,
        genre: selectedGenre || undefined,
        sort: selectedSort,
        page,
      });
      setItems(res.items || []);
      setHasMore(res.hasMore);
      if (res.items?.length && window.api?.prefetchDetails) {
        window.api.prefetchDetails(res.items.slice(0, 6));
      }
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  const categories: Array<{ id: ContentType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'films', label: t.catalog.categories.films, icon: Film },
    { id: 'series', label: t.catalog.categories.series, icon: Tv },
    { id: 'cartoons', label: t.catalog.categories.cartoons, icon: Smile },
    { id: 'animation', label: t.catalog.categories.animation, icon: Sparkles },
    { id: 'shows', label: t.catalog.categories.shows, icon: Clapperboard },
    { id: 'erotica', label: t.catalog.categories.erotica, icon: Flame },
  ];

  const activeCategoryLabel = categories.find((c) => c.id === contentType)?.label || t.nav.catalog;

  return (
    <div className="w-full pb-16 text-left select-none animate-fadeIn">
      {/* Header & Glass Filter Bar */}
      <div className="flex flex-col gap-5 mb-8 pb-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <span
            className="w-1.5 h-6 rounded-full shadow-glow-sm"
            style={{ background: 'linear-gradient(180deg, #FF124F 0%, #FF7A00 100%)' }}
          />
          <h1 className="font-display text-2xl md:text-3xl font-black text-white tracking-tight">
            {activeCategoryLabel}
          </h1>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Category Pills */}
          <div className="flex items-center flex-wrap gap-2">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = contentType === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    setContentType(cat.id);
                    setPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'btn-ember text-white'
                      : 'bg-white/[0.05] text-zinc-300 hover:text-white hover:bg-white/[0.1] border border-white/[0.08]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-brand-orange'}`} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Genre & Sort Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <select
              aria-label={t.details.genre}
              value={selectedGenre}
              onChange={(e) => {
                setSelectedGenre(e.target.value);
                setPage(1);
              }}
              className="bg-dark-surface border border-white/[0.1] rounded-full px-4 py-2 text-xs font-bold text-zinc-200 outline-none hover:border-brand-ember/50 focus:border-brand-ember cursor-pointer"
            >
              {GENRES.map((g) => (
                <option key={g.id} value={g.id} className="bg-[#140E12] text-white">
                  {translateGenre(g.id)}
                </option>
              ))}
            </select>

            <select
              aria-label={t.catalog.sortLabel}
              value={selectedSort}
              onChange={(e) => {
                setSelectedSort(e.target.value as any);
                setPage(1);
              }}
              className="bg-dark-surface border border-white/[0.1] rounded-full px-4 py-2 text-xs font-bold text-zinc-200 outline-none hover:border-brand-ember/50 focus:border-brand-ember cursor-pointer"
            >
              <option value="last" className="bg-[#140E12] text-white">
                {t.catalog.sortLast}
              </option>
              <option value="popular" className="bg-[#140E12] text-white">
                {t.catalog.sortPopular}
              </option>
              <option value="watching" className="bg-[#140E12] text-white">
                {t.catalog.sortWatching}
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="space-y-6" role="status" aria-live="polite">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full cinema-panel border border-brand-ember/30">
            <div className="relative w-5 h-5 flex items-center justify-center flex-shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-brand-crimson/25 border-t-brand-orange border-r-brand-crimson animate-spin" />
              <img src={appLogo} alt="" className="w-3 h-3 rounded-full object-cover" />
            </div>
            <span className="text-zinc-300 text-xs font-bold">{t.home.loadingCatalog}</span>
          </div>
          <div className="cinema-grid">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div key={idx} className="w-full min-w-[152px] max-w-[198px] mx-auto space-y-2.5">
                <div className="w-full aspect-[2/3] rounded-2xl ember-shimmer border border-white/[0.06]" />
                <div className="h-3.5 w-4/5 rounded-full ember-shimmer" />
                <div className="h-3 w-1/2 rounded-full ember-shimmer" />
              </div>
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-28 text-zinc-500 text-sm font-semibold">{t.catalog.noItems}</div>
      ) : (
        <div className="cinema-grid cinema-stagger">
          {items.map((item, idx) => (
            <div key={item.id ? `${item.id}-${idx}` : idx} className="flex justify-center">
              <MediaCard item={item} />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && items.length > 0 && (
        <div className="flex items-center justify-center gap-3 mt-12 pt-6 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-30 border border-white/[0.1] text-xs font-bold text-white disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{t.catalog.prev}</span>
          </button>

          <span className="px-4 py-2 rounded-full logo-pill text-xs font-mono font-bold text-white tabular-nums">
            {t.catalog.page} {page}
          </span>

          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-30 border border-white/[0.1] text-xs font-bold text-white disabled:cursor-not-allowed cursor-pointer"
          >
            <span>{t.catalog.next}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
