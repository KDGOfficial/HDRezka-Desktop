import React, { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { VideoPlayer } from './components/VideoPlayer';
import { CollectionModal } from './components/CollectionModal';
import { UpdateModal } from './components/UpdateModal';
import { WhatsNewModal } from './components/WhatsNewModal';
import { useMediaStore } from './stores/useMediaStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { useTranslation } from './i18n';
import { APP_VERSION } from '../shared/constants';

// Pages
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { DetailsPage } from './pages/DetailsPage';
import { SearchPage } from './pages/SearchPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { BrowserPage } from './pages/BrowserPage';

export const App: React.FC = () => {
  const { currentPage, loadFavorites, loadWatchHistory } = useMediaStore();
  const { loadSettings, updateInfo, isUpdateModalOpen, setUpdateModalOpen } = useSettingsStore();
  const { t } = useTranslation();
  const [isWhatsNewOpen, setIsWhatsNewOpen] = React.useState(false);

  useEffect(() => {
    loadSettings().then(() => {
      useSettingsStore.getState().findOnlineMirrors();
    });
    loadFavorites();
    loadWatchHistory();

    // Check if the application was just updated and show What's New modal
    const checkUpdateFlag = async () => {
      let justUpdated = false;
      if (window.api?.checkJustUpdated) {
        justUpdated = await window.api.checkJustUpdated();
      }
      const lastSeen = localStorage.getItem('hdrezka_seen_version');
      if (justUpdated || (lastSeen && lastSeen !== APP_VERSION)) {
        setIsWhatsNewOpen(true);
      }
      localStorage.setItem('hdrezka_seen_version', APP_VERSION);
    };
    checkUpdateFlag();

    // Refresh & prune mirrors every 5 minutes
    const mirrorInterval = setInterval(() => {
      useSettingsStore.getState().findOnlineMirrors();
    }, 5 * 60 * 1000);

    // Check for updates periodically every 30 minutes
    const interval = setInterval(() => {
      useSettingsStore.getState().checkForUpdates(false);
    }, 30 * 60 * 1000);
    return () => {
      clearInterval(mirrorInterval);
      clearInterval(interval);
    };
  }, []);

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'catalog':
        return <CatalogPage initialType="films" />;
      case 'films':
        return <CatalogPage initialType="films" />;
      case 'series':
        return <CatalogPage initialType="series" />;
      case 'cartoons':
        return <CatalogPage initialType="cartoons" />;
      case 'animation':
        return <CatalogPage initialType="animation" />;
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
      case 'details':
        return <DetailsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-dark-void text-white overflow-hidden">
      {/* Frameless Integrated TitleBar */}
      <TitleBar />

      {/* Global Update Notification Strip */}
      {updateInfo?.hasUpdate && !isUpdateModalOpen && (
        <div className="btn-ember px-6 py-2 flex items-center justify-between text-xs font-semibold z-30 select-none border-b border-white/15">
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="w-4 h-4 text-[#FFE29A] animate-pulse flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{t.header.updateBanner.replace('{version}', updateInfo.latestVersion)}</span>
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

          {/* Main Scrollable Cinema Canvas */}
          <main className="flex-1 overflow-y-auto px-7 lg:px-9 py-6 scroll-smooth">
            {renderCurrentPage()}
          </main>
        </div>
      </div>

      {/* Overlays & Native Modal Dialogs */}
      <VideoPlayer />
      <CollectionModal />
      <UpdateModal />
      <WhatsNewModal isOpen={isWhatsNewOpen} onClose={() => setIsWhatsNewOpen(false)} />
    </div>
  );
};
