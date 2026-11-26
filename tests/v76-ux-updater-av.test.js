const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

function loadTs(relPath) {
  const res = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '..', relPath)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['electron', 'sql.js', 'cheerio'],
  });
  const mod = { exports: {} };
  const fn = new Function('exports', 'require', 'module', res.outputFiles[0].text);
  fn(mod.exports, require, mod);
  return mod.exports;
}

const constants = loadTs('src/shared/constants/index.ts');

test('shouldStripExternalScriptCache blocks disk caching for remote JS/HTML while keeping local/images cached', () => {
  const { shouldStripExternalScriptCache } = constants;

  // Remote JS & frames must never be written to Chromium Cache_Data (prevents JS:Trojan.Cryxos AV hits)
  assert.equal(shouldStripExternalScriptCache('https://cdn.example.com/popunder.js', 'script', 'application/javascript'), true);
  assert.equal(shouldStripExternalScriptCache('https://mirror.site/assets/app.mjs', 'other', ''), true);
  assert.equal(shouldStripExternalScriptCache('https://mirror.site/embed', 'subFrame', 'text/html'), true);
  assert.equal(shouldStripExternalScriptCache('https://mirror.site/bundle', 'xhr', 'text/javascript; charset=utf-8'), true);
  assert.equal(shouldStripExternalScriptCache('https://ad.cdn/payload', 'xhr', 'text/plain'), true);
  assert.equal(shouldStripExternalScriptCache('https://ad.cdn/p.php', 'other', 'application/octet-stream'), true);

  // Local dev/file URLs and remote poster images stay cacheable
  assert.equal(shouldStripExternalScriptCache('http://localhost:5173/main.js', 'script', 'application/javascript'), false);
  assert.equal(shouldStripExternalScriptCache('http://127.0.0.1:5173/main.js', 'script', 'application/javascript'), false);
  assert.equal(shouldStripExternalScriptCache('file:///C:/app/index.html', 'mainFrame', 'text/html'), false);
  assert.equal(shouldStripExternalScriptCache('https://kinobase.org/posters/123.jpg', 'image', 'image/jpeg'), false);
  assert.equal(shouldStripExternalScriptCache('https://kinobase.org/posters/123.webp', 'other', 'image/webp'), false);
  assert.equal(shouldStripExternalScriptCache('https://cdn.site/video/seg1.ts', 'media', 'video/mp2t'), false);
  assert.equal(shouldStripExternalScriptCache('', 'script', ''), false);
});

test('selectUpdateAsset picks Portable .exe for Portable runtime and Setup .exe for installed runtime', () => {
  const ipcSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/ipc/index.ts'), 'utf8');
  assert.match(ipcSrc, /PORTABLE_EXECUTABLE_FILE/);
  assert.match(ipcSrc, /export function selectUpdateAsset/);
  assert.match(ipcSrc, /export function runPendingUpdateOnExit/);

  const res = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/main/ipc/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['electron', 'sql.js', 'cheerio'],
  });
  const fakeRequire = (id) => {
    if (id === 'electron') {
      return {
        ipcMain: { handle: () => {} },
        app: {
          name: 'hdrezka-desktop',
          setAppUserModelId: () => {},
          disableHardwareAcceleration: () => {},
          commandLine: { appendSwitch: () => {} },
          requestSingleInstanceLock: () => false,
          quit: () => {},
          on: () => {},
        },
        BrowserWindow: class {},
        shell: {},
        session: {},
        net: {},
        webContents: {},
        webFrameMain: {},
      };
    }
    return require(id);
  };
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', res.outputFiles[0].text)(mod.exports, fakeRequire, mod);

  const assets = [
    { name: 'HDREZKA-NoSAC-0.0.78.zip', browser_download_url: 'https://example/nosac.zip' },
    { name: 'HDREZKA-Portable-0.0.78.exe', browser_download_url: 'https://example/portable.exe' },
    { name: 'HDREZKA-Setup-0.0.78.exe', browser_download_url: 'https://example/setup.exe' },
  ];

  assert.equal(mod.exports.selectUpdateAsset(assets, true)?.name, 'HDREZKA-Portable-0.0.78.exe');
  assert.equal(mod.exports.selectUpdateAsset(assets, false)?.name, 'HDREZKA-Setup-0.0.78.exe');
  // Portable runtime MUST NEVER fall back to Setup .exe (would overwrite Portable with NSIS Setup)
  assert.equal(
    mod.exports.selectUpdateAsset([{ name: 'HDREZKA-Setup-0.0.78.exe', browser_download_url: 'https://example/setup.exe' }], true),
    null
  );
  assert.equal(mod.exports.selectUpdateAsset([{ name: 'HDREZKA-NoSAC-0.0.78.zip' }], false), null);
  assert.equal(mod.exports.selectUpdateAsset([], true), null);
});

test('v0.1.2 UX, mirror latency, navigation, PiP, hover-controls, AV hardening, and release config are wired', () => {
  assert.equal(constants.APP_VERSION, '0.1.2');
  assert.ok(constants.DEFAULT_USER_SETTINGS.app.requestTimeoutMs >= 20000);

  const mainSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/main.ts'), 'utf8');
  const windowSrc = fs.readFileSync(path.resolve(__dirname, '../src/main/window.ts'), 'utf8');
  const appSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
  const storeSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/stores/useMediaStore.ts'), 'utf8');
  const settingsStoreSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/stores/useSettingsStore.ts'), 'utf8');
  const playerSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/VideoPlayer.tsx'), 'utf8');
  const cssSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles/globals.css'), 'utf8');
  const cardSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/MediaCard.tsx'), 'utf8');
  const settingsPageSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/pages/SettingsPage.tsx'), 'utf8');
  const titleBarSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/TitleBar.tsx'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  const workflowSrc = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/release.yml'), 'utf8');

  // 1. Update on exit (not startup popup)
  assert.match(mainSrc, /app\.on\('will-quit'[\s\S]*runPendingUpdateOnExit/);
  assert.match(settingsStoreSrc, /checkForUpdates\(false\)/);
  assert.match(settingsStoreSrc, /downloadUpdate\(true\)/);

  // 2. Mirror latency cap raised (no < 9000ms cutoff)
  assert.doesNotMatch(settingsPageSrc, /latencyMs < 9000/);
  assert.doesNotMatch(titleBarSrc, /latencyMs < 9000/);

  // 3. Card hover jitter fix: inner wrapper lifts, outer hitbox stays fixed
  assert.match(cssSrc, /\.cinema-card:hover \.cinema-card-inner/);
  assert.match(cardSrc, /cinema-card-inner/);

  // 7 & 8. Player controls hidden until hover + clean PiP mode
  assert.match(playerSrc, /useState\(false\)/);
  assert.match(playerSrc, /onMouseLeave=\{handlePlayerMouseLeave\}/);
  assert.match(playerSrc, /data-pinned=\{isPinned \? 'true' : undefined\}/);
  assert.match(cssSrc, /\[data-pinned="true"\] \.player-quality-btn/);

  // 9 & 10. Clean release assets (no SHA256SUMS.txt, no electron-builder auto-publish of latest.yml/.blockmap)
  assert.match(pkg.scripts.dist, /--publish never/);
  assert.doesNotMatch(workflowSrc, /SHA256SUMS\.txt/);

  // 11 & 12. Mouse4/Mouse5 + preserved page/scroll/filters when leaving DetailsPage
  assert.match(windowSrc, /browser-backward/);
  assert.match(windowSrc, /browser-forward/);
  assert.match(appSrc, /e\.button === 3/);
  assert.match(appSrc, /e\.button === 4/);
  assert.match(appSrc, /currentPage === 'details' \? 'hidden' : ''/);
  assert.match(storeSrc, /goBack:/);
  assert.match(storeSrc, /goForward:/);

  // 13. Antivirus cache hardening on both sessions + clearCache on defaultSession + no-store on net.fetch
  const providerSrc = fs.readFileSync(path.resolve(__dirname, '../src/core/providers/rezka/provider.ts'), 'utf8');
  assert.match(mainSrc, /shouldStripExternalScriptCache/);
  assert.match(mainSrc, /hardenSession\(session\.defaultSession/);
  assert.match(mainSrc, /session\.defaultSession\.clearCache\(\)/);
  assert.match(mainSrc, /hardenSession\(browserSession/);
  assert.match(providerSrc, /electron\.net\.fetch\([\s\S]*cache:\s*'no-store'/);
  assert.match(mainSrc, /globalThis\.fetch\s*=[\s\S]*cache:\s*init\?\.cache\s*\?\?\s*'no-store'/);
  const hardenIdx = mainSrc.indexOf('hardenSession(session.defaultSession');
  const findMirrorsIdx = mainSrc.indexOf('.findOnlineMirrors()');
  assert.ok(hardenIdx > 0 && findMirrorsIdx > 0 && hardenIdx < findMirrorsIdx,
    'hardenSession must be registered before provider.findOnlineMirrors() runs'
  );
});

test('Portable PowerShell self-replacement handles spaces, Cyrillic, and single quotes cleanly', () => {
  if (process.platform !== 'win32') return;
  const os = require('node:os');
  const { execFileSync } = require('node:child_process');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hdrezka тест 'portable' "));
  try {
    const src = path.join(tmpDir, "HDREZKA-Portable 'new'.exe");
    const dst = path.join(tmpDir, "HDREZKA-Portable 'old'.exe");
    fs.writeFileSync(src, 'NEW_BINARY_PAYLOAD', 'utf8');
    fs.writeFileSync(dst, 'OLD_BINARY_PAYLOAD', 'utf8');

    const esc = (s) => s.replace(/'/g, "''");
    const psScript = [
      `$src = '${esc(src)}'`,
      `$dst = '${esc(dst)}'`,
      `$copied = $false`,
      `for ($j = 0; $j -lt 5; $j++) { try { Copy-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop; $copied = $true; break } catch { Start-Sleep -Milliseconds 50 } }`,
      `if ($copied) { Remove-Item -LiteralPath $src -Force -ErrorAction SilentlyContinue }`,
    ].join('; ');

    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { stdio: 'ignore' }
    );

    assert.equal(fs.readFileSync(dst, 'utf8'), 'NEW_BINARY_PAYLOAD');
    assert.equal(fs.existsSync(src), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('RezkaProvider resolves relative /uploads/posts posters and data:image lazy placeholders against mirror origin', () => {
  const cheerio = require('cheerio');
  const { RezkaProvider } = loadTs('src/core/providers/rezka/provider.ts');
  const p = new RezkaProvider();
  p.setActiveMirror('https://rezka.ai');

  const html = `
    <div class="b-content__inline_item" data-id="101">
      <div class="b-content__inline_item-cover">
        <a href="/films/thriller/101-zver.html">
          <img src="/uploads/posts/2026-10/101-zver.jpg" />
        </a>
      </div>
      <div class="b-content__inline_item-link">
        <a href="/films/thriller/101-zver.html">Зверь</a>
        <div>2026, США, Триллеры</div>
      </div>
    </div>
    <div class="b-content__inline_item" data-id="102">
      <div class="b-content__inline_item-cover">
        <a href="https://rezka.ac/films/action/102-test.html">
          <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/uploads/posts/2026-11/102-test.jpg" />
        </a>
      </div>
      <div class="b-content__inline_item-link">
        <a href="https://rezka.ac/films/action/102-test.html">Тест</a>
        <div>2026, США, Боевики</div>
      </div>
    </div>
  `;
  const $ = cheerio.load(html);
  const items = $('.b-content__inline_item').map((_, el) => p.parseItem($(el), $)).get();

  assert.equal(items.length, 2);
  assert.equal(items[0].poster, 'https://rezka.ai/uploads/posts/2026-10/101-zver.jpg');
  assert.equal(items[0].url, 'https://rezka.ai/films/thriller/101-zver.html');
  assert.equal(items[1].poster, 'https://rezka.ac/uploads/posts/2026-11/102-test.jpg');
});

test('v0.0.78 compareVersions, stable/dev channel selection, backdrop dismiss, dontRemind & releases/latest', () => {
  const { compareVersions, GITHUB_RELEASES_LATEST_URL } = constants;
  assert.equal(GITHUB_RELEASES_LATEST_URL, 'https://github.com/KDGOfficial/HDRezka-Desktop/releases/latest');

  // Semver + prerelease ordering
  assert.ok(compareVersions('0.0.78', '0.0.77') > 0);
  assert.ok(compareVersions('0.0.78', '0.0.78-dev.1') > 0);
  assert.ok(compareVersions('0.0.78-dev.2', '0.0.78-dev.1') > 0);
  assert.ok(compareVersions('0.0.78-dev.1', '0.0.77') > 0);
  assert.equal(compareVersions('0.0.78', 'v0.0.78'), 0);

  // Channel release selection
  const res = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/main/ipc/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: ['electron', 'sql.js', 'cheerio'],
  });
  const fakeRequire = (id) =>
    id === 'electron'
      ? {
          ipcMain: { handle: () => {} },
          app: {
            name: 'hdrezka-desktop',
            setAppUserModelId: () => {},
            disableHardwareAcceleration: () => {},
            commandLine: { appendSwitch: () => {} },
            requestSingleInstanceLock: () => false,
            quit: () => {},
            on: () => {},
          },
          BrowserWindow: class {},
          shell: {},
          session: {},
          net: {},
          webContents: {},
          webFrameMain: {},
        }
      : require(id);
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', res.outputFiles[0].text)(mod.exports, fakeRequire, mod);

  const releases = [
    { tag_name: 'v0.0.79-dev.1', draft: false, prerelease: true },
    { tag_name: 'v0.0.78', draft: false, prerelease: false },
  ];
  assert.equal(mod.exports.selectReleaseForChannel(releases, 'stable')?.tag_name, 'v0.0.78');
  assert.equal(mod.exports.selectReleaseForChannel(releases, 'dev')?.tag_name, 'v0.0.79-dev.1');

  // Atom feed fallback parsing for stable & dev channels (when api.github.com returns 403 rate limit)
  const sampleAtom = `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <updated>2026-11-26T19:00:00Z</updated>
      <link rel="alternate" type="text/html" href="https://github.com/KDGOfficial/HDRezka-Desktop/releases/tag/v0.1.3-dev.1"/>
      <title>v0.1.3-dev.1</title>
      <content type="html">&lt;p&gt;Dev preview&lt;/p&gt;</content>
    </entry>
    <entry>
      <updated>2026-11-26T18:56:26Z</updated>
      <link rel="alternate" type="text/html" href="https://github.com/KDGOfficial/HDRezka-Desktop/releases/tag/v0.1.2"/>
      <title>v0.1.2</title>
      <content type="html">&lt;h3&gt;Что нового&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;&lt;strong&gt;Фикс&lt;/strong&gt; — Обход лимита GitHub &amp;amp; редирект.&lt;/li&gt;&lt;/ul&gt;</content>
    </entry>
  </feed>`;
  const parsedAtom = mod.exports.parseGitHubReleasesAtom(sampleAtom);
  assert.equal(parsedAtom.length, 2);
  assert.equal(parsedAtom[0].prerelease, true);
  assert.equal(parsedAtom[1].prerelease, false);
  assert.equal(mod.exports.selectReleaseForChannel(parsedAtom, 'stable')?.tag_name, 'v0.1.2');
  assert.equal(mod.exports.selectReleaseForChannel(parsedAtom, 'dev')?.tag_name, 'v0.1.3-dev.1');
  assert.match(parsedAtom[1].body, /Обход лимита GitHub & редирект/);

  // All 4 modals use reliable backdrop onMouseDown/onClick dismiss without closedBy early return
  for (const modal of ['UpdateModal.tsx', 'WhatsNewModal.tsx', 'CollectionModal.tsx', 'InterestsModal.tsx']) {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components', modal), 'utf8');
    assert.doesNotMatch(src, /'closedBy' in HTMLDialogElement/);
    assert.match(src, /backdropPressRef\.current = e\.target === dialogRef\.current/);
  }

  // UpdateModal has dontRemind + structured notes; release.yml generates human-readable notes & prerelease flag
  const updateModalSrc = fs.readFileSync(path.resolve(__dirname, '../src/renderer/components/UpdateModal.tsx'), 'utf8');
  assert.match(updateModalSrc, /handleDontRemind/);
  assert.match(updateModalSrc, /GITHUB_RELEASES_LATEST_URL/);
  const workflowSrc = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/release.yml'), 'utf8');
  assert.match(workflowSrc, /body_path:\s*release\/release-notes\.md/);
  assert.match(workflowSrc, /is_prerelease/);
});
