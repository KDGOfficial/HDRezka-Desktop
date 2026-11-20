import React from 'react';
import { ShieldCheck, Film, KeyRound, Sparkles, AlertCircle, Check, X, ExternalLink, Database, Send } from 'lucide-react';
import { useTranslation } from '../i18n';
import { APP_VERSION, TELEGRAM_CHANNEL_URL } from '../../shared/constants';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const features = [
    {
      icon: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
      title: t.whatsNew.f1_title,
      desc: t.whatsNew.f1_desc,
    },
    {
      icon: <Film className="w-4 h-4 text-cyan-400" />,
      title: t.whatsNew.f2_title,
      desc: t.whatsNew.f2_desc,
    },
    {
      icon: <KeyRound className="w-4 h-4 text-amber-400" />,
      title: t.whatsNew.f3_title,
      desc: t.whatsNew.f3_desc,
    },
    {
      icon: <Sparkles className="w-4 h-4 text-purple-400" />,
      title: t.whatsNew.f4_title,
      desc: t.whatsNew.f4_desc,
    },
    {
      icon: <AlertCircle className="w-4 h-4 text-brand-red" />,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#12131a] border border-brand-red/30 shadow-[0_24px_70px_rgba(229,9,20,0.3)] overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-red/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-orange-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/10 flex items-start justify-between relative z-10">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-red to-orange-500 flex items-center justify-center text-white shadow-glow flex-shrink-0">
              <Database className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>{t.whatsNew.title}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-red text-white font-extrabold uppercase tracking-wider">
                  v{APP_VERSION}
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {t.whatsNew.subtitle} <span className="text-zinc-200 font-bold font-mono">v{APP_VERSION}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Features List */}
        <div className="p-6 space-y-3.5 max-h-[60vh] overflow-y-auto relative z-10 text-left">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex items-start space-x-3 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors"
            >
              <div className="p-2 rounded-xl bg-white/5 flex-shrink-0 mt-0.5">
                {f.icon}
              </div>
              <div className="space-y-0.5 flex-1 min-w-0">
                <div className="text-xs font-bold text-white leading-snug">{f.title}</div>
                <div className="text-[11px] text-zinc-400 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-5 pt-3 border-t border-white/10 flex items-center justify-between relative z-10 bg-dark-bg/50">
          <button
            onClick={handleOpenTelegram}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#229ED9] border border-[#229ED9]/30 text-xs font-bold transition-all active:scale-95 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>@HDRezkaPC</span>
            <ExternalLink className="w-3 h-3 opacity-60 ml-0.5" />
          </button>

          <button
            onClick={onClose}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-red to-orange-600 hover:from-brand-redHover hover:to-orange-500 text-white font-bold text-xs shadow-glow transition-all active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{t.whatsNew.btn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
