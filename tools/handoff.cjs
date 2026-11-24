#!/usr/bin/env node
// Blocking Studio → Higgsfield handoff.
// Opens the editor headless, loads a project and writes, for each shot:
//   handoff/<SHOT>/<SHOT>_start_blockout.png, _end_blockout.png, _blocking.mp4|webm, request.json
// request.json holds the generate_image / generate_video params for the Higgsfield connector,
// with placeholders (upload:, element:, job:) that Claude resolves at generation time.
//
// Usage: node tools/handoff.cjs [project.json] [--shots SC01_SH01,SC01_SH02] [--out handoff] [--no-video]
// Without a project file the demo scene is used. Requires Playwright with Chromium.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const projectFile = args.find(a => a.endsWith('.json') && args[args.indexOf(a) - 1] !== '--out');
const outDir = path.resolve(opt('--out', path.join(ROOT, 'handoff')));
const onlyShots = opt('--shots', '') ? opt('--shots', '').split(',') : null;
const withVideo = !args.includes('--no-video');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      const file = p.endsWith('/') ? path.join(p, 'index.html') : p;
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.blocking && window.app);
  await page.waitForTimeout(800); // let the Elements library load
  if (projectFile) {
    const st = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
    await page.evaluate((s) => window.blocking.loadProject(s.project && s.generator ? s.project : s), st);
  } else {
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForFunction(() => window.blocking);
    await page.waitForTimeout(800);
  }
  const ids = (await page.evaluate(() => window.blocking.shotIds())).filter(id => !onlyShots || onlyShots.includes(id));
  if (!ids.length) throw new Error('nessuno shot da esportare');
  for (const id of ids) {
    process.stdout.write(`${id}: render${withVideo ? ' + video in tempo reale' : ''}… `);
    const res = await page.evaluate(({ id, video }) => window.blocking.exportShot(id, { video }), { id, video: withVideo });
    const dir = path.join(outDir, id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, b64] of Object.entries(res.files)) fs.writeFileSync(path.join(dir, name), Buffer.from(b64, 'base64'));
    fs.writeFileSync(path.join(dir, 'request.json'), JSON.stringify(res.package, null, 2));
    console.log(`ok → ${path.relative(process.cwd(), dir)} (${Object.keys(res.files).length} file)`);
    const h = res.package.higgsfield;
    if (h.missing.length) console.log(`  Element mancanti: ${h.missing.join(', ')}`);
  }
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
