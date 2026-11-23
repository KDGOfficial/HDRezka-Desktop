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
