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
  return `https://www.google.com/search?q=${encodeURIComponent(`${clean} смотреть онлайн в хорошем качестве HD`)}`;
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
          ::-webkit-scrollbar-track { background: #0B070A; }
          ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.22); border-radius: 99px; }
          ::-webkit-scrollbar-thumb:hover { background: #FF4D1A; }
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
    <div className="w-full h-[calc(100vh-8rem)] min-h-[540px] flex flex-col rounded-3xl overflow-hidden cinema-panel shadow-elevated select-none animate-fadeIn">
      {/* Top Cinema Browser Toolbar */}
      <div className="px-4 py-3 bg-[#140E12]/95 border-b border-white/[0.08] space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => canGoBack && webviewRef.current?.goBack?.()}
              disabled={!canGoBack}
              aria-label="Назад"
              className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-35 text-zinc-200 hover:text-white cursor-pointer"
              title="Назад"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => canGoForward && webviewRef.current?.goForward?.()}
              disabled={!canGoForward}
              aria-label="Вперёд"
              className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-35 text-zinc-200 hover:text-white cursor-pointer"
              title="Вперёд"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => (loading ? webviewRef.current?.stop?.() : webviewRef.current?.reload?.())}
              aria-label={loading ? 'Остановить' : 'Обновить'}
              className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] text-zinc-200 hover:text-white cursor-pointer"
              title={loading ? 'Остановить' : 'Обновить'}
            >
              {loading ? <X className="w-4 h-4 text-brand-crimson" /> : <RotateCw className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => navigateTo('https://kinobase.org/')}
              aria-label="Домой"
              className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] text-zinc-200 hover:text-white cursor-pointer"
              title="Домой"
            >
              <Home className="w-4 h-4" />
            </button>
          </div>

          {/* Address & Google Search Bar */}
          <form onSubmit={handleSubmit} className="flex-1">
            <div className="flex items-center bg-[#0B070A] border border-white/[0.1] rounded-full px-4 py-1.5 focus-within:border-brand-ember focus-within:ring-2 focus-within:ring-brand-crimson/25">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mr-2 flex-shrink-0" aria-hidden="true" />
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onFocus={(e) => e.target.select()}
                aria-label="Адрес или поисковый запрос Google"
                placeholder="Введите название фильма (поиск Google) или URL сайта..."
                className="bg-transparent border-none outline-none text-xs text-white w-full placeholder-zinc-500 font-medium"
              />
              {addressInput && (
                <button
                  type="button"
                  aria-label="Очистить адрес"
                  onClick={() => setAddressInput('')}
                  className="p-1 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                className="ml-1.5 px-3.5 py-1 rounded-full btn-ember text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <Search className="w-3 h-3" />
                <span>Перейти</span>
              </button>
            </div>
          </form>

          {playable && (
            <button
              type="button"
              onClick={() => openDetails(currentUrl)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full btn-ember text-white text-xs font-display font-black uppercase tracking-wider active:scale-95 flex-shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Открыть в плеере</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.api?.openExternalUrl?.(currentUrl)}
            aria-label="Открыть в системном браузере"
            className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] text-zinc-300 hover:text-white border border-white/[0.08] cursor-pointer flex-shrink-0"
            title="Открыть в системном браузере"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {/* Portal Shortcuts Row */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-zinc-500 flex items-center gap-1 mr-1 flex-shrink-0">
              <Globe className="w-3.5 h-3.5 text-brand-orange" />
              <span>Источники:</span>
            </span>
            {PORTALS.map((portal) => {
              const target = activeSearchTerm ? portal.search(activeSearchTerm) : portal.base;
              const isSelected = currentUrl.includes(new URL(portal.base).hostname.replace('www.', ''));
              return (
                <button
                  key={portal.id}
                  type="button"
                  onClick={() => navigateTo(target)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'btn-ember text-white'
                      : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08]'
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
      <div className="h-[2px] w-full bg-white/[0.05] overflow-hidden">
        {loading && (
          <div
            className="h-full w-1/3 animate-pulse"
            style={{ background: 'linear-gradient(90deg, #FF124F 0%, #FF7A00 100%)' }}
          />
        )}
      </div>

      {/* Embedded Dark-Styled Chromium Webview */}
      {React.createElement('webview', {
        ref: webviewRef,
        src: browserUrl || 'https://kinobase.org/',
        allowpopups: 'true',
        useragent: BROWSER_USER_AGENT,
        className: 'w-full flex-1 bg-[#070507]',
      })}
    </div>
  );
};
