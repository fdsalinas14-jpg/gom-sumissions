// Servidor local: sirve /public y monta las funciones de /api como lo hace Vercel.
// Uso: copia .env.example a .env, rellénalo y ejecuta `node --env-file=.env dev.js`
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(root, 'public');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
        const mod = await import(path.join(root, 'api', `${name}.js`));
        req.query = Object.fromEntries(url.searchParams);
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks).toString();
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch {
          req.body = {};
        }
        return await mod.default(req, res);
      }
      // como Vercel con cleanUrls: /signer → signer.html
      const pathname = url.pathname === '/' ? '/index.html' : path.extname(url.pathname) ? url.pathname : `${url.pathname}.html`;
      let file = path.normalize(path.join(pub, pathname));
      if (!file.startsWith(pub)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
      const data = await fs.readFile(file);
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND') {
        res.statusCode = 404;
        return res.end('Not found');
      }
      console.error(e);
      res.statusCode = 500;
      res.end('Error');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`http://localhost:${port}`));
}
