// Tiny static file server for dist/ (no dependencies).
//   node serve.js [port]        serve dist/ until stopped (Playwright starts this for you)
//   require('./serve').start()  start one from a test (port 0 = any free port); used by the offline test
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function start(port = 0) {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(ROOT, '.' + p);
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({
    url: 'http://127.0.0.1:' + server.address().port + '/',
    // Really stops: also closes connections the browser is keeping open.
    stop: () => new Promise(done => { sockets.forEach(s => s.destroy()); server.close(() => done()); })
  })));
}

module.exports = { start, ROOT };

if (require.main === module) {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) { console.error('dist/index.html is missing. Run "python build.py" in the project folder first.'); process.exit(1); }
  start(+process.argv[2] || +process.env.PORT || 4173).then(s => console.log('serving ' + ROOT + ' at ' + s.url));
}
