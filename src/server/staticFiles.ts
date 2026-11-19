/** Minimal static file handler for the built client (no framework needed). */
import { createReadStream, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

export function createStaticHandler(rootDir: string) {
  const root = resolve(rootDir);
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    let stat = safeStat(file);
    if (stat?.isDirectory()) {
      file = join(file, 'index.html');
      stat = safeStat(file);
    }
    if (!stat?.isFile()) {
      // Single-page app: unknown paths get index.html.
      file = join(root, 'index.html');
      stat = safeStat(file);
      if (!stat?.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Client not built. Run `npm run build`.');
        return;
      }
    }
    const isAsset = file.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  };
}

function safeStat(path: string) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}
