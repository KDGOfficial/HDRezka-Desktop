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
  getResumableTime,
  getDefaultWindowBounds,
  buildShortcutFromEvent,
  parseShortcut,
  matchesShortcut,
  formatShortcutLabel,
} = loadTsModule('../src/shared/utils/index.ts');
const { DEFAULT_HOTKEYS, DEFAULT_USER_SETTINGS, APP_VERSION } = loadTsModule('../src/shared/constants/index.ts');
const { translations } = loadTsModule('../src/renderer/i18n/translations.ts');

test('getResumableTime resumes unfinished videos and resets finished/unstarted/invalid progress', () => {
  assert.equal(getResumableTime(0, 3600), 0);
  assert.equal(getResumableTime(4.9, 3600), 0);
  assert.equal(getResumableTime(5, 3600), 5);
  assert.equal(getResumableTime(1425, 3600), 1425);
  // Within final 30s of a 1h movie -> considered finished
  assert.equal(getResumableTime(3575, 3600), 0);
  assert.equal(getResumableTime(3569, 3600), 3569);
  // Short clip (200s): 8% = 16s threshold
  assert.equal(getResumableTime(180, 200), 180);
  assert.equal(getResumableTime(185, 200), 0);
  // Invalid edge cases
  assert.equal(getResumableTime(undefined, 3600), 0);
  assert.equal(getResumableTime(100, 0), 0);
  assert.equal(getResumableTime(NaN, 1200), 0);
  assert.equal(getResumableTime(100, Infinity), 0);
});

test('usePlayerStore auto-resumes unfinished movies/episodes and preserves playback time across translator switches', async () => {
  const { usePlayerStore } = loadTsModule('../src/renderer/stores/usePlayerStore.ts');

  const progressMap = new Map([
    ['movie1_0_0', { currentTime: 842, duration: 5400 }],
    ['series1_2_5', { currentTime: 615, duration: 2400 }],
    ['series1_2_6', { currentTime: 2390, duration: 2400 }], // finished
  ]);

  const origWindow = globalThis.window;
  globalThis.window = {
    api: {
      getProgress: async (mediaId, season = 0, episode = 0) =>
        progressMap.get(`${mediaId}_${season}_${episode}`) || null,
      getSeriesEpisodes: async () => [],
      getStream: async ({ translatorId }) => ({
        streams: [
          {
            quality: '1080p',
            hls: `https://cdn.example/tr_${translatorId}_1080.m3u8`,
            mp4: `https://cdn.example/tr_${translatorId}_1080.mp4`,
          },
        ],
        subtitles: [],
      }),
    },
  };

  try {
    const movieDetails = {
      id: 'movie1',
      title: 'Test Movie',
      origTitle: 'Test Movie',
      poster: '',
      year: 2024,
      country: 'USA',
      genres: [],
      type: 'films',
      description: '',
      directors: [],
      actors: [],
      translators: [
        { id: 1, name: 'Дубляж', premium: false },
        { id: 2, name: 'LostFilm', premium: false },
      ],
      similar: [],
    };

    // 1. Opening an unfinished movie auto-resumes from 842s
    await usePlayerStore.getState().openPlayer({ details: movieDetails, translatorId: 1 });
    assert.equal(usePlayerStore.getState().initialTime, 842);
    assert.equal(usePlayerStore.getState().resumeOfferTime, 842);

    // 2. Switching translator while at 1050s must keep playback at 1050s (never reset to 0) and keep resumeOfferTime silent
    await usePlayerStore.getState().switchTranslator(2, 1050);
    assert.equal(usePlayerStore.getState().translatorId, 2);
    assert.equal(usePlayerStore.getState().initialTime, 1050);
    assert.equal(usePlayerStore.getState().resumeOfferTime, null);

    // 3. Rapid/error translator switch with undefined resumeAt must still preserve 1050s
    await usePlayerStore.getState().switchTranslator(1, undefined);
    assert.equal(usePlayerStore.getState().translatorId, 1);
    assert.equal(usePlayerStore.getState().initialTime, 1050);

    // 4. Explicit resume from DetailsPage/HistoryPage (>= 5s) must set both initialTime and resumeOfferTime
    await usePlayerStore.getState().openPlayer({ details: movieDetails, translatorId: 1, startTime: 720 });
    assert.equal(usePlayerStore.getState().initialTime, 720);
    assert.equal(usePlayerStore.getState().resumeOfferTime, 720);

    // 5. Unfinished series episode S2E5 auto-resumes from 615s
    const seriesDetails = { ...movieDetails, id: 'series1', type: 'series' };
    await usePlayerStore.getState().openPlayer({
      details: seriesDetails,
      translatorId: 1,
      seasonId: 2,
      episodeId: 5,
    });
    assert.equal(usePlayerStore.getState().initialTime, 615);

    // 6. Rapid double translator switch on series must let the latest switch win even if earlier getSeriesEpisodes resolves later
    let releaseSlowEpisodes;
    globalThis.window.api.getSeriesEpisodes = async (_id, trId) => {
      if (trId === 2) {
        await new Promise((r) => {
          releaseSlowEpisodes = r;
        });
      }
      return [];
    };
    const slowSwitch = usePlayerStore.getState().switchTranslator(2, 620);
    const fastSwitch = usePlayerStore.getState().switchTranslator(1, 625);
    await fastSwitch;
    releaseSlowEpisodes();
    await slowSwitch;
    assert.equal(usePlayerStore.getState().translatorId, 1);
    assert.equal(usePlayerStore.getState().initialTime, 625);

    // 7. Switching to finished episode S2E6 starts cleanly at 0
    await usePlayerStore.getState().switchEpisode(2, 6);
    assert.equal(usePlayerStore.getState().initialTime, 0);

    // 8. Switching back to unfinished S2E5 resumes at 615s
    await usePlayerStore.getState().switchEpisode(2, 5);
    assert.equal(usePlayerStore.getState().initialTime, 615);

    // 9. retryPlayback preserves current initialTime and translatorId 0 (never coerces 0 to 56)
    const zeroTrDetails = { ...movieDetails, id: 'movie0', currentTranslatorId: 0, translators: [{ id: 0, name: 'Оригинал', premium: false }] };
    await usePlayerStore.getState().openPlayer({ details: zeroTrDetails, translatorId: 0, startTime: 300 });
    await usePlayerStore.getState().retryPlayback();
    assert.equal(usePlayerStore.getState().translatorId, 0);
    assert.equal(usePlayerStore.getState().initialTime, 300);
    assert.equal(usePlayerStore.getState().resumeOfferTime, null);
  } finally {
    globalThis.window = origWindow;
  }
});

test('getDefaultWindowBounds centers default dimensions accurately across displays and multi-monitor offsets', () => {
  const fhd = getDefaultWindowBounds({ x: 0, y: 0, width: 1920, height: 1040 });
  assert.equal(fhd.width, 1613);
  assert.equal(fhd.height, 894);
  assert.equal(fhd.x, Math.round((1920 - 1613) / 2));
  assert.equal(fhd.y, Math.round((1040 - 894) / 2));

  // Ultrawide caps cleanly at 1680x1050
  const ultrawide = getDefaultWindowBounds({ x: 0, y: 0, width: 3440, height: 1400 });
  assert.equal(ultrawide.width, 1680);
  assert.equal(ultrawide.height, 1050);

  // Secondary monitor offset is respected
  const secondDisplay = getDefaultWindowBounds({ x: 1920, y: 40, width: 1920, height: 1040 });
  assert.ok(secondDisplay.x >= 1920);
  assert.ok(secondDisplay.y >= 40);
  assert.equal(secondDisplay.width, fhd.width);

  // Small display never overflows workArea
  const tiny = getDefaultWindowBounds({ x: 0, y: 0, width: 800, height: 600 });
  assert.equal(tiny.width, 800);
  assert.equal(tiny.height, 600);
  assert.equal(tiny.x, 0);
  assert.equal(tiny.y, 0);
});

test('restoreDefaultWindowBounds restores shrunk pinned window immediately and defers restore when unpinned in fullscreen', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const expected = getDefaultWindowBounds(workArea);
  const res = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/main/window.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['electron', 'cheerio'],
  });
  const m = { exports: {} };
  const fakeRequire = (id) => {
    if (id === 'electron') {
      return {
        BrowserWindow: class {},
        shell: {},
        session: {},
        screen: { getDisplayMatching: () => ({ workArea }) },
      };
    }
    return require(id);
  };
  new Function('module', 'exports', 'require', res.outputFiles[0].text)(m, m.exports, fakeRequire);
  const { restoreDefaultWindowBounds } = m.exports;

  // 1. Normal shrunk window restores immediately to centered default bounds
  let bounds = { x: 40, y: 40, width: 480, height: 270 };
  const normalWin = {
    isDestroyed: () => false,
    isMaximized: () => false,
    isFullScreen: () => false,
    isAlwaysOnTop: () => false,
    getBounds: () => ({ ...bounds }),
    setBounds: (b) => { bounds = { ...b }; },
    once: () => {},
  };
  const restored = restoreDefaultWindowBounds(normalWin);
  assert.deepEqual(restored, expected);

  // 2. Fullscreen window defers restore until leave-full-screen fires (only if still unpinned)
  let fsBounds = { x: 0, y: 0, width: 480, height: 270 };
  let isFs = true;
  const listeners = {};
  const fsWin = {
    isDestroyed: () => false,
    isMaximized: () => false,
    isFullScreen: () => isFs,
    isAlwaysOnTop: () => false,
    getBounds: () => ({ ...fsBounds }),
    setBounds: (b) => { fsBounds = { ...b }; },
    once: (evt, cb) => { listeners[evt] = cb; },
  };
  assert.equal(restoreDefaultWindowBounds(fsWin), null);
  assert.equal(fsBounds.width, 480);
  isFs = false;
  listeners['leave-full-screen']();
  assert.deepEqual(fsBounds, expected);
});

test('Shortcut utilities build, parse, match, and format single keys & combinations cleanly', () => {
  // Modifier-only and Escape must not be captured as bindings
  assert.equal(buildShortcutFromEvent({ code: 'ControlLeft', ctrlKey: true }), null);
  assert.equal(buildShortcutFromEvent({ code: 'ShiftRight', shiftKey: true }), null);
  assert.equal(buildShortcutFromEvent({ code: 'AltLeft', altKey: true }), null);
  assert.equal(buildShortcutFromEvent({ code: 'Escape' }), null);
  assert.equal(buildShortcutFromEvent({ code: 'KeyK', metaKey: true }), null);

  // Valid single keys & modifier combos
  assert.equal(buildShortcutFromEvent({ code: 'Space' }), 'Space');
  assert.equal(buildShortcutFromEvent({ code: 'KeyF' }), 'KeyF');
  assert.equal(buildShortcutFromEvent({ code: 'KeyK', ctrlKey: true }), 'Ctrl+KeyK');
  assert.equal(buildShortcutFromEvent({ code: 'KeyP', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+KeyP');
  assert.equal(buildShortcutFromEvent({ code: 'ArrowRight', altKey: true }), 'Alt+ArrowRight');

  // Strict modifier matching
  assert.equal(matchesShortcut({ code: 'Space' }, 'Space'), true);
  assert.equal(matchesShortcut({ code: 'Space', ctrlKey: true }, 'Space'), false);
  assert.equal(matchesShortcut({ code: 'KeyK', ctrlKey: true }, 'Ctrl+KeyK'), true);
  assert.equal(matchesShortcut({ code: 'KeyK' }, 'Ctrl+KeyK'), false);
  assert.equal(matchesShortcut({ code: 'KeyK', ctrlKey: true, metaKey: true }, 'Ctrl+KeyK'), false);

  // Parse & format labels
  assert.deepEqual(parseShortcut('Ctrl+Shift+KeyH'), { ctrl: true, alt: false, shift: true, code: 'KeyH' });
  assert.equal(formatShortcutLabel('Space'), 'Space');
  assert.equal(formatShortcutLabel('KeyF'), 'F');
  assert.equal(formatShortcutLabel('Digit5'), '5');
  assert.equal(formatShortcutLabel('ArrowLeft'), '←');
  assert.equal(formatShortcutLabel('Ctrl+KeyK'), 'Ctrl + K');
  assert.equal(formatShortcutLabel('Alt+Shift+BracketLeft'), 'Alt + Shift + [');
  assert.equal(formatShortcutLabel(''), '—');

  // Default hotkeys must all be present, valid, and conflict-free
  const defaultValues = Object.values(DEFAULT_HOTKEYS);
  assert.equal(defaultValues.length, 11);
  assert.equal(new Set(defaultValues).size, defaultValues.length);
  assert.deepEqual(DEFAULT_USER_SETTINGS.hotkeys, DEFAULT_HOTKEYS);
  assert.equal(APP_VERSION, '0.0.67');
});

test('Responsive container queries, unpin bounds restore, customizable hotkeys, and i18n are wired across files', () => {
  const globalsCss = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles/globals.css'), 'utf8');
  const videoPlayerTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/VideoPlayer.tsx'), 'utf8');
  const browserTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/BrowserPage.tsx'), 'utf8');
  const settingsTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/SettingsPage.tsx'), 'utf8');
  const headerTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/Header.tsx'), 'utf8');
  const ipcTs = fs.readFileSync(path.resolve(__dirname, '../src/main/ipc/index.ts'), 'utf8');
  const windowTs = fs.readFileSync(path.resolve(__dirname, '../src/main/window.ts'), 'utf8');

  // Requirement 2: Container query responsive player UI (calibrated for 320px..1920px without clipping BrowserPage top bar)
  assert.match(globalsCss, /\.cinema-player-stage\s*\{[^}]*container-type:\s*size/s);
  assert.match(globalsCss, /@container player \(max-width: 1120px\)/);
  assert.match(globalsCss, /@container player \(max-width: 920px\)/);
  assert.match(globalsCss, /@container player \(max-width: 720px\)/);
  assert.match(globalsCss, /@container player \(max-width: 520px\)/);
  assert.match(globalsCss, /@container player \(max-width: 410px\)/);
  assert.match(globalsCss, /@container player \(max-height: 360px\)/);
  assert.match(globalsCss, /\.player-osd\s*>\s*\.player-top-bar/);
  assert.match(videoPlayerTsx, /cinema-player-stage/);
  assert.match(videoPlayerTsx, /player-popup/);
  assert.match(videoPlayerTsx, /enforceResumePos/);
  assert.match(videoPlayerTsx, /type !== 'range'/);
  assert.match(videoPlayerTsx, /onSeeked=\{\(\) => persistProgress\(\)\}/);
  assert.match(browserTsx, /cinema-player-stage/);
  assert.doesNotMatch(browserTsx, /title="Открыть на весь экран \(F\)"/);
  assert.doesNotMatch(browserTsx, /title="Показать интерфейс \(H\)"/);

  // Requirement 3: Unpin restores default window bounds (including deferred restore after exiting fullscreen)
  assert.match(windowTs, /export function restoreDefaultWindowBounds/);
  assert.match(windowTs, /leave-full-screen/);
  assert.match(ipcTs, /if \(wasPinned && !newState\)\s*\{\s*restoreDefaultWindowBounds\(win\)/s);

  // Requirement 4: Settings shortcut editor, conflict guards & Header player/input isolation
  assert.match(settingsTsx, /handleResetAllHotkeys/);
  assert.match(settingsTsx, /handleResetSingleHotkey[\s\S]*hotkeysConflict/);
  assert.match(settingsTsx, /recordingShortcut/);
  assert.match(settingsTsx, /DEFAULT_HOTKEYS/);
  assert.match(videoPlayerTsx, /matchesShortcut\(e,\s*hotkeys\./);
  assert.match(headerTsx, /usePlayerStore\.getState\(\)\.isOpen/);
  assert.match(headerTsx, /hasModifier \|\| !isEditing/);

  // All 3 locales must have hotkey labels & updated whatsNew
  for (const locale of ['ru', 'uk', 'en']) {
    assert.ok(translations[locale].settings.hotkeys);
    assert.ok(translations[locale].settings.hotkeysReset);
    assert.ok(translations[locale].settings.hkPlayPause);
    assert.ok(translations[locale].whatsNew.f1_title);
    assert.ok(translations[locale].whatsNew.f4_title);
  }
});
