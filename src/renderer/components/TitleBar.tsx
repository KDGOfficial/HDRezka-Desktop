import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Sparkles, Pin } from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useMediaStore } from '../stores/useMediaStore';
import appLogo from '../assets/logo.png';

export const TitleBar: React.FC = () => {
  const [isMax, setIsMax] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(100);
  const { settings, mirrorsStatus, updateInfo, setUpdateModalOpen } = useSettingsStore();
  const { setPage } = useMediaStore();

  useEffect(() => {
    const checkMax = async () => {
      if (window.api) {
        const max = await window.api.isMaximized();
        setIsMax(max);
      }
    };
    checkMax();
    const interval = setInterval(checkMax, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (window.api?.isAlwaysOnTop) {
      window.api.isAlwaysOnTop().then(setIsPinned);
    }
    if (window.api?.getZoomFactor) {
      setZoomFactor(Math.round(window.api.getZoomFactor() * 100));
    }
  }, []);

  // Global zoom shortcuts (Ctrl + Plus, Ctrl + Minus, Ctrl + 0, Ctrl + Wheel)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey && window.api?.getZoomFactor && window.api?.setZoomFactor) {
        e.preventDefault();
        const cur = window.api.getZoomFactor();
        const next = Math.max(0.7, Math.min(1.5, Math.round((cur + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100));
        window.api.setZoomFactor(next);
        setZoomFactor(Math.round(next * 100));
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (!window.api?.getZoomFactor || !window.api?.setZoomFactor) return;
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const cur = window.api.getZoomFactor();
        const next = Math.min(1.5, Math.round((cur + 0.1) * 10) / 10);
        window.api.setZoomFactor(next);
        setZoomFactor(Math.round(next * 100));
      } else if (e.ctrlKey && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        const cur = window.api.getZoomFactor();
        const next = Math.max(0.7, Math.round((cur - 0.1) * 10) / 10);
        window.api.setZoomFactor(next);
        setZoomFactor(Math.round(next * 100));
      } else if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        window.api.setZoomFactor(1);
        setZoomFactor(100);
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const handleMinimize = () => window.api?.minimize();
  const handleMaximize = () => {
    window.api?.maximize();
    setIsMax(!isMax);
  };
  const handleClose = () => window.api?.close();

  const handleTogglePin = async () => {
    if (window.api?.setAlwaysOnTop) {
      const next = await window.api.setAlwaysOnTop();
      setIsPinned(next);
    }
  };

  const handleResetZoom = () => {
    if (window.api?.setZoomFactor) {
      window.api.setZoomFactor(1);
      setZoomFactor(100);
    }
  };

  const currentMirror = settings.app.activeMirror || 'https://kinobase.org';
  const mirrorStatus = mirrorsStatus.find((m) => m.url === currentMirror);
  const isAvailable = mirrorStatus ? mirrorStatus.isAvailable : true;
  const needsVerification = Boolean(mirrorStatus?.isAvailable && mirrorStatus?.needsVerification);
  const cleanMirror = currentMirror.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <div className="app-titlebar h-10 w-full bg-[#070507]/95 border-b border-white/[0.06] flex items-center justify-between px-3.5 select-none drag-region z-50 relative">
      {/* Subtle neon ember hairline along very top */}
      <div
        className="absolute top-0 left-0 right-0 h-[1.5px] opacity-65 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent 5%, #FF124F 35%, #FF7A00 65%, transparent 95%)' }}
      />

      {/* Left: Brand Signature matching logo.png */}
      <div className="flex items-center gap-3 no-drag">
        <button
          type="button"
          onClick={() => setPage('home')}
          className="flex items-center gap-2 group cursor-pointer rounded-lg py-0.5 pr-1"
          aria-label="HDREZKA Desktop Home"
        >
          <span className="logo-ring rounded-full flex-shrink-0">
            <img
              src={appLogo}
              alt=""
              className="w-5 h-5 rounded-full object-cover block"
            />
          </span>
          <span className="font-display text-[12px] font-black tracking-[0.12em] text-white">
            HD<span className="text-ember-gradient">REZKA</span>
          </span>
          <span className="logo-pill inline-flex items-center gap-1 px-2 py-[1px] rounded-full text-[9px] font-display font-extrabold tracking-wider text-white">
            <svg className="w-2.5 h-2.5 text-white/90" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="0.5" y="1" width="4.8" height="4.4" rx="0.4" />
              <rect x="6.2" y="0.5" width="5.3" height="4.9" rx="0.4" />
              <rect x="0.5" y="6.3" width="4.8" height="4.4" rx="0.4" />
              <rect x="6.2" y="6.3" width="5.3" height="5.2" rx="0.4" />
            </svg>
            <span>PC</span>
          </span>
        </button>

        {/* Active Mirror Status Pill */}
        <button
          type="button"
          onClick={() => setPage('settings')}
          title="Настройки зеркала"
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-[10px] text-zinc-300 hover:text-white cursor-pointer"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              !isAvailable
                ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.85)]'
                : needsVerification
                ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]'
                : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]'
            }`}
          />
          <span className="truncate max-w-[140px] font-mono text-[10px]">{cleanMirror}</span>
          {mirrorStatus && mirrorStatus.latencyMs < 9000 && (
            <span className="text-zinc-500 font-mono text-[9px] tabular-nums">{mirrorStatus.latencyMs}ms</span>
          )}
        </button>

        {/* Update available mini-pill */}
        {updateInfo?.hasUpdate && (
          <button
            type="button"
            onClick={() => setUpdateModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full btn-ember text-[10px] font-extrabold cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-[#FFE29A] animate-pulse" aria-hidden="true" />
            <span>v{updateInfo.latestVersion}</span>
          </button>
        )}
      </div>

      {/* Right: Desktop Window Controls */}
      <div className="flex items-center no-drag gap-1">
        {zoomFactor !== 100 && (
          <button
            type="button"
            onClick={handleResetZoom}
            className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 hover:bg-white/20 text-zinc-200 mr-1 cursor-pointer"
            title="Сбросить масштаб (Ctrl+0)"
          >
            {zoomFactor}%
          </button>
        )}

        <button
          type="button"
          onClick={handleTogglePin}
          aria-label={isPinned ? 'Открепить окно' : 'Закрепить поверх всех окон'}
          aria-pressed={isPinned}
          className={`w-8 h-7 flex items-center justify-center rounded-lg cursor-pointer ${
            isPinned
              ? 'text-brand-orange bg-brand-crimson/20 border border-brand-ember/40'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.08]'
          }`}
          title={isPinned ? 'Открепить окно (поверх всех)' : 'Закрепить поверх всех окон'}
        >
          <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-brand-orange rotate-45' : ''}`} />
        </button>

        <button
          type="button"
          onClick={handleMinimize}
          aria-label="Свернуть"
          className="w-8 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"
          title="Свернуть"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          aria-label={isMax ? 'Восстановить' : 'Развернуть'}
          className="w-8 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"
          title={isMax ? 'Восстановить' : 'Развернуть'}
        >
          {isMax ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Закрыть"
          className="w-8 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-brand-crimson cursor-pointer"
          title="Закрыть"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
