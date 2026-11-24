const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

function loadProviderModule() {
  const out = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/core/providers/rezka/provider.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', out.outputFiles[0].text)(mod.exports, require, mod);
  return mod.exports;
}

test('getKinogoBaseUrl resolves origin from film URL instead of defaulting to kinogo.film', () => {
  const { RezkaProvider } = loadProviderModule();
  const provider = new RezkaProvider();
  provider.setActiveMirror('https://kinobase.org');

  assert.equal(
    provider.getKinogoBaseUrl('https://kinogo.online/filmy/118084-serdce-zverja.html'),
    'https://kinogo.online'
  );
  assert.equal(
    provider.getKinogoBaseUrl('https://kinogo.film/123460-serdce-zverja.html'),
    'https://kinogo.film'
  );
  assert.equal(provider.getKinogoBaseUrl(), 'https://kinogo.film');
});

test('parseKinogoItems resolves relative poster URLs using explicit mirror origin', () => {
  const { RezkaProvider } = loadProviderModule();
  const provider = new RezkaProvider();
  provider.setActiveMirror('https://kinobase.org');

  const html = `
    <div class="shortStory">
      <div class="hTitle"><h2><a href="/filmy/118084-serdce-zverja.html" title="Сердце зверя (2026)">Сердце зверя (2026)</a></h2></div>
      <div class="sPoster"><img data-src="/uploads/mini/fullstory/2d4/c8af696f7e8c94b81ca791b562197.jpg" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" /></div>
      <div class="sInfo">Год выпуска: 2026</div>
    </div>
  `;

  const items = provider.parseKinogoItems(html, 'films', 'https://kinogo.online');
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://kinogo.online/filmy/118084-serdce-zverja.html');
  assert.equal(
    items[0].poster,
    'https://kinogo.online/uploads/mini/fullstory/2d4/c8af696f7e8c94b81ca791b562197.jpg'
  );
});

test('MediaCard removes dead via.placeholder.com fallback and window.ts skips Origin on images', () => {
  const cardSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/MediaCard.tsx'), 'utf8');
  assert.equal(cardSrc.includes('via.placeholder.com'), false);

  const windowSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/window.ts'), 'utf8');
  assert.match(windowSrc, /const isImage = details\.resourceType === 'image'/);
  assert.match(windowSrc, /if \(!isImage\) details\.requestHeaders\['Origin'\]/);

  const detailsSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/DetailsPage.tsx'), 'utf8');
  assert.match(detailsSrc, /details\?\.backdrop/);
});
