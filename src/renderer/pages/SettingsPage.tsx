import React, { useState, useEffect } from 'react';
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
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Info,
  CheckCircle2,
  Send,
  Search,
} from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { APP_VERSION, TELEGRAM_CHANNEL_URL } from '../../shared/constants';
import { useTranslation, Locale } from '../i18n';
import appLogo from '../assets/logo.png';

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
    removeCustomMirror,
    setActiveMirror,
    updateInfo,
    isCheckingUpdate,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    updateProgress,
  } = useSettingsStore();

  const { t, language, setLanguage } = useTranslation();

  const [customMirror, setCustomMirror] = useState('');
  const [cacheCleared, setCacheCleared] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [findMirrorsStatus, setFindMirrorsStatus] = useState<string | null>(null);

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

  const handleVerifyMirror = async (targetMirror?: string) => {
    if (window.api) {
      try {
        const mirrorToVerify = targetMirror || settings.app.activeMirror;
        if (targetMirror && targetMirror !== settings.app.activeMirror) {
          await setActiveMirror(targetMirror);
        }
        await window.api.verifyMirror(mirrorToVerify);
      } catch (err) {
        console.warn('[Settings] verifyMirror error:', err);
      } finally {
        await checkMirrors();
      }
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
      <div className="mb-8 pb-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center">
            <Settings className="w-6 h-6 text-brand-red mr-2.5" />
            {t.settings.title}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {t.settings.subtitle} v{APP_VERSION}
          </p>
        </div>

        {/* Telegram Channel Link */}
        <button
          onClick={() => {
            if (window.api?.openExternalUrl) {
              window.api.openExternalUrl(TELEGRAM_CHANNEL_URL);
            }
          }}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#229ED9] border border-[#229ED9]/30 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer self-start sm:self-auto"
          title="Telegram @HDRezkaPC"
        >
          <Send className="w-4 h-4 flex-shrink-0" />
          <span>Telegram @HDRezkaPC</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-60 ml-0.5" />
        </button>
      </div>

      <div className="space-y-8">
        {/* Section: Language */}
        <div className="p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300">
              <Globe className="w-5 h-5 text-brand-red" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{t.settings.language}</h2>
              <p className="text-xs text-zinc-400 mt-0.5">{t.settings.languageDesc}</p>
            </div>
          </div>

          <div className="flex items-center bg-[#090a0f] p-1 rounded-2xl border border-white/10">
            {(
              [
                { id: 'ru', label: 'Русский' },
                { id: 'uk', label: 'Українська' },
                { id: 'en', label: 'English' },
              ] as const
            ).map((lang) => (
              <button
                key={lang.id}
                onClick={() => setLanguage(lang.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  language === lang.id
                    ? 'bg-gradient-to-r from-brand-red to-orange-600 text-white shadow-glow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Section: Auto-Update via GitHub */}
        <div className="p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-white/5 flex-wrap gap-2">
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-2xl bg-brand-red/10 border border-brand-red/20 flex items-center justify-center text-brand-red shadow-glow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">{t.settings.updates}</h2>
                <p className="text-xs text-zinc-400 mt-0.5">{t.settings.updatesDesc}</p>
              </div>
            </div>

            <button
              onClick={() => checkForUpdates(false)}
              disabled={isCheckingUpdate}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white disabled:opacity-50 transition-all active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin text-brand-red' : ''}`} />
              <span>{isCheckingUpdate ? t.settings.checkingUpdates : t.settings.checkUpdatesBtn}</span>
            </button>
          </div>

          {/* Update Status Card */}
          <div className="p-4 rounded-2xl bg-dark-bg/80 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-white">
                  {updateInfo?.hasUpdate ? (
                    <span className="text-brand-red flex items-center">
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

            <div className="flex items-center space-x-2">
              {updateInfo?.hasUpdate && !isReady && (
                <button
                  onClick={downloadUpdate}
                  disabled={isDownloading}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white text-xs font-bold shadow-glow transition-all active:scale-95 disabled:opacity-50"
                >
                  {isDownloading ? t.settings.downloading : t.settings.downloadUpdate}
                </button>
              )}

              {isInstalling ? (
                <div className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600/50 text-white text-xs font-bold shadow-glow">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                  <span>{t.updateModal.installing}</span>
                </div>
              ) : isReady ? (
                <button
                  onClick={installUpdate}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-xs font-bold shadow-glow transition-all active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t.settings.installRestart}</span>
                </button>
              ) : null}

              <a
                href="https://github.com/KDGOfficial/HDRezka-Desktop/releases"
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold transition-colors"
              >
                <span>{t.settings.downloadFromGithub}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Download progress bar */}
          {isDownloading && updateProgress && (
            <div className="p-4 rounded-2xl bg-dark-bg/90 border border-brand-red/30 space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-white">{t.settings.downloading}</span>
                <span className="font-mono text-brand-red font-bold">{updateProgress.percent}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-red to-orange-500 transition-all duration-200"
                  style={{ width: `${updateProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Toggle auto check on startup */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-zinc-300 font-medium">{t.settings.autoCheckOnStart}</span>
            <input
              type="checkbox"
              checked={settings.app.checkUpdatesOnStart}
              onChange={(e) =>
                updateSettings({
                  app: { ...settings.app, checkUpdatesOnStart: e.target.checked },
                })
              }
              className="w-4 h-4 accent-brand-red cursor-pointer"
            />
          </div>
        </div>

        {/* Section: Mirrors & Network */}
        <div className="p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-white/5 flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center">
                <Globe className="w-4 h-4 text-brand-red mr-2" />
                {t.settings.mirrors}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">{t.settings.mirrorsDesc}</p>
            </div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              <button
                onClick={handleFindOnlineMirrors}
                disabled={isFindingMirrors}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600/30 hover:to-blue-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold disabled:opacity-50 transition-all cursor-pointer shadow-sm active:scale-95"
                title={t.settings.findOnlineMirrors}
              >
                <Search className={`w-3.5 h-3.5 ${isFindingMirrors ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
                <span>{isFindingMirrors ? t.settings.findingOnlineMirrors : t.settings.findOnlineMirrors}</span>
              </button>
              <button
                onClick={() => handleVerifyMirror(settings.app.activeMirror)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
                title={t.settings.verifyBtn}
              >
                <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-emerald-400" />
                <span>{t.details.passVerification}</span>
              </button>
              <button
                onClick={() => checkMirrors()}
                disabled={isCheckingMirrors}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 disabled:opacity-50 transition-colors border border-white/10 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingMirrors ? 'animate-spin text-brand-red' : ''}`} />
                <span>{isCheckingMirrors ? t.settings.testing : t.settings.testPing}</span>
              </button>
            </div>
          </div>

          {/* Feedback banner for online search */}
          {findMirrorsStatus && (
            <div className="p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs flex items-center space-x-2 animate-fadeIn">
              <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>{findMirrorsStatus}</span>
            </div>
          )}

          {/* Mirrors List */}
          {(() => {
            const activeStatus = mirrorsStatus.find((m) => m.url === settings.app.activeMirror);
            const activeNeedsVerification = activeStatus?.isAvailable && activeStatus?.needsVerification;
            const allAvailableNeedVerification = mirrorsStatus.length > 0 &&
              mirrorsStatus.filter((m) => m.isAvailable).length > 0 &&
              mirrorsStatus.filter((m) => m.isAvailable).every((m) => m.needsVerification);
            const shouldShowBanner = activeNeedsVerification || allAvailableNeedVerification;

            return shouldShowBanner ? (
              <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="leading-snug">{t.settings.needsVerificationHint}</span>
                </div>
                <button
                  onClick={() => handleVerifyMirror(settings.app.activeMirror)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all flex-shrink-0 shadow-sm cursor-pointer active:scale-95"
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
                      ? 'bg-brand-red/10 border-brand-red text-white shadow-glow-sm'
                      : 'bg-white/5 border-white/5 hover:border-white/20 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate min-w-0 mr-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        status?.isAvailable
                          ? status.needsVerification
                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]'
                            : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                          : 'bg-red-500'
                      }`}
                    />
                    <span className="text-xs font-bold truncate font-mono">{mirror}</span>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {status && (
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {status.latencyMs < 9000
                          ? `${status.latencyMs}ms${status.needsVerification ? ' (' + (t.settings.protection || 'защита') + ')' : ''}`
                          : t.settings.error}
                      </span>
                    )}
                    {status?.needsVerification && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVerifyMirror(mirror);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[10px] font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                        title={t.details.passVerification}
                      >
                        {t.details.passVerification}
                      </button>
                    )}
                    {isActive && (
                      <span className="px-1.5 py-0.5 rounded-md bg-brand-red text-white text-[9px] font-black uppercase">
                        {t.settings.active}
                      </span>
                    )}
                    {settings.app.mirrors && settings.app.mirrors.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCustomMirror(mirror);
                        }}
                        className="p-1 rounded-lg hover:bg-red-500/20 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
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

          {/* Add custom mirror */}
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="text"
              value={customMirror}
              onChange={(e) => setCustomMirror(e.target.value)}
              placeholder={t.settings.addMirrorPlaceholder}
              className="flex-1 bg-dark-bg border border-white/10 rounded-2xl px-3.5 py-2 text-xs text-white outline-none focus:border-brand-red font-mono"
            />
            <button
              onClick={handleAddCustomMirror}
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white text-xs font-bold transition-all shadow-glow flex-shrink-0"
            >
              {t.settings.addMirrorBtn}
            </button>
          </div>
        </div>

        {/* Section: Video Player */}
        <div className="p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center pb-3 border-b border-white/5">
            <Tv className="w-4 h-4 text-brand-red mr-2" />
            {t.settings.player}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5">
              <div>
                <div className="text-xs font-bold text-white">{t.settings.autoplay}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">{t.settings.autoplayDesc}</div>
              </div>
              <input
                type="checkbox"
                checked={settings.player.autoPlay}
                onChange={(e) =>
                  updateSettings({ player: { ...settings.player, autoPlay: e.target.checked } })
                }
                className="w-4 h-4 accent-brand-red cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5">
              <div>
                <div className="text-xs font-bold text-white">{t.settings.autoNext}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">{t.settings.autoNextDesc}</div>
              </div>
              <input
                type="checkbox"
                checked={settings.player.autoPlayNextEpisode}
                onChange={(e) =>
                  updateSettings({
                    player: { ...settings.player, autoPlayNextEpisode: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-brand-red cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5 sm:col-span-2">
              <div>
                <div className="text-xs font-bold text-white">{t.settings.defaultQuality}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">{t.settings.defaultQualityDesc}</div>
              </div>
              <select
                value={settings.player.defaultQuality}
                onChange={(e) =>
                  updateSettings({ player: { ...settings.player, defaultQuality: e.target.value } })
                }
                className="bg-dark-bg border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer font-bold"
              >
                <option value="1080p">1080p</option>
                <option value="720p">720p</option>
                <option value="480p">480p</option>
                <option value="360p">360p</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section: Interface & Home Blocks */}
        <div className="p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card space-y-4">
          <h2 className="text-sm font-bold text-white pb-3 border-b border-white/5">
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
            ].map((sec) => (
              <button
                key={sec.id}
                onClick={() => handleToggleHomeSection(sec.id as any)}
                className={`p-3 rounded-2xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                  (settings.homeSections as any)[sec.id]
                    ? 'bg-brand-red/10 border-brand-red text-white'
                    : 'bg-white/5 border-white/5 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span className="truncate pr-1">{sec.label}</span>
                {(settings.homeSections as any)[sec.id] && (
                  <Check className="w-3.5 h-3.5 text-brand-red flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Section: Data Backup & Cache */}
        <div className="p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center pb-3 border-b border-white/5">
            <Database className="w-4 h-4 text-brand-red mr-2" />
            {t.settings.dataManagement}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={handleClearCache}
              className="flex items-center justify-center space-x-2 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-bold text-zinc-300 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-zinc-400" />
              <span>{cacheCleared ? t.settings.cacheCleared : t.settings.clearCache}</span>
            </button>

            <button
              onClick={handleExportBackup}
              className="flex items-center justify-center space-x-2 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-bold text-zinc-300 transition-colors"
            >
              <Download className="w-4 h-4 text-zinc-400" />
              <span>{t.settings.exportBackup}</span>
            </button>

            <label className="flex items-center justify-center space-x-2 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-bold text-zinc-300 transition-colors cursor-pointer">
              <Upload className="w-4 h-4 text-zinc-400" />
              <span>{t.settings.importBackup}</span>
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
          </div>

          {importStatus && (
            <div className="text-xs text-emerald-400 bg-emerald-950/40 p-3 rounded-2xl border border-emerald-500/20">
              {importStatus}
            </div>
          )}
        </div>

        {/* Section: About the App */}
        <div className="p-6 rounded-3xl bg-[#12131a] border border-white/5 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <img
              src={appLogo}
              alt="HDRezka Desktop"
              className="w-14 h-14 rounded-2xl object-cover border border-brand-red/40 shadow-glow flex-shrink-0"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base font-black tracking-wider text-white">HDREZKA Desktop</span>
                <span className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-brand-red to-orange-500 text-white text-[10px] font-black uppercase">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">{t.settings.aboutDesc}</p>
              <div className="text-[11px] text-zinc-500 mt-2 font-medium">
                {t.settings.license} • {t.settings.developers}
              </div>
            </div>
          </div>

          <a
            href="https://github.com/KDGOfficial/HDRezka-Desktop"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition-all shadow-sm flex-shrink-0 active:scale-95"
          >
            <span>GitHub Repository</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
