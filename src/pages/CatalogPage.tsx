import React, { useState, useEffect } from 'react';
import {
  Filter,
  RotateCcw,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles
} from 'lucide-react';
import { MediaItem, CatalogFilter, CatalogResponse } from '../types/media';
import { getCatalog } from '../services/api';
import { MediaCard } from '../components/cards/MediaCard';
import { CardSkeleton } from '../components/cards/CardSkeleton';
import { useSettingsStore } from '../stores/settingsStore';

interface CatalogPageProps {
  initialCategory?: 'all' | 'movies' | 'series' | 'cartoons' | 'anime' | 'shows';
}

const GENRES = [
  'Все жанры',
  'Боевик',
  'Комедия',
  'Драма',
  'Фантастика',
  'Триллер',
  'Ужасы',
  'Детектив',
  'Фэнтези',
  'Приключения',
  'Криминал',
  'Биография',
  'История',
];

const YEARS = ['Все года', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2010-2017'];

const COUNTRIES = [
  'Все страны',
  'США',
  'Великобритания',
  'Франция',
  'Япония',
  'Южная Корея',
  'Германия',
  'Канада',
  'Россия',
];

export const CatalogPage: React.FC<CatalogPageProps> = ({ initialCategory = 'all' }) => {
  const [category, setCategory] = useState<'all' | 'movies' | 'series' | 'cartoons' | 'anime' | 'shows'>(
    initialCategory
  );
  const [selectedGenre, setSelectedGenre] = useState('Все жанры');
  const [selectedYear, setSelectedYear] = useState('Все года');
  const [selectedCountry, setSelectedCountry] = useState('Все страны');
  const [minRating, setMinRating] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'release_date' | 'alphabetical'>('popular');
  const [page, setPage] = useState(1);
  const [catalogData, setCatalogData] = useState<CatalogResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { settings } = useSettingsStore();

  const loadData = () => {
    setIsLoading(true);
    const filter: CatalogFilter = {
      category,
      genre: selectedGenre !== 'Все жанры' ? selectedGenre : undefined,
      year: selectedYear !== 'Все года' ? selectedYear : undefined,
      country: selectedCountry !== 'Все страны' ? selectedCountry : undefined,
      ratingMin: minRating > 0 ? minRating : undefined,
      sort: sortBy,
      page,
    };

    getCatalog(filter).then((res) => {
      setCatalogData(res);
      setIsLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, [category, selectedGenre, selectedYear, selectedCountry, minRating, sortBy, page]);

  const handleResetFilters = () => {
    setSelectedGenre('Все жанры');
    setSelectedYear('Все года');
    setSelectedCountry('Все страны');
    setMinRating(0);
    setSortBy('popular');
    setPage(1);
  };

  const categories = [
    { id: 'all', label: 'Все' },
    { id: 'movies', label: 'Фильмы' },
    { id: 'series', label: 'Сериалы' },
    { id: 'cartoons', label: 'Мультфильмы' },
    { id: 'anime', label: 'Аниме' },
  ];

  return (
    <div className="space-y-6 pb-16 animate-fade-in">
      {/* Page Title & Category Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#292B32] pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center space-x-2">
            <span>Каталог медиатеки</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/30">
              {catalogData?.totalItems || 0} тайтлов
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Тысячи фильмов, сериалов и аниме в максимальном качестве
          </p>
        </div>

        {/* Category Buttons */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar bg-[#17181D] p-1.5 rounded-2xl border border-[#292B32]">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCategory(c.id as any);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                category === c.id
                  ? 'bg-[#E50914] text-white shadow-md shadow-red-900/30'
                  : 'text-zinc-400 hover:text-white hover:bg-[#1D1F26]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Bar Controls */}
      <div className="bg-[#17181D] border border-[#292B32] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#292B32]/60">
          <div className="flex items-center space-x-2 text-xs font-bold text-zinc-300">
            <Sliders className="w-4 h-4 text-[#E50914]" />
            <span>Параметры фильтрации</span>
          </div>

          <button
            onClick={handleResetFilters}
            className="flex items-center space-x-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сбросить</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {/* Genre */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Жанр</label>
            <select
              value={selectedGenre}
              onChange={(e) => {
                setSelectedGenre(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#101114] border border-[#292B32] text-xs text-zinc-200 rounded-xl p-2 focus:border-[#E50914] focus:outline-none"
            >
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Год выпуска</label>
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#101114] border border-[#292B32] text-xs text-zinc-200 rounded-xl p-2 focus:border-[#E50914] focus:outline-none"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Country */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Страна</label>
            <select
              value={selectedCountry}
              onChange={(e) => {
                setSelectedCountry(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#101114] border border-[#292B32] text-xs text-zinc-200 rounded-xl p-2 focus:border-[#E50914] focus:outline-none"
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Rating */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Мин. рейтинг</label>
            <select
              value={minRating}
              onChange={(e) => {
                setMinRating(Number(e.target.value));
                setPage(1);
              }}
              className="w-full bg-[#101114] border border-[#292B32] text-xs text-zinc-200 rounded-xl p-2 focus:border-[#E50914] focus:outline-none"
            >
              <option value={0}>Любой рейтинг</option>
              <option value={8}>8.0 и выше ★★★</option>
              <option value={7}>7.0 и выше ★★</option>
              <option value={6}>6.0 и выше ★</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Сортировка</label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
              className="w-full bg-[#101114] border border-[#292B32] text-xs text-zinc-200 rounded-xl p-2 focus:border-[#E50914] focus:outline-none"
            >
              <option value="popular">По популярности</option>
              <option value="rating">По рейтингу</option>
              <option value="release_date">По дате выхода</option>
              <option value="alphabetical">По алфавиту (А-Я)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Catalog Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <CardSkeleton key={i} size={settings.cardSize} />
            ))
          : catalogData?.items.map((item) => (
              <MediaCard key={item.id} item={item} size={settings.cardSize} />
            ))}
      </div>

      {/* Empty State */}
      {!isLoading && catalogData?.items.length === 0 && (
        <div className="text-center py-20 bg-[#17181D] rounded-3xl border border-[#292B32] space-y-3">
          <Sparkles className="w-12 h-12 text-zinc-500 mx-auto" />
          <h3 className="text-lg font-bold text-white">Ничего не найдено</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Попробуйте смягчить критерии поиска или сбросить активные фильтры.
          </p>
          <button
            onClick={handleResetFilters}
            className="px-5 py-2.5 rounded-xl bg-[#E50914] text-white text-xs font-bold hover:bg-[#F40612] transition-colors cursor-pointer"
          >
            Сбросить фильтры
          </button>
        </div>
      )}

      {/* Pagination Controls */}
      {catalogData && catalogData.totalPages > 1 && (
        <div className="flex items-center justify-center space-x-3 pt-6 border-t border-[#292B32]">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="p-2 rounded-xl bg-[#1D1F26] border border-[#292B32] text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="text-xs font-bold text-zinc-300 px-4 py-2 rounded-xl bg-[#17181D] border border-[#292B32]">
            Страница {page} из {catalogData.totalPages}
          </span>

          <button
            disabled={page >= catalogData.totalPages}
            onClick={() => setPage(page + 1)}
            className="p-2 rounded-xl bg-[#1D1F26] border border-[#292B32] text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
