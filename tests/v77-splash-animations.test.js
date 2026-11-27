const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports);
  return mod.exports;
}

test('v0.4.2 StartupSplash loading menu, instant boot placeholder, and animations are wired', () => {
  const { APP_VERSION } = loadTsModule('src/shared/constants/index.ts');
  const { translations } = loadTsModule('src/renderer/i18n/translations.ts');

  assert.equal(APP_VERSION, '0.4.2');

  for (const loc of ['ru', 'uk', 'en']) {
    const sp = translations[loc].splash;
    assert.ok(sp.tagline);
    assert.ok(sp.stepSettings);
    assert.ok(sp.stepMirrors);
    assert.ok(sp.stepCatalog);
    assert.ok(sp.ready);
    assert.ok(sp.skip);
    assert.ok(sp.activeMirror);
  }

  const splashSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/StartupSplash.tsx'), 'utf8');
  const appSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
  const storeSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/stores/useMediaStore.ts'), 'utf8');
  const homeSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/HomePage.tsx'), 'utf8');
  const catalogSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/CatalogPage.tsx'), 'utf8');
  const sliderSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/MediaSlider.tsx'), 'utf8');
  const cardSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/MediaCard.tsx'), 'utf8');
  const heroSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/HeroBanner.tsx'), 'utf8');
  const cssSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles/globals.css'), 'utf8');
  const htmlSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/index.html'), 'utf8');

  // 1. Live startup readiness tracking & splash gating for top-layer modals
  assert.match(storeSrc, /homeInitialLoaded:\s*false/);
  assert.match(storeSrc, /splashDone:\s*false/);
  assert.match(storeSrc, /setHomeInitialLoaded:/);
  assert.match(storeSrc, /setSplashDone:/);
  assert.match(homeSrc, /setHomeInitialLoaded\(\)/);

  assert.match(splashSrc, /settingsLoaded/);
  assert.match(splashSrc, /homeInitialLoaded/);
  assert.match(splashSrc, /setSplashDone/);
  assert.match(splashSrc, /t\.splash\.skip/);
  assert.match(splashSrc, /prefers-reduced-motion: reduce/);

  assert.match(appSrc, /isWhatsNewOpen && splashDone/);
  assert.match(appSrc, /if \(!splashDone \|\| !settingsLoaded \|\| !whatsNewChecked/);
  assert.match(appSrc, /page-stage-enter/);
  assert.match(appSrc, /toast-enter/);

  // 2. Instant pre-React obsidian boot placeholder in index.html
  assert.match(htmlSrc, /#070507/);
  assert.match(htmlSrc, /#0B070A/);

  // 3. Modern CSS animations: @starting-style, discrete overlay, sibling-index stagger, shimmer skeletons, no 0.01ms reset
  assert.match(cssSrc, /@starting-style/);
  assert.match(cssSrc, /transition-behavior:\s*allow-discrete/);
  assert.match(cssSrc, /transition-property:[^;]*\boverlay\b/);
  assert.match(cssSrc, /@supports\s*\(animation-delay:\s*calc\(sibling-index\(\)\s*\*\s*0\.1s\)\)/);
  assert.match(cssSrc, /\.ember-shimmer/);
  assert.match(cssSrc, /\.toast-enter/);
  assert.match(cssSrc, /\.page-stage-enter/);
  assert.doesNotMatch(cssSrc, /animation-duration:\s*0\.01ms/);

  // 4. Shimmering skeletons & staggered card lists wired in pages/components
  assert.match(homeSrc, /ember-shimmer/);
  assert.match(homeSrc, /cinema-grid cinema-stagger/);
  assert.match(catalogSrc, /ember-shimmer/);
  assert.match(catalogSrc, /cinema-grid cinema-stagger/);
  assert.match(sliderSrc, /cinema-stagger/);
  assert.match(cardSrc, /posterLoaded/);
  assert.match(cardSrc, /cinema-card-sheen/);
  assert.match(heroSrc, /hero-poster-enter/);

  // 5. Smooth directional Hero carousel transitions, 60 FPS blur-free backdrop stack, 3D poster deck & swipe
  assert.match(heroSrc, /slideDirection/);
  assert.match(heroSrc, /prevIndex/);
  assert.match(heroSrc, /hero-backdrop-layer/);
  assert.doesNotMatch(heroSrc, /blur-2xl/);
  assert.match(heroSrc, /hero-slide-in-next/);
  assert.match(heroSrc, /hero-slide-out-next/);
  assert.match(heroSrc, /hero-poster-in-next/);
  assert.match(heroSrc, /hero-stagger-1/);
  assert.match(heroSrc, /hero-stagger-4/);
  assert.match(heroSrc, /handlePointerDown/);
  assert.match(cssSrc, /\.hero-backdrop-layer--active/);
  assert.match(cssSrc, /@keyframes heroSlideInNext/);
  assert.match(cssSrc, /@keyframes heroPosterInNext/);
  assert.match(cssSrc, /@keyframes heroCascadeUp/);
});
