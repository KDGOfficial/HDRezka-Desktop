import React, { useState, useEffect } from 'react';
import { MediaCard } from '../components/MediaCard';
import { MediaItem, ContentType } from '../../shared/types';
import { GENRES } from '../../shared/constants';
import { ChevronLeft, ChevronRight, Film, Tv, Smile, Sparkles, Clapperboard } from 'lucide-react';
import { useTranslation } from '../i18n';

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
  ];

  return (
    <div className="w-full pb-16 text-left select-none animate-fadeIn">
      {/* Title & Filters bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-white/5">
        {/* Categories Tabs - No scrollbar/slider, fits cleanly with compact pills */}
        <div className="flex items-center flex-wrap gap-1.5">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = contentType === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setContentType(cat.id);
                  setPage(1);
                }}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-brand-red via-brand-red to-orange-600 text-white shadow-glow'
                    : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                <span className="whitespace-nowrap">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dropdowns */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-2 flex-shrink-0">
          {/* Genre selector */}
          <select
            value={selectedGenre}
            onChange={(e) => {
              setSelectedGenre(e.target.value);
              setPage(1);
            }}
            className="bg-[#12131a] border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 outline-none hover:border-white/20 focus:border-brand-red cursor-pointer transition-colors shadow-sm whitespace-nowrap"
          >
            {GENRES.map((g) => (
              <option key={g.id} value={g.id} className="bg-[#12131a] text-white">
                {translateGenre(g.id)}
              </option>
            ))}
          </select>

          {/* Sort selector */}
          <select
            value={selectedSort}
            onChange={(e) => {
              setSelectedSort(e.target.value as any);
              setPage(1);
            }}
            className="bg-[#12131a] border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 outline-none hover:border-white/20 focus:border-brand-red cursor-pointer transition-colors shadow-sm whitespace-nowrap"
          >
            <option value="last" className="bg-[#12131a] text-white">
              {t.catalog.sortLast}
            </option>
            <option value="popular" className="bg-[#12131a] text-white">
              {t.catalog.sortPopular}
            </option>
            <option value="watching" className="bg-[#12131a] text-white">
              {t.catalog.sortWatching}
            </option>
          </select>
        </div>
      </div>

      {/* Grid of Media */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="w-12 h-12 border-4 border-brand-red/20 border-t-brand-red rounded-full animate-spin mb-3" />
          <span className="text-zinc-500 text-xs font-medium">{t.home.loadingCatalog}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-28 text-zinc-500 text-sm">
          {t.catalog.noItems}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {items.map((item, idx) => (
            <div key={item.id ? `${item.id}-${idx}` : idx} className="flex justify-center">
              <MediaCard item={item} />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && items.length > 0 && (
        <div className="flex items-center justify-center space-x-3 mt-12 pt-6 border-t border-white/5">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 border border-white/10 text-xs font-bold text-white transition-all disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{t.catalog.prev}</span>
          </button>

          <span className="px-3.5 py-1.5 rounded-xl bg-[#12131a] border border-white/10 text-xs font-mono font-bold text-zinc-300">
            {t.catalog.page} {page}
          </span>

          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 border border-white/10 text-xs font-bold text-white transition-all disabled:cursor-not-allowed"
          >
            <span>{t.catalog.next}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
