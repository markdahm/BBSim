// Static server for the app with no dependencies, for the Browser pane: node tools/serve.js [port]
// Serves the project folder on 127.0.0.1 with no caching, and exits after an hour with no requests
// so a forgotten server never outlives the session.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 3007;
const IDLE_MS = 60 * 60 * 1000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.csv': 'text/csv', '.woff2': 'font/woff2', '.woff': 'font/woff' };

let idle = setTimeout(() => process.exit(0), IDLE_MS);
const server = http.createServer((req, res) => {
  clearTimeout(idle); idle = setTimeout(() => process.exit(0), IDLE_MS);
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`BBSim at http://127.0.0.1:${PORT}/ (exits after ${IDLE_MS / 60000} idle minutes)`));
