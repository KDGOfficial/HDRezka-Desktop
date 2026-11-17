import React from 'react';
import {
  Home,
  Compass,
  Film,
  Tv,
  Sparkles,
  Flame,
  Bookmark,
  Heart,
  PlayCircle,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Info
} from 'lucide-react';
import { NavTab } from '../../types/navigation';
import { useNavigationStore } from '../../stores/navigationStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useNotificationStore } from '../../stores/notificationStore';

interface NavItemDef {
  id: NavTab;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_ITEMS: NavItemDef[] = [
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'catalog', label: 'Каталог', icon: Compass },
  { id: 'movies', label: 'Фильмы', icon: Film },
  { id: 'series', label: 'Сериалы', icon: Tv },
  { id: 'cartoons', label: 'Мультфильмы', icon: Sparkles },
  { id: 'anime', label: 'Аниме', icon: Flame },
  { id: 'collections', label: 'Коллекции', icon: Bookmark },
  { id: 'favorites', label: 'Избранное', icon: Heart },
  { id: 'continue', label: 'Продолжить', icon: PlayCircle },
  { id: 'history', label: 'История', icon: History },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab } = useNavigationStore();
  const { settings, updateSettings } = useSettingsStore();
  const { notify } = useNotificationStore();

  const isCollapsed = settings.sidebarCollapsed;

  const toggleCollapsed = () => {
    updateSettings({ sidebarCollapsed: !isCollapsed });
  };

  const handleCheckUpdates = () => {
    notify({
      type: 'success',
      title: 'Проверка обновлений',
      message: 'У вас установлена актуальная версия HDREZKA Desktop v1.0.0',
      duration: 3500,
    });
  };

  return (
    <aside
      className={`bg-[#17181D] border-r border-[#292B32] transition-all duration-300 flex flex-col justify-between select-none z-40 ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Top Toggle Button & Navigation List */}
      <div className="flex flex-col flex-1 py-3 px-2 overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-end px-2 mb-2">
          <button
            onClick={toggleCollapsed}
            title={isCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#1D1F26] rounded-md transition-colors"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center rounded-xl transition-all duration-200 cursor-pointer ${
                  isCollapsed ? 'justify-center p-3' : 'px-3 py-2.5 space-x-3'
                } ${
                  isActive
                    ? 'bg-[#E50914] text-white font-medium shadow-md shadow-red-900/30'
                    : 'text-zinc-400 hover:text-white hover:bg-[#1D1F26]'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400 group-hover:text-white'}`} />
                {!isCollapsed && (
                  <span className="text-sm font-medium truncate flex-1 text-left">
                    {item.label}
                  </span>
                )}
                {!isCollapsed && item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-white font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Section */}
      <div className="p-3 border-t border-[#292B32]/70 bg-[#14151A]">
        {!isCollapsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>HDREZKA Desktop</span>
              <span className="text-zinc-400 font-mono">v1.0.0</span>
            </div>

            <button
              onClick={handleCheckUpdates}
              className="w-full py-1.5 px-2.5 bg-[#1D1F26] hover:bg-[#252832] text-zinc-300 hover:text-white rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-[#292B32]"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
              <span>Проверить обновления</span>
            </button>

            <div className="text-[10px] text-zinc-600 text-center pt-1">
              Windows x64 • WebView2 • Rust & React
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2">
            <button
              onClick={handleCheckUpdates}
              title="Проверить обновления (v1.0.0)"
              className="p-2 text-zinc-400 hover:text-white hover:bg-[#1D1F26] rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <span className="text-[9px] font-mono text-zinc-500">v1.0</span>
          </div>
        )}
      </div>
    </aside>
  );
};
