#!/usr/bin/env node
// Renders the empty location pack (wide, reverse, three-quarter) plus prompts for a project.
// Usage: node tools/location-pack.cjs [project.json] [--out handoff/location]
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const proj = args.find(a => a.endsWith('.json'));
const oi = args.indexOf('--out'); const out = path.resolve(oi >= 0 ? args[oi + 1] : path.join(ROOT, 'handoff', 'location'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); const f = p.endsWith('/') ? path.join(p, 'index.html') : p;
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1400, height: 850 } });
  await page.goto(`http://127.0.0.1:${srv.address().port}/?layout=desktop`); await page.waitForFunction(() => window.blocking);
  if (proj) await page.evaluate((s) => window.blocking.loadProject(s), JSON.parse(fs.readFileSync(proj, 'utf8')));
  const r = await page.evaluate(() => window.blocking.locationPack(window.blocking.shotIds()[0]));
  fs.mkdirSync(out, { recursive: true });
  for (const [n, b64] of Object.entries(r.files)) fs.writeFileSync(path.join(out, n), Buffer.from(b64, 'base64'));
  fs.writeFileSync(path.join(out, 'prompts.json'), JSON.stringify(r.prompts, null, 2));
  console.log(Object.keys(r.files).join('\n')); await b.close(); srv.close();
});
