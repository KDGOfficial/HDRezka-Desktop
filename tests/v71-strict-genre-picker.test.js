const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

function loadTsModule(relPath) {
  const res = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '..', relPath)],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    external: ['electron'],
    write: false,
  });
  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', res.outputFiles[0].text);
  fn(m, m.exports, require);
  return m.exports;
}

const rec = loadTsModule('src/shared/recommendations.ts');
const constants = loadTsModule('src/shared/constants/index.ts');
const { RezkaProvider } = loadTsModule('src/core/providers/rezka/provider.ts');
const { translations } = loadTsModule('src/renderer/i18n/translations.ts');

test('Strict genre selection never leaks watch-history similarCandidates or random off-genre films', () => {
  const analysis = rec.analyzeUserTaste({
    watchHistory: [
      {
        id: 'h1',
        mediaId: 'dune',
        title: 'Дюна',
        poster: 'dune.jpg',
        type: 'films',
        url: '/films/fiction/dune',
        currentTime: 7000,
        duration: 8000,
        percent: 88,
        lastWatchedAt: Date.now(),
      },
    ],
    enrichedDetailsMap: {
      dune: {
        id: 'dune',
        title: 'Дюна',
        genres: ['Фантастика', 'Приключения'],
        similar: [
          {
            id: 'sim-scifi',
            title: 'Интерстеллар',
            url: '/films/fiction/interstellar',
            poster: 'inter.jpg',
            type: 'films',
            year: 2014,
            rating: 9.2,
            genres: ['Фантастика', 'Драма'],
          },
          {
            id: 'sim-scifi-horror',
            title: 'Чужой',
            url: '/films/horror/alien',
            poster: 'alien.jpg',
            type: 'films',
            year: 1979,
            rating: 8.5,
            genres: ['Фантастика', 'Ужасы'],
          },
        ],
      },
    },
  });

  const candidates = [
    {
      id: 'com1',
      title: 'Случайная комедия',
      url: '/films/comedy/com1',
      poster: 'com1.jpg',
      type: 'films',
      year: 2026,
      rating: 9.0,
      genres: ['Комедии'],
    },
    {
      id: 'hor1',
      title: 'Заклятие',
      url: '/films/horror/hor1',
      poster: 'hor1.jpg',
      type: 'films',
      year: 2023,
      rating: 7.5,
      genres: ['Ужасы'],
    },
  ];

  const ranked = rec.rankInteractiveRecommendations({
    candidates,
    analysis,
    category: 'films',
    selectedGenres: ['horror'],
    strictGenres: true,
    mood: 'auto',
    currentYear: 2026,
  });

  assert.equal(ranked.length, 2, 'Only Horror titles may pass strict genre filter');
  assert.ok(ranked.every((r) => r.matchedSelectedGenres.includes('horror')));
  assert.ok(!ranked.some((r) => r.item.id === 'sim-scifi'), 'Off-genre similarCandidate must be excluded');
  assert.ok(!ranked.some((r) => r.item.id === 'com1'), 'Off-genre high-rated comedy must be excluded');
  assert.equal(ranked[0].item.id, 'sim-scifi-horror', 'Horror title that also matches taste ranks first');

  // If no candidates match selected genre, return empty array instead of random titles
  const emptyWestern = rec.rankInteractiveRecommendations({
    candidates,
    analysis,
    category: 'films',
    selectedGenres: ['western'],
    strictGenres: true,
  });
  assert.equal(emptyWestern.length, 0, 'Must never fall back to unrelated random genres');
});

test('Multi-genre mergeCandidateBatches combines genres and ranks intersection titles #1', () => {
  const horrorBatch = [
    { id: 'm1', title: 'Зомбилэнд', url: 'https://kinobase.org/film/1', poster: '1.jpg', type: 'films', rating: 7.7, genres: ['Ужасы'] },
    { id: 'm2', title: 'Чистый ужас', url: 'https://kinobase.org/film/2', poster: '2.jpg', type: 'films', rating: 8.3, genres: ['Ужасы'] },
  ];
  const comedyBatch = [
    { id: 'm1', title: 'Зомбилэнд', url: 'https://kinobase.org/film/1', poster: '1.jpg', type: 'films', rating: 7.7, genres: ['Комедии'] },
    { id: 'm3', title: 'Чистая комедия', url: 'https://kinobase.org/film/3', poster: '3.jpg', type: 'films', rating: 8.4, genres: ['Комедии'] },
  ];
  const dramaNoise = [
    { id: 'm4', title: 'Драма', url: 'https://kinobase.org/film/4', poster: '4.jpg', type: 'films', rating: 9.5, genres: ['Драмы'] },
  ];

  const merged = rec.mergeCandidateBatches([horrorBatch, comedyBatch, dramaNoise]);
  const zombieland = merged.find((i) => i.id === 'm1');
  assert.ok(zombieland);
  assert.deepEqual(zombieland.genres, ['Ужасы', 'Комедии']);

  const analysis = rec.analyzeUserTaste({});
  const ranked = rec.rankInteractiveRecommendations({
    candidates: merged,
    analysis,
    category: 'films',
    selectedGenres: ['horror', 'comedy'],
    strictGenres: true,
  });

  assert.equal(ranked.length, 3, 'Drama noise must be strictly excluded');
  assert.equal(ranked[0].item.id, 'm1', 'Horror+Comedy intersection must rank #1 over higher-rated single-genre items');
  assert.deepEqual(ranked[0].matchedSelectedGenres, ['horror', 'comedy']);
});

test('Explicit genre switch overrides prior negative session delta for that genre', () => {
  const analysis = rec.analyzeUserTaste({});
  let session = rec.createEmptyInteractiveSession();
  session = rec.applyInteractiveFeedback(
    session,
    { id: 'h-bad', title: 'Плохой ужас', url: '/films/horror/h-bad', poster: 'b.jpg', type: 'films', genres: ['Ужасы'] },
    'not_for_me'
  );
  assert.ok(session.genreDeltas.horror < 0);

  const ranked = rec.rankInteractiveRecommendations({
    candidates: [
      { id: 'h-good', title: 'Хороший ужас', url: '/films/horror/h-good', poster: 'g.jpg', type: 'films', rating: 8.0, genres: ['Ужасы'] },
    ],
    analysis,
    category: 'films',
    selectedGenres: ['horror'],
    strictGenres: true,
    session,
  });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].item.id, 'h-good');
  assert.ok(ranked[0].score > 10, 'Stale negative delta must not crush explicitly chosen genre');
});

test('Strict mood filter keeps on-mood items over unrelated high-rated items', () => {
  const analysis = rec.analyzeUserTaste({});
  const ranked = rec.rankInteractiveRecommendations({
    candidates: [
      { id: 'fam', title: 'Семейная сказка', url: '/films/family/1', poster: '1.jpg', type: 'films', rating: 9.1, genres: ['Семейные', 'Комедии'] },
      { id: 'thr', title: 'Мрачный триллер', url: '/films/thriller/2', poster: '2.jpg', type: 'films', rating: 7.4, genres: ['Триллеры'] },
    ],
    analysis,
    category: 'films',
    mood: 'dark',
  });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].item.id, 'thr');
  assert.equal(ranked[0].matchedMood, 'dark');
});

test('All GENRES ids and provider slugs normalize cleanly', () => {
  for (const g of constants.GENRES) {
    if (!g.id) continue;
    assert.equal(rec.normalizeGenreToId(g.id), g.id, `Genre id ${g.id} must normalize to itself`);
    assert.equal(rec.normalizeGenreToId(g.title), g.id, `Genre title ${g.title} must normalize to ${g.id}`);
  }
  assert.equal(rec.normalizeGenreToId('sci-fi'), 'fiction');
  assert.equal(rec.normalizeGenreToId('documental'), 'documentary');
  assert.equal(rec.normalizeGenreToId('military'), 'war');
  assert.equal(rec.normalizeGenreToId('biography'), 'biographical');
  assert.equal(rec.normalizeGenreToId('history'), 'historical');
  assert.equal(rec.normalizeGenreToId('adventure'), 'adventures');
  // AniLiberty / anime API Russian genre labels
  assert.equal(rec.normalizeGenreToId('Экшен'), 'action');
  assert.equal(rec.normalizeGenreToId('Музыка'), 'musical');
  assert.equal(rec.normalizeGenreToId('Этти'), 'erotica');
});

test('RezkaProvider getKinobaseCatalog requests real genre path, skips broken /animation/<genre> and erotica', async () => {
  const provider = new RezkaProvider('https://kinobase.org', ['https://kinobase.org']);
  const origFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (url) => {
    const u = String(url);
    requestedUrls.push(u);
    if (u.includes('kinogo.film/erotika/')) {
      return new Response('Not Found', { status: 404 });
    }
    if (u.includes('kinogo.film/cartoons/') || u.includes('kinogo.film/fantasy/')) {
      const kgHtml = `
        <div class="shortStory">
          <div class="hTitle"><h2><a href="https://kinogo.film/701-gravity.html">Гравити Фолз (1-2 сезон)</a></h2></div>
          <div class="sPoster"><img src="https://kinogo.film/uploads/701.jpg"></div>
          <div class="lenta"><div class="cont">1-2 сезон 1-20 серия</div></div>
          <div class="sInfo">
            <span><b>Жанр:</b><a href="https://kinogo.film/zarubezhnye_serialy/">Зарубежные сериалы</a>, <a href="https://kinogo.film/cartoons/">Мультфильмы</a>, <a href="https://kinogo.film/fantasy/">Фэнтези</a></span>
          </div>
        </div>
        <div class="shortStory">
          <div class="hTitle"><h2><a href="https://kinogo.film/702-live-fantasy.html">Властелин колец (2001)</a></h2></div>
          <div class="sPoster"><img src="https://kinogo.film/uploads/702.jpg"></div>
          <div class="sInfo">
            <span><b>Жанр:</b><a href="https://kinogo.film/films/">Фильмы</a>, <a href="https://kinogo.film/fantasy/">Фэнтези</a></span>
          </div>
        </div>`;
      return new Response(kgHtml, { status: 200 });
    }
    const html = `
      <ul>
        <li class="x1 item">
          <div class="poster"><a href="/film/101-alien"><img src="/storage/p1.jpg"></a></div>
          <div class="title"><a href="/film/101-alien">Чужой</a></div>
          <span class="rating">8.1</span><span class="year">1979</span>
        </li>
        <li class="x1 item">
          <div class="poster"><a href="/serial/202-anim"><img src="/storage/p2.jpg"></a></div>
          <div class="title"><a href="/serial/202-anim">Аниме сериал</a></div>
          <span class="rating">8.5</span><span class="year">2025</span>
        </li>
      </ul>`;
    return new Response(html, { status: 200 });
  };

  try {
    const horrorRes = await provider.getCatalog({ type: 'films', genre: 'horror', sort: 'popular', page: 1 });
    assert.ok(requestedUrls[0].includes('https://kinobase.org/films/horror?sort=rating'), `Got ${requestedUrls[0]}`);
    assert.ok(horrorRes.items.length > 0);
    assert.ok(horrorRes.items.every((it) => rec.extractItemGenreIds(it).includes('horror')));

    const scifiRes = await provider.getCatalog({ type: 'films', genre: 'fiction', sort: 'last', page: 2 });
    assert.ok(requestedUrls[1].includes('https://kinobase.org/films/sci-fi?page=2'), `Got ${requestedUrls[1]}`);
    assert.ok(scifiRes.items.every((it) => rec.extractItemGenreIds(it).includes('fiction')));

    // Unfiltered cartoons route on Kinobase preserves cartoons type even for /serial/ hrefs
    const plainCartoons = await provider.getCatalog({ type: 'cartoons', sort: 'popular', page: 1 });
    assert.ok(requestedUrls[2].includes('https://kinobase.org/animation?sort=rating'), `Got ${requestedUrls[2]}`);
    assert.ok(plainCartoons.items.every((it) => it.type === 'cartoons'));

    // Cartoons + specific genre must NOT hit broken Kinobase /animation/fantasy; falls back to Kinogo cartoons + strict type filter
    const beforeLen = requestedUrls.length;
    const fantasyCartoons = await provider.getCatalog({ type: 'cartoons', genre: 'fantasy', sort: 'popular', page: 1 });
    const cartoonGenreUrls = requestedUrls.slice(beforeLen);
    assert.ok(!cartoonGenreUrls.some((u) => u.includes('kinobase.org/animation/fantasy')), 'Must skip broken Kinobase /animation/<slug>');
    assert.equal(fantasyCartoons.items.length, 1, 'Must keep only cartoons and exclude live-action fantasy film');
    assert.equal(fantasyCartoons.items[0].type, 'cartoons');
    assert.ok(rec.extractItemGenreIds(fantasyCartoons.items[0]).includes('fantasy'));

    // Erotica on Kinobase must NOT return unfiltered /films stamped as Erotica or leak FALLBACK_ITEMS
    const eroticaRes = await provider.getCatalog({ type: 'films', genre: 'erotica', sort: 'popular', page: 1 });
    assert.equal(eroticaRes.items.length, 0, 'Unsupported erotica on Kinobase+Kinogo must return empty instead of random films');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('RezkaProvider Kinogo catalog maps war->military, classifies all 4 types accurately, and enforces filter.type', async () => {
  const provider = new RezkaProvider('https://kinogo.film', ['https://kinogo.film']);
  const origFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    const html = `
      <div class="shortStory">
        <div class="hTitle"><h2><a href="https://kinogo.film/555-war-film.html">Военный фильм (2024)</a></h2></div>
        <div class="sPoster"><img src="https://kinogo.film/uploads/555.jpg"></div>
        <div class="sInfo">
          <span><b>Жанр:</b><a href="https://kinogo.film/films/">Фильмы</a>, <a href="https://kinogo.film/military/">Военные</a>, <a href="https://kinogo.film/drama/">Драмы</a></span>
        </div>
      </div>
      <div class="shortStory">
        <div class="hTitle"><h2><a href="https://kinogo.film/556-war-series.html">Военный сериал (1-2 сезон)</a></h2></div>
        <div class="sPoster"><img src="https://kinogo.film/uploads/556.jpg"></div>
        <div class="lenta"><div class="cont">1-2 сезон 1-8 серия</div></div>
        <div class="sInfo">
          <span><b>Жанр:</b><a href="https://kinogo.film/zarubezhnye_serialy/">Зарубежные сериалы</a>, <a href="https://kinogo.film/military/">Военные</a></span>
        </div>
      </div>
      <div class="shortStory">
        <div class="hTitle"><h2><a href="https://kinogo.film/557-simpsons.html">Симпсоны (1-38 сезон)</a></h2></div>
        <div class="sPoster"><img src="https://kinogo.film/uploads/557.jpg"></div>
        <div class="lenta"><div class="cont">1-38 сезон 1-8 серия</div></div>
        <div class="sInfo">
          <span><b>Жанр:</b><a href="https://kinogo.film/zarubezhnye_serialy/">Зарубежные сериалы</a>, <a href="https://kinogo.film/cartoons/">Мультфильмы</a>, <a href="https://kinogo.film/military/">Военные</a></span>
        </div>
      </div>
      <div class="shortStory">
        <div class="hTitle"><h2><a href="https://kinogo.film/558-onepiece.html">Ван-Пис (1-25 сезон)</a></h2></div>
        <div class="sPoster"><img src="https://kinogo.film/uploads/558.jpg"></div>
        <div class="lenta"><div class="cont">1-25 сезон 1-1180 серия</div></div>
        <div class="sInfo">
          <span><b>Жанр:</b><a href="https://kinogo.film/zarubezhnye_serialy/">Зарубежные сериалы</a>, <a href="https://kinogo.film/anime/">Аниме</a>, <a href="https://kinogo.film/military/">Военные</a></span>
        </div>
      </div>`;
    return new Response(html, { status: 200 });
  };

  try {
    const filmsRes = await provider.getCatalog({ type: 'films', genre: 'war', sort: 'popular', page: 1 });
    assert.equal(requestedUrls[0], 'https://kinogo.film/military/');
    assert.equal(filmsRes.items.length, 1, 'Films request must return only films, excluding series/cartoons/anime');
    assert.equal(filmsRes.items[0].type, 'films');
    const gids = rec.extractItemGenreIds(filmsRes.items[0]);
    assert.ok(gids.includes('war'));
    assert.ok(gids.includes('drama'));

    const seriesRes = await provider.getCatalog({ type: 'series', genre: 'war', sort: 'popular', page: 1 });
    assert.equal(seriesRes.items.length, 1, 'Series request must return only live-action series');
    assert.equal(seriesRes.items[0].type, 'series');
    assert.equal(seriesRes.items[0].title, 'Военный сериал (1-2 сезон)');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('RezkaProvider getAnimeMirrorCatalog queries AniLiberty natively with f[genres] for specific genre', async () => {
  const provider = new RezkaProvider('https://kinobase.org', ['https://kinobase.org']);
  const origFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (url) => {
    const u = String(url);
    requestedUrls.push(u);
    if (u.includes('/api/v1/anime/catalog/releases')) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 1001,
              year: 2024,
              name: { main: 'Токийский Гуль', english: 'Tokyo Ghoul' },
              poster: { src: '/storage/tg.jpg' },
              genres: [{ name: 'Экшен' }, { name: 'Ужасы' }],
            },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ data: [], response: [] }), { status: 200 });
  };

  try {
    const res = await provider.getCatalog({ type: 'animation', genre: 'horror', sort: 'popular', page: 1 });
    assert.ok(
      requestedUrls.some((u) => u.includes('/api/v1/anime/catalog/releases') && u.includes('f[genres]=13')),
      `Expected AniLiberty f[genres]=13 request, got ${JSON.stringify(requestedUrls)}`
    );
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].title, 'Токийский Гуль');
    assert.ok(rec.extractItemGenreIds(res.items[0]).includes('horror'));
    assert.ok(rec.extractItemGenreIds(res.items[0]).includes('action'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Anime item parsers populate genres for genre-aware filtering', () => {
  const provider = new RezkaProvider();
  const lib = provider.parseAniLibertyItems([
    {
      id: 777,
      year: 2025,
      name: { main: 'Тест аниме', english: 'Test Anime' },
      poster: { src: '/p.jpg' },
      genres: [{ name: 'Фэнтези' }, { name: 'Экшен' }],
    },
  ]);
  assert.deepEqual(lib[0].genres, ['Фэнтези', 'Экшен']);
  assert.ok(rec.extractItemGenreIds(lib[0]).includes('action'));

  const vost = provider.parseAnimeVostItems([
    {
      id: 888,
      title: 'Комедия / Comedy [1-12 из 12]',
      year: '2024',
      genre: 'Комедия, Приключения',
      urlImagePreview: 'https://static.animetop.info/img/888.jpg',
    },
  ]);
  assert.deepEqual(vost[0].genres, ['Комедия', 'Приключения']);

  const yummy = provider.parseYummyAnimeItems([
    {
      anime_id: 999,
      title: 'Детектив аниме',
      year: 2025,
      genres: [{ title: 'Детектив' }, { title: 'Триллер' }],
    },
  ]);
  assert.deepEqual(yummy[0].genres, ['Детектив', 'Триллер']);
});

test('v0.2.0 translations, WhatToWatchPage guards, and Light Mode contrast are complete', () => {
  assert.equal(constants.APP_VERSION, '0.2.0');
  for (const loc of ['ru', 'uk', 'en']) {
    const w = translations[loc].whatToWatch;
    assert.ok(w.genresLabel);
    assert.ok(w.strictGenreActive.includes('{genres}'));
    assert.ok(w.clearGenres);
    assert.ok(w.saveGenresToTaste);
    assert.ok(w.genresSavedToast.includes('{genres}'));
    assert.ok(w.selectedGenreReason.includes('{genres}'));
  }
  const pageSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/WhatToWatchPage.tsx'), 'utf8');
  assert.match(pageSrc, /strictGenres:\s*selectedGenres\.length > 0/);
  assert.match(pageSrc, /mergeCandidateBatches/);
  assert.match(pageSrc, /handleSaveGenresToInterests/);
  assert.match(pageSrc, /handleSelectMood/);
  assert.match(pageSrc, /hasMorePagesRef/);
  assert.match(pageSrc, /if \(seq !== requestSeqRef\.current\) return;/);

  const cssSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles/globals.css'), 'utf8');
  assert.match(cssSrc, /\.text-emerald-200:where/);
});
