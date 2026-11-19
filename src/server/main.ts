/**
 * LAN host entry point.
 *  - `npm start` (production): serves the built client and Socket.IO on one port (default 3000).
 *  - `npm run dev`: runs as the Socket.IO backend (port 3001) behind the Vite dev server's proxy.
 */
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seededRng } from '../shared/random';
import { attachLanServer } from './socketServer';
import { createStaticHandler } from './staticFiles';

const isDev = process.env.NODE_ENV !== 'production' && !import.meta.url.includes('/dist/');
const port = Number(process.env.PORT ?? (isDev ? process.env.DEV_BACKEND_PORT ?? 3001 : 3000));
const host = process.env.HOST ?? '0.0.0.0';

const here = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(here, '../client'); // dist/server -> dist/client

const httpServer = createServer(
  isDev
    ? (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' }).end('Dev backend. Open the Vite URL (port 5173) instead.');
      }
    : createStaticHandler(clientDir),
);

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

// In development, players open the Vite dev server (5173), which proxies Socket.IO here.
const publicPort = isDev ? Number(process.env.VITE_PORT ?? 5173) : port;
// Test-only: a fixed seed makes every game predictable (used by scripts/e2e-lan.mjs).
// Set by the host operator only; clients can never influence randomness.
const testSeed = Number(process.env.CLOUDBORNE_TEST_SEED);
if (Number.isInteger(testSeed) && testSeed > 0) {
  console.warn(`WARNING: CLOUDBORNE_TEST_SEED=${testSeed} is set. Every game is predictable. Use for automated tests only.`);
}
attachLanServer(httpServer, {
  log: (m) => console.log(`[lobby] ${m}`),
  shareUrls: lanAddresses().map((ip) => `http://${ip}:${publicPort}/`),
  ...(Number.isInteger(testSeed) && testSeed > 0 ? { rngFactory: () => seededRng(testSeed) } : {}),
});

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Set PORT=<number> to choose another.`);
  else console.error(err);
  process.exit(1);
});

httpServer.listen(port, host, () => {
  if (isDev) {
    console.log(`Dev Socket.IO backend listening on ${host}:${port} (proxied by Vite).`);
    return;
  }
  console.log('\nCloudborne prototype server running.');
  console.log(`  This computer:  http://localhost:${port}/`);
  const lan = lanAddresses();
  if (lan.length) for (const ip of lan) console.log(`  LAN:            http://${ip}:${port}/`);
  else console.log('  LAN:            no network interface found (are you connected to a network?)');
  console.log('\nOther players open a LAN URL in their browser. Press Ctrl+C to stop (the game is kept in memory only).\n');
});
