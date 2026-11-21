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

const { isAdUrl, isCrossOriginPopupAd, APP_VERSION } = loadTsModule('../src/shared/constants/index.ts');
const {
  RezkaProvider,
  getQualityScore,
  getMaxQualityScore,
  classifyResolutionLabel,
  parseHlsMasterVariants,
  pickBetterQualityStream,
} = loadTsModule('../src/core/providers/rezka/provider.ts', ['cheerio', 'electron']);

test('v0.0.44 version synchronization across constants and provider', () => {
  const provider = new RezkaProvider();
  assert.equal(APP_VERSION, '0.0.44');
  assert.equal(provider.version, '0.0.44');
});

test('parseHlsMasterVariants handles cinema 1920x800 1080p, picks highest bitrate per quality, and never invents fake 1080p', () => {
  const cinemaMaster = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x356',
    '480/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x536',
    '720/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1920x800',
    '1080_low/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=6200000,RESOLUTION=1920x800',
    '1080_high/index.m3u8',
  ].join('\n');

  const variants = parseHlsMasterVariants(cinemaMaster, 'https://cdn.example.org/hls/master.m3u8');
  assert.deepEqual(
    variants.map((v) => v.quality),
    ['1080p', '720p', '480p']
  );
  // Must select the 6.2 Mbps track, NOT the pixelated 2.4 Mbps track
  assert.equal(variants[0].hls, 'https://cdn.example.org/hls/1080_high/index.m3u8');
  assert.equal(variants[1].hls, 'https://cdn.example.org/hls/720/index.m3u8');

  // A 720p-capped master playlist must ONLY report 720p and below (no fake 1080p!)
  const hdOnlyMaster = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720',
    'https://cdn.example.org/720.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=854x480',
    'https://cdn.example.org/480.m3u8',
  ].join('\n');
  const hdOnly = parseHlsMasterVariants(hdOnlyMaster, 'https://cdn.example.org/master.m3u8');
  assert.deepEqual(
    hdOnly.map((v) => v.quality),
    ['720p', '480p']
  );

  // Empty / non-master media playlist returns []
  assert.deepEqual(parseHlsMasterVariants('#EXTM3U\n#EXTINF:6.0,\nseg0.ts', 'https://cdn.example.org/a.m3u8'), []);
  assert.equal(classifyResolutionLabel(3840, 1608), '2160p');
  assert.equal(classifyResolutionLabel(1920, 804), '1080p');
  assert.equal(classifyResolutionLabel(1280, 536), '720p');
});

test('pickBetterQualityStream auto-upgrades 720p mirror stream to 1080p/4K mirror and preserves subtitles', () => {
  const mirror720 = {
    streams: [
      { quality: '720p', hls: 'https://m1.example/720.m3u8', mp4: 'https://m1.example/720.m3u8' },
      { quality: '480p', hls: 'https://m1.example/480.m3u8', mp4: 'https://m1.example/480.m3u8' },
    ],
    subtitles: [{ language: 'Русский', url: 'https://m1.example/ru.vtt' }],
    sourceName: 'Kinobase HLS',
  };
  const mirror1080 = {
    streams: [
      { quality: '1080p', hls: 'https://m2.example/1080.m3u8', mp4: 'https://m2.example/1080.m3u8' },
      { quality: '720p', hls: 'https://m2.example/720.m3u8', mp4: 'https://m2.example/720.m3u8' },
    ],
    subtitles: [],
    sourceName: 'Kinogo Cinemar',
  };

  const chosen = pickBetterQualityStream(mirror720, [mirror1080]);
  assert.ok(chosen);
  assert.equal(chosen.sourceName, 'Kinogo Cinemar');
  assert.equal(chosen.upgradedMirror, true);
  assert.equal(chosen.upgradedFromQuality, '720p');
  assert.equal(chosen.streams[0].quality, '1080p');
  assert.equal(chosen.subtitles.length, 1);
  assert.equal(chosen.subtitles[0].language, 'Русский');

  // Must NOT mark upgraded when candidate has equal or lower quality
  const sameQuality = pickBetterQualityStream(mirror720, [
    { streams: [{ quality: '720p', hls: 'https://m3.example/720.m3u8', mp4: '' }], subtitles: [], sourceName: 'Other' },
  ]);
  assert.equal(sameQuality.sourceName, 'Kinobase HLS');
  assert.equal(sameQuality.upgradedMirror, undefined);

  assert.ok(getQualityScore('1080p Ultra') > getQualityScore('1080p'));
  assert.ok(getQualityScore('2160p') > getQualityScore('1080p Ultra'));
  assert.equal(getMaxQualityScore(mirror720.streams), 720);
  assert.equal(getMaxQualityScore([]), 0);
});

test('getStream automatically switches from a 720p HDRezka mirror to a 1080p alternative mirror for the watched film', async () => {
  const provider = new RezkaProvider('https://hdrezka-home.tv', ['https://hdrezka-home.tv']);
  provider['mediaCache'].set('77777', {
    id: '77777',
    title: 'Начало',
    origTitle: 'Inception',
    year: 2010,
    type: 'films',
  });

  provider.findAlternativeStream = async () => ({
    streams: [
      { quality: '1080p', hls: 'https://cdn.cinemar.cc/inception_1080.m3u8', mp4: 'https://cdn.cinemar.cc/inception_1080.m3u8' },
      { quality: '720p', hls: 'https://cdn.cinemar.cc/inception_720.m3u8', mp4: 'https://cdn.cinemar.cc/inception_720.m3u8' },
    ],
    subtitles: [],
    isAlternative: true,
    sourceName: 'Kinogo Cinemar',
  });

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        url: '[720p]https://stream.voidboost.cc/inception_720.mp4:hls:manifest.m3u8,[480p]https://stream.voidboost.cc/inception_480.mp4:hls:manifest.m3u8',
      }),
      { status: 200 }
    );

  try {
    const result = await provider.getStream({ mediaId: '77777', translatorId: 56 });
    assert.equal(result.upgradedMirror, true);
    assert.equal(result.upgradedFromQuality, '720p');
    assert.equal(result.sourceName, 'Kinogo Cinemar');
    assert.equal(result.streams[0].quality, '1080p');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Strengthened AdBlock catches CIS ad networks, VAST/preroll video ads, and cross-origin clickunder popups without breaking movie streams', () => {
  // New CIS ad & casino hosts
  assert.equal(isAdUrl('https://cdn.advmaker.net/script.js'), true);
  assert.equal(isAdUrl('https://rotator.clickadilla.com/pop'), true);
  assert.equal(isAdUrl('https://imasdk.googleapis.com/js/sdkloader/ima3.js'), true);
  assert.equal(isAdUrl('https://1win-official.xyz/bonus'), true);
  assert.equal(isAdUrl('https://catcasino.top/play'), true);

  // Explicit pre-roll / VAST video ads served as .mp4 or .m3u8 must be blocked
  assert.equal(isAdUrl('https://cdn.randomhost.com/vast/preroll_1xbet.mp4'), true);
  assert.equal(isAdUrl('https://cdn.randomhost.com/reklama/spot15.m3u8'), true);

  // Legitimate movie streams & portals must NEVER be blocked
  assert.equal(isAdUrl('https://cdn.redcdn.org/hls/movie/1080p.m3u8'), false);
  assert.equal(isAdUrl('https://s1.cinemar.cc/stream/seg001.ts'), false);
  assert.equal(isAdUrl('https://kinobase.org/film/100025-pobeg-iz-shoushenka'), false);

  // Cross-origin clickunder popup detection
  assert.equal(isCrossOriginPopupAd('https://random-clickunder.xyz/go?id=99', 'https://kinogo.film/104-movie.html'), true);
  assert.equal(isCrossOriginPopupAd('https://kinogo.film/105-other.html', 'https://kinogo.film/104-movie.html'), false);
  assert.equal(isCrossOriginPopupAd('https://kinobase.org/film/123', 'https://www.google.com/search?q=test'), false);
  assert.equal(isCrossOriginPopupAd('javascript:void(0)', 'https://kinobase.org/'), true);
});

test('VideoPlayer, usePlayerStore, HorizontalSlider & main.ts enforce lag-free VOD HLS, 0:00 intro preservation, sliders & AdBlock hooks', () => {
  const videoPlayerTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/VideoPlayer.tsx'), 'utf8');
  const playerStoreTs = fs.readFileSync(path.resolve(__dirname, '../src/renderer/stores/usePlayerStore.ts'), 'utf8');
  const detailsTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/DetailsPage.tsx'), 'utf8');
  const sliderTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/HorizontalSlider.tsx'), 'utf8');
  const globalsCss = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles/globals.css'), 'utf8');
  const mainTs = fs.readFileSync(path.resolve(__dirname, '../src/main/main.ts'), 'utf8');
  const browserTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/BrowserPage.tsx'), 'utf8');

  // Issue 2 & 3 & 6: VOD HLS config, level lock, explicit startPosition, no periodic-save thrashing
  assert.match(videoPlayerTsx, /lowLatencyMode:\s*false/);
  assert.match(videoPlayerTsx, /startPosition:\s*startSec/);
  assert.match(videoPlayerTsx, /abrEwmaDefaultEstimate:\s*10_000_000/);
  assert.match(videoPlayerTsx, /findBestHlsLevelIndex/);
  assert.match(videoPlayerTsx, /opacity-0 invisible/);
  assert.doesNotMatch(videoPlayerTsx, /\[isOpen,\s*mediaDetails,\s*seasonId,\s*episodeId,\s*currentTime,\s*duration\]/);

  // Issue 6: opening a film defaults to 0:00 and offers resumeOfferTime pill instead of silent intro cut
  assert.match(playerStoreTs, /resumeOfferTime/);
  assert.match(videoPlayerTsx, /Продолжить с/);

  // Issue 1: HorizontalSlider wired into DetailsPage & VideoPlayer with overscroll-behavior-x: contain
  assert.match(detailsTsx, /HorizontalSlider/);
  assert.match(videoPlayerTsx, /HorizontalSlider/);
  assert.match(sliderTsx, /type="range"/);
  assert.match(globalsCss, /overscroll-behavior-x:\s*contain/);

  // Issue 5: main.ts blocks will-redirect & cross-origin popups; BrowserPage removes allowpopups and injects runtime AdBlock
  assert.match(mainTs, /will-redirect/);
  assert.match(mainTs, /isCrossOriginPopupAd/);
  assert.doesNotMatch(browserTsx, /allowpopups:\s*'true'/);
  assert.match(browserTsx, /ADBLOCK_RUNTIME_SCRIPT/);
});
