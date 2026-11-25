const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../src/renderer/i18n/translations.ts'), 'utf8');

function extractWhatsNew(lang) {
  const langIdx = src.indexOf(`  ${lang}: {`);
  if (langIdx === -1) return [];
  const wnIdx = src.indexOf('whatsNew: {', langIdx);
  if (wnIdx === -1) return [];
  const endIdx = src.indexOf('    },', wnIdx);
  const block = src.slice(wnIdx, endIdx === -1 ? wnIdx + 4000 : endIdx);

  const items = [];
  for (let i = 1; i <= 5; i++) {
    const tm = block.match(new RegExp(`f${i}_title:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`));
    const dm = block.match(new RegExp(`f${i}_desc:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`));
    if (tm) {
      const title = tm[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
      const desc = dm ? dm[2].replace(/\\'/g, "'").replace(/\\"/g, '"') : '';
      items.push(`- **${title}**${desc ? ` — ${desc}` : ''}`);
    }
  }
  return items;
}

const ru = extractWhatsNew('ru');
const en = extractWhatsNew('en');

const lines = [
  '### Что нового',
  ...(ru.length ? ru : ['- Улучшения стабильности и производительности']),
  '',
  "### What's New",
  ...(en.length ? en : ['- Stability and performance improvements']),
  '',
  '📥 **Скачать актуальную версию / Download latest:** https://github.com/KDGOfficial/HDRezka-Desktop/releases/latest',
];

const outPath = path.resolve(__dirname, '../release/release-notes.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`[release-notes] Wrote ${outPath} (${ru.length} RU / ${en.length} EN items)`);
