import React, { useEffect, useRef } from 'react';
import { Globe, Activity, ShieldCheck, Layers, Sparkles, Check, X, ExternalLink, Send } from 'lucide-react';
import { useTranslation } from '../i18n';
import { APP_VERSION, TELEGRAM_CHANNEL_URL } from '../../shared/constants';
import appLogo from '../assets/logo.png';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPressRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const features = [
    {
      icon: <Globe className="w-4 h-4 text-brand-crimson" />,
      title: t.whatsNew.f1_title,
      desc: t.whatsNew.f1_desc,
    },
    {
      icon: <Activity className="w-4 h-4 text-brand-orange" />,
      title: t.whatsNew.f2_title,
      desc: t.whatsNew.f2_desc,
    },
    {
      icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
      title: t.whatsNew.f3_title,
      desc: t.whatsNew.f3_desc,
    },
    {
      icon: <Layers className="w-4 h-4 text-brand-gold" />,
      title: t.whatsNew.f4_title,
      desc: t.whatsNew.f4_desc,
    },
    {
      icon: <Sparkles className="w-4 h-4 text-sky-400" />,
      title: t.whatsNew.f5_title,
      desc: t.whatsNew.f5_desc,
    },
  ];

  const handleOpenTelegram = () => {
    if (window.api?.openExternalUrl) {
      window.api.openExternalUrl(TELEGRAM_CHANNEL_URL);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="whats-new-title"
      onMouseDown={(e) => {
        backdropPressRef.current = e.target === dialogRef.current;
      }}
      onClick={(e) => {
        if (backdropPressRef.current && e.target === dialogRef.current) {
          dialogRef.current?.close();
        }
        backdropPressRef.current = false;
      }}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
      className="select-none"
    >
      <div className="relative w-full max-w-lg mx-auto rounded-3xl cinema-panel border border-brand-ember/40 shadow-elevated overflow-hidden animate-fadeIn">
        {/* Ambient Neon Glow */}
        <div
          className="absolute -top-24 -right-24 w-52 h-52 rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #FF124F 0%, transparent 72%)' }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-52 h-52 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #FF7A00 0%, transparent 72%)' }}
        />

        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/[0.08] flex items-start justify-between relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="logo-ring rounded-full flex-shrink-0">
              <img src={appLogo} alt="" className="w-12 h-12 rounded-full object-cover block" />
            </div>
            <div>
              <h2 id="whats-new-title" className="font-display text-lg font-black text-white flex items-center gap-2">
                <span>{t.whatsNew.title}</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full btn-ember text-white font-extrabold uppercase tracking-wider">
                  v{APP_VERSION}
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t.whatsNew.badge} <span className="text-zinc-200 font-bold font-mono">v{APP_VERSION}</span> · Neon Ember Cinema
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.whatsNew.btn}
            className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Features List */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto relative z-10 text-left">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors"
            >
              <div className="p-2 rounded-xl bg-white/[0.06] border border-white/[0.08] flex-shrink-0 mt-0.5">
                {f.icon}
              </div>
              <div className="space-y-0.5 flex-1 min-w-0">
                <div className="text-xs font-extrabold text-white leading-snug">{f.title}</div>
                <div className="text-[11px] text-zinc-400 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-5 pt-3.5 border-t border-white/[0.08] flex items-center justify-between relative z-10 bg-black/30">
          <button
            type="button"
            onClick={handleOpenTelegram}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.1] text-zinc-400 hover:text-white border border-white/[0.08] text-xs font-semibold active:scale-95 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5 opacity-75" />
            <span>@HDRezkaPC</span>
            <ExternalLink className="w-3 h-3 opacity-50 ml-0.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="flex items-center gap-2 px-6 py-2.5 rounded-full btn-ember text-white font-extrabold text-xs active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{t.whatsNew.btn}</span>
          </button>
        </div>
      </div>
    </dialog>
  );
};
