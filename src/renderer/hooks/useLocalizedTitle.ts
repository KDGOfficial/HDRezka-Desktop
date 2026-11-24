import { useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { resolveImmediateLocalizedTitle } from '../../shared/utils';

type TargetLang = 'uk' | 'en';

const titleCache = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();
const pendingByLang: Record<TargetLang, Set<string>> = { uk: new Set(), en: new Set() };
const timersByLang: Record<TargetLang, ReturnType<typeof setTimeout> | null> = { uk: null, en: null };

function flushTranslations(lang: TargetLang) {
  timersByLang[lang] = null;
  const batch = Array.from(pendingByLang[lang]);
  pendingByLang[lang].clear();
  if (batch.length === 0 || !window.api?.translateTitles) return;

  window.api
    .translateTitles(batch, lang)
    .then((translated) => {
      if (!translated || typeof translated !== 'object') return;
      for (const [orig, val] of Object.entries(translated)) {
        if (!val) continue;
        const key = `${lang}:${orig}`;
        titleCache.set(key, val);
        const subs = listeners.get(key);
        if (subs) {
          subs.forEach((cb) => cb());
        }
      }
    })
    .catch(() => {});
}

function enqueueTranslation(lang: TargetLang, title: string) {
  const key = `${lang}:${title}`;
  if (titleCache.has(key)) return;
  pendingByLang[lang].add(title);
  if (!timersByLang[lang]) {
    timersByLang[lang] = setTimeout(() => flushTranslations(lang), 45);
  }
}

/**
 * Returns the localized movie/series title for the currently active app language (RU / UK / EN).
 * - RU: returns title immediately.
 * - EN: returns origTitle immediately if Latin, otherwise batch-translates via IPC.
 * - UK: returns cached/Ukrainian title or batch-translates via IPC.
 */
export function useLocalizedTitle(title?: string, origTitle?: string): string {
  const language = useSettingsStore((s) => s.settings.language || 'ru');
  const cleanTitle = (title || '').trim();
  const immediate = resolveImmediateLocalizedTitle(cleanTitle, origTitle, language);
  const cacheKey = language !== 'ru' && cleanTitle ? `${language}:${cleanTitle}` : '';

  const [, setTick] = useState(0);

  useEffect(() => {
    if (immediate !== null || !cacheKey || language === 'ru') return;
    if (titleCache.has(cacheKey)) return;

    let set = listeners.get(cacheKey);
    if (!set) {
      set = new Set();
      listeners.set(cacheKey, set);
    }
    const notify = () => setTick((n) => n + 1);
    set.add(notify);
    enqueueTranslation(language, cleanTitle);

    return () => {
      set?.delete(notify);
      if (set && set.size === 0) {
        listeners.delete(cacheKey);
      }
    };
  }, [immediate, cacheKey, language, cleanTitle]);

  if (immediate !== null) return immediate;
  return (cacheKey && titleCache.get(cacheKey)) || cleanTitle;
}
