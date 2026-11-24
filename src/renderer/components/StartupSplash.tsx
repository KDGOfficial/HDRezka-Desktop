import React, { useEffect, useState } from 'react';
import appLogo from '../assets/logo.png';
import { APP_VERSION } from '../../shared/constants';

let splashPlayedThisSession = false;

/**
 * Full-screen Neon Ember Cinema startup splash animation shown once on app launch.
 * Uses compositor-only opacity/transform animations and respects prefers-reduced-motion.
 */
export const StartupSplash: React.FC = () => {
  const [phase, setPhase] = useState<'enter' | 'exit' | 'done'>(() =>
    splashPlayedThisSession ? 'done' : 'enter'
  );

  useEffect(() => {
    if (phase === 'done') return;
    splashPlayedThisSession = true;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const exitDelay = prefersReduced ? 320 : 1280;
    const doneDelay = prefersReduced ? 520 : 1720;

    const exitTimer = setTimeout(() => setPhase('exit'), exitDelay);
    const doneTimer = setTimeout(() => setPhase('done'), doneDelay);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        setPhase('done');
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [phase === 'done']);

  if (phase === 'done') return null;

  return (
    <div
      role="presentation"
      onClick={() => setPhase('done')}
      className={`startup-splash fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#070507] select-none overflow-hidden cursor-pointer ${
        phase === 'exit' ? 'startup-splash--exit' : ''
      }`}
    >
      {/* Dual Neon Ember Ambient Halos */}
      <div
        aria-hidden="true"
        className="startup-splash__glow startup-splash__glow--crimson pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="startup-splash__glow startup-splash__glow--amber pointer-events-none"
      />

      {/* Center Emblem + Expanding Pulse Rings */}
      <div className="relative flex flex-col items-center">
        <div className="relative flex items-center justify-center mb-6">
          <span aria-hidden="true" className="startup-splash__ring startup-splash__ring--outer" />
          <span aria-hidden="true" className="startup-splash__ring startup-splash__ring--inner" />
          <div className="startup-splash__logo logo-ring rounded-full p-[3px]">
            <img
              src={appLogo}
              alt="HDREZKA Desktop"
              className="w-24 h-24 rounded-full object-cover block shadow-[0_0_48px_rgba(255,42,66,0.65)]"
            />
          </div>
        </div>

        {/* Geometric Wordmark + PC Pill */}
        <div className="startup-splash__title flex items-center gap-2.5">
          <span className="font-display text-3xl sm:text-4xl font-black tracking-[0.14em] text-white drop-shadow-[0_6px_28px_rgba(255,18,79,0.45)]">
            HDREZKA
          </span>
          <span className="logo-pill px-2.5 py-1 rounded-full text-xs font-display font-black tracking-widest text-white">
            PC
          </span>
        </div>

        <p className="startup-splash__subtitle mt-2 text-[11px] font-mono font-semibold uppercase tracking-[0.28em] text-zinc-400">
          Neon Ember Cinema · v{APP_VERSION}
        </p>

        {/* Sleek Ember Progress Sweep */}
        <div className="mt-7 w-44 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="startup-splash__bar h-full w-full rounded-full" />
        </div>
      </div>
    </div>
  );
};
