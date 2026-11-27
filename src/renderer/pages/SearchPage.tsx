import React, { useState, useEffect, useMemo } from 'react';
import { Search, History, X, Globe, ArrowDownWideNarrow, ArrowUpNarrowWide, Calendar, Star, Eye, Wand2 } from 'lucide-react';
import { MediaCard } from '../components/MediaCard';
import { MediaItem, SearchHistoryEntry } from '../../shared/types';
import { useMediaStore } from '../stores/useMediaStore';
import { useTranslation } from '../i18n';
import { getT9Correction, sortMediaItems, SearchSortBy, SortDirection } from '../../shared/utils';
import appLogo from '../assets/logo.png';

export const SearchPage: React.FC = () => {
  const { searchQuery, setSearchQuery, openBrowser } = useMediaStore();
  const { t } = useTranslation();
  const [query, setQuery] = useState(searchQuery);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sortBy, setSortBy] = useState<SearchSortBy>('relevance');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [t9Applied, setT9Applied] = useState<string | null>(null);

  const t9Hint = useMemo(
    () => getT9Correction(query, history.map((h) => h.query)),
    [query, history]
  );

  const sortedResults = useMemo(
    () => sortMediaItems(results, sortBy, sortDir),
    [results, sortBy, sortDir]
  );

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
    setT9Applied(null);
    try {
      window.api.addSearchHistory(q);
      let res = await window.api.searchAdvanced(q, pageNum);
      if (pageNum === 1 && (!res.items || res.items.length === 0)) {
        const hint = getT9Correction(q, history.map((h) => h.query));
        if (hint && hint.suggestion.toLowerCase() !== q.toLowerCase()) {
          const altRes = await window.api.searchAdvanced(hint.suggestion, 1);
          if (altRes.items && altRes.items.length > 0) {
            res = altRes;
            setT9Applied(hint.suggestion);
          }
        }
      }
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
      {/* Spotlight Search Hero */}
      <div className="max-w-2xl mx-auto mb-9">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="flex items-center cinema-panel rounded-full p-2 pl-5 focus-within:border-brand-ember focus-within:ring-2 focus-within:ring-brand-crimson/25">
            <Search className="w-5 h-5 text-brand-orange mr-3 flex-shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && t9Hint) {
                  e.preventDefault();
                  setQuery(t9Hint.suggestion);
                }
              }}
              aria-label={t.search.placeholder}
              placeholder={t.search.placeholder}
              className="bg-transparent border-none outline-none text-white w-full text-sm placeholder-zinc-500 font-semibold"
              autoFocus
            />
            {query && (
              <button
                type="button"
                aria-label={t.common.clear}
                onClick={() => {
                  setQuery('');
                  setResults([]);
                }}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white mr-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full btn-ember text-white font-display font-black text-xs uppercase tracking-wider active:scale-95 flex-shrink-0 cursor-pointer"
            >
              {t.nav.search}
            </button>
          </div>
        </form>

        {/* T9 Live Correction Hint */}
        {t9Hint && query.trim().toLowerCase() !== t9Hint.suggestion.toLowerCase() && (
          <div className="mt-2.5 flex items-center gap-2 px-4 py-2 rounded-2xl cinema-panel text-xs">
            <Wand2 className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" aria-hidden="true" />
            <span className="text-zinc-400">{t.search.t9DidYouMean}</span>
            <button
              type="button"
              onClick={() => {
                setQuery(t9Hint.suggestion);
                setSearchQuery(t9Hint.suggestion);
                performSearch(t9Hint.suggestion, 1);
              }}
              className="font-extrabold text-brand-orange hover:underline cursor-pointer"
            >
              «{t9Hint.suggestion}»
            </button>
          </div>
        )}

        {/* Recent Search Chips */}
        {history.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2 overflow-x-auto pr-2 pb-1 scrollbar-none">
              <span className="text-[11px] font-bold text-zinc-500 flex items-center flex-shrink-0">
                <History className="w-3.5 h-3.5 mr-1 text-brand-orange" />
                {t.search.recentQueries}:
              </span>
              {history.slice(0, 6).map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleHistoryClick(h.query)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 text-xs border border-white/[0.08] flex-shrink-0 cursor-pointer"
                >
                  <span>{h.query}</span>
                  <X
                    className="w-3 h-3 text-zinc-500 hover:text-brand-crimson"
                    onClick={(e) => handleDeleteHistory(e, h.query)}
                  />
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleClearHistory}
              className="text-[11px] text-zinc-500 hover:text-brand-orange whitespace-nowrap ml-2 flex-shrink-0 font-bold cursor-pointer"
            >
              {t.search.clearHistory}
            </button>
          </div>
        )}
      </div>

      {/* Results Header & Sorting Bar */}
      {searchQuery && !loading && (
        <div className="mb-6 pb-3.5 border-b border-white/[0.06] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-black text-white">
              {t.search.resultsFor} <span className="text-ember-gradient">«{t9Applied || searchQuery}»</span>
            </h1>
            <span className="text-xs text-zinc-400 font-mono">
              {t.search.foundCount}: {results.length}
              {t9Applied ? t.search.t9CorrectedFrom.replace('{query}', searchQuery) : ''}
            </span>
          </div>

          {results.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5">
              {([
                { id: 'relevance', label: t.search.sortRelevance, icon: null },
                { id: 'year', label: t.search.sortYear, icon: Calendar },
                { id: 'rating', label: t.search.sortRating, icon: Star },
                { id: 'views', label: t.search.sortViews, icon: Eye },
              ] as const).map((opt) => {
                const Icon = opt.icon;
                const active = sortBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      if (active && opt.id !== 'relevance') {
                        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
                      } else {
                        setSortBy(opt.id);
                        setSortDir('desc');
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                      active
                        ? 'btn-ember text-white'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 hover:text-white'
                    }`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}

              {sortBy !== 'relevance' && (
                <button
                  type="button"
                  onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                  title={sortDir === 'desc' ? t.search.sortDesc : t.search.sortAsc}
                  aria-label={sortDir === 'desc' ? t.search.sortDesc : t.search.sortAsc}
                  className="p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-brand-orange cursor-pointer"
                >
                  {sortDir === 'desc' ? (
                    <ArrowDownWideNarrow className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowUpNarrowWide className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-[3px] border-brand-crimson/20 border-t-brand-orange border-r-brand-crimson animate-spin" />
            <img src={appLogo} alt="" className="w-10 h-10 rounded-full object-cover shadow-glow" />
          </div>
          <span className="text-zinc-400 text-xs font-bold">{t.home.loadingCatalog}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
          <div className="w-16 h-16 rounded-3xl cinema-panel flex items-center justify-center mb-4">
            <Search className="w-7 h-7 text-brand-orange" />
          </div>
          <p className="font-display text-base font-black text-zinc-200">
            {searchQuery ? t.search.noResults : t.search.startTyping}
          </p>
          {searchQuery && (
            <>
              <p className="text-xs text-zinc-400 mt-1.5 max-w-sm text-center leading-relaxed">
                {t.search.noResultsDesc}
              </p>
              <button
                type="button"
                onClick={() => openBrowser(searchQuery)}
                className="mt-6 flex items-center gap-2 px-6 py-3 rounded-full btn-ember text-white text-xs font-display font-black uppercase tracking-wider active:scale-95 cursor-pointer"
              >
                <Globe className="w-4 h-4" />
                <span>{t.search.findInGoogleBrowser.replace('{query}', searchQuery)}</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Results Grid */}
      {!loading && results.length > 0 && (
        <>
          <div className="cinema-grid">
            {sortedResults.map((item, idx) => (
              <div key={item.id ? `${item.id}-${idx}` : idx} className="flex justify-center">
                <MediaCard item={item} />
              </div>
            ))}
          </div>

          <div className="mt-9 p-5 rounded-3xl cinema-panel flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-zinc-300 font-medium">
              {t.search.notFoundBanner}
            </div>
            <button
              type="button"
              onClick={() => openBrowser(query.trim() || searchQuery)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.06] hover:bg-brand-crimson/20 border border-white/[0.1] hover:border-brand-ember/50 text-xs font-bold text-white cursor-pointer flex-shrink-0"
            >
              <Globe className="w-3.5 h-3.5 text-brand-orange" />
              <span>{t.search.findInGoogleEmbedded}</span>
            </button>
          </div>
        </>
      )}

      {/* Load More */}
      {!loading && hasMore && results.length > 0 && (
        <div className="flex justify-center mt-10">
          <button
            type="button"
            onClick={() => performSearch(searchQuery, page + 1)}
            className="px-7 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white active:scale-95 cursor-pointer"
          >
            {t.search.loadMore}
          </button>
        </div>
      )}
    </div>
  );
};
