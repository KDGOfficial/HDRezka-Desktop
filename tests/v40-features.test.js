const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

function loadTsModule(relPath, external = []) {
  const res = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, relPath)],
    bundle: true,
    format: 'cjs',
    write: false,
    external,
  });
  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', res.outputFiles[0].text);
  fn(m, m.exports, require);
  return m.exports;
}

const { fixKeyboardLayout, getT9Correction, sortMediaItems } = loadTsModule('../src/shared/utils/index.ts');
const { isAdUrl, APP_VERSION, ANIME_MIRROR_SEEDS } = loadTsModule('../src/shared/constants/index.ts');
const { RezkaProvider } = loadTsModule('../src/core/providers/rezka/provider.ts', ['cheerio', 'electron']);

test('Version constants and anime mirror seeds are configured for 0.0.40', () => {
  assert.equal(APP_VERSION, '0.0.40');
  assert.ok(ANIME_MIRROR_SEEDS.some((u) => u.includes('yani.tv')));
  assert.ok(ANIME_MIRROR_SEEDS.some((u) => u.includes('animego')));
  assert.ok(ANIME_MIRROR_SEEDS.some((u) => u.includes('uakino')));
});

test('T9 fixKeyboardLayout & getT9Correction fix wrong layout, typos, and preserve real English titles', () => {
  assert.equal(fixKeyboardLayout('yfhenj'), 'наруто');
  assert.equal(fixKeyboardLayout('l.yf'), 'дюна');
  assert.equal(fixKeyboardLayout(''), '');

  const layoutHit = getT9Correction('yfhenj');
  assert.ok(layoutHit);
  assert.equal(layoutHit.suggestion, 'наруто');
  assert.equal(layoutHit.reason, 'layout');

  const punctLayoutHit = getT9Correction('l.yf');
  assert.ok(punctLayoutHit);
  assert.equal(punctLayoutHit.suggestion, 'дюна');

  const typoHit = getT9Correction('наурто');
  assert.ok(typoHit);
  assert.equal(typoHit.suggestion, 'наруто');
  assert.equal(typoHit.reason, 'typo');

  // Valid English movie/anime words must not be mangled into Russian layout gibberish
  const validEn = getT9Correction('naruto');
  assert.equal(validEn, null);
  assert.equal(getT9Correction('a'), null);
  assert.equal(getT9Correction('   '), null);
});

test('sortMediaItems sorts by year, rating, and views with missing values placed last', () => {
  const sample = [
    { id: '1', year: 2018, rating: 7.2, views: 5000 },
    { id: '2', year: undefined, rating: 9.1, views: 120000 },
    { id: '3', year: 2024, rating: undefined, views: 900 },
    { id: '4', year: 2021, rating: 8.5, views: undefined },
  ];

  const byYearDesc = sortMediaItems(sample, 'year', 'desc');
  assert.deepEqual(byYearDesc.map((x) => x.id), ['3', '4', '1', '2']);

  const byYearAsc = sortMediaItems(sample, 'year', 'asc');
  assert.deepEqual(byYearAsc.map((x) => x.id), ['1', '4', '3', '2']);

  const byRatingDesc = sortMediaItems(sample, 'rating', 'desc');
  assert.deepEqual(byRatingDesc.map((x) => x.id), ['2', '4', '1', '3']);

  const byViewsDesc = sortMediaItems(sample, 'views', 'desc');
  assert.deepEqual(byViewsDesc.map((x) => x.id), ['2', '1', '3', '4']);

  const byRel = sortMediaItems(sample, 'relevance', 'desc');
  assert.deepEqual(byRel.map((x) => x.id), ['1', '2', '3', '4']);
  assert.deepEqual(sortMediaItems([], 'year', 'desc'), []);
});

test('isAdUrl blocks ads, trackers, and gambling while allowing video streams and movie portals', () => {
  assert.equal(isAdUrl('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'), true);
  assert.equal(isAdUrl('https://an.yandex.ru/system/context.js'), true);
  assert.equal(isAdUrl('https://1xbet-mirror.com/promo'), true);
  assert.equal(isAdUrl('https://example.org/vast/preroll.xml'), true);

  assert.equal(isAdUrl('https://kinobase.org/film/100025-pobeg-iz-shoushenka'), false);
  assert.equal(isAdUrl('https://cdn.redcdn.org/hls/movie/1080p.m3u8'), false);
  assert.equal(isAdUrl('https://api.yani.tv/search?q=naruto'), false);
  assert.equal(isAdUrl('https://animego.me/anime/naruto-103'), false);
  assert.equal(isAdUrl('https://uakino.biz/animeukr/'), false);
  assert.equal(isAdUrl(''), false);
  assert.equal(isAdUrl('javascript:void(0)'), false);
});

test('Anime mirror parsers extract YummyAnime, AnimeGO, and UAKino items cleanly', () => {
  const provider = new RezkaProvider();

  const yani = provider.parseYummyAnimeItems([
    {
      anime_id: 111,
      title: 'Наруто',
      year: 2002,
      views: 7391186,
      rating: { average: 8.67 },
      poster: { big: '//static.yani.tv/posters/big/naruto.webp' },
    },
  ]);
  assert.equal(yani.length, 1);
  assert.equal(yani[0].id, 'yani-111');
  assert.equal(yani[0].poster, 'https://static.yani.tv/posters/big/naruto.webp');
  assert.equal(yani[0].views, 7391186);
  assert.equal(yani[0].rating, 8.7);
  assert.equal(yani[0].type, 'animation');

  const animego = provider.parseAnimeGoItems(`
    <div class="ani-grid__item">
      <div class="p-rate-flag__text">9.2</div>
      <a href="/anime/naruto-103" title="Наруто: Ураганные хроники">
        <img data-original="https://img.cdngos.com/naruto.jpg" />
      </a>
      <div class="card-title">Наруто: Ураганные хроники</div>
      <span>Сериал / 2007</span>
    </div>
  `);
  assert.equal(animego.length, 1);
  assert.equal(animego[0].title, 'Наруто: Ураганные хроники');
  assert.equal(animego[0].year, 2007);
  assert.equal(animego[0].rating, 9.2);
  assert.equal(animego[0].url, 'https://animego.me/anime/naruto-103');

  const uakino = provider.parseUaKinoItems(`
    <div class="swiper-slide movie-item"><a class="movie-title" href="https://uakino.biz/filmy/1-skip.html">Skip Slider</a></div>
    <div class="movie-item"><a class="movie-title" href="https://uakino.biz/news/2-news.html">Skip News</a></div>
    <div class="movie-item">
      <img data-src="/uploads/naruto.webp" />
      <a class="movie-title" href="https://uakino.biz/animeukr/anime-series/5577-naruto.html">Наруто: Ураганні хроніки</a>
      <span>IMDB:8.7 2007</span>
    </div>
  `);
  assert.equal(uakino.length, 1);
  assert.equal(uakino[0].id, 'uakino-5577');
  assert.equal(uakino[0].type, 'animation');
  assert.equal(uakino[0].rating, 8.7);
  assert.equal(uakino[0].poster, 'https://uakino.biz/uploads/naruto.webp');
});

test('parseKinopoiskReviews extracts Kinopoisk comments with sentiment and source', () => {
  const provider = new RezkaProvider();
  const sampleHtml = `
    <div class="reviewItem">
      <div class="response good">
        <p class="profile_name">Иван Петров</p>
        <span class="date">21 сентября 2026 | 22:45</span>
        <p class="sub_title">Настоящий шедевр</p>
        <div class="_reachbanner_">Потрясающий фильм с глубоким смыслом и отличной актёрской игрой.</div>
      </div>
    </div>
    <div class="reviewItem">
      <div class="response bad">
        <p class="profile_name">Критик</p>
        <span class="date">10 августа 2026</span>
        <div class="_reachbanner_">Очень затянуто и скучно, не оправдало ожиданий совершенно.</div>
      </div>
    </div>
  `;
  const reviews = provider.parseKinopoiskReviews(sampleHtml);
  assert.equal(reviews.length, 2);
  assert.equal(reviews[0].source, 'Кинопоиск');
  assert.equal(reviews[0].sentiment, 'positive');
  assert.equal(reviews[0].author, 'Иван Петров');
  assert.match(reviews[0].text, /Настоящий шедевр/);
  assert.equal(reviews[1].sentiment, 'negative');
});
