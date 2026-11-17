import { build } from 'vite';

console.log('--- STARTING VITE BUILD ---');
try {
  const result = await build();
  console.log('--- VITE BUILD SUCCESS ---');
} catch (err) {
  console.error('--- VITE BUILD ERROR ---', err);
  process.exit(1);
}
