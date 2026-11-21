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
  Globe,
  Send,
  ExternalLink,
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

  const languages: Array<{ code: Locale; label: string }> = [
    { code: 'ru', label: 'RU' },
    { code: 'uk', label: 'UK' },
    { code: 'en', label: 'EN' },
  ];

  const renderNavSection = (section: 'main' | 'library' | 'system', title?: string) => {
    const items = NAV_ITEMS.filter((i) => i.section === section);
    return (
      <div className="space-y-1 mb-5">
        {title && (
          <div className="px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 select-none">
            {title}
          </div>
        )}
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const label = t.nav[item.key] || item.key;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full relative flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-brand-red via-brand-red to-orange-600 text-white shadow-glow'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-white shadow-[0_0_8px_#ffffff]" />
              )}
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <aside className="w-64 h-full sidebar-redesign border-r border-white/5 flex flex-col justify-between p-4 select-none flex-shrink-0">
      {/* Brand Header */}
      <div className="pt-1 pb-4 mb-2 border-b border-white/5">
        <div
          className="flex items-center space-x-3 cursor-pointer group"
          onClick={() => setPage('home')}
        >
          <div className="relative">
            <img
              src={appLogo}
              alt="HDRezka"
              className="w-10 h-10 rounded-2xl object-cover shadow-[0_0_18px_rgba(229,9,20,0.4)] border border-brand-red/40 group-hover:scale-105 transition-transform"
            />
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0e0f16]" />
          </div>
          <div className="text-left">
            <div className="flex items-center space-x-1.5">
              <span className="text-sm font-black tracking-wider text-white">HDREZKA</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-brand-red text-white font-extrabold uppercase">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-medium">Desktop Edition</p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto pr-1">
        {renderNavSection('main', t.nav.menu)}
        {renderNavSection('library', t.nav.library)}
        {renderNavSection('system', t.nav.system)}
      </div>

      {/* Language Switcher & Footer */}
      <div className="pt-3 border-t border-white/5 space-y-2.5">
        {/* Telegram Channel Link */}
        <button
          onClick={() => {
            if (window.api?.openExternalUrl) {
              window.api.openExternalUrl(TELEGRAM_CHANNEL_URL);
            }
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#229ED9]/10 hover:bg-[#229ED9]/20 border border-[#229ED9]/20 text-[#229ED9] hover:text-[#52c1f7] text-xs font-semibold transition-all group cursor-pointer shadow-sm active:scale-95"
          title="Telegram @HDRezkaPC"
        >
          <div className="flex items-center space-x-2 truncate">
            <Send className="w-3.5 h-3.5 flex-shrink-0 group-hover:scale-110 transition-transform" />
            <span className="truncate">Telegram @HDRezkaPC</span>
          </div>
          <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 flex-shrink-0 ml-1" />
        </button>

        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-medium text-zinc-400 flex items-center space-x-1.5">
            <Globe className="w-3.5 h-3.5 text-zinc-500" />
            <span>{t.settings.language}</span>
          </span>

          {/* Language selector chips */}
          <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/5">
            {languages.map((l) => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  language === l.code
                    ? 'bg-brand-red text-white shadow-glow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};
