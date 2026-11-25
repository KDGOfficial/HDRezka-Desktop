const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const buildResult = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/core/providers/rezka/provider.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  write: false,
});

const m = { exports: {} };
new Function('module', 'exports', 'require', buildResult.outputFiles[0].text)(m, m.exports, require);
const { RezkaProvider } = m.exports;

const constBuild = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/shared/constants/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const cm = { exports: {} };
new Function('module', 'exports', 'require', constBuild.outputFiles[0].text)(cm, cm.exports, require);
const { ANIME_MIRROR_SEEDS } = cm.exports;

test('ANIME_MIRROR_SEEDS includes open captcha-free AniLiberty and AnimeVost mirrors', () => {
  assert.ok(ANIME_MIRROR_SEEDS.includes('https://aniliberty.top'));
  assert.ok(ANIME_MIRROR_SEEDS.includes('https://anilibria.wtf'));
  assert.ok(ANIME_MIRROR_SEEDS.includes('https://api.animetop.info'));
  assert.ok(ANIME_MIRROR_SEEDS.includes('https://api.animevost.org'));
});

test('parseAniLibertyItems parses releases with absolute posters and animation type', () => {
  const provider = new RezkaProvider();
  const items = provider.parseAniLibertyItems(
    [
      {
        id: 10323,
        year: 2026,
        name: { main: 'Магическая битва', english: 'Jujutsu Kaisen' },
        poster: { optimized: { src: '/storage/releases/posters/10323/poster.webp' } },
        rating: 8.7,
      },
    ],
    'https://aniliberty.top'
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'aniliberty-10323');
  assert.equal(items[0].type, 'animation');
  assert.equal(items[0].title, 'Магическая битва');
  assert.equal(items[0].origTitle, 'Jujutsu Kaisen');
  assert.equal(items[0].poster, 'https://aniliberty.top/storage/releases/posters/10323/poster.webp');
  assert.equal(items[0].year, 2026);
});

test('parseAnimeVostItems strips episode brackets, splits origTitle, and scales 5-star rating to 10', () => {
  const provider = new RezkaProvider();
  const items = provider.parseAnimeVostItems([
    {
      id: 2497,
      title: 'Магическая битва / Jujutsu Kaisen [1-24 из 24]',
      year: '2020',
      rating: 450,
      votes: 100,
      urlImagePreview: 'https://static.animetop.info/img/2497.jpg',
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'animevost-2497');
  assert.equal(items[0].title, 'Магическая битва');
  assert.equal(items[0].origTitle, 'Jujutsu Kaisen');
  assert.equal(items[0].year, 2020);
  assert.equal(items[0].rating, 9);
  assert.equal(items[0].type, 'animation');
});

test('YummyAnime ignores source material ("Игра", "Манга") in raw.original and pickBestAnimeMatch rejects unrelated titles', () => {
  const provider = new RezkaProvider();
  const parsed = provider.parseYummyAnimeItems([
    {
      anime_id: 12597,
      title: 'Genshin Impact: Сумеру',
      original: 'Игра',
      other_titles: ['【原神】スメールPV', 'Genshin Impact: Sumeru PV'],
      year: 2022,
    },
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].origTitle, 'Genshin Impact: Sumeru PV');
  assert.notEqual(parsed[0].origTitle, 'Игра');

  // Even if stale origTitle="Игра" is passed, pickBestAnimeMatch must never match unrelated anime
  const wrongCandidates = [
    { id: 'aniliberty-1', title: 'Игра друзей', origTitle: 'Tomodachi Game', year: 2022, url: 'u1', poster: '', type: 'animation' },
    { id: 'aniliberty-2', title: 'Игра', origTitle: 'The Game', year: 2022, url: 'u2', poster: '', type: 'animation' },
  ];
  assert.equal(provider.pickBestAnimeMatch(wrongCandidates, 'Genshin Impact: Сумеру', 'Игра', 2022), null);

  // Exact/close anime title match still works
  const rightCandidates = [
    ...wrongCandidates,
    { id: 'aniliberty-99', title: 'Магическая битва', origTitle: 'Jujutsu Kaisen', year: 2020, url: 'u3', poster: '', type: 'animation' },
  ];
  const matched = provider.pickBestAnimeMatch(rightCandidates, 'Магическая битва', 'Jujutsu Kaisen', 2020);
  assert.equal(matched?.id, 'aniliberty-99');
});

test('getYummyAnimeStream resolves chosen dubbing embed URL and reports unreleased announcements', async () => {
  const provider = new RezkaProvider();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s.includes('/anime/12597/videos')) {
      return new Response(
        JSON.stringify({
          response: [
            { number: '1', data: { player: 'Плеер YouTube', dubbing: 'Озвучка  pancakeser' }, iframe_url: '//www.youtube.com/embed/K1oFJMn8oL8' },
            { number: '1', data: { player: 'Плеер YouTube', dubbing: 'Озвучка Filama' }, iframe_url: '//www.youtube.com/embed/QUIwQgUC5-c' },
          ],
        }),
        { status: 200 }
      );
    }
    if (s.includes('/anime/23776/videos')) {
      return new Response(JSON.stringify({ response: [] }), { status: 200 });
    }
    if (s.includes('/anime/23776')) {
      return new Response(
        JSON.stringify({ response: { title: 'Genshin Impact', anime_status: { alias: 'announcement', title: 'анонс' } } }),
        { status: 200 }
      );
    }
    return new Response('', { status: 404 });
  };
  try {
    const s1 = await provider.getYummyAnimeStream({ mediaId: 'yani-12597', episode: 1, translatorName: 'Озвучка Filama' });
    assert.ok(s1?.embedUrl?.includes('QUIwQgUC5-c'));
    assert.ok(s1?.embedUrl?.includes('autoplay=1'));

    const s2 = await provider.getYummyAnimeStream({ mediaId: 'yani-12597', episode: 1, translatorName: 'Озвучка pancakeser' });
    assert.ok(s2?.embedUrl?.includes('K1oFJMn8oL8'));

    await assert.rejects(
      () => provider.getYummyAnimeStream({ mediaId: 'yani-23776', title: 'Genshin Impact', episode: 1 }),
      /анонс/i
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('ANIME_MIRROR_SEEDS includes Anime365 (smotret-anime.org) and AnimeGO mirrors', () => {
  assert.ok(ANIME_MIRROR_SEEDS.includes('https://smotret-anime.org'));
  assert.ok(ANIME_MIRROR_SEEDS.includes('https://anime365.ru'));
  assert.ok(ANIME_MIRROR_SEEDS.includes('https://animego.org'));
});

test('parseAnime365Items parses CIS anime series cleanly', () => {
  const provider = new RezkaProvider();
  const items = provider.parseAnime365Items([
    {
      id: 8762,
      titles: { ru: 'Ван-Пис', romaji: 'One Piece' },
      year: 1999,
      myAnimeListScore: 8.72,
      posterUrl: 'https://smotret-anime.org/posters/8762.jpg',
      isHentai: 0,
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'anime365-8762');
  assert.equal(items[0].title, 'Ван-Пис');
  assert.equal(items[0].origTitle, 'One Piece');
  assert.equal(items[0].year, 1999);
  assert.equal(items[0].type, 'animation');
});

test('getAniLibertyStream returns null instead of episode 1 when requested episode is missing', async () => {
  const provider = new RezkaProvider();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s.includes('/api/v1/anime/releases/10290')) {
      return new Response(
        JSON.stringify({
          id: 10290,
          episodes: [{ ordinal: 1, hls_1080: 'https://cdn.example/ep1.m3u8' }],
        }),
        { status: 200 }
      );
    }
    return new Response('', { status: 404 });
  };
  try {
    const ep1 = await provider.getAniLibertyStream({ mediaId: 'aniliberty-10290', episode: 1 });
    assert.ok(ep1?.streams?.length === 1);
    const ep500 = await provider.getAniLibertyStream({ mediaId: 'aniliberty-10290', episode: 500 });
    assert.equal(ep500, null);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('enrichAnimeDetails merges full YummyAnime episodes and CIS dubs into truncated anime cards', async () => {
  const provider = new RezkaProvider();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s.includes('api.yani.tv/search')) {
      return new Response(
        JSON.stringify({
          response: [{ anime_id: 1512, title: 'Ван-Пис', other_titles: ['One Piece'], year: 1999 }],
        }),
        { status: 200 }
      );
    }
    if (s.includes('api.yani.tv/anime/1512/videos')) {
      return new Response(
        JSON.stringify({
          response: [
            { number: '1', data: { dubbing: 'Озвучка Persona99', player: 'Kodik' }, iframe_url: '//kodik.info/ep1' },
            { number: '500', data: { dubbing: 'Озвучка Persona99', player: 'Kodik' }, iframe_url: '//kodik.info/ep500' },
            { number: '1180', data: { dubbing: 'Озвучка Animedia', player: 'Kodik' }, iframe_url: '//kodik.info/ep1180' },
          ],
        }),
        { status: 200 }
      );
    }
    if (s.includes('api.yani.tv/anime/1512')) {
      return new Response(
        JSON.stringify({
          response: { anime_id: 1512, title: 'Ван-Пис', other_titles: ['One Piece'], year: 1999, genres: [{ title: 'Аниме' }], viewing_order: [] },
        }),
        { status: 200 }
      );
    }
    return new Response('', { status: 404 });
  };
  try {
    const enriched = await provider.enrichAnimeDetails({
      id: 'aniliberty-10290',
      title: 'Ван-Пис',
      origTitle: 'One Piece',
      poster: '',
      year: 1999,
      country: 'Япония',
      genres: ['Аниме'],
      type: 'animation',
      description: '',
      directors: [],
      actors: [],
      translators: [{ id: 1, name: 'AniLibria (1080p)', premium: false }],
      seasons: [{ id: 1, title: 'Сезон 1', episodes: [{ id: 1, episodeId: 1, seasonId: 1, title: 'Серия 1' }] }],
      similar: [],
    });
    const eps = enriched.seasons?.[0]?.episodes || [];
    assert.ok(eps.some((e) => e.episodeId === 500));
    assert.ok(eps.some((e) => e.episodeId === 1180));
    assert.ok(enriched.translators.some((tr) => tr.name.includes('Persona99')));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('SeriesNavigationPanel buildEpisodeChunks splits 1180 episodes into 50-episode ranges', () => {
  const navBuild = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/renderer/components/SeriesNavigationPanel.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'lucide-react'],
    write: false,
  });
  const nm = { exports: {} };
  new Function('module', 'exports', 'require', navBuild.outputFiles[0].text)(nm, nm.exports, (id) => {
    if (id === 'react' || id === 'lucide-react') return new Proxy({}, { get: () => () => null });
    return require(id);
  });
  const eps = Array.from({ length: 1180 }, (_, i) => ({ id: i + 1, episodeId: i + 1, seasonId: 1, title: `Серия ${i + 1}` }));
  const chunks = nm.exports.buildEpisodeChunks(eps, 50);
  assert.equal(chunks.length, 24);
  assert.equal(chunks[0].label, '1–50');
  assert.equal(chunks[23].label, '1151–1180');
});

test('checkMirrors probes all ANIME_MIRROR_SEEDS via real API/HTML endpoints and pruneProtectedMirrors never activates anime mirrors', async () => {
  const provider = new RezkaProvider('https://kinobase.org', ['https://kinobase.org']);
  const probedUrls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const s = String(url);
    probedUrls.push(s);
    if (s.includes('/api/v1/anime/releases/latest')) {
      return new Response(JSON.stringify([{ id: 10305, name: { main: 'Тест' } }]), { status: 200 });
    }
    if (s.includes('api.yani.tv/anime?limit=1')) {
      return new Response(JSON.stringify({ response: [{ anime_id: 1, title: 'Тест' }] }), { status: 200 });
    }
    if (s.includes('/api/series?limit=1')) {
      return new Response(JSON.stringify({ data: [{ id: 10, titles: { ru: 'Тест' } }] }), { status: 200 });
    }
    if (s.includes('/v1/last?page=1&quantity=1')) {
      return new Response(JSON.stringify({ data: [{ id: 20, title: 'Тест' }] }), { status: 200 });
    }
    if (s.includes('animego.')) {
      return new Response('<html><title>AnimeGO</title><body>animego ' + 'x'.repeat(250) + '</body></html>', { status: 200 });
    }
    if (s.includes('uakino.')) {
      return new Response('<html><title>UAKino</title><body>uakino ' + 'x'.repeat(250) + '</body></html>', { status: 200 });
    }
    if (s.includes('kinobase.org')) {
      return new Response('<html><title>Кинобейс</title><body>kinobase ' + 'x'.repeat(250) + '</body></html>', { status: 200 });
    }
    return new Response('', { status: 404 });
  };

  try {
    const statuses = await provider.checkMirrors(ANIME_MIRROR_SEEDS);
    assert.equal(statuses.length, ANIME_MIRROR_SEEDS.length);
    for (const st of statuses) {
      assert.equal(st.isAvailable, true, `Expected ${st.url} to be available`);
      assert.equal(st.needsVerification, false, `Expected ${st.url} not to need verification`);
    }
    assert.ok(probedUrls.some((u) => u.includes('aniliberty.top/api/v1/anime/releases/latest?limit=1')));
    assert.ok(probedUrls.some((u) => u.includes('api.yani.tv/anime?limit=1')));
    assert.ok(probedUrls.some((u) => u.includes('smotret-anime.org/api/series?limit=1')));
    assert.ok(probedUrls.some((u) => u.includes('api.animevost.org/v1/last?page=1&quantity=1')));

    // Anime mirrors must never be promoted as the main activeMirror
    const active = await provider.pruneProtectedMirrors(['https://aniliberty.top', 'https://kinobase.org']);
    assert.equal(active, 'https://kinobase.org');
    assert.deepEqual(provider.getMirrors(), ['https://kinobase.org']);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('SettingsPage, IPC CHECK_MIRRORS, useSettingsStore, and project rules include all anime mirrors', () => {
  const fs = require('node:fs');
  const settingsSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/SettingsPage.tsx'), 'utf8');
  const storeSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/stores/useSettingsStore.ts'), 'utf8');
  const ipcSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/ipc/index.ts'), 'utf8');
  const agentsMd = fs.readFileSync(path.resolve(__dirname, '../AGENTS.md'), 'utf8');
  const geminiMd = fs.readFileSync(path.resolve(__dirname, '../GEMINI.md'), 'utf8');

  assert.match(settingsSrc, /ANIME_MIRROR_SEEDS/);
  assert.match(settingsSrc, /t\.settings\.animeMirrors/);
  assert.match(storeSrc, /ANIME_MIRROR_SEEDS/);
  assert.match(ipcSrc, /ANIME_MIRROR_SEEDS/);
  assert.match(agentsMd, /ANIME_MIRROR_SEEDS/);
  assert.match(geminiMd, /ANIME_MIRROR_SEEDS/);
});
