import { VideoQualityStream, SubtitleTrack, StreamData } from '../../../shared/types';

const KNOWN_SALTS = [
  'IyMjI14hISMjIUBA',
  'QEBAQEAhIyMhXl5e',
  'JCQhIUAkJEBeIUAjJCRA',
  'JCQjISFAIyFAIyM=',
  'Xl5eIUAjIyEhIyM=',
];
const SALT_FALLBACK_LEN = 16;

/**
 * Decodes the obfuscated stream URL returned by HDRezka / Voidboost
 */
export function decodeStreamUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('[') || rawUrl.startsWith('http')) {
    return rawUrl;
  }

  let str = rawUrl.startsWith('#h') ? rawUrl.substring(2) : rawUrl;

  for (let i = 0; i < 60 && str.includes('//_//'); i++) {
    const idx = str.indexOf('//_//');
    const after = str.substring(idx + 5);
    let matched = false;

    for (const salt of KNOWN_SALTS) {
      if (after.startsWith(salt)) {
        str = str.substring(0, idx) + after.substring(salt.length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      const end = Math.min(idx + 5 + SALT_FALLBACK_LEN, str.length);
      str = str.substring(0, idx) + str.substring(end);
    }
  }

  try {
    const decoded = Buffer.from(str, 'base64').toString('utf-8');
    return decoded;
  } catch {
    return str;
  }
}

/**
 * Parses decoded quality streams string:
 * [360p]https://...:hls:manifest.m3u8 or https://...mp4,[720p]...
 */
export function parseQualityStreams(decodedStr: string): VideoQualityStream[] {
  if (!decodedStr) return [];
  const results: VideoQualityStream[] = [];
  const regex = /\[([^\]]+)\]([^,]+)/g;
  let match;

  while ((match = regex.exec(decodedStr)) !== null) {
    const rawQuality = match[1].trim();
    const urlGroup = match[2].trim();

    // Check if it's premium
    const isPremium = rawQuality.includes('prem-quality') || rawQuality.includes('prem-icon');
    // Strip HTML tags from quality label
    const quality = rawQuality.replace(/<[^>]*>/g, '').trim();

    // Split alternatives
    const urls = urlGroup.split(' or ').map(u => u.trim()).filter(Boolean);
    let hls = '';
    let mp4 = '';

    const hasHLSSuffix = urls.some(u => u.endsWith(':hls:manifest.m3u8'));
    if (hasHLSSuffix) {
      for (const u of urls) {
        if (u.endsWith(':hls:manifest.m3u8')) {
          if (!hls) hls = u;
        } else if (!mp4) {
          mp4 = u;
        }
      }
      if (hls && !mp4) {
        mp4 = hls.replace(':hls:manifest.m3u8', '');
      }
    } else {
      hls = urls[0] || '';
      mp4 = urls.length > 1 ? urls[urls.length - 1] : hls;
    }

    if (quality && (hls || mp4)) {
      results.push({
        quality,
        hls,
        mp4,
        isPremium,
      });
    }
  }

  return results;
}

/**
 * Parses subtitles string:
 * [Русский]https://static.voidboost.com/....vtt,[English]https://...
 */
export function parseSubtitles(subtitlesRaw?: string): SubtitleTrack[] {
  if (!subtitlesRaw) return [];
  const tracks: SubtitleTrack[] = [];
  const parts = subtitlesRaw.split(',');

  for (const part of parts) {
    const bracketEnd = part.indexOf(']');
    if (bracketEnd === -1) continue;
    const language = part.substring(1, bracketEnd).trim();
    let url = part.substring(bracketEnd + 1).trim();
    if (url.includes(' or ')) {
      const subParts = url.split(' or ');
      url = subParts[subParts.length - 1].trim();
    }
    if (language && url) {
      tracks.push({ language, url });
    }
  }

  return tracks;
}

/**
 * Rewrites ISP-blocked Voidboost/Ukrtelcdn CDN domains to working public mirrors
 */
export function getUnblockedCdnUrl(url: string): string {
  if (!url) return '';
  return url
    .replace(/https?:\/\/stream\.voidboost\.(?:cc|top|club|link)/i, 'https://femeretes.org')
    .replace(/https?:\/\/[a-z0-9.-]+\.ukrtelcdn\.net/i, 'https://vdbmate.org');
}

export function parseStreamData(rawUrl: string, rawSubtitles?: string, thumbnails?: string): StreamData {
  const decoded = decodeStreamUrl(rawUrl);
  const streams = parseQualityStreams(decoded);
  const subtitles = parseSubtitles(rawSubtitles);

  return {
    streams,
    subtitles,
    thumbnails,
  };
}
