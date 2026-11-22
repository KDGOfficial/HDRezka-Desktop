

import * as cheerio from 'cheerio';
import { IProvider } from '../types';
import {
  MediaItem,
  MediaDetails,
  CatalogFilter,
  SearchResult,
  StreamData,
  Season,
  MirrorStatus,
  ContentType,
  Translator,
  VideoQualityStream,
  SubtitleTrack,
  MediaReview,
} from '../../../shared/types';
import { DEFAULT_MIRRORS, OPEN_MIRROR_SEEDS, HDREZKA_MIRRORS, isBadMirrorUrl, isCamRipText, BROWSER_USER_AGENT } from '../../../shared/constants';
import { parseStreamData } from './decoder';
import {
  FALLBACK_HERO,
  FALLBACK_ITEMS,
  FALLBACK_HOME_SECTIONS,
  getFallbackDetails,
} from './fallbackData';

export async function clearStaleAnubisCookies(targetUrlOrHost?: string): Promise<void> {
  let electron: any;
  try { electron = require('electron'); } catch (_) {}
  if (!electron?.session?.defaultSession?.cookies) return;

  let targetHost = '';
  if (targetUrlOrHost) {
    try {
      targetHost = targetUrlOrHost.startsWith('http')
        ? new URL(targetUrlOrHost).hostname.toLowerCase()
        : targetUrlOrHost.replace(/^www\./, '').toLowerCase();
    } catch (_) {
      targetHost = targetUrlOrHost.toLowerCase();
    }
  }

  try {
    const allCookies = await electron.session.defaultSession.cookies.get({}).catch(() => []);
    for (const c of allCookies) {
      const name = c.name.toLowerCase();
      if (
        name.includes('anubis') ||
        name.includes('techaro') ||
        name.includes('cookie-verification') ||
        name.includes('cf_clearance') ||
        name.includes('_vc_id') ||
        name.includes('challenge')
      ) {
        const domain = (c.domain?.startsWith('.') ? c.domain.slice(1) : (c.domain || 'rezka.ag')).toLowerCase();
        if (
          targetHost &&
          domain !== targetHost &&
          !targetHost.endsWith('.' + domain) &&
          !domain.endsWith('.' + targetHost)
        ) {
          continue;
        }
        for (const u of [`https://${domain}${c.path || '/'}`, `http://${domain}${c.path || '/'}`]) {
          await electron.session.defaultSession.cookies.remove(u, c.name).catch(() => {});
        }
      }
    }
  } catch (_) {}
}

async function appFetch(input: string | URL | Request, init?: RequestInit & { skipCookies?: boolean }): Promise<Response> {
  const urlStr = typeof input === 'string' ? input : (input as any).url || input.toString();
  let electron: any;
  try {
    electron = require('electron');
  } catch (_) {}

  const makeReq = async (forceSkipCookies = false) => {
    if (electron && electron.net && typeof electron.net.fetch === 'function') {
      const headers = new Headers(init?.headers || {});
      if (!headers.has('User-Agent')) {
        headers.set('User-Agent', BROWSER_USER_AGENT);
      }

      const credentialsMode = (init?.skipCookies || forceSkipCookies) ? 'omit' : 'include';
      return await electron.net.fetch(input as any, { ...init, headers, credentials: credentialsMode });
    }
    return await globalThis.fetch(input, init);
  };

  const res = await makeReq();

  // If server returns HTTP 500 (stale / poisoned auth cookie crash), immediately purge host cookies and retry clean
  if (res.status === 500 && !init?.skipCookies) {
    await clearStaleAnubisCookies(urlStr);
    try {
      const cleanRes = await makeReq(true);
      if (cleanRes.ok || cleanRes.status === 403) {
        return cleanRes;
      }
    } catch (_) {}
  }

  return res;
}

export function getQualityScore(quality?: string): number {
  if (!quality) return 0;
  const q = quality.trim().toLowerCase();
  if (q.includes('2160') || q.includes('4k') || q.includes('uhd')) return 2160;
  if (q.includes('1440') || q.includes('2k')) return 1440;
  if (q.includes('1080') && q.includes('ultra')) return 1085;
  if (q.includes('1080') || q.includes('fullhd') || q.includes('fhd')) return 1080;
  if (q.includes('720')) return 720;
  if (q.includes('480')) return 480;
  if (q.includes('360')) return 360;
  const num = parseInt(q.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(num) ? num : 0;
}

export function getMaxQualityScore(streams?: VideoQualityStream[]): number {
  if (!Array.isArray(streams) || streams.length === 0) return 0;
  let best = 0;
  for (const s of streams) {
    if (isCamRipText(s.quality)) continue;
    const score = getQualityScore(s.quality);
    if (score > best) best = score;
  }
  return best;
}

export function getMaxQualityLabel(streams?: VideoQualityStream[]): string {
  if (!Array.isArray(streams) || streams.length === 0) return '';
  let bestStream = streams[0];
  let bestScore = getQualityScore(bestStream.quality);
  for (const s of streams) {
    const score = getQualityScore(s.quality);
    if (score > bestScore) {
      bestScore = score;
      bestStream = s;
    }
  }
  return bestStream.quality;
}

export function classifyResolutionLabel(width: number, height: number): string {
  if (width >= 3800 || height >= 2000) return '2160p';
  if (width >= 2500 || height >= 1350) return '1440p';
  if (width >= 1800 || height >= 1000) return '1080p';
  if (width >= 1200 || height >= 680) return '720p';
  if (width >= 800 || height >= 450) return '480p';
  if (width >= 500 || height >= 300) return '360p';
  return height > 0 ? `${height}p` : 'HD';
}

export function parseHlsMasterVariants(playlistText: string, masterUrl: string): VideoQualityStream[] {
  if (!playlistText || !playlistText.includes('#EXT-X-STREAM-INF')) return [];
  // When master playlist declares external #EXT-X-MEDIA:TYPE=AUDIO with URI=, keep masterUrl so hls.js preserves audio tracks
  const hasExternalAudio = /#EXT-X-MEDIA:[^\r\n]*TYPE=AUDIO[^\r\n]*URI=/i.test(playlistText);
  const lines = playlistText.split(/\r?\n/);
  const byLabel = new Map<string, { label: string; score: number; bandwidth: number; url: string }>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

    // Find next non-empty, non-comment URI line
    let nextUri = '';
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (!candidate) continue;
      if (candidate.startsWith('#')) continue;
      nextUri = candidate;
      break;
    }
    if (!nextUri) continue;

    let absUrl = nextUri;
    try {
      absUrl = nextUri.startsWith('http') ? nextUri : new URL(nextUri, masterUrl).toString();
    } catch {
      continue;
    }

    const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bwMatch = line.match(/(?:AVERAGE-)?BANDWIDTH=(\d+)/i);
    const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;

    let label = '';
    if (resMatch) {
      const width = parseInt(resMatch[1], 10);
      const height = parseInt(resMatch[2], 10);
      if (height < 240 && width < 400) continue;
      label = classifyResolutionLabel(width, height);
    } else if (bandwidth > 0) {
      if (bandwidth >= 6_000_000) label = '2160p';
      else if (bandwidth >= 2_800_000) label = '1080p';
      else if (bandwidth >= 1_200_000) label = '720p';
      else if (bandwidth >= 600_000) label = '480p';
      else label = '360p';
    }
    if (!label) continue;

    const score = getQualityScore(label);
    const existing = byLabel.get(label);
    // Keep the highest-bitrate variant per resolution so 1080p is never a pixelated low-bitrate track
    if (!existing || bandwidth > existing.bandwidth) {
      byLabel.set(label, { label, score, bandwidth, url: hasExternalAudio ? masterUrl : absUrl });
    }
  }

  return Array.from(byLabel.values())
    .sort((a, b) => b.score - a.score || b.bandwidth - a.bandwidth)
    .map((v) => ({ quality: v.label, hls: v.url, mp4: v.url }));
}

export function matchTranslatorByName<T extends { id: number; name: string }>(
  translators: T[] | undefined,
  targetName?: string
): T | undefined {
  if (!targetName || !translators || translators.length === 0) return undefined;
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s*\((?:kinogo|kinobase|hdrezka|озвучка)[^)]*\)/gi, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const target = normalize(targetName);
  if (target.length < 2) return undefined;

  const exact = translators.find((t) => normalize(t.name) === target);
  if (exact) return exact;

  const contains = translators.find((t) => {
    const n = normalize(t.name);
    return n.length >= 3 && (n.includes(target) || target.includes(n));
  });
  if (contains) return contains;

  const targetTokens = target.split(' ').filter((w) => w.length >= 3);
  if (targetTokens.length === 0) return undefined;
  let best: T | undefined;
  let bestOverlap = 0;
  for (const t of translators) {
    const tokens = normalize(t.name).split(' ').filter((w) => w.length >= 3);
    const overlap = targetTokens.filter((w) => tokens.includes(w)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = t;
    }
  }
  return bestOverlap > 0 ? best : undefined;
}

export function pickBetterQualityStream(
  primary: StreamData | null,
  candidates: Array<StreamData | null | undefined>
): StreamData | null {
  let best = primary && primary.streams?.length > 0 ? primary : null;
  let bestScore = best ? getMaxQualityScore(best.streams) : 0;
  const origLabel = best?.upgradedFromQuality || (best ? getMaxQualityLabel(best.streams) : '');

  for (const cand of candidates) {
    if (!cand || !cand.streams || cand.streams.length === 0) continue;
    const candScore = getMaxQualityScore(cand.streams);
    if (!best || candScore > bestScore) {
      const upgraded = Boolean(primary && primary.streams?.length > 0 && candScore > getMaxQualityScore(primary.streams));
      const mergedSubtitles =
        cand.subtitles && cand.subtitles.length > 0 ? cand.subtitles : best?.subtitles || [];
      best = upgraded
        ? {
            ...cand,
            subtitles: mergedSubtitles,
            upgradedMirror: true,
            upgradedFromQuality: origLabel || undefined,
          }
        : cand;
      bestScore = candScore;
    }
  }

  return best;
}

export function mergeSeasons(...seasonLists: Array<Season[] | undefined>): Season[] {
  const bySeasonId = new Map<number, { id: number; title: string; episodes: Map<number, Season['episodes'][number]> }>();

  for (const list of seasonLists) {
    if (!Array.isArray(list) || list.length === 0) continue;
    for (const season of list) {
      if (!season || !Number.isFinite(season.id) || season.id <= 0) continue;
      let entry = bySeasonId.get(season.id);
      if (!entry) {
        entry = {
          id: season.id,
          title: season.title || `Сезон ${season.id}`,
          episodes: new Map(),
        };
        bySeasonId.set(season.id, entry);
      }
      if (!Array.isArray(season.episodes)) continue;
      for (const ep of season.episodes) {
        if (!ep) continue;
        const epNum = Number(ep.episodeId ?? ep.id);
        if (!Number.isFinite(epNum) || epNum <= 0) continue;
        if (!entry.episodes.has(epNum)) {
          entry.episodes.set(epNum, {
            id: epNum,
            episodeId: epNum,
            seasonId: season.id,
            title: ep.title || `Серия ${epNum}`,
          });
        }
      }
    }
  }

  return Array.from(bySeasonId.values())
    .filter((s) => s.episodes.size > 0)
    .sort((a, b) => a.id - b.id)
    .map((s) => ({
      id: s.id,
      title: s.title,
      episodes: Array.from(s.episodes.values()).sort((a, b) => a.episodeId - b.episodeId),
    }));
}

function extractBalancedJson(src: string, openIdx: number, openChar: '[' | '{', closeChar: ']' | '}'): string | null {
  if (openIdx < 0 || src[openIdx] !== openChar) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return src.slice(openIdx, i + 1);
      }
    }
  }
  return null;
}

export function cleanTitleForSearch(raw?: string): string {
  if (!raw) return '';
  return raw
    .split('/')[0]
    .replace(/\s*\([^)]*(?:сезон|серия|сериал|season|episode|19\d{2}|20\d{2})[^)]*\)/gi, ' ')
    .replace(/\s*\b\d+(?:\s*[-–]\s*\d+)?\s*(?:сезон|season)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pickBestMirrorMatch(
  results: MediaItem[],
  meta?: Partial<MediaItem>
): MediaItem | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  const queryNorm = cleanTitleForSearch(meta?.title || meta?.origTitle || '').toLowerCase();
  const origNorm = cleanTitleForSearch(meta?.origTitle || '').toLowerCase();
  const queryTokens = queryNorm.split(' ').filter((w) => w.length >= 2);
  const targetYear = meta?.year && meta.year > 1900 ? meta.year : undefined;
  const targetType = meta?.type;

  const isTypeCompatible = (candType?: ContentType): boolean => {
    if (!targetType || !candType) return true;
    if (targetType === 'films') return candType === 'films' || candType === 'cartoons';
    if (targetType === 'series') return candType === 'series' || candType === 'animation' || candType === 'shows';
    return true;
  };

  let best: MediaItem | null = null;
  let bestScore = -1;

  for (const item of results) {
    if (!item?.url) continue;
    if (!isTypeCompatible(item.type)) continue;

    // Reject clear year mismatches (>= 2 years apart when both years are known)
    if (targetYear && item.year && Math.abs(item.year - targetYear) >= 2) {
      continue;
    }

    const candNorm = cleanTitleForSearch(item.title).toLowerCase();
    const candOrigNorm = cleanTitleForSearch(item.origTitle).toLowerCase();

    let titleScore = 0;
    if (queryNorm) {
      if (candNorm === queryNorm || (origNorm && candOrigNorm === origNorm)) {
        titleScore = 100;
      } else if (
        candNorm &&
        (candNorm.startsWith(`${queryNorm} `) || queryNorm.startsWith(`${candNorm} `))
      ) {
        // Require year match if one title is a spin-off / subtitle of the other
        if (targetYear && item.year && item.year !== targetYear) continue;
        titleScore = 55;
      } else if (queryTokens.length > 0 && candNorm) {
        const candTokens = candNorm.split(' ').filter((w) => w.length >= 2);
        const overlap = queryTokens.filter((w) => candTokens.includes(w)).length;
        const ratio = overlap / Math.max(queryTokens.length, candTokens.length, 1);
        if (overlap === 0 || ratio < 0.5) continue;
        titleScore = Math.round(ratio * 70);
      } else {
        continue;
      }
    } else {
      titleScore = 10;
    }

    let yearBonus = 0;
    if (targetYear && item.year) {
      if (item.year === targetYear) yearBonus = 40;
      else if (Math.abs(item.year - targetYear) === 1) yearBonus = 15;
    }

    const score = titleScore + yearBonus;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best;
}

export interface CollapsParsedData {
  isSeries: boolean;
  seasons?: Season[];
  translators: Translator[];
  getEpisodeData: (
    season?: number,
    episode?: number,
    translatorName?: string,
    translatorId?: number
  ) => { hls: string; subtitles: SubtitleTrack[]; audioTrackIndex?: number; audioTrackMatched?: boolean } | null;
}

export function parseCollapsEmbedHtml(html: string): CollapsParsedData | null {
  if (!html || typeof html !== 'string') return null;

  const isPlaceholderAudioName = (name: string): boolean => !name || /^delete$/i.test(name);

  const parseSubtitles = (cc: any): SubtitleTrack[] => {
    if (!Array.isArray(cc)) return [];
    const tracks: SubtitleTrack[] = [];
    for (const item of cc) {
      const url = typeof item?.url === 'string' ? item.url.trim() : '';
      const language = typeof item?.name === 'string' ? item.name.trim() : '';
      if (url && /^https?:\/\//i.test(url) && language) {
        tracks.push({ language, url });
      }
    }
    return tracks;
  };

  const resolveAudioIndex = (
    rawAudioNames: string[],
    translatorName?: string,
    unifiedTranslators?: Translator[],
    translatorId?: number
  ): { index?: number; matched: boolean } => {
    if (!Array.isArray(rawAudioNames) || rawAudioNames.length === 0) return { index: undefined, matched: false };
    // Preserve raw 0-based HLS track index even when empty/"delete" slots exist in audio.names
    const indexed = rawAudioNames
      .map((name, idx) => ({ id: idx + 1, name }))
      .filter((t) => !isPlaceholderAudioName(t.name));
    if (indexed.length === 0) return { index: 0, matched: false };
    const targetName =
      translatorName ||
      (translatorId && unifiedTranslators
        ? unifiedTranslators.find((t) => t.id === translatorId)?.name
        : undefined);
    if (!targetName) return { index: indexed[0].id - 1, matched: false };
    const matched = matchTranslatorByName(indexed, targetName);
    return matched ? { index: matched.id - 1, matched: true } : { index: indexed[0].id - 1, matched: false };
  };

  // 1. Series payload: seasons: [...]
  const seasonsKeyMatch = html.match(/\bseasons\s*:\s*\[/);
  if (seasonsKeyMatch && seasonsKeyMatch.index !== undefined) {
    const startIdx = html.indexOf('[', seasonsKeyMatch.index);
    const jsonSlice = extractBalancedJson(html, startIdx, '[', ']');
    if (jsonSlice) {
      try {
        const rawSeasons = JSON.parse(jsonSlice);
        if (Array.isArray(rawSeasons) && rawSeasons.length > 0) {
          const seasons: Season[] = [];
          const episodeMap = new Map<string, { hls: string; audioNames: string[]; subtitles: SubtitleTrack[]; blocked?: boolean }>();
          const seenAudio = new Set<string>();
          const translators: Translator[] = [];

          const sortedRaw = [...rawSeasons].sort((a, b) => Number(a?.season || 0) - Number(b?.season || 0));
          for (const rawSeason of sortedRaw) {
            const seasonNum = parseInt(String(rawSeason?.season ?? ''), 10);
            if (!Number.isFinite(seasonNum) || seasonNum <= 0) continue;
            const rawEpisodes = Array.isArray(rawSeason?.episodes) ? rawSeason.episodes : [];
            const episodes: Season['episodes'] = [];

            for (let idx = 0; idx < rawEpisodes.length; idx++) {
              const ep = rawEpisodes[idx];
              const epNum = parseInt(String(ep?.episode ?? idx + 1), 10);
              if (!Number.isFinite(epNum) || epNum <= 0) continue;
              const hls = typeof ep?.hls === 'string' ? ep.hls.trim() : '';
              // Keep raw array slots intact so audioTrackIndex matches HLS #EXT-X-MEDIA order 1:1
              const audioNames: string[] = Array.isArray(ep?.audio?.names)
                ? ep.audio.names.map((n: any) => String(n ?? '').trim())
                : [];
              for (const aName of audioNames) {
                if (isPlaceholderAudioName(aName)) continue;
                const key = aName.toLowerCase();
                if (!seenAudio.has(key)) {
                  seenAudio.add(key);
                  translators.push({
                    id: translators.length + 1,
                    name: aName,
                    premium: false,
                    camrip: isCamRipText(aName),
                  });
                }
              }
              if (hls && /^https?:\/\//i.test(hls)) {
                const epKey = `${seasonNum}_${epNum}`;
                const epBlocked = Boolean(rawSeason?.blocked || ep?.blocked);
                const existing = episodeMap.get(epKey);
                if (!existing || (existing.blocked && !epBlocked)) {
                  episodeMap.set(epKey, {
                    hls,
                    audioNames,
                    subtitles: parseSubtitles(ep?.cc),
                    blocked: epBlocked,
                  });
                }
              }
              if (!episodes.some((e) => e.episodeId === epNum)) {
                episodes.push({
                  id: epNum,
                  episodeId: epNum,
                  seasonId: seasonNum,
                  title: `Серия ${epNum}`,
                });
              }
            }

            episodes.sort((a, b) => a.episodeId - b.episodeId);
            if (episodes.length > 0) {
              seasons.push({
                id: seasonNum,
                title: `Сезон ${seasonNum}`,
                episodes,
              });
            }
          }

          if (seasons.length > 0 && episodeMap.size > 0) {
            const cleanTranslators = translators.filter((t) => !t.camrip);
            const finalTranslators =
              cleanTranslators.length > 0
                ? cleanTranslators
                : translators.length > 0
                  ? translators
                  : [{ id: 1, name: 'Дубляж / Оригинал', premium: false }];

            return {
              isSeries: true,
              seasons,
              translators: finalTranslators,
              getEpisodeData: (season?: number, episode?: number, translatorName?: string, translatorId?: number) => {
                const sNum = season && season > 0 ? season : seasons[0]?.id || 1;
                const eNum = episode && episode > 0 ? episode : 1;
                const epData = episodeMap.get(`${sNum}_${eNum}`);
                if (!epData) return null;
                const resolved = resolveAudioIndex(epData.audioNames, translatorName, finalTranslators, translatorId);
                return {
                  hls: epData.hls,
                  subtitles: epData.subtitles,
                  audioTrackIndex: resolved.index,
                  audioTrackMatched: resolved.matched,
                };
              },
            };
          }
        }
      } catch {}
    }
  }

  // 2. Movie payload: hls: "https://...m3u8..." + audio: { names: [...] } + cc: [...]
  const hlsMatch = html.match(/\bhls\s*:\s*["'](https?:\\?\/\\?\/[^"']+\.m3u8[^"']*)["']/i);
  if (!hlsMatch) return null;
  const movieHls = hlsMatch[1].replace(/\\\//g, '/').trim();
  if (!/^https?:\/\//i.test(movieHls)) return null;

  let audioNames: string[] = [];
  const audioMatch = html.match(/\baudio\s*:\s*\{/);
  if (audioMatch && audioMatch.index !== undefined) {
    const audioJson = extractBalancedJson(html, html.indexOf('{', audioMatch.index), '{', '}');
    if (audioJson) {
      try {
        const parsedAudio = JSON.parse(audioJson);
        if (Array.isArray(parsedAudio?.names)) {
          audioNames = parsedAudio.names.map((n: any) => String(n ?? '').trim());
        }
      } catch {}
    }
  }

  let subtitles: SubtitleTrack[] = [];
  const ccMatch = html.match(/\bcc\s*:\s*\[/);
  if (ccMatch && ccMatch.index !== undefined) {
    const ccJson = extractBalancedJson(html, html.indexOf('[', ccMatch.index), '[', ']');
    if (ccJson) {
      try {
        subtitles = parseSubtitles(JSON.parse(ccJson));
      } catch {}
    }
  }

  const rawTranslators: Translator[] = audioNames
    .map((name, idx) => ({
      id: idx + 1,
      name,
      premium: false,
      camrip: isCamRipText(name),
    }))
    .filter((t) => !isPlaceholderAudioName(t.name));
  const nonEmptyTranslators =
    rawTranslators.length > 0 ? rawTranslators : [{ id: 1, name: 'Дубляж / Оригинал', premium: false }];
  const cleanMovieTranslators = nonEmptyTranslators.filter((t) => !t.camrip);
  const finalTranslators = cleanMovieTranslators.length > 0 ? cleanMovieTranslators : nonEmptyTranslators;

  return {
    isSeries: false,
    seasons: undefined,
    translators: finalTranslators,
    getEpisodeData: (_season?: number, _episode?: number, translatorName?: string, translatorId?: number) => {
      const resolved = resolveAudioIndex(audioNames, translatorName, finalTranslators, translatorId);
      return {
        hls: movieHls,
        subtitles,
        audioTrackIndex: resolved.index,
        audioTrackMatched: resolved.matched,
      };
    },
  };
}

export class RezkaProvider implements IProvider {
  public id = 'hdrezka';
  public name = 'HDRezka Provider';
  public version = '0.0.51';

  private activeMirror: string;
  private mirrors: string[];
  private timeoutMs: number;
  private mediaCache: Map<string, Partial<MediaItem>> = new Map();
  private mediaUrlCache: Map<string, string> = new Map();
  private kpIdCache: Map<string, string> = new Map();
  private collapsPlayerCache: Map<string, { ts: number; data: CollapsParsedData | null }> = new Map();
  private kinobasePlayerCache: Map<
    string,
    {
      ts: number;
      file: any;
      subtitle?: string;
      trailerUrl?: string;
      balancerSrc?: string;
      kpId?: string;
    }
  > = new Map();
  private kinogoPlayerCache: Map<
    string,
    {
      ts: number;
      embedUrl: string;
      translators: Translator[];
      seasons?: Season[];
      itemDataMap: Map<string, string>;
    }
  > = new Map();

  constructor(activeMirror = 'https://rezka.ag', mirrors = DEFAULT_MIRRORS, timeoutMs = 8000) {
    this.mirrors = [...mirrors].filter((m) => !isBadMirrorUrl(m));
    if (!activeMirror || isBadMirrorUrl(activeMirror)) {
      activeMirror = this.mirrors[0] || 'https://rezka.ag';
    }
    this.activeMirror = activeMirror;
    this.timeoutMs = timeoutMs;
  }

  private isAntiBot(html: string): boolean {
    if (!html) return false;
    return (
      html.includes('anubis_challenge') ||
      html.includes('anubis_version') ||
      html.includes('anubis_base_prefix') ||
      html.includes('anubis.techaro.lol') ||
      html.includes('techaro.lol') ||
      html.includes('/.within.website/x/cmd/anubis/') ||
      html.includes("Making sure you're not a bot") ||
      html.includes('Making sure you&#39;re not a bot') ||
      html.includes('Проверяем, что вы не бот') ||
      html.includes('cf-browser-verification') ||
      html.includes('challenge-running') ||
      html.includes('Attention Required! | Cloudflare') ||
      html.includes('b-antibot') ||
      html.includes('within.website') ||
      html.includes('Время сессии истекло')
    );
  }

  public getActiveMirror(): string {
    return this.activeMirror;
  }

  public setActiveMirror(mirror: string): void {
    this.activeMirror = mirror.replace(/\/$/, '');
  }

  public getMirrors(): string[] {
    return [...this.mirrors];
  }

  public setMirrors(mirrors: string[]): void {
    this.mirrors = [...mirrors];
  }

  private getHeaders(referer?: string): Record<string, string> {
    return {
      'User-Agent': BROWSER_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      ...(referer ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
      'Referer': referer || this.activeMirror,
    };
  }

  private async fetchHtml(url: string, retries = 2): Promise<string> {
    let lastError: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await appFetch(url, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const html = await res.text();
        return html;
      } catch (err: any) {
        lastError = err;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 600));
        }
      }
    }
    throw new Error(`Failed to fetch ${url}: ${lastError?.message}`);
  }

  public async checkMirrors(mirrorsToCheck?: string[]): Promise<MirrorStatus[]> {
    const list = mirrorsToCheck && mirrorsToCheck.length > 0 ? mirrorsToCheck : this.mirrors;

    return Promise.all(
      list.map(async (mirror): Promise<MirrorStatus> => {
        const cleanUrl = mirror.replace(/\/$/, '');
        if (isBadMirrorUrl(cleanUrl)) {
          return {
            url: cleanUrl,
            isAvailable: false,
            latencyMs: 9999,
            lastChecked: Date.now(),
            needsVerification: false,
          };
        }

        const rootT0 = Date.now();
        try {
          const rootRes = await appFetch(cleanUrl, {
            headers: this.getHeaders(cleanUrl),
            signal: AbortSignal.timeout(5000),
          });
          const latency = Date.now() - rootT0;
          const text = await rootRes.text();
          const isBlocked = this.isAntiBot(text);
          const hasRezkaContent =
            text.includes('b-content') ||
            text.includes('b-post') ||
            text.includes('b-top') ||
            text.includes('kinobase') ||
            text.includes('Кинобейс') ||
            text.includes('kinovod') ||
            text.includes('Киновод') ||
            text.includes('hdstudio') ||
            text.includes('item-box') ||
            text.includes('pgs-sinfo_list') ||
            text.includes('shortStory') ||
            text.includes('shortstoryHeader') ||
            text.includes('kinogo') ||
            text.includes('YummyAnime') ||
            text.includes('anime_id') ||
            text.includes('animego') ||
            text.includes('UAKino') ||
            text.includes('uakino');
          const isFakeLogin = text.includes('Вход на HDrezka') || (text.includes('card-face') && !hasRezkaContent);
          const isLiveRezka = (hasRezkaContent || isBlocked) && !isFakeLogin;
          const isLiveSite = isLiveRezka && text.length > 200;
          const isChallengeStatus =
            isBlocked &&
            (rootRes.status === 401 || rootRes.status === 403 || rootRes.status === 429 || rootRes.status === 503);
          const isAvail = (rootRes.ok || isChallengeStatus) && isLiveSite;
          return {
            url: cleanUrl,
            isAvailable: isAvail,
            latencyMs: isAvail ? latency : 9999,
            lastChecked: Date.now(),
            needsVerification: isAvail && isBlocked && !hasRezkaContent,
          };
        } catch {
          return {
            url: cleanUrl,
            isAvailable: false,
            latencyMs: 9999,
            lastChecked: Date.now(),
            needsVerification: false,
          };
        }
      })
    );
  }

  public async selectBestMirror(): Promise<string> {
    if (isBadMirrorUrl(this.activeMirror)) {
      this.activeMirror = this.mirrors[0] || 'https://rezka.ag';
    }

    const statuses = await this.checkMirrors();

    // Preserve active mirror if it's currently available and does not require bot verification
    const activeStatus = statuses.find(s => s.url === this.activeMirror);
    if (activeStatus && activeStatus.isAvailable && !activeStatus.needsVerification) {
      return this.activeMirror;
    }

    const available = statuses.filter(s => s.isAvailable);
    if (available.length > 0) {
      available.sort((a, b) => {
        if (a.needsVerification !== b.needsVerification) {
          return a.needsVerification ? 1 : -1;
        }
        return a.latencyMs - b.latencyMs;
      });
      // If active mirror is available and shares best verification status with lowest latency, retain it
      if (activeStatus && activeStatus.isAvailable && activeStatus.needsVerification === available[0].needsVerification) {
        return this.activeMirror;
      }
      this.activeMirror = available[0].url;
      return this.activeMirror;
    }

    return this.activeMirror;
  }

  /** Remove protected (anti-bot) and unreachable mirrors when >= 1 open mirror works, promoting unblocked HDRezka mirrors first. */
  public async pruneProtectedMirrors(mirrorsToCheck?: string[]): Promise<string> {
    const targetList =
      mirrorsToCheck && mirrorsToCheck.length > 0
        ? mirrorsToCheck.map((m) => m.replace(/\/$/, ''))
        : [...this.mirrors];
    const statuses = await this.checkMirrors(targetList);
    const isRezkaOpen = (url: string) => !this.isKinobase(url) && !this.isKinogo(url) && !this.isHdStudio(url);
    const clean = statuses
      .filter((s) => s.isAvailable && !s.needsVerification)
      .sort((a, b) => {
        const aRezka = isRezkaOpen(a.url) ? 0 : 1;
        const bRezka = isRezkaOpen(b.url) ? 0 : 1;
        if (aRezka !== bRezka) return aRezka - bRezka;
        return a.latencyMs - b.latencyMs;
      });

    if (clean.length > 0) {
      this.mirrors = clean.map((s) => s.url);
      if (isRezkaOpen(clean[0].url) || !this.mirrors.includes(this.activeMirror)) {
        this.activeMirror = clean[0].url;
      }
      return this.activeMirror;
    }

    // Keep reachable protected mirrors only when zero open mirrors respond; drop dead timeouts
    const reachable = statuses.filter((s) => s.isAvailable).sort((a, b) => a.latencyMs - b.latencyMs);
    if (reachable.length > 0) {
      this.mirrors = reachable.map((s) => s.url);
      if (!this.mirrors.includes(this.activeMirror)) {
        this.activeMirror = reachable[0].url;
      }
    }
    return this.activeMirror;
  }

  public async findOnlineMirrors(): Promise<{ added: string[]; all: string[] }> {
    const candidateUrls = new Set<string>([...OPEN_MIRROR_SEEDS, ...HDREZKA_MIRRORS]);

    // Seed list of known mirror candidates (excluding dead/hangup domains)
    const seeds = [
      'https://kinobase.org',
      'https://kinovod.pro',
      'https://kinogo.film',
      'http://hdstudio.org',
      'https://www.kinobase.org',
    ];
    for (const s of seeds) {
      if (!isBadMirrorUrl(s)) candidateUrls.add(s);
    }

    // Online sources
    const sources = [
      'https://raw.githubusercontent.com/MrIkso/hdrezka-fetcher/master/mirror.txt',
      'https://raw.githubusercontent.com/thecapibara/RDX-TV/main/src/services/api.ts',
      'https://raw.githubusercontent.com/thecapibara/RDX/main/src/services/api.ts',
      'https://t.me/s/HDRezkaPC',
    ];

    await Promise.allSettled(
      sources.map(async (src) => {
        try {
          const res = await appFetch(src, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HDRezka-Desktop' },
            signal: AbortSignal.timeout(4000),
          });
          if (res.ok) {
            const text = await res.text();
            const matches = text.match(/https?:\/\/[a-zA-Z0-9.-]*(rezka|hdrezka|kinobase|kinovod|kinogo|hdstudio)[a-zA-Z0-9.-]*/gi) || [];
            for (const m of matches) {
              const clean = m.trim().replace(/\/$/, '');
              if (/^https?:\/\/[a-zA-Z0-9.-]+$/i.test(clean) && !clean.includes('t.me') && !clean.includes('github')) {
                candidateUrls.add(clean);
              }
            }
          }
        } catch {}
      })
    );

    // Test candidates in parallel and only accept open, non-bot-gated mirrors
    const verifiedNewMirrors: string[] = [];
    const currentSet = new Set(this.mirrors.map((m) => m.toLowerCase().replace(/\/$/, '')));
    const candidatesList = Array.from(candidateUrls).filter((c) => !isBadMirrorUrl(c) && !currentSet.has(c.toLowerCase()));

    await Promise.allSettled(
      candidatesList.map(async (url) => {
        try {
          const res = await appFetch(url, {
            headers: this.getHeaders(url),
            signal: AbortSignal.timeout(4500),
          });
          if (!res.ok) return;
          const text = await res.text();
          if (!text || this.isAntiBot(text) || text.includes('Вход на HDrezka')) return;
          const hasSite =
            text.includes('b-content') ||
            text.includes('kinobase') ||
            text.includes('Кинобейс') ||
            text.includes('kinovod') ||
            text.includes('Киновод') ||
            text.includes('hdstudio') ||
            text.includes('item-box') ||
            text.includes('shortStory') ||
            text.includes('kinogo');
          if (hasSite) {
            verifiedNewMirrors.push(url);
          }
        } catch {}
      })
    );

    if (verifiedNewMirrors.length > 0) {
      this.mirrors = Array.from(new Set([...this.mirrors, ...verifiedNewMirrors]));
    }

    await this.pruneProtectedMirrors();

    return {
      added: verifiedNewMirrors.filter((u) => this.mirrors.includes(u)),
      all: [...this.mirrors],
    };
  }

  private parseItem(element: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): MediaItem | null {
    const el = $(element);
    const id = el.attr('data-id') || '';
    if (!id) return null;

    const linkEl = el.find('.b-content__inline_item-link a');
    const url = linkEl.attr('href') || el.attr('data-url') || '';
    const title = linkEl.text().trim();
    if (!title) return null;

    const imgEl = el.find('.b-content__inline_item-cover img');
    const poster = imgEl.attr('src') || '';

    const catEl = el.find('.cat');
    let type: ContentType = 'films';
    if (catEl.hasClass('series') || url.includes('/series/')) type = 'series';
    else if (catEl.hasClass('cartoons') || url.includes('/cartoons/')) type = 'cartoons';
    else if (catEl.hasClass('animation') || url.includes('/animation/')) type = 'animation';
    else if (catEl.hasClass('show') || url.includes('/show/')) type = 'shows';

    const infoText = el.find('.misc').text().trim() || el.find('.b-content__inline_item-link div').text().trim();
    const badgeText = el.find('.info').text().trim();

    // Extract year, country, genres from infoText "2024, США, Боевики"
    let year: number | undefined;
    let country: string | undefined;
    const genres: string[] = [];

    if (infoText) {
      const parts = infoText.split(',').map(p => p.trim());
      const yearMatch = parts[0]?.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch) year = parseInt(yearMatch[1], 10);
      if (parts.length > 1) country = parts[1];
      if (parts.length > 2) {
        for (let i = 2; i < parts.length; i++) {
          genres.push(parts[i]);
        }
      }
    }

    const ratingEl = el.find('.rating i');
    const rating = ratingEl.length ? parseFloat(ratingEl.text().trim()) : undefined;

    return {
      id,
      title,
      url,
      poster,
      year,
      country,
      genres,
      type,
      rating,
      info: badgeText || infoText,
    };
  }

  private async fetchItemsFromPath(path: string): Promise<MediaItem[]> {
    try {
      const url = path.startsWith('http') ? path : `${this.activeMirror}${path}`;
      const html = await this.fetchHtml(url);
      if (this.isAntiBot(html)) return [];
      const $ = cheerio.load(html);
      const items: MediaItem[] = [];
      $('.b-content__inline_item').each((_, el) => {
        const item = this.parseItem($(el), $);
        if (item && !items.some((x) => x.id === item.id)) {
          this.mediaCache.set(item.url, item);
          this.mediaCache.set(item.id, item);
          items.push(item);
        }
      });
      return items;
    } catch {
      return [];
    }
  }

  private async fetchLiveRezkaHomeSections() {
    try {
      // Live HDRezka category searches directly from search endpoint
      const queries = ['лучшие', 'фильмы', 'сериалы', 'новинки', 'мультфильмы'];
      const queryResults = await Promise.allSettled(queries.map((q) => this.searchAdvanced(q, 1)));

      let recommendations: MediaItem[] = [];
      let popular: MediaItem[] = [];
      let newReleases: MediaItem[] = [];
      let topMovies: MediaItem[] = [];
      let topSeries: MediaItem[] = [];
      const allLiveMap = new Map<string, MediaItem>();

      queryResults.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.items)) {
          const items = res.value.items;
          items.forEach((it) => {
            if (it.url && !allLiveMap.has(it.url)) {
              allLiveMap.set(it.url, it);
            }
          });
          const q = queries[idx];
          if (q === 'лучшие') {
            recommendations = items.slice(0, 16);
          } else if (q === 'новинки') {
            newReleases = items.slice(0, 16);
            popular = items.slice(0, 16);
          } else if (q === 'сериалы') {
            topSeries = items.slice(0, 16);
          } else if (q === 'фильмы') {
            topMovies = items.slice(0, 16);
          } else if (q === 'мультфильмы' && recommendations.length < 8) {
            recommendations.push(...items.slice(0, 8));
          }
        }
      });

      const allLive = Array.from(allLiveMap.values());
      if (allLive.length === 0) {
        return FALLBACK_HOME_SECTIONS;
      }

      // Pick hero with valid poster and high prominence
      const heroCandidate =
        recommendations.find((i) => i.poster && !i.poster.includes('unsplash')) ||
        popular.find((i) => i.poster && !i.poster.includes('unsplash')) ||
        allLive.find((i) => i.poster && !i.poster.includes('unsplash')) ||
        allLive[0];

      if (recommendations.length === 0) {
        recommendations = allLive.filter((i) => (i.rating || 0) >= 7.0 || i.poster?.includes('static.hdrezka')).slice(0, 16);
      }
      if (popular.length === 0) {
        popular = allLive.slice(0, 16);
      }
      if (newReleases.length === 0) {
        newReleases = allLive.filter((i) => (i.year || 0) >= 2024).slice(0, 16);
      }
      if (topMovies.length === 0) {
        topMovies = allLive.filter((i) => i.type === 'films').slice(0, 16);
      }
      if (topSeries.length === 0) {
        topSeries = allLive.filter((i) => i.type === 'series').slice(0, 16);
      }

      const expected = allLive.filter((i) => (i.year || 0) >= 2025).slice(0, 16);

      return {
        hero: heroCandidate || FALLBACK_HERO,
        popular: popular.length > 0 ? popular : FALLBACK_HOME_SECTIONS.popular,
        newReleases: newReleases.length > 0 ? newReleases : FALLBACK_HOME_SECTIONS.newReleases,
        topMovies: topMovies.length > 0 ? topMovies : FALLBACK_HOME_SECTIONS.topMovies,
        topSeries: topSeries.length > 0 ? topSeries : FALLBACK_HOME_SECTIONS.topSeries,
        recommendations: recommendations.length > 0 ? recommendations : (popular.length > 0 ? popular : FALLBACK_HOME_SECTIONS.recommendations),
        expected: expected.length > 0 ? expected : FALLBACK_HOME_SECTIONS.expected,
      };
    } catch {
      return FALLBACK_HOME_SECTIONS;
    }
  }

  private filterNonCamRipItems(items: MediaItem[]): MediaItem[] {
    const clean = items.filter((item) => !isCamRipText(item.info) && !isCamRipText(item.title));
    return clean.length > 0 ? clean : items;
  }

  private filterCamRipTranslators(translators: Translator[]): Translator[] {
    const clean = translators.filter((t) => !t.camrip && !isCamRipText(t.name));
    return clean.length > 0 ? clean : translators;
  }

  private isHdStudio(...args: [urlOrMirror?: string]): boolean {
    const raw = args.length > 0 ? args[0] : this.activeMirror;
    const target = (raw || '').toLowerCase();
    if (!target) return false;
    return target.includes('hdstudio.org') || /\/(?:serial|film)\/[^/]+\/\d+-\d+-\d+-\d+/.test(target);
  }

  private isKinobase(...args: [urlOrMirror?: string]): boolean {
    const raw = args.length > 0 ? args[0] : this.activeMirror;
    const target = (raw || '').toLowerCase();
    if (!target || target.includes('hdstudio.org')) return false;
    return (
      target.includes('kinobase.org') ||
      target.includes('kinovod.pro') ||
      target.startsWith('/film/') ||
      (target.startsWith('/serial/') && !/\/\d+-\d+-\d+-\d+/.test(target))
    );
  }

  private getKinobaseOrigin(urlOrMirror?: string): string {
    const target = (urlOrMirror || this.activeMirror || '').toLowerCase();
    if (target.includes('kinovod.pro')) return 'https://kinovod.pro';
    return 'https://kinobase.org';
  }

  private isKinogo(...args: [urlOrMirror?: string]): boolean {
    const raw = args.length > 0 ? args[0] : this.activeMirror;
    const target = (raw || '').toLowerCase();
    return target.includes('kinogo.');
  }

  private isYummyAnime(urlOrMirror?: string): boolean {
    const target = (urlOrMirror || '').toLowerCase();
    return target.includes('api.yani.tv') || target.includes('yummyanime.') || target.includes('yummyani.me');
  }

  private isAnimeGo(urlOrMirror?: string): boolean {
    const target = (urlOrMirror || '').toLowerCase();
    return target.includes('animego.');
  }

  private isUaKino(urlOrMirror?: string): boolean {
    const target = (urlOrMirror || '').toLowerCase();
    return target.includes('uakino.');
  }

  private isAnimeMirror(urlOrMirror?: string): boolean {
    return this.isYummyAnime(urlOrMirror) || this.isAnimeGo(urlOrMirror) || this.isUaKino(urlOrMirror);
  }

  public parseYummyAnimeItems(list: any[]): MediaItem[] {
    if (!Array.isArray(list)) return [];
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      if (!raw || !raw.anime_id || !raw.title) continue;
      const id = `yani-${raw.anime_id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const rawPoster = raw.poster?.big || raw.poster?.medium || raw.poster?.fullsize || raw.poster?.small || '';
      const poster = rawPoster.startsWith('//') ? `https:${rawPoster}` : rawPoster;
      const ratingNum = Number(raw.rating?.average || raw.rating?.shikimori_rating || raw.rating?.kp_rating || 0);
      const viewsNum = Number(raw.views || 0);
      const yearNum = Number(raw.year || 0);
      const url = `https://api.yani.tv/anime/${raw.anime_id}`;
      const item: MediaItem = {
        id,
        title: String(raw.title).trim(),
        origTitle: raw.original ? String(raw.original).trim() : undefined,
        url,
        poster,
        year: yearNum > 1900 ? yearNum : undefined,
        type: 'animation',
        rating: ratingNum > 0 ? Math.round(ratingNum * 10) / 10 : undefined,
        views: viewsNum > 0 ? viewsNum : undefined,
        info: `YummyAnime${yearNum > 1900 ? ` · ${yearNum}` : ''}`,
      };
      this.mediaCache.set(url, item);
      this.mediaCache.set(id, item);
      this.mediaUrlCache.set(id, url);
      items.push(item);
    }
    return this.filterNonCamRipItems(items);
  }

  private async searchYummyAnime(query: string): Promise<MediaItem[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const res = await appFetch(`https://api.yani.tv/search?q=${encodeURIComponent(q)}&limit=15`, {
        headers: { 'User-Agent': BROWSER_USER_AGENT, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3200),
      });
      if (!res.ok) return [];
      const json: any = await res.json();
      return this.parseYummyAnimeItems(json?.response || []);
    } catch {
      return [];
    }
  }

  public parseAnimeGoItems(html: string): MediaItem[] {
    if (!html) return [];
    const $ = cheerio.load(html);
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    $('.ani-grid__item, .animes-grid-item').each((_, el) => {
      const a = $(el).find('a[href*="/anime/"]').first();
      const href = a.attr('href') || '';
      if (!href || !href.includes('/anime/')) return;
      const fullUrl = href.startsWith('http') ? href : `https://animego.me${href.startsWith('/') ? '' : '/'}${href}`;
      const slugId = fullUrl.split('/').pop() || fullUrl;
      const id = `animego-${slugId}`;
      if (seen.has(id)) return;
      seen.add(id);

      const title =
        $(el).find('.card-title, .h5, .ani-grid__item-title').first().text().trim() ||
        a.attr('title')?.trim() ||
        a.text().trim();
      if (!title) return;

      const img = $(el).find('img, [data-original]').first();
      let poster = img.attr('data-original') || img.attr('data-src') || img.attr('src') || '';
      if (poster.startsWith('//')) poster = `https:${poster}`;
      else if (poster && !poster.startsWith('http')) poster = `https://animego.me${poster.startsWith('/') ? '' : '/'}${poster}`;

      const cardText = $(el).text().replace(/\s+/g, ' ').trim();
      const yearMatch = cardText.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
      const ratingMatch = $(el).find('[class*="rating"], .p-rate-flag__text').first().text().match(/(\d+(?:[.,]\d+)?)/) ||
        cardText.match(/^(\d\.\d)\b/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : undefined;

      const item: MediaItem = {
        id,
        title,
        url: fullUrl,
        poster,
        year,
        type: 'animation',
        rating: rating && !Number.isNaN(rating) && rating <= 10 ? rating : undefined,
        info: `AnimeGO${year ? ` · ${year}` : ''}`,
      };
      this.mediaCache.set(fullUrl, item);
      this.mediaCache.set(id, item);
      this.mediaUrlCache.set(id, fullUrl);
      items.push(item);
    });
    return this.filterNonCamRipItems(items);
  }

  private async searchAnimeGo(query: string): Promise<MediaItem[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const res = await appFetch(`https://animego.me/search/anime?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': BROWSER_USER_AGENT, 'Accept-Language': 'ru-RU,ru;q=0.9' },
        signal: AbortSignal.timeout(3200),
      });
      if (!res.ok) return [];
      const html = await res.text();
      if (this.isAntiBot(html)) return [];
      return this.parseAnimeGoItems(html);
    } catch {
      return [];
    }
  }

  public parseUaKinoItems(html: string): MediaItem[] {
    if (!html) return [];
    const $ = cheerio.load(html);
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    $('.movie-item').each((_, el) => {
      if ($(el).hasClass('swiper-slide')) return;
      const a = $(el).find('a.movie-title, .movie-img a, a[href]').first();
      const href = a.attr('href') || '';
      if (!href || href.includes('/news/')) return;
      const fullUrl = href.startsWith('http') ? href : `https://uakino.biz${href.startsWith('/') ? '' : '/'}${href}`;
      const idMatch = fullUrl.match(/\/(\d+)-/);
      const id = idMatch ? `uakino-${idMatch[1]}` : `uakino-${fullUrl}`;
      if (seen.has(id)) return;
      seen.add(id);

      const title = $(el).find('a.movie-title').first().text().trim() || a.attr('title')?.trim() || a.text().trim();
      if (!title) return;

      const img = $(el).find('img').first();
      let poster = img.attr('data-src') || img.attr('src') || '';
      if (poster.startsWith('//')) poster = `https:${poster}`;
      else if (poster && !poster.startsWith('http')) poster = `https://uakino.biz${poster.startsWith('/') ? '' : '/'}${poster}`;

      const cardText = $(el).text().replace(/\s+/g, ' ').trim();
      const yearMatch = cardText.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
      const ratingMatch = cardText.match(/IMDB:\s*(\d+(?:\.\d+)?)/i);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;
      const type: ContentType = fullUrl.includes('/anime')
        ? 'animation'
        : fullUrl.includes('/seri')
          ? 'series'
          : fullUrl.includes('/cartoon')
            ? 'cartoons'
            : 'films';

      const item: MediaItem = {
        id,
        title,
        url: fullUrl,
        poster,
        year,
        type,
        rating: rating && !Number.isNaN(rating) ? rating : undefined,
        info: `UAKino${year ? ` · ${year}` : ''}`,
      };
      this.mediaCache.set(fullUrl, item);
      this.mediaCache.set(id, item);
      this.mediaUrlCache.set(id, fullUrl);
      items.push(item);
    });
    return this.filterNonCamRipItems(items);
  }

  private async searchUaKino(query: string): Promise<MediaItem[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const res = await appFetch('https://uakino.biz/ua/', {
        method: 'POST',
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://uakino.biz/ua/',
        },
        body: new URLSearchParams({ do: 'search', subaction: 'search', story: q }).toString(),
        signal: AbortSignal.timeout(3200),
      });
      if (!res.ok) return [];
      const html = await res.text();
      if (this.isAntiBot(html)) return [];
      return this.parseUaKinoItems(html);
    } catch {
      return [];
    }
  }

  private async searchAnimeMirrors(query: string): Promise<MediaItem[]> {
    const [yaniRes, goRes, uaRes] = await Promise.allSettled([
      this.searchYummyAnime(query),
      this.searchAnimeGo(query),
      this.searchUaKino(query),
    ]);
    const combined: MediaItem[] = [
      ...(yaniRes.status === 'fulfilled' ? yaniRes.value : []),
      ...(goRes.status === 'fulfilled' ? goRes.value : []),
      ...(uaRes.status === 'fulfilled' ? uaRes.value : []),
    ];
    return this.dedupeMediaItems(combined);
  }

  private dedupeMediaItems(items: MediaItem[]): MediaItem[] {
    const out: MediaItem[] = [];
    const byKey = new Map<string, MediaItem>();
    for (const item of items) {
      const normTitle = item.title.toLowerCase().replace(/[^a-zа-яёіїє0-9]/gi, '');
      const key = `${normTitle}:${item.year || ''}:${item.url}`;
      const titleYearKey = item.year ? `${normTitle}:${item.year}` : '';
      const existing = byKey.get(key) || (titleYearKey ? byKey.get(titleYearKey) : undefined);
      if (existing) {
        if (!existing.views && item.views) existing.views = item.views;
        if (!existing.rating && item.rating) existing.rating = item.rating;
        continue;
      }
      byKey.set(key, item);
      if (titleYearKey) byKey.set(titleYearKey, item);
      out.push(item);
    }
    return out;
  }

  private async getAnimeMirrorCatalog(filter: CatalogFilter): Promise<SearchResult | null> {
    try {
      const offset = Math.max(0, (filter.page - 1) * 24);
      const sort = filter.sort === 'popular' || filter.sort === 'rating' ? 'top' : filter.sort === 'watching' ? 'views' : 'year';
      const [yaniRes, uaRes] = await Promise.allSettled([
        (async () => {
          const r = await appFetch(`https://api.yani.tv/anime?limit=24&offset=${offset}&sort=${sort}`, {
            headers: { 'User-Agent': BROWSER_USER_AGENT, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(4000),
          });
          if (!r.ok) return [];
          const j: any = await r.json();
          return this.parseYummyAnimeItems(j?.response || []);
        })(),
        filter.page === 1
          ? (async () => {
              const r = await appFetch('https://uakino.biz/animeukr/', {
                headers: { 'User-Agent': BROWSER_USER_AGENT },
                signal: AbortSignal.timeout(3500),
              });
              if (!r.ok) return [];
              return this.parseUaKinoItems(await r.text());
            })()
          : Promise.resolve([]),
      ]);
      const items = this.dedupeMediaItems([
        ...(yaniRes.status === 'fulfilled' ? yaniRes.value : []),
        ...(uaRes.status === 'fulfilled' ? uaRes.value : []),
      ]);
      if (items.length > 0) {
        return { items, page: filter.page, hasMore: items.length >= 16 };
      }
      const goRes = await appFetch(`https://animego.me/anime${filter.page > 1 ? `?page=${filter.page}` : ''}`, {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
        signal: AbortSignal.timeout(4000),
      });
      if (goRes.ok) {
        const goItems = this.parseAnimeGoItems(await goRes.text());
        if (goItems.length > 0) return { items: goItems, page: filter.page, hasMore: true };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async getAnimeMirrorDetails(urlOrId: string, meta?: Partial<MediaItem>): Promise<MediaDetails | null> {
    const target = meta?.url || urlOrId;
    try {
      // YummyAnime JSON API details
      if (this.isYummyAnime(target) || /^yani-\d+$/i.test(urlOrId)) {
        const idMatch = target.match(/\/anime\/(\d+)/) || urlOrId.match(/yani-(\d+)/i);
        const animeId = idMatch?.[1];
        if (!animeId) return null;
        const [infoRes, vidRes] = await Promise.all([
          appFetch(`https://api.yani.tv/anime/${animeId}`, {
            headers: { 'User-Agent': BROWSER_USER_AGENT, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(4500),
          }),
          appFetch(`https://api.yani.tv/anime/${animeId}/videos`, {
            headers: { 'User-Agent': BROWSER_USER_AGENT, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(4500),
          }).catch(() => null),
        ]);
        if (!infoRes.ok) return null;
        const raw = ((await infoRes.json()) as any)?.response;
        if (!raw?.title) return null;

        const rawPoster = raw.poster?.fullsize || raw.poster?.big || meta?.poster || '';
        const poster = rawPoster.startsWith('//') ? `https:${rawPoster}` : rawPoster;
        const title = String(raw.title).trim();
        const origTitle = String(raw.original || meta?.origTitle || '').trim();
        const year = Number(raw.year || meta?.year || 0);
        const ratingRezka = Number(raw.rating?.average || raw.rating?.shikimori_rating || 0) || undefined;
        const ratingKp = Number(raw.rating?.kp_rating || 0) || undefined;
        const kpId = raw.remote_ids?.kp_id ? String(raw.remote_ids.kp_id) : undefined;
        const genres = Array.isArray(raw.genres) ? raw.genres.map((g: any) => g?.title).filter(Boolean) : ['Аниме'];

        const translators: Translator[] = [];
        const episodesMap = new Map<number, { id: number; episodeId: number; seasonId: number; title: string }>();
        if (vidRes?.ok) {
          try {
            const vids: any[] = ((await vidRes.json()) as any)?.response || [];
            const seenDubs = new Set<string>();
            for (const v of vids) {
              const dub = String(v?.data?.dubbing || v?.data?.player || 'Озвучка').trim();
              if (dub && !seenDubs.has(dub.toLowerCase())) {
                seenDubs.add(dub.toLowerCase());
                translators.push({ id: translators.length + 1, name: dub, premium: false });
              }
              const epNum = parseInt(String(v?.number || '0'), 10);
              if (epNum > 0 && !episodesMap.has(epNum)) {
                episodesMap.set(epNum, { id: epNum, episodeId: epNum, seasonId: 1, title: `Серия ${epNum}` });
              }
            }
          } catch {}
        }
        if (translators.length === 0) {
          translators.push({ id: 1, name: 'Озвучка / Субтитры', premium: false });
        }
        const episodes = Array.from(episodesMap.values()).sort((a, b) => a.episodeId - b.episodeId);
        const seasons = episodes.length > 0 ? [{ id: 1, title: 'Сезон 1', episodes }] : undefined;

        const [kpReviews, criticReviews] = await Promise.all([
          this.fetchKinopoiskReviews(title, year, origTitle, kpId),
          this.fetchCriticReviews(title, year, { ratingRezka, ratingKp, genres }),
        ]);

        return {
          id: `yani-${animeId}`,
          title,
          origTitle,
          poster,
          backdrop: poster,
          year,
          country: 'Япония',
          genres,
          type: 'animation',
          ratingRezka: ratingRezka ? Math.round(ratingRezka * 10) / 10 : undefined,
          ratingKp: ratingKp ? Math.round(ratingKp * 10) / 10 : undefined,
          description: String(raw.description || '').replace(/<[^>]+>/g, '').trim(),
          directors: [],
          actors: [],
          translators: this.filterCamRipTranslators(translators),
          currentTranslatorId: translators[0]?.id ?? 1,
          seasons,
          similar: [],
          reviews: [...kpReviews, ...criticReviews],
          url: target,
          antiBot: false,
        };
      }

      // AnimeGO / UAKino HTML details
      const res = await appFetch(target, {
        headers: { 'User-Agent': BROWSER_USER_AGENT, 'Accept-Language': 'ru-RU,ru;q=0.9,uk;q=0.8' },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) return null;
      const html = await res.text();
      if (this.isAntiBot(html)) return null;
      const $ = cheerio.load(html);
      const title = $('h1').first().text().trim() || meta?.title || '';
      if (!title) return null;

      let poster =
        $('.anime-poster img, .film-poster img, .fposter img, meta[property="og:image"]').first().attr('content') ||
        $('.anime-poster img, .film-poster img, .fposter img').first().attr('src') ||
        meta?.poster ||
        '';
      if (poster.startsWith('//')) poster = `https:${poster}`;
      else if (poster && !poster.startsWith('http')) {
        const origin = new URL(target).origin;
        poster = `${origin}${poster.startsWith('/') ? '' : '/'}${poster}`;
      }
      const description =
        $('.description, .full-text, [itemprop="description"]').first().text().trim() ||
        $('meta[name="description"]').attr('content') ||
        '';
      const yearMatch = html.match(/\b(19\d{2}|20\d{2})\b/);
      const year = meta?.year || (yearMatch ? parseInt(yearMatch[1], 10) : 0);
      const [kpReviews, criticReviews] = await Promise.all([
        this.fetchKinopoiskReviews(title, year, meta?.origTitle, html),
        this.fetchCriticReviews(title, year, { ratingRezka: meta?.rating }),
      ]);

      return {
        id: meta?.id || urlOrId,
        title,
        origTitle: meta?.origTitle || '',
        poster,
        backdrop: poster,
        year,
        country: this.isUaKino(target) ? 'Україна / Світ' : 'Япония',
        genres: ['Аниме'],
        type: meta?.type || 'animation',
        ratingRezka: meta?.rating,
        description,
        directors: [],
        actors: [],
        translators: [{ id: 1, name: this.isUaKino(target) ? 'Українська озвучка' : 'Дубляж / Озвучка', premium: false }],
        currentTranslatorId: 1,
        similar: [],
        reviews: [...kpReviews, ...criticReviews],
        url: target,
        antiBot: false,
      };
    } catch {
      return null;
    }
  }

  private getKinogoBaseUrl(): string {
    return this.isKinogo(this.activeMirror) ? this.activeMirror : 'https://kinogo.film';
  }

  private parseKinobaseItems(html: string, defaultType: ContentType = 'films', origin = 'https://kinobase.org'): MediaItem[] {
    const cleanOrigin = origin.replace(/\/$/, '');
    const $ = cheerio.load(html);
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    $('li.item, div.item').each((_, el) => {
      const linkEl = $(el).find('.title a, .poster a, a').first();
      const href = linkEl.attr('href') || '';
      const rawTitle = $(el).find('.title a').text().trim() || linkEl.attr('title') || linkEl.text().trim();
      if (!href || !rawTitle || !/\/(?:film|serial)\/\d+/.test(href)) return;

      const idMatch = href.match(/\/(?:film|serial)\/(\d+)/);
      const id = idMatch ? idMatch[1] : href;
      if (seen.has(id)) return;
      seen.add(id);

      const fullUrl = href.startsWith('http')
        ? href
        : `${cleanOrigin}${href.startsWith('/') ? '' : '/'}${href}`;
      const img = $(el).find('img').first();
      let poster = img.attr('data-src') || img.attr('src') || '';
      if (poster && !poster.startsWith('http')) {
        poster = `${cleanOrigin}${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      const title = rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim();
      const yearText = $(el).find('.year').text().trim();
      const yMatch = yearText.match(/\b(19\d{2}|20\d{2})\b/) || rawTitle.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yMatch ? parseInt(yMatch[1], 10) : undefined;
      const rText = $(el).find('.rating').first().text().trim();
      const rating = rText ? parseFloat(rText) : undefined;
      const labelText = $(el).find('.label').text().trim();

      let type: ContentType = defaultType;
      if (href.includes('/serial/')) type = 'series';
      else if (defaultType === 'films' && href.includes('/film/')) type = 'films';

      const item: MediaItem = {
        id,
        title: title || rawTitle,
        url: fullUrl,
        poster,
        year,
        type,
        rating: rating && !isNaN(rating) ? rating : undefined,
        info: labelText || yearText || undefined,
      };
      this.mediaCache.set(fullUrl, item);
      this.mediaCache.set(href, item);
      this.mediaCache.set(id, item);
      this.mediaUrlCache.set(id, fullUrl);
      items.push(item);
    });
    return this.filterNonCamRipItems(items);
  }

  private async fetchKinobasePage(url: string, timeoutMs = 5000): Promise<{ html: string; cookies: string } | null> {
    try {
      const res = await appFetch(url, {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const html = await res.text();
      if (!html || this.isAntiBot(html)) return null;
      const setCookies = (res.headers as any).getSetCookie
        ? (res.headers as any).getSetCookie()
        : [res.headers.get('set-cookie')];
      const cookies = (setCookies || [])
        .filter(Boolean)
        .map((c: string) => c.split(';')[0].trim())
        .filter(Boolean)
        .join('; ');
      return { html, cookies };
    } catch {
      return null;
    }
  }

  private async getKinobaseHomeSections(origin?: string) {
    try {
      const base = origin || this.getKinobaseOrigin();
      const [homePage, filmsPage, serialsPage, animPage] = await Promise.all([
        this.fetchKinobasePage(`${base}/`),
        this.fetchKinobasePage(`${base}/films?sort=rating`),
        this.fetchKinobasePage(`${base}/serials`),
        this.fetchKinobasePage(`${base}/animation`),
      ]);

      const homeItems = homePage ? this.parseKinobaseItems(homePage.html, 'films', base) : [];
      const filmsItems = filmsPage ? this.parseKinobaseItems(filmsPage.html, 'films', base) : [];
      const seriesItems = serialsPage ? this.parseKinobaseItems(serialsPage.html, 'series', base) : [];
      const animItems = animPage ? this.parseKinobaseItems(animPage.html, 'animation', base) : [];

      if (homeItems.length === 0 && filmsItems.length === 0 && seriesItems.length === 0) {
        return null;
      }

      const popular = (homeItems.length > 0 ? homeItems : filmsItems).slice(0, 16);
      const newReleasesList = homeItems.filter((i) => (i.year || 0) >= 2024);
      const newReleases = (newReleasesList.length > 0 ? newReleasesList : homeItems.slice(16, 32)).slice(0, 16);
      const topMovies = (filmsItems.length > 0 ? filmsItems : homeItems.filter((i) => i.type === 'films')).slice(0, 16);
      const topSeries = (seriesItems.length > 0 ? seriesItems : homeItems.filter((i) => i.type === 'series')).slice(0, 16);
      const recommendations = [...filmsItems.slice(0, 8), ...animItems.slice(0, 8)];
      const expectedList = homeItems.filter((i) => (i.year || 0) >= 2025);
      const expected = (expectedList.length > 0 ? expectedList : homeItems).slice(0, 16);
      const hero = topMovies[0] || popular[0] || topSeries[0];

      return {
        hero,
        popular,
        newReleases: newReleases.length > 0 ? newReleases : popular,
        topMovies: topMovies.length > 0 ? topMovies : popular,
        topSeries: topSeries.length > 0 ? topSeries : popular,
        recommendations: recommendations.length > 0 ? recommendations : popular,
        expected,
      };
    } catch {
      return null;
    }
  }

  private async getKinobaseCatalog(filter: CatalogFilter, origin?: string): Promise<SearchResult | null> {
    try {
      const base = origin || this.getKinobaseOrigin();
      const routeMap: Record<ContentType, string> = {
        films: '/films',
        series: '/serials',
        cartoons: '/animation',
        animation: '/animation',
        shows: '/tv',
      };
      const baseRoute = routeMap[filter.type] || '/films';
      const params = new URLSearchParams();
      if (filter.sort === 'popular' || filter.sort === 'rating') {
        params.set('sort', 'rating');
      }
      if (filter.page > 1) {
        params.set('page', String(filter.page));
      }
      const qs = params.toString();
      const targetUrl = `${base}${baseRoute}${qs ? `?${qs}` : ''}`;
      const page = await this.fetchKinobasePage(targetUrl);
      if (!page) return null;

      const items = this.parseKinobaseItems(page.html, filter.type, base);
      if (items.length === 0) return null;

      const hasMore = page.html.includes(`page=${filter.page + 1}`) || page.html.includes('pagination');
      return {
        items,
        page: filter.page,
        hasMore,
      };
    } catch {
      return null;
    }
  }

  private async searchKinobase(query: string, origin?: string): Promise<MediaItem[]> {
    const cleanQ = query.trim();
    if (!cleanQ) return [];
    const base = origin || this.getKinobaseOrigin();
    const page = await this.fetchKinobasePage(`${base}/search?query=${encodeURIComponent(cleanQ)}`, 4000);
    if (!page) return [];
    return this.parseKinobaseItems(page.html, 'films', base);
  }

  public parseKinobaseFileString(
    fileStr: string,
    preferredTranslatorId?: number
  ): {
    translators: Translator[];
    streamsByTranslator: Map<number, VideoQualityStream[]>;
    defaultStreams: VideoQualityStream[];
  } {
    const translators: Translator[] = [];
    const translatorIdsByName = new Map<string, number>();
    const streamsByTranslator = new Map<number, VideoQualityStream[]>();

    if (!fileStr || typeof fileStr !== 'string') {
      return { translators, streamsByTranslator, defaultStreams: [] };
    }

    const qualityBlocks = Array.from(fileStr.matchAll(/\[([^\]]+)\]([^[]*)/g));
    for (const block of qualityBlocks) {
      const quality = block[1].trim();
      const body = block[2].replace(/,\s*$/, '').trim();
      if (!quality || !body) continue;

      const variants = body.split(';').map((v) => v.trim()).filter(Boolean);
      for (const variant of variants) {
        const voiceMatch = variant.match(/^\{([^}]+)\}([\s\S]+)$/);
        const voiceName = voiceMatch ? voiceMatch[1].trim() : 'Оригинал / Дубляж';
        const urlsPart = voiceMatch ? voiceMatch[2].trim() : variant;
        const urls = urlsPart
          .split(/\s+or\s+/i)
          .map((u) => u.trim())
          .filter((u) => /^https?:\/\//i.test(u));
        if (urls.length === 0) continue;

        let trId = translatorIdsByName.get(voiceName);
        if (!trId) {
          trId = translators.length + 1;
          translatorIdsByName.set(voiceName, trId);
          translators.push({ id: trId, name: voiceName, premium: false });
        }

        const list = streamsByTranslator.get(trId) || [];
        if (!list.some((s) => s.quality === quality)) {
          list.push({ quality, hls: urls[0], mp4: urls[0] });
          streamsByTranslator.set(trId, list);
        }
      }
    }

    const qualityRank = (q: string) => parseInt(q.replace(/[^\d]/g, ''), 10) || 0;
    for (const [trId, list] of streamsByTranslator.entries()) {
      list.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
      streamsByTranslator.set(trId, list);
    }

    const selectedId =
      (preferredTranslatorId && streamsByTranslator.has(preferredTranslatorId)
        ? preferredTranslatorId
        : translators[0]?.id) || 0;
    const defaultStreams = (selectedId && streamsByTranslator.get(selectedId)) || [];

    return { translators, streamsByTranslator, defaultStreams };
  }

  private parseKinobaseSubtitles(rawSubtitle?: string): SubtitleTrack[] {
    if (!rawSubtitle || typeof rawSubtitle !== 'string') return [];
    const tracks: SubtitleTrack[] = [];
    for (const block of rawSubtitle.matchAll(/\[([^\]]+)\]([^[]*)/g)) {
      const language = block[1].trim();
      const urlsPart = block[2].replace(/,\s*$/, '').trim();
      const firstUrl = urlsPart
        .split(/\s+or\s+/i)
        .map((u) => u.trim())
        .find((u) => /^https?:\/\//i.test(u));
      if (language && firstUrl) {
        tracks.push({ language, url: firstUrl });
      }
    }
    return tracks;
  }

  private parseKinobaseSeriesAndTranslators(
    rawFile: any,
    rawSubtitle?: string
  ): {
    translators: Translator[];
    seasons?: Season[];
    getEpisodeStreams: (
      translatorId?: number,
      seasonId?: number,
      episodeId?: number,
      translatorName?: string,
      strictTranslatorMatch?: boolean
    ) => VideoQualityStream[];
    subtitles: SubtitleTrack[];
  } {
    const subtitles = this.parseKinobaseSubtitles(rawSubtitle);
    let parsed: any = rawFile;
    if (typeof rawFile === 'string') {
      const trimmed = rawFile.trim();
      if (trimmed.startsWith('[') && !/^\[\d+p/i.test(trimmed)) {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          parsed = rawFile;
        }
      }
    }

    if (typeof parsed === 'string') {
      const movieParsed = this.parseKinobaseFileString(parsed);
      return {
        translators: movieParsed.translators,
        seasons: undefined,
        subtitles,
        getEpisodeStreams: (
          translatorId?: number,
          _seasonId?: number,
          _episodeId?: number,
          translatorName?: string,
          strictTranslatorMatch?: boolean
        ) => {
          if (translatorName) {
            const byName = matchTranslatorByName(movieParsed.translators, translatorName);
            if (byName && movieParsed.streamsByTranslator.has(byName.id)) {
              return movieParsed.streamsByTranslator.get(byName.id)!;
            }
            if (strictTranslatorMatch) return [];
          }
          if (translatorId && movieParsed.streamsByTranslator.has(translatorId)) {
            return movieParsed.streamsByTranslator.get(translatorId)!;
          }
          return movieParsed.defaultStreams;
        },
      };
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return {
        translators: [],
        seasons: undefined,
        subtitles,
        getEpisodeStreams: () => [],
      };
    }

    const seasons: Season[] = [];
    const episodeFiles = new Map<string, string>();
    const hasSeasonFolders = parsed.some((s: any) => Array.isArray(s?.folder));

    if (hasSeasonFolders) {
      parsed.forEach((s: any, sIdx: number) => {
        const seasonTitle = s?.title || `Сезон ${sIdx + 1}`;
        const seasonNumMatch = String(seasonTitle).match(/\d+/);
        const seasonId = seasonNumMatch ? parseInt(seasonNumMatch[0], 10) : sIdx + 1;
        const episodes = Array.isArray(s?.folder)
          ? s.folder.map((ep: any, epIdx: number) => {
              const epTitle = ep?.title || `Серия ${epIdx + 1}`;
              const epId = epIdx + 1;
              if (ep?.file) episodeFiles.set(`${seasonId}_${epId}`, String(ep.file));
              return { id: epId, episodeId: epId, seasonId, title: epTitle };
            })
          : [];
        if (episodes.length > 0) {
          seasons.push({ id: seasonId, title: seasonTitle, episodes });
        }
      });
    } else {
      const episodes = parsed.map((ep: any, epIdx: number) => {
        const epId = epIdx + 1;
        const epTitle = ep?.title || `Серия ${epId}`;
        if (ep?.file) episodeFiles.set(`1_${epId}`, String(ep.file));
        return { id: epId, episodeId: epId, seasonId: 1, title: epTitle };
      });
      if (episodes.length > 0) {
        seasons.push({ id: 1, title: 'Сезон 1', episodes });
      }
    }

    const allEpisodeFiles = Array.from(episodeFiles.values());
    const sampleFile = allEpisodeFiles[0] || '';
    const unifiedTranslators: Translator[] = [];
    const translatorNameById = new Map<number, string>();
    const seenTrNames = new Set<string>();

    for (const epStr of allEpisodeFiles.slice(0, 5)) {
      const parsedEp = this.parseKinobaseFileString(epStr);
      for (const tr of parsedEp.translators) {
        const key = tr.name.toLowerCase();
        if (!seenTrNames.has(key)) {
          seenTrNames.add(key);
          const nextId = unifiedTranslators.length + 1;
          unifiedTranslators.push({ ...tr, id: nextId });
          translatorNameById.set(nextId, tr.name);
        }
      }
    }

    return {
      translators: unifiedTranslators,
      seasons: seasons.length > 0 ? seasons : undefined,
      subtitles,
      getEpisodeStreams: (
        translatorId?: number,
        seasonId?: number,
        episodeId?: number,
        translatorName?: string,
        strictTranslatorMatch?: boolean
      ) => {
        const targetKey = `${seasonId || seasons[0]?.id || 1}_${episodeId || 1}`;
        // If caller requested a specific season & episode and this mirror doesn't have it, return [] so sibling mirrors/Collaps can serve it
        const epFile =
          seasonId && episodeId && episodeFiles.size > 0
            ? episodeFiles.get(targetKey)
            : episodeFiles.get(targetKey) || sampleFile;
        if (!epFile) return [];
        const parsedEp = this.parseKinobaseFileString(epFile);
        const requestedName = translatorName || (translatorId ? translatorNameById.get(translatorId) : undefined);
        if (requestedName) {
          const matchedTr = matchTranslatorByName(parsedEp.translators, requestedName);
          if (matchedTr && parsedEp.streamsByTranslator.has(matchedTr.id)) {
            return parsedEp.streamsByTranslator.get(matchedTr.id)!;
          }
          if (strictTranslatorMatch) return [];
        }
        return this.parseKinobaseFileString(epFile, translatorId).defaultStreams;
      },
    };
  }

  private async extractKinobasePlayerData(
    filmUrl: string,
    preloadedHtml?: string,
    preloadedCookies?: string
  ): Promise<{
    file: any;
    subtitle?: string;
    trailerUrl?: string;
    balancerSrc?: string;
    kpId?: string;
  } | null> {
    const cached = this.kinobasePlayerCache.get(filmUrl);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      return cached;
    }

    let html = preloadedHtml || '';
    let cookies = preloadedCookies || '';
    if (!html) {
      const page = await this.fetchKinobasePage(filmUrl, 5000);
      if (!page) return null;
      html = page.html;
      cookies = page.cookies;
    }

    const trailerMatch = html.match(/MOVIE_TRAILER\s*=\s*["']([^"']+)["']/i);
    const trailerUrl = trailerMatch ? trailerMatch[1] : undefined;
    const kpMatch = html.match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i);
    const kpId = kpMatch ? kpMatch[1] : undefined;
    const $ = cheerio.load(html);
    const balancerSrc = $('#tab-options a[href="#online2"]').attr('data-balancer-src') || undefined;

    let file: any = null;
    let subtitle: string | undefined;

    try {
      const inlineVars = $('script')
        .map((_, el) => $(el).html() || '')
        .get()
        .find((s) => s.includes('MOVIE_URL'));
      const hsPathMatch = html.match(/\/static\/js\/hs\.js\?v=\d+/);
      const parsedUrl = new URL(filmUrl);
      const siteOrigin = parsedUrl.origin;
      const siteHost = parsedUrl.hostname;
      if (inlineVars && hsPathMatch) {
        const hsRes = await appFetch(`${siteOrigin}${hsPathMatch[0]}`, {
          headers: {
            'User-Agent': BROWSER_USER_AGENT,
            'Referer': filmUrl,
            ...(cookies ? { Cookie: cookies } : {}),
          },
          signal: AbortSignal.timeout(4500),
        });
        if (hsRes.ok) {
          const hsCode = await hsRes.text();
          const vmMod = (process as any).getBuiltinModule?.('vm') || (0, eval)('require')('vm');
          let readyFn: (() => void) | null = null;
          const ajaxCalls: any[] = [];
          const fakeEl: any = new Proxy(
            {
              ready: (fn: () => void) => {
                readyFn = fn;
                return fakeEl;
              },
              width: () => 800,
              height: () => 450,
            },
            { get: (t: Record<string | symbol, any>, p) => (p in t ? t[p] : () => fakeEl) }
          );
          const fakeJq: any = (sel: any) => {
            if (typeof sel === 'function') {
              readyFn = sel;
              return fakeEl;
            }
            return fakeEl;
          };
          fakeJq.fn = { jquery: '3.0.0', rating: () => {} };
          fakeJq.extend = Object.assign;
          fakeJq.ajax = (opts: any) => {
            ajaxCalls.push(opts);
          };
          fakeJq.get = () => ({ done: () => {}, fail: () => {}, always: () => {} });
          fakeJq.post = () => ({ done: () => {}, fail: () => {}, always: () => {} });

          let playerConfig: any = null;
          const sandbox: any = {
            document: {
              cookie: cookies,
              getElementsByTagName: () => [{ innerHTML: siteHost, href: siteOrigin }],
              querySelectorAll: () => [{ innerHTML: siteHost, href: siteOrigin }],
              getElementById: () => null,
              querySelector: () => null,
            },
            location: { hostname: siteHost, href: filmUrl, pathname: parsedUrl.pathname },
            screen: { width: 1920, height: 1080 },
            localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
            navigator: { userAgent: BROWSER_USER_AGENT },
            $: fakeJq,
            jQuery: fakeJq,
            Playerjs: function (cfg: any) {
              playerConfig = cfg;
            },
            Uppod: function (cfg: any) {
              playerConfig = cfg;
            },
            atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
            btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
            setTimeout: () => {},
            Image: function () {},
            PLAYER_TYPE: 'new',
            FILE_TYPE: 'hls',
            ENABLE_HDR: '0',
            CURRENT_USER_ID: 0,
          };
          vmMod.createContext(sandbox);
          vmMod.runInContext('window = globalThis; global = globalThis;', sandbox);
          vmMod.runInContext(inlineVars, sandbox);
          vmMod.runInContext(hsCode, sandbox);
          if (readyFn) (readyFn as () => void)();

          if (ajaxCalls[0]?.url) {
            const u1 =
              siteOrigin +
              ajaxCalls[0].url +
              '?' +
              new URLSearchParams(ajaxCalls[0].data || {}).toString();
            const r1 = await appFetch(u1, {
              headers: {
                'User-Agent': BROWSER_USER_AGENT,
                'Referer': filmUrl,
                ...(cookies ? { Cookie: cookies } : {}),
              },
              signal: AbortSignal.timeout(4000),
            });
            if (r1.ok) {
              ajaxCalls[0].success?.(await r1.text());
              if (ajaxCalls[1]?.url) {
                const u2 =
                  siteOrigin +
                  ajaxCalls[1].url +
                  '?' +
                  new URLSearchParams(ajaxCalls[1].data || {}).toString();
                const r2 = await appFetch(u2, {
                  headers: {
                    'User-Agent': BROWSER_USER_AGENT,
                    'Referer': filmUrl,
                    ...(cookies ? { Cookie: cookies } : {}),
                  },
                  signal: AbortSignal.timeout(4000),
                });
                if (r2.ok) {
                  ajaxCalls[1].success?.(await r2.text());
                }
              }
            }
          }

          if (playerConfig?.file) {
            file = playerConfig.file;
            subtitle = playerConfig.subtitle;
          }
        }
      }
    } catch (_) {}

    const entry = {
      ts: Date.now(),
      file,
      subtitle,
      trailerUrl,
      balancerSrc,
      kpId,
    };
    this.kinobasePlayerCache.set(filmUrl, entry);
    return entry;
  }

  private async fetchHlsMasterStreams(
    masterUrl: string,
    headers: Record<string, string>,
    fallbackHint?: string
  ): Promise<VideoQualityStream[]> {
    try {
      const m3u8Res = await appFetch(masterUrl, {
        headers,
        signal: AbortSignal.timeout(3000),
      });
      if (m3u8Res.ok) {
        const playlistText = await m3u8Res.text();
        const effectiveUrl = m3u8Res.url || masterUrl;
        const parsed = parseHlsMasterVariants(playlistText, effectiveUrl);
        if (parsed.length > 0) return parsed;
      }
    } catch {}

    const hintUpper = String(fallbackHint || '').toUpperCase();
    const inferredLabel =
      hintUpper.includes('2160') || hintUpper.includes('4K')
        ? '2160p'
        : hintUpper.includes('1080') || hintUpper.includes('BDRIP') || hintUpper.includes('BLURAY')
          ? '1080p'
          : hintUpper.includes('720') || hintUpper.includes('HDRIP')
            ? '720p'
            : hintUpper.includes('480')
              ? '480p'
              : '720p';

    return [{ quality: inferredLabel, hls: masterUrl, mp4: masterUrl }];
  }

  private async extractBalancerStream(
    balancerSrc: string,
    episode?: number,
    season?: number,
    translatorName?: string,
    strictTranslatorMatch?: boolean
  ): Promise<StreamData | null> {
    try {
      const movieId = new URL(balancerSrc).searchParams.get('movie_id');
      if (!movieId) return null;
      const br = await appFetch(balancerSrc, {
        headers: { 'User-Agent': BROWSER_USER_AGENT, 'Referer': 'https://kinobase.org/' },
        signal: AbortSignal.timeout(4500),
      });
      if (!br.ok) return null;
      const bh = await br.text();
      const hdrMatch = bh.match(/window\.REQUEST_HEADERS\s*=\s*(\{[^}]+\})/);
      const baseMatch = bh.match(/window\.ENV_BASE_URL\s*=\s*'([^']+)'/);
      if (!hdrMatch || !baseMatch) return null;

      const reqHeaders = JSON.parse(hdrMatch[1].replace(/'/g, '"'));
      const baseUrl = baseMatch[1];
      const apiHeaders = {
        ...reqHeaders,
        'X-Has-Token': 'true',
        'X-Parent-Referrer': 'https://kinobase.org/',
        'User-Agent': BROWSER_USER_AGENT,
        'Referer': balancerSrc,
      };
      const er = await appFetch(`${baseUrl}/catalog-api/episodes?content-id=${movieId}`, {
        headers: apiHeaders,
        signal: AbortSignal.timeout(4500),
      });
      if (!er.ok) return null;
      const eJson: any[] = await er.json();
      if (!Array.isArray(eJson) || eJson.length === 0) return null;

      const hasSeasonNumbers = eJson.some((item) => Number(item?.seasonNumber ?? item?.season) > 0);
      let targetEp =
        season && episode
          ? eJson.find(
              (item) =>
                Number(item?.seasonNumber ?? item?.season) === season &&
                Number(item?.episodeNumber ?? item?.episode ?? item?.order) === episode
            )
          : undefined;
      if (!targetEp) {
        // Never silently fall back to S1E1 when a specific season/episode is absent from this balancer
        if (season && episode && hasSeasonNumbers) return null;
        const epIdx = episode && episode > 0 && eJson[episode - 1] ? episode - 1 : 0;
        targetEp = eJson[epIdx];
      }
      const variants: any[] = Array.isArray(targetEp?.episodeVariants) ? targetEp.episodeVariants : [];
      const nonCamVariants = variants.filter(
        (v) =>
          v?.filepath &&
          !isCamRipText(String(v.streamQuality || '')) &&
          !isCamRipText(String(v.title || ''))
      );
      let pool = nonCamVariants.length > 0 ? nonCamVariants : variants.filter((v) => v?.filepath);
      if (strictTranslatorMatch && translatorName) {
        const indexedVariants = pool.map((v, idx) => ({ id: idx + 1, name: String(v?.title || '') }));
        const matched = matchTranslatorByName(indexedVariants, translatorName);
        if (!matched) return null;
        pool = pool.filter((_, idx) => {
          const m = matchTranslatorByName([{ id: 1, name: String(pool[idx]?.title || '') }], translatorName);
          return Boolean(m);
        });
        if (pool.length === 0) return null;
      }
      const qRank = (q?: string) => {
        const up = String(q || '').toUpperCase();
        if (up.includes('2160') || up.includes('4K') || up.includes('UHD')) return 5;
        if (up.includes('BDRIP') || up.includes('BLURAY') || up.includes('1080')) return 4;
        if (up.includes('WEB')) return 3;
        if (up.includes('HDRIP')) return 2;
        return 1;
      };
      const normTr = translatorName ? translatorName.toLowerCase().trim() : '';
      pool.sort((a, b) => {
        if (Boolean(a.hasAdv) !== Boolean(b.hasAdv)) return a.hasAdv ? 1 : -1;
        const qrDiff = qRank(b.streamQuality) - qRank(a.streamQuality);
        if (qrDiff !== 0) return qrDiff;
        if (normTr) {
          const aMatch = String(a.title || '').toLowerCase().includes(normTr) ? 1 : 0;
          const bMatch = String(b.title || '').toLowerCase().includes(normTr) ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
        }
        return 0;
      });
      const filepath = pool[0]?.filepath;
      if (!filepath) return null;

      let finalM3u8 = filepath;
      let streams: VideoQualityStream[] = [];
      try {
        const mr = await appFetch(filepath, {
          headers: { 'User-Agent': BROWSER_USER_AGENT, 'Referer': balancerSrc },
          signal: AbortSignal.timeout(4500),
        });
        if (mr.ok) {
          finalM3u8 = mr.url || filepath;
          const playlistText = await mr.text();
          streams = parseHlsMasterVariants(playlistText, finalM3u8);
        }
      } catch (_) {}

      if (streams.length === 0) {
        streams = await this.fetchHlsMasterStreams(
          finalM3u8,
          { 'User-Agent': BROWSER_USER_AGENT, 'Referer': balancerSrc },
          String(pool[0]?.streamQuality || '')
        );
      }

      return {
        streams,
        subtitles: [],
        isAlternative: true,
        sourceName: 'Kinobase Balancer',
      };
    } catch {
      return null;
    }
  }

  private async resolveKinobaseUrl(urlOrId: string, meta?: Partial<MediaItem>): Promise<string | null> {
    const normId = urlOrId.split('/').pop()?.split('-')[0] || urlOrId;
    const candidates = [urlOrId, meta?.url, this.mediaUrlCache.get(normId)];
    const defaultOrigin = this.getKinobaseOrigin();
    for (const c of candidates) {
      if (c && this.isKinobase(c)) {
        return c.startsWith('http') ? c : `${defaultOrigin}${c.startsWith('/') ? '' : '/'}${c}`;
      }
    }

    const query = cleanTitleForSearch(meta?.title || meta?.origTitle || '');
    if (!query) return null;

    const primaryOrigin = defaultOrigin;
    const backupOrigin = primaryOrigin.includes('kinovod.pro') ? 'https://kinobase.org' : 'https://kinovod.pro';
    let results = await this.searchKinobase(query, primaryOrigin);
    let matched = pickBestMirrorMatch(results, meta);
    if (!matched) {
      results = await this.searchKinobase(query, backupOrigin);
      matched = pickBestMirrorMatch(results, meta);
    }
    return matched ? matched.url : null;
  }

  private async getKinobaseDetails(urlOrId: string, meta?: Partial<MediaItem>): Promise<MediaDetails | null> {
    try {
      const filmUrl = await this.resolveKinobaseUrl(urlOrId, meta);
      if (!filmUrl) return null;

      const page = await this.fetchKinobasePage(filmUrl, 5000);
      if (!page) return null;

      const siteOrigin = this.getKinobaseOrigin(filmUrl);
      const $ = cheerio.load(page.html);
      let ld: any = {};
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const parsed = JSON.parse($(el).html() || '{}');
          if (parsed && (parsed.name || parsed.description)) ld = parsed;
        } catch {}
      });

      const idMatch = filmUrl.match(/\/(?:film|serial)\/(\d+)/);
      const id = idMatch ? idMatch[1] : meta?.id || urlOrId;
      this.mediaUrlCache.set(id, filmUrl);

      const title = $('#title h1').first().text().trim() || ld.name || meta?.title || '';
      if (!title) return null;

      let poster = $('#media .poster img').first().attr('src') || ld.image || meta?.poster || '';
      if (poster && !poster.startsWith('http')) {
        poster = `${siteOrigin}${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      let origTitle = meta?.origTitle || '';
      let country = meta?.country || '';
      let ageRating = '';
      let duration = '';
      const genres: string[] = Array.isArray(ld.genre) ? ld.genre : [];
      let year = ld.datePublished ? parseInt(String(ld.datePublished).slice(0, 4), 10) : (meta?.year || 0);

      $('#info .info_item').each((_, el) => {
        const key = $(el).find('.key').text().trim();
        const val = $(el).find('.value').text().trim();
        if (key.includes('Название')) origTitle = val;
        else if (key.includes('Страна')) country = val;
        else if (key.includes('Возраст')) ageRating = val;
        else if (key.includes('Время') || key.includes('Длительность')) duration = val;
        else if (key.includes('Год') && !year) {
          const ym = val.match(/\b(19\d{2}|20\d{2})\b/);
          if (ym) year = parseInt(ym[1], 10);
        }
      });

      const ratingRezka = parseFloat($('#rating_votes .rating_site').parent().text().replace(/[^\d.]/g, '')) || ld.aggregateRating?.ratingValue || meta?.rating;
      const ratingKp = parseFloat($('#rating_votes .rating_kp').parent().text().replace(/[^\d.]/g, '')) || undefined;
      const ratingImdb = parseFloat($('#rating_votes .rating_imdb').parent().text().replace(/[^\d.]/g, '')) || undefined;
      const description = ld.description || $('.description, [itemprop="description"]').text().trim() || '';
      const directors = Array.isArray(ld.director) ? ld.director.map((d: any) => d?.name).filter(Boolean) : [];
      const actors = Array.isArray(ld.actor) ? ld.actor.map((a: any) => a?.name).filter(Boolean) : [];

      let type: ContentType = meta?.type || 'films';
      if (filmUrl.includes('/serial/') || page.html.includes('MOVIE_TYPE = "serials"')) type = 'series';
      else if (page.html.includes('MOVIE_TYPE = "animation"')) type = 'animation';

      const playerData = await this.extractKinobasePlayerData(filmUrl, page.html, page.cookies);
      if (playerData?.kpId) {
        this.kpIdCache.set(id, playerData.kpId);
        this.kpIdCache.set(filmUrl, playerData.kpId);
      }
      const parsedMedia = playerData?.file
        ? this.parseKinobaseSeriesAndTranslators(playerData.file, playerData.subtitle)
        : { translators: [], seasons: undefined };

      const isSeriesLike = type === 'series' || type === 'animation' || Boolean(parsedMedia.seasons?.length);

      // Enrich seasons, voiceovers & viewer comments from Kinogo + Collaps/HDStudio + Kinopoisk + critics in parallel
      const [kinogoEnrichRes, collapsEnrichRes, criticReviewsRes, kpReviewsRes] = await Promise.allSettled([
        (async () => {
          const gUrl = await this.resolveKinogoUrl('', { title, origTitle, year, type });
          if (!gUrl) return null;
          const gHtml = await this.fetchKinogoPage(gUrl, 3000);
          if (!gHtml) return null;
          const [tree, comments] = await Promise.all([
            this.extractKinogoPlayerTree(gUrl, gHtml),
            Promise.resolve(this.parseKinogoComments(gHtml)),
          ]);
          return { translators: tree?.translators || [], seasons: tree?.seasons, comments };
        })(),
        (isSeriesLike || !playerData?.file) && playerData?.kpId
          ? this.fetchCollapsPlayerData(playerData.kpId)
          : Promise.resolve(null),
        this.fetchCriticReviews(title, year, { ratingRezka, ratingImdb, ratingKp, genres, directors }),
        this.fetchKinopoiskReviews(title, year, origTitle, playerData?.kpId || page.html),
      ]);

      const kinogoEnrich = kinogoEnrichRes.status === 'fulfilled' ? kinogoEnrichRes.value : null;
      const collapsEnrich = collapsEnrichRes.status === 'fulfilled' ? collapsEnrichRes.value : null;
      const criticReviews = criticReviewsRes.status === 'fulfilled' ? criticReviewsRes.value : [];
      const kpReviews = kpReviewsRes.status === 'fulfilled' ? kpReviewsRes.value : [];

      const baseTranslators: Translator[] = this.filterCamRipTranslators(
        parsedMedia.translators.length > 0
          ? parsedMedia.translators
          : [{ id: 1, name: 'Дубляж / Оригинал', premium: false }]
      );
      let translators = kinogoEnrich?.translators?.length
        ? this.mergeCrossMirrorTranslators(baseTranslators, kinogoEnrich.translators, 1000)
        : baseTranslators;
      if (collapsEnrich?.translators?.length) {
        translators = this.mergeCrossMirrorTranslators(translators, collapsEnrich.translators, 3000);
      }

      const mergedSeasons = isSeriesLike
        ? mergeSeasons(parsedMedia.seasons, kinogoEnrich?.seasons, collapsEnrich?.seasons)
        : parsedMedia.seasons;

      const reviews: MediaReview[] = [
        ...kpReviews,
        ...criticReviews,
        ...(kinogoEnrich?.comments || []),
      ];

      return {
        id,
        title,
        origTitle,
        poster,
        backdrop: poster,
        year,
        country,
        genres,
        type,
        duration,
        ageRating,
        ratingRezka: ratingRezka && !isNaN(ratingRezka) ? ratingRezka : undefined,
        ratingImdb: ratingImdb && !isNaN(ratingImdb) ? ratingImdb : undefined,
        ratingKp: ratingKp && !isNaN(ratingKp) ? ratingKp : undefined,
        description,
        directors,
        actors,
        translators,
        currentTranslatorId: translators[0]?.id ?? 1,
        seasons: mergedSeasons && mergedSeasons.length > 0 ? mergedSeasons : parsedMedia.seasons,
        similar: [],
        reviews,
        url: filmUrl,
        antiBot: false,
      };
    } catch {
      return null;
    }
  }

  public async fetchCollapsPlayerData(kpIdOrEmbedUrl: string): Promise<CollapsParsedData | null> {
    if (!kpIdOrEmbedUrl) return null;
    const raw = kpIdOrEmbedUrl.trim();
    const kpMatch = raw.match(/\/embed\/kp\/(\d+)/i) || raw.match(/^(\d{3,10})$/);
    const kpId = kpMatch?.[1];
    const cacheKey = kpId ? `kp:${kpId}` : raw.split('?')[0];

    const cached = this.collapsPlayerCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      return cached.data;
    }

    // Strip geoBlock query parameters so no seasons are geo-restricted
    const urlsToTry: string[] = [];
    if (raw.startsWith('http')) {
      urlsToTry.push(raw.split('?')[0]);
    }
    if (kpId) {
      for (const ep of [
        `https://apiplayers.insertunit.ws/embed/kp/${kpId}`,
        `https://api.delivembed.cc/embed/kp/${kpId}`,
      ]) {
        if (!urlsToTry.includes(ep)) urlsToTry.push(ep);
      }
    }

    for (const embedUrl of urlsToTry) {
      try {
        const res = await appFetch(embedUrl, {
          headers: {
            'User-Agent': BROWSER_USER_AGENT,
            'Referer': 'http://hdstudio.org/',
            'Accept-Language': 'ru-RU,ru;q=0.9',
          },
          signal: AbortSignal.timeout(4500),
        });
        if (!res.ok) continue;
        const html = await res.text();
        if (!html || this.isAntiBot(html)) continue;
        const parsed = parseCollapsEmbedHtml(html);
        if (parsed) {
          this.collapsPlayerCache.set(cacheKey, { ts: Date.now(), data: parsed });
          return parsed;
        }
      } catch {}
    }

    this.collapsPlayerCache.set(cacheKey, { ts: Date.now(), data: null });
    return null;
  }

  private async getCollapsStream(
    kpIdOrEmbedUrl: string,
    params: {
      season?: number;
      episode?: number;
      translatorName?: string;
      translatorId?: number;
      strictTranslatorMatch?: boolean;
    }
  ): Promise<StreamData | null> {
    try {
      const parsed = await this.fetchCollapsPlayerData(kpIdOrEmbedUrl);
      if (!parsed) return null;
      const normTrId =
        params.translatorId !== undefined && params.translatorId >= 3000
          ? params.translatorId - 3000
          : params.translatorId;
      const epData = parsed.getEpisodeData(params.season, params.episode, params.translatorName, normTrId);
      if (!epData?.hls) return null;
      if (params.strictTranslatorMatch && params.translatorName && !epData.audioTrackMatched) {
        return null;
      }

      const streams = await this.fetchHlsMasterStreams(epData.hls, {
        'User-Agent': BROWSER_USER_AGENT,
        'Referer': 'https://apiplayers.insertunit.ws/',
      });
      if (streams.length === 0) return null;

      return {
        streams,
        subtitles: epData.subtitles,
        isAlternative: true,
        sourceName: 'HDStudio / Collaps',
        audioTrackIndex: epData.audioTrackIndex,
      };
    } catch {
      return null;
    }
  }

  private async fetchHdStudioPage(url: string, timeoutMs = 5000): Promise<string | null> {
    try {
      const res = await appFetch(url, {
        headers: { 'User-Agent': BROWSER_USER_AGENT, 'Referer': 'http://hdstudio.org/' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const html = await res.text();
      if (!html || this.isAntiBot(html)) return null;
      return html;
    } catch {
      return null;
    }
  }

  public parseHdStudioItems(html: string): MediaItem[] {
    if (!html) return [];
    const $ = cheerio.load(html);
    const items: MediaItem[] = [];
    const seen = new Set<string>();

    $('.item-box').each((_, el) => {
      const a = $(el).find('a[href]').first();
      const href = a.attr('href') || '';
      if (!href || !/\/(?:serial|film)\//.test(href)) return;
      const fullUrl = href.startsWith('http')
        ? href
        : `http://hdstudio.org${href.startsWith('/') ? '' : '/'}${href}`;
      const idMatch = fullUrl.match(/\/(\d+-\d+-\d+-\d+)(?:$|[/?#])/);
      const id = idMatch ? `hdstudio-${idMatch[1]}` : `hdstudio-${fullUrl}`;
      if (seen.has(id)) return;
      seen.add(id);

      const title =
        $(el).find('.title').first().text().trim() ||
        $(el).find('img').first().attr('alt')?.trim() ||
        '';
      if (!title) return;

      const img = $(el).find('img').first();
      let poster = img.attr('data-src') || img.attr('src') || '';
      if (poster.startsWith('//')) poster = `http:${poster}`;
      else if (poster && !poster.startsWith('http')) {
        poster = `http://hdstudio.org${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      const imdbText = $(el).find('.mshort-imdb').first().text().trim();
      const rateText = $(el).find('.poster-rate span').first().text().trim();
      const ratingRaw = parseFloat((imdbText || rateText).replace(',', '.'));
      const rating = !Number.isNaN(ratingRaw) && ratingRaw > 0 && ratingRaw <= 10 ? ratingRaw : undefined;
      const epUpdate = $(el).find('.episodes-update').first().text().trim();
      const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
      const type: ContentType = fullUrl.includes('/film/') ? 'films' : 'series';

      const item: MediaItem = {
        id,
        title: title.replace(/\s*\(\d{4}\)\s*$/, '').trim(),
        url: fullUrl,
        poster,
        year,
        type,
        rating,
        info: epUpdate ? `HDStudio • ${epUpdate}` : 'HDStudio',
      };
      this.mediaCache.set(fullUrl, item);
      this.mediaCache.set(id, item);
      this.mediaUrlCache.set(id, fullUrl);
      items.push(item);
    });

    return this.filterNonCamRipItems(items);
  }

  private async searchHdStudio(query: string): Promise<MediaItem[]> {
    const cleanQ = query.trim();
    if (!cleanQ) return [];
    const html = await this.fetchHdStudioPage(
      `http://hdstudio.org/?do=search&subaction=search&story=${encodeURIComponent(cleanQ)}`,
      4000
    );
    return html ? this.parseHdStudioItems(html) : [];
  }

  private async getHdStudioHomeSections() {
    try {
      const [homeHtml, new2026Html, dubHtml] = await Promise.all([
        this.fetchHdStudioPage('http://hdstudio.org/'),
        this.fetchHdStudioPage('http://hdstudio.org/serialy-2026/'),
        this.fetchHdStudioPage('http://hdstudio.org/dubljazh/'),
      ]);
      const homeItems = homeHtml ? this.parseHdStudioItems(homeHtml) : [];
      const newItems = new2026Html ? this.parseHdStudioItems(new2026Html) : [];
      const dubItems = dubHtml ? this.parseHdStudioItems(dubHtml) : [];
      if (homeItems.length === 0 && newItems.length === 0) return null;

      const popular = (homeItems.length > 0 ? homeItems : newItems).slice(0, 16);
      const topSeries = (dubItems.length > 0 ? dubItems : popular).slice(0, 16);
      const newReleases = (newItems.length > 0 ? newItems : popular).slice(0, 16);
      const hero = popular[0] || newReleases[0];
      return {
        hero,
        popular,
        newReleases,
        topMovies: popular,
        topSeries,
        recommendations: topSeries,
        expected: newReleases,
      };
    } catch {
      return null;
    }
  }

  private async getHdStudioCatalog(filter: CatalogFilter): Promise<SearchResult | null> {
    try {
      const basePath = filter.sort === 'popular' || filter.sort === 'rating' ? '/dubljazh/' : '/';
      const pageUrl =
        filter.page > 1
          ? `http://hdstudio.org${basePath}page/${filter.page}/`
          : `http://hdstudio.org${basePath}`;
      const html = await this.fetchHdStudioPage(pageUrl);
      if (!html) return null;
      const items = this.parseHdStudioItems(html);
      if (items.length === 0) return null;
      return {
        items,
        page: filter.page,
        hasMore: html.includes(`/page/${filter.page + 1}/`),
      };
    } catch {
      return null;
    }
  }

  private async resolveHdStudioUrl(urlOrId: string, meta?: Partial<MediaItem>): Promise<string | null> {
    for (const c of [urlOrId, meta?.url, this.mediaUrlCache.get(urlOrId)]) {
      if (c && this.isHdStudio(c)) {
        return c.startsWith('http') ? c : `http://hdstudio.org${c.startsWith('/') ? '' : '/'}${c}`;
      }
    }
    const query = cleanTitleForSearch(meta?.title || meta?.origTitle || '');
    if (!query) return null;
    const results = await this.searchHdStudio(query);
    const matched = pickBestMirrorMatch(results, meta);
    return matched ? matched.url : null;
  }

  private async getHdStudioDetails(urlOrId: string, meta?: Partial<MediaItem>): Promise<MediaDetails | null> {
    try {
      const filmUrl = await this.resolveHdStudioUrl(urlOrId, meta);
      if (!filmUrl) return null;
      const html = await this.fetchHdStudioPage(filmUrl, 5000);
      if (!html) return null;

      const $ = cheerio.load(html);
      const idMatch = filmUrl.match(/\/(\d+-\d+-\d+-\d+)(?:$|[/?#])/);
      const id = idMatch ? `hdstudio-${idMatch[1]}` : meta?.id || urlOrId;
      this.mediaUrlCache.set(id, filmUrl);

      const title = $('h1').first().text().trim() || meta?.title || '';
      if (!title) return null;

      let poster =
        $('meta[property="og:image"]').attr('content') ||
        $('.reliz_left img, .poster img').first().attr('src') ||
        meta?.poster ||
        '';
      if (poster && !poster.startsWith('http')) {
        poster = `http://hdstudio.org${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      let origTitle = meta?.origTitle || '';
      let country = meta?.country || '';
      let year = meta?.year || 0;
      const genres: string[] = [];
      const directors: string[] = [];
      let actors: string[] = [];

      $('.pgs-sinfo_list').each((_, el) => {
        const txt = $(el).text().replace(/\s+/g, ' ').trim();
        if (txt.startsWith('Жанр:')) {
          txt
            .replace(/^Жанр:/, '')
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean)
            .forEach((g) => genres.push(g));
        } else if (txt.startsWith('Дата выхода:')) {
          const ym = txt.match(/\b(19\d{2}|20\d{2})\b/);
          if (ym) year = parseInt(ym[1], 10);
        } else if (txt.startsWith('Оригинал:')) {
          origTitle = txt.replace(/^Оригинал:/, '').trim();
        } else if (txt.startsWith('Страна:')) {
          country = txt.replace(/^Страна:/, '').trim();
        } else if (txt.startsWith('Режиссер:')) {
          txt
            .replace(/^Режиссер:/, '')
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean)
            .forEach((d) => directors.push(d));
        } else if (txt.startsWith('В ролях:')) {
          actors = txt
            .replace(/^В ролях:/, '')
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean);
        }
      });

      const description =
        $('[itemprop="description"], .reliz_text, .full-text').first().text().trim() ||
        $('meta[property="og:description"]').attr('content')?.trim() ||
        '';

      const imdbMatch = html.match(/mshort-imdb[^>]*>([\d.]+)</i) || html.match(/IMDb[^0-9]{0,12}(\d\.\d)/i);
      const ratingImdb = imdbMatch ? parseFloat(imdbMatch[1]) : meta?.rating;

      // Extract Collaps / InsertUnit embed iframe URL (strip geoBlock so all seasons unlock)
      let embedUrl = '';
      $('iframe').each((_, el) => {
        if (embedUrl) return;
        const src = $(el).attr('data-src') || $(el).attr('src') || '';
        if (src.includes('insertunit.') || src.includes('delivembed.') || src.includes('/embed/kp/')) {
          embedUrl = src.startsWith('//') ? `https:${src}` : src;
        }
      });
      if (!embedUrl) {
        const em = html.match(/https?:\/\/[^"'\s]+(?:insertunit|delivembed)[^"'\s]+\/embed\/kp\/\d+/i);
        if (em) embedUrl = em[0];
      }
      const kpMatch = embedUrl.match(/\/embed\/kp\/(\d+)/i) || html.match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i);
      const kpId = kpMatch?.[1];
      if (kpId) {
        this.kpIdCache.set(id, kpId);
        this.kpIdCache.set(filmUrl, kpId);
      }

      const inferredType: ContentType = filmUrl.includes('/serial/') ? 'series' : meta?.type || 'films';
      const [collapsRes, kinogoEnrichRes, criticReviewsRes, kpReviewsRes] = await Promise.allSettled([
        embedUrl || kpId ? this.fetchCollapsPlayerData(embedUrl || kpId!) : Promise.resolve(null),
        (async () => {
          const gUrl = await this.resolveKinogoUrl('', { title, origTitle, year, type: inferredType });
          if (!gUrl) return null;
          const gHtml = await this.fetchKinogoPage(gUrl, 3000);
          if (!gHtml) return null;
          const [tree, comments] = await Promise.all([
            this.extractKinogoPlayerTree(gUrl, gHtml),
            Promise.resolve(this.parseKinogoComments(gHtml)),
          ]);
          return { translators: tree?.translators || [], seasons: tree?.seasons, comments };
        })(),
        this.fetchCriticReviews(title, year, { ratingImdb, genres, directors }),
        this.fetchKinopoiskReviews(title, year, origTitle, kpId || html),
      ]);

      const collaps = collapsRes.status === 'fulfilled' ? collapsRes.value : null;
      const kinogoEnrich = kinogoEnrichRes.status === 'fulfilled' ? kinogoEnrichRes.value : null;
      const criticReviews = criticReviewsRes.status === 'fulfilled' ? criticReviewsRes.value : [];
      const kpReviews = kpReviewsRes.status === 'fulfilled' ? kpReviewsRes.value : [];

      const baseTranslators: Translator[] =
        collaps?.translators && collaps.translators.length > 0
          ? collaps.translators.map((t) => ({ ...t, id: 3000 + t.id }))
          : [{ id: 3001, name: 'Дубляж / Оригинал', premium: false }];
      const translators = kinogoEnrich?.translators?.length
        ? this.mergeCrossMirrorTranslators(baseTranslators, kinogoEnrich.translators, 1000)
        : baseTranslators;

      const seasons = mergeSeasons(collaps?.seasons, kinogoEnrich?.seasons);
      const type: ContentType =
        seasons.length > 0 || filmUrl.includes('/serial/') ? 'series' : meta?.type || 'films';

      return {
        id,
        title,
        origTitle,
        poster,
        backdrop: poster,
        year,
        country,
        genres,
        type,
        ratingRezka: ratingImdb,
        ratingImdb,
        description,
        directors,
        actors,
        translators,
        currentTranslatorId: translators[0]?.id ?? 3001,
        seasons: seasons.length > 0 ? seasons : undefined,
        similar: [],
        reviews: [...kpReviews, ...criticReviews, ...(kinogoEnrich?.comments || [])],
        url: filmUrl,
        antiBot: false,
      };
    } catch {
      return null;
    }
  }

  private decodeCinemarFile(raw: string): any {
    if (!raw || typeof raw !== 'string') return null;
    const body = raw.startsWith('#2') ? raw.slice(2) : raw;
    try {
      return JSON.parse(body);
    } catch {}

    const tryBase64Json = (b64Input: string): any => {
      const cleaned = b64Input.trim();
      const pad = cleaned.length % 4;
      const padded = pad ? cleaned + '='.repeat(4 - pad) : cleaned;
      const utf8 = Buffer.from(padded, 'base64').toString('utf8');
      try {
        return JSON.parse(utf8);
      } catch {
        const bin = Buffer.from(padded, 'base64').toString('binary');
        return JSON.parse(decodeURIComponent(escape(bin)));
      }
    };

    const dm = parseInt(body.slice(0, 2), 10);
    if (!Number.isNaN(dm) && dm >= 32 && dm <= 126) {
      const sep = String.fromCharCode(dm);
      const unscrambled = body
        .slice(2)
        .split(sep)
        .map((part) => {
          const e = parseInt(part.slice(-1), 10);
          return part.length > 32 && !Number.isNaN(e)
            ? part.slice(2 * e, part.length - e - 1) + part.slice(0, e)
            : part;
        })
        .join('');
      try {
        return tryBase64Json(unscrambled);
      } catch {}
    }

    try {
      return tryBase64Json(body);
    } catch {
      return null;
    }
  }

  private async fetchKinogoPage(url: string, timeoutMs = 5000): Promise<string | null> {
    try {
      const base = this.getKinogoBaseUrl();
      const res = await appFetch(url, {
        headers: { 'User-Agent': BROWSER_USER_AGENT, 'Referer': `${base}/` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const html = await res.text();
      if (!html || this.isAntiBot(html)) return null;
      return html;
    } catch {
      return null;
    }
  }

  private parseKinogoItems(html: string, defaultType: ContentType = 'films'): MediaItem[] {
    const base = this.getKinogoBaseUrl();
    const $ = cheerio.load(html);
    const items: MediaItem[] = [];
    const seen = new Set<string>();

    $('.shortStory').each((_, el) => {
      const linkEl = $(el).find('.hTitle h2 a, .hTitle a').first();
      const href = linkEl.attr('href') || '';
      const rawTitle = (linkEl.attr('title') || linkEl.text() || '').trim();
      if (!href || !rawTitle || !/\/\d+-/.test(href)) return;

      const idMatch = href.match(/\/(\d+)-/);
      const id = idMatch ? idMatch[1] : href;
      if (seen.has(id)) return;
      seen.add(id);

      const fullUrl = href.startsWith('http') ? href : `${base}${href.startsWith('/') ? '' : '/'}${href}`;
      const img = $(el).find('.sPoster img').first();
      let poster = img.attr('data-src') || img.attr('src') || '';
      if (poster.startsWith('data:')) poster = img.attr('data-src') || '';
      if (poster && !poster.startsWith('http')) {
        poster = `${base}${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      const yearMatch =
        rawTitle.match(/\b(19\d{2}|20\d{2})\b/) ||
        $(el).find('.sInfo').text().match(/Год выпуска:\s*(19\d{2}|20\d{2})/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
      const kpText = $(el).find('.fullKP').text();
      const kpMatch = kpText.match(/(\d+(?:\.\d+)?)/);
      const rating = kpMatch ? parseFloat(kpMatch[1]) : undefined;
      const qualityText = $(el).find('.fQuality').text().replace(/Качество:/i, '').trim();
      const lentaText = $(el).find('.lenta .cont').text().trim();
      const viewsRaw = $(el).find('.sViews, .views, [class*="view"]').first().text().replace(/\s+/g, '');
      const kpVotesMatch = kpText.match(/\((\d[\d\s]{1,12})\)/);
      const siteVotesMatch = $(el).find('.hRating').text().match(/Голосов:\s*(\d[\d\s]*)/i);
      const viewsMatch =
        viewsRaw.match(/(\d+)/) ||
        (kpVotesMatch ? [kpVotesMatch[0], kpVotesMatch[1].replace(/\s+/g, '')] : null) ||
        (siteVotesMatch ? [siteVotesMatch[0], siteVotesMatch[1].replace(/\s+/g, '')] : null);
      const views = viewsMatch ? parseInt(viewsMatch[1], 10) : undefined;
      const title = rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim();
      const genreText = $(el).find('.sInfo a').text().toLowerCase();

      let type: ContentType = defaultType;
      if (lentaText.includes('серия') || genreText.includes('сериал') || href.includes('serialy')) type = 'series';
      else if (genreText.includes('аниме') || href.includes('/anime/')) type = 'animation';
      else if (genreText.includes('мультфильм') || href.includes('/cartoons/')) type = 'cartoons';

      const item: MediaItem = {
        id,
        title: title || rawTitle,
        url: fullUrl,
        poster,
        year,
        type,
        rating: rating && !isNaN(rating) ? rating : undefined,
        views: views && !isNaN(views) ? views : undefined,
        info: [qualityText, lentaText].filter(Boolean).join(' • ') || undefined,
      };
      this.mediaCache.set(fullUrl, item);
      this.mediaCache.set(id, item);
      this.mediaUrlCache.set(id, fullUrl);
      items.push(item);
    });

    return this.filterNonCamRipItems(items);
  }

  private async getKinogoHomeSections() {
    try {
      const base = this.getKinogoBaseUrl();
      const [homeHtml, filmsHtml, seriesHtml, cartoonsHtml] = await Promise.all([
        this.fetchKinogoPage(`${base}/`),
        this.fetchKinogoPage(`${base}/films/`),
        this.fetchKinogoPage(`${base}/zarubezhnye_serialy/`),
        this.fetchKinogoPage(`${base}/cartoons/`),
      ]);

      const homeItems = homeHtml ? this.parseKinogoItems(homeHtml) : [];
      const filmsItems = filmsHtml ? this.parseKinogoItems(filmsHtml, 'films') : [];
      const seriesItems = seriesHtml ? this.parseKinogoItems(seriesHtml, 'series') : [];
      const cartoonItems = cartoonsHtml ? this.parseKinogoItems(cartoonsHtml, 'cartoons') : [];

      if (homeItems.length === 0 && filmsItems.length === 0 && seriesItems.length === 0) {
        return null;
      }

      const popular = (homeItems.length > 0 ? homeItems : filmsItems).slice(0, 16);
      const topMovies = (filmsItems.length > 0 ? filmsItems : homeItems.filter((i) => i.type === 'films')).slice(0, 16);
      const topSeries = (seriesItems.length > 0 ? seriesItems : homeItems.filter((i) => i.type === 'series')).slice(0, 16);
      const newList = homeItems.filter((i) => (i.year || 0) >= 2024);
      const newReleases = (newList.length > 0 ? newList : popular).slice(0, 16);
      const recommendations = [...topMovies.slice(0, 8), ...cartoonItems.slice(0, 8)].slice(0, 16);
      const expectedList = homeItems.filter((i) => (i.year || 0) >= 2025);
      const expected = (expectedList.length > 0 ? expectedList : popular).slice(0, 16);
      const hero = topMovies[0] || popular[0] || topSeries[0];

      return {
        hero,
        popular,
        newReleases,
        topMovies: topMovies.length > 0 ? topMovies : popular,
        topSeries: topSeries.length > 0 ? topSeries : popular,
        recommendations: recommendations.length > 0 ? recommendations : popular,
        expected,
      };
    } catch {
      return null;
    }
  }

  private async getKinogoCatalog(filter: CatalogFilter): Promise<SearchResult | null> {
    try {
      const base = this.getKinogoBaseUrl();
      const routeMap: Record<ContentType, string> = {
        films: '/films/',
        series: '/zarubezhnye_serialy/',
        cartoons: '/cartoons/',
        animation: '/anime/',
        shows: '/films/',
      };
      const basePath = filter.genre ? `/${filter.genre}/` : (routeMap[filter.type] || '/films/');
      const pagePath = filter.page > 1 ? `${basePath}page/${filter.page}/` : basePath;
      const html = await this.fetchKinogoPage(`${base}${pagePath}`);
      if (!html) return null;

      const items = this.parseKinogoItems(html, filter.type);
      if (items.length === 0) return null;

      return {
        items,
        page: filter.page,
        hasMore: html.includes(`/page/${filter.page + 1}/`),
      };
    } catch {
      return null;
    }
  }

  private async searchKinogo(query: string): Promise<MediaItem[]> {
    const cleanQ = query.trim();
    if (!cleanQ) return [];
    const base = this.getKinogoBaseUrl();
    const html = await this.fetchKinogoPage(`${base}/?do=search&subaction=search&story=${encodeURIComponent(cleanQ)}`, 4500);
    return html ? this.parseKinogoItems(html) : [];
  }

  private async resolveKinogoUrl(urlOrId: string, meta?: Partial<MediaItem>): Promise<string | null> {
    const normId = urlOrId.split('/').pop()?.split('-')[0] || urlOrId;
    for (const c of [urlOrId, meta?.url, this.mediaUrlCache.get(normId)]) {
      if (c && this.isKinogo(c)) {
        return c.startsWith('http') ? c : `${this.getKinogoBaseUrl()}${c.startsWith('/') ? '' : '/'}${c}`;
      }
    }

    const query = cleanTitleForSearch(meta?.title || meta?.origTitle || '');
    if (!query) return null;

    const results = await this.searchKinogo(query);
    const matched = pickBestMirrorMatch(results, meta);
    return matched ? matched.url : null;
  }

  private async extractKinogoPlayerTree(filmUrl: string, preloadedHtml?: string) {
    const cached = this.kinogoPlayerCache.get(filmUrl);
    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      return cached;
    }

    const html = preloadedHtml || (await this.fetchKinogoPage(filmUrl, 5000));
    if (!html) return null;

    const $ = cheerio.load(html);
    let embedUrl = '';
    $('iframe').each((_, el) => {
      if (embedUrl) return;
      const src = $(el).attr('data-src') || $(el).attr('src') || '';
      if (src.includes('cinemar.') || src.includes('/embed/')) {
        embedUrl = src.startsWith('//') ? `https:${src}` : src;
      }
    });
    if (!embedUrl) return null;

    const base = this.getKinogoBaseUrl();
    const embedRes = await appFetch(embedUrl, {
      headers: { 'Referer': `${base}/`, 'User-Agent': BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!embedRes.ok) return null;
    const embedHtml = await embedRes.text();
    const fileMatch = embedHtml.match(/["']?file["']?\s*:\s*["'](#2[^"']+)["']/i);
    if (!fileMatch) return null;

    const tree = this.decodeCinemarFile(fileMatch[1]);
    if (!Array.isArray(tree) || tree.length === 0) return null;

    const translatorIdsByName = new Map<string, number>();
    const translators: Translator[] = [];
    const itemDataMap = new Map<string, string>();
    const seasons: Season[] = [];

    const registerTranslator = (rawName?: string): number => {
      const cleanName = String(rawName || 'Дубляж').replace(/<[^>]+>/g, '').trim() || 'Дубляж';
      let trId = translatorIdsByName.get(cleanName);
      if (!trId) {
        trId = translatorIdsByName.size + 1;
        translatorIdsByName.set(cleanName, trId);
        translators.push({
          id: trId,
          name: cleanName,
          premium: false,
          camrip: isCamRipText(cleanName),
        });
      }
      return trId;
    };

    const hasFolders = tree.some((n: any) => Array.isArray(n?.folder));
    if (!hasFolders) {
      tree.forEach((node: any) => {
        if (!node?.data) return;
        const trId = registerTranslator(node.title);
        itemDataMap.set(`tr:${trId}`, String(node.data));
        if (!itemDataMap.has('default')) itemDataMap.set('default', String(node.data));
      });
    } else {
      tree.forEach((seasonNode: any, sIdx: number) => {
        const sTitle = String(seasonNode?.title || `Сезон ${sIdx + 1}`).replace(/<[^>]+>/g, '').trim();
        const sNumMatch = sTitle.match(/\d+/);
        const sId = sNumMatch ? parseInt(sNumMatch[0], 10) : sIdx + 1;
        const episodes: Season['episodes'] = [];
        const epNodes = Array.isArray(seasonNode?.folder) ? seasonNode.folder : [];
        epNodes.forEach((epNode: any, epIdx: number) => {
          const epTitle = String(epNode?.title || `Серия ${epIdx + 1}`).replace(/<[^>]+>/g, '').trim();
          const epId = epIdx + 1;
          if (Array.isArray(epNode?.folder)) {
            epNode.folder.forEach((trNode: any) => {
              if (!trNode?.data) return;
              const trId = registerTranslator(trNode.title);
              itemDataMap.set(`${trId}:${sId}:${epId}`, String(trNode.data));
              if (!itemDataMap.has(`tr:${trId}`)) itemDataMap.set(`tr:${trId}`, String(trNode.data));
              if (!itemDataMap.has(`${sId}:${epId}`)) itemDataMap.set(`${sId}:${epId}`, String(trNode.data));
              if (!itemDataMap.has('default')) itemDataMap.set('default', String(trNode.data));
            });
          } else if (epNode?.data) {
            const trId = registerTranslator('Дубляж');
            itemDataMap.set(`${trId}:${sId}:${epId}`, String(epNode.data));
            itemDataMap.set(`${sId}:${epId}`, String(epNode.data));
            if (!itemDataMap.has('default')) itemDataMap.set('default', String(epNode.data));
          }
          episodes.push({ id: epId, episodeId: epId, seasonId: sId, title: epTitle });
        });
        if (episodes.length > 0) seasons.push({ id: sId, title: sTitle, episodes });
      });
    }

    const filteredTranslators = this.filterCamRipTranslators(
      translators.length > 0 ? translators : [{ id: 1, name: 'Дубляж', premium: false }]
    );
    const entry = {
      ts: Date.now(),
      embedUrl,
      translators: filteredTranslators,
      seasons: seasons.length > 0 ? seasons : undefined,
      itemDataMap,
    };
    this.kinogoPlayerCache.set(filmUrl, entry);
    return entry;
  }

  private async getKinogoDetails(urlOrId: string, meta?: Partial<MediaItem>): Promise<MediaDetails | null> {
    try {
      const filmUrl = await this.resolveKinogoUrl(urlOrId, meta);
      if (!filmUrl) return null;

      const html = await this.fetchKinogoPage(filmUrl, 5000);
      if (!html) return null;

      const base = this.getKinogoBaseUrl();
      const $ = cheerio.load(html);
      const idMatch = filmUrl.match(/\/(\d+)-/);
      const id = idMatch ? idMatch[1] : meta?.id || urlOrId;
      this.mediaUrlCache.set(id, filmUrl);

      const rawTitle = $('h1').first().text().trim() || meta?.title || '';
      const title = rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim();
      if (!title) return null;

      let poster = $('.fullStory .sPoster img, .sPoster img').first().attr('data-src') ||
                   $('.fullStory .sPoster img, .sPoster img').first().attr('src') ||
                   meta?.poster || '';
      if (poster.startsWith('data:')) poster = '';
      if (poster && !poster.startsWith('http')) {
        poster = `${base}${poster.startsWith('/') ? '' : '/'}${poster}`;
      }

      let country = meta?.country || '';
      let duration = '';
      const genres: string[] = [];
      const directors: string[] = [];
      let actors: string[] = [];
      let year = meta?.year || 0;

      $('.sInfo span').each((_, el) => {
        const txt = $(el).text().trim();
        if (txt.includes('Год выпуска:')) {
          const ym = txt.match(/\b(19\d{2}|20\d{2})\b/);
          if (ym) year = parseInt(ym[1], 10);
        } else if (txt.includes('Страна:')) {
          country = txt.replace('Страна:', '').trim();
        } else if (txt.includes('Продолжительность:')) {
          duration = txt.replace('Продолжительность:', '').trim();
        } else if (txt.includes('Жанр:')) {
          $(el).find('a').each((_, a) => {
            const g = $(a).text().trim();
            if (g && g !== 'Фильмы') genres.push(g);
          });
        } else if (txt.includes('Режиссер:')) {
          $(el).find('a').each((_, a) => {
            directors.push($(a).text().trim());
          });
        } else if (txt.includes('Актеры:')) {
          actors = txt.replace('Актеры:', '').split(',').map((s) => s.trim()).filter(Boolean);
        }
      });

      const kpMatch = $('.fullKP').text().match(/(\d+(?:\.\d+)?)/);
      const ratingKp = kpMatch ? parseFloat(kpMatch[1]) : undefined;
      const description = $('.fullStory p').first().text().trim() || $('.excerpt').first().text().trim() || '';

      const inferredKinogoType: ContentType =
        genres.some((g) => /сериал/i.test(g)) || /\bсезон\b/i.test(title)
          ? 'series'
          : genres.some((g) => /аниме/i.test(g))
            ? 'animation'
            : genres.some((g) => /мультфильм/i.test(g))
              ? 'cartoons'
              : meta?.type || 'films';

      const [treeRes, criticReviewsRes, kbEnrichRes, kpReviewsRes] = await Promise.allSettled([
        this.extractKinogoPlayerTree(filmUrl, html),
        this.fetchCriticReviews(title, year, { ratingRezka: ratingKp || meta?.rating, ratingKp, genres, directors }),
        (async () => {
          const kbUrl = await this.resolveKinobaseUrl('', { title, year, type: inferredKinogoType });
          if (!kbUrl) return { translators: [] as Translator[], seasons: undefined as Season[] | undefined, kpId: undefined as string | undefined };
          const pd = await this.extractKinobasePlayerData(kbUrl);
          if (!pd) return { translators: [] as Translator[], seasons: undefined as Season[] | undefined, kpId: undefined as string | undefined };
          const parsed = pd.file ? this.parseKinobaseSeriesAndTranslators(pd.file) : { translators: [], seasons: undefined };
          return { translators: parsed.translators, seasons: parsed.seasons, kpId: pd.kpId };
        })(),
        this.fetchKinopoiskReviews(title, year, meta?.origTitle, html),
      ]);

      const tree = treeRes.status === 'fulfilled' ? treeRes.value : null;
      const criticReviews = criticReviewsRes.status === 'fulfilled' ? criticReviewsRes.value : [];
      const kbEnrich = kbEnrichRes.status === 'fulfilled' ? kbEnrichRes.value : null;
      const kbTranslators = kbEnrich?.translators || [];
      const kpReviews = kpReviewsRes.status === 'fulfilled' ? kpReviewsRes.value : [];
      const userComments = this.parseKinogoComments(html);

      const isSeries =
        Boolean(tree?.seasons && tree.seasons.length > 0) ||
        Boolean(kbEnrich?.seasons && kbEnrich.seasons.length > 0) ||
        genres.some((g) => /сериал/i.test(g));
      const type: ContentType = isSeries
        ? 'series'
        : genres.some((g) => /аниме/i.test(g))
          ? 'animation'
          : genres.some((g) => /мультфильм/i.test(g))
            ? 'cartoons'
            : meta?.type || 'films';

      let pageKpId =
        kbEnrich?.kpId ||
        html.match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i)?.[1] ||
        html.match(/\/embed\/kp\/(\d+)/i)?.[1];
      if (isSeries && !pageKpId) {
        pageKpId =
          (await this.resolveKinopoiskId(cleanTitleForSearch(title) || title, year, meta?.origTitle).catch(() => null)) ||
          undefined;
      }
      if (pageKpId) {
        this.kpIdCache.set(id, pageKpId);
        this.kpIdCache.set(filmUrl, pageKpId);
      }

      const collapsEnrich = isSeries && pageKpId ? await this.fetchCollapsPlayerData(pageKpId).catch(() => null) : null;

      const baseTranslators = tree?.translators || [{ id: 1, name: 'Дубляж', premium: false }];
      let translators = kbTranslators.length > 0
        ? this.mergeCrossMirrorTranslators(baseTranslators, kbTranslators, 2000)
        : baseTranslators;
      if (collapsEnrich?.translators?.length) {
        translators = this.mergeCrossMirrorTranslators(translators, collapsEnrich.translators, 3000);
      }

      const mergedSeasons = isSeries
        ? mergeSeasons(tree?.seasons, kbEnrich?.seasons, collapsEnrich?.seasons)
        : tree?.seasons;

      return {
        id,
        title,
        origTitle: meta?.origTitle || '',
        poster,
        backdrop: poster,
        year,
        country,
        genres,
        type,
        duration,
        ageRating: '',
        ratingRezka: ratingKp || meta?.rating,
        ratingKp,
        description,
        directors,
        actors,
        translators,
        currentTranslatorId: translators[0]?.id ?? 1,
        seasons: mergedSeasons && mergedSeasons.length > 0 ? mergedSeasons : tree?.seasons,
        similar: [],
        reviews: [...kpReviews, ...criticReviews, ...userComments],
        url: filmUrl,
        antiBot: false,
      };
    } catch {
      return null;
    }
  }

  private async getKinogoStream(
    filmUrl: string,
    params: {
      translatorId?: number;
      translatorName?: string;
      season?: number;
      episode?: number;
      strictTranslatorMatch?: boolean;
    }
  ): Promise<StreamData | null> {
    try {
      const tree = await this.extractKinogoPlayerTree(filmUrl);
      if (!tree) return null;

      const sId = params.season || tree.seasons?.[0]?.id || 1;
      const eId = params.episode || tree.seasons?.[0]?.episodes?.[0]?.id || 1;
      const matchedByName = matchTranslatorByName(tree.translators, params.translatorName);
      if (params.strictTranslatorMatch && params.translatorName && !matchedByName) {
        return null;
      }
      const trId = matchedByName?.id || params.translatorId || tree.translators[0]?.id || 1;

      const isExplicitSeriesRequest = Boolean(tree.seasons?.length && params.season && params.episode);
      const targetData = isExplicitSeriesRequest
        ? params.strictTranslatorMatch && matchedByName
          ? tree.itemDataMap.get(`${trId}:${sId}:${eId}`)
          : tree.itemDataMap.get(`${trId}:${sId}:${eId}`) || tree.itemDataMap.get(`${sId}:${eId}`)
        : tree.itemDataMap.get(`${trId}:${sId}:${eId}`) ||
          tree.itemDataMap.get(`${sId}:${eId}`) ||
          tree.itemDataMap.get(`tr:${trId}`) ||
          tree.itemDataMap.get('default');
      if (!targetData) return null;

      const embedOrigin = new URL(tree.embedUrl).origin;
      const res = await appFetch(`${embedOrigin}/api/playlist/load`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': tree.embedUrl,
          'Origin': embedOrigin,
          'User-Agent': BROWSER_USER_AGENT,
        },
        body: JSON.stringify(targetData),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;

      const data: any = await res.json();
      const masterUrl = data?.file;
      if (!masterUrl || typeof masterUrl !== 'string') return null;

      const streams = await this.fetchHlsMasterStreams(masterUrl, {
        'Referer': `${embedOrigin}/`,
        'Origin': embedOrigin,
        'User-Agent': BROWSER_USER_AGENT,
      });

      const rawSub = typeof data?.subtitle === 'string'
        ? data.subtitle.replace(/(\[[^\]]+\])\/static\//g, `$1${embedOrigin}/static/`)
        : undefined;
      const subtitles = this.parseKinobaseSubtitles(rawSub);

      return {
        streams,
        subtitles,
        isAlternative: true,
        sourceName: 'Kinogo Cinemar',
      };
    } catch {
      return null;
    }
  }

  public async getHomeSections() {
    if (this.isHdStudio()) {
      const hHome =
        (await this.getHdStudioHomeSections()) ||
        (await this.getKinobaseHomeSections()) ||
        (await this.getKinogoHomeSections());
      if (hHome) return hHome;
      return FALLBACK_HOME_SECTIONS;
    }
    if (this.isKinobase()) {
      const kHome =
        (await this.getKinobaseHomeSections()) ||
        (await this.getKinogoHomeSections()) ||
        (await this.getHdStudioHomeSections());
      if (kHome) return kHome;
      return FALLBACK_HOME_SECTIONS;
    }
    if (this.isKinogo()) {
      const gHome =
        (await this.getKinogoHomeSections()) ||
        (await this.getKinobaseHomeSections()) ||
        (await this.getHdStudioHomeSections());
      if (gHome) return gHome;
      return FALLBACK_HOME_SECTIONS;
    }
    try {
      const html = await this.fetchHtml(this.activeMirror);
      if (this.isAntiBot(html)) {
        console.warn('[RezkaProvider] Active mirror protected by anti-bot. Trying Kinobase / Kinogo fallback.');
        const kHome = (await this.getKinobaseHomeSections()) || (await this.getKinogoHomeSections());
        if (kHome) return kHome;
        return await this.fetchLiveRezkaHomeSections();
      }
      const $ = cheerio.load(html);

      const rawItems: MediaItem[] = [];
      $('.b-content__inline_item').each((_, el) => {
        const item = this.parseItem($(el), $);
        if (item && !rawItems.some((x) => x.id === item.id)) {
          this.mediaCache.set(item.url, item);
          this.mediaCache.set(item.id, item);
          rawItems.push(item);
        }
      });
      const allItems = this.filterNonCamRipItems(rawItems);

      if (allItems.length === 0) {
        console.warn('[RezkaProvider] Parsed 0 items from mirror. Trying Kinobase / Kinogo fallback.');
        const kHome = (await this.getKinobaseHomeSections()) || (await this.getKinogoHomeSections());
        if (kHome) return kHome;
        return await this.fetchLiveRezkaHomeSections();
      }

      // Fetch categories & recommendations directly from HDRezka in parallel
      const [recsDirect, popularDirect, newDirect, moviesDirect, seriesDirect] = await Promise.all([
        this.fetchItemsFromPath('/best/'),
        this.fetchItemsFromPath('/?filter=popular'),
        this.fetchItemsFromPath('/new/'),
        this.fetchItemsFromPath('/films/best/'),
        this.fetchItemsFromPath('/series/best/'),
      ]);

      const recommendations = recsDirect.length > 0
        ? recsDirect
        : allItems.filter((i) => (i.rating || 0) >= 7.0 || i.type === 'cartoons');

      const popular = popularDirect.length > 0
        ? popularDirect
        : allItems.slice(0, 16);

      const newReleases = newDirect.length > 0
        ? newDirect
        : allItems.slice(16, 32);

      const topMovies = moviesDirect.length > 0
        ? moviesDirect
        : allItems.filter((i) => i.type === 'films');

      const topSeries = seriesDirect.length > 0
        ? seriesDirect
        : allItems.filter((i) => i.type === 'series');

      const expected = allItems.filter((i) => (i.year || 0) >= 2025).length > 0
        ? allItems.filter((i) => (i.year || 0) >= 2025).slice(0, 16)
        : allItems.slice(32, 48);

      // Hero: pick top item from recommendations or popular
      let hero = recommendations[0] || popular[0] || allItems[0];
      if (hero?.url) {
        const cached = this.mediaCache.get(hero.url);
        if (cached?.info) {
          hero = { ...hero, info: cached.info };
        }
      }

      return {
        hero,
        popular: popular.slice(0, 16),
        newReleases: newReleases.slice(0, 16),
        topMovies: topMovies.slice(0, 16),
        topSeries: topSeries.slice(0, 16),
        recommendations: recommendations.slice(0, 16),
        expected: expected.slice(0, 16),
      };
    } catch (err) {
      console.warn('[RezkaProvider] Error fetching home sections, trying Kinobase / Kinogo:', err);
      const kHome = (await this.getKinobaseHomeSections()) || (await this.getKinogoHomeSections());
      if (kHome) return kHome;
      return await this.fetchLiveRezkaHomeSections();
    }
  }

  public async getCatalog(filter: CatalogFilter) {
    if (filter.type === 'animation') {
      const animeCat = await this.getAnimeMirrorCatalog(filter);
      if (animeCat && animeCat.items.length > 0) return animeCat;
    }
    if (this.isHdStudio()) {
      const hCat =
        (filter.type === 'series' ? await this.getHdStudioCatalog(filter) : null) ||
        (await this.getKinobaseCatalog(filter)) ||
        (await this.getKinogoCatalog(filter)) ||
        (await this.getHdStudioCatalog(filter));
      if (hCat) return hCat;
    }
    if (this.isKinobase()) {
      const kCat =
        (await this.getKinobaseCatalog(filter)) ||
        (await this.getKinogoCatalog(filter)) ||
        (filter.type === 'series' ? await this.getHdStudioCatalog(filter) : null);
      if (kCat) return kCat;
    }
    if (this.isKinogo()) {
      const gCat =
        (await this.getKinogoCatalog(filter)) ||
        (await this.getKinobaseCatalog(filter)) ||
        (filter.type === 'series' ? await this.getHdStudioCatalog(filter) : null);
      if (gCat) return gCat;
    }
    try {
      const catSlug = filter.type === 'shows' ? 'show' : filter.type;
      let path = `/${catSlug}/`;
      if (filter.genre) {
        path += `${filter.genre}/`;
      }
      if (filter.sort === 'popular') {
        path += 'best/';
      } else if (filter.sort === 'watching') {
        path += 'watching/';
      }

      if (filter.year) {
        path += `${filter.year}/`;
      }

      if (filter.page > 1) {
        path += `page/${filter.page}/`;
      }

      const targetUrl = `${this.activeMirror}${path}`;
      const html = await this.fetchHtml(targetUrl);
      if (this.isAntiBot(html)) {
        throw new Error('Anti-bot challenge active');
      }
      const $ = cheerio.load(html);

      const items: MediaItem[] = [];
      $('.b-content__inline_item').each((_, el) => {
        const item = this.parseItem($(el), $);
        if (item) items.push(item);
      });
      const cleanItems = this.filterNonCamRipItems(items);

      if (cleanItems.length === 0) {
        throw new Error('No items parsed');
      }

      const hasMore = $('.b-navigation__next, a:contains("Вперед"), a:contains("Вперёд")').length > 0;

      return {
        items: cleanItems,
        page: filter.page,
        hasMore,
      };
    } catch (err) {
      const kCat = (await this.getKinobaseCatalog(filter)) || (await this.getKinogoCatalog(filter));
      if (kCat) return kCat;

      try {
        const queryTerm = filter.genre || (filter.type === 'films' ? 'фильм' : filter.type === 'series' ? 'сериал' : filter.type === 'cartoons' ? 'мультфильм' : 'аниме');
        const liveCatalog = await this.searchAdvanced(queryTerm, filter.page);
        if (liveCatalog.items && liveCatalog.items.length > 0) {
          return liveCatalog;
        }
      } catch {}

      let fallback = FALLBACK_ITEMS.filter((i) => i.type === filter.type);
      if (fallback.length === 0) fallback = FALLBACK_ITEMS;
      if (filter.genre) {
        const gLow = filter.genre.toLowerCase();
        const filtered = fallback.filter((i) => i.genres?.some((g) => g.toLowerCase().includes(gLow)));
        if (filtered.length > 0) fallback = filtered;
      }
      return {
        items: fallback,
        page: filter.page,
        hasMore: false,
      };
    }
  }

  public static readonly POPULAR_TRANSLATORS: Record<number, string> = {
    1: 'Дубляж',
    56: 'HDRezka Studio',
    238: 'LostFilm',
    4: 'Оригинал (+субтитры)',
    111: 'AlexFilm',
    70: 'Кубик в Кубе',
    89: 'NewStudio',
    379: 'Red Head Sound',
    417: 'Flarrow Films',
    53: 'BaibaKo',
    62: 'TVShows',
    30: 'Кураж-Бамбей',
    2: 'Многоголосый закадровый',
    3: 'Двуголосый закадровый',
    5: 'Одноголосый закадровый',
    6: 'Субтитры',
    18: 'Украинский дубляж',
    54: 'Coldfilm',
    80: 'AniDUB',
    84: 'SHIZA Project',
    100: 'AniLibria',
    102: 'AniMedia',
    107: 'AnimeVost',
    110: 'Good People',
    115: 'HamsterStudio',
    145: 'IdeaFilm',
    244: 'RuDub',
    345: 'Невафильм',
    355: 'Пифагор',
    374: 'СВ-Дубль',
    430: 'HDRezka (18+)',
  };

  public async probeTranslators(mediaId: string, isMovie?: boolean, pageUrl?: string): Promise<Translator[]> {
    if (!mediaId) return [];
    const mirrorsToTry = [this.activeMirror, ...this.mirrors.filter((m) => m !== this.activeMirror)];
    const primaryMirrors = mirrorsToTry.slice(0, 2);
    const blockedMirrors = new Set<string>();
    const action = isMovie ? 'get_movie' : 'get_episodes';
    const trIds = Object.keys(RezkaProvider.POPULAR_TRANSLATORS).map(Number);

    const checkTr = async (trId: number, act: string): Promise<Translator | null> => {
      for (const mirror of primaryMirrors) {
        if (blockedMirrors.has(mirror)) continue;
        try {
          const formData = new URLSearchParams();
          formData.append('id', mediaId);
          formData.append('translator_id', trId.toString());
          formData.append('action', act);

          const res = await appFetch(`${mirror}/ajax/get_cdn_series/?t=${Date.now()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': pageUrl?.replace(/^https?:\/\/[^/]+/, mirror) || `${mirror}/`,
              'User-Agent': BROWSER_USER_AGENT,
            },
            body: formData.toString(),
            signal: AbortSignal.timeout(2500),
          });

          if (!res.ok) continue;
          const text = await res.text();
          if (!text || text.trim().startsWith('<') || text.includes('<!doctype') || text.includes('<!DOCTYPE')) {
            if (this.isAntiBot(text)) {
              blockedMirrors.add(mirror);
            }
            continue;
          }
          const json = JSON.parse(text);
          if (json && json.success) {
            return {
              id: trId,
              name: RezkaProvider.POPULAR_TRANSLATORS[trId] || `Перевод #${trId}`,
              premium: false,
            };
          }
        } catch (_) {}
      }
      return null;
    };

    const results: Translator[] = [];
    const chunkSize = 6;
    for (let i = 0; i < trIds.length; i += chunkSize) {
      if (blockedMirrors.size >= primaryMirrors.length) break;
      const chunk = trIds.slice(i, i + chunkSize);
      const chunkRes = await Promise.all(chunk.map((id) => checkTr(id, action)));
      for (const item of chunkRes) {
        if (item) results.push(item);
      }
    }

    if (results.length === 0 && blockedMirrors.size < primaryMirrors.length) {
      const altAction = isMovie ? 'get_episodes' : 'get_movie';
      for (let i = 0; i < trIds.length; i += chunkSize) {
        if (blockedMirrors.size >= primaryMirrors.length) break;
        const chunk = trIds.slice(i, i + chunkSize);
        const chunkRes = await Promise.all(chunk.map((id) => checkTr(id, altAction)));
        for (const item of chunkRes) {
          if (item) results.push(item);
        }
      }
    }

    return results;
  }

  public async getDetails(urlOrId: string, meta?: Partial<MediaItem>): Promise<MediaDetails> {
    const normId = urlOrId.split('/').pop()?.split('-')[0] || urlOrId;
    let cachedMeta = meta || this.mediaCache.get(urlOrId) || this.mediaCache.get(normId);

    if (!cachedMeta) {
      for (const item of this.mediaCache.values()) {
        if (item.url === urlOrId || item.id === normId || (normId && item.url?.includes(`/${normId}-`))) {
          cachedMeta = item;
          break;
        }
      }
    }

    // Route by explicit item URL/origin FIRST so clicking a Kinogo/HDStudio/Anime item works regardless of activeMirror
    const explicitUrl = urlOrId.startsWith('http') ? urlOrId : cachedMeta?.url || this.mediaUrlCache.get(urlOrId) || '';

    if (this.isAnimeMirror(urlOrId) || this.isAnimeMirror(explicitUrl) || /^yani-\d+$/i.test(urlOrId)) {
      const ad = await this.getAnimeMirrorDetails(urlOrId, cachedMeta);
      if (ad) return ad;
    }

    if (this.isHdStudio(urlOrId) || this.isHdStudio(explicitUrl) || /^hdstudio-/i.test(urlOrId)) {
      const hd =
        (await this.getHdStudioDetails(urlOrId, cachedMeta)) ||
        (await this.getKinobaseDetails(urlOrId, cachedMeta)) ||
        (await this.getKinogoDetails(urlOrId, cachedMeta));
      if (hd) return hd;
    }

    if (this.isKinogo(urlOrId) || this.isKinogo(explicitUrl)) {
      const gd =
        (await this.getKinogoDetails(urlOrId, cachedMeta)) ||
        (await this.getKinobaseDetails(urlOrId, cachedMeta)) ||
        (await this.getHdStudioDetails(urlOrId, cachedMeta));
      if (gd) return gd;
    }

    if (this.isKinobase(urlOrId) || this.isKinobase(explicitUrl)) {
      const kd =
        (await this.getKinobaseDetails(urlOrId, cachedMeta)) ||
        (await this.getKinogoDetails(urlOrId, cachedMeta)) ||
        (await this.getHdStudioDetails(urlOrId, cachedMeta));
      if (kd) return kd;
    }

    // Bare ID without explicit mirror URL -> route by activeMirror
    if (this.isHdStudio()) {
      const hd =
        (await this.getHdStudioDetails(urlOrId, cachedMeta)) ||
        (await this.getKinobaseDetails(urlOrId, cachedMeta)) ||
        (await this.getKinogoDetails(urlOrId, cachedMeta));
      if (hd) return hd;
    }
    if (this.isKinobase()) {
      const kd =
        (await this.getKinobaseDetails(urlOrId, cachedMeta)) ||
        (await this.getKinogoDetails(urlOrId, cachedMeta)) ||
        (await this.getHdStudioDetails(urlOrId, cachedMeta));
      if (kd) return kd;
    }
    if (this.isKinogo()) {
      const gd =
        (await this.getKinogoDetails(urlOrId, cachedMeta)) ||
        (await this.getKinobaseDetails(urlOrId, cachedMeta)) ||
        (await this.getHdStudioDetails(urlOrId, cachedMeta));
      if (gd) return gd;
    }

    try {
      let targetUrl = cachedMeta?.url || urlOrId;
      if (!targetUrl.includes('.html')) {
        const cachedCanonical = this.mediaUrlCache.get(normId);
        if (cachedCanonical && cachedCanonical.includes('.html')) {
          targetUrl = cachedCanonical;
        } else {
          for (const item of this.mediaCache.values()) {
            if ((item.id === normId || item.url?.includes(`/${normId}-`)) && item.url?.includes('.html')) {
              targetUrl = item.url;
              break;
            }
          }
        }

        if (!targetUrl.includes('.html')) {
          const rawTitle = cachedMeta?.title || meta?.title || meta?.origTitle || '';
          const query = rawTitle.split('/')[0].replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
          if (query) {
            try {
              const searchResults = await this.searchFast(query);
              const found = searchResults.find(
                (r) => r.id === normId || (normId && r.url?.includes(`/${normId}-`))
              );
              if (found && found.url) {
                targetUrl = found.url;
              }
            } catch {}
          }
        }
      }

      if (!targetUrl.startsWith('http')) {
        targetUrl = targetUrl.startsWith('/') ? `${this.activeMirror}${targetUrl}` : `${this.activeMirror}/${targetUrl}`;
      }
      this.mediaUrlCache.set(normId, targetUrl);
      if (cachedMeta) cachedMeta.url = targetUrl;

      // Extract the path so we can try other mirrors
      let urlPath = '';
      try {
        urlPath = new URL(targetUrl).pathname;
      } catch {
        urlPath = targetUrl.replace(/^https?:\/\/[^/]+/, '');
      }

      // Try active mirror first, then up to 3 backup mirrors in parallel to find one not behind anti-bot
      let html = '';
      try {
        const activeTryUrl = urlPath ? `${this.activeMirror}${urlPath}` : targetUrl;
        html = await this.fetchHtml(activeTryUrl, 0);
      } catch {}

      if (!html || this.isAntiBot(html)) {
        const backupMirrors = this.mirrors.filter((m) => m !== this.activeMirror).slice(0, 3);
        if (backupMirrors.length > 0) {
          const results = await Promise.allSettled(
            backupMirrors.map(async (mirror) => {
              const tryUrl = urlPath ? `${mirror}${urlPath}` : targetUrl;
              const res = await appFetch(tryUrl, {
                headers: this.getHeaders(mirror),
                signal: AbortSignal.timeout(4000),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const body = await res.text();
              if (!body || this.isAntiBot(body)) throw new Error('Anti-bot');
              return body;
            })
          );
          const good = results.find((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled');
          if (good) {
            html = good.value;
          }
        }
      }

      if (this.isAntiBot(html) || !html) {
        const kd =
          (await this.getKinobaseDetails(urlOrId, cachedMeta)) ||
          (await this.getKinogoDetails(urlOrId, cachedMeta)) ||
          (await this.getHdStudioDetails(urlOrId, cachedMeta));
        if (kd) return kd;

        // All mirrors are behind the bot check: probe working translators from AJAX stream endpoint
        const fb = getFallbackDetails(urlOrId, cachedMeta);
        fb.antiBot = true;
        if (fb.id) {
          try {
            const probed = await this.probeTranslators(fb.id, fb.type === 'films', targetUrl);
            if (probed.length > 0) {
              fb.translators = probed;
              const preferred = probed.find((t) => t.id === 1) || probed.find((t) => t.id === 56) || probed[0];
              fb.currentTranslatorId = preferred.id;
              if (fb.type === 'series' || fb.type === 'animation' || fb.type === 'cartoons') {
                const loaded = await this.getSeriesEpisodes(fb.id, fb.currentTranslatorId);
                if (loaded && loaded.length > 0) fb.seasons = loaded;
              }
            }
          } catch {}
        }
        return fb;
      }
      const $ = cheerio.load(html);

      const id = $('#post_id').attr('value') ||
                 $('#send-video-issue').attr('data-id') ||
                 $('#user-favorites-holder').attr('data-post_id') ||
                 normId;

      const title = $('.b-post__title h1, .b-post__title').first().text().trim();
      if (!title) {
        return getFallbackDetails(urlOrId, cachedMeta);
      }
      const origTitle = $('.b-post__origtitle').first().text().trim();
    const poster = $('.b-sidecover img').first().attr('src') || '';
    const backdrop = $('.b-sidecover a').first().attr('href') || poster;
    const description = $('.b-post__description_text').first().text().trim();

    // Parse info table
    let year = 0;
    let country = '';
    let duration = '';
    let ageRating = '';
    const genres: string[] = [];
    const directors: string[] = [];
    const actors: string[] = [];

    $('.b-post__info tr').each((_, row) => {
      const rowText = $(row).text();
      const tdText = $(row).find('td').last().text().trim();

      if (rowText.includes('Дата выхода') || rowText.includes('Год')) {
        const yMatch = tdText.match(/\b(19\d{2}|20\d{2})\b/);
        if (yMatch) year = parseInt(yMatch[1], 10);
      } else if (rowText.includes('Страна')) {
        country = tdText;
      } else if (rowText.includes('Жанр')) {
        $(row).find('td').last().find('a').each((_, a) => {
          genres.push($(a).text().trim());
        });
      } else if (rowText.includes('Время')) {
        duration = tdText;
      } else if (rowText.includes('Возраст')) {
        ageRating = tdText;
      } else if (rowText.includes('Режиссер') || rowText.includes('Режиссёр')) {
        $(row).find('td').last().find('a').each((_, a) => {
          directors.push($(a).text().trim());
        });
      } else if (rowText.includes('В ролях')) {
        $(row).find('td').last().find('a').each((_, a) => {
          actors.push($(a).text().trim());
        });
      }
    });

    // Ratings
    let ratingRezka: number | undefined;
    let ratingImdb: number | undefined;
    let ratingKp: number | undefined;

    $('.b-post__rates .b-post__info_rates').each((_, r) => {
      const text = $(r).text();
      const val = parseFloat($(r).find('.bold').text().trim());
      if (text.includes('IMDb')) ratingImdb = val;
      else if (text.includes('Кинопоиск')) ratingKp = val;
      else ratingRezka = val;
    });

    // Detect type
    const ogType = $('meta[property="og:type"]').attr('content') || '';
    let type: ContentType = 'films';
    if (ogType.includes('tv_series') || targetUrl.includes('/series/')) {
      type = 'series';
    } else if (targetUrl.includes('/cartoons/')) {
      type = 'cartoons';
    } else if (targetUrl.includes('/animation/')) {
      type = 'animation';
    }

    // Translators: the list holds <li> or <a> items depending on the mirror
    const translators: Translator[] = [];
    let currentTranslatorId = 0;
    const translatorSelector = '#translators-list [data-translator_id], .b-translator__list [data-translator_id], .b-translators__list [data-translator_id], [data-translator_id]';
    $(translatorSelector).each((_, el) => {
      const trId = parseInt($(el).attr('data-translator_id') || '0', 10);
      const titleAttr = $(el).attr('title') || '';
      const textAttr = $(el).text() || '';
      let trName = (titleAttr || textAttr).replace(/\s+/g, ' ').trim();
      if (!trName || trName.length < 2) {
        trName = RezkaProvider.POPULAR_TRANSLATORS[trId] || `Перевод #${trId}`;
      }
      if (trId > 0 && !translators.some((t) => t.id === trId)) {
        translators.push({
          id: trId,
          name: trName,
          premium: $(el).hasClass('b-prem_translator'),
          camrip: $(el).attr('data-camrip') === '1',
          ads: $(el).attr('data-ads') === '1',
          director: $(el).attr('data-director') === '1',
        });
        if ($(el).hasClass('active') || $(el).hasClass('current')) currentTranslatorId = trId;
      }
    });

    // Some mirrors render translator choices only in the player's initialization script.
    if (translators.length === 0) {
      const scriptText = $('script').map((_, script) => $(script).html() || '').get().join('\n');
      const translatorIds = new Set<number>();
      for (const match of scriptText.matchAll(/(?:translator_id|translatorId|translator)\s*[=:]\s*["']?(\d+)/gi)) {
        const trId = Number(match[1]);
        if (trId > 0) translatorIds.add(trId);
      }
      for (const trId of translatorIds) {
        translators.push({ id: trId, name: RezkaProvider.POPULAR_TRANSLATORS[trId] || `Перевод #${trId}`, premium: false });
      }
    }

    // The player init script always carries the default translator of the page
    const matchTr = $('script').text().match(/initCDN(?:Series|Movies)Events\(\s*\d+\s*,\s*(\d+)/i);
    const pageTranslatorId = matchTr ? parseInt(matchTr[1], 10) : 0;

    // Single-translator titles have no list, only the "В переводе" info row
    if (translators.length === 0) {
      let singleTrName = '';
      $('.b-post__info tr').each((_, row) => {
        const text = $(row).text();
        if (text.includes('В переводе:') || text.includes('Перевод:')) {
          singleTrName = $(row).find('td').last().text().trim();
        }
      });
      if (singleTrName) {
        translators.push({
          id: pageTranslatorId || 56,
          name: singleTrName,
          premium: false,
        });
      }
    }

    // A single guessed/default translator is not a real choice; discover the available options.
    if (translators.length <= 1 && id) {
      try {
        const probed = await this.probeTranslators(id, type === 'films', targetUrl);
        if (probed.length > 0) {
          translators.length = 0;
          translators.push(...probed);
        }
      } catch {}
    }

    // Final fallback if probing also found nothing
    if (translators.length === 0) {
      translators.push({
        id: (pageTranslatorId !== undefined && pageTranslatorId !== null) ? pageTranslatorId : 0,
        name: 'Оригинал / По умолчанию',
        premium: false,
      });
    }

    const filteredTranslators = this.filterCamRipTranslators(translators);
    translators.length = 0;
    translators.push(...filteredTranslators);

    if (currentTranslatorId === undefined || currentTranslatorId === null || (currentTranslatorId === 0 && translators.length > 0 && translators[0].id !== 0)) {
      if (pageTranslatorId !== undefined && pageTranslatorId !== null && translators.some((t) => t.id === pageTranslatorId)) {
        currentTranslatorId = pageTranslatorId;
      } else {
        const preferred = translators.find((t) => t.id === 1) || translators.find((t) => t.id === 56) || translators[0];
        currentTranslatorId = preferred ? preferred.id : 0;
      }
    }

    // Similar
    const similar: MediaItem[] = [];
    $('.b-post__partcontent_item, .b-scontent__item').each((_, el) => {
      const sLink = $(el).find('a').first();
      const sUrl = sLink.attr('href') || '';
      const sTitle = $(el).find('.title').text().trim() || sLink.text().trim();
      const sPoster = $(el).find('img').attr('src') || '';
      const sId = sUrl.split('/').pop()?.split('-')[0] || '';
      if (sTitle && sUrl) {
        similar.push({
          id: sId,
          title: sTitle,
          url: sUrl,
          poster: sPoster,
          type,
        });
      }
    });

    // Fetch initial seasons/episodes if TV series or animation, merging Collaps seasons if kpId is present
    let seasons: Season[] | undefined;
    const isSeriesLike = type === 'series' || type === 'animation' || type === 'cartoons' || targetUrl.includes('/series/') || targetUrl.includes('/cartoons/');
    const rezkaKpId =
      html.match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i)?.[1] ||
      html.match(/(?:data-kp_id|kp_id)["']?\s*[:=]\s*["']?(\d{3,10})/i)?.[1];
    if (rezkaKpId) {
      this.kpIdCache.set(id, rezkaKpId);
      this.kpIdCache.set(targetUrl, rezkaKpId);
    }
    if (isSeriesLike) {
      try {
        const [loadedRes, collapsRes] = await Promise.allSettled([
          this.getSeriesEpisodes(id, currentTranslatorId || 56),
          rezkaKpId ? this.fetchCollapsPlayerData(rezkaKpId) : Promise.resolve(null),
        ]);
        const loaded = loadedRes.status === 'fulfilled' ? loadedRes.value : [];
        const collapsSeasons = collapsRes.status === 'fulfilled' ? collapsRes.value?.seasons : undefined;
        const merged = mergeSeasons(loaded, collapsSeasons);
        if (merged.length > 0) {
          seasons = merged;
        }
      } catch (e) {
        console.warn('[RezkaProvider] Could not load episodes info:', e);
      }
    }

    const [criticReviewsRes, kpReviewsRes] = await Promise.allSettled([
      this.fetchCriticReviews(title, year, { ratingRezka, ratingImdb, ratingKp, genres, directors }),
      this.fetchKinopoiskReviews(title, year, origTitle, html),
    ]);
    const criticReviews = criticReviewsRes.status === 'fulfilled' ? criticReviewsRes.value : [];
    const kpReviews = kpReviewsRes.status === 'fulfilled' ? kpReviewsRes.value : [];
    const rezkaComments = this.parseRezkaComments(html);

    return {
      id,
      title,
      origTitle,
      poster,
      backdrop,
      year,
      country,
      genres,
      type,
      duration,
      ageRating,
      ratingRezka,
      ratingImdb,
      ratingKp,
      description,
      directors,
      actors,
      translators,
      currentTranslatorId,
      seasons,
      similar,
      reviews: [...kpReviews, ...criticReviews, ...rezkaComments],
      url: targetUrl,
    };
  } catch (err) {
    console.warn('[RezkaProvider] Failed to fetch details, returning fallback:', err);
    const fb = getFallbackDetails(urlOrId, cachedMeta);
    fb.url = cachedMeta?.url || urlOrId;
    if (fb.id) {
      try {
        const probed = await this.probeTranslators(fb.id, fb.type === 'films', this.mediaUrlCache.get(fb.id));
        if (probed.length > 0) {
          fb.translators = probed;
          const preferred = probed.find((t) => t.id === 1) || probed.find((t) => t.id === 56) || probed[0];
          fb.currentTranslatorId = preferred.id;
          if (fb.type === 'series' || fb.type === 'animation' || fb.type === 'cartoons') {
            const loaded = await this.getSeriesEpisodes(fb.id, fb.currentTranslatorId);
            if (loaded && loaded.length > 0) fb.seasons = loaded;
          }
        }
      } catch (_) {}
    } else if ((fb.type === 'series' || fb.type === 'animation' || fb.type === 'cartoons') && fb.id) {
      try {
        const loaded = await this.getSeriesEpisodes(fb.id, fb.currentTranslatorId || 56);
        if (loaded && loaded.length > 0) {
          fb.seasons = loaded;
        }
      } catch (_) {}
    }
    return fb;
  }
}

  public async getSeriesEpisodes(mediaId: string, translatorId: number): Promise<Season[]> {
    const cachedUrl = this.mediaUrlCache.get(mediaId);
    const cachedMeta = this.mediaCache.get(mediaId) || (cachedUrl ? this.mediaCache.get(cachedUrl) : undefined);
    const knownKpId = this.kpIdCache.get(mediaId) || (cachedUrl ? this.kpIdCache.get(cachedUrl) : undefined);
    const isExplicitOpen =
      this.isHdStudio(mediaId) ||
      this.isHdStudio(cachedUrl) ||
      /^hdstudio-/i.test(mediaId) ||
      this.isKinobase(mediaId) ||
      this.isKinobase(cachedUrl) ||
      this.isKinogo(mediaId) ||
      this.isKinogo(cachedUrl);

    if (isExplicitOpen || this.isHdStudio() || this.isKinobase() || this.isKinogo() || translatorId >= 1000) {
      const seasonSources: Array<Season[] | undefined> = [];
      const tasks: Array<Promise<void>> = [];

      if (knownKpId) {
        tasks.push(
          this.fetchCollapsPlayerData(knownKpId)
            .then((c) => {
              if (c?.seasons?.length) seasonSources.push(c.seasons);
            })
            .catch(() => {})
        );
      }

      if (this.isKinobase(mediaId) || this.isKinobase(cachedUrl) || this.isKinobase() || (translatorId >= 2000 && translatorId < 3000)) {
        tasks.push(
          (async () => {
            const filmUrl = await this.resolveKinobaseUrl(mediaId, cachedMeta);
            if (!filmUrl) return;
            const pd = await this.extractKinobasePlayerData(filmUrl);
            if (pd?.kpId) this.kpIdCache.set(mediaId, pd.kpId);
            if (pd?.file) {
              const parsed = this.parseKinobaseSeriesAndTranslators(pd.file, pd.subtitle);
              if (parsed.seasons?.length) seasonSources.push(parsed.seasons);
            }
          })().catch(() => {})
        );
      }

      if (this.isKinogo(mediaId) || this.isKinogo(cachedUrl) || this.isKinogo() || (translatorId >= 1000 && translatorId < 2000) || cachedMeta?.title) {
        tasks.push(
          (async () => {
            const filmUrl = await this.resolveKinogoUrl(mediaId, cachedMeta);
            if (!filmUrl) return;
            const tree = await this.extractKinogoPlayerTree(filmUrl);
            if (tree?.seasons?.length) seasonSources.push(tree.seasons);
          })().catch(() => {})
        );
      }

      if (!knownKpId && (this.isHdStudio(mediaId) || this.isHdStudio(cachedUrl) || /^hdstudio-/i.test(mediaId) || translatorId >= 3000)) {
        tasks.push(
          (async () => {
            const hdUrl = await this.resolveHdStudioUrl(mediaId, cachedMeta);
            if (!hdUrl) return;
            const html = await this.fetchHdStudioPage(hdUrl, 4000);
            const em = html?.match(/https?:\/\/[^"'\s]+(?:insertunit|delivembed)[^"'\s]+\/embed\/kp\/(\d+)/i);
            if (em?.[1]) {
              this.kpIdCache.set(mediaId, em[1]);
              const c = await this.fetchCollapsPlayerData(em[1]);
              if (c?.seasons?.length) seasonSources.push(c.seasons);
            }
          })().catch(() => {})
        );
      }

      await Promise.allSettled(tasks);
      const merged = mergeSeasons(...seasonSources);
      if (merged.length > 0) return merged;
    }

    const mirrorsToTry = [this.activeMirror, ...this.mirrors.filter((m) => m !== this.activeMirror)];
    const translatorsToTry = [translatorId];

    for (const mirror of mirrorsToTry) {
      for (const trId of translatorsToTry) {
        try {
          const formData = new URLSearchParams();
          formData.append('id', mediaId);
          formData.append('translator_id', trId.toString());
          formData.append('action', 'get_episodes');

          const res = await appFetch(`${mirror}/ajax/get_cdn_series/?t=${Date.now()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': this.mediaUrlCache.get(mediaId)?.replace(/^https?:\/\/[^/]+/, mirror) || `${mirror}/`,
              'User-Agent': BROWSER_USER_AGENT,
            },
            body: formData.toString(),
            signal: AbortSignal.timeout(this.timeoutMs),
          });

          if (!res.ok) continue;
          const text = await res.text();
          if (!text || text.trim().startsWith('<') || text.includes('<!doctype') || text.includes('<!DOCTYPE')) {
            continue;
          }
          let json: any;
          try {
            json = JSON.parse(text);
          } catch {
            continue;
          }
          if (!json || !json.success) continue;

          const seasonsDoc = cheerio.load(json.seasons || '');
          const episodesDoc = cheerio.load(json.episodes || '');

          const seasonsMap: Map<number, Season> = new Map();

          seasonsDoc('.b-simple_season__item').each((_, el) => {
            const seasonId = parseInt(seasonsDoc(el).attr('data-tab_id') || '0', 10);
            const title = seasonsDoc(el).text().trim() || `Сезон ${seasonId}`;
            if (seasonId > 0) {
              seasonsMap.set(seasonId, {
                id: seasonId,
                title,
                episodes: [],
              });
            }
          });

          episodesDoc('.b-simple_episode__item').each((_, el) => {
            const seasonId = parseInt(episodesDoc(el).attr('data-season_id') || '0', 10);
            const epId = parseInt(episodesDoc(el).attr('data-episode_id') || '0', 10);
            const epTitle = episodesDoc(el).text().trim() || `Серия ${epId}`;

            let season = seasonsMap.get(seasonId);
            if (!season) {
              season = { id: seasonId, title: `Сезон ${seasonId}`, episodes: [] };
              seasonsMap.set(seasonId, season);
            }
            season.episodes.push({
              id: epId,
              episodeId: epId,
              seasonId,
              title: epTitle,
            });
          });

          const seasons = Array.from(seasonsMap.values()).sort((a, b) => a.id - b.id);
          if (seasons.length > 0) {
            return seasons;
          }
        } catch (_) {}
      }
    }

    return [];
  }

  private mergeCrossMirrorTranslators(
    primary: Translator[],
    secondary: Translator[],
    offset: number
  ): Translator[] {
    const cleanSecondary = this.filterCamRipTranslators(secondary);
    const isGenericSingle =
      primary.length === 1 && /\/ Оригинал|^Дубляж$/i.test(primary[0].name.trim());
    const base = isGenericSingle && cleanSecondary.length > 0 ? [] : [...primary];
    const norm = (s: string) => s.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
    const existingNames = new Set(base.map((t) => norm(t.name)));

    for (const tr of cleanSecondary) {
      if (!existingNames.has(norm(tr.name))) {
        existingNames.add(norm(tr.name));
        base.push({ ...tr, id: offset + tr.id });
      }
    }
    return base.length > 0 ? base : primary;
  }

  private classifySentiment(text: string): 'positive' | 'neutral' | 'negative' {
    const low = text.toLowerCase();
    const pos = ['шедевр', 'крутой', 'отличный', 'класс', 'супер', 'топ', 'понравил', 'огонь', 'браво', 'рекомендую'].filter((w) => low.includes(w)).length;
    const neg = ['шлак', 'ужас', 'скучн', 'плох', 'разочаров', 'провал', 'отврат', 'бред', 'мусор'].filter((w) => low.includes(w)).length;
    if (pos > neg) return 'positive';
    if (neg > pos) return 'negative';
    return 'neutral';
  }

  public parseKinogoComments(html: string): MediaReview[] {
    if (!html) return [];
    const $ = cheerio.load(html);
    const reviews: MediaReview[] = [];
    const seen = new Set<string>();

    $('li.comments-tree-item').each((idx, el) => {
      const id = $(el).attr('id') || `kg-${idx}`;
      if (seen.has(id)) return;
      seen.add(id);

      const author = $(el).find('.cBodyHeader b').first().text().trim() || 'Зритель';
      const dateSpans = $(el)
        .find('.cBodyHeader span')
        .map((_, s) => $(s).text().trim())
        .get()
        .filter((s) => s && !s.startsWith('|') && !s.includes('Комментариев'));
      const date = dateSpans.find((s) => /\d{4}/.test(s)) || dateSpans[0] || '';

      const bodyNode = $(el).find('[id^="comm-id-"], .cBodyText').first().clone();
      bodyNode.find('br').replaceWith('\n');
      const text = bodyNode
        .text()
        .replace(/^Цитата:\s*[^\n]+/i, (m) => `${m}\n`)
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (text.length < 6) return;
      const isEssay = text.length >= 350;
      reviews.push({
        id,
        author,
        date: date || undefined,
        text,
        type: isEssay ? 'critic' : 'user',
        source: isEssay ? 'Рецензия КиноГо' : 'КиноГо',
        sentiment: this.classifySentiment(text),
      });
    });

    return reviews;
  }

  public parseRezkaComments(html: string): MediaReview[] {
    if (!html) return [];
    const $ = cheerio.load(html);
    const reviews: MediaReview[] = [];

    $('.b-comment').each((idx, el) => {
      const author = $(el).find('.author, .name').first().text().trim() || 'Пользователь';
      const date = $(el).find('.date').first().text().trim();
      const bodyNode = $(el).find('.text, .b-comment__text').first().clone();
      bodyNode.find('br').replaceWith('\n');
      const text = bodyNode.text().trim();
      if (text.length < 6) return;
      const isEssay = text.length >= 350;
      reviews.push({
        id: $(el).attr('data-id') || `rezka-${idx}`,
        author,
        date: date || undefined,
        text,
        type: isEssay ? 'critic' : 'user',
        source: isEssay ? 'Рецензия HDRezka' : 'HDRezka',
        sentiment: this.classifySentiment(text),
      });
    });

    return reviews;
  }

  public parseKinopoiskReviews(html: string): MediaReview[] {
    if (!html) return [];
    const $ = cheerio.load(html);
    const reviews: MediaReview[] = [];
    const seen = new Set<string>();

    $('.reviewItem').each((idx, el) => {
      const responseEl = $(el).find('.response').first();
      const cls = (responseEl.attr('class') || '').toLowerCase();
      const sentiment: 'positive' | 'neutral' | 'negative' = cls.includes('good')
        ? 'positive'
        : cls.includes('bad')
          ? 'negative'
          : 'neutral';

      const authorRaw =
        $(el).find('.profile_name a, [itemprop="author"] a').first().text().trim() ||
        $(el).find('.profile_name, [itemprop="author"]').first().text().split(/\r?\n/)[0]?.trim() ||
        'Пользователь Кинопоиска';
      const author = authorRaw.replace(/\s+/g, ' ').trim();
      const date = $(el).find('.date').first().text().trim();
      const subTitle = $(el).find('.sub_title').first().text().trim();

      const bodyNode = $(el).find('._reachbanner_, [itemprop="reviewBody"]').first().clone();
      bodyNode.find('br').replaceWith('\n');
      const bodyText = bodyNode.text().replace(/\n{3,}/g, '\n\n').trim();
      if (bodyText.length < 10) return;

      const text = subTitle ? `${subTitle}\n\n${bodyText}` : bodyText;
      const key = `${author}:${bodyText.slice(0, 40)}`;
      if (seen.has(key)) return;
      seen.add(key);

      reviews.push({
        id: `kp-${idx}-${seen.size}`,
        author,
        date: date || undefined,
        text,
        type: bodyText.length >= 600 ? 'critic' : 'user',
        source: 'Кинопоиск',
        sentiment,
      });
    });

    return reviews.slice(0, 12);
  }

  private async resolveKinopoiskId(
    title: string,
    year?: number,
    origTitle?: string,
    knownKpIdOrHtml?: string
  ): Promise<string | null> {
    if (knownKpIdOrHtml) {
      if (/^\d{3,10}$/.test(knownKpIdOrHtml.trim())) return knownKpIdOrHtml.trim();
      const m = knownKpIdOrHtml.match(/kinopoisk\.ru\/(?:film|series)\/(\d+)/i) ||
        knownKpIdOrHtml.match(/(?:data-kp_id|kp_id)["']?\s*[:=]\s*["']?(\d{3,10})/i);
      if (m?.[1]) return m[1];
    }

    const cleanTitle = (title || origTitle || '').replace(/\s*\(\d{4}\).*$/, '').trim();
    if (!cleanTitle) return null;

    const wikiHeaders = {
      'User-Agent': `HDRezkaDesktop/${this.version} (https://github.com/KDGOfficial/HDRezka-Desktop)`,
      'Accept': 'application/json',
    };
    const queries = Array.from(
      new Set(
        [
          year ? `${cleanTitle} ${year}` : cleanTitle,
          origTitle && origTitle.trim() && origTitle.trim().toLowerCase() !== cleanTitle.toLowerCase()
            ? `${origTitle.trim()}${year ? ` ${year}` : ''}`
            : '',
          cleanTitle.includes(':') ? cleanTitle.split(':')[0].trim() : '',
        ].filter((q) => q.length >= 2)
      )
    );

    for (const searchQuery of queries) {
      try {
        const ppRes = await appFetch(
          `https://ru.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=4&prop=pageprops&ppprop=wikibase_item&format=json`,
          { headers: wikiHeaders, signal: AbortSignal.timeout(2800) }
        );
        if (!ppRes.ok) continue;
        const ppJson: any = await ppRes.json();
        const pages = Object.values(ppJson?.query?.pages || {}) as any[];
        pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
        const qids = pages
          .map((p) => p?.pageprops?.wikibase_item)
          .filter((q): q is string => typeof q === 'string' && q.length > 0);
        if (qids.length === 0) continue;

        const wdRes = await appFetch(
          `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qids.join('|'))}&props=claims&format=json`,
          { headers: wikiHeaders, signal: AbortSignal.timeout(2800) }
        );
        if (!wdRes.ok) continue;
        const wdJson: any = await wdRes.json();
        for (const qid of qids) {
          const kpId = wdJson?.entities?.[qid]?.claims?.P2603?.[0]?.mainsnak?.datavalue?.value;
          if (kpId) return String(kpId);
        }
      } catch {}
    }
    return null;
  }

  private async fetchKinopoiskReviews(
    title: string,
    year?: number,
    origTitle?: string,
    knownKpIdOrHtml?: string
  ): Promise<MediaReview[]> {
    try {
      const kpId = await this.resolveKinopoiskId(title, year, origTitle, knownKpIdOrHtml);
      if (!kpId) return [];
      const res = await appFetch(`https://www.kinopoisk.ru/film/${kpId}/reviews/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept-Language': 'ru-RU,ru;q=0.9',
        },
        skipCookies: true,
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return [];
      const html = await res.text();
      return this.parseKinopoiskReviews(html);
    } catch {
      return [];
    }
  }

  private async fetchCriticReviews(
    title: string,
    year?: number,
    meta?: {
      ratingRezka?: number;
      ratingImdb?: number;
      ratingKp?: number;
      genres?: string[];
      directors?: string[];
    }
  ): Promise<MediaReview[]> {
    const reviews: MediaReview[] = [];
    const cleanTitle = (title || '').replace(/\s*\(\d{4}\).*$/, '').trim();

    if (cleanTitle) {
      try {
        const wikiHeaders = {
          'User-Agent': `HDRezkaDesktop/${this.version} (https://github.com/KDGOfficial/HDRezka-Desktop)`,
          'Accept': 'application/json',
        };
        const searchQuery = year ? `${cleanTitle} ${year} фильм` : `${cleanTitle} фильм`;
        const srRes = await appFetch(
          `https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json`,
          { headers: wikiHeaders, signal: AbortSignal.timeout(2800) }
        );
        if (srRes.ok) {
          const srJson: any = await srRes.json();
          const pageId = srJson?.query?.search?.[0]?.pageid;
          if (pageId) {
            const exRes = await appFetch(
              `https://ru.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&pageids=${pageId}&format=json`,
              { headers: wikiHeaders, signal: AbortSignal.timeout(2800) }
            );
            if (exRes.ok) {
              const exJson: any = await exRes.json();
              const extract: string = exJson?.query?.pages?.[pageId]?.extract || '';
              const critMatch = extract.match(/==\s*(?:Критика|Отзывы|Восприятие|Реакция|Оценки)[^=]*==\s*([\s\S]{80,2200}?)(?=\n==[^=]|$)/i);
              if (critMatch?.[1]) {
                const paras = critMatch[1]
                  .split(/\n+/)
                  .map((p) => p.trim())
                  .filter((p) => p.length > 70 && !p.startsWith('=='));
                paras.slice(0, 3).forEach((p, idx) => {
                  reviews.push({
                    id: `wiki-critic-${pageId}-${idx}`,
                    author: 'Обзор прессы и критиков',
                    text: p,
                    type: 'critic',
                    source: 'Кинокритика',
                    sentiment: this.classifySentiment(p),
                  });
                });
              }
            }
          }
        }
      } catch {}
    }

    const scoreParts: string[] = [];
    if (meta?.ratingKp) scoreParts.push(`КиноПоиск ${meta.ratingKp.toFixed(1)}`);
    if (meta?.ratingImdb) scoreParts.push(`IMDb ${meta.ratingImdb.toFixed(1)}`);
    if (meta?.ratingRezka && !meta?.ratingKp) scoreParts.push(`Рейтинг ${meta.ratingRezka.toFixed(1)}`);

    if (reviews.length === 0 || scoreParts.length > 0) {
      const avgScore = meta?.ratingImdb || meta?.ratingKp || meta?.ratingRezka;
      const verdict = avgScore
        ? avgScore >= 7.5
          ? 'Преимущественно восторженные отзывы критиков и зрителей.'
          : avgScore >= 6.0
            ? 'Сдержанно-положительные оценки прессы.'
            : 'Смешанные отклики критиков.'
        : 'Сводный рейтинг критиков формируется.';
      const infoBits = [
        scoreParts.length > 0 ? `Оценки: ${scoreParts.join(' • ')}.` : '',
        meta?.directors?.length ? `Режиссёр: ${meta.directors.slice(0, 2).join(', ')}.` : '',
        meta?.genres?.length ? `Жанр: ${meta.genres.slice(0, 3).join(', ')}.` : '',
        verdict,
      ].filter(Boolean);

      reviews.push({
        id: 'critic-consensus',
        author: 'Консенсус критиков и рейтингов',
        text: infoBits.join(' '),
        type: 'critic',
        source: 'Агрегатор оценок',
        rating: avgScore ? `${avgScore.toFixed(1)}/10` : undefined,
        sentiment: avgScore && avgScore >= 6.5 ? 'positive' : 'neutral',
      });
    }

    return reviews;
  }

  public async findAlternativeStream(params: {
    mediaId: string;
    title?: string;
    origTitle?: string;
    year?: number;
    season?: number;
    episode?: number;
    translatorId?: number;
    translatorName?: string;
  }): Promise<StreamData | null> {
    const cachedItem = this.mediaCache.get(params.mediaId);
    const metaForResolve = {
      ...cachedItem,
      title: params.title || cachedItem?.title,
      origTitle: params.origTitle || cachedItem?.origTitle,
      year: params.year || cachedItem?.year,
      type: params.season ? ('series' as ContentType) : cachedItem?.type,
    };

    const forceKinogoByOffset = params.translatorId !== undefined && params.translatorId >= 1000 && params.translatorId < 2000;
    const forceKinobaseByOffset = params.translatorId !== undefined && params.translatorId >= 2000 && params.translatorId < 3000;
    const forceCollapsByOffset = params.translatorId !== undefined && params.translatorId >= 3000;
    const normalizedTrId = forceCollapsByOffset
      ? params.translatorId! - 3000
      : forceKinobaseByOffset
        ? params.translatorId! - 2000
        : forceKinogoByOffset
          ? params.translatorId! - 1000
          : params.translatorId;

    // A specific dubbing name must never be silently overridden by another mirror's generic default track during quality upgrade
    const genericTrRe = /^(?:дубляж|оригинал\s*\/\s*дубляж|дубляж\s*\/\s*оригинал|оригинал\s*\/\s*по\s+умолчанию|по\s+умолчанию)$/i;
    const hasSpecificTranslator = Boolean(params.translatorName && !genericTrRe.test(params.translatorName.trim()));

    const state: { best: StreamData | null } = { best: null };
    const needStrictUpgrade = () => Boolean(state.best && hasSpecificTranslator);
    const considerStream = (candidate: StreamData | null) => {
      if (!candidate || !candidate.streams || candidate.streams.length === 0) return false;
      state.best = pickBetterQualityStream(state.best, [candidate]);
      return getMaxQualityScore(state.best?.streams) >= 1080;
    };

    const cachedUrl = this.mediaUrlCache.get(params.mediaId) || cachedItem?.url || '';
    const isHdStudioItem =
      forceCollapsByOffset ||
      this.isHdStudio(params.mediaId) ||
      this.isHdStudio(cachedUrl) ||
      /^hdstudio-/i.test(params.mediaId);

    let knownKpId =
      this.kpIdCache.get(params.mediaId) ||
      (cachedUrl ? this.kpIdCache.get(cachedUrl) : undefined);

    let triedCollaps = false;
    if (isHdStudioItem) {
      triedCollaps = true;
      if (!knownKpId) {
        const hdUrl = await this.resolveHdStudioUrl(params.mediaId, metaForResolve);
        if (hdUrl) {
          const hdHtml = await this.fetchHdStudioPage(hdUrl, 4000);
          const em = hdHtml?.match(/\/embed\/kp\/(\d+)/i);
          if (em?.[1]) {
            knownKpId = em[1];
            this.kpIdCache.set(params.mediaId, knownKpId);
          }
        }
      }
      if (knownKpId) {
        const cStream = await this.getCollapsStream(knownKpId, {
          season: params.season,
          episode: params.episode,
          translatorName: params.translatorName,
          translatorId: normalizedTrId,
        });
        if (considerStream(cStream)) return state.best;
      }
    }

    let triedKinogo = false;
    if (!forceKinobaseByOffset && !forceCollapsByOffset && (forceKinogoByOffset || this.isKinogo() || this.isKinogo(params.mediaId) || this.isKinogo(cachedItem?.url))) {
      triedKinogo = true;
      const kinogoUrl = await this.resolveKinogoUrl(params.mediaId, metaForResolve);
      if (kinogoUrl) {
        const gStream = await this.getKinogoStream(kinogoUrl, {
          ...params,
          translatorId: normalizedTrId,
          translatorName: params.translatorName,
          strictTranslatorMatch: needStrictUpgrade(),
        });
        if (considerStream(gStream)) return state.best;
      }
    }

    let filmUrl = await this.resolveKinobaseUrl(params.mediaId, metaForResolve);
    if (!filmUrl && metaForResolve.title?.includes(':')) {
      const shortTitle = metaForResolve.title.split(':')[0].trim();
      if (shortTitle.length >= 3) {
        filmUrl = await this.resolveKinobaseUrl(params.mediaId, { ...metaForResolve, title: shortTitle });
      }
    }
    const pd = filmUrl ? await this.extractKinobasePlayerData(filmUrl) : null;
    if (pd?.kpId && !knownKpId) {
      knownKpId = pd.kpId;
      this.kpIdCache.set(params.mediaId, pd.kpId);
    }

    if (pd?.file) {
      const parsed = this.parseKinobaseSeriesAndTranslators(pd.file, pd.subtitle);
      const streams = parsed.getEpisodeStreams(
        forceKinobaseByOffset ? normalizedTrId : params.translatorId,
        params.season,
        params.episode,
        params.translatorName,
        needStrictUpgrade()
      );
      if (streams.length > 0) {
        const kinobaseStream: StreamData = {
          streams,
          subtitles: parsed.subtitles,
          isAlternative: true,
          sourceName: filmUrl?.includes('kinovod.pro') ? 'Kinovod HLS' : 'Kinobase HLS',
          trailerUrl: pd.trailerUrl,
        };
        if (considerStream(kinobaseStream)) return state.best;
      }
    }

    // If current mirror only has <= 720p (or no stream), check balancer & sibling mirrors for 1080p+
    if (pd?.balancerSrc) {
      const bStream = await this.extractBalancerStream(
        pd.balancerSrc,
        params.episode,
        params.season,
        params.translatorName,
        needStrictUpgrade()
      );
      if (bStream && considerStream({ ...bStream, trailerUrl: pd.trailerUrl })) {
        return state.best;
      }
    }

    if (!triedKinogo) {
      let kinogoFallbackUrl = await this.resolveKinogoUrl(params.mediaId, metaForResolve);
      if (!kinogoFallbackUrl && metaForResolve.title?.includes(':')) {
        const shortTitle = metaForResolve.title.split(':')[0].trim();
        if (shortTitle.length >= 3) {
          kinogoFallbackUrl = await this.resolveKinogoUrl(params.mediaId, { ...metaForResolve, title: shortTitle });
        }
      }
      if (kinogoFallbackUrl) {
        const gStream = await this.getKinogoStream(kinogoFallbackUrl, {
          ...params,
          translatorId: normalizedTrId,
          translatorName: params.translatorName,
          strictTranslatorMatch: needStrictUpgrade(),
        });
        if (considerStream(gStream)) return state.best;
      }
    }

    // Universal Collaps / HDStudio fallback (apiplayers.insertunit.ws + api.delivembed.cc) — serves missing seasons & titles by kpId
    if (!triedCollaps && (!state.best || getMaxQualityScore(state.best.streams) < 1080)) {
      if (!knownKpId && (metaForResolve.title || metaForResolve.origTitle)) {
        if (params.season || metaForResolve.type === 'series') {
          const hdUrl = await this.resolveHdStudioUrl('', metaForResolve);
          if (hdUrl) {
            const hdHtml = await this.fetchHdStudioPage(hdUrl, 3500);
            const em = hdHtml?.match(/\/embed\/kp\/(\d+)/i);
            if (em?.[1]) {
              knownKpId = em[1];
              this.kpIdCache.set(params.mediaId, knownKpId);
            }
          }
        }
        if (!knownKpId) {
          knownKpId =
            (await this.resolveKinopoiskId(
              cleanTitleForSearch(metaForResolve.title) || metaForResolve.title || '',
              metaForResolve.year,
              metaForResolve.origTitle
            )) || undefined;
          if (knownKpId) this.kpIdCache.set(params.mediaId, knownKpId);
        }
      }

      if (knownKpId) {
        const cStream = await this.getCollapsStream(knownKpId, {
          season: params.season,
          episode: params.episode,
          translatorName: params.translatorName,
          translatorId: normalizedTrId,
          strictTranslatorMatch: needStrictUpgrade(),
        });
        if (cStream) {
          considerStream({ ...cStream, trailerUrl: pd?.trailerUrl });
        }
      }
    }

    return state.best;
  }

  public async getStream(params: {
    mediaId: string;
    translatorId: number;
    season?: number;
    episode?: number;
    isCamRip?: boolean;
    isAds?: boolean;
    isDirector?: boolean;
    title?: string;
    origTitle?: string;
    year?: number;
    translatorName?: string;
  }): Promise<StreamData> {
    const normId = params.mediaId ? String(params.mediaId).replace(/[^0-9]/g, '') : '';
    let cachedItem = this.mediaCache.get(params.mediaId) || this.mediaCache.get(normId);
    if (!cachedItem && normId) {
      for (const item of this.mediaCache.values()) {
        if (item.id === normId || (item.url && item.url.includes(`/${normId}-`))) {
          cachedItem = item;
          break;
        }
      }
    }

    const effectiveTitle = params.title || cachedItem?.title;
    const effectiveOrigTitle = params.origTitle || cachedItem?.origTitle;
    const effectiveYear = params.year || cachedItem?.year;

    const currentYear = new Date().getFullYear();
    const isUnreleasedMovie = !!(
      effectiveYear &&
      effectiveYear >= currentYear &&
      (!cachedItem?.type || cachedItem.type === 'films')
    );

    if (
      this.isKinobase() ||
      this.isKinobase(params.mediaId) ||
      this.isKinobase(cachedItem?.url) ||
      this.isKinobase(this.mediaUrlCache.get(params.mediaId) || this.mediaUrlCache.get(normId)) ||
      this.isKinogo() ||
      this.isKinogo(params.mediaId) ||
      this.isKinogo(cachedItem?.url) ||
      this.isKinogo(this.mediaUrlCache.get(params.mediaId) || this.mediaUrlCache.get(normId)) ||
      this.isHdStudio() ||
      this.isHdStudio(params.mediaId) ||
      this.isHdStudio(cachedItem?.url) ||
      this.isHdStudio(this.mediaUrlCache.get(params.mediaId) || this.mediaUrlCache.get(normId)) ||
      /^hdstudio-/i.test(params.mediaId) ||
      this.isAnimeMirror(params.mediaId) ||
      this.isAnimeMirror(cachedItem?.url) ||
      this.isAnimeMirror(this.mediaUrlCache.get(params.mediaId) || this.mediaUrlCache.get(normId)) ||
      /^yani-\d+$/i.test(params.mediaId)
    ) {
      const altStream = await this.findAlternativeStream({
        mediaId: params.mediaId,
        title: effectiveTitle,
        origTitle: effectiveOrigTitle,
        year: effectiveYear,
        season: params.season,
        episode: params.episode,
        translatorId: params.translatorId,
        translatorName: params.translatorName,
      });
      if (altStream && altStream.streams.length > 0) {
        return altStream;
      }
      throw new Error(
        isUnreleasedMovie
          ? `Фильм «${effectiveTitle || 'Фильм'}» (${effectiveYear || currentYear}) ещё не вышел в цифровой релиз.`
          : 'Видеопоток временно недоступен. Попробуйте выбрать другую озвучку или зеркало в Настройках.'
      );
    }

    // Fast path for unreleased future titles: don't loop through doomed mirrors
    const mirrorsToTry = isUnreleasedMovie
      ? [this.activeMirror]
      : [this.activeMirror, ...this.mirrors.filter((m) => m !== this.activeMirror).slice(0, 3)];

    const translatorsToTry: number[] = [];

    if (params.translatorId !== undefined && params.translatorId !== null) {
      translatorsToTry.push(params.translatorId);
    }

    if (!isUnreleasedMovie) {
      // If primary translator fails, try known popular fallbacks
      const cachedTranslators = ((cachedItem as any)?.translators || (this.mediaCache.get(params.mediaId) as any)?.translators);
      if (cachedTranslators) {
        for (const t of cachedTranslators) {
          if (!translatorsToTry.includes(t.id)) translatorsToTry.push(t.id);
        }
      }
      // Also include 0 for original/Russian tracks and core fallbacks
      for (const popId of [0, 56, 1]) {
        if (!translatorsToTry.includes(popId)) translatorsToTry.push(popId);
      }
    } else if (!translatorsToTry.includes(0)) {
      translatorsToTry.push(0);
    }

    const actionsToTry: Array<{ action: 'get_stream' | 'get_movie'; season?: number; episode?: number }> = [];
    if (params.season !== undefined && params.episode !== undefined && params.season > 0 && params.episode > 0) {
      actionsToTry.push({ action: 'get_stream', season: params.season, episode: params.episode });
      if (!isUnreleasedMovie) actionsToTry.push({ action: 'get_movie' });
    } else {
      actionsToTry.push({ action: 'get_movie' });
      if (!isUnreleasedMovie) actionsToTry.push({ action: 'get_stream', season: 1, episode: 1 });
    }

    let hadAntiBotOrSession = false;
    let lastActiveMirrorMessage = '';

    for (const mirror of mirrorsToTry) {
      let mirrorFailed = false;
      for (const trId of translatorsToTry) {
        if (mirrorFailed) break;
        if (trId === undefined || trId === null) continue;
        for (const act of actionsToTry) {
          try {
            const formData = new URLSearchParams();
            formData.append('id', params.mediaId);
            formData.append('translator_id', trId.toString());

            if (act.action === 'get_stream') {
              formData.append('season', (act.season || 1).toString());
              formData.append('episode', (act.episode || 1).toString());
              formData.append('action', 'get_stream');
            } else {
              formData.append('is_camrip', params.isCamRip ? '1' : '0');
              formData.append('is_ads', params.isAds ? '1' : '0');
              formData.append('is_director', params.isDirector ? '1' : '0');
              formData.append('action', 'get_movie');
            }

            let referer = this.mediaUrlCache.get(params.mediaId)?.replace(/^https?:\/\/[^/]+/, mirror);
            if (!referer || !referer.includes('.html')) {
              for (const item of this.mediaCache.values()) {
                if ((item.id === params.mediaId || item.url?.includes(`/${params.mediaId}-`)) && item.url?.includes('.html')) {
                  referer = item.url.startsWith('http')
                    ? item.url.replace(/^https?:\/\/[^/]+/, mirror)
                    : `${mirror}${item.url.startsWith('/') ? '' : '/'}${item.url}`;
                  break;
                }
              }
            }
            if (!referer || !referer.includes('.html')) {
              referer = `${mirror}/`;
            }

            const res = await appFetch(`${mirror}/ajax/get_cdn_series/?t=${Date.now()}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': referer,
                'User-Agent': BROWSER_USER_AGENT,
              },
              body: formData.toString(),
              signal: AbortSignal.timeout(isUnreleasedMovie ? 2500 : Math.min(this.timeoutMs, 4000)),
            });

            if (!res.ok) {
              mirrorFailed = true;
              break;
            }
            const text = await res.text();
            if (!text || text.trim().startsWith('<') || text.includes('<!doctype') || text.includes('<!DOCTYPE')) {
              // Only mark anti-bot challenge if the ACTIVE mirror requested it
              if (mirror === this.activeMirror && this.isAntiBot(text)) {
                hadAntiBotOrSession = true;
              }
              mirrorFailed = true;
              break;
            }
            let json: any;
            try {
              json = JSON.parse(text);
            } catch {
              mirrorFailed = true;
              break;
            }
            if (json && !json.success) {
              if (mirror === this.activeMirror) {
                if (this.isAntiBot(json.message || '')) {
                  hadAntiBotOrSession = true;
                  mirrorFailed = true;
                  break;
                } else if (json.message) {
                  lastActiveMirrorMessage = json.message;
                }
              }
              continue;
            }
            if (json && json.success && json.url) {
              const rezkaStream = parseStreamData(json.url, json.subtitle, json.thumbnails);
              // Auto-upgrade to an open mirror if this HDRezka mirror caps below 1080p
              if (
                !isUnreleasedMovie &&
                getMaxQualityScore(rezkaStream.streams) < 1080 &&
                (effectiveTitle || effectiveOrigTitle)
              ) {
                try {
                  const altCandidate = await this.findAlternativeStream({
                    mediaId: params.mediaId,
                    title: effectiveTitle,
                    origTitle: effectiveOrigTitle,
                    year: effectiveYear,
                    season: params.season,
                    episode: params.episode,
                    translatorId: params.translatorId,
                    translatorName: params.translatorName,
                  });
                  const upgraded = pickBetterQualityStream(rezkaStream, [altCandidate]);
                  if (upgraded) return upgraded;
                } catch (_) {}
              }
              return rezkaStream;
            }
          } catch (err: any) {
            mirrorFailed = true;
            break;
          }
        }
      }
    }

    // Try finding alternative stream online via Kinobase / web balancers
    if (!isUnreleasedMovie) {
      try {
        const altStream = await this.findAlternativeStream({
          mediaId: params.mediaId,
          title: effectiveTitle,
          origTitle: effectiveOrigTitle,
          year: effectiveYear,
          season: params.season,
          episode: params.episode,
          translatorId: params.translatorId,
          translatorName: params.translatorName,
        });
        if (altStream && altStream.streams && altStream.streams.length > 0) {
          return altStream;
        }
      } catch (_) {}
    }

    if (isUnreleasedMovie) {
      throw new Error(
        `Фильм «${effectiveTitle || 'Диггер'}» (${effectiveYear || currentYear}) ещё не вышел в прокат или цифровой релиз. Доступен официальный трейлер.`
      );
    }

    if (hadAntiBotOrSession) {
      throw new Error(
        'HDRezka требует пройти проверку «Я не бот» или обновить сессию. Нажмите «Пройти проверку» для запуска видео.'
      );
    }

    if (lastActiveMirrorMessage) {
      throw new Error(lastActiveMirrorMessage);
    }

    throw new Error(
      'Видеопоток временно недоступен или ограничен правообладателем на серверах HDRezka. Попробуйте выбрать другую озвучку, другое зеркало в Настройках или открыть другой фильм.'
    );
  }

  public async searchFast(query: string) {
    if (!query.trim()) return [];
    const animePromise = this.searchAnimeMirrors(query);
    if (this.isKinobase() || this.isKinogo() || this.isHdStudio()) {
      const [kItems, gItems, hItems, animeItems] = await Promise.all([
        this.searchKinobase(query),
        this.searchKinogo(query),
        this.searchHdStudio(query),
        animePromise,
      ]);
      const primary = this.isHdStudio()
        ? [...hItems, ...kItems, ...gItems, ...animeItems]
        : this.isKinogo()
          ? [...gItems, ...kItems, ...hItems, ...animeItems]
          : [...kItems, ...gItems, ...hItems, ...animeItems];
      const merged = this.dedupeMediaItems(primary);
      if (merged.length > 0) return merged.slice(0, 15);
    }
    try {
      const formData = new URLSearchParams();
      formData.append('q', query.trim());

      const res = await appFetch(`${this.activeMirror}/engine/ajax/search.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': this.activeMirror,
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const html = await res.text();
      if (this.isAntiBot(html)) throw new Error('Anti-bot challenge');
      const $ = cheerio.load(html);
      const results: Array<{
        id: string;
        title: string;
        url: string;
        rating?: number;
        origTitle?: string;
        year?: number;
        type?: ContentType;
      }> = [];

      $('.b-search__section_list li').each((_, el) => {
        const a = $(el).find('a');
        const title = $(el).find('.enty').text().trim() || a.text().trim();
        const url = a.attr('href') || '';
        const fullText = a.text().trim();
        const rText = $(el).find('.rating').text().trim();
        const rating = rText ? parseFloat(rText) : undefined;

        const yMatch = fullText.match(/\b(19\d{2}|20\d{2})\b/);
        const year = yMatch ? parseInt(yMatch[1], 10) : undefined;

        let type: ContentType = 'films';
        if (url.includes('/series/')) type = 'series';
        else if (url.includes('/cartoons/')) type = 'cartoons';
        else if (url.includes('/animation/')) type = 'animation';

        const parenMatch = fullText.match(/\(([^)]+)\)/);
        let origTitle = '';
        if (parenMatch) {
          const parts = parenMatch[1].split(',').map(s => s.trim());
          origTitle = parts.find(p => !/\b(19\d{2}|20\d{2})\b/.test(p) && !['мультфильм', 'сериал', 'аниме', 'фильм'].includes(p.toLowerCase())) || parts[0];
        }

        const id = url.split('/').pop()?.split('-')[0] || '';
        const cached = this.mediaCache.get(url) || this.mediaCache.get(id);
        const fbMatch = FALLBACK_ITEMS.find((fi) => fi.id === id || fi.url === url || fi.title.toLowerCase() === title.toLowerCase());
        const poster = cached?.poster || fbMatch?.poster || '';

        if (title && url) {
          const item = { id, title, origTitle, url, year, rating, type, poster };
          this.mediaCache.set(url, item);
          if (id) this.mediaCache.set(id, item);
          results.push(item);
        }
      });

      if (results.length > 0) {
        const animeItems = await animePromise;
        return this.dedupeMediaItems([...(results as any), ...animeItems]).slice(0, 15);
      }
    } catch {}

    const [kItems, gItems, hItems, animeItems] = await Promise.all([
      this.searchKinobase(query),
      this.searchKinogo(query),
      this.searchHdStudio(query),
      animePromise,
    ]);
    const combinedFallback = this.dedupeMediaItems([...kItems, ...gItems, ...hItems, ...animeItems]);
    if (combinedFallback.length > 0) return combinedFallback.slice(0, 15);

    const q = query.toLowerCase();
    return FALLBACK_ITEMS.filter(
      (i) => i.title.toLowerCase().includes(q) || (i.origTitle && i.origTitle.toLowerCase().includes(q))
    ).map((i) => {
      const item = {
        id: i.id,
        title: i.title,
        origTitle: i.origTitle,
        url: i.url,
        year: i.year,
        rating: i.rating,
        type: i.type,
      };
      this.mediaCache.set(i.url, item);
      this.mediaCache.set(i.id, item);
      return item;
    });
  }

  public async searchAdvanced(query: string, page = 1): Promise<SearchResult> {
    const animePromise = page === 1 ? this.searchAnimeMirrors(query) : Promise.resolve([]);
    if (this.isKinobase() || this.isKinogo() || this.isHdStudio()) {
      const backupOrigin = this.getKinobaseOrigin().includes('kinovod.pro')
        ? 'https://kinobase.org'
        : 'https://kinovod.pro';
      const [kItems, gItems, hItems, animeItems] = await Promise.all([
        this.searchKinobase(query),
        page === 1 ? this.searchKinogo(query) : Promise.resolve([]),
        page === 1 ? this.searchHdStudio(query) : Promise.resolve([]),
        animePromise,
      ]);
      const kvItems = kItems.length === 0 && page === 1 ? await this.searchKinobase(query, backupOrigin) : [];
      const primary = this.isHdStudio()
        ? [...hItems, ...kItems, ...kvItems, ...gItems, ...animeItems]
        : this.isKinogo()
          ? [...gItems, ...kItems, ...kvItems, ...hItems, ...animeItems]
          : [...kItems, ...kvItems, ...gItems, ...hItems, ...animeItems];
      const merged = this.dedupeMediaItems(primary);
      if (merged.length > 0) {
        return { items: merged, page: 1, hasMore: false };
      }
    }
    try {
      const url = `${this.activeMirror}/search/?do=search&subaction=search&q=${encodeURIComponent(query)}&page=${page}`;
      const html = await this.fetchHtml(url);
      if (this.isAntiBot(html)) throw new Error('Anti-bot challenge');
      const $ = cheerio.load(html);

      const items: MediaItem[] = [];
      $('.b-content__inline_item').each((_, el) => {
        const item = this.parseItem($(el), $);
        if (item) {
          this.mediaCache.set(item.url, item);
          this.mediaCache.set(item.id, item);
          items.push(item);
        }
      });

      if (items.length > 0) {
        const animeItems = await animePromise;
        const merged = this.dedupeMediaItems([...items, ...animeItems]);
        const hasMore = $('.b-navigation__next, a:contains("Вперед"), a:contains("Вперёд")').length > 0;
        return {
          items: merged,
          page,
          hasMore,
        };
      }
    } catch {}

    // Fallback: Kinobase/Kinovod search, Kinogo search, HDStudio search, unprotected Anime mirrors
    const [kItems, gItems, hItems, animeItems] = await Promise.all([
      this.searchKinobase(query),
      this.searchKinogo(query),
      this.searchHdStudio(query),
      animePromise,
    ]);
    const combinedAdv = this.dedupeMediaItems([...kItems, ...gItems, ...hItems, ...animeItems]);
    if (combinedAdv.length > 0) {
      return { items: combinedAdv, page: 1, hasMore: false };
    }

    const fastResults = await this.searchFast(query);
    const q = query.toLowerCase();
    const fallbackMatches = FALLBACK_ITEMS.filter(
      (i) => i.title.toLowerCase().includes(q) || (i.origTitle && i.origTitle.toLowerCase().includes(q))
    );

    const items: MediaItem[] = [];
    const seen = new Set<string>();

    for (const fr of fastResults) {
      if (!seen.has(fr.url)) {
        seen.add(fr.url);
        const fbMatch = FALLBACK_ITEMS.find(
          (fi) => fi.id === fr.id || fi.url === fr.url || fi.title.toLowerCase() === fr.title.toLowerCase()
        );
        const item: MediaItem = {
          id: fr.id || fr.url,
          title: fr.title,
          origTitle: fr.origTitle || fbMatch?.origTitle,
          url: fr.url,
          year: fr.year || fbMatch?.year,
          rating: fr.rating || fbMatch?.rating,
          type: fr.type || fbMatch?.type || 'films',
          poster: fbMatch?.poster || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop&q=80',
          info: fbMatch?.info || `HDRezka: ${fr.title} (${fr.year || ''})`,
        };
        this.mediaCache.set(fr.url, item);
        this.mediaCache.set(item.id, item);
        items.push(item);
      }
    }

    for (const fb of fallbackMatches) {
      if (!seen.has(fb.url)) {
        seen.add(fb.url);
        this.mediaCache.set(fb.url, fb);
        this.mediaCache.set(fb.id, fb);
        items.push(fb);
      }
    }

    return {
      items,
      page: 1,
      hasMore: false,
    };
  }
}
