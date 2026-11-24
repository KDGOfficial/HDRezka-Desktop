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

const { RezkaProvider } = loadTsModule('src/core/providers/rezka/provider.ts');

test('RezkaProvider.getDetails deduplicates in-flight requests and serves warm cache on repeat clicks', async () => {
  const provider = new RezkaProvider('https://kinobase.org');
  let fetchCalls = 0;

  provider.getDetailsUncached = async (urlOrId) => {
    fetchCalls++;
    await new Promise((r) => setTimeout(r, 25));
    return {
      id: '777',
      title: 'Test Movie',
      origTitle: 'Test Movie',
      poster: '',
      year: 2025,
      country: 'USA',
      genres: ['Боевик'],
      type: 'films',
      description: 'Desc',
      directors: [],
      actors: [],
      translators: [{ id: 1, name: 'Дубляж', premium: false }],
      currentTranslatorId: 1,
      similar: [],
      url: urlOrId,
      antiBot: false,
    };
  };

  // Trigger background prefetch + immediate user click concurrently -> should share 1 in-flight fetch
  provider.prefetchDetails([{ id: '777', url: 'https://kinobase.org/film/777-test' }]);
  const [a, b] = await Promise.all([
    provider.getDetails('https://kinobase.org/film/777-test'),
    provider.getDetails('777'),
  ]);
  assert.equal(fetchCalls, 1);
  assert.equal(a.id, '777');
  assert.equal(b.id, '777');

  // Subsequent click hits detailsCache immediately with 0 extra fetches
  const cached = await provider.getDetails('https://kinobase.org/film/777-test');
  assert.equal(fetchCalls, 1);
  assert.equal(cached.title, 'Test Movie');
  assert.ok(provider.getCachedDetails('777'));

  // Switching active mirror invalidates detailsCache
  provider.setActiveMirror('https://kinogo.film');
  assert.equal(provider.getCachedDetails('777'), null);
});

test('RezkaProvider.getHomeSections deduplicates concurrent startup warm-up and HomePage mount', async () => {
  const provider = new RezkaProvider('https://kinobase.org');
  let homeCalls = 0;
  provider.getHomeSectionsUncached = async () => {
    homeCalls++;
    await new Promise((r) => setTimeout(r, 20));
    return { hero: { id: '1', title: 'Hero' }, popular: [], newReleases: [], topMovies: [], topSeries: [], recommendations: [], expected: [] };
  };

  const [r1, r2] = await Promise.all([provider.getHomeSections(), provider.getHomeSections()]);
  assert.equal(homeCalls, 1);
  assert.equal(r1.hero.id, '1');
  assert.equal(r2.hero.id, '1');

  // Cached hit
  const r3 = await provider.getHomeSections();
  assert.equal(homeCalls, 1);
  assert.equal(r3.hero.id, '1');
});

test('MediaCard, HeroBanner, HomePage, CatalogPage, and main.ts wire background prefetching', () => {
  const mainSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/main.ts'), 'utf8');
  const cardSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/MediaCard.tsx'), 'utf8');
  const heroSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/HeroBanner.tsx'), 'utf8');
  const homeSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/HomePage.tsx'), 'utf8');
  const catSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/CatalogPage.tsx'), 'utf8');

  assert.ok(mainSrc.includes('prefetchDetails'));
  assert.ok(cardSrc.includes('onMouseEnter={schedulePrefetch}'));
  assert.ok(heroSrc.includes('prefetchDetails([activeItem])'));
  assert.ok(homeSrc.includes('window.api.prefetchDetails'));
  assert.ok(catSrc.includes('window.api.prefetchDetails'));

  const winSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/window.ts'), 'utf8');
  const detailsSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/DetailsPage.tsx'), 'utf8');
  assert.ok(winSrc.includes("url.includes('kinogo.')"));
  assert.ok(detailsSrc.includes('setPosterFailed(true)'));
});
