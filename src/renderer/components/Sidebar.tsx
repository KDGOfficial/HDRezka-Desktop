import React, { useState } from 'react';
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
  Globe,
  Send,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useMediaStore, AppPage } from '../stores/useMediaStore';
import { useTranslation, Locale } from '../i18n';
import appLogo from '../assets/logo.png';
import { APP_VERSION, TELEGRAM_CHANNEL_URL } from '../../shared/constants';

interface NavItem {
  id: AppPage;
  key: keyof typeof import('../i18n/translations').translations.ru.nav;
  icon: React.ComponentType<{ className?: string }>;
  section: 'main' | 'library' | 'system';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', key: 'home', icon: Home, section: 'main' },
  { id: 'catalog', key: 'catalog', icon: Compass, section: 'main' },
  { id: 'films', key: 'films', icon: Film, section: 'main' },
  { id: 'series', key: 'series', icon: Tv, section: 'main' },
  { id: 'cartoons', key: 'cartoons', icon: Smile, section: 'main' },
  { id: 'animation', key: 'animation', icon: Sparkles, section: 'main' },

  { id: 'collections', key: 'collections', icon: Layers, section: 'library' },
  { id: 'favorites', key: 'favorites', icon: Heart, section: 'library' },
  { id: 'history', key: 'history', icon: History, section: 'library' },
  { id: 'search', key: 'search', icon: Search, section: 'library' },
  { id: 'browser', key: 'browser', icon: Globe, section: 'library' },

  { id: 'settings', key: 'settings', icon: Settings, section: 'system' },
];

export const Sidebar: React.FC = () => {
  const { currentPage, setPage } = useMediaStore();
  const { t, language, setLanguage } = useTranslation();
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('hdrezka_rail_collapsed') === '1');

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('hdrezka_rail_collapsed', next ? '1' : '0');
      return next;
    });
  };

  const languages: Array<{ code: Locale; label: string }> = [
    { code: 'ru', label: 'RU' },
    { code: 'uk', label: 'UK' },
    { code: 'en', label: 'EN' },
  ];

  const renderNavSection = (section: 'main' | 'library' | 'system', title?: string) => {
    const items = NAV_ITEMS.filter((i) => i.section === section);
    return (
      <div className="space-y-1 mb-5">
        {title && !collapsed && (
          <div className="px-3 text-[10px] font-extrabold text-zinc-500 uppercase tracking-[0.16em] mb-2 select-none">
            {title}
          </div>
        )}
        {collapsed && title && <div className="mx-3 my-2 border-t border-white/[0.06]" />}
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const label = t.nav[item.key] || item.key;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPage(item.id)}
              title={collapsed ? label : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full relative flex items-center ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3.5 py-2.5'
              } rounded-2xl text-[12.5px] font-bold cursor-pointer group ${
                isActive
                  ? 'btn-ember text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Icon
                className={`w-[17px] h-[17px] flex-shrink-0 transition-transform duration-200 ${
                  isActive ? 'text-white scale-105' : 'text-zinc-400 group-hover:text-brand-orange group-hover:scale-105'
                }`}
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <aside
      className={`${
        collapsed ? 'w-[76px] px-2.5' : 'w-[232px] px-3.5'
      } h-full cinema-rail flex flex-col justify-between py-4 select-none flex-shrink-0 transition-[width] duration-200`}
    >
      {/* Top Brand Emblem (Logo Circle + Neon Ring) */}
      <div className={`pb-4 mb-3 border-b border-white/[0.06] flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        <button
          type="button"
          onClick={() => setPage('home')}
          className="flex items-center gap-3 cursor-pointer group text-left min-w-0 rounded-2xl"
          title="HDREZKA Desktop"
        >
          <div className="relative flex-shrink-0">
            <div className="logo-ring rounded-full transition-transform duration-300 group-hover:scale-105">
              <img
                src={appLogo}
                alt="HDRezka Desktop"
                className="w-10 h-10 rounded-full object-cover block"
              />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0E090C] shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-sm font-black tracking-[0.08em] text-white leading-none">
                  HDREZKA
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="logo-pill px-2 py-[1px] rounded-full text-[9px] font-display font-extrabold text-white tracking-wider">
                  PC
                </span>
                <span className="text-[10px] font-mono text-zinc-400 font-semibold">v{APP_VERSION}</span>
              </div>
            </div>
          )}
        </button>

        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Свернуть боковую панель"
            title="Свернуть панель"
            className="p-1.5 rounded-xl text-zinc-500 hover:text-white hover:bg-white/[0.06] cursor-pointer flex-shrink-0"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav aria-label="Основная навигация" className="flex-1 overflow-y-auto pr-0.5 scrollbar-none">
        {renderNavSection('main', t.nav.menu)}
        {renderNavSection('library', t.nav.library)}
        {renderNavSection('system', t.nav.system)}
      </nav>

      {/* Footer: Telegram, Language Switcher & Expand Toggle */}
      <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
        <button
          type="button"
          onClick={() => {
            if (window.api?.openExternalUrl) {
              window.api.openExternalUrl(TELEGRAM_CHANNEL_URL);
            }
          }}
          className={`w-full flex items-center ${
            collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
          } rounded-2xl bg-[#2AABEE]/10 hover:bg-[#2AABEE]/20 border border-[#2AABEE]/25 text-[#58C4FF] hover:text-white text-xs font-bold group cursor-pointer active:scale-95`}
          title="Telegram @HDRezkaPC"
        >
          <div className="flex items-center gap-2 truncate">
            <Send className="w-3.5 h-3.5 flex-shrink-0 group-hover:scale-110 transition-transform" />
            {!collapsed && <span className="truncate">@HDRezkaPC</span>}
          </div>
          {!collapsed && <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 flex-shrink-0" />}
        </button>

        {!collapsed ? (
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-zinc-500" />
              <span>{t.settings.language}</span>
            </span>

            <div className="flex items-center bg-black/50 rounded-full p-0.5 border border-white/[0.08]">
              {languages.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold cursor-pointer ${
                    language === l.code
                      ? 'btn-ember text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Развернуть боковую панель"
            title="Развернуть панель"
            className="w-full flex items-center justify-center p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] text-zinc-400 hover:text-white cursor-pointer"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
};
