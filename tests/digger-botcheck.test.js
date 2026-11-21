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

test('getDetails preserves translator 0 for Russian/original titles without coercing to 56', async () => {
  const origFetch = globalThis.fetch;
  const russianHtml = `<html><body>
    <input id="post_id" value="11620">
    <div class="b-post__title"><h1>Диггеры (2016)</h1></div>
    <script>sof.tv.initCDNMoviesEvents(11620, 0, 0, 0, 0, 'hdrezka-home.tv', false, {});</script>
  </body></html>`;

  globalThis.fetch = async () => new Response(russianHtml, { status: 200 });
  try {
    const provider = new RezkaProvider('https://hdrezka-home.tv', ['https://hdrezka-home.tv']);
    const details = await provider.getDetails('/films/horror/11620-diggery-2016.html');
    assert.equal(details.currentTranslatorId, 0, 'Must preserve translator 0 for original/Russian titles');
    assert.equal(details.translators[0].id, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('getStream does not falsely flag anti-bot when fallback mirror returns challenge but active mirror failed with business error', async () => {
  const provider = new RezkaProvider('https://hdrezka-home.tv', [
    'https://hdrezka-home.tv',
    'https://rezka-tv.org'
  ]);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('hdrezka-home.tv')) {
      // Active mirror returns normal business response (e.g. film not released or stream unavailable)
      return new Response(JSON.stringify({ success: false, message: 'Фильм еще не вышел в прокат' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // Secondary fallback mirror returns Anubis challenge because user has no session on secondary mirror
      return new Response('<!doctype html><head><title>Проверяем, что вы не бот!</title><script id="anubis_challenge"></script></head>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }
  };

  try {
    await assert.rejects(
      async () => {
        await provider.getStream({ mediaId: '91072', translatorId: 0 });
      },
      (err) => {
        // Must NOT throw "HDRezka требует пройти проверку «Я не бот»"
        assert.ok(
          !err.message.includes('требует пройти проверку «Я не бот»'),
          `Should not falsely accuse bot check, got: ${err.message}`
        );
        assert.ok(
          err.message.includes('Фильм еще не вышел в прокат') || err.message.includes('Видеопоток временно недоступен'),
          `Expected business failure message, got: ${err.message}`
        );
        return true;
      }
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('checkMirrors does not consider 403 or empty responses as available', async () => {
  const provider = new RezkaProvider('https://hdrezka-home.tv', ['https://blocked-mirror.org', 'https://hdrezka-home.tv']);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s.includes('blocked-mirror.org')) {
      return new Response('Forbidden', { status: 403 });
    }
    return new Response('<html><body><div class="b-content">Live Content ' + 'x'.repeat(600) + '</div></body></html>', { status: 200 });
  };

  try {
    const statuses = await provider.checkMirrors();
    const badStatus = statuses.find((s) => s.url.includes('blocked-mirror.org'));
    const goodStatus = statuses.find((s) => s.url.includes('hdrezka-home.tv'));
    assert.equal(badStatus.isAvailable, false, '403 mirror must not be available');
    assert.equal(goodStatus.isAvailable, true, '200 mirror with content must be available');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('checkMirrors marks 200 anti-bot challenge as available with needsVerification=true', async () => {
  const provider = new RezkaProvider('https://hdrezka-home.tv', ['https://challenge-mirror.org']);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response('<html><head><title>Проверяем, что вы не бот!</title></head><body><div class="within.website">' + 'x'.repeat(300) + '</div></body></html>', { status: 200 });
  };
  try {
    const statuses = await provider.checkMirrors();
    assert.equal(statuses[0].isAvailable, true, 'Anti-bot challenge mirror must be marked available');
    assert.equal(statuses[0].needsVerification, true, 'Must have needsVerification=true');
    assert.ok(statuses[0].latencyMs < 9000, 'Latency must be real latency, not 9999');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('RezkaProvider constructor and selectBestMirror sanitize rezka-ua.tv to hdrezka.kim', async () => {
  const provider = new RezkaProvider('https://rezka-ua.tv', ['https://rezka-ua.tv', 'https://hdrezka.kim']);
  assert.equal(provider.getActiveMirror(), 'https://hdrezka.kim', 'Constructor must sanitize broken mirror to active hdrezka.kim');
});

test('checkMirrors marks fake login screen as unavailable', async () => {
  const provider = new RezkaProvider('https://hdrezka.kim', ['https://fake-login-mirror.is']);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html><head><title>Вход на HDrezka</title></head><body><div class="card-face"><form><input name="login"></form></div></body></html>', { status: 200 });

  try {
    const statuses = await provider.checkMirrors();
    assert.equal(statuses[0].isAvailable, false, 'Fake login wall must be marked as unavailable');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('selectBestMirror selects mirror without bot verification if active mirror is challenged', async () => {
  const provider = new RezkaProvider('https://hdrezka.kim', ['https://hdrezka.kim', 'https://rezka-unblocked.org']);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s.includes('hdrezka.kim')) {
      return new Response('<html><head><title>Проверяем, что вы не бот!</title><script id="anubis_challenge"></script></head><body><div class="within.website">' + 'x'.repeat(400) + '</div></body></html>', { status: 200 });
    }
    return new Response('<html><head><title>HDRezka</title></head><body><div class="b-content">' + 'x'.repeat(400) + '</div></body></html>', { status: 200 });
  };

  try {
    const best = await provider.selectBestMirror();
    assert.equal(best, 'https://rezka-unblocked.org', 'Should choose unblocked mirror when active mirror is challenged');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('getStream reports clear message when future title is unreleased', async () => {
  const provider = new RezkaProvider('https://hdrezka-home.tv', ['https://hdrezka-home.tv']);
  // Pre-seed cache with unreleased movie (year 2026)
  provider.getDetails = async () => ({ id: '91072', title: 'Диггер / Землекоп', year: 2026, type: 'films' });

  // Simulate empty stream response from server
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false }), { status: 200 });

  try {
    // Manually prime the internal cache
    provider['mediaCache'].set('91072', { id: '91072', title: 'Диггер / Землекоп', year: 2026, type: 'films' });
    await assert.rejects(
      async () => {
        await provider.getStream({ mediaId: '91072', translatorId: 0 });
      },
      (err) => {
        assert.ok(err.message.includes('ещё не вышел в прокат'), `Should report unreleased status, got: ${err.message}`);
        return true;
      }
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('getStream falls back to alternative stream online when HDRezka has no streams', async () => {
  const provider = new RezkaProvider('https://hdrezka-home.tv', ['https://hdrezka-home.tv']);
  provider['mediaCache'].set('12345', { id: '12345', title: 'Интерстеллар', origTitle: 'Interstellar', year: 2014, type: 'films' });

  // Mock findAlternativeStream to return working Collaps HLS stream
  provider.findAlternativeStream = async () => ({
    streams: [
      { quality: '1080p', hls: 'https://interkh.com/master.m3u8', mp4: 'https://interkh.com/master.m3u8' }
    ],
    subtitles: [],
    isAlternative: true,
    sourceName: 'Collaps / Delivembed'
  });

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false }), { status: 200 });

  try {
    const stream = await provider.getStream({ mediaId: '12345', translatorId: 56 });
    assert.ok(stream.isAlternative, 'Stream should be marked as alternative');
    assert.equal(stream.streams[0].quality, '1080p');
    assert.equal(stream.streams[0].hls, 'https://interkh.com/master.m3u8');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('getStream bails out on first anti-bot response per mirror and throws verification prompt', async () => {
  const provider = new RezkaProvider('https://hdrezka-home.tv', [
    'https://hdrezka-home.tv',
    'https://rezka-tv.org',
  ]);

  let fetchCount = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(
      '<!doctype html><html><head><title>Проверяем, что вы не бот!</title><script id="anubis_challenge"></script></head></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  };

  try {
    await assert.rejects(
      async () => {
        await provider.getStream({ mediaId: '91072', translatorId: 56 });
      },
      (err) => {
        assert.ok(
          err.message.includes('Я не бот') || err.message.includes('Пройти проверку'),
          `Expected verification prompt, got: ${err.message}`
        );
        return true;
      }
    );
    assert.ok(fetchCount <= 2, `Expected at most 1 fetch per mirror (<= 2), got ${fetchCount}`);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('checkMirrors detects root anti-bot instead of being fooled by search.php', async () => {
  const provider = new RezkaProvider('https://hdrezka-home.tv', ['https://hdrezka-home.tv']);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('search.php')) {
      return new Response('<ul class="b-search__section_list"><li>spider</li></ul>', { status: 200 });
    }
    return new Response(
      '<!doctype html><html><head><title>Проверяем, что вы не бот!</title></head><body><div class="within.website">' +
        'x'.repeat(300) +
        '</div></body></html>',
      { status: 200 }
    );
  };

  try {
    const statuses = await provider.checkMirrors();
    assert.equal(statuses[0].isAvailable, true);
    assert.equal(statuses[0].needsVerification, true, 'Must detect root anti-bot challenge');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('checkMirrors marks kinobase.org as available without verification', async () => {
  const provider = new RezkaProvider('https://kinobase.org', ['https://kinobase.org']);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      '<!doctype html><html><head><title>Кинобейс — смотреть фильмы онлайн</title></head><body><div class="container">kinobase ' +
        'x'.repeat(300) +
        '</div></body></html>',
      { status: 200 }
    );

  try {
    const statuses = await provider.checkMirrors();
    assert.equal(statuses[0].isAvailable, true);
    assert.equal(statuses[0].needsVerification, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('parseKinobaseFileString parses multi-voiceover quality streams and translators', () => {
  const provider = new RezkaProvider('https://kinobase.org', ['https://kinobase.org']);
  const sample =
    '[360p]{Дубляж}https://cdn1.redcdn.org/360.m3u8 or https://cdn2.redcdn.org/360.m3u8;{LostFilm}https://cdn1.redcdn.org/lf_360.m3u8,[720p]{Дубляж}https://cdn1.redcdn.org/720.m3u8;{LostFilm}https://cdn1.redcdn.org/lf_720.m3u8,[1080p]{Дубляж}https://cdn1.redcdn.org/1080.m3u8';

  const parsed = provider.parseKinobaseFileString(sample, 1);
  assert.deepEqual(
    parsed.translators.map((t) => [t.id, t.name]),
    [
      [1, 'Дубляж'],
      [2, 'LostFilm'],
    ]
  );
  assert.deepEqual(
    parsed.defaultStreams.map((s) => s.quality),
    ['1080p', '720p', '360p']
  );
  assert.equal(parsed.defaultStreams[0].hls, 'https://cdn1.redcdn.org/1080.m3u8');
  assert.equal(parsed.streamsByTranslator.get(2)?.length, 2);
});

test('pruneProtectedMirrors removes bot-gated and dead mirrors and activates fastest open mirror', async () => {
  const provider = new RezkaProvider('https://rezka.ag', [
    'https://rezka.ag',
    'https://dead-mirror.example',
    'https://kinobase.org',
    'https://kinogo.film',
  ]);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('rezka.ag')) {
      return new Response('<title>Проверяем, что вы не бот!</title>' + 'x'.repeat(300), { status: 200 });
    }
    if (u.includes('dead-mirror')) {
      throw new Error('ECONNREFUSED');
    }
    if (u.includes('kinogo.film')) {
      return new Response('<div class="shortStory">kinogo ' + 'x'.repeat(300) + '</div>', { status: 200 });
    }
    return new Response('<div class="container">kinobase ' + 'x'.repeat(300) + '</div>', { status: 200 });
  };

  try {
    const best = await provider.pruneProtectedMirrors();
    const remaining = provider.getMirrors();
    assert.ok(!remaining.includes('https://rezka.ag'), 'Protected anti-bot mirror must be pruned');
    assert.ok(!remaining.includes('https://dead-mirror.example'), 'Dead mirror must be pruned');
    assert.deepEqual(new Set(remaining), new Set(['https://kinobase.org', 'https://kinogo.film']));
    assert.ok(best === 'https://kinobase.org' || best === 'https://kinogo.film');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Anti-CamRip filter removes TS / CAMRip / Экранка releases from items and translators', async () => {
  const provider = new RezkaProvider('https://kinogo.film', ['https://kinogo.film']);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      `<!doctype html><html><body>
        <div class="shortStory">
          <div class="hTitle"><h2><a href="https://kinogo.film/101-cam.html" title="Блокбастер (2026)">Блокбастер</a></h2></div>
          <div class="sPoster"><img data-src="/p1.jpg" /></div>
          <div class="sInfo"><span class="fQuality"><b>Качество:</b>TS</span></div>
        </div>
        <div class="shortStory">
          <div class="hTitle"><h2><a href="https://kinogo.film/102-hd.html" title="Чистый HD (2026)">Чистый HD</a></h2></div>
          <div class="sPoster"><img data-src="/p2.jpg" /></div>
          <div class="sInfo"><span class="fQuality"><b>Качество:</b>WEB-DL 1080p</span></div>
        </div>
        <div class="shortStory">
          <div class="hTitle"><h2><a href="https://kinogo.film/103-cats.html" title="Cats Musical (2019)">Cats</a></h2></div>
          <div class="sPoster"><img data-src="/p3.jpg" /></div>
          <div class="sInfo"><span class="fQuality"><b>Качество:</b>BDRip 1080p</span></div>
        </div>
      </body></html>`,
      { status: 200 }
    );

  try {
    const res = await provider.searchAdvanced('тест');
    assert.deepEqual(
      res.items.map((i) => i.id),
      ['102', '103'],
      'TS CamRip item must be excluded while non-CamRip titles including "Cats" remain'
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});
