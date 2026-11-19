const test = require('node:test');
const assert = require('node:assert');

const KNOWN_SALTS = [
  'IyMjI14hISMjIUBA',
  'QEBAQEAhIyMhXl5e',
  'JCQhIUAkJEBeIUAjJCRA',
  'JCQjISFAIyFAIyM=',
  'Xl5eIUAjIyEhIyM=',
];
const SALT_FALLBACK_LEN = 16;

function decodeStreamUrl(rawUrl) {
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
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch {
    return str;
  }
}

function parseQualityStreams(decodedStr) {
  if (!decodedStr) return [];
  const results = [];
  const regex = /\[([^\]]+)\]([^,]+)/g;
  let match;

  while ((match = regex.exec(decodedStr)) !== null) {
    const rawQuality = match[1].trim();
    const urlGroup = match[2].trim();
    const isPremium = rawQuality.includes('prem-quality') || rawQuality.includes('prem-icon');
    const quality = rawQuality.replace(/<[^>]*>/g, '').trim();
    const urls = urlGroup.split(' or ').map(u => u.trim()).filter(Boolean);

    let hls = '';
    let mp4 = '';

    for (const u of urls) {
      if (u.endsWith(':hls:manifest.m3u8')) {
        if (!hls) hls = u;
      } else if (!mp4) {
        mp4 = u;
      }
    }
    if (hls && !mp4) mp4 = hls.replace(':hls:manifest.m3u8', '');

    if (quality && (hls || mp4)) {
      results.push({ quality, hls, mp4, isPremium });
    }
  }
  return results;
}

test('decodeStreamUrl returns plain text if already decoded', () => {
  const plain = '[720p]https://stream.voidboost.one/video.mp4';
  assert.strictEqual(decodeStreamUrl(plain), plain);
});

test('decodeStreamUrl decodes base64 payload properly', () => {
  const sample = '[1080p]https://test.cdn/video.mp4';
  const encoded = '#h' + Buffer.from(sample).toString('base64');
  assert.strictEqual(decodeStreamUrl(encoded), sample);
});

test('parseQualityStreams parses HLS and MP4 links correctly', () => {
  const sample = '[720p]https://cdn/v.mp4:hls:manifest.m3u8 or https://cdn/v.mp4,[1080p]https://cdn/v2.mp4:hls:manifest.m3u8 or https://cdn/v2.mp4';
  const streams = parseQualityStreams(sample);
  assert.strictEqual(streams.length, 2);
  assert.strictEqual(streams[0].quality, '720p');
  assert.strictEqual(streams[0].mp4, 'https://cdn/v.mp4');
  assert.strictEqual(streams[1].quality, '1080p');
});
