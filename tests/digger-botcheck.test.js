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

test('getStream correctly reports anti-bot when active mirror itself is protected by anti-bot challenge', async () => {
  const provider = new RezkaProvider('https://hdrezka-home.tv', ['https://hdrezka-home.tv']);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response('<!doctype html><head><title>Проверяем, что вы не бот!</title><script id="anubis_challenge"></script></head>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  };

  try {
    await assert.rejects(
      async () => {
        await provider.getStream({ mediaId: '1481', translatorId: 56 });
      },
      (err) => {
        assert.ok(
          err.message.includes('HDRezka требует пройти проверку «Я не бот»'),
          `Must report bot check when active mirror is challenged, got: ${err.message}`
        );
        return true;
      }
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});
