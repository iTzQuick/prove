#!/usr/bin/env node
// Builds the claude.ai Artifact version of Blocking Studio into dist/artifact/:
// - page body only (claude.ai adds the <html>/<head> skeleton), title and CSS inlined at the top
// - Three.js r160 from cdn.jsdelivr.net (the only script hosts the Artifact CSP allows)
// - app modules, the arena project and (if present) the local Elements library as supporting files
// Usage: node tools/build-artifact.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'artifact');
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'src'), { recursive: true });

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const version = (html.match(/name="app-version" content="([^"]+)"/) || [])[1] || 'dev';
const body = html.split(/<body[^>]*>/)[1].split('</body>')[0]
  .replace(/<script type="module" src="src\/main\.js[^"]*"><\/script>/, '');
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

const modules = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js'));
const imports = { three: `${THREE}/build/three.module.js`, 'three/addons/': `${THREE}/examples/jsm/` };
for (const f of modules) {
  fs.copyFileSync(path.join(ROOT, 'src', f), path.join(OUT, 'src', f));
  imports[`./src/${f}`] = `./src/${f}?v=${version}`;
}

const page = `<title>Blocking Studio</title>
<meta name="app-version" content="${version}">
<style>
:root { color-scheme: dark; }
html, body { height: 100%; }
${css}
</style>
<script type="importmap">${JSON.stringify({ imports }, null, 2)}</script>
${body.trim()}
<script type="module" src="src/main.js?v=${version}"></script>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), page);

const extra = [...fs.readdirSync(path.join(ROOT, 'projects')).filter(f => f.endsWith('.json')).map(f => [`projects/${f}`, 'projects']), ['higgsfield/elements.json', 'higgsfield']];
for (const [rel, dir] of extra) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, rel));
}
console.log('dist/artifact pronto, versione', version);
console.log(fs.readdirSync(OUT, { recursive: true }).filter(f => /\./.test(f)).join('\n'));
