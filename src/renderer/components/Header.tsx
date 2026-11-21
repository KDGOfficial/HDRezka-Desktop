import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, Sparkles, X, Star, Settings, Globe } from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';
import { debounce } from '../../shared/utils';
import appLogo from '../assets/logo.png';

export const Header: React.FC = () => {
  const { searchQuery, setSearchQuery, setPage, openDetails, openBrowser } = useMediaStore();
  const { updateInfo, setUpdateModalOpen } = useSettingsStore();
  const { t } = useTranslation();

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [suggestions, setSuggestions] = useState<Array<{ title: string; url: string; rating?: number; poster?: string }>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Keyboard shortcut Ctrl+K or / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && document.activeElement?.tagName !== 'INPUT')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
        setIsOpen(true);
      } catch {
        setSuggestions([]);
        setIsOpen(true);
      }
    }, 220)
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
    <header className="h-16 w-full border-b border-white/5 px-8 flex items-center justify-between relative z-40 bg-[#08080c]/80 backdrop-blur-xl">
      {/* Search Bar */}
      <div className="relative w-full max-w-md" ref={dropdownRef}>
        <div className="flex items-center bg-[#12131a] border border-white/10 rounded-2xl px-3.5 py-2 text-xs focus-within:border-brand-red focus-within:ring-2 focus-within:ring-brand-red/30 transition-all shadow-inner">
          <Search className="w-4 h-4 text-zinc-400 mr-2 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={localQuery}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t.header.searchPlaceholder}
            className="bg-transparent border-none outline-none text-white w-full placeholder-zinc-500 text-xs"
          />

          {localQuery ? (
            <button
              onClick={() => {
                setLocalQuery('');
                setSuggestions([]);
                setIsOpen(false);
              }}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-medium text-zinc-500 bg-white/5 border border-white/10 rounded">
              Ctrl+K
            </kbd>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {isOpen && localQuery.trim() && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#12131a] border border-white/10 rounded-2xl shadow-elevated overflow-hidden z-50 animate-fadeIn">
            <div className="p-1.5 space-y-0.5 max-h-72 overflow-y-auto">
              {suggestions.length > 0 ? (
                suggestions.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectSuggestion(item)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs text-zinc-300 hover:text-white hover:bg-white/10 transition-colors group"
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-red opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="truncate group-hover:text-white font-medium">{item.title}</span>
                    </div>
                    {item.rating && (
                      <span className="flex items-center text-[11px] font-bold text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded-lg border border-amber-500/20 flex-shrink-0 ml-2">
                        <Star className="w-3 h-3 mr-1 fill-amber-400" />
                        {item.rating}
                      </span>
                    )}
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-center text-xs text-zinc-400">
                  Ничего не найдено в каталоге зеркал для «{localQuery.trim()}»
                </div>
              )}
            </div>
            <div className="p-2.5 border-t border-white/5 bg-black/40 flex flex-col gap-1.5 text-center">
              {suggestions.length > 0 && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setSearchQuery(localQuery.trim());
                    setPage('search');
                  }}
                  className="text-xs text-brand-red hover:text-brand-redHover font-bold transition-colors"
                >
                  {t.header.showAll} "{localQuery}"
                </button>
              )}
              <button
                onClick={() => {
                  setIsOpen(false);
                  openBrowser(localQuery.trim());
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-white/5 hover:bg-brand-red/20 border border-white/10 hover:border-brand-red/40 text-xs font-bold text-zinc-200 hover:text-white transition-all cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-brand-red" />
                <span>Найти «{localQuery.trim()}» в интернете (браузер)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-3">
        {/* Updates button */}
        {updateInfo?.hasUpdate ? (
          <button
            onClick={() => setUpdateModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white font-bold text-xs shadow-glow transition-all active:scale-95 animate-pulse"
            title={t.header.updateAvailable}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">v{updateInfo.latestVersion}</span>
          </button>
        ) : (
          <button
            onClick={() => setPage('settings')}
            className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors relative"
            title={t.header.notifications}
          >
            <Bell className="w-4 h-4" />
          </button>
        )}

        {/* Settings button */}
        <button
          onClick={() => setPage('settings')}
          className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          title={t.nav.settings}
        >
          <Settings className="w-4 h-4 hover:rotate-45 transition-transform" />
        </button>

        {/* Logo Avatar Miniature */}
        <div
          onClick={() => setPage('settings')}
          className="cursor-pointer pl-2 border-l border-white/10"
          title="HDREZKA Desktop"
        >
          <img
            src={appLogo}
            alt="HDRezka"
            className="w-8 h-8 rounded-full object-cover border border-brand-red/50 shadow-glow-sm hover:scale-105 transition-transform"
          />
        </div>
      </div>
    </header>
  );
};
