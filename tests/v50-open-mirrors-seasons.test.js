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
  OPEN_MIRROR_SEEDS,
  DEFAULT_MIRRORS,
  isCrossOriginPopupAd,
} = loadTsModule('../src/shared/constants/index.ts');

const {
  RezkaProvider,
  mergeSeasons,
  parseCollapsEmbedHtml,
} = loadTsModule('../src/core/providers/rezka/provider.ts', ['cheerio', 'electron']);

test('OPEN_MIRROR_SEEDS and DEFAULT_MIRRORS include hdstudio.org and kinovod.pro as trusted open mirrors', () => {
  assert.ok(OPEN_MIRROR_SEEDS.includes('http://hdstudio.org'));
  assert.ok(OPEN_MIRROR_SEEDS.includes('https://kinovod.pro'));
  assert.ok(DEFAULT_MIRRORS.includes('http://hdstudio.org'));
  assert.ok(DEFAULT_MIRRORS.includes('https://kinovod.pro'));
  assert.equal(isCrossOriginPopupAd('http://hdstudio.org/serial/ehjforija_1_2_3_season-4/23-1-0-333', 'https://kinobase.org/'), false);
  assert.equal(isCrossOriginPopupAd('https://kinovod.pro/serial/237552-eyforiya', 'https://kinobase.org/'), false);
});

test('mergeSeasons combines missing seasons and episodes across mirrors in ascending order', () => {
  const mirrorA = [
    {
      id: 1,
      title: '1 сезон',
      episodes: [
        { id: 1, episodeId: 1, seasonId: 1, title: 'Серия 1' },
        { id: 2, episodeId: 2, seasonId: 1, title: 'Серия 2' },
      ],
    },
    {
      id: 2,
      title: '2 сезон',
      episodes: [{ id: 1, episodeId: 1, seasonId: 2, title: 'Серия 1' }],
    },
  ];
  const mirrorB = [
    {
      id: 3,
      title: 'Сезон 3',
      episodes: [
        { id: 2, episodeId: 2, seasonId: 3, title: 'Серия 2' },
        { id: 1, episodeId: 1, seasonId: 3, title: 'Серия 1' },
      ],
    },
    {
      id: 2,
      title: 'Сезон 2',
      episodes: [
        { id: 1, episodeId: 1, seasonId: 2, title: 'Серия 1' },
        { id: 2, episodeId: 2, seasonId: 2, title: 'Серия 2' },
      ],
    },
  ];

  const merged = mergeSeasons(undefined, mirrorA, [], mirrorB);
  assert.deepEqual(merged.map((s) => s.id), [1, 2, 3]);
  assert.deepEqual(merged[0].episodes.map((e) => e.episodeId), [1, 2]);
  assert.deepEqual(merged[1].episodes.map((e) => e.episodeId), [1, 2]);
  assert.deepEqual(merged[2].episodes.map((e) => e.episodeId), [1, 2]);
  assert.deepEqual(mergeSeasons(undefined, []), []);
});

test('parseCollapsEmbedHtml extracts unsorted multi-season series, dubbing audioTrackIndex, subtitles, and movies', () => {
  const seriesHtml = `
    <script>
      makePlayer({
        seasons: [
          {"season":2,"blocked":false,"episodes":[{"episode":"1","hls":"https://cdn.interkh.com/s2e1/master.m3u8","audio":{"names":["Amedia","Eng.Original"]},"cc":[{"url":"https://cdn.interkh.com/s2e1.vtt","name":"Рус. субтитры"}],"title":"Эйфория [2 сезон] - 1 серия"}]},
          {"season":1,"blocked":false,"episodes":[{"episode":"1","hls":"https://cdn.interkh.com/s1e1/master.m3u8","audio":{"names":["Amedia","Eng.Original"]},"cc":[]}]},
          {"season":3,"blocked":false,"episodes":[{"episode":"1","hls":"https://cdn.interkh.com/s3e1/master.m3u8","audio":{"names":["Syncmer","HDRezka Studio","LostFilm","Eng.Original"]},"cc":[{"url":"https://cdn.interkh.com/s3e1.vtt","name":"Рус. полные"}]}]}
        ],
        autoplay: false
      });
    </script>
  `;
  const parsed = parseCollapsEmbedHtml(seriesHtml);
  assert.ok(parsed);
  assert.equal(parsed.isSeries, true);
  assert.deepEqual(parsed.seasons.map((s) => s.id), [1, 2, 3]);
  assert.ok(parsed.translators.some((t) => t.name === 'HDRezka Studio'));
  assert.ok(parsed.translators.some((t) => t.name === 'LostFilm'));

  const s3e1 = parsed.getEpisodeData(3, 1, 'LostFilm');
  assert.ok(s3e1);
  assert.equal(s3e1.hls, 'https://cdn.interkh.com/s3e1/master.m3u8');
  assert.equal(s3e1.audioTrackIndex, 2);
  assert.equal(s3e1.subtitles.length, 1);
  assert.equal(s3e1.subtitles[0].url, 'https://cdn.interkh.com/s3e1.vtt');

  // Non-existent season/episode must return null (never silently return S1E1)
  assert.equal(parsed.getEpisodeData(4, 1, 'LostFilm'), null);

  // Movie embed payload
  const movieHtml = `
    <script>
      makePlayer({
        hls: "https:\\/\\/cdn.interkh.com\\/movie\\/master.m3u8?t=123",
        audio: {"names":["Рус. Дублированный","Eng.Original"]},
        cc: [{"url":"https://cdn.interkh.com/ru.vtt","name":"Рус. полные"}]
      });
    </script>
  `;
  const movie = parseCollapsEmbedHtml(movieHtml);
  assert.ok(movie);
  assert.equal(movie.isSeries, false);
  const movData = movie.getEpisodeData(undefined, undefined, 'Eng.Original');
  assert.ok(movData);
  assert.equal(movData.hls, 'https://cdn.interkh.com/movie/master.m3u8?t=123');
  assert.equal(movData.audioTrackIndex, 1);
  assert.equal(movData.subtitles.length, 1);

  assert.equal(parseCollapsEmbedHtml('<html>empty</html>'), null);
});

test('parseHdStudioItems extracts HDStudio cards cleanly', () => {
  const provider = new RezkaProvider();
  const html = `
    <div class="item-box">
      <a href="http://hdstudio.org/serial/ehjforija_1_2_3_season-4/23-1-0-333">
        <div class="img">
          <img src="/uploads/posts/2019-07/thumbs/63986872.jpg" alt="Эйфория">
          <div class="mshort-imdb">8.4</div>
          <div class="poster-rate"><span>4.3</span></div>
          <div class="episodes-update"><span>3 сезон 8 серия</span></div>
        </div>
        <div class="title">Эйфория</div>
      </a>
    </div>
  `;
  const items = provider.parseHdStudioItems(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'hdstudio-23-1-0-333');
  assert.equal(items[0].title, 'Эйфория');
  assert.equal(items[0].poster, 'http://hdstudio.org/uploads/posts/2019-07/thumbs/63986872.jpg');
  assert.equal(items[0].rating, 8.4);
  assert.equal(items[0].type, 'series');
  assert.match(items[0].info, /3 сезон 8 серия/);
});

test('getDetails routes explicit HDStudio URL directly even when activeMirror is kinobase.org and strips geoBlock', async () => {
  const provider = new RezkaProvider('https://kinobase.org', ['https://kinobase.org', 'http://hdstudio.org']);
  const fetchedUrls = [];
  const origFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const s = String(url);
    fetchedUrls.push(s);
    if (s.includes('hdstudio.org/serial/ehjforija')) {
      return new Response(
        `<html><head>
          <meta property="og:image" content="http://hdstudio.org/uploads/euphoria.jpg" />
          <meta property="og:description" content="Ру Беннет возвращается домой." />
        </head><body>
          <h1>Эйфория</h1>
          <div class="pgs-sinfo_list">Жанр: <span>Драма</span></div>
          <div class="pgs-sinfo_list">Дата выхода: <span>2019-06-16</span></div>
          <div class="pgs-sinfo_list">Оригинал: <span>Euphoria</span></div>
          <div class="pgs-sinfo_list">Страна: <span>США</span></div>
          <iframe src="https://apiplayers.insertunit.ws/embed/kp/1178445?geoBlock=UA"></iframe>
        </body></html>`,
        { status: 200 }
      );
    }
    if (s === 'https://apiplayers.insertunit.ws/embed/kp/1178445') {
      return new Response(
        `<script>seasons: [
          {"season":1,"episodes":[{"episode":"1","hls":"https://cdn.interkh.com/s1e1.m3u8","audio":{"names":["Amedia"]}}]},
          {"season":2,"episodes":[{"episode":"1","hls":"https://cdn.interkh.com/s2e1.m3u8","audio":{"names":["Amedia"]}}]},
          {"season":3,"episodes":[{"episode":"1","hls":"https://cdn.interkh.com/s3e1.m3u8","audio":{"names":["HDRezka Studio","LostFilm"]}}]}
        ]</script>`,
        { status: 200 }
      );
    }
    return new Response('', { status: 404 });
  };

  try {
    const details = await provider.getDetails('http://hdstudio.org/serial/ehjforija_1_2_3_season-4/23-1-0-333');
    assert.equal(details.title, 'Эйфория');
    assert.equal(details.origTitle, 'Euphoria');
    assert.equal(details.year, 2019);
    assert.deepEqual(details.seasons.map((s) => s.id), [1, 2, 3]);
    assert.ok(fetchedUrls.includes('https://apiplayers.insertunit.ws/embed/kp/1178445'), 'Must strip ?geoBlock=UA');
    assert.ok(!fetchedUrls.some((u) => u.includes('geoBlock=UA')), 'Must never pass geoBlock=UA');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Series missing Season 3 on Kinobase merges Season 3 from Collaps and streams exact S3E1 instead of S1E1', async () => {
  const provider = new RezkaProvider('https://kinobase.org', ['https://kinobase.org', 'http://hdstudio.org']);
  // Seed Kinobase player cache with ONLY seasons 1 & 2, plus kpId 1178445
  const kbUrl = 'https://kinobase.org/serial/245093-eyforiya';
  provider['mediaUrlCache'].set('245093', kbUrl);
  provider['mediaCache'].set('245093', {
    id: '245093',
    title: 'Эйфория',
    origTitle: 'Euphoria',
    year: 2019,
    type: 'series',
    url: kbUrl,
  });
  provider['kinobasePlayerCache'].set(kbUrl, {
    ts: Date.now(),
    kpId: '1178445',
    file: [
      { title: '1 сезон', folder: [{ title: '1 серия', file: '[1080p]{Amedia}https://cdn.kinobase.org/s1e1.m3u8' }] },
      { title: '2 сезон', folder: [{ title: '1 серия', file: '[1080p]{Amedia}https://cdn.kinobase.org/s2e1.m3u8' }] },
    ],
  });

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s === kbUrl) {
      return new Response(
        `<html><body>
          <div id="title"><h1>Эйфория</h1></div>
          <a href="https://www.kinopoisk.ru/film/1178445/">KP</a>
          <script>var MOVIE_TYPE = "serials";</script>
        </body></html>`,
        { status: 200 }
      );
    }
    if (s === 'https://apiplayers.insertunit.ws/embed/kp/1178445') {
      return new Response(
        `<script>seasons: [
          {"season":1,"episodes":[{"episode":"1","hls":"https://cdn.interkh.com/s1e1.m3u8","audio":{"names":["Amedia"]}}]},
          {"season":2,"episodes":[{"episode":"1","hls":"https://cdn.interkh.com/s2e1.m3u8","audio":{"names":["Amedia"]}}]},
          {"season":3,"episodes":[{"episode":"1","hls":"https://cdn.interkh.com/s3e1.m3u8","audio":{"names":["Syncmer","HDRezka Studio","LostFilm"]}}]}
        ]</script>`,
        { status: 200 }
      );
    }
    if (s === 'https://cdn.interkh.com/s3e1.m3u8') {
      return new Response(
        [
          '#EXTM3U',
          '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a0",NAME="Syncmer",DEFAULT=YES,URI="a1.m3u8"',
          '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a0",NAME="HDRezka Studio",DEFAULT=NO,URI="a2.m3u8"',
          '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a0",NAME="LostFilm",DEFAULT=NO,URI="a3.m3u8"',
          '#EXT-X-STREAM-INF:BANDWIDTH=4200000,RESOLUTION=1920x1080,AUDIO="a0"',
          'v1080.m3u8',
        ].join('\n'),
        { status: 200 }
      );
    }
    return new Response('', { status: 404 });
  };

  try {
    const details = await provider.getDetails(kbUrl);
    assert.deepEqual(details.seasons.map((s) => s.id), [1, 2, 3], 'Must merge Season 3 from Collaps');

    const s3Stream = await provider.getStream({
      mediaId: '245093',
      translatorId: 1,
      translatorName: 'LostFilm',
      season: 3,
      episode: 1,
      title: 'Эйфория',
      year: 2019,
    });
    assert.equal(s3Stream.sourceName, 'HDStudio / Collaps');
    assert.equal(s3Stream.streams[0].quality, '1080p');
    assert.equal(s3Stream.streams[0].hls, 'https://cdn.interkh.com/s3e1.m3u8');
    assert.equal(s3Stream.audioTrackIndex, 2, 'Must select LostFilm audio track index 2');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('checkMirrors and pruneProtectedMirrors accept hdstudio.org and kinovod.pro as open mirrors', async () => {
  const provider = new RezkaProvider('https://rezka.ag', [
    'https://rezka.ag',
    'https://kinovod.pro',
    'http://hdstudio.org',
  ]);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s.includes('rezka.ag')) {
      return new Response('<html><title>Проверяем, что вы не бот!</title><script id="anubis_challenge"></script>' + 'x'.repeat(300) + '</html>', { status: 200 });
    }
    if (s.includes('kinovod.pro')) {
      return new Response('<html><title>Киновод</title><body><div class="kinovod">' + 'x'.repeat(300) + '</div></body></html>', { status: 200 });
    }
    if (s.includes('hdstudio.org')) {
      return new Response('<html><title>StudioHD</title><body><div class="item-box">hdstudio' + 'x'.repeat(300) + '</div></body></html>', { status: 200 });
    }
    return new Response('', { status: 404 });
  };

  try {
    const active = await provider.pruneProtectedMirrors();
    const kept = provider.getMirrors();
    assert.ok(kept.includes('https://kinovod.pro'));
    assert.ok(kept.includes('http://hdstudio.org'));
    assert.ok(!kept.includes('https://rezka.ag'));
    assert.ok(active === 'https://kinovod.pro' || active === 'http://hdstudio.org');
  } finally {
    globalThis.fetch = origFetch;
  }
});
