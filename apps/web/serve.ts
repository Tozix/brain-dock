#!/usr/bin/env bun
// Tiny production static server for the built SPA (dist/). All real routing is client-side,
// so unknown paths fall back to index.html. TLS/compression are nginx's job on the host.
import { join, normalize } from 'node:path';

const root = join(import.meta.dir, 'dist');
const port = Number(process.env.WEB_PORT ?? 3300);
const index = Bun.file(join(root, 'index.html'));

const server = Bun.serve({
  port,
  async fetch(req) {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname));
    if (path.includes('..')) return new Response('Bad request', { status: 400 });
    const file = Bun.file(join(root, path));
    if (path !== '/' && (await file.exists())) {
      const immutable = path.startsWith('/assets/');
      return new Response(file, {
        headers: immutable ? { 'cache-control': 'public, max-age=31536000, immutable' } : {},
      });
    }
    return new Response(index, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  },
});

console.log(`[web] serving dist/ on http://0.0.0.0:${server.port}`);

process.on('SIGTERM', () => {
  void server.stop().then(() => process.exit(0));
});
process.on('SIGINT', () => {
  void server.stop().then(() => process.exit(0));
});
