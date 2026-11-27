const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
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
  const fn = new Function('require', 'module', 'exports', built.outputFiles[0].text);
  fn(require, mod, mod.exports);
  return mod.exports;
}

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

function walkTsx(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walkTsx(full));
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const { translations } = loadTsModule('src/renderer/i18n/translations.ts');

test('translations.ts has 100% key and placeholder parity across ru, uk, en without language leaks', () => {
  const ru = flatten(translations.ru);
  const uk = flatten(translations.uk);
  const en = flatten(translations.en);
  const allKeys = new Set([...Object.keys(ru), ...Object.keys(uk), ...Object.keys(en)]);

  const placeholders = (s) => (String(s).match(/\{[^}]+\}/g) || []).sort().join(',');

  for (const key of allKeys) {
    assert.ok(key in ru, `Missing key in ru: ${key}`);
    assert.ok(key in uk, `Missing key in uk: ${key}`);
    assert.ok(key in en, `Missing key in en: ${key}`);

    assert.ok(String(ru[key]).trim().length > 0, `Empty ru string at ${key}`);
    assert.ok(String(uk[key]).trim().length > 0, `Empty uk string at ${key}`);
    assert.ok(String(en[key]).trim().length > 0, `Empty en string at ${key}`);

    assert.equal(placeholders(ru[key]), placeholders(uk[key]), `Placeholder mismatch ru vs uk at ${key}`);
    assert.equal(placeholders(ru[key]), placeholders(en[key]), `Placeholder mismatch ru vs en at ${key}`);

    if (key !== 'settings.languageDesc') {
      assert.equal(
        /[А-Яа-яЁёІіЇїЄєҐґ]/.test(en[key]),
        false,
        `Unexpected Cyrillic character in en.${key}: ${en[key]}`
      );
      assert.equal(
        /[ыэъёЫЭЪЁ]/.test(uk[key]),
        false,
        `Unexpected Russian-only letter in uk.${key}: ${uk[key]}`
      );
    }
  }
});

test('Renderer TSX files have no hardcoded Cyrillic tooltips, aria-labels, or placeholders and TitleBar uses useTranslation', () => {
  const rendererDir = path.resolve(__dirname, '../src/renderer');
  const files = walkTsx(rendererDir);
  const attrRegex = /\b(?:title|aria-label|placeholder)=(?:"([^"]*)"|'([^']*)'|\{[`'"]([^`'"]*)[`'"]\})/;

  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      const m = line.match(attrRegex);
      if (m) {
        const val = m[1] ?? m[2] ?? m[3] ?? '';
        assert.equal(
          /[А-Яа-яЁёІіЇїЄєҐґ]/.test(val),
          false,
          `Hardcoded Cyrillic attribute in ${path.relative(rendererDir, file)}:${idx + 1} -> ${val}`
        );
      }
    });
  }

  const titleBarSrc = fs.readFileSync(path.join(rendererDir, 'components/TitleBar.tsx'), 'utf8');
  assert.match(titleBarSrc, /useTranslation/);
  assert.doesNotMatch(titleBarSrc, /Поиск зеркал/);
});
