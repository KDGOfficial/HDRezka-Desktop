import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Radio, Sparkles } from 'lucide-react';
import appLogo from '../assets/logo.png';
import { APP_VERSION } from '../../shared/constants';
import { useTranslation } from '../i18n';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useMediaStore } from '../stores/useMediaStore';

let splashPlayedThisSession = false;

function formatMirrorHost(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  }
}

/**
 * Full-screen Neon Ember Cinema startup loading screen & launch menu shown once on app launch.
 * Coordinates with live settings/mirror/catalog readiness, uses compositor-only animations,
 * and respects prefers-reduced-motion.
 */
export const StartupSplash: React.FC = () => {
  const { t } = useTranslation();
  const { settingsLoaded, isFindingMirrors, mirrorsStatus, settings } = useSettingsStore();
  const { homeInitialLoaded, setSplashDone } = useMediaStore();

  const [phase, setPhase] = useState<'enter' | 'ready' | 'exit' | 'done'>(() =>
    splashPlayedThisSession ? 'done' : 'enter'
  );
  const [minElapsed, setMinElapsed] = useState(false);
  const [forceExit, setForceExit] = useState(false);
  const [displayPercent, setDisplayPercent] = useState(18);
  const finishStartedRef = useRef(false);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const prefersReduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    []
  );

  // Sync store if splash already played earlier in this session
  useEffect(() => {
    if (splashPlayedThisSession) {
      setSplashDone();
    }
  }, [setSplashDone]);

  const settingsReady = settingsLoaded;
  const mirrorsReady =
    settingsLoaded && (!isFindingMirrors || mirrorsStatus.length > 0 || homeInitialLoaded);
  const catalogReady = homeInitialLoaded;
  const allReady = settingsReady && mirrorsReady && catalogReady;

  const targetPercent = useMemo(() => {
    if (phase === 'ready' || phase === 'exit' || phase === 'done' || allReady) return 100;
    if (mirrorsReady) return 78;
    if (settingsReady) return 48;
    return 18;
  }, [phase, allReady, mirrorsReady, settingsReady]);

  // Smoothly ramp displayPercent toward targetPercent
  useEffect(() => {
    if (phase === 'done') return;
    setDisplayPercent((prev) => Math.max(prev, targetPercent));
  }, [targetPercent, phase]);

  const clearSplashTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const triggerExit = (immediate = false) => {
    if (phase === 'done') return;
    if (immediate) {
      clearSplashTimers();
      setPhase('done');
      setSplashDone();
      return;
    }
    if (finishStartedRef.current) return;
    finishStartedRef.current = true;
    clearSplashTimers();
    setDisplayPercent(100);
    setPhase('exit');
    const doneDelay = prefersReduced ? 120 : 420;
    const tDone = setTimeout(() => {
      setPhase('done');
      setSplashDone();
    }, doneDelay);
    timersRef.current.push(tDone);
  };

  // Minimum display window + safety ceiling so offline/slow networks never block launch
  useEffect(() => {
    if (phase === 'done') return;
    splashPlayedThisSession = true;

    const minDelay = prefersReduced ? 240 : 950;
    const ceilingDelay = prefersReduced ? 900 : 3800;

    const minTimer = setTimeout(() => setMinElapsed(true), minDelay);
    const ceilingTimer = setTimeout(() => setForceExit(true), ceilingDelay);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        triggerExit(phase === 'exit');
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(ceilingTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [phase === 'done', prefersReduced]);

  // Transition to 'ready' -> 'exit' -> 'done' once minimum time + initial data (or safety timeout) settle
  useEffect(() => {
    if (phase === 'done' || finishStartedRef.current) return;
    const readyToClose = (minElapsed && settingsLoaded && homeInitialLoaded) || forceExit;
    if (!readyToClose) return;

    finishStartedRef.current = true;
    setDisplayPercent(100);
    setPhase('ready');

    const holdDelay = prefersReduced ? 80 : 280;
    const exitDuration = prefersReduced ? 120 : 420;

    const exitTimer = setTimeout(() => {
      setPhase('exit');
      const doneTimer = setTimeout(() => {
        setPhase('done');
        setSplashDone();
      }, exitDuration);
      timersRef.current.push(doneTimer);
    }, holdDelay);
    timersRef.current.push(exitTimer);
  }, [minElapsed, settingsLoaded, homeInitialLoaded, forceExit, phase, prefersReduced, setSplashDone]);

  useEffect(() => () => clearSplashTimers(), []);

  if (phase === 'done') return null;

  const currentStatusText =
    phase === 'ready' || phase === 'exit' || allReady
      ? t.splash.ready
      : !settingsReady
        ? t.splash.stepSettings
        : !mirrorsReady
          ? t.splash.stepMirrors
          : t.splash.stepCatalog;

  const stages = [
    {
      id: 'settings',
      label: t.splash.stepSettings,
      done: settingsReady || phase === 'ready' || phase === 'exit',
      active: !settingsReady && phase === 'enter',
    },
    {
      id: 'mirrors',
      label: t.splash.stepMirrors,
      done: mirrorsReady || phase === 'ready' || phase === 'exit',
      active: settingsReady && !mirrorsReady && phase === 'enter',
    },
    {
      id: 'catalog',
      label: t.splash.stepCatalog,
      done: catalogReady || phase === 'ready' || phase === 'exit',
      active: settingsReady && mirrorsReady && !catalogReady && phase === 'enter',
    },
  ];

  const activeHost = settingsLoaded ? formatMirrorHost(settings.app?.activeMirror) : '';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={currentStatusText}
      className={`startup-splash cinema-player-surface fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#070507] select-none overflow-hidden ${
        phase === 'exit' ? 'startup-splash--exit' : ''
      }`}
    >
      {/* Dual Neon Ember Ambient Halos + Subtle Diagonal Cinema Light Sheen */}
      <div
        aria-hidden="true"
        className="startup-splash__glow startup-splash__glow--crimson pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="startup-splash__glow startup-splash__glow--amber pointer-events-none"
      />
      <div aria-hidden="true" className="startup-splash__sheen pointer-events-none" />

      {/* Center Emblem + Brand Header + Loading Menu Card */}
      <div className="relative z-10 flex flex-col items-center px-6">
        <div className="relative flex items-center justify-center mb-5">
          <span aria-hidden="true" className="startup-splash__ring startup-splash__ring--outer" />
          <span aria-hidden="true" className="startup-splash__ring startup-splash__ring--inner" />
          <span aria-hidden="true" className="startup-splash__orbit" />
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

        <p className="startup-splash__subtitle mt-2 text-[11px] font-mono font-semibold uppercase tracking-[0.24em] text-zinc-400">
          {t.splash.tagline} · v{APP_VERSION}
        </p>

        {/* Compact Neon Ember Loading Menu Card */}
        <div className="startup-splash__card w-[min(90vw,360px)] rounded-2xl cinema-glass border border-white/[0.12] p-4 mt-7 shadow-elevated">
          {/* Top Status & Tabular Percentage */}
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" aria-hidden="true" />
              <span className="text-xs font-bold text-zinc-100 truncate">{currentStatusText}</span>
            </div>
            <span className="text-xs font-mono font-extrabold text-brand-gold tabular-nums flex-shrink-0">
              {displayPercent}%
            </span>
          </div>

          {/* Compositor-Only ScaleX Ember Progress Track */}
          <div className="relative h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden mb-3.5">
            <div
              className="startup-splash__progress-fill h-full w-full rounded-full"
              style={{ transform: `scaleX(${displayPercent / 100})` }}
            />
            <div aria-hidden="true" className="startup-splash__bar-shimmer" />
          </div>

          {/* Live Initialization Stages */}
          <ul className="space-y-1.5">
            {stages.map((stage) => (
              <li
                key={stage.id}
                className={`flex items-center justify-between text-[11px] font-semibold transition-colors duration-200 ${
                  stage.done ? 'text-zinc-200' : stage.active ? 'text-white' : 'text-zinc-500'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {stage.done ? (
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5" aria-hidden="true" />
                    </span>
                  ) : stage.active ? (
                    <span className="w-4 h-4 rounded-full bg-brand-ember/20 border border-brand-orange/60 flex items-center justify-center flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-orange startup-splash__dot-pulse" />
                    </span>
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center flex-shrink-0">
                      <span className="w-1 h-1 rounded-full bg-zinc-600" />
                    </span>
                  )}
                  <span className="truncate">{stage.label}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* Bottom Strip: Active Mirror Indicator + Instant Skip */}
          <div className="mt-3.5 pt-3 border-t border-white/[0.08] flex items-center justify-between gap-2">
            {activeHost ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.09] text-[10px] font-mono text-zinc-300 truncate max-w-[205px]">
                <Radio className="w-3 h-3 text-emerald-400 flex-shrink-0" aria-hidden="true" />
                <span className="text-zinc-400">{t.splash.activeMirror}:</span>
                <span className="text-white font-bold truncate">{activeHost}</span>
              </span>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={() => triggerExit(phase === 'exit')}
              aria-label={t.splash.skip}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.15] border border-white/[0.12] text-[11px] font-bold text-zinc-200 hover:text-white active:scale-95 cursor-pointer flex-shrink-0"
            >
              <span>{t.splash.skip}</span>
              <span className="text-[10px] font-mono text-zinc-400">Esc</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
