import React, { useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar } from './components/layout/Sidebar';
import { NotificationsContainer } from './components/layout/NotificationsContainer';
import { MediaDetailsModal } from './components/details/MediaDetailsModal';
import { VideoPlayer } from './components/player/VideoPlayer';

import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { SearchPage } from './pages/SearchPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';

import { useNavigationStore } from './stores/navigationStore';
import { useSettingsStore } from './stores/settingsStore';

export const App: React.FC = () => {
  const { activeTab, selectedMedia, isDetailsOpen, isPlaying, closeDetails } = useNavigationStore();
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#101114] text-[#FFFFFF] overflow-hidden select-none font-sans">
      {/* Windows Custom Title Bar */}
      <TitleBar />

      {/* Main App Body */}
      <div className="flex flex-1 pt-11 overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Content View Area */}
        <main className="flex-1 overflow-y-auto no-scrollbar p-6 md:p-8 bg-[#101114]">
          {activeTab === 'home' && <HomePage />}
          {activeTab === 'catalog' && <CatalogPage initialCategory="all" />}
          {activeTab === 'movies' && <CatalogPage initialCategory="movies" />}
          {activeTab === 'series' && <CatalogPage initialCategory="series" />}
          {activeTab === 'cartoons' && <CatalogPage initialCategory="cartoons" />}
          {activeTab === 'anime' && <CatalogPage initialCategory="anime" />}
          {activeTab === 'collections' && <CollectionsPage />}
          {activeTab === 'favorites' && <FavoritesPage />}
          {activeTab === 'continue' && <HistoryPage />}
          {activeTab === 'history' && <HistoryPage />}
          {activeTab === 'settings' && <SettingsPage />}
          {activeTab === 'search' && <SearchPage />}
        </main>
      </div>

      {/* Details Modal */}
      {isDetailsOpen && selectedMedia && (
        <MediaDetailsModal media={selectedMedia} onClose={closeDetails} />
      )}

      {/* Video Player */}
      {isPlaying && <VideoPlayer />}

      {/* Notifications */}
      <NotificationsContainer />
    </div>
  );
};

export default App;
