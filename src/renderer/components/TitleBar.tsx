import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Sparkles, Globe } from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useMediaStore } from '../stores/useMediaStore';
import appLogo from '../assets/logo.png';

export const TitleBar: React.FC = () => {
  const [isMax, setIsMax] = useState(false);
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

  const handleMinimize = () => window.api?.minimize();
  const handleMaximize = () => {
    window.api?.maximize();
    setIsMax(!isMax);
  };
  const handleClose = () => window.api?.close();

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

      {/* Window Controls */}
      <div className="flex items-center no-drag space-x-0.5">
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
