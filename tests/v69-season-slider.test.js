const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('v0.0.69 SeasonScrollTrack slider is wired in SeriesNavigationPanel, VideoPlayer, and globals.css', () => {
  const navSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/SeriesNavigationPanel.tsx'), 'utf8');
  const playerSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/VideoPlayer.tsx'), 'utf8');
  const cssSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles/globals.css'), 'utf8');

  // Reusable SeasonScrollTrack with native range slider, prev/next buttons, and wheel scrolling
  assert.match(navSrc, /export const SeasonScrollTrack/);
  assert.match(navSrc, /type="range"/);
  assert.match(navSrc, /className="ember-range flex-1"/);
  assert.match(navSrc, /aria-valuetext=/);
  assert.match(navSrc, /addEventListener\('wheel',\s*onWheel,\s*\{\s*passive:\s*false\s*\}\)/);
  assert.match(navSrc, /ResizeObserver/);
  assert.match(navSrc, /<SeasonScrollTrack/);

  // Reused for episode range chunks in SeriesNavigationPanel and VideoPlayer episodes popup
  assert.match(navSrc, /<SeasonScrollTrack[\s\S]*ariaLabel="Диапазоны серий"[\s\S]*sliderLabel="Перемотка серий"/);
  assert.match(playerSrc, /SeasonScrollTrack/);
  assert.match(playerSrc, /<SeasonScrollTrack[\s\S]*ariaLabel="Выбор сезона"/);
  assert.match(playerSrc, /<SeasonScrollTrack[\s\S]*ariaLabel="Диапазоны серий"[\s\S]*sliderLabel="Перемотка серий"/);

  // Brand-consistent range slider CSS with separate WebKit & Firefox pseudo-elements and fallback
  assert.match(cssSrc, /\.ember-range::-webkit-slider-runnable-track/);
  assert.match(cssSrc, /\.ember-range::-webkit-slider-thumb/);
  assert.match(cssSrc, /\.ember-range::-moz-range-track/);
  assert.match(cssSrc, /\.ember-range::-moz-range-progress/);
  assert.match(cssSrc, /\.ember-range::-moz-range-thumb/);
  assert.match(cssSrc, /@supports not \(opacity: progress\(1, 0, 100\)\)/);
});
