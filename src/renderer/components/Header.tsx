import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, Sparkles, X, Star } from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';
import { debounce } from '../../shared/utils';

export const Header: React.FC = () => {
  const { searchQuery, setSearchQuery, setPage, openDetails } = useMediaStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [suggestions, setSuggestions] = useState<Array<{ title: string; url: string; rating?: number }>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search for suggestions
  const fetchSuggestions = useRef(
    debounce(async (query: string) => {
      if (!query.trim() || !window.api) {
        setSuggestions([]);
        return;
      }
      try {
        const results = await window.api.searchFast(query);
        setSuggestions(results);
        setIsOpen(results.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 250)
  ).current;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalQuery(val);
    if (val.trim()) {
      fetchSuggestions(val);
    } else {
      setSuggestions([]);
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && localQuery.trim()) {
      setIsOpen(false);
      setSearchQuery(localQuery.trim());
      setPage('search');
    }
  };

  const handleSelectSuggestion = (item: any) => {
    setIsOpen(false);
    openDetails(item.url, item);
  };

  return (
    <header className="h-16 w-full border-b border-dark-border px-6 flex items-center justify-between relative z-40 bg-dark-bg/60 backdrop-blur-md">
      {/* Search Bar */}
      <div className="relative w-96" ref={dropdownRef}>
        <div className="flex items-center bg-dark-surface border border-white/10 rounded-xl px-3 py-2 text-sm focus-within:border-brand-red focus-within:ring-1 focus-within:ring-brand-red transition-all">
          <Search className="w-4 h-4 text-zinc-400 mr-2 flex-shrink-0" />
          <input
            type="text"
            value={localQuery}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Поиск фильмов, сериалов, аниме..."
            className="bg-transparent border-none outline-none text-white w-full placeholder-zinc-500 text-sm"
          />
          {localQuery && (
            <button
              onClick={() => {
                setLocalQuery('');
                setSuggestions([]);
                setIsOpen(false);
              }}
              className="text-zinc-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {isOpen && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-dark-surface border border-dark-border rounded-xl shadow-card overflow-hidden z-50">
            <div className="p-1.5 space-y-0.5">
              {suggestions.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectSuggestion(item)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm text-zinc-300 hover:text-white hover:bg-dark-surfaceLight transition-colors"
                >
                  <span className="truncate pr-2">{item.title}</span>
                  {item.rating && (
                    <span className="flex items-center text-xs font-semibold text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/20 flex-shrink-0">
                      <Star className="w-3 h-3 mr-1 fill-amber-400" />
                      {item.rating}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="p-2 border-t border-dark-border bg-dark-surfaceLight/50 text-center">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setSearchQuery(localQuery.trim());
                  setPage('search');
                }}
                className="text-xs text-brand-red hover:underline font-medium"
              >
                Показать все результаты для "{localQuery}"
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => setPage('settings')}
          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-dark-surfaceLight transition-colors relative"
          title="Обновления и статус"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-red" />
        </button>

        <div className="flex items-center space-x-2 pl-2 border-l border-white/10">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-red to-orange-500 flex items-center justify-center font-bold text-xs text-white shadow-glow">
            HD
          </div>
        </div>
      </div>
    </header>
  );
};
