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

test('analyzeUserTaste weighs watch completion, recency, favorites, and extracts similar candidates', () => {
  const now = 1_750_000_000_000;
  const watchHistory = [
    {
      id: 'h1',
      mediaId: 'dune',
      title: 'Дюна',
      poster: 'dune.jpg',
      type: 'films',
      url: 'https://kinobase.org/films/fiction/dune',
      currentTime: 7200,
      duration: 8000,
      percent: 90,
      lastWatchedAt: now - 3600_000,
    },
    {
      id: 'h2',
      mediaId: 'dropped-comedy',
      title: 'Случайная комедия',
      poster: 'com.jpg',
      type: 'films',
      url: 'https://kinobase.org/films/comedy/com',
      currentTime: 120,
      duration: 5400,
      percent: 2,
      lastWatchedAt: now - 1800_000,
    },
  ];

  const favorites = [
    {
      mediaId: 'interstellar',
      title: 'Интерстеллар',
      poster: 'inter.jpg',
      type: 'films',
      year: 2014,
      rating: 8.7,
      addedAt: now - 7200_000,
    },
  ];

  const enrichedDetailsMap = {
    dune: {
      id: 'dune',
      title: 'Дюна',
      genres: ['Фантастика', 'Приключения'],
      similar: [
        {
          id: 'arrival',
          title: 'Прибытие',
          url: '/films/fiction/arrival',
          poster: 'arrival.jpg',
          type: 'films',
          year: 2016,
          rating: 8.1,
          genres: ['Фантастика', 'Драма'],
        },
        {
          // Already watched — must be excluded from similarCandidates
          id: 'dune',
          title: 'Дюна',
          url: 'https://kinobase.org/films/fiction/dune',
          poster: 'dune.jpg',
          type: 'films',
        },
      ],
    },
    interstellar: {
      id: 'interstellar',
      title: 'Интерстеллар',
      genres: ['Фантастика', 'Драма'],
      similar: [],
    },
  };

  const analysis = rec.analyzeUserTaste({
    watchHistory,
    favorites,
    enrichedDetailsMap,
    now,
  });

  assert.equal(analysis.hasHistorySignal, true);
  assert.equal(analysis.watchedCount, 2);
  assert.equal(analysis.favoritesCount, 1);
  assert.equal(analysis.dominantType, 'films');
  assert.equal(analysis.topGenres[0].id, 'fiction', 'Completed sci-fi watch + favorite must dominate over 2% dropped comedy');
  assert.equal(analysis.topGenres[0].sharePercent, 100);
  assert.ok(analysis.recentAnchors.some((a) => a.id === 'dune'));
  assert.ok(!analysis.recentAnchors.some((a) => a.id === 'dropped-comedy'), 'Barely-started 2% item should not become a taste anchor');
  assert.equal(analysis.similarCandidates.length, 1);
  assert.equal(analysis.similarCandidates[0].item.id, 'arrival');
  assert.equal(analysis.similarCandidates[0].similarToTitle, 'Дюна');
});

test('rankInteractiveRecommendations and applyInteractiveFeedback adapt live to reactions and moods', () => {
  const analysis = rec.analyzeUserTaste({
    watchHistory: [
      {
        id: 'h1',
        mediaId: 'w1',
        title: 'Дюна',
        poster: 'dune.jpg',
        type: 'films',
        url: '/films/fiction/w1',
        currentTime: 5000,
        duration: 6000,
        percent: 85,
        lastWatchedAt: Date.now(),
      },
    ],
    enrichedDetailsMap: {
      w1: {
        id: 'w1',
        title: 'Дюна',
        genres: ['Фантастика'],
        similar: [
          {
            id: 'sim1',
            title: 'Бегущий по лезвию 2049',
            url: '/films/fiction/sim1',
            poster: 'br2049.jpg',
            type: 'films',
            year: 2017,
            rating: 8.2,
            genres: ['Фантастика', 'Триллер'],
          },
        ],
      },
    },
  });

  const candidates = [
    {
      id: 'c-horror',
      title: 'Заклятие',
      url: '/films/horror/c-horror',
      poster: 'h.jpg',
      type: 'films',
      year: 2023,
      rating: 7.7,
      genres: ['Ужасы'],
    },
    {
      id: 'c-comedy',
      title: 'Большой куш комедия',
      url: '/films/comedy/c-comedy',
      poster: 'c.jpg',
      type: 'films',
      year: 2025,
      rating: 7.8,
      genres: ['Комедия'],
    },
    {
      id: 'c-scifi2',
      title: 'Марсианин',
      url: '/films/fiction/c-scifi2',
      poster: 'm.jpg',
      type: 'films',
      year: 2015,
      rating: 8.0,
      genres: ['Фантастика', 'Приключения'],
    },
  ];

  // Auto mode prioritizes similar-to-watched sci-fi with calibrated Match %
  const initial = rec.rankInteractiveRecommendations({
    candidates,
    analysis,
    category: 'auto',
    mood: 'auto',
    currentYear: 2026,
  });
  assert.equal(initial[0].item.id, 'sim1');
  assert.equal(initial[0].similarToTitle, 'Дюна');
  assert.ok(initial[0].matchPercent >= 80 && initial[0].matchPercent <= 99);

  // Mood "dark" shifts horror up
  const darkRanked = rec.rankInteractiveRecommendations({
    candidates,
    analysis,
    category: 'films',
    mood: 'dark',
    currentYear: 2026,
  });
  assert.ok(darkRanked.some((r) => r.item.id === 'c-horror' && r.matchedMood === 'dark'));

  // Live "not_for_me" reaction hides the item and demotes its genres in session
  let session = rec.createEmptyInteractiveSession();
  session = rec.applyInteractiveFeedback(session, initial[0].item, 'not_for_me');
  assert.ok(session.dismissedIds.includes('sim1'));
  assert.ok(session.genreDeltas.fiction < 0);

  const afterDislike = rec.rankInteractiveRecommendations({
    candidates,
    analysis,
    category: 'films',
    mood: 'auto',
    session,
    currentYear: 2026,
  });
  assert.ok(!afterDislike.some((r) => r.item.id === 'sim1'), 'Disliked item must never reappear in ranked deck');

  // Live "more_like_this" boosts the item's genres
  const comedySession = rec.applyInteractiveFeedback(
    rec.createEmptyInteractiveSession(),
    candidates[1],
    'more_like_this'
  );
  assert.ok(comedySession.genreDeltas.comedy > 0);
});

test('Interactive WhatToWatch translations and UI wiring exist for RU/UK/EN', () => {
  for (const loc of ['ru', 'uk', 'en']) {
    const w = translations[loc].whatToWatch;
    assert.ok(w.categoryAuto);
    assert.ok(w.matchBadge.includes('{percent}'));
    assert.ok(w.similarTo.includes('{title}'));
    assert.ok(w.moreLikeThis);
    assert.ok(w.notForMe);
    assert.ok(w.alreadySeen);
    assert.ok(w.tasteDnaTitle);
    assert.ok(w.upNextTitle);
    assert.ok(w.moods.auto && w.moods.adrenaline && w.moods.relax && w.moods.mindbend && w.moods.dark && w.moods.fresh);
  }

  const pageSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/WhatToWatchPage.tsx'), 'utf8');
  assert.match(pageSrc, /analyzeUserTaste/);
  assert.match(pageSrc, /rankInteractiveRecommendations/);
  assert.match(pageSrc, /applyInteractiveFeedback/);
  assert.match(pageSrc, /hdrezka_wtw_dismissed_v1/);
});
