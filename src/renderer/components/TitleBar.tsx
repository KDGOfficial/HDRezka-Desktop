import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Sparkles, Globe, Pin } from 'lucide-react';
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

  // Active mirror status
  const currentMirror = settings.app.activeMirror || 'https://hdrezka-home.tv';
  const mirrorStatus = mirrorsStatus.find((m) => m.url === currentMirror);
  const isAvailable = mirrorStatus ? mirrorStatus.isAvailable : true;
  const cleanMirror = currentMirror.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <div className="h-9 w-full bg-[#0a0b10] border-b border-white/5 flex items-center justify-between px-3 select-none drag-region z-50">
      {/* Brand & Mirror Status */}
      <div className="flex items-center space-x-3 no-drag">
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setPage('home')}>
          <img
            src={appLogo}
            alt="HDRezka Desktop"
            className="w-5 h-5 rounded-md object-cover shadow-[0_0_10px_rgba(229,9,20,0.5)] border border-brand-red/30"
          />
          <span className="text-xs font-black tracking-widest text-white">HDREZKA</span>
          <span className="text-[9px] px-1.5 py-0.2 rounded bg-gradient-to-r from-brand-red to-orange-500 text-white font-extrabold tracking-wider uppercase">
            Desktop
          </span>
        </div>

        {/* Mirror indicator pill */}
        <button
          onClick={() => setPage('settings')}
          title="Настройки зеркала"
          className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isAvailable ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]'
            }`}
          />
          <span className="truncate max-w-[130px] font-mono">{cleanMirror}</span>
          {mirrorStatus && mirrorStatus.latencyMs < 9000 && (
            <span className="text-zinc-500 font-mono text-[9px]">{mirrorStatus.latencyMs}ms</span>
          )}
        </button>

        {/* Update available mini-pill */}
        {updateInfo?.hasUpdate && (
          <button
            onClick={() => setUpdateModalOpen(true)}
            className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-brand-red/20 hover:bg-brand-red/30 border border-brand-red/40 text-[10px] text-brand-red hover:text-white font-bold transition-all shadow-glow"
          >
            <Sparkles className="w-3 h-3 text-orange-400 animate-pulse" />
            <span>v{updateInfo.latestVersion}</span>
          </button>
        )}
      </div>

      {/* Window Controls & Actions */}
      <div className="flex items-center no-drag space-x-0.5">
        {/* Zoom reset indicator if zoomed */}
        {zoomFactor !== 100 && (
          <button
            onClick={handleResetZoom}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white/10 hover:bg-white/20 text-zinc-300 transition-colors mr-1"
            title="Сбросить масштаб (Ctrl+0)"
          >
            {zoomFactor}%
          </button>
        )}

        {/* Pin (Always on top) button */}
        <button
          onClick={handleTogglePin}
          className={`w-8 h-7 flex items-center justify-center rounded transition-colors mr-0.5 ${
            isPinned
              ? 'text-brand-red bg-brand-red/15 hover:bg-brand-red/25 border border-brand-red/30'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`}
          title={isPinned ? 'Открепить окно (поверх всех)' : 'Закрепить поверх всех окон'}
        >
          <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-brand-red rotate-45' : ''}`} />
        </button>

        <button
          onClick={handleMinimize}
          className="w-8 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Свернуть"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          title={isMax ? 'Восстановить' : 'Развернуть'}
        >
          {isMax ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-brand-red transition-colors"
          title="Закрыть"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
