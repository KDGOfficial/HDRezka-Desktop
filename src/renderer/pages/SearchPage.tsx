import React, { useState, useEffect } from 'react';
import { Search, History, Trash2, X, Star } from 'lucide-react';
import { MediaCard } from '../components/MediaCard';
import { MediaItem, SearchHistoryEntry } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';

export const SearchPage: React.FC = () => {
  const { searchQuery, setSearchQuery } = useMediaStore();
  const [query, setQuery] = useState(searchQuery);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    loadSearchHistory();
    if (searchQuery) {
      setQuery(searchQuery);
      performSearch(searchQuery, 1);
    }
  }, [searchQuery]);

  const loadSearchHistory = async () => {
    if (window.api) {
      const h = await window.api.getSearchHistory();
      setHistory(h);
    }
  };

  const performSearch = async (searchStr: string, pageNum = 1) => {
    const q = searchStr.trim();
    if (!q || !window.api) return;

    setLoading(true);
    try {
      window.api.addSearchHistory(q);
      const res = await window.api.searchAdvanced(q, pageNum);
      if (pageNum === 1) {
        setResults(res.items);
      } else {
        setResults((prev) => [...prev, ...res.items]);
      }
      setHasMore(res.hasMore);
      setPage(pageNum);
      loadSearchHistory();
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchQuery(query.trim());
      performSearch(query.trim(), 1);
    }
  };

  const handleHistoryClick = (histQuery: string) => {
    setQuery(histQuery);
    setSearchQuery(histQuery);
    performSearch(histQuery, 1);
  };

  const handleDeleteHistory = async (e: React.MouseEvent, histQuery: string) => {
    e.stopPropagation();
    if (window.api) {
      await window.api.deleteSearchHistory(histQuery);
      setHistory((prev) => prev.filter((h) => h.query !== histQuery));
    }
  };

  const handleClearHistory = async () => {
    if (window.api) {
      await window.api.clearSearchHistory();
      setHistory([]);
    }
  };

  return (
    <div className="w-full pb-16 text-left select-none">
      {/* Search Bar Form */}
      <div className="max-w-2xl mx-auto mb-8">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="flex items-center bg-dark-surface border border-white/10 rounded-2xl p-2 shadow-card focus-within:border-brand-red focus-within:ring-2 focus-within:ring-brand-red/30 transition-all">
            <Search className="w-5 h-5 text-zinc-400 ml-3 mr-3" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию, оригиналу, актерам..."
              className="bg-transparent border-none outline-none text-white w-full text-base placeholder-zinc-500"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                }}
                className="p-2 text-zinc-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-brand-red hover:bg-brand-redHover text-white font-bold text-sm shadow-glow transition-all"
            >
              Найти
            </button>
          </div>
        </form>

        {/* Recent Search Queries */}
        {history.length > 0 && !results.length && (
          <div className="mt-6 bg-dark-surface border border-white/5 rounded-2xl p-4 shadow-card">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center">
                <History className="w-3.5 h-3.5 mr-1.5" /> История поиска
              </span>
              <button
                onClick={handleClearHistory}
                className="text-xs text-zinc-500 hover:text-brand-red transition-colors"
              >
                Очистить
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {history.map((h, i) => (
                <div
                  key={i}
                  onClick={() => handleHistoryClick(h.query)}
                  className="group flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-dark-surfaceLight hover:bg-dark-surfaceHover text-xs text-zinc-300 font-medium cursor-pointer transition-colors"
                >
                  <span>{h.query}</span>
                  <button
                    onClick={(e) => handleDeleteHistory(e, h.query)}
                    className="text-zinc-500 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results Header */}
      {query && (
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-dark-border">
          <h2 className="text-xl font-bold text-white">
            Результаты поиска {query ? `«${query}»` : ''}
          </h2>
          <span className="text-xs text-zinc-400">
            {results.length} найдено
          </span>
        </div>
      )}

      {/* Results Grid */}
      {loading && results.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-zinc-500 text-sm">Ищем на HDRezka...</span>
        </div>
      ) : results.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {results.map((item, idx) => (
              <div key={`${item.id}-${idx}`} className="flex justify-center">
                <MediaCard item={item} />
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-10">
              <button
                onClick={() => performSearch(query, page + 1)}
                disabled={loading}
                className="px-8 py-3 rounded-xl bg-dark-surface border border-white/10 hover:border-brand-red text-sm font-semibold text-white transition-all shadow-card disabled:opacity-50"
              >
                {loading ? 'Загрузка...' : 'Загрузить ещё'}
              </button>
            </div>
          )}
        </>
      ) : query && !loading ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-base font-semibold">По запросу «{query}» ничего не найдено</p>
          <p className="text-xs text-zinc-600 mt-1">Проверьте правильность написания или попробуйте другое название</p>
        </div>
      ) : null}
    </div>
  );
};
