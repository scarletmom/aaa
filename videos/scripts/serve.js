#!/usr/bin/env node
// Local static server that mirrors the host's rewrites: /r/<tag> serves watch.html, and .html is optional.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const PORT = Number(process.env.PORT) || 4000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function resolve(pathname) {
  if (/^\/r\/[^/]+\/?$/.test(pathname)) return path.join(ROOT, 'watch.html');
  const file = path.join(ROOT, path.normalize(decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT)) return null;
  for (const candidate of [file, `${file}.html`, path.join(file, 'index.html')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

http.createServer((req, res) => {
  let file;
  try {
    file = resolve(new URL(req.url, 'http://localhost').pathname);
  } catch {
    file = null;
  }
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`serving ${path.relative(process.cwd(), ROOT) || '.'} at http://localhost:${PORT}`));
