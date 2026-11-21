import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Globe,
  Play,
  ExternalLink,
  ShieldCheck,
  Search,
  X,
} from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';
import { BROWSER_USER_AGENT } from '../../shared/constants';

const PORTALS = [
  { id: 'kinobase', label: 'Kinobase', base: 'https://kinobase.org/', search: (q: string) => `https://kinobase.org/search?query=${encodeURIComponent(q)}` },
  { id: 'kinogo', label: 'Kinogo', base: 'https://kinogo.film/', search: (q: string) => `https://kinogo.film/?do=search&subaction=search&story=${encodeURIComponent(q)}` },
  { id: 'yandex', label: 'Яндекс Кино', base: 'https://yandex.ru/', search: (q: string) => `https://yandex.ru/search/?text=${encodeURIComponent(q + ' смотреть онлайн в хорошем качестве HD')}` },
  { id: 'google', label: 'Google Кино', base: 'https://www.google.com/', search: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q + ' смотреть онлайн в хорошем качестве')}` },
  { id: 'vk', label: 'VK Видео', base: 'https://vkvideo.ru/', search: (q: string) => `https://vkvideo.ru/?q=${encodeURIComponent(q)}` },
  { id: 'rutube', label: 'Rutube', base: 'https://rutube.ru/', search: (q: string) => `https://rutube.ru/search/?query=${encodeURIComponent(q)}` },
];

function isPlayableMediaPage(url: string): boolean {
  if (!url) return false;
  return (
    /kinobase\.org\/(?:film|serial)\/\d+/i.test(url) ||
    /kinogo\.[^/]+\/\d+-[^/]+\.html/i.test(url) ||
    /(?:rezka|hdrezka)[^/]*\/(?:films|series|cartoons|animation|show)\/.*\/\d+-[^/]+\.html/i.test(url)
  );
}

function normalizeUrlOrSearch(input: string): string {
  const clean = input.trim();
  if (!clean) return 'https://kinobase.org/';
  if (/^https?:\/\//i.test(clean)) return clean;
  if (!/\s/.test(clean) && /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(clean)) {
    return `https://${clean}`;
  }
  return `https://yandex.ru/search/?text=${encodeURIComponent(`${clean} смотреть онлайн в хорошем качестве HD`)}`;
}

export const BrowserPage: React.FC = () => {
  const { browserUrl, browserQuery, searchQuery, openDetails } = useMediaStore();
  const webviewRef = useRef<any>(null);

  const [currentUrl, setCurrentUrl] = useState<string>(browserUrl || 'https://kinobase.org/');
  const [addressInput, setAddressInput] = useState<string>(browserUrl || 'https://kinobase.org/');
  const [loading, setLoading] = useState<boolean>(true);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [pageTitle, setPageTitle] = useState<string>('Кино-браузер');

  const activeSearchTerm = browserQuery || searchQuery || '';

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || !browserUrl) return;
    setAddressInput(browserUrl);
    setCurrentUrl(browserUrl);
    try {
      if (wv.getURL && wv.getURL() !== browserUrl) {
        wv.loadURL(browserUrl);
      }
    } catch {}
  }, [browserUrl]);

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const syncState = () => {
      try {
        const u = wv.getURL?.() || '';
        if (u) {
          setCurrentUrl(u);
          setAddressInput(u);
        }
        setCanGoBack(Boolean(wv.canGoBack?.()));
        setCanGoForward(Boolean(wv.canGoForward?.()));
        const ttl = wv.getTitle?.();
        if (ttl) setPageTitle(ttl);
      } catch {}
    };

    const onStart = () => setLoading(true);
    const onStop = () => {
      setLoading(false);
      syncState();
    };
    const onDomReady = () => {
      try {
        wv.insertCSS?.(`
          ::-webkit-scrollbar { width: 8px; height: 8px; }
          ::-webkit-scrollbar-track { background: #0b0c12; }
          ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 99px; }
          ::-webkit-scrollbar-thumb:hover { background: #e50914; }
        `);
      } catch {}
      syncState();
    };

    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('did-navigate', syncState);
    wv.addEventListener('did-navigate-in-page', syncState);
    wv.addEventListener('dom-ready', onDomReady);

    return () => {
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('did-navigate', syncState);
      wv.removeEventListener('did-navigate-in-page', syncState);
      wv.removeEventListener('dom-ready', onDomReady);
    };
  }, []);

  const navigateTo = (target: string) => {
    const resolved = normalizeUrlOrSearch(target);
    setCurrentUrl(resolved);
    setAddressInput(resolved);
    try {
      webviewRef.current?.loadURL?.(resolved);
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(addressInput);
  };

  const playable = isPlayableMediaPage(currentUrl);

  return (
    <div className="w-full h-[calc(100vh-8rem)] min-h-[540px] flex flex-col rounded-3xl overflow-hidden bg-[#0e0f16] border border-white/10 shadow-elevated select-none animate-fadeIn">
      {/* Top Cinema Browser Toolbar */}
      <div className="px-4 py-3 bg-[#12131a]/95 border-b border-white/10 space-y-2.5">
        <div className="flex items-center gap-2">
          {/* Navigation buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => canGoBack && webviewRef.current?.goBack?.()}
              disabled={!canGoBack}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 text-zinc-300 hover:text-white transition-all cursor-pointer"
              title="Назад"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => canGoForward && webviewRef.current?.goForward?.()}
              disabled={!canGoForward}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 text-zinc-300 hover:text-white transition-all cursor-pointer"
              title="Вперёд"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => (loading ? webviewRef.current?.stop?.() : webviewRef.current?.reload?.())}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer"
              title={loading ? 'Остановить' : 'Обновить'}
            >
              {loading ? <X className="w-4 h-4 text-brand-red" /> : <RotateCw className="w-4 h-4" />}
            </button>
            <button
              onClick={() => navigateTo('https://kinobase.org/')}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer"
              title="Домой"
            >
              <Home className="w-4 h-4" />
            </button>
          </div>

          {/* Address & Search Bar */}
          <form onSubmit={handleSubmit} className="flex-1">
            <div className="flex items-center bg-[#090a0f] border border-white/10 rounded-2xl px-3.5 py-1.5 focus-within:border-brand-red focus-within:ring-2 focus-within:ring-brand-red/25 transition-all">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mr-2 flex-shrink-0" />
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="Введите название фильма или URL сайта..."
                className="bg-transparent border-none outline-none text-xs text-white w-full placeholder-zinc-500 font-medium"
              />
              {addressInput && (
                <button
                  type="button"
                  onClick={() => setAddressInput('')}
                  className="p-1 text-zinc-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                className="ml-1.5 px-3 py-1 rounded-xl bg-brand-red/90 hover:bg-brand-red text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
              >
                <Search className="w-3 h-3" />
                <span>Перейти</span>
              </button>
            </div>
          </form>

          {/* Direct Play in Native App Button when on movie page */}
          {playable && (
            <button
              onClick={() => openDetails(currentUrl)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white text-xs font-black shadow-glow transition-all active:scale-95 flex-shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Открыть в плеере</span>
            </button>
          )}

          {/* Open Externally Fallback */}
          <button
            onClick={() => window.api?.openExternalUrl?.(currentUrl)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5 transition-all cursor-pointer flex-shrink-0"
            title="Открыть в системном браузере"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {/* Portal Shortcuts & Status Row */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-zinc-500 flex items-center gap-1 mr-1 flex-shrink-0">
              <Globe className="w-3.5 h-3.5 text-brand-red" />
              <span>Источники:</span>
            </span>
            {PORTALS.map((portal) => {
              const target = activeSearchTerm ? portal.search(activeSearchTerm) : portal.base;
              const isSelected = currentUrl.includes(new URL(portal.base).hostname.replace('www.', ''));
              return (
                <button
                  key={portal.id}
                  onClick={() => navigateTo(target)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-brand-red text-white shadow-glow-sm'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5'
                  }`}
                >
                  {portal.label}
                </button>
              );
            })}
          </div>
          <span className="text-[11px] text-zinc-500 truncate max-w-[240px] hidden md:inline">
            {loading ? 'Загрузка страницы...' : pageTitle}
          </span>
        </div>
      </div>

      {/* Loading Progress Hairline */}
      <div className="h-0.5 w-full bg-white/5 overflow-hidden">
        {loading && <div className="h-full w-1/3 bg-gradient-to-r from-brand-red to-orange-500 animate-pulse" />}
      </div>

      {/* Embedded Dark-Styled Chromium Webview */}
      {React.createElement('webview', {
        ref: webviewRef,
        src: browserUrl || 'https://kinobase.org/',
        allowpopups: 'true',
        useragent: BROWSER_USER_AGENT,
        className: 'w-full flex-1 bg-[#08080c]',
      })}
    </div>
  );
};
