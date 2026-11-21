import React, { useEffect, useRef } from 'react';
import { Sparkles, Download, CheckCircle2, AlertCircle, X, ExternalLink, RefreshCw } from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';

export const UpdateModal: React.FC = () => {
  const { updateInfo, isUpdateModalOpen, setUpdateModalOpen, downloadUpdate, installUpdate, updateProgress } =
    useSettingsStore();
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const visible = Boolean(isUpdateModalOpen && updateInfo && updateInfo.hasUpdate);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (visible) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [visible]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
    };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, [visible]);

  if (!visible || !updateInfo) return null;

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
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as any)}
      aria-labelledby="update-modal-title"
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        setUpdateModalOpen(false);
      }}
      className="select-none"
    >
      <div className="relative w-full max-w-lg mx-auto rounded-3xl cinema-panel border border-brand-ember/40 shadow-elevated overflow-hidden animate-fadeIn">
        {/* Neon Ember Ambient Glow */}
        <div
          className="absolute -top-24 -left-24 w-52 h-52 rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #FF124F 0%, transparent 72%)' }}
        />
        <div
          className="absolute -bottom-24 -right-24 w-52 h-52 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #FF7A00 0%, transparent 72%)' }}
        />

        {/* Header */}
        <div className="p-6 border-b border-white/[0.08] flex items-start justify-between relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl play-squircle flex items-center justify-center text-white flex-shrink-0">
              <Sparkles className="w-6 h-6 text-[#FFE29A]" />
            </div>
            <div>
              <h2 id="update-modal-title" className="font-display text-lg font-black text-white flex items-center gap-2">
                <span>{t.updateModal.title}</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full btn-ember text-white font-extrabold uppercase tracking-wider">
                  v{updateInfo.latestVersion}
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t.updateModal.current}: <span className="text-zinc-200 font-mono">v{updateInfo.currentVersion}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setUpdateModalOpen(false)}
            aria-label={t.updateModal.later}
            className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto relative z-10 text-left">
          <p className="text-xs text-zinc-300 leading-relaxed">{t.updateModal.desc}</p>

          {updateInfo.releaseNotes && (
            <div className="rounded-2xl bg-[#0B070A]/85 border border-white/[0.07] p-4 text-xs space-y-1.5">
              <div className="font-display font-extrabold text-zinc-200 text-[11px] uppercase tracking-wider">
                {t.updateModal.notes}
              </div>
              <div className="text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto pr-2">
                {updateInfo.releaseNotes}
              </div>
            </div>
          )}

          {isDownloading && (
            <div className="p-4 rounded-2xl bg-[#0B070A]/90 border border-brand-ember/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-brand-orange animate-spin" />
                  <span>{t.updateModal.downloading}</span>
                </span>
                <span className="font-mono text-brand-orange font-bold">{updateProgress.percent}%</span>
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
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>{formatBytes(updateProgress.transferredBytes)}</span>
                <span>{formatBytes(updateProgress.totalBytes)}</span>
              </div>
            </div>
          )}

          {isInstalling && (
            <div className="p-4 rounded-2xl bg-[#0B070A]/95 border border-emerald-500/35 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span>{t.updateModal.installing}</span>
                </span>
                <span className="font-mono text-emerald-400 font-bold">100%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full w-full animate-pulse" />
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed text-center">{t.updateModal.installingDesc}</p>
            </div>
          )}

          {isReady && !isInstalling && (
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/35 flex items-center gap-3 text-xs text-emerald-300">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <span>Обновление успешно загружено и готово к установке.</span>
            </div>
          )}

          {isOpenedInBrowser && (
            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/35 flex items-center gap-3 text-xs text-amber-200">
              <ExternalLink className="w-5 h-5 flex-shrink-0 text-amber-400" />
              <span>
                {updateProgress?.error ||
                  'Страница релиза открыта в браузере. Вы можете скачать установочный файл напрямую с GitHub.'}
              </span>
            </div>
          )}

          {isError && (
            <div className="p-4 rounded-2xl bg-rose-950/35 border border-rose-500/35 flex items-center gap-3 text-xs text-rose-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
              <span>{updateProgress?.error || 'Ошибка загрузки обновления.'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 pt-3.5 border-t border-white/[0.08] flex items-center justify-between relative z-10 bg-black/30">
          {updateInfo.downloadUrl ? (
            <a
              href={updateInfo.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setUpdateModalOpen(false)}
              className="px-4 py-2 rounded-full text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              {t.updateModal.later}
            </button>

            {isInstalling ? (
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600/50 text-white font-bold text-xs">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-300" />
                <span>{t.updateModal.installing}</span>
              </div>
            ) : isReady ? (
              <button
                type="button"
                onClick={installUpdate}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-xs shadow-glow active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t.updateModal.installBtn}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={downloadUpdate}
                disabled={isDownloading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full btn-ember text-white font-extrabold text-xs active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
                <span>{isDownloading ? t.updateModal.downloading : t.updateModal.downloadBtn}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
};
