#!/usr/bin/env node
// Stamps a version on every app file URL in index.html so phones (Safari, home-screen app)
// download fresh files after each update instead of keeping old cached modules.
// Run after every change: node tools/stamp-version.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const version = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

const modules = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).sort();
const imports = {
  three: './vendor/three/three.module.js',
  'three/addons/': './vendor/three/addons/',
};
// Relative imports between modules resolve to these URLs, so the import map can version them all.
for (const f of modules) imports[`./src/${f}`] = `./src/${f}?v=${version}`;

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/,
  `<script type="importmap">\n    ${JSON.stringify({ imports }, null, 2).replace(/\n/g, '\n    ')}\n  </script>`);
html = html.replace(/href="css\/style\.css(\?v=[^"]*)?"/, `href="css/style.css?v=${version}"`);
html = html.replace(/<script type="module" src="src\/main\.js(\?v=[^"]*)?"><\/script>/, `<script type="module" src="src/main.js?v=${version}"></script>`);
html = html.replace(/<meta name="app-version" content="[^"]*">\n?\s*/, '');
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta name="app-version" content="${version}">`);
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('versione', version);
