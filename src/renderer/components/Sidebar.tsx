import React from 'react';
import {
  Home,
  Compass,
  Film,
  Tv,
  Smile,
  Sparkles,
  Layers,
  Heart,
  History,
  Search,
  Settings,
} from 'lucide-react';
import { useMediaStore, AppPage } from '../stores/useMediaStore';

interface NavItem {
  id: AppPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section?: 'main' | 'library' | 'system';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Главная', icon: Home, section: 'main' },
  { id: 'catalog', label: 'Каталог', icon: Compass, section: 'main' },
  { id: 'films', label: 'Фильмы', icon: Film, section: 'main' },
  { id: 'series', label: 'Сериалы', icon: Tv, section: 'main' },
  { id: 'cartoons', label: 'Мультфильмы', icon: Smile, section: 'main' },
  { id: 'animation', label: 'Аниме', icon: Sparkles, section: 'main' },

  { id: 'collections', label: 'Коллекции', icon: Layers, section: 'library' },
  { id: 'favorites', label: 'Избранное', icon: Heart, section: 'library' },
  { id: 'history', label: 'История', icon: History, section: 'library' },
  { id: 'search', label: 'Поиск', icon: Search, section: 'library' },

  { id: 'settings', label: 'Настройки', icon: Settings, section: 'system' },
];

export const Sidebar: React.FC = () => {
  const { currentPage, setPage } = useMediaStore();

  const renderNavSection = (section: 'main' | 'library' | 'system', title?: string) => {
    const items = NAV_ITEMS.filter((i) => i.section === section);
    return (
      <div className="space-y-1 mb-4">
        {title && (
          <div className="px-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            {title}
          </div>
        )}
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-brand-red text-white shadow-glow'
                  : 'text-zinc-400 hover:text-white hover:bg-dark-surfaceLight'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <aside className="w-56 h-full bg-dark-surface/60 border-r border-dark-border flex flex-col justify-between p-3 select-none flex-shrink-0">
      <div className="flex-1 overflow-y-auto pr-1">
        {renderNavSection('main')}
        {renderNavSection('library', 'Моя библиотека')}
        {renderNavSection('system', 'Система')}
      </div>
    </aside>
  );
};
