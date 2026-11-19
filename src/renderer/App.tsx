import React, { useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { VideoPlayer } from './components/VideoPlayer';
import { CollectionModal } from './components/CollectionModal';
import { useMediaStore } from './stores/useMediaStore';
import { useSettingsStore } from './stores/useSettingsStore';

// Pages
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { DetailsPage } from './pages/DetailsPage';
import { SearchPage } from './pages/SearchPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';

export const App: React.FC = () => {
  const { currentPage, loadFavorites, loadWatchHistory } = useMediaStore();
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
    loadFavorites();
    loadWatchHistory();
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
      case 'settings':
        return <SettingsPage />;
      case 'details':
        return <DetailsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-dark-bg text-white overflow-hidden">
      {/* Electron custom titlebar */}
      <TitleBar />

      {/* Main app body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Right Content View */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-dark-bg">
          {/* Header */}
          <Header />

          {/* Page Content Scroll Area */}
          <main className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth">
            {renderCurrentPage()}
          </main>
        </div>
      </div>

      {/* Video Player Modal / Overlay */}
      <VideoPlayer />

      {/* Add to Collection Modal */}
      <CollectionModal />
    </div>
  );
};
