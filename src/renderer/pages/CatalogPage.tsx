import React, { useState, useEffect } from 'react';
import { MediaCard } from '../components/MediaCard';
import { MediaItem, ContentType } from '../../shared/types';
import { GENRES, SORT_OPTIONS } from '../../shared/constants';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';

interface CatalogPageProps {
  initialType?: ContentType;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({ initialType = 'films' }) => {
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

  const categories: Array<{ id: ContentType; label: string }> = [
    { id: 'films', label: 'Фильмы' },
    { id: 'series', label: 'Сериалы' },
    { id: 'cartoons', label: 'Мультфильмы' },
    { id: 'animation', label: 'Аниме' },
  ];

  return (
    <div className="w-full pb-16 text-left select-none">
      {/* Title & Filters bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-dark-border">
        {/* Categories Tabs */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setContentType(cat.id);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                contentType === cat.id
                  ? 'bg-brand-red text-white shadow-glow'
                  : 'bg-dark-surface text-zinc-400 hover:text-white hover:bg-dark-surfaceLight'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Dropdowns */}
        <div className="flex items-center space-x-3">
          {/* Genre selector */}
          <div className="relative">
            <select
              value={selectedGenre}
              onChange={(e) => {
                setSelectedGenre(e.target.value);
                setPage(1);
              }}
              className="bg-dark-surface border border-white/10 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 outline-none hover:border-white/20 focus:border-brand-red cursor-pointer"
            >
              {GENRES.map((g) => (
                <option key={g.id} value={g.id} className="bg-dark-surface text-white">
                  {g.title}
                </option>
              ))}
            </select>
          </div>

          {/* Sort selector */}
          <div className="relative">
            <select
              value={selectedSort}
              onChange={(e) => {
                setSelectedSort(e.target.value as any);
                setPage(1);
              }}
              className="bg-dark-surface border border-white/10 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 outline-none hover:border-white/20 focus:border-brand-red cursor-pointer"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id} className="bg-dark-surface text-white">
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-zinc-500 text-sm">Загрузка карточек...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-base font-semibold">Ничего не найдено</p>
          <p className="text-xs text-zinc-600 mt-1">Попробуйте изменить выбранные фильтры</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {items.map((item, idx) => (
            <div key={`${item.id}-${idx}`} className="flex justify-center">
              <MediaCard item={item} />
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="flex items-center justify-center space-x-4 mt-10 pt-6 border-t border-dark-border">
        <button
          disabled={page <= 1 || loading}
          onClick={() => {
            setPage((p) => Math.max(1, p - 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center space-x-1 px-4 py-2 rounded-xl bg-dark-surface border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-dark-surfaceLight disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Назад</span>
        </button>

        <span className="text-sm font-bold text-zinc-300 px-3 py-1 bg-dark-surface rounded-lg">
          Страница {page}
        </span>

        <button
          disabled={!hasMore || loading}
          onClick={() => {
            setPage((p) => p + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center space-x-1 px-4 py-2 rounded-xl bg-dark-surface border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-dark-surfaceLight disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <span>Вперёд</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
