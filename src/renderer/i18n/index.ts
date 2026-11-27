import { useSettingsStore } from '../stores/useSettingsStore';
import { translations, Locale, GENRE_TRANSLATIONS } from './translations';

export { translations, GENRE_TRANSLATIONS };
export type { Locale };

export function getTranslation() {
  const language = (useSettingsStore.getState().settings.language || 'ru') as Locale;
  return translations[language] || translations.ru;
}

export function useTranslation() {
  const language = useSettingsStore((s) => s.settings.language || 'ru') as Locale;
  const t = translations[language] || translations.ru;
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const setLanguage = (lang: Locale) => {
    updateSettings({ language: lang });
  };

  const translateGenre = (genreId: string) => {
    return GENRE_TRANSLATIONS[genreId]?.[language] || genreId;
  };

  return {
    t,
    language,
    setLanguage,
    translateGenre,
  };
}
