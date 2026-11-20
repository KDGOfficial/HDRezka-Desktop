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

const page = (body) => `<html><body>
  <input id="post_id" value="12345">
  <div class="b-post__title"><h1>Тестовый фильм</h1></div>
  ${body}
  <script>sof.tv.initCDNMoviesEvents(12345, 238, 0, 0, 0, 'hdrezka.ag', false, {});</script>
</body></html>`;

const withFetch = async (html, run) => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(html, { status: 200 });
  try { return await run(); } finally { globalThis.fetch = orig; }
};

test('getDetails returns every translator from the page (li and a items) with flags and active one', async () => {
  const html = page(`<ul id="translators-list">
    <li class="b-translator__item" data-translator_id="56" title="Дубляж">Дубляж</li>
    <li class="b-translator__item active" data-translator_id="238" title="LostFilm">LostFilm</li>
    <a class="b-translator__item b-prem_translator" data-translator_id="777" data-director="1">Редкая студия</a>
  </ul>`);
  const d = await withFetch(html, () => new RezkaProvider().getDetails('/films/action/12345-test.html'));
  assert.deepEqual(d.translators.map((t) => t.id), [56, 238, 777]);
  assert.equal(d.translators[2].name, 'Редкая студия');
  assert.equal(d.translators[2].premium, true);
  assert.equal(d.translators[2].director, true);
  assert.equal(d.currentTranslatorId, 238);
  assert.ok(!d.antiBot);
});

test('getDetails uses initCDN translator for single-translator titles', async () => {
  const html = page('<table class="b-post__info"><tr><td>В переводе:</td><td>LostFilm</td></tr></table>');
  const d = await withFetch(html, () => new RezkaProvider().getDetails('/films/action/12345-test.html'));
  assert.deepEqual(d.translators.map((t) => [t.id, t.name]), [[238, 'LostFilm']]);
  assert.equal(d.currentTranslatorId, 238);
});

test('getDetails flags anti-bot pages and shows no fake translators', async () => {
  const d = await withFetch('<title>Проверяем, что вы не бот!</title>', () =>
    new RezkaProvider().getDetails('/films/action/12345-test.html'));
  assert.equal(d.antiBot, true);
  assert.equal(d.translators.length, 0);
});
