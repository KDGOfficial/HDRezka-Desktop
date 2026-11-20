import React from 'react';
import { Sparkles, Download, CheckCircle2, AlertCircle, X, ExternalLink, RefreshCw } from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';

export const UpdateModal: React.FC = () => {
  const { updateInfo, isUpdateModalOpen, setUpdateModalOpen, downloadUpdate, installUpdate, updateProgress } =
    useSettingsStore();
  const { t } = useTranslation();

  if (!isUpdateModalOpen || !updateInfo || !updateInfo.hasUpdate) {
    return null;
  }

  const isInstalling = updateProgress?.status === 'installing';
  const isReady =
    !isInstalling &&
    (updateProgress?.status === 'ready' ||
      (updateProgress?.status === 'downloading' &&
        (updateProgress.percent >= 100 ||
          (updateProgress.transferredBytes > 0 && updateProgress.transferredBytes >= updateProgress.totalBytes))));
  const isDownloading = updateProgress?.status === 'downloading' && !isReady;
  const isError = updateProgress?.status === 'error';
  const isOpenedInBrowser = updateProgress?.status === 'opened_in_browser';

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#12131a] border border-brand-red/30 shadow-[0_20px_60px_rgba(229,9,20,0.25)] overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-brand-red/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-orange-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-start justify-between relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-red to-orange-500 flex items-center justify-center text-white shadow-glow flex-shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>{t.updateModal.title}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-red text-white font-extrabold uppercase tracking-wider">
                  v{updateInfo.latestVersion}
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t.updateModal.current}: <span className="text-zinc-300 font-mono">v{updateInfo.currentVersion}</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => setUpdateModalOpen(false)}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto relative z-10 text-left">
          <p className="text-xs text-zinc-300 leading-relaxed">{t.updateModal.desc}</p>

          {/* Release Notes */}
          {updateInfo.releaseNotes && (
            <div className="rounded-2xl bg-dark-bg/80 border border-white/5 p-4 text-xs space-y-1.5">
              <div className="font-semibold text-zinc-300 text-[11px] uppercase tracking-wider">
                {t.updateModal.notes}
              </div>
              <div className="text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto font-sans pr-2">
                {updateInfo.releaseNotes}
              </div>
            </div>
          )}

          {/* Progress / Status Block */}
          {isDownloading && (
            <div className="p-4 rounded-2xl bg-dark-bg/90 border border-brand-red/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center space-x-2">
                  <RefreshCw className="w-3.5 h-3.5 text-brand-red animate-spin" />
                  <span>{t.updateModal.downloading}</span>
                </span>
                <span className="font-mono text-zinc-300 font-bold">{updateProgress.percent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-red to-orange-500 rounded-full transition-all duration-200"
                  style={{ width: `${updateProgress.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>{formatBytes(updateProgress.transferredBytes)}</span>
                <span>{formatBytes(updateProgress.totalBytes)}</span>
              </div>
            </div>
          )}

          {isInstalling && (
            <div className="p-4 rounded-2xl bg-dark-bg/95 border border-emerald-500/30 space-y-3 animate-fade-in shadow-glow-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span>{t.updateModal.installing}</span>
                </span>
                <span className="font-mono text-emerald-400 font-bold">100%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full w-full animate-pulse" />
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                {t.updateModal.installingDesc}
              </p>
            </div>
          )}

          {isReady && !isInstalling && (
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center space-x-3 text-xs text-emerald-400">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <span>Обновление успешно загружено и готово к установке.</span>
            </div>
          )}

          {isOpenedInBrowser && (
            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-center space-x-3 text-xs text-amber-300">
              <ExternalLink className="w-5 h-5 flex-shrink-0 text-amber-400" />
              <span>
                {updateProgress?.error ||
                  'Страница релиза открыта в браузере. Вы можете скачать установочный файл напрямую с GitHub.'}
              </span>
            </div>
          )}

          {isError && (
            <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 flex items-center space-x-3 text-xs text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
              <span>{updateProgress?.error || 'Ошибка загрузки обновления.'}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-3 border-t border-white/10 flex items-center justify-between relative z-10 bg-dark-bg/40">
          {updateInfo.downloadUrl ? (
            <a
              href={updateInfo.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <div />
          )}

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setUpdateModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
            >
              {t.updateModal.later}
            </button>

            {isInstalling ? (
              <div className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600/50 text-white font-bold text-xs">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-300" />
                <span>{t.updateModal.installing}</span>
              </div>
            ) : isReady ? (
              <button
                onClick={installUpdate}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs shadow-glow transition-all active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t.updateModal.installBtn}</span>
              </button>
            ) : (
              <button
                onClick={downloadUpdate}
                disabled={isDownloading}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white font-bold text-xs shadow-glow transition-all active:scale-95 disabled:opacity-50"
              >
                <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
                <span>{isDownloading ? t.updateModal.downloading : t.updateModal.downloadBtn}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
