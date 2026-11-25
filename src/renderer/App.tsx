import React, { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { VideoPlayer } from './components/VideoPlayer';
import { CollectionModal } from './components/CollectionModal';
import { UpdateModal } from './components/UpdateModal';
import { WhatsNewModal } from './components/WhatsNewModal';
import { InterestsModal } from './components/InterestsModal';
import { StartupSplash } from './components/StartupSplash';
import { useMediaStore, AppPage } from './stores/useMediaStore';
import { usePlayerStore } from './stores/usePlayerStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { useTranslation } from './i18n';
import { APP_VERSION } from '../shared/constants';

// Pages
import { HomePage } from './pages/HomePage';
import { WhatToWatchPage } from './pages/WhatToWatchPage';
import { CatalogPage } from './pages/CatalogPage';
import { DetailsPage } from './pages/DetailsPage';
import { SearchPage } from './pages/SearchPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { BrowserPage } from './pages/BrowserPage';

export const App: React.FC = () => {
  const {
    currentPage,
    lastContentPage,
    pendingScrollTop,
    clearPendingScroll,
    goBack,
    goForward,
    loadFavorites,
    loadWatchHistory,
  } = useMediaStore();
  const {
    settings,
    settingsLoaded,
    loadSettings,
    updateInfo,
    updateScheduledOnExit,
    isUpdateModalOpen,
    setUpdateModalOpen,
    isInterestsModalOpen,
    setInterestsModalOpen,
    isFindingMirrors,
    isCheckingMirrors,
  } = useSettingsStore();
  const isSearchingMirrors = isFindingMirrors || isCheckingMirrors;
  const { t } = useTranslation();
  const [isWhatsNewOpen, setIsWhatsNewOpen] = React.useState(false);
  const [whatsNewChecked, setWhatsNewChecked] = React.useState(false);
  const promptedInterestsRef = React.useRef(false);
  const mainScrollRef = React.useRef<HTMLElement>(null);
  const lastMouseNavRef = React.useRef(0);

  // Restore scroll position after page/history transitions (keeps scroll intact when returning from Details)
  useEffect(() => {
    if (pendingScrollTop === null) return;
    const target = pendingScrollTop;
    clearPendingScroll();
    requestAnimationFrame(() => {
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
      }
    });
  }, [currentPage, pendingScrollTop, clearPendingScroll]);

  // Mouse4 / Mouse5 (Back / Forward) navigation via both Electron app-command and DOM mouseup
  useEffect(() => {
    const triggerNav = (dir: 'back' | 'forward') => {
      if (usePlayerStore.getState().isOpen) return;
      const now = Date.now();
      if (now - lastMouseNavRef.current < 120) return;
      lastMouseNavRef.current = now;
      if (dir === 'back') goBack();
      else goForward();
    };

    const unsubAppNav = window.api?.onAppNavigate?.((dir) => triggerNav(dir));
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        triggerNav('back');
      } else if (e.button === 4) {
        e.preventDefault();
        triggerNav('forward');
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      unsubAppNav?.();
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [goBack, goForward]);

  // Prompt user once about their favorite genres/categories when onboarding hasn't been completed yet
  useEffect(() => {
    if (!settingsLoaded || !whatsNewChecked || promptedInterestsRef.current) return;
    if (isWhatsNewOpen || isUpdateModalOpen || isInterestsModalOpen) return;
    if (!settings.interests?.onboardingCompleted) {
      promptedInterestsRef.current = true;
      setInterestsModalOpen(true);
    }
  }, [
    settingsLoaded,
    whatsNewChecked,
    settings.interests?.onboardingCompleted,
    isWhatsNewOpen,
    isUpdateModalOpen,
    isInterestsModalOpen,
    setInterestsModalOpen,
  ]);

  // Apply light / dark / system color-scheme cleanly and listen for OS changes
  useEffect(() => {
    const applyTheme = () => {
      const mode = settings.theme === 'light' ? 'light' : settings.theme === 'system' ? 'system' : 'dark';
      const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
      if (mode === 'system') {
        try { localStorage.removeItem('color-scheme'); } catch {}
        if (meta) meta.content = 'light dark';
      } else {
        try { localStorage.setItem('color-scheme', mode); } catch {}
        if (meta) meta.content = mode;
      }
      const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
      const resolved = mode === 'system' ? (prefersLight ? 'light' : 'dark') : mode;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.classList.toggle('dark', resolved === 'dark');
    };

    applyTheme();
    const mql = window.matchMedia?.('(prefers-color-scheme: light)');
    const onSystemChange = () => {
      if (settings.theme === 'system') applyTheme();
    };
    mql?.addEventListener?.('change', onSystemChange);
    return () => mql?.removeEventListener?.('change', onSystemChange);
  }, [settings.theme]);

  useEffect(() => {
    loadSettings().then(() => {
      useSettingsStore.getState().findOnlineMirrors();
    });
    loadFavorites();
    loadWatchHistory();

    // Check if the application was just updated and show What's New modal
    const checkUpdateFlag = async () => {
      try {
        let justUpdated = false;
        if (window.api?.checkJustUpdated) {
          justUpdated = await window.api.checkJustUpdated();
        }
        const lastSeen = localStorage.getItem('hdrezka_seen_version');
        if (justUpdated || (lastSeen && lastSeen !== APP_VERSION)) {
          setIsWhatsNewOpen(true);
        }
        localStorage.setItem('hdrezka_seen_version', APP_VERSION);
      } finally {
        setWhatsNewChecked(true);
      }
    };
    checkUpdateFlag();

    // Refresh & prune mirrors every 5 minutes
    const mirrorInterval = setInterval(() => {
      useSettingsStore.getState().findOnlineMirrors();
    }, 5 * 60 * 1000);

    // Check for updates periodically every 30 minutes (download in background & install on exit)
    const interval = setInterval(() => {
      useSettingsStore
        .getState()
        .checkForUpdates(false)
        .then((info) => {
          if (info?.hasUpdate && info.assetUrl) {
            useSettingsStore.getState().downloadUpdate(true);
          }
        })
        .catch(() => {});
    }, 30 * 60 * 1000);
    return () => {
      clearInterval(mirrorInterval);
      clearInterval(interval);
    };
  }, []);

  const renderContentPage = (page: Exclude<AppPage, 'details'>) => {
    switch (page) {
      case 'home':
        return <HomePage />;
      case 'whatToWatch':
        return <WhatToWatchPage />;
      case 'catalog':
        return <CatalogPage key="catalog" initialType="films" />;
      case 'films':
        return <CatalogPage key="films" initialType="films" />;
      case 'series':
        return <CatalogPage key="series" initialType="series" />;
      case 'cartoons':
        return <CatalogPage key="cartoons" initialType="cartoons" />;
      case 'animation':
        return <CatalogPage key="animation" initialType="animation" />;
      case 'erotica':
        return <CatalogPage key="erotica" initialType="erotica" />;
      case 'collections':
        return <CollectionsPage />;
      case 'favorites':
        return <FavoritesPage />;
      case 'history':
        return <HistoryPage />;
      case 'search':
        return <SearchPage />;
      case 'browser':
        return <BrowserPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] w-screen w-[100dvw] bg-dark-void text-white overflow-hidden">
      {/* Frameless Integrated TitleBar */}
      <TitleBar />

      {/* Global Update Notification Strip */}
      {updateInfo?.hasUpdate && !isUpdateModalOpen && (
        <div className="btn-ember px-6 py-2 flex items-center justify-between text-xs font-semibold z-30 select-none border-b border-white/15">
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="w-4 h-4 text-[#FFE29A] animate-pulse flex-shrink-0" aria-hidden="true" />
            <span className="truncate">
              {t.header.updateBanner.replace('{version}', updateInfo.latestVersion)}
              {updateScheduledOnExit ? t.updateModal.bannerOnExitSuffix : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <button
              type="button"
              onClick={() => setUpdateModalOpen(true)}
              className="px-3.5 py-1 rounded-full bg-white text-[#140A0E] font-extrabold text-[11px] hover:bg-amber-50 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              {t.header.updateNow}
            </button>
          </div>
        </div>
      )}

      {/* Main Cinema Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Collapsible Navigation Rail */}
        <Sidebar />

        {/* Right Cinema Viewport */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden cinema-canvas">
          {/* Translucent Floating Command Header */}
          <Header />

          {/* Main Scrollable Cinema Canvas (keeps previous listing page mounted when viewing Details so filters & state never reset) */}
          <main
            ref={mainScrollRef}
            data-main-scroll
            className="flex-1 overflow-y-auto px-7 lg:px-9 py-6 scroll-smooth"
          >
            <div className={currentPage === 'details' ? 'hidden' : ''}>
              {renderContentPage(lastContentPage)}
            </div>
            {currentPage === 'details' && <DetailsPage />}
          </main>
        </div>
      </div>

      {/* Floating circular indicator when user selected a page/item while mirrors are still searching */}
      {isSearchingMirrors && currentPage !== 'settings' && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full cinema-glass border border-brand-ember/45 shadow-elevated text-xs font-bold text-zinc-100 pointer-events-none select-none animate-fadeIn"
        >
          <span
            className="w-4 h-4 rounded-full border-[2.5px] border-brand-crimson/25 border-t-brand-orange border-r-brand-crimson animate-spin flex-shrink-0"
            aria-hidden="true"
          />
          <span>{t.settings.findingOnlineMirrors}</span>
        </div>
      )}

      {/* Overlays & Native Modal Dialogs */}
      <StartupSplash />
      <VideoPlayer />
      <CollectionModal />
      <UpdateModal />
      <WhatsNewModal isOpen={isWhatsNewOpen} onClose={() => setIsWhatsNewOpen(false)} />
      <InterestsModal />
    </div>
  );
};
