const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');

function loadTsModule(relPath) {
  const absPath = path.resolve(__dirname, '..', relPath);
  const built = esbuild.buildSync({
    entryPoints: [absPath],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['electron'],
  });
  const mod = { exports: {} };
  const fn = new Function('require', 'module', 'exports', built.outputFiles[0].text);
  fn(require, mod, mod.exports);
  return mod.exports;
}

const constants = loadTsModule('src/shared/constants/index.ts');
const utils = loadTsModule('src/shared/utils/index.ts');
const localization = loadTsModule('src/core/providers/rezka/localization.ts');
const { RezkaProvider } = loadTsModule('src/core/providers/rezka/provider.ts');
const { translations } = loadTsModule('src/renderer/i18n/translations.ts');

test('collectVoiceoverSubtitles prioritizes original/subtitle voiceovers, deduplicates, ignores errors, and stops early', async () => {
  const visited = [];
  const translators = [
    { id: 1, name: 'Дублированный HDrezka' },
    { id: 2, name: 'LostFilm' },
    { id: 3, name: 'Кравец' },
    { id: 4, name: 'Оригинал (+субтитры)' },
    { id: 5, name: 'NewStudio' },
  ];

  const tracks = await localization.collectVoiceoverSubtitles(
    translators,
    1,
    async (id) => {
      visited.push(id);
      if (id === 4) {
        return [{ language: 'Русский', url: 'https://cdn.example.com/ru.vtt' }];
      }
      if (id === 2) throw new Error('mirror timeout');
      return [{ language: 'Русский', url: 'https://cdn.example.com/ru.vtt' }];
    },
    { concurrency: 1, earlyStop: (s) => s.language === 'Русский' }
  );

  assert.equal(visited[0], 4, 'Original/subtitles voiceover must be probed first');
  assert.deepEqual(visited, [4], 'Must stop early once matching track is found');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].url, 'https://cdn.example.com/ru.vtt');
});

test('collectVoiceoverSubtitles respects timeoutMs and returns already-found tracks', async () => {
  const translators = [
    { id: 10, name: 'Субтитры' },
    { id: 20, name: 'Медленный дубляж' },
  ];
  const tracks = await localization.collectVoiceoverSubtitles(
    translators,
    1,
    async (id) => {
      if (id === 10) return [{ language: 'English', url: 'https://cdn.example.com/fast.vtt' }];
      await new Promise((r) => setTimeout(r, 300));
      return [{ language: 'Русский', url: 'https://cdn.example.com/slow.vtt' }];
    },
    { timeoutMs: 40 }
  );

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].url, 'https://cdn.example.com/fast.vtt');
});

test('fetchSubtitleTrack finds direct subtitles on another mirror voiceover when current dub has none', async () => {
  localization.clearLocalizationCaches();
  const sampleVtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nПривет из другой озвучки';
  let receivedHeaders = null;
  const mockFetch = async (url, init) => {
    if (String(url) === 'https://cdn.example.com/odyssey-ru.vtt') {
      receivedHeaders = init?.headers || null;
      return { ok: true, text: async () => sampleVtt };
    }
    return { ok: false, json: async () => ({}), text: async () => '' };
  };

  const res = await localization.fetchSubtitleTrack(
    {
      title: 'Одиссея',
      origTitle: 'The Odyssey',
      year: 1997,
      season: 1,
      episode: 1,
      lang: 'ru',
      existingSubtitles: [],
    },
    mockFetch,
    async () => [{ language: 'Русский', url: '//cdn.example.com/odyssey-ru.vtt' }]
  );

  assert.ok(res);
  assert.equal(res.source, 'stream');
  assert.equal(res.langCode, 'ru');
  assert.ok(res.vtt.includes('Привет из другой озвучки'));
  assert.equal(receivedHeaders?.Referer, 'https://cdn.example.com/');
});

test('fetchSubtitleTrack auto-translates another voiceover track when target language is missing everywhere', async () => {
  localization.clearLocalizationCaches();
  const sampleSrt = '1\n00:00:02,000 --> 00:00:05,000\nWelcome home\n\n2\n00:00:06,000 --> 00:00:09,000\nLong journey';
  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes('sub-en.srt')) {
      return { ok: true, text: async () => sampleSrt };
    }
    if (u.includes('translate.googleapis.com')) {
      return {
        ok: true,
        json: async () => [[['Добро пожаловать домой\nДолгое путешествие', 'Welcome home\nLong journey']]],
      };
    }
    return { ok: false, json: async () => ({}), text: async () => '' };
  };

  const res = await localization.fetchSubtitleTrack(
    {
      title: 'Одиссея',
      origTitle: 'The Odyssey',
      lang: 'ru',
      existingSubtitles: [],
    },
    mockFetch,
    async () => [{ language: 'English', url: 'https://cdn.example.com/sub-en.srt' }]
  );

  assert.ok(res);
  assert.equal(res.source, 'translated');
  assert.equal(res.translated, true);
  assert.ok(res.vtt.includes('Добро пожаловать домой'));
  assert.ok(res.vtt.includes('Долгое путешествие'));
});

test('fetchSubtitleTrack falls back from S01E01 series lookup to movie lookup and decodes Windows-1251 SRT', async () => {
  localization.clearLocalizationCaches();
  // "Привет" in Windows-1251 bytes: CF F0 E8 E2 E5 F2
  const header = Buffer.from('1\n00:00:01,000 --> 00:00:03,000\n', 'ascii');
  const cp1251Word = Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
  const fullBuf = Buffer.concat([header, cp1251Word]);

  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes('/catalog/series/')) {
      return { ok: true, json: async () => ({ metas: [] }) };
    }
    if (u.includes('/catalog/movie/')) {
      return { ok: true, json: async () => ({ metas: [{ imdb_id: 'tt0118414', releaseInfo: '1997' }] }) };
    }
    if (u.includes('/subtitles/movie/tt0118414.json')) {
      return { ok: true, json: async () => ({ subtitles: [{ lang: 'rus', url: 'https://subs.example.com/ru.srt' }] }) };
    }
    if (u.includes('subs.example.com/ru.srt')) {
      return {
        ok: true,
        arrayBuffer: async () => fullBuf.buffer.slice(fullBuf.byteOffset, fullBuf.byteOffset + fullBuf.byteLength),
      };
    }
    return { ok: false, json: async () => ({}), text: async () => '' };
  };

  const res = await localization.fetchSubtitleTrack(
    {
      title: 'Одиссея',
      origTitle: 'The Odyssey',
      year: 1997,
      season: 1,
      episode: 1,
      lang: 'ru',
      existingSubtitles: [],
    },
    mockFetch
  );

  assert.ok(res);
  assert.equal(res.source, 'opensubtitles');
  assert.ok(res.vtt.includes('Привет'), 'Windows-1251 SRT must decode cleanly to UTF-8');
});

test('translateVttCues uses POST on primary, keeps fallback GET URLs short, binary-splits on drift, and falls back to secondary translator', async () => {
  const cues = [];
  for (let i = 1; i <= 16; i++) {
    cues.push(
      `${i}\n00:00:${String(i).padStart(2, '0')}.000 --> 00:00:${String(i + 1).padStart(2, '0')}.000\nДлинная кириллическая фраза номер ${i} для проверки лимита длины URL`
    );
  }
  const vtt = `WEBVTT\n\n${cues.join('\n\n')}`;

  const getUrlsSeen = [];
  let postCalls = 0;
  let gtxCalls = 0;
  let fallbackCalls = 0;

  const mockFetch = async (url, init) => {
    const u = String(url);
    const isPost = (init?.method || 'GET').toUpperCase() === 'POST';
    const qParam = isPost
      ? new URLSearchParams(String(init?.body || '')).get('q') || ''
      : new URL(u).searchParams.get('q') || '';

    if (u.includes('translate.googleapis.com')) {
      gtxCalls++;
      if (isPost) postCalls++;
      // Simulate rate limit (429) on first chunk so secondary endpoint (with safe GET splitting) is exercised
      if (gtxCalls === 1) return { ok: false, status: 429, json: async () => null };
      // Simulate line-count drift on batches > 4 lines so binary split is exercised
      if (qParam.split('\n').length > 4) {
        return { ok: true, json: async () => [[['MERGED_DRIFT', qParam]]] };
      }
      const out = qParam.split('\n').map((l) => `EN:${l}`).join('\n');
      return { ok: true, json: async () => [[[out, qParam]]] };
    }
    if (u.includes('clients5.google.com')) {
      getUrlsSeen.push(u);
      fallbackCalls++;
      const lines = qParam.split('\n').map((l) => `FB:${l}`).join('\n');
      return { ok: true, json: async () => [[lines, 'ru']] };
    }
    return { ok: false, json: async () => null };
  };

  const out = await localization.translateVttCues(vtt, 'en', mockFetch);

  assert.ok(postCalls >= 1, 'Primary Google Translate endpoint must use POST to avoid URL length caps');
  assert.ok(fallbackCalls >= 2, 'Secondary GET endpoint must split large Cyrillic payload into safe chunks');
  for (const u of getUrlsSeen) {
    assert.ok(u.length < 2200, `Fallback GET URL too long (${u.length} chars) — risks HTTP 414`);
  }
  for (let i = 1; i <= 16; i++) {
    assert.ok(
      out.includes(`FB:Длинная кириллическая фраза номер ${i}`) ||
        out.includes(`EN:Длинная кириллическая фраза номер ${i}`),
      `Cue ${i} must be translated even after 429 or line-count drift`
    );
  }
});

test('collectVoiceoverSubtitles keeps sibling tracks from matched voiceover before earlyStop', async () => {
  const tracks = await localization.collectVoiceoverSubtitles(
    [
      { id: 1, name: 'Дубляж' },
      { id: 2, name: 'Оригинал (+субтитры)' },
      { id: 3, name: 'LostFilm' },
    ],
    1,
    async (id) => {
      if (id === 2) {
        return [
          { language: 'Русский', url: 'https://cdn.example.com/dead-ru.vtt' },
          { language: 'English', url: 'https://cdn.example.com/working-en.vtt' },
        ];
      }
      return [{ language: 'Español', url: 'https://cdn.example.com/es.vtt' }];
    },
    { concurrency: 1, earlyStop: (s) => s.language === 'Русский' }
  );

  assert.equal(tracks.length, 2, 'Sibling English track on matched voiceover must not be dropped on earlyStop');
  assert.equal(tracks[1].url, 'https://cdn.example.com/working-en.vtt');
});

test('fetchSubtitleTrack translates Cyrillic origTitle, merges movie/<imdbId> on S01E01, and rejects failed translation', async () => {
  localization.clearLocalizationCaches();
  const sampleSrt = '1\n00:00:01,000 --> 00:00:03,000\nWelcome to Ithaca';
  const requestedUrls = [];

  const mockFetch = async (url, init) => {
    const u = String(url);
    requestedUrls.push(u);
    if (u.includes('translate.googleapis.com')) {
      const q = new URLSearchParams(String(init?.body || '')).get('q') || '';
      if (q === 'Одиссея') return { ok: true, json: async () => [[['The Odyssey', q]]] };
      return { ok: true, json: async () => [[['Добро пожаловать на Итаку', q]]] };
    }
    if (u.includes('/catalog/series/top/search=The%20Odyssey.json')) {
      return { ok: true, json: async () => ({ metas: [{ imdb_id: 'tt0118414', releaseInfo: '1997' }] }) };
    }
    if (u.includes('/subtitles/series/tt0118414:1:1.json')) {
      return { ok: true, json: async () => ({ subtitles: [{ lang: 'spa', url: 'https://subs.example.com/es.srt' }] }) };
    }
    if (u.includes('/subtitles/movie/tt0118414.json')) {
      return { ok: true, json: async () => ({ subtitles: [{ lang: 'rus', url: 'https://subs.example.com/full-ru.srt' }] }) };
    }
    if (u.includes('full-ru.srt')) {
      return { ok: true, text: async () => '1\n00:00:01,000 --> 00:00:03,000\nПолный фильм Одиссея' };
    }
    return { ok: false, json: async () => ({}), text: async () => '' };
  };

  // Even when origTitle is Cyrillic equal to title, it must translate to English and merge movie/tt0118414.json
  const res = await localization.fetchSubtitleTrack(
    {
      title: 'Одиссея',
      origTitle: 'Одиссея',
      year: 1997,
      season: 1,
      episode: 1,
      lang: 'ru',
      existingSubtitles: [],
    },
    mockFetch
  );
  assert.ok(res);
  assert.equal(res.source, 'opensubtitles');
  assert.ok(res.vtt.includes('Полный фильм Одиссея'));
  assert.ok(requestedUrls.some((u) => u.includes('/subtitles/movie/tt0118414.json')));

  // When every translator endpoint fails, must NOT falsely return untranslated English as translated RU
  localization.clearLocalizationCaches();
  const offlineFetch = async (url) => {
    if (String(url).includes('only-en.srt')) return { ok: true, text: async () => sampleSrt };
    return { ok: false, status: 503, json: async () => null, text: async () => '' };
  };
  const failed = await localization.fetchSubtitleTrack(
    {
      title: 'Offline Test',
      origTitle: 'Offline Test',
      lang: 'ru',
      existingSubtitles: [{ language: 'English', url: 'https://cdn.example.com/only-en.srt' }],
    },
    offlineFetch
  );
  assert.equal(failed, null, 'Total translator outage must return null rather than caching untranslated text');

  // Direct passthrough converts extra embedded .srt track cleanly to WebVTT
  const directRes = await localization.fetchSubtitleTrack(
    {
      lang: 'ru',
      directUrl: 'https://cdn.example.com/only-en.srt',
      directLanguage: 'Deutsch',
    },
    offlineFetch
  );
  assert.ok(directRes);
  assert.equal(directRes.language, 'Deutsch');
  assert.ok(directRes.vtt.startsWith('WEBVTT'));
  assert.ok(directRes.vtt.includes('Welcome to Ithaca'));
});

test('applySubtitleCueDelay and getVisibleSubtitleText prevent stuck ended cues and negative-delay overlaps', () => {
  const cues = [
    { startTime: 1, endTime: 4, text: 'First line' },
    { startTime: 6, endTime: 9, text: '{\\an8}Second line' },
  ];

  // Exact end boundary (t = 4.0) must NOT show the ended cue (WebVTT is [startTime, endTime))
  assert.equal(utils.getVisibleSubtitleText({ activeCues: [], cues }, 4.0, true), '');
  assert.equal(utils.getVisibleSubtitleText({ activeCues: [], cues }, 2.5, true), 'First line');
  assert.equal(utils.getVisibleSubtitleText({ activeCues: [], cues }, 7.0, true), 'Second line');

  // On live cuechange (allowScanFallback=false), empty activeCues clears immediately
  assert.equal(utils.getVisibleSubtitleText({ activeCues: [], cues }, 2.5, false), '');

  // Negative delay (-5s) shifts First line before 0s (zero-width 0..0) — must NEVER show at t = 0
  utils.applySubtitleCueDelay(cues, -5);
  assert.equal(cues[0].startTime, 0);
  assert.equal(cues[0].endTime, 0);
  assert.equal(cues[1].startTime, 1);
  assert.equal(cues[1].endTime, 4);
  assert.equal(utils.getVisibleSubtitleText({ activeCues: [], cues }, 0, true), '');
  assert.equal(utils.getVisibleSubtitleText({ activeCues: [], cues }, 2.0, true), 'Second line');

  // Forward delay (+10s) restores from original timings without startTime > endTime inversion
  utils.applySubtitleCueDelay(cues, 10);
  assert.equal(cues[0].startTime, 11);
  assert.equal(cues[0].endTime, 14);
  assert.equal(utils.getVisibleSubtitleText({ activeCues: [], cues }, 12, true), 'First line');
});

test('RezkaProvider.parseKinobaseSeriesAndTranslators preserves per-episode subtitles', () => {
  const provider = new RezkaProvider();
  const parsed = provider.parseKinobaseSeriesAndTranslators([
    {
      title: 'Сезон 1',
      folder: [
        {
          title: 'Серия 1',
          file: '[1080p]{Дубляж}https://cdn.example.com/s1e1.m3u8',
          subtitle: '[Русский]https://cdn.example.com/s1e1-ru.vtt,[English]https://cdn.example.com/s1e1-en.vtt',
        },
        {
          title: 'Серия 2',
          file: '[1080p]{Дубляж}https://cdn.example.com/s1e2.m3u8',
          subtitle: '[English]https://cdn.example.com/s1e2-en.vtt',
        },
      ],
    },
  ]);

  const s1e1Subs = parsed.getEpisodeSubtitles(1, 1);
  const s1e2Subs = parsed.getEpisodeSubtitles(1, 2);
  assert.equal(s1e1Subs.length, 2);
  assert.equal(s1e1Subs[0].url, 'https://cdn.example.com/s1e1-ru.vtt');
  assert.equal(s1e2Subs.length, 1);
  assert.equal(s1e2Subs[0].url, 'https://cdn.example.com/s1e2-en.vtt');
});

test('Subtitle style defaults, DB merge, translations (RU/UK/EN), WhatsNew, IPC, and VideoPlayer UI are wired cleanly', () => {
  assert.deepEqual(constants.DEFAULT_SUBTITLE_STYLE, {
    size: 100,
    position: 10,
    color: '#FFFFFF',
    background: 0.75,
    bold: true,
    delay: 0,
  });
  assert.deepEqual(constants.DEFAULT_USER_SETTINGS.subtitleStyle, constants.DEFAULT_SUBTITLE_STYLE);

  for (const loc of ['ru', 'uk', 'en']) {
    const p = translations[loc].player;
    assert.ok(p.subtitlesSearching);
    assert.ok(p.subtitleSettings);
    assert.ok(p.subtitleReset);
    assert.ok(p.subtitleSize);
    assert.ok(p.subtitlePosition);
    assert.ok(p.subtitleBackground);
    assert.ok(p.subtitleDelay);
    assert.ok(p.subtitleColor);
    assert.ok(p.subtitleBold);
    assert.ok(p.subtitlePreview);
    assert.ok(translations[loc].whatsNew.f1_title);
    assert.ok(translations[loc].whatsNew.f2_title);
    assert.ok(translations[loc].whatsNew.f3_title);
    assert.ok(translations[loc].whatsNew.f4_title);
  }

  const playerSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/VideoPlayer.tsx'), 'utf8');
  const ipcSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/ipc/index.ts'), 'utf8');
  const dbSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/database/index.ts'), 'utf8');
  assert.match(playerSrc, /player-subtitle-overlay/);
  assert.match(playerSrc, /DEFAULT_SUBTITLE_STYLE/);
  assert.match(playerSrc, /translators:\s*mediaDetails\.translators/);
  assert.match(playerSrc, /t\.player\.subtitlePreview/);
  assert.match(playerSrc, /applySubtitleCueDelay/);
  assert.match(playerSrc, /getVisibleSubtitleText/);
  assert.match(ipcSrc, /collectVoiceoverSubtitles/);
  assert.match(ipcSrc, /subtitlesOnly:\s*true/);
  assert.match(ipcSrc, /earlyStop:/);
  assert.match(dbSrc, /DEFAULT_SUBTITLE_STYLE/);
});
