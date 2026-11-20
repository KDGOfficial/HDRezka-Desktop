const { createServer } = require('vite');
const { spawn } = require('child_process');
const path = require('path');
const buildElectron = require('./build-electron');

async function startDev() {
  process.env.NODE_ENV = 'development';

  // 1. Start Vite dev server
  console.log('[dev] Starting Vite dev server...');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5173 },
  });
  await server.listen();
  console.log('[dev] Vite dev server listening at http://localhost:5173');

  // 2. Build electron main & preload
  await buildElectron();

  // 3. Launch Electron
  console.log('[dev] Launching Electron...');
  const electronPath = require('electron');
  const childEnv = {
    ...process.env,
    VITE_DEV_SERVER_URL: 'http://localhost:5173',
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const electronProcess = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: childEnv,
  });

  electronProcess.on('close', () => {
    server.close();
    process.exit(0);
  });
}

startDev().catch((err) => {
  console.error(err);
  process.exit(1);
});
