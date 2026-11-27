const fs = require('node:fs');
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

const { fixKeyboardLayout, getT9Correction, sortMediaItems, formatCompactNumber } = loadTsModule('../src/shared/utils/index.ts');
const { isAdUrl, APP_VERSION, ANIME_MIRROR_SEEDS } = loadTsModule('../src/shared/constants/index.ts');
const { RezkaProvider } = loadTsModule('../src/core/providers/rezka/provider.ts', ['cheerio', 'electron']);

test('Version constants and anime mirror seeds are configured for 0.4.3', () => {
  assert.equal(APP_VERSION, '0.4.3');
  assert.ok(ANIME_MIRROR_SEEDS.some((u) => u.includes('yani.tv')));
  assert.ok(ANIME_MIRROR_SEEDS.some((u) => u.includes('animego')));
  assert.ok(ANIME_MIRROR_SEEDS.some((u) => u.includes('uakino')));
});

test('T9 fixKeyboardLayout & getT9Correction fix wrong layout, typos, and preserve real English titles with punctuation', () => {
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

  // Transposition + hyphen-free multi-word typo must match
  const transHit = getT9Correction('человек паку');
  assert.ok(transHit);
  assert.equal(transHit.suggestion, 'человек-паук');
  assert.equal(transHit.reason, 'typo');

  // Valid English titles (including dots & apostrophes) must NEVER be mangled into Russian gibberish
  assert.equal(getT9Correction('naruto'), null);
  assert.equal(getT9Correction('Mr. Robot'), null);
  assert.equal(getT9Correction("Schindler's List"), null);
  assert.equal(getT9Correction("Ocean's Eleven"), null);
  assert.equal(getT9Correction('Dr. House'), null);
  assert.equal(getT9Correction('a'), null);
  assert.equal(getT9Correction('   '), null);

  assert.equal(formatCompactNumber(1_026_649), '1M');
  assert.equal(formatCompactNumber(125_400), '125K');
  assert.equal(formatCompactNumber(9_500), '9.5K');
  assert.equal(formatCompactNumber(780), '780');
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

test('Kinogo parser extracts Kinopoisk audience views and dedupeMediaItems enriches views', () => {
  const provider = new RezkaProvider();
  const kinogoHtml = `
    <div class="shortStory">
      <div class="hTitle"><a href="/104-interstellar.html">Интерстеллар (2014)</a></div>
      <div class="sPoster"><img data-src="/uploads/interstellar.jpg" /></div>
      <div class="fullKP">КиноПоиск:8.7 (1026649)</div>
      <div class="fQuality">Качество:BDRip</div>
    </div>
  `;
  const parsed = provider.parseKinogoItems(kinogoHtml);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].views, 1026649);
  assert.equal(parsed[0].rating, 8.7);

  const merged = provider.dedupeMediaItems([
    { id: 'kb-1', title: 'Интерстеллар', year: 2014, url: 'https://kinobase.org/film/7921', poster: '', type: 'films' },
    parsed[0],
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].views, 1026649);
  assert.equal(merged[0].rating, 8.7);
});

test('Light Mode CSS guards preserve .cinema-player-surface isolation and contrast', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles/globals.css'), 'utf8');
  const detailsTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/DetailsPage.tsx'), 'utf8');
  const historyTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/HistoryPage.tsx'), 'utf8');
  const mediaCardTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/MediaCard.tsx'), 'utf8');
  const browserTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/BrowserPage.tsx'), 'utf8');

  // Light Mode must never override .bg-dark-void, .bg-dark-surface, .cinema-panel, or .cinema-glass on/inside .cinema-player-surface
  assert.doesNotMatch(css, /html\[data-theme="light"\]\s+\.bg-dark-void\s*[{,]/);
  assert.doesNotMatch(css, /html\[data-theme="light"\]\s+\.cinema-panel\s*[{,]/);
  assert.doesNotMatch(css, /html\[data-theme="light"\]\s+\.cinema-glass\s*[{,]/);
  assert.match(css, /html\[data-theme="light"\]\s+\.bg-dark-void:not\(\.cinema-player-surface\):not\(\.cinema-player-surface \*\)/);
  assert.match(css, /html\[data-theme="light"\]\s+\.bg-dark-surface:not\(\.cinema-player-surface\):not\(\.cinema-player-surface \*\)/);
  assert.match(css, /html\[data-theme="light"\]\s+\.cinema-glass:not\(\.cinema-player-surface\):not\(\.cinema-player-surface \*\)/);
  assert.match(css, /html\[data-theme="light"\]\s+\.cinema-player-surface\s*\{[^}]*color-scheme:\s*only dark/);
  // Forced-dark cinema surfaces must also restore dark design tokens (e.g. --border-subtle, --scrollbar-thumb)
  assert.match(css, /html\[data-theme="light"\]\s+\.cinema-player-surface\s*\{[^}]*--border-subtle:\s*rgba\(255,\s*255,\s*255,\s*0\.08\)/);

  // Static Light Mode utility remaps must use :where() so Tailwind :hover/:focus/.group:hover variants keep higher specificity
  assert.match(css, /:where\(html\[data-theme="light"\]\)\s+\.text-white:where\(/);
  assert.match(css, /:where\(html\[data-theme="light"\]\)\s+\.text-zinc-400:where\(/);
  assert.match(css, /:where\(html\[data-theme="light"\]\)\s+\[class\*=" border-white\/"\]:where\(/);
  // Close button exclusion must match exact solid hover:bg-brand-crimson token (not translucent hover:bg-brand-crimson/20)
  assert.match(css, /\[class~="hover:bg-brand-crimson"\]/);
  assert.doesNotMatch(css, /\[class\*="hover:bg-brand-crimson"\]/);
  // Light Mode status alert banners must map dark 950/* translucent fills to high-contrast light tints
  assert.match(css, /\[class\*="bg-amber-950\/"\][^{]*\{\s*background-color:\s*#FEF3C7/);
  assert.match(css, /\[class\*="bg-emerald-950\/"\][^{]*\{\s*background-color:\s*#ECFDF5/);
  assert.match(css, /\[class\*=" bg-rose-950\/"\][^{]*\{\s*background-color:\s*#FFF1F2/);

  // DetailsPage hero stage must not mix cinema-player-surface with bg-dark-void, and episode title stays white on gradient hover
  const seriesNavTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/SeriesNavigationPanel.tsx'), 'utf8');
  assert.doesNotMatch(detailsTsx, /cinema-player-surface[^>]*bg-dark-void/);
  assert.match(seriesNavTsx, /text-white group-hover:text-white/);
  // HistoryPage poster thumbnail must isolate its dark hover scrim via cinema-player-surface
  assert.match(historyTsx, /cinema-player-surface[^>]*w-16 h-24/);
  // MediaCard must not set color-scheme (.cinema-player-surface) on a transparent overlay
  assert.doesNotMatch(mediaCardTsx, /cinema-player-surface\s+!bg-transparent/);
  // BrowserPage webview stage must stay dark via cinema-player-surface in Light Mode
  assert.match(browserTsx, /cinema-player-surface w-full flex-1 flex items-center justify-center bg-\[#070507\]/);
});
