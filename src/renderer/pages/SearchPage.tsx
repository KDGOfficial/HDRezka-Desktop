import React, { useState, useEffect } from 'react';
import { Search, History, Trash2, X, Star, Globe } from 'lucide-react';
import { MediaCard } from '../components/MediaCard';
import { MediaItem, SearchHistoryEntry } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { useTranslation } from '../i18n';

export const SearchPage: React.FC = () => {
  const { searchQuery, setSearchQuery, openBrowser } = useMediaStore();
  const { t } = useTranslation();
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
    <div className="w-full pb-16 text-left select-none animate-fadeIn">
      {/* Search Input Box */}
      <div className="max-w-2xl mx-auto mb-8">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="flex items-center bg-[#12131a] border border-white/10 rounded-2xl p-2 shadow-card focus-within:border-brand-red focus-within:ring-2 focus-within:ring-brand-red/30 transition-all">
            <Search className="w-5 h-5 text-zinc-400 ml-3 mr-3 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search.placeholder}
              className="bg-transparent border-none outline-none text-white w-full text-sm placeholder-zinc-500 font-medium"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                }}
                className="p-1 rounded-lg text-zinc-400 hover:text-white mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white font-bold text-xs shadow-glow transition-all active:scale-95 flex-shrink-0"
            >
              {t.nav.search}
            </button>
          </div>
        </form>

        {/* History Chips */}
        {history.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center space-x-2 overflow-x-auto pr-2 pb-1">
              <span className="text-[11px] font-bold text-zinc-500 flex items-center flex-shrink-0">
                <History className="w-3.5 h-3.5 mr-1" />
                {t.search.recentQueries}:
              </span>
              {history.slice(0, 6).map((h, i) => (
                <button
                  key={i}
                  onClick={() => handleHistoryClick(h.query)}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs border border-white/5 transition-colors group flex-shrink-0"
                >
                  <span>{h.query}</span>
                  <X
                    className="w-3 h-3 text-zinc-500 hover:text-brand-red ml-1"
                    onClick={(e) => handleDeleteHistory(e, h.query)}
                  />
                </button>
              ))}
            </div>

            <button
              onClick={handleClearHistory}
              className="text-[10px] text-zinc-500 hover:text-brand-red whitespace-nowrap ml-2 flex-shrink-0 font-medium"
            >
              {t.search.clearHistory}
            </button>
          </div>
        )}
      </div>

      {/* Results Header */}
      {searchQuery && !loading && (
        <div className="mb-6 flex items-center justify-between pb-3 border-b border-white/5">
          <h2 className="text-base font-bold text-white">
            {t.search.resultsFor} <span className="text-brand-red">"{searchQuery}"</span>
          </h2>
          <span className="text-xs text-zinc-400 font-mono">
            {t.search.foundCount}: {results.length}
          </span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-12 h-12 border-4 border-brand-red/20 border-t-brand-red rounded-full animate-spin mb-3" />
          <span className="text-zinc-500 text-xs font-semibold">{t.home.loadingCatalog}</span>
        </div>
      )}

      {/* Empty / Initial State */}
      {!loading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
          <Search className="w-16 h-16 text-zinc-700 mb-3" />
          <p className="text-base font-bold text-zinc-400">
            {searchQuery ? t.search.noResults : t.search.startTyping}
          </p>
          {searchQuery && (
            <>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm text-center leading-relaxed">
                {t.search.noResultsDesc}
              </p>
              <button
                onClick={() => openBrowser(searchQuery)}
                className="mt-5 flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white text-xs font-black shadow-glow transition-all active:scale-95 cursor-pointer"
              >
                <Globe className="w-4 h-4" />
                <span>Найти «{searchQuery}» в интернете (кино-браузер)</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Results Grid */}
      {!loading && results.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {results.map((item, idx) => (
              <div key={item.id ? `${item.id}-${idx}` : idx} className="flex justify-center">
                <MediaCard item={item} />
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 rounded-2xl bg-[#12131a] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">
              Не нашли нужный фильм, сериал или озвучку в списке выше?
            </div>
            <button
              onClick={() => openBrowser(query.trim() || searchQuery)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-brand-red/20 border border-white/10 hover:border-brand-red/40 text-xs font-bold text-white transition-all cursor-pointer flex-shrink-0"
            >
              <Globe className="w-3.5 h-3.5 text-brand-red" />
              <span>Найти в интернете (встроенный браузер)</span>
            </button>
          </div>
        </>
      )}

      {/* Load More Button */}
      {!loading && hasMore && results.length > 0 && (
        <div className="flex justify-center mt-10">
          <button
            onClick={() => performSearch(searchQuery, page + 1)}
            className="px-6 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition-all active:scale-95 shadow-sm"
          >
            {t.search.loadMore}
          </button>
        </div>
      )}
    </div>
  );
};
