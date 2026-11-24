import { BROWSER_USER_AGENT } from '../../../shared/constants';
import { SubtitleFetchResult, SubtitleTrack } from '../../../shared/types';
import { matchSubtitleLanguageCode, srtToVtt } from '../../../shared/utils';

type FetchLike = typeof fetch;

const titleTranslationCache = new Map<string, string>();
const subtitleVttCache = new Map<string, SubtitleFetchResult>();

const LANG_DISPLAY_NAME: Record<'ru' | 'uk' | 'en', string> = {
  ru: 'Русский',
  uk: 'Українська',
  en: 'English',
};

const OPEN_SUB_LANG_CODES: Record<'ru' | 'uk' | 'en', string[]> = {
  ru: ['rus', 'ru'],
  uk: ['ukr', 'uk'],
  en: ['eng', 'en'],
};

function cacheSubtitleResult(key: string, value: SubtitleFetchResult): void {
  if (subtitleVttCache.size >= 40) {
    const oldest = subtitleVttCache.keys().next().value;
    if (oldest) subtitleVttCache.delete(oldest);
  }
  subtitleVttCache.set(key, value);
}

async function translateTextGtx(
  text: string,
  targetLang: 'ru' | 'uk' | 'en',
  fetchImpl: FetchLike = fetch
): Promise<string | null> {
  if (!text.trim()) return '';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    return data[0]
      .map((part: any) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
      .join('');
  } catch {
    return null;
  }
}

/** Translates a batch of movie titles to UK or EN with in-memory caching and chunking. */
export async function translateTitlesBatch(
  titles: string[],
  targetLang: 'uk' | 'en',
  fetchImpl: FetchLike = fetch
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const uncached: string[] = [];

  for (const raw of titles || []) {
    const clean = (raw || '').trim();
    if (!clean) continue;
    const key = `${targetLang}:${clean}`;
    const hit = titleTranslationCache.get(key);
    if (hit) {
      result[clean] = hit;
    } else if (!uncached.includes(clean)) {
      uncached.push(clean);
    }
  }

  // Process in safe chunks of up to 18 titles / ~900 chars
  let idx = 0;
  while (idx < uncached.length) {
    const chunk: string[] = [];
    let charLen = 0;
    while (idx < uncached.length && chunk.length < 18 && charLen + uncached[idx].length < 900) {
      chunk.push(uncached[idx]);
      charLen += uncached[idx].length + 2;
      idx++;
    }
    if (chunk.length === 0) {
      chunk.push(uncached[idx++]);
    }

    const joined = chunk.join('\n');
    const translatedJoined = await translateTextGtx(joined, targetLang, fetchImpl);
    const lines = translatedJoined ? translatedJoined.split('\n').map((l) => l.trim()) : [];

    if (lines.length === chunk.length) {
      for (let i = 0; i < chunk.length; i++) {
        const translated = lines[i] || chunk[i];
        titleTranslationCache.set(`${targetLang}:${chunk[i]}`, translated);
        result[chunk[i]] = translated;
      }
    } else {
      // Fallback: translate individually if line count drifted
      await Promise.all(
        chunk.map(async (item) => {
          const single = await translateTextGtx(item, targetLang, fetchImpl);
          const finalVal = (single || '').trim() || item;
          titleTranslationCache.set(`${targetLang}:${item}`, finalVal);
          result[item] = finalVal;
        })
      );
    }
  }

  return result;
}

/** Translates WebVTT cue text lines while preserving timestamps and cue settings. */
export async function translateVttCues(
  vtt: string,
  targetLang: 'ru' | 'uk' | 'en',
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const blocks = vtt.replace(/\r\n?/g, '\n').split(/\n\n+/);
  const cueIndices: number[] = [];
  const cueHeaders: string[] = [];
  const cueTexts: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block.includes('-->')) continue;
    const lines = block.split('\n');
    const arrowIdx = lines.findIndex((l) => l.includes('-->'));
    if (arrowIdx === -1 || arrowIdx >= lines.length - 1) continue;
    const header = lines.slice(0, arrowIdx + 1).join('\n');
    const text = lines
      .slice(arrowIdx + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    cueIndices.push(i);
    cueHeaders.push(header);
    cueTexts.push(text);
  }

  if (cueTexts.length === 0) return vtt;

  // Translate in parallel-limited batches of ~30 cues (up to 450 cues -> covers full episodes/movies cleanly)
  const translatedTexts = [...cueTexts];
  const BATCH_SIZE = 30;
  const chunks: Array<{ start: number; items: string[] }> = [];
  for (let start = 0; start < cueTexts.length; start += BATCH_SIZE) {
    chunks.push({ start, items: cueTexts.slice(start, start + BATCH_SIZE) });
  }

  // Run up to 4 concurrent batches for fast turnaround
  const CONCURRENCY = 4;
  for (let c = 0; c < chunks.length; c += CONCURRENCY) {
    const group = chunks.slice(c, c + CONCURRENCY);
    await Promise.all(
      group.map(async ({ start, items }) => {
        const joined = items.join('\n');
        const out = await translateTextGtx(joined, targetLang, fetchImpl);
        if (!out) return;
        const lines = out.split('\n').map((s) => s.trim());
        if (lines.length === items.length) {
          for (let j = 0; j < items.length; j++) {
            if (lines[j]) translatedTexts[start + j] = lines[j];
          }
        }
      })
    );
  }

  const outBlocks = [...blocks];
  for (let k = 0; k < cueIndices.length; k++) {
    outBlocks[cueIndices[k]] = `${cueHeaders[k]}\n${translatedTexts[k]}`;
  }
  return outBlocks.join('\n\n');
}

async function fetchSubtitleContent(url: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    if (!raw || raw.trim().startsWith('<!doctype') || raw.trim().startsWith('<html')) return null;
    const vtt = srtToVtt(raw);
    return vtt.includes('-->') ? vtt : null;
  } catch {
    return null;
  }
}

async function resolveImdbIdViaCinemeta(
  query: string,
  year: number | undefined,
  isSeries: boolean,
  fetchImpl: FetchLike = fetch
): Promise<string | null> {
  const cleanQ = (query || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
  if (!cleanQ) return null;
  const mediaType = isSeries ? 'series' : 'movie';
  try {
    const url = `https://v3-cinemeta.strem.io/catalog/${mediaType}/top/search=${encodeURIComponent(cleanQ)}.json`;
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const metas: any[] = Array.isArray(data?.metas) ? data.metas : [];
    if (metas.length === 0) return null;

    if (year) {
      const yearMatch = metas.find((m) => {
        const y = parseInt(String(m?.releaseInfo || m?.year || '').slice(0, 4), 10);
        return y && Math.abs(y - year) <= 1;
      });
      if (yearMatch?.imdb_id || yearMatch?.id) return String(yearMatch.imdb_id || yearMatch.id);
    }
    const first = metas[0];
    const id = String(first?.imdb_id || first?.id || '');
    return /^tt\d+$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function fetchOpenSubtitlesList(
  imdbId: string,
  season: number | undefined,
  episode: number | undefined,
  fetchImpl: FetchLike = fetch
): Promise<Array<{ lang: string; url: string }>> {
  const isSeries = Boolean(season && episode);
  const path = isSeries
    ? `series/${imdbId}:${season}:${episode}.json`
    : `movie/${imdbId}.json`;
  try {
    const res = await fetchImpl(`https://opensubtitles-v3.strem.io/subtitles/${path}`, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const subs: any[] = Array.isArray(data?.subtitles) ? data.subtitles : [];
    return subs
      .filter((s) => s && typeof s.url === 'string' && typeof s.lang === 'string')
      .map((s) => ({ lang: String(s.lang).toLowerCase(), url: String(s.url) }));
  } catch {
    return [];
  }
}

/**
 * Resolves a WebVTT subtitle track in RU, UK, or EN for ANY voiceover:
 * 1) Direct match from stream's existingSubtitles
 * 2) Direct match from Stremio OpenSubtitles v3 (via Cinemeta IMDb lookup)
 * 3) Auto-translation from any available existing or OpenSubtitles track into target language
 */
export async function fetchSubtitleTrack(
  params: {
    title?: string;
    origTitle?: string;
    year?: number;
    season?: number;
    episode?: number;
    lang: 'ru' | 'uk' | 'en';
    existingSubtitles?: SubtitleTrack[];
  },
  fetchImpl: FetchLike = fetch
): Promise<SubtitleFetchResult | null> {
  const { title, origTitle, year, season, episode, lang, existingSubtitles = [] } = params;
  const cacheKey = `${(origTitle || title || '').toLowerCase()}|${year || ''}|${season || 0}|${episode || 0}|${lang}`;
  const cached = subtitleVttCache.get(cacheKey);
  if (cached) return cached;

  const displayLang = LANG_DISPLAY_NAME[lang];

  // 1. Exact match from stream's embedded subtitles
  const directExisting = existingSubtitles.find((s) => matchSubtitleLanguageCode(s.language) === lang);
  if (directExisting?.url) {
    const vtt = await fetchSubtitleContent(directExisting.url, fetchImpl);
    if (vtt) {
      const result: SubtitleFetchResult = { vtt, language: displayLang, langCode: lang, source: 'stream' };
      cacheSubtitleResult(cacheKey, result);
      return result;
    }
  }

  // 2. Search OpenSubtitles v3 via Cinemeta IMDb ID
  const isSeries = Boolean(season && episode);
  let searchQuery = (origTitle || '').trim();
  if (!searchQuery && title) {
    // Translate Russian title to English for accurate Cinemeta IMDb lookup
    const tr = await translateTitlesBatch([title], 'en', fetchImpl);
    searchQuery = tr[title.trim()] || title.trim();
  }

  let openSubs: Array<{ lang: string; url: string }> = [];
  if (searchQuery) {
    const imdbId = await resolveImdbIdViaCinemeta(searchQuery, year, isSeries, fetchImpl);
    if (imdbId) {
      openSubs = await fetchOpenSubtitlesList(imdbId, season, episode, fetchImpl);
      const targetCodes = OPEN_SUB_LANG_CODES[lang];
      const directOs = openSubs.find((s) => targetCodes.includes(s.lang));
      if (directOs) {
        const vtt = await fetchSubtitleContent(directOs.url, fetchImpl);
        if (vtt) {
          const result: SubtitleFetchResult = { vtt, language: displayLang, langCode: lang, source: 'opensubtitles' };
          cacheSubtitleResult(cacheKey, result);
          return result;
        }
      }
    }
  }

  // 3. Auto-translate from any available subtitle track (stream or OpenSubtitles)
  const fallbackUrls: string[] = [];
  for (const s of existingSubtitles) {
    if (s.url) fallbackUrls.push(s.url);
  }
  for (const prefCode of ['eng', 'rus', 'ukr', 'en', 'ru', 'uk']) {
    const match = openSubs.find((s) => s.lang === prefCode);
    if (match?.url) fallbackUrls.push(match.url);
  }

  for (const url of fallbackUrls.slice(0, 3)) {
    const baseVtt = await fetchSubtitleContent(url, fetchImpl);
    if (baseVtt) {
      const translatedVtt = await translateVttCues(baseVtt, lang, fetchImpl);
      const result: SubtitleFetchResult = {
        vtt: translatedVtt,
        language: displayLang,
        langCode: lang,
        source: 'translated',
        translated: true,
      };
      cacheSubtitleResult(cacheKey, result);
      return result;
    }
  }

  return null;
}

export function clearLocalizationCaches(): void {
  titleTranslationCache.clear();
  subtitleVttCache.clear();
}
