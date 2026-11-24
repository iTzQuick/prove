// Writes projects/arena.blocking.json: the arena kit placed from the plan, plus the five
// camera positions numbered on the plan (number = camera, arrow = where it looks).
// Run: node tools/make-arena.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { wx, wz, KIT_CENTER, crestHeight, crestZ } from '../src/arena-map.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const id = () => 'a' + (++n).toString(36).padStart(4, '0');
const r3 = (v) => v.map(x => +x.toFixed(2));

const kit = [
  ['arena_meadow', 'Prato arena', '#6fae3c'],
  ['arena_flowers', 'Fiori', '#ff4f9a'],
  ['arena_ridge', 'Montagna e cresta', '#b9b2a4'],
  ['arena_forest', 'Bosco', '#3f7a33'],
  ['arena_river', 'Fiume', '#3f86e0'],
  ['arena_pond', 'Laghetto', '#3f86e0'],
  ['arena_hub', 'Centro (fiore di metallo)', '#d4a640'],
  ['arena_plates', '24 pedane', '#b8bcc2'],
  ['arena_shield', 'Scudo (bordo)', '#7fe6d0'],
];
const objects = kit.map(([kind, name, color]) => ({
  id: id(), kind, name, tag: '', role: 'set', color, desc: '', hidden: false,
  base: { p: [KIT_CENTER[kind][0], 0, KIT_CENTER[kind][1]], r: [0, 0, 0], s: [1, 1, 1], pose: null },
}));

const sun = { az: -40, el: 42, intensity: 3.0, color: '#fff1d6', fill: 0.55, soft: 0.3 };
const panel = (genre) => ({ genre, era: '2020s', tempo: 'Single shot', body: '35mm Film', lens: 'Anamorphic', aperture: 'f/4 Moderate', light: 'Custom', palette: '' });
const P = (px, py, y) => [wx(px), y, wz(py)];

function shot(num, { cam, target, focal, purpose, rig, move, end, genre = 'Drama' }) {
  const s = {
    id: `SC01_SH0${num}`, duration: 8, aspect: '16:9', resolution: '1080p', model: 'cs4', rig, easing: 'smooth',
    panel: panel(genre), light: { ...sun },
    camBase: { p: r3(cam), target: r3(target), focal }, camKeys: [], tracks: {}, beats: [], purpose,
    audio: 'Wind through grass, distant birdsong, insects buzzing over the flowers. No music, no dialogue, no narration.',
    locks: 'no vehicles; no buildings except the central dais and blossom sculpture',
    musicVideo: false, useBlockingVideo: true, useStartFrame: true, move: move || 'static',
  };
  if (end) s.camKeys = [{ t: 0, ...s.camBase }, { t: 8, p: r3(end.p), target: r3(end.target || target), focal }];
  return s;
}

const ridgeY = crestHeight(953) * 1.15 + 4, cz = crestZ();
const shots = [
  shot(1, {
    cam: P(750, 895, 1.7), target: [0, 4, 0], focal: 28, rig: 'dolly', move: 'push', genre: 'Epic',
    end: { p: P(745, 860, 1.7) },
    purpose: 'Establishing shot: from the southern wildflower meadow the camera looks north across the flowers to the golden metal blossom on its white dais and the ring of 24 metal plates, with the jagged limestone ridge filling the horizon',
  }),
  shot(2, {
    cam: P(691, 718, 1.7), target: P(691, 900, 1.2), focal: 32, rig: 'tripod',
    purpose: 'From the edge of the central dais, eye-level view looking south over the metal plates and the flower meadow toward the river and the oval pond',
  }),
  shot(3, {
    cam: P(983, 843, 2.0), target: [0, 3, 0], focal: 50, rig: 'slider', move: 'left',
    end: { p: P(975, 856, 2.0) },
    purpose: 'From the south-east meadow a long lens looks north-west at the central blossom, compressing it against the mountains',
  }),
  shot(4, {
    cam: P(268, 757, 1.6), target: P(450, 900, 1.0), focal: 24, rig: 'handheld', move: 'handheld',
    purpose: 'Inside the edge of the dark forest, looking south-east through the trunks to where the river bends out of the trees into the sunlit meadow',
  }),
  shot(5, {
    cam: [wx(1010), ridgeY + 30, cz + 22], target: [wx(480), 12, cz + 75], focal: 24, rig: 'drone', move: 'static', genre: 'Epic',
    purpose: 'Aerial view from above the eastern end of the mountain crest, looking west along the jagged ridge with the whole flower valley spread out below on the left',
  }),
];

const project = {
  version: 1,
  meta: {
    project: 'Arena', scene: 'SC01',
    look: 'realistic live action, large-format cinematography, natural daylight',
    styleLock: 'Look: an idyllic, too-perfect artificial paradise: hyper-saturated wildflowers in magenta, orange, red, violet and yellow over lush emerald grass, jagged pale limestone peaks under a clean blue sky, retro-futurist 1970s design for every man-made object, beauty that feels dangerous; real-world materials and physics.',
    locationTag: '@loc_arena_meadow_v1',
    locationDesc: 'a vast enclosed mountain-valley arena about 250 m across: an emerald meadow carpeted with saturated wildflowers; at the centre a round pale lawn with a white circular dais holding a golden metal blossom sculpture, ringed by 24 round metal launch plates; a dense dark forest along the west side; a narrow river running from the northern mountains down the forest edge and across the southern meadow into a small oval pond in the south-east; a wall of jagged limestone peaks along the north; a faint shimmering force-field at the outer edges',
    timeOfDay: 'late morning, clear sky',
  },
  objects, shots, current: 0,
};

fs.mkdirSync(path.join(ROOT, 'projects'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'projects', 'arena.blocking.json'), JSON.stringify(project, null, 2));
console.log('projects/arena.blocking.json:', objects.length, 'pezzi,', shots.length, 'shot');
