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

const utils = loadTsModule('src/shared/utils/index.ts');
const constants = loadTsModule('src/shared/constants/index.ts');
const recommendations = loadTsModule('src/shared/recommendations.ts');
const localization = loadTsModule('src/core/providers/rezka/localization.ts');
const { translations, GENRE_TRANSLATIONS } = loadTsModule('src/renderer/i18n/translations.ts');

test('v0.0.79 version and unified Erotica 18+ category, genre & translations are configured', () => {
  assert.equal(constants.APP_VERSION, '0.0.79');
  assert.ok(constants.GENRES.some((g) => g.id === 'erotica' && g.title === 'Эротика 18+'));
  assert.ok(!constants.GENRES.some((g) => g.id === 'adult'), 'Duplicate adult genre must be merged into erotica');
  assert.equal(recommendations.normalizeGenreToId('18+'), 'erotica');
  assert.equal(recommendations.normalizeGenreToId('adult'), 'erotica');
  assert.equal(recommendations.normalizeGenreToId('Эротика 18+'), 'erotica');
  const migrated = recommendations.normalizeInterestsProfile({ favoriteGenres: ['adult', 'drama'] });
  assert.deepEqual(migrated.favoriteGenres, ['erotica', 'drama']);

  for (const loc of ['ru', 'uk', 'en']) {
    assert.equal(translations[loc].nav.adult, undefined);
    assert.ok(translations[loc].nav.erotica.includes('18+'));
    assert.equal(translations[loc].catalog.categories.adult, undefined);
    assert.ok(translations[loc].catalog.categories.erotica.includes('18+'));
    assert.ok(translations[loc].player.subtitles);
    assert.ok(translations[loc].player.subtitlesOff);
    assert.ok(GENRE_TRANSLATIONS.erotica[loc].includes('18+'));
    assert.equal(GENRE_TRANSLATIONS.adult, undefined);
  }
});

test('normalizeAgeRating & inferAgeRating handle explicit ratings, MPAA codes, and genre inference', () => {
  assert.equal(utils.normalizeAgeRating('18+'), '18+');
  assert.equal(utils.normalizeAgeRating('NC-17'), '18+');
  assert.equal(utils.normalizeAgeRating('R'), '18+');
  assert.equal(utils.normalizeAgeRating('PG-13'), '12+');
  assert.equal(utils.normalizeAgeRating('G'), '0+');

  assert.equal(utils.inferAgeRating({ type: 'erotica', title: 'Test' }), '18+');
  assert.equal(utils.inferAgeRating({ type: 'adult', title: 'Test' }), '18+');
  assert.equal(utils.inferAgeRating({ type: 'films', genres: ['Ужасы'] }), '18+');
  assert.equal(utils.inferAgeRating({ type: 'films', genres: ['Боевик'] }), '16+');
  assert.equal(utils.inferAgeRating({ type: 'cartoons', title: 'Шрек' }), '6+');
  assert.equal(utils.inferAgeRating({ type: 'animation', title: 'Наруто' }), '12+');
  assert.equal(utils.inferAgeRating({ type: 'films', ageRating: '12+', genres: ['Ужасы'] }), '12+');
});

test('resolveImmediateLocalizedTitle uses origTitle for EN and keeps RU immediately', () => {
  assert.equal(utils.resolveImmediateLocalizedTitle('Начало', 'Inception', 'ru'), 'Начало');
  assert.equal(utils.resolveImmediateLocalizedTitle('Начало', 'Inception', 'en'), 'Inception');
  assert.equal(utils.resolveImmediateLocalizedTitle('Начало', '', 'en'), null);
  assert.equal(utils.resolveImmediateLocalizedTitle('Начало', 'Inception', 'uk'), null);
  assert.equal(utils.resolveImmediateLocalizedTitle('Місто гріхів', '', 'uk'), 'Місто гріхів');
});

test('srtToVtt converts SRT timestamps to WebVTT cleanly', () => {
  const srt = '1\r\n00:00:01,250 --> 00:00:04,500\r\nПривет, мир!\r\n\r\n2\r\n00:00:05,000 --> 00:00:07,100\r\nВторая строка';
  const vtt = utils.srtToVtt(srt);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(vtt.includes('00:00:01.250 --> 00:00:04.500'));
  assert.ok(vtt.includes('00:00:05.000 --> 00:00:07.100'));
});

test('translateTitlesBatch caches results and translates batched lines', async () => {
  localization.clearLocalizationCaches();
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    return {
      ok: true,
      json: async () => [[['Inception\nInterstellar', 'Начало\nИнтерстеллар']]],
    };
  };

  const first = await localization.translateTitlesBatch(['Начало', 'Интерстеллар'], 'en', mockFetch);
  assert.equal(first['Начало'], 'Inception');
  assert.equal(first['Интерстеллар'], 'Interstellar');
  assert.equal(calls, 1);

  // Second call hits in-memory cache (zero extra network calls)
  const second = await localization.translateTitlesBatch(['Начало'], 'en', mockFetch);
  assert.equal(second['Начало'], 'Inception');
  assert.equal(calls, 1);
});

test('fetchSubtitleTrack auto-translates available track when target language (UK) is missing', async () => {
  localization.clearLocalizationCaches();
  const sampleSrt = '1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n2\n00:00:04,000 --> 00:00:06,000\nGood night';
  const mockFetch = async (url) => {
    if (String(url).includes('sub-en.srt')) {
      return { ok: true, text: async () => sampleSrt };
    }
    if (String(url).includes('translate.googleapis.com')) {
      return {
        ok: true,
        json: async () => [[['Привіт, світе\nНа добраніч', 'Hello world\nGood night']]],
      };
    }
    return { ok: false, json: async () => ({}), text: async () => '' };
  };

  const res = await localization.fetchSubtitleTrack(
    {
      title: 'Тест',
      origTitle: 'Test',
      lang: 'uk',
      existingSubtitles: [{ language: 'English', url: 'https://cdn.example.com/sub-en.srt' }],
    },
    mockFetch
  );

  assert.ok(res);
  assert.equal(res.langCode, 'uk');
  assert.equal(res.translated, true);
  assert.ok(res.vtt.startsWith('WEBVTT'));
  assert.ok(res.vtt.includes('00:00:01.000 --> 00:00:03.000'));
  assert.ok(res.vtt.includes('Привіт, світе'));
  assert.ok(res.vtt.includes('На добраніч'));
});

test('StartupSplash component exists and respects prefers-reduced-motion', () => {
  const splashSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/StartupSplash.tsx'), 'utf8');
  const cssSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles/globals.css'), 'utf8');
  assert.ok(splashSrc.includes('prefers-reduced-motion: reduce'));
  assert.ok(cssSrc.includes('prefers-reduced-motion: no-preference'));
  assert.ok(cssSrc.includes('splashLogoIn'));
});
