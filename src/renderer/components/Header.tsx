import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Bell, Sparkles, X, Star, Settings, Globe, ArrowLeft, ArrowRight, Film, Sun, Moon, Wand2 } from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';
import { debounce, getT9Correction, matchesShortcut, formatShortcutLabel, parseShortcut } from '../../shared/utils';
import { DEFAULT_HOTKEYS } from '../../shared/constants';
import appLogo from '../assets/logo.png';

export const Header: React.FC = () => {
  const {
    currentPage,
    navIndex,
    navHistory,
    goBack,
    goForward,
    searchQuery,
    setSearchQuery,
    setPage,
    openDetails,
    openBrowser,
    watchHistory,
  } = useMediaStore();
  const canGoBack = navIndex > 0;
  const canGoForward = navIndex < navHistory.length - 1;
  const { settings, updateSettings, updateInfo, setUpdateModalOpen } = useSettingsStore();
  const { t } = useTranslation();

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [suggestions, setSuggestions] = useState<Array<{ title: string; url: string; rating?: number; poster?: string }>>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [usedT9Query, setUsedT9Query] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.api?.getSearchHistory?.(20).then((hist) => {
      if (Array.isArray(hist)) setRecentQueries(hist.map((h) => h.query));
    }).catch(() => {});
  }, []);

  const t9Corpus = useMemo(
    () => [...recentQueries, ...watchHistory.map((h) => h.title)],
    [recentQueries, watchHistory]
  );

  const t9Hint = useMemo(() => getT9Correction(localQuery, t9Corpus), [localQuery, t9Corpus]);

  const resolvedIsLight =
    settings.theme === 'light' ||
    (settings.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: light)').matches);

  const handleToggleTheme = () => {
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    const target: 'light' | 'dark' = resolvedIsLight ? 'dark' : 'light';
    const nextTheme = (target === 'light') === Boolean(prefersLight) ? 'system' : target;
    updateSettings({ theme: nextTheme });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const focusSearchBinding = settings.hotkeys?.focusSearch || DEFAULT_HOTKEYS.focusSearch;
  const focusSearchLabel = formatShortcutLabel(focusSearchBinding);

  // Keyboard shortcut (customizable, default Ctrl+K) or / to focus search
  useEffect(() => {
    const parsedBinding = parseShortcut(focusSearchBinding);
    const hasModifier = Boolean(parsedBinding?.ctrl || parsedBinding?.alt);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.documentElement.dataset.recordingShortcut === 'true') return;
      if (usePlayerStore.getState().isOpen) return;
      const activeEl = document.activeElement as HTMLElement | null;
      const isEditing =
        Boolean(activeEl) &&
        (activeEl!.tagName === 'INPUT' || activeEl!.tagName === 'TEXTAREA' || activeEl!.isContentEditable);
      const matchesFocusBinding = matchesShortcut(e, focusSearchBinding) && (hasModifier || !isEditing);
      const matchesSlash = e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey && !isEditing;
      if (matchesFocusBinding || matchesSlash) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusSearchBinding]);

  const fetchSuggestions = useRef(
    debounce(async (query: string, corpus: string[]) => {
      if (!query.trim() || !window.api) {
        setSuggestions([]);
        setUsedT9Query(null);
        return;
      }
      try {
        let results = await window.api.searchFast(query);
        let appliedT9: string | null = null;
        if ((!results || results.length === 0)) {
          const hint = getT9Correction(query, corpus);
          if (hint && hint.suggestion.toLowerCase() !== query.trim().toLowerCase()) {
            const altResults = await window.api.searchFast(hint.suggestion);
            if (altResults && altResults.length > 0) {
              results = altResults;
              appliedT9 = hint.suggestion;
            }
          }
        }
        setSuggestions(results || []);
        setUsedT9Query(appliedT9);
        setIsOpen(true);
      } catch {
        setSuggestions([]);
        setUsedT9Query(null);
        setIsOpen(true);
      }
    }, 220)
  ).current;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalQuery(val);
    if (val.trim()) {
      fetchSuggestions(val, t9Corpus);
    } else {
      setSuggestions([]);
      setUsedT9Query(null);
      setIsOpen(false);
    }
  };

  const applyT9Suggestion = (text: string) => {
    setLocalQuery(text);
    setUsedT9Query(null);
    fetchSuggestions(text, t9Corpus);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && t9Hint) {
      e.preventDefault();
      applyT9Suggestion(t9Hint.suggestion);
    } else if (e.key === 'Enter' && localQuery.trim()) {
      setIsOpen(false);
      const effectiveQuery =
        usedT9Query || (t9Hint?.reason === 'layout' ? t9Hint.suggestion : localQuery.trim());
      setLocalQuery(effectiveQuery);
      setSearchQuery(effectiveQuery);
      setPage('search');
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleSelectSuggestion = (item: any) => {
    setIsOpen(false);
    openDetails(item.url, item);
  };

  return (
    <header className="app-header h-16 w-full border-b border-white/[0.06] px-7 lg:px-9 flex items-center justify-between gap-4 relative z-40 bg-[#0B070A]/92 backdrop-blur-2xl flex-shrink-0">
      {/* Left: Back / Forward Navigation (preserves scroll & filters) + Spotlight Search */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {(canGoBack || canGoForward || currentPage === 'details') && (
          <div className="inline-flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => (canGoBack ? goBack() : setPage('home'))}
              disabled={!canGoBack && currentPage !== 'details'}
              aria-label={t.player.back}
              title={`${t.player.back} (Mouse4)`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-35 border border-white/[0.08] text-xs font-bold text-zinc-200 hover:text-white cursor-pointer disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-brand-orange" />
              {currentPage === 'details' && <span className="hidden sm:inline">{t.player.back}</span>}
            </button>
            {canGoForward && (
              <button
                type="button"
                onClick={() => goForward()}
                aria-label={t.header.forward}
                title={t.header.forwardTooltip}
                className="inline-flex items-center justify-center p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-200 hover:text-white cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5 text-brand-orange" />
              </button>
            )}
          </div>
        )}

        {/* Spotlight Cinema Search */}
        <div className="relative w-full max-w-lg" ref={dropdownRef}>
          <div className="search-input-shell flex items-center bg-[#150E13] border border-white/[0.12] rounded-full px-4 py-2 text-xs focus-within:border-brand-ember focus-within:ring-2 focus-within:ring-brand-crimson/25 shadow-inner">
            <Search className="w-4 h-4 text-zinc-400 mr-2.5 flex-shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={localQuery}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              aria-label={t.header.searchPlaceholder}
              placeholder={t.header.searchPlaceholder}
              className="bg-transparent border-none outline-none text-white w-full placeholder-zinc-500 text-xs font-medium"
            />

            {localQuery ? (
              <button
                type="button"
                aria-label={t.common.clearSearch}
                onClick={() => {
                  setLocalQuery('');
                  setSuggestions([]);
                  setUsedT9Query(null);
                  setIsOpen(false);
                }}
                className="text-zinc-400 hover:text-white cursor-pointer p-0.5 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-semibold text-zinc-400 bg-white/[0.06] border border-white/[0.08] rounded-full whitespace-nowrap">
                {focusSearchLabel}
              </kbd>
            )}
          </div>

          {/* 100% Opaque Autocomplete Dropdown with T9 + Poster Thumbnails */}
          {isOpen && localQuery.trim() && (
            <div className="absolute top-full left-0 right-0 mt-2.5 search-dropdown-solid rounded-3xl overflow-hidden z-50 animate-fadeIn">
              {/* T9 Auto-layout / Typo / Predictive Suggestion Bar */}
              {(t9Hint || usedT9Query) && (
                <div className="px-3.5 py-2 border-b border-white/[0.08] bg-brand-crimson/[0.09] flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wand2 className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" aria-hidden="true" />
                    <span className="text-zinc-400 truncate">
                      {usedT9Query ? t.search.t9AutoFix : t.search.t9Hint}
                    </span>
                    <button
                      type="button"
                      onClick={() => applyT9Suggestion(usedT9Query || t9Hint!.suggestion)}
                      className="font-extrabold text-brand-orange hover:underline truncate cursor-pointer"
                    >
                      {usedT9Query || t9Hint!.suggestion}
                    </button>
                  </div>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 bg-white/[0.06] border border-white/[0.08] rounded-md flex-shrink-0">
                    Tab
                  </kbd>
                </div>
              )}

              <div className="p-2 space-y-1 max-h-80 overflow-y-auto">
                {suggestions.length > 0 ? (
                  suggestions.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSuggestion(item)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-2xl text-left text-xs text-zinc-200 hover:text-white hover:bg-white/[0.08] cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {item.poster ? (
                          <img
                            src={item.poster}
                            alt=""
                            className="w-8 h-11 rounded-lg object-cover border border-white/10 flex-shrink-0 bg-dark-surface"
                          />
                        ) : (
                          <span className="w-8 h-11 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center flex-shrink-0">
                            <Film className="w-3.5 h-3.5 text-zinc-500" />
                          </span>
                        )}
                        <span className="truncate font-semibold group-hover:text-brand-orange transition-colors">
                          {item.title}
                        </span>
                      </div>
                      {item.rating && (
                        <span className="flex items-center text-[11px] font-extrabold text-brand-gold bg-[#1A120A] px-2 py-0.5 rounded-full border border-brand-gold/30 flex-shrink-0">
                          <Star className="w-3 h-3 mr-1 fill-brand-gold" />
                          {item.rating}
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-4 text-center text-xs text-zinc-400">
                    {t.header.noMirrorResults.replace('{query}', localQuery.trim())}
                  </div>
                )}
              </div>

              <div className="p-2.5 border-t border-white/[0.08] bg-black/25 flex flex-col gap-1.5 text-center">
                {suggestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      const effective = usedT9Query || localQuery.trim();
                      setLocalQuery(effective);
                      setSearchQuery(effective);
                      setPage('search');
                    }}
                    className="py-1 text-xs font-extrabold text-brand-orange hover:text-white cursor-pointer"
                  >
                    {t.header.showAll} «{usedT9Query || localQuery}»
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    openBrowser(usedT9Query || localQuery.trim());
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-2xl bg-white/[0.06] hover:bg-brand-crimson/20 border border-white/[0.09] hover:border-brand-ember/45 text-xs font-bold text-zinc-100 hover:text-white cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5 text-brand-orange" />
                  <span>{t.search.findInGoogleBrowser.replace('{query}', usedT9Query || localQuery.trim())}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Action Cluster */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {/* Quick Light/Dark Theme Switcher */}
        <button
          type="button"
          onClick={handleToggleTheme}
          aria-label={resolvedIsLight ? t.header.enableDarkTheme : t.header.enableLightTheme}
          title={resolvedIsLight ? t.header.darkTheme : t.header.lightTheme}
          className="p-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.06] text-zinc-300 hover:text-brand-orange cursor-pointer"
        >
          {resolvedIsLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        {updateInfo?.hasUpdate && updateInfo.updateTier !== 'patch' ? (
          <button
            type="button"
            onClick={() => setUpdateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full btn-ember text-white font-extrabold text-xs cursor-pointer active:scale-95 animate-emberPulse"
            title={t.header.updateAvailable}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#FFE29A]" />
            <span className="hidden sm:inline">v{updateInfo.latestVersion}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPage('settings')}
            aria-label={t.header.notifications}
            className="p-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.06] text-zinc-300 hover:text-white cursor-pointer"
            title={t.header.notifications}
          >
            <Bell className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setPage('settings')}
          aria-label={t.nav.settings}
          className="p-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.06] text-zinc-300 hover:text-white cursor-pointer group"
          title={t.nav.settings}
        >
          <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform duration-300" />
        </button>

        <button
          type="button"
          onClick={() => setPage('settings')}
          className="pl-2.5 border-l border-white/[0.08] cursor-pointer group rounded-full"
          title="HDREZKA Desktop"
          aria-label={t.header.profileAndSettings}
        >
          <span className="logo-ring rounded-full block transition-transform duration-300 group-hover:scale-105">
            <img
              src={appLogo}
              alt=""
              className="w-8 h-8 rounded-full object-cover block"
            />
          </span>
        </button>
      </div>
    </header>
  );
};
