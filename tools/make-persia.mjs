// Writes projects/persia.blocking.json: the whole low-poly Persia map (persia-map.js) plus one shot
// for each Higgsfield location Element, each shot with its own location tag.
// Run: node tools/make-persia.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PERSIA_CENTER, BAZAAR, ROOFTOP, MOSQUE, GARDEN, PALACE, SKY_CAM } from '../src/persia-map.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const id = () => 'p' + (++n).toString(36).padStart(4, '0');
const r3 = (v) => v.map(x => +(+x).toFixed(2));
const STAND = { j: { shoulder_l: [0, 0, 8], shoulder_r: [0, 0, -8] }, hipsY: 0 };

const kit = [
  ['persia_sky', 'Cielo al tramonto', '#c54b8d'],
  ['persia_desert', 'Deserto e dune', '#e4c48c'],
  ['persia_mountains', 'Montagne blu', '#3f5693'],
  ['persia_pyramids', 'Tre piramidi', '#d9b071'],
  ['persia_clouds', 'Nuvole', '#ff8fa8'],
  ['persia_ground', 'Terreno città', '#e8cfa2'],
  ['persia_walls', 'Mura e porta sud', '#b98f63'],
  ['persia_houses', 'Case della città', '#d8b88a'],
  ['persia_meydan', 'Piazza e portici', '#d3c3a0'],
  ['persia_palace', 'Palazzo, iwan e cupola d\'oro', '#e3ad3b'],
  ['persia_garden', 'Giardino del palazzo', '#5d8e3c'],
  ['persia_bazaar', 'Bazar coperto', '#f2a01f'],
  ['persia_rooftop', 'Terrazza sul bazar', '#c0623a'],
  ['persia_mosque', 'Moschea turchese e minareti', '#24aeb0'],
];
const objects = kit.map(([kind, name, color]) => ({
  id: id(), kind, name, tag: '', role: 'set', color, desc: '', hidden: false,
  base: { p: [PERSIA_CENTER[kind][0], 0, PERSIA_CENTER[kind][1]], r: [0, 0, 0], s: [1, 1, 1], pose: null },
}));

// Cast and props from the Elements, ready on the rooftop but hidden: show them (eye icon) when a shot needs them.
const roofY = ROOFTOP.h + 0.06;
const cast = [
  ['mannequin', 'Principessa', '@char_persian_princess_v1', 'character', '#d64598', [ROOFTOP.x0 + 8, roofY, ROOFTOP.z0 + 6], 1.72,
    'Low-poly strikingly beautiful adult woman, 172 cm, slim hourglass figure, original face with high cheekbones, full lips, winged kohl eyes, olive skin, glossy black side braid on the left shoulder, gold diadem with one ruby, rose-pink veil, fitted burgundy tunic with gold embroidery, saffron sash, wide saffron trousers, gold slippers, two gold bangles per wrist.'],
  ['mannequin', 'Lova', '@char_lova_persian_v1', 'character', '#3a6fe0', [ROOFTOP.x0 + 9.5, roofY, ROOFTOP.z0 + 6.5], 1.8,
    'Low-poly Lova in Persian streetwear: short dark hair, thin moustache and chin beard, slim red-lens sunglasses with gold temples, pearl-bead necklace with one white broken-heart pendant, open deep indigo hoodie with gold arabesques and a gold Simurgh on the back, white tee, one watch per wrist, very baggy cream jeans with turquoise tile graphics, silver wallet chain, tan work boots.'],
  ['mannequin', 'Djinn', '@char_djinn_v1', 'character', '#2fc0cf', [ROOFTOP.x0 + 11, roofY, ROOFTOP.z1 - 6], 2.2,
    'Low-poly djinn, adult man, about 260 cm with tail, original face, copper skin with glowing turquoise lines, turquoise eyes, white beard in two braids, white-and-saffron turban with one emerald, one silver chain across the bare chest, no legs: violet faceted smoke tail. Empty hands.'],
  ['persia_carpet', 'Tappeto volante', '@prop_flying_carpet_lp_v1', 'prop', '#2b3a8f', [ROOFTOP.x0 + 5, roofY + 0.9, ROOFTOP.z0 + 8], null,
    'One single low-poly flying carpet, 2 x 1.4 m, 2 cm thick, deep indigo field, one terracotta-and-gold eight-pointed star medallion in the centre, gold geometric border, exactly four gold corner tassels, plain indigo underside.'],
  ['persia_lamp', 'Lampada magica', '@prop_magic_lamp_lp_v1', 'prop', '#c99a3e', [ROOFTOP.x0 + 9.4, roofY + 0.48, ROOFTOP.z1 - 5.15], null,
    'One single low-poly brass oil lamp, 30 cm long, boat-shaped body on a round foot, long spout on the right, curled handle on the left, hinged dome lid with one turquoise stone on top, one band of engraved arabesques around the body.'],
];
for (const [kind, name, tag, role, color, p, height, desc] of cast) {
  objects.push({
    id: id(), kind, name, tag, role, color, desc, hidden: true, ...(height ? { height } : {}),
    base: { p: r3(p), r: [0, kind === 'mannequin' ? -90 : 0, 0], s: [1, 1, 1], pose: kind === 'mannequin' ? STAND : null },
  });
}

const panel = (genre, light = 'Custom') => ({ genre, era: '2020s', tempo: 'Single shot', body: '35mm Film', lens: 'Clean Sharp', aperture: 'f/4 Moderate', light, palette: '' });
const sunset = { az: 180, el: 6, intensity: 2.6, color: '#ffae6e', fill: 0.5, soft: 0.35 };
const LOC = {
  sky: { tag: '@loc_lp_persia_sky_sunset_v1', time: 'sunset, low sun',
    desc: 'Low-poly sunset sky at 300 m above faceted magenta, violet and orange clouds; Persian city below with turquoise and gold domes, minarets, one palace gateway; horizon left Egyptian desert with three pyramids, right blue mountains; low sun at centre' },
  garden: { tag: '@loc_lp_palace_garden_bluehour_v1', time: 'blue hour, first stars',
    desc: 'Low-poly empty Persian palace garden at blue hour: long reflecting pool with one octagonal turquoise-tiled fountain, two rows of cypress trees, red rose beds, terracotta walkway, twelve lit brass lanterns along the pool, turquoise-and-gold iwan arch and gold dome at the far end, first stars' },
  alley: { tag: '@loc_lp_bazar_alley_sunset_v1', time: 'sunset',
    desc: 'Low-poly narrow covered Persian bazaar alley at sunset: brass merchant stall left with hanging lamps, trays and teapots on a wooden counter; rug stall right with three hanging kilims and four spice baskets in cones; saffron and indigo canopies with sun shafts; clay walls; turquoise tiled arch and dome at the far end' },
  roof: { tag: '@loc_lp_bazar_rooftop_sunset_v1', time: 'sunset, sun low behind the domes',
    desc: 'Low-poly flat rooftop terrace above a Persian bazaar at sunset: sand clay parapet, two striped saffron-and-indigo awnings on wooden poles left, three brass lanterns, one wooden bench, two clay jars and one rolled purple kilim right; turquoise and gold domes, two minarets, low sun behind' },
};

function shot(num, { cam, target, focal, rig, move, end, purpose, light, loc, audio, pieces, genre = 'General' }) {
  const s = {
    id: `SC01_SH0${num}`, duration: 8, aspect: '16:9', resolution: '1080p', model: 'cs4', rig, easing: 'smooth',
    panel: panel(genre), light: { ...light },
    camBase: { p: r3(cam), target: r3(target), focal }, camKeys: [], tracks: {}, beats: [], purpose,
    audio, locks: 'no vehicles; no modern objects, wires or signs', loc: { ...loc }, onlyPieces: pieces,
    musicVideo: false, useBlockingVideo: true, useStartFrame: true, move: move || 'static',
  };
  if (end) s.camKeys = [{ t: 0, ...s.camBase }, { t: 8, p: r3(end.p), target: r3(end.target || target), focal }];
  return s;
}

const shots = [
  shot(1, {
    cam: SKY_CAM.p, target: SKY_CAM.target, focal: 28, rig: 'drone', move: 'push', genre: 'Epic',
    end: { p: [470, 232, 58] },
    light: sunset, loc: LOC.sky, pieces: ['persia_palace', 'persia_mosque', 'persia_meydan', 'persia_walls', 'persia_pyramids', 'persia_mountains'],
    purpose: 'Aerial sunset establishing shot at about 300 m: above faceted magenta, violet and orange clouds the camera looks west over the whole Persian city with its turquoise and gold domes, minarets and the palace gateway; the desert with three pyramids on the left horizon, blue mountains on the right, the low sun at the centre',
    audio: 'High-altitude wind, soft rush of air past the clouds, a faint distant city hum far below. No music, no dialogue, no narration.',
  }),
  shot(2, {
    cam: [0, 1.7, GARDEN.z1 - 6], target: [0, 7, PALACE.z1], focal: 28, rig: 'dolly', move: 'push',
    end: { p: [0, 1.7, GARDEN.z1 - 14] },
    light: { az: 160, el: 10, intensity: 0.9, color: '#9fb4ff', fill: 0.65, soft: 0.75 },
    loc: LOC.garden, pieces: ['persia_garden', 'persia_palace'],
    purpose: 'From the palace gateway, eye-level view north along the long reflecting pool of the palace garden at blue hour: the octagonal turquoise fountain in the middle, two rows of cypresses, red rose beds, twelve lit brass lanterns along the pool, and at the far end the turquoise-and-gold iwan arch with the gold dome rising behind it',
    audio: 'Water trickling in the fountain, crickets, a soft breeze in the cypresses. No music, no dialogue, no narration.',
  }),
  shot(3, {
    cam: [BAZAAR.x1 - 2.5, 1.6, BAZAAR.z], target: [MOSQUE.portalX, 3.4, BAZAAR.z], focal: 24, rig: 'handheld', move: 'push',
    end: { p: [BAZAAR.x1 - 8, 1.6, BAZAAR.z + 0.2] },
    light: { az: 170, el: 35, intensity: 3.2, color: '#ffb066', fill: 0.95, soft: 0.3 },
    loc: LOC.alley, pieces: ['persia_bazaar', 'persia_mosque'],
    purpose: 'Inside the narrow covered bazaar alley at sunset, slowly walking down the alley: the brass merchant stall on the left, the rug and spice stall on the right, saffron and indigo canopies crossed by sun shafts, and the turquoise tiled arch and dome at the far end',
    audio: 'Soft wind through the covered alley, fabric canopies flapping, a brass lamp chain creaking gently. No music, no dialogue, no narration.',
  }),
  shot(4, {
    cam: [ROOFTOP.x1 - 1.5, ROOFTOP.h + 1.7, ROOFTOP.z1 - 4.5], target: [MOSQUE.domeX, 16, MOSQUE.z - 4], focal: 28, rig: 'slider', move: 'left',
    end: { p: [ROOFTOP.x1 - 1.5, ROOFTOP.h + 1.7, ROOFTOP.z1 - 7] },
    light: { ...sunset, az: 175, el: 5 }, loc: LOC.roof, pieces: ['persia_rooftop', 'persia_mosque'],
    purpose: 'From the flat rooftop terrace above the bazaar at sunset, looking west across the terrace and the rooftops at the turquoise mosque dome, its two minarets and the gold dome, with the low sun behind them',
    audio: 'Warm evening wind, striped awning fabric flapping, swallows calling over the rooftops. No music, no dialogue, no narration.',
  }),
];

const project = {
  version: 1,
  meta: {
    project: 'Persia', scene: 'SC01',
    look: 'stylised low-poly 3D animated film',
    styleLock: 'Look: strongly faceted low-poly 3D world with flat-shaded polygons and crisp edges; clean geometric Persian architecture with turquoise and gold tilework, gold domes, sand clay walls, terracotta paving, saffron and indigo textiles; saturated sunset palette of magenta, violet and orange; soft real light and shadows, no outlines.',
    locationTag: LOC.sky.tag,
    locationDesc: 'a walled low-poly Persian city in the desert: a palace with a turquoise-and-gold iwan and a gold dome behind a long garden with a reflecting pool; a great arcaded square; a covered bazaar leading to a turquoise-domed mosque with two minarets and a gold-domed shrine; flat-roofed clay houses with wind towers; dunes, three pyramids to the south-west and blue mountains to the north',
    timeOfDay: 'sunset',
  },
  objects, shots, current: 0,
};

fs.mkdirSync(path.join(ROOT, 'projects'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'projects', 'persia.blocking.json'), JSON.stringify(project, null, 2));
console.log('projects/persia.blocking.json:', objects.length, 'pezzi,', shots.length, 'shot');
