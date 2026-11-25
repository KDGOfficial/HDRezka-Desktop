import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Check, X, Film, Tv, Smile, Flame, Wand2 } from 'lucide-react';
import { ContentType } from '../../shared/types';
import { GENRES } from '../../shared/constants';
import { normalizeInterestsProfile, SELECTABLE_TYPES } from '../../shared/recommendations';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';

const TYPE_ICONS: Record<ContentType, React.ComponentType<{ className?: string }>> = {
  films: Film,
  series: Tv,
  cartoons: Smile,
  animation: Sparkles,
  shows: Tv,
  erotica: Flame,
};

export const InterestsModal: React.FC = () => {
  const { settings, isInterestsModalOpen, setInterestsModalOpen, saveUserInterests } = useSettingsStore();
  const { t, translateGenre } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPressRef = useRef(false);

  const profile = normalizeInterestsProfile(settings.interests);
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(profile.favoriteTypes);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(profile.favoriteGenres);

  // Sync local draft whenever the modal opens
  useEffect(() => {
    if (isInterestsModalOpen) {
      const current = normalizeInterestsProfile(useSettingsStore.getState().settings.interests);
      setSelectedTypes(current.favoriteTypes);
      setSelectedGenres(current.favoriteGenres);
    }
  }, [isInterestsModalOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isInterestsModalOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isInterestsModalOpen]);

  if (!isInterestsModalOpen) return null;

  const selectableGenres = GENRES.filter((g) => g.id !== '');

  const toggleType = (type: ContentType) => {
    setSelectedTypes((prev) => (prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]));
  };

  const toggleGenre = (genreId: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genreId) ? prev.filter((item) => item !== genreId) : [...prev, genreId]
    );
  };

  const handleDismiss = async () => {
    if (!profile.onboardingCompleted) {
      await saveUserInterests(profile.favoriteGenres, profile.favoriteTypes, true);
    }
    setInterestsModalOpen(false);
  };

  const handleSave = async () => {
    await saveUserInterests(selectedGenres, selectedTypes, true);
    setInterestsModalOpen(false);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="interests-modal-title"
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
        handleDismiss();
      }}
      className="select-none !max-w-[min(94vw,40rem)]"
    >
      <div className="relative w-full mx-auto rounded-3xl cinema-panel border border-brand-ember/40 shadow-elevated overflow-hidden animate-fadeIn">
        {/* Ambient Neon Glow */}
        <div
          className="absolute -top-24 -right-20 w-56 h-56 rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #FF124F 0%, transparent 72%)' }}
        />
        <div
          className="absolute -bottom-24 -left-20 w-56 h-56 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #FF7A00 0%, transparent 72%)' }}
        />

        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/[0.08] flex items-start justify-between gap-4 relative z-10">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl play-squircle flex items-center justify-center flex-shrink-0">
              <Wand2 className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="interests-modal-title" className="font-display text-lg font-black text-white leading-tight">
                {t.interests.modalTitle}
              </h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                {t.interests.modalSubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t.interests.skipBtn}
            className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.12] text-zinc-400 hover:text-white cursor-pointer flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[64vh] overflow-y-auto relative z-10 text-left">
          {/* Categories */}
          <div>
            <div className="text-[11px] font-display font-extrabold uppercase tracking-[0.12em] text-zinc-400 mb-2.5">
              {t.interests.favoriteTypesLabel}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {SELECTABLE_TYPES.map((type) => {
                const Icon = TYPE_ICONS[type];
                const active = selectedTypes.includes(type);
                const label = t.catalog.categories[type];
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleType(type)}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl border text-xs font-extrabold cursor-pointer active:scale-95 ${
                      active
                        ? 'btn-ember border-transparent text-white'
                        : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-zinc-300 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Genres */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-display font-extrabold uppercase tracking-[0.12em] text-zinc-400">
                {t.interests.favoriteGenresLabel}
              </span>
              {selectedGenres.length > 0 && (
                <span className="text-[11px] font-bold text-brand-orange tabular-nums">
                  {t.interests.selectedCount.replace('{count}', String(selectedGenres.length))}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectableGenres.map((genre) => {
                const active = selectedGenres.includes(genre.id);
                return (
                  <button
                    key={genre.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleGenre(genre.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-bold cursor-pointer active:scale-95 ${
                      active
                        ? 'bg-brand-crimson/25 border-brand-ember text-white shadow-glow-sm'
                        : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.08] text-zinc-300 hover:text-white'
                    }`}
                  >
                    {active && <Check className="w-3 h-3 text-brand-orange" aria-hidden="true" />}
                    <span>{translateGenre(genre.id)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Adaptive learning note */}
          <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
            <Flame className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {t.interests.adaptiveNote}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-3.5 border-t border-white/[0.08] flex items-center justify-between gap-3 relative z-10 bg-black/30">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-4 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.08] text-xs font-bold text-zinc-300 hover:text-white cursor-pointer active:scale-95"
          >
            {t.interests.skipBtn}
          </button>

          <button
            type="button"
            onClick={handleSave}
            autoFocus
            className="flex items-center gap-2 px-6 py-2.5 rounded-full btn-ember text-white font-display font-extrabold text-xs uppercase tracking-wider active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>{t.interests.saveBtn}</span>
          </button>
        </div>
      </div>
    </dialog>
  );
};
