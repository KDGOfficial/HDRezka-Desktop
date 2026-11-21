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
  ShieldOff,
  Search,
  X,
  Maximize,
  Minimize,
  Pin,
  EyeOff,
  Eye,
  Move,
  Scaling,
  MonitorPlay,
} from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';
import { useTranslation } from '../i18n';
import { BROWSER_USER_AGENT } from '../../shared/constants';

const PORTALS = [
  { id: 'kinobase', label: 'Kinobase', base: 'https://kinobase.org/', search: (q: string) => `https://kinobase.org/search?query=${encodeURIComponent(q)}` },
  { id: 'kinogo', label: 'Kinogo', base: 'https://kinogo.film/', search: (q: string) => `https://kinogo.film/?do=search&subaction=search&story=${encodeURIComponent(q)}` },
  { id: 'yummyanime', label: 'YummyAnime', base: 'https://yummyanime.tv/', search: (q: string) => `https://yummyanime.tv/index.php?do=search&subaction=search&story=${encodeURIComponent(q)}` },
  { id: 'animego', label: 'AnimeGO', base: 'https://animego.me/', search: (q: string) => `https://animego.me/search/anime?q=${encodeURIComponent(q)}` },
  { id: 'uakino', label: 'UAKino', base: 'https://uakino.biz/ua/', search: (q: string) => `https://uakino.biz/ua/` },
  { id: 'google', label: 'Google Кино', base: 'https://www.google.com/', search: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q + ' смотреть онлайн в хорошем качестве')}` },
  { id: 'vk', label: 'VK Видео', base: 'https://vkvideo.ru/', search: (q: string) => `https://vkvideo.ru/?q=${encodeURIComponent(q)}` },
  { id: 'rutube', label: 'Rutube', base: 'https://rutube.ru/', search: (q: string) => `https://rutube.ru/search/?query=${encodeURIComponent(q)}` },
];

type BrowserVideoFit = 'contain' | '16:10' | '21:9' | '4:3' | 'cover' | 'fill';

const WINDOW_SIZE_PRESETS = [
  { w: 480, h: 270, label: '480×270', tag: '16:9 S' },
  { w: 720, h: 405, label: '720×405', tag: '16:9 M' },
  { w: 800, h: 500, label: '800×500', tag: '16:10 M' },
  { w: 960, h: 540, label: '960×540', tag: '16:9 L' },
  { w: 1280, h: 800, label: '1280×800', tag: '16:10' },
  { w: 1280, h: 720, label: '1280×720', tag: 'HD' },
];

const COSMETIC_ADBLOCK_CSS = `
  [id*="adfox"], [class*="adfox"], [id*="MarketGid"], [class*="mgbox"],
  [id*="yandex_rtb"], [class*="yandex_rtb"], .adsbygoogle, ins.adsbygoogle,
  [class*="branding-"], [id*="branding"], .branding, .brand-link, a.branding,
  .teasers, .teaser-block, [class*="teaser_"], [id*="teaser"],
  [class*="banner_top"], [class*="banner-top"], [class*="banner_bottom"], [class*="banner-bottom"],
  [class*="sticky-ad"], [class*="ad-overlay"], [class*="ad_overlay"], [class*="vast-"],
  iframe[src*="adfox"], iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
  iframe[src*="exoclick"], iframe[src*="adsterra"], iframe[src*="mgid"], iframe[src*="1xbet"],
  iframe[src*="mostbet"], iframe[src*="pinup"], iframe[src*="vavada"], iframe[src*="melbet"],
  a[href*="1xbet"], a[href*="1win"], a[href*="mostbet"], a[href*="pinup"], a[href*="vulcan"],
  a[href*="vulkan"], a[href*="azino"], a[href*="vavada"], a[href*="melbet"], a[href*="fonbet"],
  a[href*="winline"], a[href*="betboom"], a[href*="betcity"], a[href*="parimatch"],
  div[style*="z-index: 2147483647"]:not(:has(video)):not(:has(iframe)),
  div[style*="z-index:2147483647"]:not(:has(video)):not(:has(iframe)),
  div[style*="z-index: 9999999"]:not(:has(video)):not(:has(iframe)),
  div[style*="z-index:9999999"]:not(:has(video)):not(:has(iframe)),
  a[style*="z-index: 2147483647"], a[style*="z-index:2147483647"],
  a[style*="z-index: 9999999"], a[style*="z-index:9999999"] {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
`;

const ADBLOCK_RUNTIME_SCRIPT = `
  (() => {
    window.__hdrezkaAdBlockEnabled = true;
    if (window.__hdrezkaAdBlockInstalled) return;
    window.__hdrezkaAdBlockInstalled = true;

    const baseDom = (h) => h.replace(/^www\\./i, '').split('.').slice(-2).join('.').toLowerCase();
    const isGoogleHost = (h) => /(?:^|\\.)google\\.[a-z]{2,}(?:\\.[a-z]{2})?$/i.test(h);

    const origOpen = window.open;
    window.open = function(url, target, features) {
      if (window.__hdrezkaAdBlockEnabled) {
        try {
          if (!url) return null;
          const u = new URL(String(url), location.href);
          if (!isGoogleHost(location.hostname) && baseDom(u.hostname) !== baseDom(location.hostname)) {
            return null;
          }
        } catch {
          return null;
        }
      }
      return origOpen ? origOpen.call(window, url, target, features) : null;
    };

    const cleanAds = () => {
      if (!window.__hdrezkaAdBlockEnabled) return;
      // Remove invisible full-screen clickunder / popunder shield overlays
      document.querySelectorAll('a[target="_blank"], div[onclick], div[style*="fixed"]').forEach((el) => {
        if (el.closest('video') || el.querySelector('video')) return;
        const st = getComputedStyle(el);
        const z = parseInt(st.zIndex, 10) || 0;
        if (st.position === 'fixed' && z >= 9999) {
          const r = el.getBoundingClientRect();
          const coversScreen = r.width >= window.innerWidth * 0.6 && r.height >= window.innerHeight * 0.5;
          const isTransparentOverlay = parseFloat(st.opacity) < 0.15 || st.backgroundColor === 'rgba(0, 0, 0, 0)';
          if (coversScreen && isTransparentOverlay && (el.tagName === 'A' || !(el.textContent || '').trim())) {
            el.remove();
          }
        }
      });
      // Auto-skip video pre-roll ads if an explicit visible Skip Ad button appears (skip fake external ad links)
      const skipAdRe = /^(?:пропустить(?:\\s+рекламу)?|skip\\s*ad(?:s)?)(?:[\\s»›>→➜▶✕×!.]*)$/i;
      const skipMatches = Array.from(document.querySelectorAll('button, div, span, a')).filter((btn) => {
        if (!skipAdRe.test((btn.textContent || '').trim())) return false;
        if (btn.tagName === 'A') {
          const href = (btn.getAttribute('href') || '').trim();
          if (href && /^https?:/i.test(href)) {
            try {
              if (baseDom(new URL(href, location.href).hostname) !== baseDom(location.hostname)) return false;
            } catch {
              return false;
            }
          }
        }
        const st = getComputedStyle(btn);
        return st.display !== 'none' && st.visibility !== 'hidden' && (btn.offsetParent !== null || st.position === 'fixed');
      });
      skipMatches.forEach((btn) => {
        if (!skipMatches.some((other) => other !== btn && btn.contains(other))) {
          btn.click();
        }
      });
    };

    cleanAds();
    let pending = false;
    const obs = new MutationObserver(() => {
      if (pending || !window.__hdrezkaAdBlockEnabled) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        cleanAds();
      }, 250);
    });
    if (document.documentElement) {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
  })();
`;

function isPlayableMediaPage(url: string): boolean {
  if (!url) return false;
  return (
    /kinobase\.org\/(?:film|serial)\/\d+/i.test(url) ||
    /kinogo\.[^/]+\/\d+-[^/]+\.html/i.test(url) ||
    /animego\.[^/]+\/anime\/[^/?#]+/i.test(url) ||
    /uakino\.[^/]+\/[^/]+\/.*\d+-[^/]+\.html/i.test(url) ||
    /(?:yummyanime|yummyani|yani)\.[^/]+\/(?:anime\/\d+|[^/]*\d+-[^/]+\.html)/i.test(url) ||
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
  const { t } = useTranslation();
  const webviewRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentUrl, setCurrentUrl] = useState<string>(browserUrl || 'https://kinobase.org/');
  const [addressInput, setAddressInput] = useState<string>(browserUrl || 'https://kinobase.org/');
  const [loading, setLoading] = useState<boolean>(true);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [pageTitle, setPageTitle] = useState<string>('Кино-браузер');

  // 1:1 Cinema Player states (matching VideoPlayer.tsx)
  const [cinemaMode, setCinemaMode] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [isUiLocked, setIsUiLocked] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showScaleMenu, setShowScaleMenu] = useState<boolean>(false);
  const [videoFit, setVideoFit] = useState<BrowserVideoFit>('contain');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // AdBlock state
  const [adBlockEnabled, setAdBlockEnabled] = useState<boolean>(true);
  const [blockedCount, setBlockedCount] = useState<number>(0);

  const hideTimerRef = useRef<any>(null);
  const toastTimerRef = useRef<any>(null);
  const adBlockCssKeyRef = useRef<string | null>(null);
  const videoFitCssKeyRef = useRef<string | null>(null);
  const adBlockEnabledRef = useRef(adBlockEnabled);
  const videoFitRef = useRef(videoFit);
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  adBlockEnabledRef.current = adBlockEnabled;
  videoFitRef.current = videoFit;

  const activeSearchTerm = browserQuery || searchQuery || '';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2600);
  };

  // Sync pin & AdBlock stats on mount
  useEffect(() => {
    window.api?.isAlwaysOnTop?.().then(setIsPinned).catch(() => {});
    window.api?.getAdBlockStats?.().then((st) => {
      if (st) {
        setAdBlockEnabled(st.enabled);
        setBlockedCount(st.blockedCount);
      }
    }).catch(() => {});

    const statsInterval = setInterval(() => {
      window.api?.getAdBlockStats?.().then((st) => {
        if (st) setBlockedCount(st.blockedCount);
      }).catch(() => {});
    }, 3000);

    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      clearInterval(statsInterval);
      document.removeEventListener('fullscreenchange', onFsChange);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

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

  const applyVideoFitToWebview = async (fit: BrowserVideoFit) => {
    const wv = webviewRef.current;
    if (!wv) return;
    try {
      if (videoFitCssKeyRef.current && wv.removeInsertedCSS) {
        await wv.removeInsertedCSS(videoFitCssKeyRef.current).catch(() => {});
        videoFitCssKeyRef.current = null;
      }
      if (fit === 'contain') return;
      const css =
        fit === 'cover'
          ? 'video { object-fit: cover !important; width: 100% !important; height: 100% !important; }'
          : fit === 'fill'
            ? 'video { object-fit: fill !important; width: 100% !important; height: 100% !important; }'
            : fit === '16:10'
              ? 'video { aspect-ratio: 16 / 10 !important; object-fit: cover !important; }'
              : fit === '4:3'
                ? 'video { aspect-ratio: 4 / 3 !important; object-fit: cover !important; }'
                : 'video { aspect-ratio: 21 / 9 !important; object-fit: cover !important; }';
      if (wv.insertCSS) {
        videoFitCssKeyRef.current = await wv.insertCSS(css);
      }
    } catch {}
  };

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
        window.api?.getAdBlockStats?.().then((st) => {
          if (st) setBlockedCount(st.blockedCount);
        }).catch(() => {});
      } catch {}
    };

    const onStart = () => setLoading(true);
    const onStop = () => {
      setLoading(false);
      syncState();
    };
    const onDomReady = async () => {
      try {
        await wv.insertCSS?.(`
          ::-webkit-scrollbar { width: 8px; height: 8px; }
          ::-webkit-scrollbar-track { background: #0B070A; }
          ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.22); border-radius: 99px; }
          ::-webkit-scrollbar-thumb:hover { background: #FF4D1A; }
        `);
        const liveStats = await window.api?.getAdBlockStats?.().catch(() => null);
        const shouldBlock = liveStats ? liveStats.enabled : adBlockEnabledRef.current;
        if (liveStats) {
          adBlockEnabledRef.current = liveStats.enabled;
          setAdBlockEnabled(liveStats.enabled);
          setBlockedCount(liveStats.blockedCount);
        }
        if (shouldBlock) {
          adBlockCssKeyRef.current = await wv.insertCSS?.(COSMETIC_ADBLOCK_CSS);
          await wv.executeJavaScript?.(ADBLOCK_RUNTIME_SCRIPT).catch(() => {});
        }
        await applyVideoFitToWebview(videoFitRef.current);
      } catch {}
      syncState();
    };

    const onEnterHtmlFs = () => {
      setCinemaMode(true);
      if (containerRef.current && !document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {});
      }
    };
    const onLeaveHtmlFs = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };

    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('did-navigate', syncState);
    wv.addEventListener('did-navigate-in-page', syncState);
    wv.addEventListener('dom-ready', onDomReady);
    wv.addEventListener('enter-html-full-screen', onEnterHtmlFs);
    wv.addEventListener('leave-html-full-screen', onLeaveHtmlFs);

    return () => {
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('did-navigate', syncState);
      wv.removeEventListener('did-navigate-in-page', syncState);
      wv.removeEventListener('dom-ready', onDomReady);
      wv.removeEventListener('enter-html-full-screen', onEnterHtmlFs);
      wv.removeEventListener('leave-html-full-screen', onLeaveHtmlFs);
    };
  }, []);

  // Auto-hide Cinema OSD controls after 3.5s
  const resetHideTimer = () => {
    if (isUiLocked || !cinemaMode) return;
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!showScaleMenu) setShowControls(false);
    }, 3500);
  };

  useEffect(() => {
    if (!cinemaMode) {
      setShowControls(true);
      return;
    }
    const onMove = () => {
      if (!isUiLocked) resetHideTimer();
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [cinemaMode, isUiLocked, showScaleMenu]);

  const toggleAdBlock = async () => {
    const next = !adBlockEnabled;
    setAdBlockEnabled(next);
    const st = await window.api?.setAdBlock?.(next);
    if (st) setBlockedCount(st.blockedCount);
    const wv = webviewRef.current;
    if (wv) {
      try {
        if (next) {
          adBlockCssKeyRef.current = await wv.insertCSS?.(COSMETIC_ADBLOCK_CSS);
          await wv.executeJavaScript?.(ADBLOCK_RUNTIME_SCRIPT).catch(() => {});
        } else {
          if (adBlockCssKeyRef.current && wv.removeInsertedCSS) {
            await wv.removeInsertedCSS(adBlockCssKeyRef.current);
            adBlockCssKeyRef.current = null;
          }
          await wv.executeJavaScript?.('window.__hdrezkaAdBlockEnabled = false;').catch(() => {});
        }
      } catch {}
    }
    showToast(next ? '🛡️ AdBlock включён' : 'AdBlock отключён');
  };

  const toggleUiLock = () => {
    setIsUiLocked((prev) => {
      const next = !prev;
      if (next) {
        setShowControls(false);
        setShowScaleMenu(false);
        showToast(t.player.uiLocked);
      } else {
        setShowControls(true);
        showToast(t.player.uiUnlocked);
      }
      return next;
    });
  };

  const handleTogglePin = async () => {
    if (!window.api?.setAlwaysOnTop) return;
    const next = !isPinned;
    if (next) {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
      if (window.api.unmaximize) await window.api.unmaximize();
      if (window.api.getBounds && window.api.setBounds) {
        const b = await window.api.getBounds();
        if (b && (b.width > 1200 || b.height > 750)) {
          await window.api.setBounds({ width: 854, height: 480 });
        }
      }
      setCinemaMode(true);
    }
    await window.api.setAlwaysOnTop(next);
    setIsPinned(next);
    showToast(next ? t.player.pinned : t.player.unpinned);
  };

  const handleResizePreset = async (w: number, h: number) => {
    if (!window.api?.setBounds) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
    if (window.api.unmaximize) await window.api.unmaximize();
    await window.api.setBounds({ width: w, height: h });
    setShowScaleMenu(false);
    showToast(`${w}×${h}`);
  };

  const handleStartResize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.api?.getBounds || !window.api?.setBounds) return;
    const cur = await window.api.getBounds();
    if (!cur) return;
    isResizingRef.current = true;
    resizeStartRef.current = { x: e.screenX, y: e.screenY, w: cur.width, h: cur.height };

    const onMove = (moveEvt: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = moveEvt.screenX - resizeStartRef.current.x;
      const dy = moveEvt.screenY - resizeStartRef.current.y;
      const targetW = Math.max(320, Math.round(resizeStartRef.current.w + dx));
      const targetH = Math.max(180, Math.round(resizeStartRef.current.h + dy));
      window.api?.setBounds({ width: targetW, height: targetH });
    };
    const onUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const cycleVideoFit = () => {
    const order: BrowserVideoFit[] = ['contain', '16:10', '21:9', '4:3', 'cover', 'fill'];
    const labels: Record<BrowserVideoFit, string> = {
      contain: t.player.scaleOriginal,
      '16:10': 'Масштаб: 16:10',
      '21:9': 'Масштаб: 21:9 (Ultrawide)',
      '4:3': 'Масштаб: 4:3',
      cover: t.player.scaleCover,
      fill: t.player.scaleFill,
    };
    setVideoFit((prev) => {
      const next = order[(order.indexOf(prev) + 1) % order.length];
      applyVideoFitToWebview(next);
      showToast(labels[next]);
      return next;
    });
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      setCinemaMode(true);
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const exitCinemaMode = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsUiLocked(false);
    setShowScaleMenu(false);
    setCinemaMode(false);
  };

  // Hotkeys matching VideoPlayer 1:1 (H, P, Z, F, Esc), including when <webview> holds focus
  useEffect(() => {
    if (!cinemaMode) return;
    const dispatchCode = (code: string) => {
      if (code === 'KeyH') {
        toggleUiLock();
      } else if (code === 'KeyP') {
        handleTogglePin();
      } else if (code === 'KeyZ') {
        cycleVideoFit();
      } else if (code === 'KeyF') {
        toggleFullscreen();
      } else if (code === 'Escape') {
        if (isUiLocked) {
          setIsUiLocked(false);
          setShowControls(true);
          showToast(t.player.uiUnlocked);
        } else if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          exitCinemaMode();
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (['KeyH', 'KeyP', 'KeyZ', 'KeyF', 'Escape'].includes(e.code)) {
        e.preventDefault();
        dispatchCode(e.code);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const unsubWebviewKey = window.api?.onBrowserWebviewKey?.((code) => dispatchCode(code));
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unsubWebviewKey?.();
    };
  }, [cinemaMode, isUiLocked, isPinned, videoFit, t]);

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
  const fitBadgeLabel =
    videoFit === 'contain' ? '16:9' : videoFit === 'cover' ? 'Кадр' : videoFit === 'fill' ? 'Растянуть' : videoFit;

  return (
    <div
      ref={containerRef}
      className={
        cinemaMode
          ? `fixed inset-0 z-50 bg-black cinema-player-surface flex flex-col select-none overflow-hidden ${
              isUiLocked ? 'cursor-none' : ''
            }`
          : 'w-full h-[calc(100dvh-7.5rem)] min-h-[480px] flex flex-col rounded-3xl overflow-hidden cinema-panel shadow-elevated select-none animate-fadeIn relative'
      }
    >
      {/* 1:1 On-screen Toast Notification */}
      {toastMessage && (
        <div className="cinema-player-surface absolute top-12 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full logo-pill backdrop-blur-xl text-white text-xs font-bold shadow-elevated flex items-center gap-2.5 pointer-events-none animate-fade-in">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Standard Browser Toolbar (hidden in Cinema Player Mode) */}
      {!cinemaMode && (
        <>
          <div className="px-4 py-3 bg-[#140E12]/95 border-b border-white/[0.08] space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
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
              <form onSubmit={handleSubmit} className="flex-1 min-w-[200px]">
                <div className="theme-input-bg flex items-center bg-[#0B070A] border border-white/[0.1] rounded-full px-4 py-1.5 focus-within:border-brand-ember focus-within:ring-2 focus-within:ring-brand-crimson/25">
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

              {/* AdBlock Toggle + Counter */}
              <button
                type="button"
                onClick={toggleAdBlock}
                aria-pressed={adBlockEnabled}
                title={adBlockEnabled ? 'AdBlock активен (нажмите, чтобы отключить)' : 'Включить AdBlock'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer flex-shrink-0 ${
                  adBlockEnabled
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-white/[0.05] border-white/[0.08] text-zinc-400 hover:text-white'
                }`}
              >
                {adBlockEnabled ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                <span>AdBlock</span>
                {adBlockEnabled && blockedCount > 0 && (
                  <span className="px-1.5 rounded-full bg-emerald-500/25 font-mono text-[10px] tabular-nums">
                    {blockedCount}
                  </span>
                )}
              </button>

              {/* Enter 1:1 Cinema Player Mode */}
              <button
                type="button"
                onClick={() => setCinemaMode(true)}
                title="Режим киноплеера 1:1 (масштаб, закрепление, скрытие UI)"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-bold text-zinc-100 hover:text-white cursor-pointer flex-shrink-0"
              >
                <MonitorPlay className="w-3.5 h-3.5 text-brand-orange" />
                <span className="hidden lg:inline">Киноплеер</span>
              </button>

              {/* 1-Click Fullscreen Cinema Mode */}
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Открыть плеер на весь экран"
                title="Открыть на весь экран (F)"
                className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] text-zinc-300 hover:text-white border border-white/[0.08] cursor-pointer flex-shrink-0"
              >
                <Maximize className="w-4 h-4" />
              </button>

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
              <span className="text-[11px] text-zinc-500 truncate max-w-[220px] hidden xl:inline">
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
        </>
      )}

      {/* 1:1 Cinema Player Mode Floating Top OSD Bar (matches VideoPlayer.tsx) */}
      {cinemaMode && (
        <>
          {/* Invisible top-edge hover reveal strip so mouse users can always bring back hidden OSD over <webview> */}
          {!isUiLocked && !showControls && (
            <div
              onMouseEnter={resetHideTimer}
              onMouseMove={resetHideTimer}
              className="absolute top-0 left-0 right-0 h-7 z-40 pointer-events-auto"
            />
          )}

          <div
            onMouseEnter={() => {
              if (!isUiLocked) {
                setShowControls(true);
                if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
              }
            }}
            onMouseLeave={() => {
              if (!isUiLocked) resetHideTimer();
            }}
            className={`absolute top-0 left-0 right-0 z-40 flex items-center justify-between bg-gradient-to-b from-[#070507]/90 via-[#070507]/50 to-transparent p-5 drag-region transition-opacity duration-300 ${
              showControls && !isUiLocked ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-3.5 no-drag min-w-0">
              <button
                type="button"
                onClick={exitCinemaMode}
                aria-label={t.player.back}
                className="p-2.5 rounded-full bg-white/[0.1] hover:bg-white/[0.2] border border-white/10 text-white backdrop-blur-xl cursor-pointer active:scale-95"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h2 className="font-display text-base font-black text-white leading-tight truncate">
                  {pageTitle || 'Кино-браузер'}
                </h2>
                <div className="flex items-center gap-2 text-xs text-zinc-300 mt-0.5">
                  <span className="text-emerald-400 font-semibold">
                    {adBlockEnabled ? `AdBlock · ${blockedCount}` : 'AdBlock выкл.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Top Bar Quick Actions — 1:1 identical to VideoPlayer.tsx */}
            <div className="flex items-center gap-2 no-drag flex-shrink-0">
              {isPinned && (
                <>
                  <div
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.1] text-zinc-200 text-xs font-semibold select-none cursor-grab active:cursor-grabbing border border-white/15 drag-region"
                    title={t.player.pinnedDragTip}
                  >
                    <Move className="w-3.5 h-3.5 text-brand-gold" />
                    <span className="hidden sm:inline text-[11px] font-bold">{t.player.moveWindow}</span>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowScaleMenu((prev) => !prev)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.1] hover:bg-white/[0.2] text-zinc-200 hover:text-white backdrop-blur-xl text-[11px] font-bold border border-white/15 cursor-pointer"
                      title={t.player.pinnedPresets}
                    >
                      <Scaling className="w-3.5 h-3.5 text-brand-orange" />
                      <span className="hidden sm:inline">{t.player.pinnedPresets}</span>
                    </button>

                    {showScaleMenu && (
                      <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl cinema-glass p-1.5 shadow-elevated z-50 animate-fadeIn space-y-1">
                        <div className="px-2.5 py-1 text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">
                          {t.player.pinnedPresets}
                        </div>
                        {WINDOW_SIZE_PRESETS.map((p) => (
                          <button
                            key={p.tag}
                            type="button"
                            onClick={() => handleResizePreset(p.w, p.h)}
                            className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-200 hover:bg-brand-crimson/25 hover:text-white flex items-center justify-between cursor-pointer"
                          >
                            <span>{p.label}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">{p.tag}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={cycleVideoFit}
                className="px-3 py-1.5 rounded-full bg-white/[0.1] hover:bg-white/[0.2] text-xs font-bold text-zinc-200 hover:text-white border border-white/15 backdrop-blur-xl cursor-pointer"
                title={t.player.scale}
              >
                {fitBadgeLabel}
              </button>

              <button
                type="button"
                onClick={toggleUiLock}
                aria-label={t.player.hideUi}
                className="p-2.5 rounded-full bg-white/[0.1] hover:bg-white/[0.2] border border-white/10 text-zinc-200 hover:text-white backdrop-blur-xl cursor-pointer"
                title={t.player.hideUi}
              >
                <EyeOff className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleTogglePin}
                aria-label={isPinned ? t.player.unpinWindow : t.player.pinWindow}
                aria-pressed={isPinned}
                className={`p-2.5 rounded-full backdrop-blur-xl border cursor-pointer ${
                  isPinned
                    ? 'btn-ember border-white/25 text-white'
                    : 'bg-white/[0.1] hover:bg-white/[0.2] border-white/10 text-zinc-200 hover:text-white'
                }`}
                title={isPinned ? t.player.unpinWindow : t.player.pinWindow}
              >
                <Pin className={`w-4 h-4 ${isPinned ? 'fill-current rotate-45' : ''}`} />
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Полный экран"
                className="p-2.5 rounded-full bg-white/[0.1] hover:bg-white/[0.2] border border-white/10 text-zinc-200 hover:text-white backdrop-blur-xl cursor-pointer"
                title="Полный экран (F)"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Subtle corner unhide handle when UI is locked so mouse users can always restore */}
          {isUiLocked && (
            <button
              type="button"
              onClick={toggleUiLock}
              aria-label="Показать интерфейс (H)"
              title="Показать интерфейс (H)"
              className="absolute top-3 right-3 z-50 p-2 rounded-full bg-black/50 hover:bg-black/85 text-white/40 hover:text-white border border-white/15 opacity-20 hover:opacity-100 transition-opacity cursor-pointer no-drag"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}

          {/* Persistent top drag handle when pinned */}
          {isPinned && (
            <div
              onMouseEnter={() => {
                if (!isUiLocked) resetHideTimer();
              }}
              className="absolute top-0 left-0 right-0 h-5 drag-region pointer-events-auto z-30 cursor-grab active:cursor-grabbing"
              title={t.player.pinnedDragTip}
            />
          )}

          {/* Corner Resize Handle — 1:1 with VideoPlayer.tsx */}
          <div
            onMouseDown={handleStartResize}
            className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize z-50 flex items-end justify-end p-2 opacity-40 hover:opacity-100 transition-opacity no-drag group"
            title={t.player.pinnedPresets}
          >
            <svg
              className="w-4 h-4 text-white/70 group-hover:text-brand-orange drop-shadow transition-colors"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="14" cy="14" r="1.5" />
              <circle cx="14" cy="9" r="1.5" />
              <circle cx="9" cy="14" r="1.5" />
              <circle cx="14" cy="4" r="1.5" />
              <circle cx="9" cy="9" r="1.5" />
              <circle cx="4" cy="14" r="1.5" />
            </svg>
          </div>
        </>
      )}

      {/* Single Persistent Embedded Chromium Webview with AdBlock partition & 1:1 Cinema aspect/scale stage */}
      <div className="cinema-player-surface w-full flex-1 flex items-center justify-center bg-[#070507] overflow-hidden relative">
        {React.createElement('webview', {
          ref: webviewRef,
          src: browserUrl || 'https://kinobase.org/',
          partition: 'persist:cinema-browser',
          useragent: BROWSER_USER_AGENT,
          className: !cinemaMode || videoFit === 'contain'
            ? 'w-full h-full bg-[#070507]'
            : videoFit === 'cover'
              ? 'w-full h-full bg-[#070507] scale-[1.18] transition-transform duration-200'
              : videoFit === 'fill'
                ? 'w-full h-full bg-[#070507] scale-x-[1.12] scale-y-[1.08] transition-transform duration-200'
                : videoFit === '16:10'
                  ? 'w-[min(100%,calc(100dvh*16/10))] h-[min(100%,calc(100dvw*10/16))] bg-[#070507] transition-all duration-200'
                  : videoFit === '4:3'
                    ? 'w-[min(100%,calc(100dvh*4/3))] h-[min(100%,calc(100dvw*3/4))] bg-[#070507] transition-all duration-200'
                    : 'w-[min(100%,calc(100dvh*21/9))] h-[min(100%,calc(100dvw*9/21))] bg-[#070507] transition-all duration-200',
        })}
      </div>
    </div>
  );
};
