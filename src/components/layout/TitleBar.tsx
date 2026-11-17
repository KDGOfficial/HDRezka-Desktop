import React, { useState, useEffect } from 'react';
import {
  Minus,
  Square,
  Copy,
  X,
  Search,
  RotateCw,
  Bell,
  Settings as SettingsIcon,
  Film
} from 'lucide-react';
import {
  windowMinimize,
  windowToggleMaximize,
  windowClose,
  windowIsMaximized
} from '../../services/api';
import { useNavigationStore } from '../../stores/navigationStore';
import { useNotificationStore } from '../../stores/notificationStore';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const { activeTab, setActiveTab, setSearchQuery } = useNavigationStore();
  const { notify } = useNotificationStore();

  useEffect(() => {
    const checkMaximized = async () => {
      const max = await windowIsMaximized();
      setIsMaximized(max);
    };
    checkMaximized();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSearchQuery(searchInput.trim());
    }
  };

  const handleRefresh = () => {
    notify({
      type: 'info',
      title: 'Обновление данных',
      message: 'Каталог и списки синхронизируются...',
      duration: 2500,
    });
    // Trigger tab refresh
    setActiveTab(activeTab);
  };

  return (
    <header
      data-tauri-drag-region
      className="h-11 bg-[#17181D] border-b border-[#292B32] flex items-center justify-between px-3 select-none z-50 fixed top-0 left-0 right-0"
    >
      {/* Brand & Logo */}
      <div className="flex items-center space-x-3" data-tauri-drag-region>
        <button
          onClick={() => setActiveTab('home')}
          className="flex items-center space-x-2 text-white hover:opacity-90 transition-opacity cursor-pointer group"
        >
          <div className="w-7 h-7 rounded-lg bg-[#E50914] flex items-center justify-center shadow-lg shadow-red-900/30 group-hover:scale-105 transition-transform">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-sm tracking-wider bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            HDREZKA
          </span>
          <span className="text-[10px] font-semibold tracking-widest text-[#E50914] uppercase px-1.5 py-0.5 rounded bg-[#E50914]/10 border border-[#E50914]/20">
            DESKTOP
          </span>
        </button>
      </div>

      {/* Center Search Input */}
      <div className="flex-1 max-w-md mx-6" data-tauri-drag-region>
        <form onSubmit={handleSearchSubmit} className="relative">
          <input
            type="text"
            placeholder="Поиск фильмов, сериалов, аниме, актёров..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-[#101114] border border-[#292B32] rounded-full py-1.5 pl-9 pr-4 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all shadow-inner"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-2 text-zinc-500 hover:text-white text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>

      {/* Quick Action Tools & Windows Controls */}
      <div className="flex items-center space-x-1" data-tauri-drag-region>
        <button
          onClick={handleRefresh}
          title="Обновить контент"
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#1D1F26] rounded-md transition-colors cursor-pointer"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        <button
          onClick={() =>
            notify({
              type: 'info',
              title: 'Уведомления',
              message: 'Новых системных уведомлений нет.',
            })
          }
          title="Уведомления"
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#1D1F26] rounded-md transition-colors cursor-pointer relative"
        >
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 rounded-full bg-[#E50914] absolute top-1 right-1" />
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          title="Настройки"
          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
            activeTab === 'settings'
              ? 'text-[#E50914] bg-[#1D1F26]'
              : 'text-zinc-400 hover:text-white hover:bg-[#1D1F26]'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-[#292B32] mx-1.5" />

        {/* Windows Frame Controls */}
        <button
          onClick={windowMinimize}
          title="Свернуть"
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#1D1F26] rounded-md transition-colors cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={async () => {
            const next = await windowToggleMaximize();
            setIsMaximized(next);
          }}
          title={isMaximized ? 'Восстановить' : 'Развернуть'}
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#1D1F26] rounded-md transition-colors cursor-pointer"
        >
          {isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={windowClose}
          title="Закрыть"
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#E50914] rounded-md transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
