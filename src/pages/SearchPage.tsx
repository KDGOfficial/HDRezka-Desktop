import React, { useState, useEffect } from 'react';
import { Search, X, History, Sparkles, Clock } from 'lucide-react';
import { useNavigationStore } from '../stores/navigationStore';
import { searchMedia } from '../services/api';
import { MediaItem } from '../types/media';
import { MediaCard } from '../components/cards/MediaCard';
import { CardSkeleton } from '../components/cards/CardSkeleton';
import { useSettingsStore } from '../stores/settingsStore';

const POPULAR_QUERIES = [
  'Дюна',
  'Одни из нас',
  'Очень странные дела',
  'Интерстеллар',
  'Атака титанов',
  'Пацаны',
  'Оппенгеймер',
  'Клинок, рассекающий демонов',
];

export const SearchPage: React.FC = () => {
  const { searchQuery, setSearchQuery } = useNavigationStore();
  const [query, setQuery] = useState(searchQuery);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const { settings } = useSettingsStore();

  useEffect(() => {
    const saved = localStorage.getItem('hdrezka_search_history');
    if (saved) {
      setSearchHistory(JSON.parse(saved));
    }
  }, []);

  const saveQueryToHistory = (q: string) => {
    if (!q.trim()) return;
    const filtered = searchHistory.filter((item) => item.toLowerCase() !== q.toLowerCase());
    const next = [q, ...filtered].slice(0, 10);
    setSearchHistory(next);
    localStorage.setItem('hdrezka_search_history', JSON.stringify(next));
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('hdrezka_search_history');
  };

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const debounce = setTimeout(() => {
      saveQueryToHistory(query.trim());
      searchMedia(query.trim()).then((res) => {
        setResults(res.items);
        setIsLoading(false);
      });
    }, 350);

    return () => clearTimeout(debounce);
  }, [query]);

  return (
    <div className="space-y-6 pb-16 animate-fade-in">
      {/* Search Input Box */}
      <div className="relative max-w-2xl mx-auto pt-4">
        <div className="relative flex items-center">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchQuery(e.target.value);
            }}
            placeholder="Введите название фильма, сериала, аниме или имя актера..."
            className="w-full bg-[#17181D] border border-[#292B32] focus:border-[#E50914] focus:ring-2 focus:ring-[#E50914]/30 rounded-2xl py-4 pl-12 pr-12 text-sm text-white placeholder-zinc-500 shadow-2xl transition-all outline-none"
          />
          <Search className="w-5 h-5 text-zinc-400 absolute left-4 pointer-events-none" />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setSearchQuery('');
              }}
              className="absolute right-4 text-zinc-400 hover:text-white p-1 rounded-full cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Query Suggestions & Recent History */}
      {!query && (
        <div className="max-w-2xl mx-auto space-y-6 pt-2">
          {/* History */}
          {searchHistory.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center space-x-1.5 font-bold">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>История поиска</span>
                </span>
                <button
                  onClick={clearHistory}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Очистить
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {searchHistory.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setQuery(item);
                      setSearchQuery(item);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#17181D] hover:bg-[#1D1F26] border border-[#292B32] text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popular */}
          <div className="space-y-2">
            <span className="flex items-center space-x-1.5 text-xs text-zinc-400 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Популярные запросы</span>
            </span>

            <div className="flex flex-wrap gap-2">
              {POPULAR_QUERIES.map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setQuery(item);
                    setSearchQuery(item);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#17181D] hover:bg-[#1D1F26] border border-[#292B32] text-xs text-zinc-300 hover:text-[#E50914] transition-colors cursor-pointer"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results Header */}
      {query && (
        <div className="flex items-center justify-between border-b border-[#292B32] pb-3">
          <div className="text-sm font-bold text-white">
            Результаты по запросу «<span className="text-[#E50914]">{query}</span>»
          </div>
          <span className="text-xs text-zinc-400">
            Найдено: {results.length}
          </span>
        </div>
      )}

      {/* Results Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} size={settings.cardSize} />
            ))
          : results.map((item) => (
              <MediaCard key={item.id} item={item} size={settings.cardSize} />
            ))}
      </div>

      {/* Empty State */}
      {query && !isLoading && results.length === 0 && (
        <div className="text-center py-20 bg-[#17181D] rounded-3xl border border-[#292B32] space-y-3">
          <Sparkles className="w-12 h-12 text-zinc-500 mx-auto" />
          <h3 className="text-lg font-bold text-white">Ничего не найдено</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            К сожалению, по запросу «{query}» совпадений не обнаружено. Проверьте правильность написания.
          </p>
        </div>
      )}
    </div>
  );
};
