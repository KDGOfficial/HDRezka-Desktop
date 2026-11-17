import React, { useState, useEffect } from 'react';
import { Heart, Search, Trash2, ArrowUpDown } from 'lucide-react';
import { FavoriteItem } from '../types/database';
import { MediaItem } from '../types/media';
import { getFavorites, toggleFavorite } from '../services/api';
import { MediaCard } from '../components/cards/MediaCard';
import { useSettingsStore } from '../stores/settingsStore';

export const FavoritesPage: React.FC = () => {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'rating' | 'title'>('date');
  const { settings } = useSettingsStore();

  const loadFavs = () => {
    getFavorites().then(setFavorites);
  };

  useEffect(() => {
    loadFavs();
  }, []);

  const filtered = favorites
    .filter((f) => {
      if (filterType !== 'all' && f.type !== filterType) return false;
      if (search && !f.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });

  const categories = [
    { id: 'all', label: 'Все' },
    { id: 'movie', label: 'Фильмы' },
    { id: 'series', label: 'Сериалы' },
    { id: 'anime', label: 'Аниме' },
    { id: 'cartoon', label: 'Мультфильмы' },
  ];

  return (
    <div className="space-y-6 pb-16 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#292B32] pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center space-x-2">
            <Heart className="w-7 h-7 text-[#E50914] fill-current" />
            <span>Моё избранное</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/30">
              {favorites.length}
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Ваша персональная коллекция сохраненных фильмов и сериалов
          </p>
        </div>

        {/* Filter Categories */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar bg-[#17181D] p-1.5 rounded-2xl border border-[#292B32]">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilterType(c.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterType === c.id
                  ? 'bg-[#E50914] text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-[#1D1F26]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search and Sort Toolbar */}
      {favorites.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Поиск по избранному..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#17181D] border border-[#292B32] text-xs text-zinc-200 rounded-xl py-2 pl-9 pr-3 focus:outline-none focus:border-[#E50914]"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            <span className="text-xs text-zinc-400 flex items-center space-x-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Сортировка:</span>
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#17181D] border border-[#292B32] text-xs text-zinc-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#E50914]"
            >
              <option value="date">По дате добавления</option>
              <option value="rating">По рейтингу</option>
              <option value="title">По названию</option>
            </select>
          </div>
        </div>
      )}

      {/* Grid of Favorites */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((fav) => {
            const mediaItem: MediaItem = {
              id: fav.mediaId,
              title: fav.title,
              url: `/watch/${fav.mediaId}`,
              poster: fav.poster,
              year: fav.year,
              rating: fav.rating,
              type: fav.type,
              genres: fav.genres,
            };
            return (
              <MediaCard
                key={fav.id}
                item={mediaItem}
                size={settings.cardSize}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-[#17181D] rounded-3xl border border-[#292B32] space-y-3">
          <Heart className="w-12 h-12 text-zinc-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">Список избранного пуст</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Добавляйте понравившиеся фильмы и сериалы в избранное, нажимая на иконку сердечка на карточках.
          </p>
        </div>
      )}
    </div>
  );
};
