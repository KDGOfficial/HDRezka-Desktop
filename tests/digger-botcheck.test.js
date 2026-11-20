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
  const provider = new RezkaProvider('https://hdrezka.kim', ['https://hdrezka.kim', 'https://kinogo.film']);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s.includes('hdrezka.kim')) {
      return new Response('<html><head><title>Проверяем, что вы не бот!</title><script id="anubis_challenge"></script></head><body><div class="within.website">' + 'x'.repeat(400) + '</div></body></html>', { status: 200 });
    }
    return new Response('<html><head><title>KinoGo.film</title></head><body><div class="shortStory">' + 'x'.repeat(400) + '</div></body></html>', { status: 200 });
  };

  try {
    const best = await provider.selectBestMirror();
    assert.equal(best, 'https://kinogo.film', 'Should choose unblocked mirror when active mirror is challenged');
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

test('checkMirrors marks kinogo.film as available without bot verification', async () => {
  const provider = new RezkaProvider('https://kinogo.film', ['https://kinogo.film']);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html><head><title>KinoGo.film</title></head><body><div class="shortStory">' + 'x'.repeat(400) + '</div></body></html>', { status: 200 });

  try {
    const statuses = await provider.checkMirrors();
    const kinogoStatus = statuses.find(s => s.url === 'https://kinogo.film');
    assert.ok(kinogoStatus, 'Kinogo status must be reported');
    assert.equal(kinogoStatus.isAvailable, true, 'Kinogo must be available');
    assert.equal(kinogoStatus.needsVerification, false, 'Kinogo must not require bot verification');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('decodeCinemarFile decodes player playlist correctly', () => {
  const provider = new RezkaProvider('https://kinogo.film', ['https://kinogo.film']);
  // Valid Cinemar #2 base64 sample
  const playlist = [{ id: 'tr-1', title: 'Дубляж', data: 'sample-data' }];
  const encoded = Buffer.from(JSON.stringify(playlist)).toString('base64');
  // Cinemar uses #2<dm><sliced> format where dm is 2 digits
  // Test fallback or object input
  assert.deepEqual(provider['decodeCinemarFile'](playlist), playlist);
  assert.equal(provider['decodeCinemarFile']('invalid-string'), null);
});
