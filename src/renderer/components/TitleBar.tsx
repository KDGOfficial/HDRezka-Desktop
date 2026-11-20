import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, Film, Globe } from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';

export const TitleBar: React.FC = () => {
  const [isMax, setIsMax] = useState(false);
  const { settings, mirrorsStatus } = useSettingsStore();

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

  return (
    <div className="h-9 w-full bg-dark-bg/95 border-b border-dark-border flex items-center justify-between px-3 select-none drag-region z-50">
      {/* Brand & Status */}
      <div className="flex items-center space-x-3 no-drag">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded bg-brand-red flex items-center justify-center text-white font-bold text-xs shadow-glow">
            <Film className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold tracking-wider text-white">HDREZKA</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">Desktop</span>
        </div>

        {/* Mirror indicator pill */}
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-dark-surface border border-white/5 text-[11px] text-zinc-400">
          <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
          <span className="truncate max-w-[140px]">{currentMirror.replace('https://', '')}</span>
        </div>
      </div>

      {/* Window Controls */}
      <div className="flex items-center no-drag space-x-1">
        <button
          onClick={handleMinimize}
          className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Свернуть"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          title={isMax ? 'Восстановить' : 'Развернуть'}
        >
          {isMax ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          onClick={handleClose}
          className="w-7 h-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-brand-red transition-colors"
          title="Закрыть"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
