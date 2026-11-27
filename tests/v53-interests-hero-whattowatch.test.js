const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

function loadTsModule(relPath) {
  const res = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '..', relPath)],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
  });
  const m = { exports: {} };
  const fn = new Function('module', 'exports', 'require', res.outputFiles[0].text);
  fn(m, m.exports, require);
  return m.exports;
}

const rec = loadTsModule('src/shared/recommendations.ts');
const { translations } = loadTsModule('src/renderer/i18n/translations.ts');
const { APP_VERSION } = loadTsModule('src/shared/constants/index.ts');

test('Genre normalization maps RU/UK/EN names and URL slugs accurately', () => {
  assert.equal(rec.normalizeGenreToId('Фантастика'), 'fiction');
  assert.equal(rec.normalizeGenreToId('Sci-Fi'), 'fiction');
  assert.equal(rec.normalizeGenreToId('Бойовики'), 'action');
  assert.equal(rec.normalizeGenreToId('Триллер'), 'thriller');
  assert.equal(rec.normalizeGenreToId('Мелодрама'), 'melodrama');
  assert.equal(rec.normalizeGenreToId('Драма'), 'drama');
  assert.equal(rec.normalizeGenreToId('Ужасы'), 'horror');

  const extracted = rec.extractItemGenreIds({
    url: 'https://rezka.ag/films/fiction/56560-dune.html',
    info: '2024, США, Приключения',
    genres: ['Драма'],
  });
  assert.ok(extracted.includes('fiction'));
  assert.ok(extracted.includes('adventures'));
  assert.ok(extracted.includes('drama'));
});

test('Adaptive interests adapt when user tastes shift over time', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const t0 = 1_700_000_000_000;

  // Initially user preferred comedy and watched a comedy 30 days ago
  let profile = {
    ...rec.createEmptyInterestsProfile(),
    onboardingCompleted: true,
    favoriteGenres: ['comedy'],
    favoriteTypes: ['films'],
  };
  profile = rec.recordTasteInteraction(profile, { genres: ['Комедия'], type: 'films' }, 'watch', t0);

  // 30 days later, user shifts to watching Sci-Fi / Thriller series
  const t1 = t0 + 30 * dayMs;
  profile = rec.recordTasteInteraction(profile, { genres: ['Фантастика', 'Триллер'], type: 'series' }, 'watch', t1);
  profile = rec.recordTasteInteraction(profile, { genres: ['Фантастика'], type: 'series' }, 'watch', t1 + 1000);
  profile = rec.recordTasteInteraction(profile, { genres: ['Фантастика'], type: 'series' }, 'favorite', t1 + 2000);

  const topGenres = rec.getTopGenres(profile, 5, t1 + 3000);
  assert.equal(topGenres[0].id, 'fiction', 'Newly watched genre must rise to #1 as taste shifts');
  assert.equal(topGenres[0].source, 'learned');

  const topTypes = rec.getTopTypes(profile, t1 + 3000);
  assert.equal(topTypes[0].type, 'series', 'Newly watched content type must rise above older explicit type');
});

test('Personalized recommendations prioritize matching genres and demote already-watched titles', () => {
  const profile = {
    ...rec.createEmptyInterestsProfile(),
    onboardingCompleted: true,
    favoriteGenres: ['fiction', 'thriller'],
    favoriteTypes: ['films'],
  };

  const candidates = [
    { id: '1', title: 'Old Romance', url: '/films/melodrama/1.html', poster: 'p1.jpg', type: 'films', rating: 7.5, year: 2020 },
    { id: '2', title: 'Watched Sci-Fi', url: '/films/fiction/2.html', poster: 'p2.jpg', type: 'films', rating: 8.8, year: 2025 },
    { id: '3', title: 'Fresh Sci-Fi Thriller', url: '/films/fiction/3.html', poster: 'p3.jpg', type: 'films', genres: ['Фантастика', 'Триллер'], rating: 8.1, year: 2025 },
  ];

  const watchHistory = [
    { id: 'h1', mediaId: '2', title: 'Watched Sci-Fi', poster: 'p2.jpg', type: 'films', currentTime: 3000, duration: 6000, percent: 50, lastWatchedAt: Date.now() },
  ];

  const ranked = rec.buildPersonalizedRecommendations(candidates, profile, watchHistory, 10);
  assert.equal(ranked[0].item.id, '3', 'Unwatched genre-matched item must rank first');
  assert.equal(ranked[ranked.length - 1].item.id, '2', 'Already-watched item must be demoted');
});

test('Dynamic hero banner alternates new releases and personalized recommendations without duplicates', () => {
  const mk = (id, title) => ({ id, title, url: `/films/${id}`, poster: `${id}.jpg`, type: 'films', rating: 8.0, year: 2026 });
  const newReleases = [mk('n1', 'New 1'), mk('n2', 'New 2'), mk('n3', 'New 3')];
  const personalizedRecs = [
    { item: mk('r1', 'Rec 1'), score: 12, matchedGenres: ['fiction'], matchedType: true },
    { item: mk('n1', 'New 1'), score: 11, matchedGenres: ['action'], matchedType: true }, // duplicate of n1
    { item: mk('r2', 'Rec 2'), score: 10, matchedGenres: ['thriller'], matchedType: true },
  ];

  const slides = rec.buildDynamicHeroSlides({
    hero: mk('h1', 'Hero Fallback'),
    newReleases,
    expected: [],
    personalizedRecs,
    popular: [mk('p1', 'Pop 1')],
    maxSlides: 6,
  });

  assert.equal(slides.length, 6);
  assert.equal(slides[0].kind, 'new');
  assert.equal(slides[1].kind, 'recommended');
  assert.deepEqual(slides[1].matchedGenres, ['fiction']);
  const ids = slides.map((s) => s.item.id);
  assert.equal(new Set(ids).size, ids.length, 'Hero slides must be unique');
});

test('What to Watch picker respects category, genre override, and non-repeating suggestions', () => {
  const candidates = [
    { id: 'f1', title: 'Action Movie', url: '/films/action/f1', poster: 'f1.jpg', type: 'films', rating: 7.9, year: 2025 },
    { id: 'f2', title: 'Comedy Movie', url: '/films/comedy/f2', poster: 'f2.jpg', type: 'films', rating: 8.2, year: 2025 },
    { id: 's1', title: 'Crime Series', url: '/series/crime/s1', poster: 's1.jpg', type: 'series', rating: 8.9, year: 2025 },
    { id: 'a1', title: 'Anime Hit', url: '/animation/fantasy/a1', poster: 'a1.jpg', type: 'animation', rating: 8.6, year: 2025 },
  ];

  const excluded = new Set();
  const first = rec.pickWhatToWatchCandidate({
    candidates,
    category: 'films',
    genreOverride: 'action',
    excludedIds: excluded,
  });
  assert.equal(first.item.id, 'f1', 'Genre override must prioritize matching film');

  excluded.add(first.item.id);
  const second = rec.pickWhatToWatchCandidate({
    candidates,
    category: 'films',
    genreOverride: 'action',
    excludedIds: excluded,
  });
  assert.equal(second.item.id, 'f2', 'Suggest another must skip previously shown film');

  const animePick = rec.pickWhatToWatchCandidate({
    candidates,
    category: 'animation',
    excludedIds: new Set(),
  });
  assert.equal(animePick.item.id, 'a1', 'Category filter must pick anime');
});

test('Renamed "Новое на HDRezka", "Что посмотреть" nav, and v0.0.61 version sync + scriptless NSIS updater + portable audio', () => {
  assert.equal(translations.ru.home.expected, 'Новое на HDRezka');
  assert.equal(translations.ru.settings.secExpected, 'Новое на HDRezka');
  assert.equal(translations.uk.home.expected, 'Нове на HDRezka');
  assert.equal(translations.uk.settings.secExpected, 'Нове на HDRezka');
  assert.equal(translations.en.home.expected, 'New on HDRezka');
  assert.equal(translations.en.settings.secExpected, 'New on HDRezka');

  assert.equal(translations.ru.nav.whatToWatch, 'Что посмотреть');
  assert.equal(translations.uk.nav.whatToWatch, 'Що подивитися');
  assert.equal(translations.en.nav.whatToWatch, 'What to Watch');

  // Version sync across all 5 locations
  assert.equal(APP_VERSION, '0.2.3');
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  const mainSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/main.ts'), 'utf8');
  const providerSrc = fs.readFileSync(path.resolve(__dirname, '../src/core/providers/rezka/provider.ts'), 'utf8');
  const readmeSrc = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
  const ipcSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/ipc/index.ts'), 'utf8');
  const workflowSrc = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/release.yml'), 'utf8');
  assert.equal(pkg.version, '0.2.3');
  assert.equal(pkg.build.portable.unpackDirName, 'HDREZKA-Desktop-Portable');
  assert.match(mainSrc, /AudioServiceOutOfProcess,AudioServiceSandbox/);
  assert.match(mainSrc, /setAppUserModelId\('com\.hdrezka\.desktop'\)/);
  assert.match(providerSrc, /public version = '0\.2\.3'/);
  assert.match(readmeSrc, /version-0\.2\.3-crimson/);
  assert.match(readmeSrc, /HDREZKA-Setup-0\.2\.3\.exe/);
  assert.match(readmeSrc, /HDREZKA-Portable-0\.2\.3\.exe/);
  assert.match(workflowSrc, /node_modules\/electron\/dist\/electron\.exe/);
  assert.match(workflowSrc, /HDREZKA-NoSAC-/);
  assert.match(workflowSrc, /HDREZKA-Portable-\*\.exe/);
  assert.match(readmeSrc, /Code Signing Policy/);

  // Auto-updater must launch NSIS directly without generating temporary .bat/.vbs scripts
  assert.match(ipcSrc, /options\.relaunch\s*\?\s*\['\/S',\s*'--updated',\s*'--force-run'\]\s*:\s*\['\/S',\s*'--updated'\]/);
  assert.doesNotMatch(ipcSrc, /hdrezka-update-runner\.vbs/);
  assert.doesNotMatch(ipcSrc, /wscript\.exe/);
  assert.match(ipcSrc, /process\.argv\.includes\('--updated'\)/);

  // Release workflow must support code signing and omit redundant SHA256SUMS.txt (GitHub provides native digests)
  assert.match(workflowSrc, /CSC_LINK/);
  assert.match(workflowSrc, /azure\/trusted-signing-action/);
  assert.match(workflowSrc, /signpath\/github-action-submit-signing-request/);
  assert.doesNotMatch(workflowSrc, /SHA256SUMS\.txt/);
});
