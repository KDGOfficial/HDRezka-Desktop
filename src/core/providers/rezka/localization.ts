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

async function fetchGtxOnce(
  text: string,
  targetLang: 'ru' | 'uk' | 'en',
  fetchImpl: FetchLike
): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t`;
    const body = new URLSearchParams({ q: text }).toString();
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': BROWSER_USER_AGENT,
      },
      body,
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const joined = data[0]
          .map((part: any) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
          .join('');
        if (joined) return joined;
      }
    }
  } catch {
    // fall through to secondary Google NMT endpoint
  }
  return null;
}

async function fetchClients5Once(
  text: string,
  targetLang: 'ru' | 'uk' | 'en',
  fetchImpl: FetchLike
): Promise<string | null> {
  const encoded = encodeURIComponent(text);
  // Keep GET URL safely below proxy/CDN URI limits (~2000 chars); split multi-line payloads if needed
  if (encoded.length > 1600) {
    const lines = text.split('\n');
    if (lines.length <= 1) return null;
    const mid = Math.ceil(lines.length / 2);
    const [left, right] = await Promise.all([
      fetchClients5Once(lines.slice(0, mid).join('\n'), targetLang, fetchImpl),
      fetchClients5Once(lines.slice(mid).join('\n'), targetLang, fetchImpl),
    ]);
    return left !== null && right !== null ? `${left}\n${right}` : null;
  }
  try {
    const fallbackUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${targetLang}&q=${encoded}`;
    const res = await fetchImpl(fallbackUrl, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data)) {
      const first = data[0];
      if (typeof first === 'string') return first;
      if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    }
    return null;
  } catch {
    return null;
  }
}

async function translateTextGtx(
  text: string,
  targetLang: 'ru' | 'uk' | 'en',
  fetchImpl: FetchLike = fetch
): Promise<string | null> {
  if (!text.trim()) return '';
  const primary = await fetchGtxOnce(text, targetLang, fetchImpl);
  if (primary !== null) return primary;
  return await fetchClients5Once(text, targetLang, fetchImpl);
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

async function translateVttCuesDetailed(
  vtt: string,
  targetLang: 'ru' | 'uk' | 'en',
  fetchImpl: FetchLike = fetch
): Promise<{ vtt: string; translatedCues: number; totalCues: number }> {
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

  if (cueTexts.length === 0) return { vtt, translatedCues: 0, totalCues: 0 };

  // POST on primary endpoint supports larger batches cleanly (~2x faster on full-length films)
  const translatedTexts = [...cueTexts];
  let translatedCues = 0;
  const MAX_CUES_PER_BATCH = 40;
  const MAX_RAW_CHARS = 2800;
  const chunks: Array<{ start: number; items: string[] }> = [];
  let idx = 0;
  while (idx < cueTexts.length) {
    const start = idx;
    const items: string[] = [];
    let rawLen = 0;
    while (idx < cueTexts.length && items.length < MAX_CUES_PER_BATCH) {
      const nextLen = cueTexts[idx].length + 1;
      if (items.length > 0 && rawLen + nextLen > MAX_RAW_CHARS) break;
      items.push(cueTexts[idx]);
      rawLen += nextLen;
      idx++;
    }
    chunks.push({ start, items });
  }

  // Recursively binary-split a line-count-drifted batch instead of dropping straight to N single-cue requests
  const translateChunk = async (start: number, items: string[]): Promise<void> => {
    const out = await translateTextGtx(items.join('\n'), targetLang, fetchImpl);
    if (out === null) return; // both primary & fallback endpoints failed; avoid hammering N single-cue retries
    const lines = out.split('\n').map((s) => s.trim());
    if (lines.length === items.length) {
      for (let j = 0; j < items.length; j++) {
        if (lines[j]) translatedTexts[start + j] = lines[j];
      }
      translatedCues += items.length;
      return;
    }
    if (items.length <= 1) {
      const cleaned = out.replace(/\s+/g, ' ').trim();
      if (cleaned) {
        translatedTexts[start] = cleaned;
        translatedCues += 1;
      }
      return;
    }
    const mid = Math.ceil(items.length / 2);
    await translateChunk(start, items.slice(0, mid));
    await translateChunk(start + mid, items.slice(mid));
  };

  // Run up to 4 concurrent batches for fast turnaround without triggering rate limits
  const CONCURRENCY = 4;
  for (let c = 0; c < chunks.length; c += CONCURRENCY) {
    const group = chunks.slice(c, c + CONCURRENCY);
    await Promise.all(group.map(({ start, items }) => translateChunk(start, items)));
  }

  const outBlocks = [...blocks];
  for (let k = 0; k < cueIndices.length; k++) {
    outBlocks[cueIndices[k]] = `${cueHeaders[k]}\n${translatedTexts[k]}`;
  }
  return { vtt: outBlocks.join('\n\n'), translatedCues, totalCues: cueTexts.length };
}

/** Translates WebVTT cue text lines while preserving timestamps and cue settings. */
export async function translateVttCues(
  vtt: string,
  targetLang: 'ru' | 'uk' | 'en',
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const { vtt: out } = await translateVttCuesDetailed(vtt, targetLang, fetchImpl);
  return out;
}

export async function fetchSubtitleContent(url: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  const resolvedUrl = url?.startsWith('//') ? `https:${url}` : url;
  if (!resolvedUrl || !/^https?:\/\//i.test(resolvedUrl)) return null;
  try {
    const headers: Record<string, string> = { 'User-Agent': BROWSER_USER_AGENT };
    try {
      headers.Referer = `${new URL(resolvedUrl).origin}/`;
    } catch {}
    const res = await fetchImpl(resolvedUrl, {
      headers,
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    let raw: string;
    if (typeof (res as any).arrayBuffer === 'function') {
      const buf = new Uint8Array(await res.arrayBuffer());
      raw = new TextDecoder('utf-8').decode(buf);
      if (raw.includes('\uFFFD')) {
        try {
          raw = new TextDecoder('windows-1251').decode(buf);
        } catch {}
      }
    } else {
      raw = await res.text();
    }
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) return null;
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
 * Collects subtitle tracks from OTHER voiceovers of the same mirror source.
 * Subtitles are per-episode, not per-dub, so a track from any voiceover fits the current video.
 * Voiceovers named "субтитры"/"оригинал"/"eng" are tried first; stops early if earlyStop matches.
 */
export async function collectVoiceoverSubtitles(
  translators: Array<{ id: number; name?: string }>,
  currentTranslatorId: number | undefined,
  loadSubtitles: (translatorId: number) => Promise<SubtitleTrack[] | undefined>,
  opts: { limit?: number; timeoutMs?: number; concurrency?: number; earlyStop?: (track: SubtitleTrack) => boolean } = {}
): Promise<SubtitleTrack[]> {
  const { limit = 15, timeoutMs = 12000, concurrency = 4, earlyStop } = opts;
  const score = (name = '') => (/субтит|subtit|суб\.|оригинал|original|англ|\beng\b|\bsub\b/i.test(name) ? 0 : 1);
  const candidates = translators
    .filter((t) => t && typeof t.id === 'number' && t.id !== currentTranslatorId)
    .sort((a, b) => score(a.name) - score(b.name))
    .slice(0, limit);
  if (candidates.length === 0) return [];

  const collected: SubtitleTrack[] = [];
  const seen = new Set<string>();
  let nextIdx = 0;
  let stopped = false;

  const worker = async () => {
    while (!stopped && nextIdx < candidates.length) {
      const t = candidates[nextIdx++];
      try {
        let hitEarlyStop = false;
        for (const s of (await loadSubtitles(t.id)) || []) {
          if (s?.url && !seen.has(s.url)) {
            seen.add(s.url);
            collected.push(s);
            if (earlyStop?.(s)) hitEarlyStop = true;
          }
        }
        // Keep all sibling tracks from this voiceover before stopping, in case the matched URL fails to download
        if (hitEarlyStop) {
          stopped = true;
          return;
        }
      } catch {
        // a voiceover failing to load must not break the subtitle search
      }
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker());
  await Promise.race([
    Promise.all(workers),
    new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        stopped = true;
        resolve();
      }, timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
  return [...collected];
}

function buildCinemetaQueries(origTitle?: string): string[] {
  const raw = (origTitle || '').trim();
  if (!raw) return [];
  const isCleanLatin = (s: string) => /[A-Za-z]{2,}/.test(s) && !/[а-яёіїєґ]/i.test(s);
  const queries: string[] = [];
  if (raw.includes('/')) {
    const parts = raw
      .split('/')
      .map((p) => p.trim())
      .filter(isCleanLatin);
    // Prefer ASCII-only English segment first (e.g. "L'odyssée / The Odyssey" -> "The Odyssey")
    parts.sort((a, b) => (/^[ -~]+$/.test(a) ? 0 : 1) - (/^[ -~]+$/.test(b) ? 0 : 1));
    queries.push(...parts);
  }
  if (isCleanLatin(raw) && !queries.includes(raw)) {
    queries.push(raw);
  }
  return queries;
}

/**
 * Resolves a WebVTT subtitle track in RU, UK, or EN for ANY voiceover:
 * 1) Direct match from stream's existingSubtitles (or explicit directUrl for non-RU/UK/EN tracks)
 * 2) Direct match from other voiceovers of the same mirror source (loadVoiceoverSubtitles)
 * 3) Direct match from Stremio OpenSubtitles v3 (via Cinemeta IMDb lookup)
 * 4) Auto-translation from any available mirror or OpenSubtitles track into target language
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
    directUrl?: string;
    directLanguage?: string;
  },
  fetchImpl: FetchLike = fetch,
  loadVoiceoverSubtitles?: () => Promise<SubtitleTrack[]>
): Promise<SubtitleFetchResult | null> {
  const { title, origTitle, year, season, episode, lang, directUrl, directLanguage } = params;
  if (directUrl) {
    const vtt = await fetchSubtitleContent(directUrl, fetchImpl);
    if (!vtt) return null;
    return {
      vtt,
      language: directLanguage || LANG_DISPLAY_NAME[lang],
      langCode: matchSubtitleLanguageCode(directLanguage) || lang,
      source: 'stream',
    };
  }

  let existingSubtitles = params.existingSubtitles || [];
  const cacheKey = `${(origTitle || title || '').toLowerCase()}|${year || ''}|${season || 0}|${episode || 0}|${lang}`;
  const cached = subtitleVttCache.get(cacheKey);
  if (cached) return cached;

  const displayLang = LANG_DISPLAY_NAME[lang];

  const tryDirect = async (tracks: SubtitleTrack[]): Promise<SubtitleFetchResult | null> => {
    for (const s of tracks.filter((t) => matchSubtitleLanguageCode(t.language) === lang)) {
      const vtt = await fetchSubtitleContent(s.url, fetchImpl);
      if (vtt) {
        const result: SubtitleFetchResult = { vtt, language: displayLang, langCode: lang, source: 'stream' };
        cacheSubtitleResult(cacheKey, result);
        return result;
      }
    }
    return null;
  };

  // 1. Exact match from stream's embedded subtitles
  const fromStream = await tryDirect(existingSubtitles);
  if (fromStream) return fromStream;

  // 2. Exact match from any other voiceover of the same mirror source
  if (loadVoiceoverSubtitles) {
    const known = new Set(existingSubtitles.map((s) => s.url));
    const extra = (await loadVoiceoverSubtitles().catch(() => [] as SubtitleTrack[])).filter(
      (s) => s?.url && !known.has(s.url)
    );
    const fromVoiceovers = await tryDirect(extra);
    if (fromVoiceovers) return fromVoiceovers;
    existingSubtitles = [...existingSubtitles, ...extra];
  }

  // 3. Search OpenSubtitles v3 via Cinemeta IMDb ID
  const isSeries = Boolean(season && episode);
  const queries = buildCinemetaQueries(origTitle);
  let translatedTitleTried = false;
  const addTranslatedTitleQuery = async () => {
    if (translatedTitleTried || !title?.trim()) return;
    translatedTitleTried = true;
    const cleanTitle = title.trim();
    const tr = await translateTitlesBatch([cleanTitle], 'en', fetchImpl);
    const enTitle = (tr[cleanTitle] || '').trim();
    if (enTitle && !queries.includes(enTitle)) queries.push(enTitle);
    if (!queries.includes(cleanTitle)) queries.push(cleanTitle);
  };
  // Mirrors often copy Cyrillic Russian title into origTitle or put a bare year there — translate it to English first
  if (queries.length === 0) {
    await addTranslatedTitleQuery();
  }

  let openSubs: Array<{ lang: string; url: string }> = [];
  const targetCodes = OPEN_SUB_LANG_CODES[lang];
  let imdbId: string | null = null;
  let matchedQuery = queries[0] || '';

  for (let qi = 0; qi < queries.length && !imdbId; qi++) {
    matchedQuery = queries[qi];
    imdbId = await resolveImdbIdViaCinemeta(matchedQuery, year, isSeries, fetchImpl);
  }
  if (!imdbId && !translatedTitleTried && title?.trim()) {
    const prevLen = queries.length;
    await addTranslatedTitleQuery();
    for (let qi = prevLen; qi < queries.length && !imdbId; qi++) {
      matchedQuery = queries[qi];
      imdbId = await resolveImdbIdViaCinemeta(matchedQuery, year, isSeries, fetchImpl);
    }
  }

  if (imdbId) {
    openSubs = await fetchOpenSubtitlesList(imdbId, season, episode, fetchImpl);
  }

  // 1-part miniseries/movies (e.g. The Odyssey 1997) are often indexed as S01E01 on mirrors but have full tracks under movie/<imdbId>
  if (isSeries && season === 1 && episode === 1 && !openSubs.some((s) => targetCodes.includes(s.lang))) {
    const mergeUnique = (extraSubs: Array<{ lang: string; url: string }>) => {
      const seenUrls = new Set(openSubs.map((s) => s.url));
      for (const s of extraSubs) {
        if (s.url && !seenUrls.has(s.url)) {
          seenUrls.add(s.url);
          openSubs.push(s);
        }
      }
    };
    if (imdbId) {
      mergeUnique(await fetchOpenSubtitlesList(imdbId, undefined, undefined, fetchImpl));
    }
    if (openSubs.length === 0 && matchedQuery) {
      const movieImdbId = await resolveImdbIdViaCinemeta(matchedQuery, year, false, fetchImpl);
      if (movieImdbId && movieImdbId !== imdbId) {
        mergeUnique(await fetchOpenSubtitlesList(movieImdbId, undefined, undefined, fetchImpl));
      }
    }
  }

  if (openSubs.length > 0) {
    for (const directOs of openSubs.filter((s) => targetCodes.includes(s.lang)).slice(0, 2)) {
      const vtt = await fetchSubtitleContent(directOs.url, fetchImpl);
      if (vtt) {
        const result: SubtitleFetchResult = { vtt, language: displayLang, langCode: lang, source: 'opensubtitles' };
        cacheSubtitleResult(cacheKey, result);
        return result;
      }
    }
  }

  // 4. Auto-translate from any available subtitle track (mirror voiceovers or OpenSubtitles, any language)
  const fallbackUrls: string[] = [];
  for (const s of existingSubtitles) {
    if (s.url) fallbackUrls.push(s.url);
  }
  for (const prefCode of ['eng', 'rus', 'ukr', 'en', 'ru', 'uk']) {
    const match = openSubs.find((s) => s.lang === prefCode);
    if (match?.url) fallbackUrls.push(match.url);
  }
  const anyOs = openSubs.find((s) => s.url && !fallbackUrls.includes(s.url));
  if (anyOs) fallbackUrls.push(anyOs.url);

  for (const url of Array.from(new Set(fallbackUrls)).slice(0, 6)) {
    const baseVtt = await fetchSubtitleContent(url, fetchImpl);
    if (baseVtt) {
      const translated = await translateVttCuesDetailed(baseVtt, lang, fetchImpl);
      if (translated.totalCues > 0 && translated.translatedCues === 0) {
        // Every translator endpoint failed; do not cache or label untranslated text as translated
        return null;
      }
      const result: SubtitleFetchResult = {
        vtt: translated.vtt,
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
