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
const localization = loadTsModule('src/core/providers/rezka/localization.ts');
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

test('translateVttCues caps GET URL length, handles line-count drift, and falls back to secondary translator', async () => {
  const cues = [];
  for (let i = 1; i <= 16; i++) {
    cues.push(
      `${i}\n00:00:${String(i).padStart(2, '0')}.000 --> 00:00:${String(i + 1).padStart(2, '0')}.000\nДлинная кириллическая фраза номер ${i} для проверки лимита длины URL`
    );
  }
  const vtt = `WEBVTT\n\n${cues.join('\n\n')}`;

  const urlsSeen = [];
  let gtxCalls = 0;
  let fallbackCalls = 0;

  const mockFetch = async (url) => {
    const u = String(url);
    urlsSeen.push(u);
    const qParam = new URL(u).searchParams.get('q') || '';
    if (u.includes('translate.googleapis.com')) {
      gtxCalls++;
      // Simulate rate limit (429) on first chunk so secondary endpoint is exercised
      if (gtxCalls === 1) return { ok: false, status: 429, json: async () => null };
      // Simulate line-count drift on a multi-line request (returns single merged line)
      if (qParam.includes('\n')) {
        return { ok: true, json: async () => [[['MERGED_DRIFT', qParam]]] };
      }
      return { ok: true, json: async () => [[[`EN:${qParam}`, qParam]]] };
    }
    if (u.includes('clients5.google.com')) {
      fallbackCalls++;
      const lines = qParam.split('\n').map((l) => `FB:${l}`).join('\n');
      return { ok: true, json: async () => [[lines, 'ru']] };
    }
    return { ok: false, json: async () => null };
  };

  const out = await localization.translateVttCues(vtt, 'en', mockFetch);

  assert.ok(urlsSeen.length > 2, 'Large Cyrillic VTT must be split into safe URL-capped chunks');
  for (const u of urlsSeen) {
    assert.ok(u.length < 2200, `Request URL too long (${u.length} chars) — risks HTTP 414`);
  }
  assert.ok(fallbackCalls >= 1, 'Secondary Google endpoint must handle primary 429 failure');
  for (let i = 1; i <= 16; i++) {
    assert.ok(
      out.includes(`FB:Длинная кириллическая фраза номер ${i}`) ||
        out.includes(`EN:Длинная кириллическая фраза номер ${i}`),
      `Cue ${i} must be translated even after 429 or line-count drift`
    );
  }
});

test('Subtitle style defaults, translations (RU/UK/EN), WhatsNew, IPC, and VideoPlayer UI are wired cleanly', () => {
  assert.deepEqual(constants.DEFAULT_SUBTITLE_STYLE, {
    size: 100,
    position: 10,
    color: '#FFFFFF',
    background: 0.75,
    bold: true,
    delay: 0,
  });

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
  assert.match(playerSrc, /player-subtitle-overlay/);
  assert.match(playerSrc, /DEFAULT_SUBTITLE_STYLE/);
  assert.match(playerSrc, /translators:\s*mediaDetails\.translators/);
  assert.match(playerSrc, /t\.player\.subtitlePreview/);
  assert.match(ipcSrc, /collectVoiceoverSubtitles/);
  assert.match(ipcSrc, /earlyStop:/);
});
