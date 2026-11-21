const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const packageJson = require('../package.json');

// Build fallbackData in memory
const buildResult = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/core/providers/rezka/fallbackData.ts')],
  bundle: true,
  format: 'cjs',
  write: false,
});

const moduleCode = buildResult.outputFiles[0].text;
const m = { exports: {} };
const fn = new Function('module', 'exports', 'require', moduleCode);
fn(m, m.exports, require);
const { getFallbackDetails } = m.exports;

test('App version must be 0.0.40', () => {
  assert.equal(packageJson.version, '0.0.40');
});

test('Fallback stream must return empty streams (no Big Buck Bunny)', () => {
  const { getFallbackStream } = m.exports;
  const fbStream = getFallbackStream();
  assert.ok(fbStream.streams.length === 0, 'Fallback stream must be empty — real content only');
  assert.ok(fbStream.subtitles.length === 0, 'Fallback subtitles must be empty');
});

test('Fallback details must return Spider-Man when given Spider-Man URLs (never Dune!)', () => {
  const spidey2002 = getFallbackDetails('https://hdrezka.ag/films/action/1481-chelovek-pauk-2002.html');
  assert.match(spidey2002.title, /Человек-паук/i);
  assert.notEqual(spidey2002.title, 'Дюна: Часть вторая');
  assert.equal(spidey2002.year, 2002);

  const spidey2 = getFallbackDetails('https://hdrezka.ag/films/action/1488-chelovek-pauk-2-2004.html');
  assert.match(spidey2.title, /Человек-паук/i);
  assert.equal(spidey2.year, 2004);

  const lego = getFallbackDetails('https://hdrezka.ag/cartoons/action/41670-lego-marvel-chelovek-pauk-razdrazhennyy-venomom-2019.html');
  assert.match(lego.title, /Человек-Паук/i);
  assert.equal(lego.year, 2019);

  const plainQuery = getFallbackDetails('человек паук');
  assert.match(plainQuery.title, /Человек-паук/i);
  assert.notEqual(plainQuery.title, 'Дюна: Часть вторая');

  const homecoming = getFallbackDetails('https://hdrezka.ag/films/fiction/23757-chelovek-pauk-vozvraschenie-domoy-2017.html');
  assert.match(homecoming.title, /Человек-паук/i);
  assert.equal(homecoming.year, 2017);

  // Similar items for Spider-Man must NOT include Dune
  assert.ok(spidey2002.similar.every((sim) => !sim.title.includes('Дюна')), 'Spider-Man similar items must not contain Dune');
});

test('Fallback details with Dune URL returns Dune', () => {
  const dune = getFallbackDetails('https://hdrezka.ag/films/fiction/56560-dyuna-chast-vtoraya-2024.html');
  assert.match(dune.title, /Дюна/i);
});

test('Fallback details with preloaded meta prioritizes preloaded meta', () => {
  const custom = getFallbackDetails('https://hdrezka.ag/films/action/9999-custom.html', {
    title: 'Мой Тестовый Фильм',
    year: 2025,
    rating: 9.9,
  });
  assert.equal(custom.title, 'Мой Тестовый Фильм');
  assert.equal(custom.year, 2025);
  assert.equal(custom.ratingRezka, 9.9);
});

test('Fallback details must always supply non-null arrays for directors, actors, and similar to prevent UI black screen', () => {
  const details = getFallbackDetails('https://hdrezka.ag/films/action/1481-chelovek-pauk-2002.html');
  assert.ok(Array.isArray(details.directors), 'directors must be an array');
  assert.ok(Array.isArray(details.actors), 'actors must be an array');
  assert.ok(Array.isArray(details.similar), 'similar must be an array');
  assert.ok(Array.isArray(details.translators), 'translators must be an array');
  assert.ok(Array.isArray(details.genres), 'genres must be an array');
});

test('Fallback details must not invent translators and must recognize animated series', () => {
  const details = getFallbackDetails('https://hdrezka.ag/cartoons/fiction/11999-chelovek-pauk-1994-latest.html');
  assert.equal(details.translators.length, 0, 'Fallback must not show fake translators');
  assert.ok(details.seasons && details.seasons.length > 0, 'Spider-Man 1994 must have seasons');
});
