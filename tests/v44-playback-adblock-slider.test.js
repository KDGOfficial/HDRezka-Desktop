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

const {
  isAdUrl,
  isCrossOriginPopupAd,
  APP_VERSION,
  AUTHOR_YOUTUBE_URL,
  AUTHOR_TELEGRAM_URL,
  AUTHOR_GITHUB_URL,
} = loadTsModule('../src/shared/constants/index.ts');
const {
  RezkaProvider,
  getQualityScore,
  getMaxQualityScore,
  classifyResolutionLabel,
  parseHlsMasterVariants,
  matchTranslatorByName,
  pickBetterQualityStream,
} = loadTsModule('../src/core/providers/rezka/provider.ts', ['cheerio', 'electron']);

test('v0.0.55 version synchronization and About Author configuration', () => {
  const provider = new RezkaProvider();
  assert.equal(APP_VERSION, '0.0.55');
  assert.equal(provider.version, '0.0.55');
  assert.equal(AUTHOR_YOUTUBE_URL, 'https://www.youtube.com/@KanalDobrogoGamera');
  assert.equal(AUTHOR_TELEGRAM_URL, 'https://t.me/kdg_yt');
  assert.equal(AUTHOR_GITHUB_URL, 'https://github.com/KDGOfficial');
  assert.ok(fs.existsSync(path.resolve(__dirname, '../src/renderer/assets/author.jpg')));
  const settingsSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/SettingsPage.tsx'), 'utf8');
  assert.match(settingsSrc, /<details[^>]*author-disclosure/);
  assert.match(settingsSrc, /AUTHOR_YOUTUBE_URL/);
  assert.match(settingsSrc, /AUTHOR_TELEGRAM_URL/);
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

  // Master playlist with external #EXT-X-MEDIA:TYPE=AUDIO must keep masterUrl so hls.js preserves audio tracks
  const separatedAudioMaster = [
    '#EXTM3U',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a1",NAME="Russian",DEFAULT=YES,URI="audio_ru.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=5500000,RESOLUTION=1920x1080,AUDIO="a1"',
    'video_1080.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=2200000,RESOLUTION=1280x720,AUDIO="a1"',
    'video_720.m3u8',
  ].join('\n');
  const sepVariants = parseHlsMasterVariants(separatedAudioMaster, 'https://cdn.example.org/hls/master.m3u8');
  assert.deepEqual(sepVariants.map((v) => v.quality), ['1080p', '720p']);
  assert.equal(sepVariants[0].hls, 'https://cdn.example.org/hls/master.m3u8');
  assert.equal(sepVariants[1].hls, 'https://cdn.example.org/hls/master.m3u8');
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
  // Non-ad movie search results opened via target="_blank" from Google must NOT be blocked
  assert.equal(isCrossOriginPopupAd('https://lordfilm.lu/film/12345-inception.html', 'https://www.google.com/search?q=inception'), false);
  // Ad results even from Google must STILL be blocked
  assert.equal(isCrossOriginPopupAd('https://1xbet-official.xyz/promo', 'https://www.google.com/search?q=inception'), true);
  assert.equal(isCrossOriginPopupAd('javascript:void(0)', 'https://kinobase.org/'), true);

  // Extended video ad & CIS ad patterns
  assert.equal(isAdUrl('https://cdn.randomhost.com/ads/spot_01.mp4'), true);
  assert.equal(isAdUrl('https://cdn.randomhost.com/adv/intro.m3u8'), true);
  assert.equal(isAdUrl('https://cdn.randomhost.com/vmap.xml'), true);
  assert.equal(isAdUrl('https://cdn.admixer.net/script.js'), true);
});

test('matchTranslatorByName and cold-cache getStream auto-upgrade preserve dubbing without mediaCache', async () => {
  const kinogoTranslators = [
    { id: 1, name: 'Дубляж' },
    { id: 2, name: 'Украинский' },
    { id: 3, name: 'LostFilm (Kinogo)' },
    { id: 4, name: 'HDRezka Studio' },
  ];
  assert.equal(matchTranslatorByName(kinogoTranslators, 'LostFilm')?.id, 3);
  assert.equal(matchTranslatorByName(kinogoTranslators, 'HDRezka Studio (Kinobase)')?.id, 4);
  assert.equal(matchTranslatorByName(kinogoTranslators, 'UnknownDub'), undefined);

  // Cold mediaCache (e.g. opened from Favorites/History/BrowserPage): params.title + translatorName must still auto-upgrade
  const provider = new RezkaProvider('https://hdrezka-home.tv', ['https://hdrezka-home.tv']);
  let receivedArgs = null;
  provider.findAlternativeStream = async (args) => {
    receivedArgs = args;
    return {
      streams: [{ quality: '1080p', hls: 'https://cdn.cinemar.cc/interstellar_1080.m3u8', mp4: 'https://cdn.cinemar.cc/interstellar_1080.m3u8' }],
      subtitles: [],
      isAlternative: true,
      sourceName: 'Kinogo Cinemar',
    };
  };

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        url: '[720p]https://stream.voidboost.cc/interstellar_720.mp4:hls:manifest.m3u8',
      }),
      { status: 200 }
    );
  try {
    const result = await provider.getStream({
      mediaId: '99999',
      translatorId: 56,
      title: 'Интерстеллар',
      origTitle: 'Interstellar',
      year: 2014,
      translatorName: 'LostFilm',
    });
    assert.equal(result.upgradedMirror, true);
    assert.equal(result.upgradedFromQuality, '720p');
    assert.equal(receivedArgs?.title, 'Интерстеллар');
    assert.equal(receivedArgs?.translatorName, 'LostFilm');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('VideoPlayer, usePlayerStore, HorizontalSlider & main.ts enforce lag-free VOD HLS, 0:00 intro preservation, sliders & AdBlock hooks', () => {
  const videoPlayerTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/VideoPlayer.tsx'), 'utf8');
  const playerStoreTs = fs.readFileSync(path.resolve(__dirname, '../src/renderer/stores/usePlayerStore.ts'), 'utf8');
  const detailsTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/DetailsPage.tsx'), 'utf8');
  const sliderTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/HorizontalSlider.tsx'), 'utf8');
  const globalsCss = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles/globals.css'), 'utf8');
  const mainTs = fs.readFileSync(path.resolve(__dirname, '../src/main/main.ts'), 'utf8');
  const browserTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/BrowserPage.tsx'), 'utf8');

  // Issue 2 & 3 & 6: VOD HLS config, autoStartLoad=false + prefetch, level lock before startLoad, one-shot intro guard, no .m3u8 into video.src
  assert.match(videoPlayerTsx, /lowLatencyMode:\s*false/);
  assert.match(videoPlayerTsx, /autoStartLoad:\s*false/);
  assert.match(videoPlayerTsx, /startFragPrefetch:\s*true/);
  assert.match(videoPlayerTsx, /startPosition:\s*startSec/);
  assert.match(videoPlayerTsx, /let resumeStartPos = startSec/);
  assert.match(videoPlayerTsx, /hls\.startLoad\(resumeStartPos\)/);
  assert.match(videoPlayerTsx, /abrEwmaDefaultEstimate:\s*10_000_000/);
  assert.match(videoPlayerTsx, /findBestHlsLevelIndex/);
  assert.match(videoPlayerTsx, /announcedStreamRef/);
  assert.match(videoPlayerTsx, /!\/\\\.m3u8/);
  assert.match(videoPlayerTsx, /opacity-0 invisible/);
  assert.doesNotMatch(videoPlayerTsx, /\[isOpen,\s*mediaDetails,\s*seasonId,\s*episodeId,\s*currentTime,\s*duration\]/);

  // Issue 6 & 4: opening a film defaults to 0:00, offers resumeOfferTime pill, forwards title/translatorName
  assert.match(playerStoreTs, /resumeOfferTime/);
  assert.match(playerStoreTs, /translatorName:\s*tr\?\.name/);
  assert.match(videoPlayerTsx, /Продолжить с/);

  // Issue 1: HorizontalSlider wired into DetailsPage, VideoPlayer episodes & translator popups, non-passive wheel, MutationObserver
  assert.match(detailsTsx, /HorizontalSlider/);
  assert.doesNotMatch(detailsTsx, /sm:max-w-\[65%\]/);
  assert.match(videoPlayerTsx, /HorizontalSlider/);
  assert.match(videoPlayerTsx, /mediaDetails\.translators\.length > 8/);
  assert.match(sliderTsx, /type="range"/);
  assert.match(sliderTsx, /passive:\s*false/);
  assert.match(sliderTsx, /MutationObserver/);
  assert.match(sliderTsx, /getBoundingClientRect/);
  assert.doesNotMatch(sliderTsx, /Math\.max\(8,\s*progressPercent\)/);
  assert.match(globalsCss, /overscroll-behavior-x:\s*contain/);
  assert.doesNotMatch(globalsCss, /\.slider-track\s*\{[^}]*scroll-behavior:\s*smooth/s);

  // Issue 6 & 4: post-buffer intro guard (FRAG_BUFFERED + loadeddata + playing) and stable streamAnnounceKey
  assert.match(videoPlayerTsx, /Hls\.Events\.FRAG_BUFFERED/);
  assert.match(videoPlayerTsx, /addEventListener\('loadeddata',\s*onHlsLoadedData/);
  assert.match(videoPlayerTsx, /addEventListener\('playing',\s*onHlsPlaying/);
  assert.match(videoPlayerTsx, /streamAnnounceKey/);

  // Issue 5: main.ts blocks will-redirect, cross-origin popups, propagates AdBlock toggle to loaded subframes, and protects <video> in BrowserPage CSS
  assert.match(mainTs, /will-redirect/);
  assert.match(mainTs, /did-frame-finish-load/);
  assert.match(mainTs, /webFrameMain/);
  assert.match(mainTs, /framesInSubtree/);
  assert.match(mainTs, /hdrezka-adblock-css/);
  assert.match(mainTs, /isCrossOriginPopupAd/);
  assert.doesNotMatch(browserTsx, /allowpopups:\s*'true'/);
  assert.match(browserTsx, /ADBLOCK_RUNTIME_SCRIPT/);
  assert.match(browserTsx, /z-index: 2147483647"\]:not\(:has\(video\)\)/);
});

test('Cold-cache getStream fallback after HDRezka mirror failure forwards effective title, year, and translatorName', async () => {
  const provider = new RezkaProvider('https://hdrezka-home.tv', ['https://hdrezka-home.tv']);
  let fallbackArgs = null;
  provider.findAlternativeStream = async (args) => {
    fallbackArgs = args;
    return {
      streams: [{ quality: '1080p', hls: 'https://cdn.cinemar.cc/matrix_1080.m3u8', mp4: 'https://cdn.cinemar.cc/matrix_1080.m3u8' }],
      subtitles: [],
      isAlternative: true,
      sourceName: 'Kinogo Cinemar',
    };
  };

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>503 Service Unavailable</html>', { status: 503 });
  try {
    const result = await provider.getStream({
      mediaId: '88888',
      translatorId: 111,
      title: 'Матрица',
      origTitle: 'The Matrix',
      year: 1999,
      translatorName: 'Дубляж',
    });
    assert.equal(result.sourceName, 'Kinogo Cinemar');
    assert.equal(fallbackArgs?.title, 'Матрица');
    assert.equal(fallbackArgs?.origTitle, 'The Matrix');
    assert.equal(fallbackArgs?.year, 1999);
    assert.equal(fallbackArgs?.translatorName, 'Дубляж');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Skip Ad regex in main.ts and BrowserPage.tsx matches trailing arrows/symbols without false positives', () => {
  const mainTs = fs.readFileSync(path.resolve(__dirname, '../src/main/main.ts'), 'utf8');
  const browserTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/BrowserPage.tsx'), 'utf8');

  const extractRegex = (source) => {
    const m = source.match(/(\/\^\(\?:пропустить[^/]+\/i)/);
    assert.ok(m, 'Skip Ad regex must exist');
    // Unescape double backslashes because regex lives inside a template literal script string
    const raw = m[1].slice(1, -2).replace(/\\\\/g, '\\');
    return new RegExp(raw, 'i');
  };

  const mainRe = extractRegex(mainTs);
  const browserRe = extractRegex(browserTsx);

  const shouldMatch = [
    'Пропустить',
    'Пропустить рекламу',
    'Пропустить »',
    'Пропустить рекламу →',
    'Skip Ad',
    'Skip Ads',
    'Skip Ad →',
    'Skip Ad >',
    'Skip Ad ✕',
    'Пропустить...',
  ];
  const shouldNotMatch = [
    '',
    'Пропустить вступление',
    'Skip Intro',
    'Пропустить (5)',
    'Skip Ad in 3s',
    'Смотреть дальше',
  ];

  for (const label of shouldMatch) {
    assert.equal(mainRe.test(label), true, `main.ts regex should match "${label}"`);
    assert.equal(browserRe.test(label), true, `BrowserPage.tsx regex should match "${label}"`);
  }
  for (const label of shouldNotMatch) {
    assert.equal(mainRe.test(label), false, `main.ts regex must NOT match "${label}"`);
    assert.equal(browserRe.test(label), false, `BrowserPage.tsx regex must NOT match "${label}"`);
  }
});

test('SUBFRAME_ADBLOCK_SCRIPT and ADBLOCK_RUNTIME_SCRIPT skip fake external ad links, hidden nodes, duplicate wrappers, and re-inject CSS on re-enable', () => {
  const vm = require('node:vm');
  const mainTs = fs.readFileSync(path.resolve(__dirname, '../src/main/main.ts'), 'utf8');
  const browserTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/BrowserPage.tsx'), 'utf8');

  const extractScript = (src, constName) => {
    const m = src.match(new RegExp(`const ${constName} = \`([\\s\\S]*?)\`;`));
    assert.ok(m, `${constName} template literal must exist`);
    // Evaluate template literal escapes (\s, \., etc.) identically to JS runtime
    return new Function('return `' + m[1] + '`')();
  };

  const subframeScript = extractScript(mainTs, 'SUBFRAME_ADBLOCK_SCRIPT');
  const disableScript = extractScript(mainTs, 'SUBFRAME_ADBLOCK_DISABLE_SCRIPT');
  const runtimeScript = extractScript(browserTsx, 'ADBLOCK_RUNTIME_SCRIPT');

  const runInMockDom = (script, extraRuns = []) => {
    const clicked = [];
    const styles = new Map();

    const makeEl = (tag, text, opts = {}) => ({
      tagName: tag,
      textContent: text,
      offsetParent: opts.hidden ? null : {},
      _children: opts.children || [],
      _attrs: opts.attrs || {},
      _style: opts.style || { display: 'block', visibility: 'visible', position: 'static', zIndex: '1', opacity: '1', backgroundColor: 'rgb(0,0,0)' },
      getAttribute(k) { return this._attrs[k] ?? null; },
      contains(other) { return this === other || this._children.some((c) => c === other || c.contains(other)); },
      closest() { return null; },
      querySelector() { return null; },
      getBoundingClientRect() { return { width: 100, height: 30 }; },
      remove() {},
      click() { clicked.push(opts.id); },
    });

    const realInnerBtn = makeEl('BUTTON', 'Пропустить рекламу »', { id: 'real-btn' });
    const wrapperDiv = makeEl('DIV', 'Пропустить рекламу »', { id: 'wrapper-div', children: [realInnerBtn] });
    const fakeExternalLink = makeEl('A', 'Пропустить рекламу »', { id: 'fake-ad-link', attrs: { href: 'https://1xbet-promo.xyz/go' } });
    const sameOriginLink = makeEl('A', 'Skip Ad →', { id: 'same-origin-link', attrs: { href: '#' } });
    const hiddenBtn = makeEl('BUTTON', 'Skip Ad →', { id: 'hidden-btn', hidden: true, style: { display: 'none', visibility: 'visible', position: 'static' } });
    const skipElements = [wrapperDiv, realInnerBtn, fakeExternalLink, sameOriginLink, hiddenBtn];

    const sandbox = {
      URL,
      setTimeout,
      clearTimeout,
      location: { href: 'https://player.example.org/embed/1', hostname: 'player.example.org' },
      innerWidth: 1280,
      innerHeight: 720,
      MutationObserver: class { observe() {} },
      getComputedStyle: (el) => el._style,
      document: {
        head: {
          appendChild(node) {
            if (node.id) styles.set(node.id, node);
            node.remove = () => styles.delete(node.id);
          },
        },
        documentElement: {},
        createElement(tag) { return { tagName: tag.toUpperCase(), id: '', textContent: '' }; },
        getElementById(id) { return styles.get(id) || null; },
        querySelectorAll(sel) { return sel.includes('button') ? skipElements : []; },
      },
    };
    sandbox.window = sandbox;
    sandbox.window.open = () => 'opened';

    vm.runInNewContext(script, sandbox);
    for (const s of extraRuns) vm.runInNewContext(s, sandbox);
    return { clicked, styles, sandbox };
  };

  for (const script of [subframeScript, runtimeScript]) {
    const { clicked } = runInMockDom(script);
    assert.deepEqual(clicked.sort(), ['real-btn', 'same-origin-link']);
  }

  // Subframe disable removes CSS & sets flag; re-enabling re-injects CSS cleanly
  const toggled = runInMockDom(subframeScript, [disableScript]);
  assert.equal(toggled.sandbox.__hdrezkaAdBlockEnabled, false);
  assert.equal(toggled.styles.has('hdrezka-adblock-css'), false);

  const reEnabled = runInMockDom(subframeScript, [disableScript, subframeScript]);
  assert.equal(reEnabled.sandbox.__hdrezkaAdBlockEnabled, true);
  assert.equal(reEnabled.styles.has('hdrezka-adblock-css'), true);
});

test('usePlayerStore.setQuality resets stale initialTime when switching quality at 0:00', () => {
  const { usePlayerStore } = loadTsModule('../src/renderer/stores/usePlayerStore.ts');
  usePlayerStore.setState({
    streamData: {
      streams: [
        { quality: '1080p', hls: 'https://cdn.example/1080.m3u8', mp4: '' },
        { quality: '720p', hls: 'https://cdn.example/720.m3u8', mp4: '' },
      ],
      subtitles: [],
    },
    currentQuality: '1080p',
    currentStreamUrl: 'https://cdn.example/1080.m3u8',
    initialTime: 0,
  });

  usePlayerStore.getState().setQuality('720p', 120);
  assert.equal(usePlayerStore.getState().initialTime, 120);

  // User seeks back to 0:00 and switches back to 1080p: initialTime MUST reset to 0, not stay 120!
  usePlayerStore.getState().setQuality('1080p', 0);
  assert.equal(usePlayerStore.getState().initialTime, 0);
  assert.equal(usePlayerStore.getState().currentQuality, '1080p');
});

test('Techaro Anubis (anubis.techaro.lol) challenges are detected across 200/401/403/429/503 and respected by visible verify window', async () => {
  const provider = new RezkaProvider('https://hdrezka.me', ['https://hdrezka.me']);
  const anubisHtml = `<!doctype html><html><head><title>Making sure you're not a bot!</title></head><body><script id="anubis_version" type="application/json">"v1.18.0"</script><p>Protected by <a href="https://anubis.techaro.lol/">Anubis</a></p><div id="anubis-main">${' '.repeat(220)}</div></body></html>`;

  const origFetch = globalThis.fetch;
  try {
    for (const status of [200, 401, 403, 429, 503]) {
      globalThis.fetch = async () => new Response(anubisHtml, { status });
      const [st] = await provider.checkMirrors(['https://hdrezka.me']);
      assert.equal(st.isAvailable, true, `HTTP ${status} Techaro Anubis page must be detected as reachable`);
      assert.equal(st.needsVerification, true, `HTTP ${status} Techaro Anubis page must set needsVerification=true`);
    }
  } finally {
    globalThis.fetch = origFetch;
  }

  const windowTs = fs.readFileSync(path.resolve(__dirname, '../src/main/window.ts'), 'utf8');
  const ipcTs = fs.readFileSync(path.resolve(__dirname, '../src/main/ipc/index.ts'), 'utf8');
  assert.match(windowTs, /techaro\.lol/);
  assert.match(ipcTs, /anubis\.techaro\.lol/);
  assert.match(ipcTs, /Making sure you're not a bot/);
});
