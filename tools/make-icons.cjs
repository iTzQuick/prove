// Renders the home-screen icons (icons/icon-180|192|512.png) with headless Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#17191d"/>
  <rect x="56" y="120" width="400" height="272" rx="28" fill="none" stroke="#f0a23a" stroke-width="18"/>
  <line x1="189" y1="120" x2="189" y2="392" stroke="#f0a23a" stroke-opacity=".35" stroke-width="6"/>
  <line x1="323" y1="120" x2="323" y2="392" stroke="#f0a23a" stroke-opacity=".35" stroke-width="6"/>
  <circle cx="200" cy="210" r="26" fill="#e0453a"/>
  <rect x="176" y="242" width="48" height="96" rx="20" fill="#e0453a"/>
  <circle cx="318" cy="222" r="22" fill="#3a6fe0"/>
  <rect x="298" y="250" width="40" height="84" rx="17" fill="#3a6fe0"/>
  <rect x="56" y="338" width="400" height="54" fill="#f0a23a" fill-opacity=".18"/>
</svg>`;

(async () => {
  const out = path.resolve(__dirname, '..', 'icons');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  for (const size of [180, 192, 512]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await p.screenshot({ path: path.join(out, `icon-${size}.png`) });
    await p.close();
  }
  await b.close();
})();
