const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

// Build provider in memory
const buildResult = esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/core/providers/rezka/provider.ts')],
  bundle: true,
  format: 'cjs',
  write: false,
  external: ['cheerio', 'electron'],
});

const moduleCode = buildResult.outputFiles[0].text;
const m = { exports: {} };
const fn = new Function('module', 'exports', 'require', moduleCode);
fn(m, m.exports, require);
const { RezkaProvider } = m.exports;

test('RezkaProvider must define popular translators dictionary', () => {
  assert.ok(RezkaProvider.POPULAR_TRANSLATORS, 'POPULAR_TRANSLATORS must exist');
  assert.equal(RezkaProvider.POPULAR_TRANSLATORS[56], 'HDRezka Studio');
  assert.equal(RezkaProvider.POPULAR_TRANSLATORS[238], 'LostFilm');
  assert.equal(RezkaProvider.POPULAR_TRANSLATORS[70], 'Кубик в Кубе');
  assert.equal(RezkaProvider.POPULAR_TRANSLATORS[4], 'Оригинал (+субтитры)');
  assert.equal(RezkaProvider.POPULAR_TRANSLATORS[1], 'Дубляж');
});

test('RezkaProvider probeTranslators method exists on instance', () => {
  const provider = new RezkaProvider();
  assert.equal(typeof provider.probeTranslators, 'function');
});
