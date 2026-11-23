import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Tv,
  Globe,
  Database,
  RefreshCw,
  Trash2,
  Download,
  Upload,
  Check,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Send,
  Search,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  Play,
  Code2,
  Keyboard,
  RotateCcw,
  Wand2,
} from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { getTopGenres, normalizeInterestsProfile } from '../../shared/recommendations';
import {
  APP_VERSION,
  DEFAULT_HOTKEYS,
  TELEGRAM_CHANNEL_URL,
  AUTHOR_YOUTUBE_URL,
  AUTHOR_TELEGRAM_URL,
  AUTHOR_GITHUB_URL,
} from '../../shared/constants';
import { HotkeyAction } from '../../shared/types';
import { buildShortcutFromEvent, formatShortcutLabel } from '../../shared/utils';
import { useTranslation } from '../i18n';
import appLogo from '../assets/logo.png';
import authorPhoto from '../assets/author.jpg';

export const SettingsPage: React.FC = () => {
  const {
    settings,
    loadSettings,
    updateSettings,
    mirrorsStatus,
    checkMirrors,
    isCheckingMirrors,
    findOnlineMirrors,
    isFindingMirrors,
    verifyMirror,
    removeCustomMirror,
    setActiveMirror,
    updateInfo,
    isCheckingUpdate,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    updateProgress,
    setInterestsModalOpen,
    resetUserInterests,
  } = useSettingsStore();

  const { t, language, setLanguage, translateGenre } = useTranslation();

  const [customMirror, setCustomMirror] = useState('');
  const [cacheCleared, setCacheCleared] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [findMirrorsStatus, setFindMirrorsStatus] = useState<string | null>(null);
  const [interestsResetDone, setInterestsResetDone] = useState(false);
  const [recordingAction, setRecordingAction] = useState<HotkeyAction | null>(null);
  const [hotkeyNotice, setHotkeyNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const hotkeyNoticeTimerRef = useRef<any>(null);

  const showHotkeyNotice = (type: 'error' | 'success', text: string, ms = 3500) => {
    setHotkeyNotice({ type, text });
    if (hotkeyNoticeTimerRef.current) clearTimeout(hotkeyNoticeTimerRef.current);
    hotkeyNoticeTimerRef.current = setTimeout(() => setHotkeyNotice(null), ms);
  };

  useEffect(() => () => {
    if (hotkeyNoticeTimerRef.current) clearTimeout(hotkeyNoticeTimerRef.current);
  }, []);

  const hotkeys = { ...DEFAULT_HOTKEYS, ...(settings.hotkeys || {}) };
  const hotkeyItems: Array<{ action: HotkeyAction; label: string }> = [
    { action: 'playPause', label: t.settings.hkPlayPause },
    { action: 'seekBackward', label: t.settings.hkSeekBackward },
    { action: 'seekForward', label: t.settings.hkSeekForward },
    { action: 'volumeUp', label: t.settings.hkVolumeUp },
    { action: 'volumeDown', label: t.settings.hkVolumeDown },
    { action: 'fullscreen', label: t.settings.hkFullscreen },
    { action: 'mute', label: t.settings.hkMute },
    { action: 'toggleUi', label: t.settings.hkToggleUi },
    { action: 'togglePin', label: t.settings.hkTogglePin },
    { action: 'cycleScale', label: t.settings.hkCycleScale },
    { action: 'focusSearch', label: t.settings.hkFocusSearch },
  ];
  const hasCustomHotkeys = hotkeyItems.some(({ action }) => hotkeys[action] !== DEFAULT_HOTKEYS[action]);

  useEffect(() => {
    if (!recordingAction) return;
    document.documentElement.dataset.recordingShortcut = 'true';

    const onCaptureKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setRecordingAction(null);
        return;
      }

      const combo = buildShortcutFromEvent(e);
      if (!combo) return;

      const conflict = hotkeyItems.find(
        (item) => item.action !== recordingAction && hotkeys[item.action] === combo
      );
      if (conflict) {
        showHotkeyNotice('error', t.settings.hotkeysConflict.replace('{action}', conflict.label));
        setRecordingAction(null);
        return;
      }

      updateSettings({
        hotkeys: {
          ...hotkeys,
          [recordingAction]: combo,
        },
      });
      setRecordingAction(null);
      setHotkeyNotice(null);
    };

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-hotkey-btn]')) {
        setRecordingAction(null);
      }
    };
    const onBlur = () => setRecordingAction(null);
    window.addEventListener('keydown', onCaptureKey, true);
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      delete document.documentElement.dataset.recordingShortcut;
      window.removeEventListener('keydown', onCaptureKey, true);
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [recordingAction, settings.hotkeys, t]);

  const handleResetAllHotkeys = () => {
    setRecordingAction(null);
    updateSettings({ hotkeys: { ...DEFAULT_HOTKEYS } });
    showHotkeyNotice('success', t.settings.hotkeysResetDone, 3000);
  };

  const handleResetSingleHotkey = (action: HotkeyAction) => {
    if (recordingAction === action) setRecordingAction(null);
    const defaultBinding = DEFAULT_HOTKEYS[action];
    const conflict = hotkeyItems.find((item) => item.action !== action && hotkeys[item.action] === defaultBinding);
    if (conflict) {
      showHotkeyNotice('error', t.settings.hotkeysConflict.replace('{action}', conflict.label));
      return;
    }
    updateSettings({
      hotkeys: {
        ...hotkeys,
        [action]: defaultBinding,
      },
    });
    setHotkeyNotice(null);
  };

  useEffect(() => {
    loadSettings();
    checkMirrors();
  }, []);

  const handleToggleHomeSection = (key: keyof typeof settings.homeSections) => {
    updateSettings({
      homeSections: {
        ...settings.homeSections,
        [key]: !settings.homeSections[key],
      },
    });
  };

  const handleAddCustomMirror = () => {
    if (!customMirror.trim()) return;
    let url = customMirror.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    url = url.replace(/\/$/, '');

    const currentMirrors = settings.app.mirrors || [];
    if (!currentMirrors.includes(url)) {
      const updatedMirrors = [...currentMirrors, url];
      updateSettings({
        app: {
          ...settings.app,
          mirrors: updatedMirrors,
        },
      });
      setActiveMirror(url);
      setCustomMirror('');
      checkMirrors();
    }
  };

  const handleFindOnlineMirrors = async () => {
    const addedCount = await findOnlineMirrors();
    if (addedCount > 0) {
      setFindMirrorsStatus(t.settings.onlineMirrorsFound.replace('{count}', String(addedCount)));
    } else {
      setFindMirrorsStatus(t.settings.allMirrorsCurrent);
    }
    setTimeout(() => setFindMirrorsStatus(null), 4500);
  };

  const handleVerifyMirror = async (targetMirror: string) => {
    await verifyMirror(targetMirror);
  };

  const handleClearCache = async () => {
    if (!window.api) return;
    const ok = await window.api.clearCache();
    if (ok) {
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
    }
  };

  const handleExportBackup = async () => {
    if (!window.api) return;
    const json = await window.api.exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hdrezka_backup_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openExternal = (url: string) => {
    if (window.api?.openExternalUrl) {
      window.api.openExternalUrl(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !window.api) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = await window.api.importData(content);
        if (success) {
          setImportStatus(t.settings.importSuccess);
          loadSettings();
        } else {
          setImportStatus(t.settings.importError);
        }
        setTimeout(() => setImportStatus(null), 4000);
      }
    };
    reader.readAsText(file);
  };

  const isInstalling = updateProgress?.status === 'installing';
  const isReady =
    !isInstalling &&
    (updateProgress?.status === 'ready' ||
      (updateProgress?.status === 'downloading' &&
        (updateProgress.percent >= 100 ||
          (updateProgress.transferredBytes > 0 && updateProgress.transferredBytes >= updateProgress.totalBytes))));
  const isDownloading = updateProgress?.status === 'downloading' && !isReady;

  return (
    <div className="w-full pb-20 text-left select-none max-w-4xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="mb-8 pb-5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <span className="w-9 h-9 rounded-2xl play-squircle flex items-center justify-center flex-shrink-0">
              <Settings className="w-4 h-4 text-white" />
            </span>
            <span>{t.settings.title}</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1.5">
            {t.settings.subtitle} <span className="font-mono text-zinc-300">v{APP_VERSION}</span>
          </p>
        </div>
      </div>

      <div className="space-y-7">
        {/* Section: Theme (Light / Dark / System) */}
        <section className="p-6 rounded-3xl cinema-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-crimson/15 border border-brand-ember/30 flex items-center justify-center text-brand-orange">
              {settings.theme === 'light' ? (
                <Sun className="w-5 h-5" />
              ) : settings.theme === 'system' ? (
                <Monitor className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="font-display text-sm font-black text-white">Тема оформления</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Светлая, тёмная или как в системе</p>
            </div>
          </div>

          <div className="theme-input-bg flex items-center bg-[#0B070A] p-1 rounded-full border border-white/[0.08]">
            {(
              [
                { id: 'dark', label: 'Тёмная', icon: Moon },
                { id: 'light', label: 'Светлая', icon: Sun },
                { id: 'system', label: 'Системная', icon: Monitor },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = (settings.theme || 'dark') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateSettings({ theme: opt.id })}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                    active ? 'btn-ember text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Section: Language */}
        <section className="p-6 rounded-3xl cinema-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-crimson/15 border border-brand-ember/30 flex items-center justify-center text-brand-orange">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-sm font-black text-white">{t.settings.language}</h2>
              <p className="text-xs text-zinc-400 mt-0.5">{t.settings.languageDesc}</p>
            </div>
          </div>

          <div className="flex items-center bg-[#0B070A] p-1 rounded-full border border-white/[0.08]">
            {(
              [
                { id: 'ru', label: 'Русский' },
                { id: 'uk', label: 'Українська' },
                { id: 'en', label: 'English' },
              ] as const
            ).map((lang) => (
              <button
                key={lang.id}
                type="button"
                aria-pressed={language === lang.id}
                onClick={() => setLanguage(lang.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                  language === lang.id ? 'btn-ember text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </section>

        {/* Section: Auto-Update via GitHub */}
        <section className="p-6 rounded-3xl cinema-panel space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] flex-wrap gap-2">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl play-squircle flex items-center justify-center text-white">
                <Sparkles className="w-5 h-5 text-[#FFE29A]" />
              </div>
              <div>
                <h2 className="font-display text-sm font-black text-white">{t.settings.updates}</h2>
                <p className="text-xs text-zinc-400 mt-0.5">{t.settings.updatesDesc}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => checkForUpdates(false)}
              disabled={isCheckingUpdate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin text-brand-orange' : ''}`} />
              <span>{isCheckingUpdate ? t.settings.checkingUpdates : t.settings.checkUpdatesBtn}</span>
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-[#0B070A]/85 border border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  {updateInfo?.hasUpdate ? (
                    <span className="text-brand-orange flex items-center">
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      {t.settings.newVersionFound}: v{updateInfo.latestVersion}
                    </span>
                  ) : (
                    <span className="text-emerald-400 flex items-center">
                      <Check className="w-3.5 h-3.5 mr-1" />
                      {t.settings.latestVersion} (v{APP_VERSION})
                    </span>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                GitHub: <span className="font-mono text-zinc-400">KDGOfficial/HDRezka-Desktop</span>
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {updateInfo?.hasUpdate && !isReady && (
                <button
                  type="button"
                  onClick={downloadUpdate}
                  disabled={isDownloading}
                  className="px-4 py-2 rounded-full btn-ember text-white text-xs font-extrabold active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isDownloading ? t.settings.downloading : t.settings.downloadUpdate}
                </button>
              )}

              {isInstalling ? (
                <div className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600/50 text-white text-xs font-bold">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                  <span>{t.updateModal.installing}</span>
                </div>
              ) : isReady ? (
                <button
                  type="button"
                  onClick={installUpdate}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-xs font-extrabold shadow-glow active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t.settings.installRestart}</span>
                </button>
              ) : null}

              <a
                href="https://github.com/KDGOfficial/HDRezka-Desktop/releases"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-200 text-xs font-bold"
              >
                <span>{t.settings.downloadFromGithub}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {isDownloading && updateProgress && (
            <div className="p-4 rounded-2xl bg-[#0B070A]/90 border border-brand-ember/40 space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-white">{t.settings.downloading}</span>
                <span className="font-mono text-brand-orange">{updateProgress.percent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${updateProgress.percent}%`,
                    background: 'linear-gradient(90deg, #FF124F 0%, #FF7A00 100%)',
                  }}
                />
              </div>
            </div>
          )}

          <label className="flex items-center justify-between pt-1 cursor-pointer">
            <span className="text-xs text-zinc-300 font-semibold">{t.settings.autoCheckOnStart}</span>
            <input
              type="checkbox"
              checked={settings.app.checkUpdatesOnStart}
              onChange={(e) =>
                updateSettings({
                  app: { ...settings.app, checkUpdatesOnStart: e.target.checked },
                })
              }
              className="w-4 h-4 accent-[#FF4D1A] cursor-pointer"
            />
          </label>
        </section>

        {/* Section: Mirrors & Network */}
        <section className="p-6 rounded-3xl cinema-panel space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] flex-wrap gap-2">
            <div>
              <h2 className="font-display text-sm font-black text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-brand-orange" />
                <span>{t.settings.mirrors}</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">{t.settings.mirrorsDesc}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleFindOnlineMirrors}
                disabled={isFindingMirrors}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand-crimson/15 hover:bg-brand-crimson/25 text-brand-orange border border-brand-ember/35 text-xs font-bold disabled:opacity-50 cursor-pointer active:scale-95"
                title={t.settings.findOnlineMirrors}
              >
                <Search className={`w-3.5 h-3.5 ${isFindingMirrors ? 'animate-spin' : ''}`} />
                <span>{isFindingMirrors ? t.settings.findingOnlineMirrors : t.settings.findOnlineMirrors}</span>
              </button>
              <button
                type="button"
                onClick={() => handleVerifyMirror(settings.app.activeMirror)}
                className="px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-zinc-200 cursor-pointer"
                title={t.settings.verifyBtn}
              >
                <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-emerald-400" />
                <span>{t.details.passVerification}</span>
              </button>
              <button
                type="button"
                onClick={() => checkMirrors()}
                disabled={isCheckingMirrors}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-zinc-200 disabled:opacity-50 border border-white/[0.1] cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingMirrors ? 'animate-spin text-brand-orange' : ''}`} />
                <span>{isCheckingMirrors ? t.settings.testing : t.settings.testPing}</span>
              </button>
            </div>
          </div>

          {findMirrorsStatus && (
            <div className="p-3.5 rounded-2xl bg-brand-crimson/15 border border-brand-ember/35 text-amber-200 text-xs flex items-center gap-2 animate-fadeIn">
              <Sparkles className="w-4 h-4 text-brand-orange flex-shrink-0" />
              <span>{findMirrorsStatus}</span>
            </div>
          )}

          {(() => {
            const activeStatus = mirrorsStatus.find((m) => m.url === settings.app.activeMirror);
            const activeNeedsVerification = activeStatus?.isAvailable && activeStatus?.needsVerification;
            const availableMirrors = mirrorsStatus.filter((m) => m.isAvailable);
            const allAvailableNeedVerification =
              availableMirrors.length > 0 && availableMirrors.every((m) => m.needsVerification);
            const shouldShowBanner = activeNeedsVerification || allAvailableNeedVerification;

            return shouldShowBanner ? (
              <div className="p-3.5 rounded-2xl bg-amber-950/35 border border-amber-500/35 text-amber-200 text-xs flex items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="leading-snug">{t.settings.needsVerificationHint}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleVerifyMirror(settings.app.activeMirror)}
                  className="px-3.5 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs flex-shrink-0 cursor-pointer active:scale-95"
                >
                  {t.details.passVerification}
                </button>
              </div>
            ) : null;
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {settings.app.mirrors?.map((mirror) => {
              const isActive = settings.app.activeMirror === mirror;
              const status = mirrorsStatus.find((m) => m.url === mirror);
              return (
                <div
                  key={mirror}
                  onClick={() => setActiveMirror(mirror)}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer group ${
                    isActive
                      ? 'bg-brand-crimson/15 border-brand-ember text-white shadow-glow-sm'
                      : 'bg-white/[0.04] border-white/[0.07] hover:border-white/20 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0 mr-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        status?.isAvailable
                          ? status.needsVerification
                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                            : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                          : 'bg-rose-500'
                      }`}
                    />
                    <span className="text-xs font-bold truncate font-mono">{mirror}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {status && (
                      <span className="text-[10px] text-zinc-400 font-mono tabular-nums">
                        {status.latencyMs < 9000
                          ? `${status.latencyMs}ms${status.needsVerification ? ' (' + (t.settings.protection || 'защита') + ')' : ''}`
                          : t.settings.error}
                      </span>
                    )}
                    {status?.needsVerification && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVerifyMirror(mirror);
                        }}
                        className="px-2.5 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/35 text-[10px] font-bold cursor-pointer"
                        title={t.details.passVerification}
                      >
                        {t.details.passVerification}
                      </button>
                    )}
                    {isActive && (
                      <span className="px-2 py-0.5 rounded-full btn-ember text-white text-[9px] font-black uppercase">
                        {t.settings.active}
                      </span>
                    )}
                    {settings.app.mirrors && settings.app.mirrors.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCustomMirror(mirror);
                        }}
                        className="p-1 rounded-full hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        title={t.settings.deleteMirror}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={customMirror}
              onChange={(e) => setCustomMirror(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomMirror()}
              placeholder={t.settings.addMirrorPlaceholder}
              className="flex-1 bg-[#0B070A] border border-white/[0.1] rounded-full px-4 py-2.5 text-xs text-white outline-none focus:border-brand-ember font-mono"
            />
            <button
              type="button"
              onClick={handleAddCustomMirror}
              className="px-5 py-2.5 rounded-full btn-ember text-white text-xs font-extrabold flex-shrink-0 cursor-pointer active:scale-95"
            >
              {t.settings.addMirrorBtn}
            </button>
          </div>
        </section>

        {/* Section: Video Player */}
        <section className="p-6 rounded-3xl cinema-panel space-y-4">
          <h2 className="font-display text-sm font-black text-white flex items-center gap-2 pb-3 border-b border-white/[0.06]">
            <Tv className="w-4 h-4 text-brand-orange" />
            <span>{t.settings.player}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07] cursor-pointer">
              <div>
                <div className="text-xs font-bold text-white">{t.settings.autoplay}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{t.settings.autoplayDesc}</div>
              </div>
              <input
                type="checkbox"
                checked={settings.player.autoPlay}
                onChange={(e) =>
                  updateSettings({ player: { ...settings.player, autoPlay: e.target.checked } })
                }
                className="w-4 h-4 accent-[#FF4D1A] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07] cursor-pointer">
              <div>
                <div className="text-xs font-bold text-white">{t.settings.autoNext}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{t.settings.autoNextDesc}</div>
              </div>
              <input
                type="checkbox"
                checked={settings.player.autoPlayNextEpisode}
                onChange={(e) =>
                  updateSettings({
                    player: { ...settings.player, autoPlayNextEpisode: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-[#FF4D1A] cursor-pointer"
              />
            </label>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07] sm:col-span-2">
              <div>
                <div className="text-xs font-bold text-white">{t.settings.defaultQuality}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{t.settings.defaultQualityDesc}</div>
              </div>
              <select
                aria-label={t.settings.defaultQuality}
                value={settings.player.defaultQuality}
                onChange={(e) =>
                  updateSettings({ player: { ...settings.player, defaultQuality: e.target.value } })
                }
                className="bg-[#0B070A] border border-white/[0.12] rounded-full px-4 py-1.5 text-xs text-white outline-none focus:border-brand-ember cursor-pointer font-bold"
              >
                <option value="1080p" className="bg-[#140E12]">1080p</option>
                <option value="720p" className="bg-[#140E12]">720p</option>
                <option value="480p" className="bg-[#140E12]">480p</option>
                <option value="360p" className="bg-[#140E12]">360p</option>
              </select>
            </div>
          </div>
        </section>

        {/* Section: Keyboard Shortcuts */}
        <section className="p-6 rounded-3xl cinema-panel space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-crimson/15 border border-brand-ember/30 flex items-center justify-center text-brand-orange flex-shrink-0">
                <Keyboard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-sm font-black text-white">{t.settings.hotkeys}</h2>
                <p className="text-xs text-zinc-400 mt-0.5">{t.settings.hotkeysDesc}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetAllHotkeys}
              disabled={!hasCustomHotkeys}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-zinc-200 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5 text-brand-orange" />
              <span>{t.settings.hotkeysReset}</span>
            </button>
          </div>

          {hotkeyNotice && (
            <div
              className={`text-xs p-3 rounded-2xl border animate-fadeIn ${
                hotkeyNotice.type === 'error'
                  ? 'text-amber-200 bg-amber-950/35 border-amber-500/35'
                  : 'text-emerald-300 bg-emerald-950/35 border-emerald-500/30'
              }`}
            >
              {hotkeyNotice.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {hotkeyItems.map(({ action, label }) => {
              const isRecording = recordingAction === action;
              const isModified = hotkeys[action] !== DEFAULT_HOTKEYS[action];
              return (
                <div
                  key={action}
                  className={`flex items-center justify-between gap-2 p-3.5 rounded-2xl border transition-all ${
                    isRecording
                      ? 'bg-brand-crimson/15 border-brand-ember shadow-glow-sm'
                      : 'bg-white/[0.04] border-white/[0.07]'
                  }`}
                >
                  <span className="text-xs font-bold text-zinc-200 truncate">{label}</span>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isModified && !isRecording && (
                      <button
                        type="button"
                        onClick={() => handleResetSingleHotkey(action)}
                        aria-label={`${t.settings.hotkeysReset}: ${label}`}
                        title={t.settings.hotkeysReset}
                        className="p-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.14] text-zinc-400 hover:text-white cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}

                    <button
                      type="button"
                      data-hotkey-btn={action}
                      onClick={() => {
                        setHotkeyNotice(null);
                        setRecordingAction(isRecording ? null : action);
                      }}
                      aria-pressed={isRecording}
                      className={`min-w-[84px] px-3 py-1.5 rounded-full text-xs font-mono font-bold text-center cursor-pointer transition-all ${
                        isRecording
                          ? 'btn-ember text-white animate-pulse'
                          : isModified
                            ? 'bg-brand-crimson/20 border border-brand-ember/50 text-white hover:bg-brand-crimson/30'
                            : 'logo-pill text-zinc-100 hover:border-brand-orange/60'
                      }`}
                    >
                      {isRecording ? t.settings.hotkeysPressKey : formatShortcutLabel(hotkeys[action])}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section: Interests & Adaptive Recommendations */}
        <section className="p-6 rounded-3xl cinema-panel space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-crimson/15 border border-brand-ember/30 flex items-center justify-center text-brand-orange flex-shrink-0">
                <Wand2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-sm font-black text-white">{t.interests.settingsTitle}</h2>
                <p className="text-xs text-zinc-400 mt-0.5">{t.interests.settingsDesc}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setInterestsModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full btn-ember text-white text-xs font-extrabold cursor-pointer active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t.interests.editBtn}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await resetUserInterests();
                  setInterestsResetDone(true);
                  setTimeout(() => setInterestsResetDone(false), 3000);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-zinc-300 hover:text-white cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5 text-brand-orange" />
                <span>{interestsResetDone ? t.interests.resetDone : t.interests.resetBtn}</span>
              </button>
            </div>
          </div>

          {(() => {
            const profile = normalizeInterestsProfile(settings.interests);
            const topGenres = getTopGenres(profile, 8);
            const hasLearned = Object.keys(profile.genreScores).length > 0 || Object.keys(profile.typeScores).length > 0;
            return (
              <div className="space-y-3">
                {profile.favoriteTypes.length > 0 && (
                  <div className="flex items-center flex-wrap gap-2">
                    {profile.favoriteTypes.map((type) => (
                      <span
                        key={type}
                        className="px-3 py-1 rounded-full bg-brand-crimson/15 border border-brand-ember/35 text-xs font-bold text-white"
                      >
                        {t.catalog.categories[type]}
                      </span>
                    ))}
                  </div>
                )}

                {topGenres.length > 0 ? (
                  <div className="flex items-center flex-wrap gap-2">
                    {topGenres.map((g) => (
                      <span
                        key={g.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.09] text-xs font-bold text-zinc-200"
                      >
                        <span>{translateGenre(g.id)}</span>
                        {g.source === 'learned' && (
                          <span className="text-[10px] font-semibold text-brand-orange">
                            · {t.interests.learnedLabel}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">{t.interests.noInterestsYet}</p>
                )}

                {hasLearned && (
                  <p className="text-[11px] text-emerald-300/90 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{t.interests.profileAdapted}</span>
                  </p>
                )}
              </div>
            );
          })()}
        </section>

        {/* Section: Home Sections */}
        <section className="p-6 rounded-3xl cinema-panel space-y-4">
          <h2 className="font-display text-sm font-black text-white pb-3 border-b border-white/[0.06]">
            {t.settings.homeSections}
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'hero', label: t.settings.secHero },
              { id: 'continueWatching', label: t.settings.secContinue },
              { id: 'popular', label: t.settings.secPopular },
              { id: 'newReleases', label: t.settings.secNew },
              { id: 'topMovies', label: t.settings.secTopMovies },
              { id: 'topSeries', label: t.settings.secTopSeries },
              { id: 'recommendations', label: t.settings.secRecommendations },
              { id: 'expected', label: t.settings.secExpected },
            ].map((sec) => {
              const enabled = Boolean((settings.homeSections as any)[sec.id]);
              return (
                <button
                  key={sec.id}
                  type="button"
                  aria-pressed={enabled}
                  onClick={() => handleToggleHomeSection(sec.id as any)}
                  className={`p-3 rounded-2xl border text-xs font-bold text-left flex items-center justify-between cursor-pointer ${
                    enabled
                      ? 'bg-brand-crimson/15 border-brand-ember text-white shadow-glow-sm'
                      : 'bg-white/[0.04] border-white/[0.07] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className="truncate pr-1">{sec.label}</span>
                  {enabled && <Check className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Section: Data Management */}
        <section className="p-6 rounded-3xl cinema-panel space-y-4">
          <h2 className="font-display text-sm font-black text-white flex items-center gap-2 pb-3 border-b border-white/[0.06]">
            <Database className="w-4 h-4 text-brand-orange" />
            <span>{t.settings.dataManagement}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={handleClearCache}
              className="flex items-center justify-center gap-2 p-3 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-bold text-zinc-200 cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-brand-orange" />
              <span>{cacheCleared ? t.settings.cacheCleared : t.settings.clearCache}</span>
            </button>

            <button
              type="button"
              onClick={handleExportBackup}
              className="flex items-center justify-center gap-2 p-3 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-bold text-zinc-200 cursor-pointer"
            >
              <Download className="w-4 h-4 text-brand-orange" />
              <span>{t.settings.exportBackup}</span>
            </button>

            <label className="flex items-center justify-center gap-2 p-3 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-bold text-zinc-200 cursor-pointer">
              <Upload className="w-4 h-4 text-brand-orange" />
              <span>{t.settings.importBackup}</span>
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
          </div>

          {importStatus && (
            <div className="text-xs text-emerald-300 bg-emerald-950/35 p-3 rounded-2xl border border-emerald-500/30">
              {importStatus}
            </div>
          )}
        </section>

        {/* Section: About */}
        <section className="p-6 rounded-3xl cinema-panel space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="logo-ring rounded-full flex-shrink-0">
                <img src={appLogo} alt="HDRezka Desktop" width={64} height={64} className="w-16 h-16 rounded-full object-cover block" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display text-base font-black tracking-wider text-white">
                    HD<span className="text-ember-gradient">REZKA</span> Desktop
                  </span>
                  <span className="logo-pill px-2.5 py-0.5 rounded-full text-white text-[10px] font-display font-black uppercase">
                    PC · v{APP_VERSION}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1.5 max-w-md leading-relaxed">{t.settings.aboutDesc}</p>
                <div className="text-[11px] text-zinc-500 mt-2 font-semibold">
                  {t.settings.license} · {t.settings.developers} · Neon Ember Cinema UI
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0">
              <button
                type="button"
                onClick={() => openExternal(TELEGRAM_CHANNEL_URL)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-400 hover:text-white active:scale-95 cursor-pointer"
                title="Telegram @HDRezkaPC"
              >
                <Send className="w-3.5 h-3.5 opacity-75" />
                <span>@HDRezkaPC</span>
              </button>

              <a
                href="https://github.com/KDGOfficial/HDRezka-Desktop"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white flex-shrink-0 active:scale-95"
              >
                <span>GitHub Repository</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Unobtrusive collapsible "About the Author" disclosure */}
          <details className="author-disclosure border-t border-white/[0.06] pt-4">
            <summary className="flex items-center justify-between gap-3 cursor-pointer rounded-2xl px-3 py-2 -mx-3 hover:bg-white/[0.04]">
              <span className="flex items-center gap-2.5 min-w-0">
                <ChevronRight
                  className="author-disclosure-chevron w-4 h-4 text-brand-orange flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="logo-ring rounded-full flex-shrink-0">
                  <img
                    src={authorPhoto}
                    alt=""
                    width={26}
                    height={26}
                    loading="lazy"
                    decoding="async"
                    className="w-[26px] h-[26px] rounded-full object-cover object-top block"
                  />
                </span>
                <span className="font-display text-xs font-black text-white truncate">{t.settings.authorToggle}</span>
                <span className="text-xs text-zinc-400 truncate">· KDG (@KDGOfficial)</span>
              </span>
              <span className="logo-pill px-2.5 py-0.5 rounded-full text-[10px] font-bold text-zinc-200 flex-shrink-0">
                {t.settings.authorBadge}
              </span>
            </summary>

            <div className="mt-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex flex-col sm:flex-row items-start gap-4">
              <div className="logo-ring rounded-2xl flex-shrink-0">
                <img
                  src={authorPhoto}
                  alt="KDG (KDGOfficial)"
                  width={84}
                  height={84}
                  loading="lazy"
                  decoding="async"
                  className="w-[84px] h-[84px] rounded-[14px] object-cover object-top block"
                />
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display text-sm font-black text-white">KDG</span>
                  <span className="font-mono text-[11px] text-brand-orange">@KDGOfficial</span>
                  <span className="px-2 py-0.5 rounded-full bg-brand-crimson/15 border border-brand-ember/35 text-[10px] font-bold text-amber-200">
                    {t.settings.authorBadge}
                  </span>
                </div>

                <p className="text-[11px] font-semibold text-zinc-300">{t.settings.authorRole}</p>
                <p className="text-xs text-zinc-200 leading-relaxed">{t.settings.authorFirstApp}</p>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{t.settings.authorGithubInfo}</p>

                <div className="flex items-center gap-2 flex-wrap pt-1.5">
                  <button
                    type="button"
                    onClick={() => openExternal(AUTHOR_YOUTUBE_URL)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full btn-ember text-white text-xs font-extrabold active:scale-95 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                    <span>{t.settings.authorYoutube}</span>
                    <ExternalLink className="w-3 h-3 opacity-80" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => openExternal(AUTHOR_TELEGRAM_URL)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white active:scale-95 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" />
                    <span>{t.settings.authorTelegram}</span>
                    <ExternalLink className="w-3 h-3 opacity-60" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => openExternal(AUTHOR_GITHUB_URL)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white active:scale-95 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                    <span>{t.settings.authorGithub}</span>
                    <ExternalLink className="w-3 h-3 opacity-50" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
};
