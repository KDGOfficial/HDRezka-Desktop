const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function buildElectron() {
  const isDev = process.env.NODE_ENV === 'development';
  console.log(`[build-electron] Building main & preload (${isDev ? 'dev' : 'production'})...`);

  // Ensure directories exist
  fs.mkdirSync(path.resolve(__dirname, '../dist/main'), { recursive: true });
  fs.mkdirSync(path.resolve(__dirname, '../dist/preload'), { recursive: true });

  // Copy sql-wasm.wasm if exists in sql.js
  try {
    const wasmPath = path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');
    if (fs.existsSync(wasmPath)) {
      fs.copyFileSync(wasmPath, path.resolve(__dirname, '../dist/main/sql-wasm.wasm'));
      console.log('[build-electron] Copied sql-wasm.wasm');
    }
  } catch (err) {
    console.warn('[build-electron] Warning: could not copy sql-wasm.wasm:', err.message);
  }

  // Build main process
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../src/main/main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: path.resolve(__dirname, '../dist/main/main.js'),
    external: ['electron', 'sql.js', 'cheerio'],
    sourcemap: isDev,
    minify: !isDev,
  });

  // Build preload script
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../src/preload/preload.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: path.resolve(__dirname, '../dist/preload/preload.js'),
    external: ['electron'],
    sourcemap: isDev,
    minify: !isDev,
  });

  console.log('[build-electron] Main & Preload built successfully.');
}

if (require.main === module) {
  buildElectron().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = buildElectron;
