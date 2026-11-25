// Writes projects/persia-clip.blocking.json: a nine-shot music-video sequence across the whole
// low-poly Persia map. Lova is the protagonist (always the main subject); the Princess guides him
// through the city; each shot features one special element of the place.
// Story: desert gate → main street → the square (she appears) → bazaar → rooftop (the lamp)
// → the djinn → the flying carpet takes off → flight over the city → landing in the palace garden.
// Run: node tools/make-persia.mjs && node tools/make-persia-clip.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ROOFTOP, BAZAAR, MOSQUE } from '../src/persia-map.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects', 'persia.blocking.json'), 'utf8'));
const objects = base.objects.map(o => ({ ...o, hidden: false }));
const byName = (n) => objects.find(o => o.name === n).id;
const ID = { lova: byName('Lova'), princess: byName('Principessa'), djinn: byName('Djinn'), carpet: byName('Tappeto volante'), lamp: byName('Lampada magica') };
const T = { lova: '@char_lova_persian_v1', princess: '@char_persian_princess_v1', djinn: '@char_djinn_v1', carpet: '@prop_flying_carpet_lp_v1', lamp: '@prop_magic_lamp_lp_v1' };

const r2 = (v) => v.map(x => +(+x).toFixed(2));
const ROOF = ROOFTOP.h + 0.06;
const PARK = [4000, -2500, 4000]; // far below the desert: who is not in a shot waits here
const D2R = Math.PI / 180;
const yawTo = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]) / D2R;

// ---- poses (same joint convention as src/mannequin.js)
const P = {
  stand: { j: { shoulder_l: [0, 0, 8], shoulder_r: [0, 0, -8] }, hipsY: 0 },
  walk: { j: { hip_l: [-25, 0, 0], knee_l: [12, 0, 0], hip_r: [20, 0, 0], knee_r: [28, 0, 0], ankle_r: [-10, 0, 0], shoulder_l: [22, 0, 6], shoulder_r: [-22, 0, -6], elbow_l: [-15, 0, 0], elbow_r: [-25, 0, 0] }, hipsY: 0 },
  walk2: { j: { hip_r: [-25, 0, 0], knee_r: [12, 0, 0], hip_l: [20, 0, 0], knee_l: [28, 0, 0], ankle_l: [-10, 0, 0], shoulder_r: [22, 0, -6], shoulder_l: [-22, 0, 6], elbow_r: [-15, 0, 0], elbow_l: [-25, 0, 0] }, hipsY: 0 },
  run: { j: { spine: [12, 0, 0], hip_l: [-62, 0, 0], knee_l: [75, 0, 0], hip_r: [30, 0, 0], knee_r: [65, 0, 0], shoulder_l: [45, 0, 8], elbow_l: [-95, 0, 0], shoulder_r: [-55, 0, -8], elbow_r: [-90, 0, 0] }, hipsY: -0.04 },
  wave: { j: { shoulder_r: [0, 0, -135], elbow_r: [0, 0, -40], shoulder_l: [0, 0, 8] }, hipsY: 0 },
  reach: { j: { spine: [10, 0, 0], shoulder_l: [-70, 0, 4], shoulder_r: [-70, 0, -4], elbow_l: [-20, 0, 0], elbow_r: [-20, 0, 0] }, hipsY: 0 },
  handOut: { j: { shoulder_r: [-65, 0, -12], elbow_r: [-15, 0, 0], shoulder_l: [0, 0, 8] }, hipsY: 0 },
  handsup: { j: { shoulder_l: [-30, 0, 120], shoulder_r: [-30, 0, -120], elbow_l: [-40, 0, 0], elbow_r: [-40, 0, 0] }, hipsY: 0 },
  armscross: { j: { shoulder_l: [-30, -10, 28], elbow_l: [-115, 0, -50], shoulder_r: [-30, 10, -28], elbow_r: [-115, 0, 50] }, hipsY: 0 },
  point: { j: { shoulder_r: [-88, 0, -5], shoulder_l: [0, 0, 8] }, hipsY: 0 },
  lookUp: { j: { head: [-28, 0, 0], neck: [-10, 0, 0], shoulder_l: [0, 0, 8], shoulder_r: [0, 0, -8] }, hipsY: 0 },
  lookLeft: { j: { head: [-15, 45, 0], neck: [0, 12, 0], shoulder_l: [0, 0, 8], shoulder_r: [0, 0, -8] }, hipsY: 0 },
  glasses: { j: { shoulder_r: [-20, 0, -40], elbow_r: [-150, 0, 0], shoulder_l: [0, 0, 8], head: [-8, 0, 0] }, hipsY: 0 },
  lampHold: { j: { shoulder_l: [-55, 0, 6], shoulder_r: [-55, 0, -6], elbow_l: [-55, 0, 0], elbow_r: [-55, 0, 0], head: [20, 0, 0] }, hipsY: 0 },
  lampRaise: { j: { shoulder_l: [-150, 0, 12], shoulder_r: [-150, 0, -12], elbow_l: [-25, 0, 0], elbow_r: [-25, 0, 0], head: [-25, 0, 0] }, hipsY: 0 },
  kneel: { j: { hip_l: [-90, 0, 0], knee_l: [90, 0, 0], hip_r: [0, 0, 0], knee_r: [90, 0, 0], ankle_r: [40, 0, 0], shoulder_l: [0, 0, 8], shoulder_r: [0, 0, -8] }, hipsY: -0.45 },
  kneelHand: { j: { hip_l: [-90, 0, 0], knee_l: [90, 0, 0], hip_r: [0, 0, 0], knee_r: [90, 0, 0], ankle_r: [40, 0, 0], shoulder_r: [-70, 0, -15], elbow_r: [-10, 0, 0], shoulder_l: [0, 0, 8] }, hipsY: -0.45 },
  kneelWide: { j: { hip_l: [-90, 0, 0], knee_l: [90, 0, 0], hip_r: [0, 0, 0], knee_r: [90, 0, 0], ankle_r: [40, 0, 0], shoulder_l: [-10, 0, 85], shoulder_r: [-10, 0, -85], head: [-12, 0, 0] }, hipsY: -0.45 },
  sitX: { j: { hip_l: [-90, 25, 35], hip_r: [-90, -25, -35], knee_l: [150, 0, 0], knee_r: [150, 0, 0], shoulder_l: [-20, 0, 10], shoulder_r: [-20, 0, -10], elbow_l: [-40, 0, 0], elbow_r: [-40, 0, 0] }, hipsY: -0.82 },
  sitLean: { j: { spine: [18, 0, 0], hip_l: [-90, 25, 35], hip_r: [-90, -25, -35], knee_l: [150, 0, 0], knee_r: [150, 0, 0], shoulder_l: [-60, 0, 10], shoulder_r: [-60, 0, -10], elbow_l: [-30, 0, 0], elbow_r: [-30, 0, 0] }, hipsY: -0.82 },
};

// ---- key helpers
const K = (t, p, yaw, pose, s = 1) => ({ t, p: r2(p), r: [0, +yaw.toFixed(1), 0], s: [s, s, s], ...(pose ? { pose: JSON.parse(JSON.stringify(pose)) } : {}) });
const parked = (pose) => [K(0, PARK, 0, pose)];
// A point on the carpet: fwd along the carpet's long side, side across it, carpet turned by cyaw.
function onCarpet(c, cyaw, fwd, side, dy = 0.03) {
  const a = cyaw * D2R;
  return [c[0] + fwd * Math.cos(a) + side * Math.sin(a), c[1] + dy, c[2] - fwd * Math.sin(a) + side * Math.cos(a)];
}

// ---- light: the sun sets in the west; the editor's azimuth is relative to the camera (0 = from camera, +90 = camera-right).
function sunAz(cam, target, sun = [-1, 0, 0]) {
  const b = [cam[0] - target[0], cam[2] - target[2]]; const n = Math.hypot(...b) || 1; b[0] /= n; b[1] /= n;
  const right = [-b[1], b[0]];
  return +(Math.atan2(sun[0] * right[0] + sun[2] * right[1], sun[0] * b[0] + sun[2] * b[1]) / D2R).toFixed(0);
}
const SUNSET = { el: 7, intensity: 2.6, color: '#ffae6e', fill: 0.5, soft: 0.35 };
const BLUE = { el: 10, intensity: 0.9, color: '#9fb4ff', fill: 0.65, soft: 0.75 };

const LOC = {
  gate: { tag: '', time: 'sunset, low sun in the west', desc: 'Low-poly walled Persian city seen from the desert at sunset: sand clay walls with crenellations, one tall open south gate with a turquoise-tiled arch, beyond it flat-roofed clay houses, minarets and the gold palace dome' },
  street: { tag: '', time: 'sunset, low sun in the west', desc: 'Low-poly main street of a Persian city at sunset: terracotta paving, two rows of sand clay houses with small domes and wind towers, the tall south gate glowing at the end of the street' },
  square: { tag: '', time: 'sunset, low sun in the west', desc: 'Low-poly great square of a Persian city at sunset: a long rectangular pool, two-storey arcades with turquoise-tiled arches on all sides, the covered bazaar entrance on the west side' },
  alley: { tag: '@loc_lp_bazar_alley_sunset_v1', time: 'sunset', desc: base.shots[2].loc.desc },
  roof: { tag: '@loc_lp_bazar_rooftop_sunset_v1', time: 'sunset, sun low behind the domes', desc: base.shots[3].loc.desc },
  aerial: { tag: '', time: 'sunset, sun low in the west', desc: 'Low-poly Persian city seen from about 30 m at sunset: the great square with its long pool and arcades, the covered bazaar roofs, flat clay rooftops with wind towers, the turquoise mosque dome and two minarets to the west' },
  garden: { tag: '@loc_lp_palace_garden_bluehour_v1', time: 'blue hour, first stars', desc: base.shots[1].loc.desc },
};

function shot(num, o) {
  const cam0 = o.cam[0];
  const s = {
    id: `VC01_SH${String(num).padStart(2, '0')}`, duration: o.dur, aspect: '16:9', resolution: '1080p', model: 'cs4', rig: o.rig, easing: 'smooth',
    panel: { genre: o.genre || 'Epic', era: '2020s', tempo: 'Single shot', body: '35mm Film', lens: 'Clean Sharp', aperture: o.aperture || 'f/4 Moderate', light: 'Custom', palette: '' },
    light: { ...(o.blue ? BLUE : SUNSET), az: sunAz(cam0.p, cam0.target) },
    camBase: { p: r2(cam0.p), target: r2(cam0.target), focal: o.focal },
    camKeys: o.cam.length > 1 ? o.cam.map(c => ({ t: c.t, p: r2(c.p), target: r2(c.target), focal: c.focal || o.focal })) : [],
    tracks: {
      [ID.lova]: o.lova, [ID.princess]: o.princess || parked(P.stand), [ID.djinn]: o.djinn || parked(P.stand),
      [ID.carpet]: o.carpet || parked(), [ID.lamp]: o.lamp || parked(),
    },
    beats: o.beats.map(([t0, t1, text]) => ({ t0, t1, text })),
    purpose: o.purpose, audio: '', locks: 'no vehicles; no modern objects, wires or signs; no other people',
    loc: { ...o.loc }, onlyPieces: o.pieces, move: o.move || 'static',
    musicVideo: true, useBlockingVideo: true, useStartFrame: true,
  };
  return s;
}

const L = T.lova, PR = T.princess;
const shots = [];

// 1 — The gate. Crane down behind Lova as he walks out of the desert into the open south gate.
shots.push(shot(1, {
  dur: 8, rig: 'crane', move: 'crane', focal: 28, loc: LOC.gate, pieces: ['persia_walls', 'persia_palace', 'persia_houses'],
  cam: [{ t: 0, p: [2.5, 24, 212], target: [0, 2, 176] }, { t: 8, p: [1.4, 1.7, 186], target: [0, 4, 160] }],
  lova: [K(0, [0, 0, 192], 180, P.walk), K(4, [0, 0, 185], 180, P.walk2), K(8, [0, 0, 178], 180, P.walk)],
  purpose: `Opening of the music video: ${L} walks alone out of the desert toward the open south gate of the walled Persian city at sunset; the crane descends behind him until the gate frames him and the gold palace dome and the minarets rise beyond the walls`,
  beats: [
    [0, 3, `${L} walks toward the gate, small puffs of sand at each step, the indigo hoodie lifting in the warm wind.`],
    [3, 6, `He keeps walking; the turquoise-tiled arch of the gate grows around him and the gold palace dome appears above the wall.`],
    [6, 8, `He slows inside the shadow of the gateway and lifts his chin toward the city.`],
  ],
}));

// 2 — The street. Low frontal pull-back: Lova's face, the gate glowing behind him.
shots.push(shot(2, {
  dur: 6, rig: 'steadicam', move: 'pull', focal: 24, genre: 'General', loc: LOC.street, pieces: ['persia_walls', 'persia_houses'],
  cam: [{ t: 0, p: [0.3, 0.75, 146.8], target: [0, 1.5, 150] }, { t: 6, p: [0.3, 0.85, 138.8], target: [0, 1.55, 142] }],
  lova: [K(0, [0, 0, 150], 180, P.walk), K(2, [0, 0, 147], 180, P.lookUp), K(4, [0, 0, 144], 180, P.lookLeft), K(6, [0, 0, 142], 180, P.glasses)],
  purpose: `${L} walks up the main street of the city at sunset, seen from a low frontal angle as the camera moves back in front of him; the glowing south gate and the clay houses with wind towers behind him`,
  beats: [
    [0, 2, `${L} walks up the main street toward the camera, the city gate glowing gold behind him.`],
    [2, 4, `He looks up at the wind towers and small domes on the clay houses, turning his head slowly to the left.`],
    [4, 6, `He pushes his red-lens sunglasses up onto his head and a half smile appears.`],
  ],
}));

// 3 — The square. Over Lova's shoulder: she appears by the long pool and calls him.
const L3 = [24, 0, 70], P3 = [16, 0, 59];
shots.push(shot(3, {
  dur: 6, rig: 'dolly', move: 'push', focal: 40, genre: 'Drama', aperture: 'f/1.4 Wide Open', loc: LOC.square, pieces: ['persia_meydan', 'persia_bazaar', 'persia_houses'],
  cam: [{ t: 0, p: [25.6, 1.74, 72.4], target: [16.5, 1.25, 59.5] }, { t: 6, p: [25.2, 1.72, 71.8], target: [15, 1.25, 58.5] }],
  lova: [K(0, L3, yawTo(L3, P3), P.stand), K(4.5, L3, yawTo(L3, P3), P.stand), K(6, [23.6, 0, 69.4], yawTo(L3, P3), P.walk)],
  princess: [K(0, P3, yawTo(P3, L3), P.stand), K(1.8, P3, yawTo(P3, L3), P.wave), K(3.6, P3, yawTo(P3, L3), P.wave), K(4.4, [15, 0, 58.6], -110, P.run), K(6, [9, 0, 56.2], -110, P.run)],
  purpose: `In the great square at sunset, over ${L}'s right shoulder: ${PR} stands by the long pool, waves him to follow and runs toward the arcades; ${L} stays dominant in the foreground`,
  beats: [
    [0, 2, `${L} stops at the edge of the great square, the long pool and the turquoise arcades ahead; ${PR} stands by the pool and turns to him.`],
    [2, 4, `${PR} lifts her hand and waves him to follow, a bright smile.`],
    [4, 6, `She turns and runs toward the arcades on frame-left, looking back once; ${L} takes his first step after her.`],
  ],
}));

// 4 — The bazaar. Leading camera walking backward: she pulls him by the hand through the sun shafts.
const B = [];
for (const t of [0, 2, 4, 6, 8]) B.push({ t, x: BAZAAR.x1 - 2 - t * 2 });
shots.push(shot(4, {
  dur: 8, rig: 'gimbal', move: 'pull', focal: 28, genre: 'General', loc: LOC.alley, pieces: ['persia_bazaar', 'persia_mosque'],
  cam: B.filter(b => b.t % 4 === 0).map(b => ({ t: b.t, p: [b.x - 4.3, 1.55, BAZAAR.z + 0.2], target: [b.x, 1.45, BAZAAR.z + 0.5] })),
  lova: B.map((b, i) => K(b.t, [b.x, 0, BAZAAR.z + 0.75], -90, i === 3 ? P.lookLeft : i % 2 ? P.walk2 : P.walk)),
  princess: B.map((b, i) => K(b.t, [b.x - 0.35, 0, BAZAAR.z - 0.8], i === 4 ? 60 : -90, i % 2 ? P.walk : P.walk2)),
  purpose: `${PR} leads ${L} by the hand through the covered bazaar at sunset, the camera moving backward in front of them; ${L} stays centred and sharp, the brass lamps, hanging kilims and sun shafts sliding past, the turquoise arch of the mosque at the far end`,
  beats: [
    [0, 3, `${PR} pulls ${L} by the hand along the covered bazaar at a brisk walk, shafts of sunset light crossing them one after another.`],
    [3, 6, `${L} turns his head to the brass lamps and the hanging kilims as they pass, still walking.`],
    [6, 8, `${PR} looks back over her shoulder at him and laughs; the turquoise arch at the end of the alley comes closer behind the camera.`],
  ],
}));

// 5 — The lamp. On the rooftop, she gives him the magic lamp; the mosque dome and the low sun behind him.
const L5 = [-84, ROOF, 38], P5 = [-82.4, ROOF, 39.6];
shots.push(shot(5, {
  dur: 8, rig: 'dolly', move: 'push', focal: 35, genre: 'Drama', loc: LOC.roof, pieces: ['persia_rooftop', 'persia_mosque'],
  cam: [{ t: 0, p: [-78, ROOF + 1.5, 36.9], target: [-83.6, ROOF + 1.35, 38.6] }, { t: 8, p: [-79.6, ROOF + 1.48, 37.2], target: [-84, ROOF + 1.35, 38.5] }],
  lova: [K(0, L5, 90, P.stand), K(2.5, L5, 90, P.stand), K(3.5, L5, 90, P.reach), K(4.5, L5, 90, P.lampHold), K(8, L5, 90, P.lampHold)],
  princess: [K(0, P5, yawTo(P5, L5), P.reach), K(3.5, P5, yawTo(P5, L5), P.reach), K(5, P5, yawTo(P5, L5), P.stand), K(8, [-82.1, ROOF, 39.9], yawTo(P5, L5), P.stand)],
  lamp: [K(0, [-82.75, ROOF + 1.08, 39.25], 0), K(3.5, [-83.1, ROOF + 1.1, 38.8], 0), K(4.5, [-83.55, ROOF + 1.12, 38.05], 0), K(8, [-83.58, ROOF + 1.18, 38.0], 0)],
  purpose: `On the rooftop terrace at sunset ${PR} gives ${L} the magic lamp; ${L} faces the camera with the turquoise mosque dome, its minarets and the low sun behind him, the lamp catching the light`,
  beats: [
    [0, 3, `${PR} holds out ${T.lamp} to ${L} with both hands; he looks at it, then at her.`],
    [3, 5, `${L} takes the lamp; its weight drops his wrists slightly.`],
    [5, 8, `He lifts it to his chest and studies the engraved arabesques, the low sun flaring along the brass; ${PR} steps back to watch.`],
  ],
}));

// 6 — The djinn. Low-angle hero shot: Lova raises the lamp, the djinn grows out of the smoke behind him.
const L6 = [-84, ROOF, 38], D6 = [-86.6, ROOF + 0.4, 39.0];
shots.push(shot(6, {
  dur: 8, rig: 'crane', move: 'crane', focal: 24, genre: 'Epic', loc: LOC.roof, pieces: ['persia_rooftop', 'persia_mosque'],
  cam: [{ t: 0, p: [-81.4, ROOF + 0.45, 38.5], target: [-84, ROOF + 1.8, 38.3] }, { t: 8, p: [-81.2, ROOF + 0.8, 38.7], target: [-85.2, ROOF + 3.3, 38.8] }],
  lova: [K(0, L6, 90, P.lampHold), K(1.2, L6, 90, P.lampRaise), K(8, L6, 90, P.lampRaise)],
  lamp: [K(0, [-83.58, ROOF + 1.18, 38], 0), K(1.2, [-83.75, ROOF + 2.12, 38], 0), K(8, [-83.75, ROOF + 2.12, 38], 0)],
  djinn: [K(0, [-83.75, ROOF + 2.1, 38], 90, P.armscross, 0.04), K(2, [-84.2, ROOF + 2.0, 38.4], 90, P.armscross, 0.08), K(6, D6, 90, P.armscross, 1.35), K(8, D6, 90, P.armscross, 1.35)],
  princess: [K(0, [-86.2, ROOF, 36.2], yawTo([-86.2, 0, 36.2], [-84, 0, 38]), P.stand), K(5, [-86.2, ROOF, 36.2], yawTo([-86.2, 0, 36.2], [-84, 0, 38]), P.stand), K(7, [-86.0, ROOF, 35.8], yawTo([-86.2, 0, 36.2], [-84, 0, 38]), P.handsup)],
  purpose: `Low-angle hero shot on the rooftop at sunset: ${L} raises the magic lamp above his head and ${T.djinn} grows out of violet smoke behind his shoulder, towering over him; ${L} stays in the centre, calm and in control`,
  beats: [
    [0, 2, `${L} raises ${T.lamp} above his head with both hands, the low sun behind him, and rubs its side once with his thumb.`],
    [2, 4, `Violet faceted smoke pours from the spout and swirls up behind his left shoulder.`],
    [4, 7, `${T.djinn} rises out of the smoke behind him and grows to full height, turquoise lines glowing, arms folding across his chest; ${L} does not turn, a slow grin.`],
    [7, 8, `${PR} on frame-right steps back with her hands raised in awe.`],
  ],
}));

// 7 — The carpet. The djinn summons the carpet; they step on and it lifts off toward the mosque and the sun.
const C7a = [-90.3, ROOF + 0.55, 38], C7b = [-90.3, ROOF + 0.55, 38], C7c = [-96, ROOF + 4.5, 36.8];
const cy7 = 180; // long side pointing west
shots.push(shot(7, {
  dur: 8, rig: 'crane', move: 'crane', focal: 28, genre: 'Epic', loc: LOC.roof, pieces: ['persia_rooftop', 'persia_mosque', 'persia_bazaar'],
  cam: [{ t: 0, p: [-78, ROOF + 1.7, 37.2], target: [-89, ROOF + 1.3, 38] }, { t: 8, p: [-88.5, ROOF + 4.4, 38.2], target: [-96, ROOF + 4.9, 36.8] }],
  carpet: [K(0, C7a, cy7), K(3.5, C7b, cy7), K(8, C7c, cy7)],
  djinn: [K(0, [-87.2, ROOF + 0.4, 41.4], -110, P.point), K(8, [-87.2, ROOF + 0.4, 41.4], -110, P.point)],
  lova: [K(0, [-86.6, ROOF, 37.7], -90, P.walk), K(1.6, onCarpet(C7a, cy7, 0.35, -0.25, 0.03 - 0.55 + 0.55), -90, P.kneel), K(2.6, onCarpet(C7a, cy7, 0.35, -0.25), -90, P.kneelHand), K(3.5, onCarpet(C7b, cy7, 0.35, -0.25), -90, P.kneel), K(8, onCarpet(C7c, cy7, 0.35, -0.25), -90, P.kneel)],
  princess: [K(0, [-86, ROOF, 39.4], -100, P.stand), K(2.4, [-88.2, ROOF, 38.8], -95, P.walk), K(3.5, onCarpet(C7b, cy7, -0.45, 0.3), -90, P.sitX), K(8, onCarpet(C7c, cy7, -0.45, 0.3), -90, P.sitX)],
  purpose: `${T.djinn} points at ${T.carpet} hovering at the edge of the rooftop; ${L} steps on first, offers his hand to ${PR}, and the carpet lifts off and glides west toward the turquoise mosque dome and the low sun`,
  beats: [
    [0, 2, `${T.djinn} points at ${T.carpet} hovering beyond the parapet; ${L} walks to it and steps on, the carpet dipping under his weight.`],
    [2, 4, `${L} kneels at the front and holds out his hand; ${PR} takes it, steps on behind him and sits.`],
    [4, 8, `The carpet rises and glides west toward the turquoise dome and the low sun, its tassels fluttering, ${L}'s hoodie blowing back.`],
  ],
}));

// 8 — The flight. Side tracking at 30 m: Lova kneels at the front and opens his arms; the sun behind them.
const C8a = [0, 30, 70], C8b = [0, 31, 35], C8c = [0, 32, 0], cy8 = 90; // flying north
const at8 = (c, fwd, side) => onCarpet(c, cy8, fwd, side);
shots.push(shot(8, {
  dur: 8, rig: 'drone', move: 'truck', focal: 35, genre: 'Epic', loc: LOC.aerial, pieces: ['persia_meydan', 'persia_mosque', 'persia_bazaar', 'persia_houses'],
  cam: [{ t: 0, p: [8.5, 32.4, 65], target: [0, 30.9, 70] }, { t: 4, p: [8.5, 33.4, 30], target: [0, 31.9, 35] }, { t: 8, p: [8.5, 34.4, -5], target: [0, 32.9, 0] }],
  carpet: [K(0, C8a, cy8), K(4, C8b, cy8), K(8, C8c, cy8)],
  lova: [K(0, at8(C8a, 0.4, 0.3), 180, P.kneel), K(3, at8([0, 30.75, 43.75], 0.4, 0.3), 180, P.kneel), K(5, at8([0, 31.25, 26.25], 0.4, 0.3), 180, P.kneelWide), K(8, at8(C8c, 0.4, 0.3), 180, P.kneelWide)],
  princess: [K(0, at8(C8a, -0.5, -0.3), 180, P.sitX), K(5.5, at8([0, 31.4, 22], -0.5, -0.3), 180, P.sitX), K(8, at8(C8c, -0.5, -0.3), 180, P.sitLean)],
  purpose: `The flying carpet crosses the city at about 30 m at sunset, filmed from a drone flying alongside: ${L} kneels at the front nearest the camera and spreads his arms into the wind, ${PR} seated behind him, the turquoise mosque dome, the minarets and the low sun behind them, the great square sliding by below`,
  beats: [
    [0, 3, `${T.carpet} flies north above the great square, ${L} kneeling at the front, hoodie snapping in the wind, ${PR} seated behind him, the turquoise mosque dome and the low sun behind them.`],
    [3, 6, `${L} slowly spreads his arms wide into the wind and tilts his head back, eyes closed behind the red lenses.`],
    [6, 8, `${PR} leans forward toward his shoulder, smiling; the arcades and the long pool slide away far below.`],
  ],
}));

// 9 — The garden at blue hour. Low over the reflecting pool; landing by the fountain; the camera pans to the palace.
const C9a = [0, 2.0, -52], C9b = [0, 0.9, -79.5], cy9 = 90;
const at9 = (c, fwd, side, dy) => onCarpet(c, cy9, fwd, side, dy);
shots.push(shot(9, {
  dur: 8, rig: 'tripod', move: 'pan', focal: 24, genre: 'Epic', blue: true, loc: LOC.garden, pieces: ['persia_garden', 'persia_palace'],
  cam: [{ t: 0, p: [4, 1.0, -71], target: [0, 1.9, -50] }, { t: 5.5, p: [4, 1.0, -71], target: [0, 1.5, -79.5] }, { t: 8, p: [4, 1.05, -71], target: [0, 6, -150] }],
  carpet: [K(0, C9a, cy9), K(5, C9b, cy9), K(8, C9b, cy9)],
  lova: [K(0, at9(C9a, 0.4, 0.25), 180, P.kneel), K(5, at9(C9b, 0.4, 0.25), 180, P.kneel), K(6.5, at9(C9b, 0.3, 0.3), 180, P.handOut), K(8, at9(C9b, 0.3, 0.3), 180, P.stand)],
  princess: [K(0, at9(C9a, -0.5, -0.3), 180, P.sitX), K(5.8, at9(C9b, -0.5, -0.3), 180, P.sitX), K(7.3, at9(C9b, -0.1, -0.35), 180, P.stand), K(8, at9(C9b, -0.1, -0.35), 180, P.stand)],
  purpose: `Final shot of the sequence, palace garden at blue hour: ${T.carpet} glides low over the long reflecting pool between the lit lanterns and settles beside the turquoise fountain; ${L} stands, helps ${PR} up, and the camera pans with them to the turquoise-and-gold iwan and the gold dome at the end of the garden`,
  beats: [
    [0, 3, `At blue hour ${T.carpet} glides low over the long reflecting pool toward the camera, its reflection racing beneath it, the twelve brass lanterns lit on both sides, ${L} kneeling at the front.`],
    [3, 5, `It slows and settles beside the octagonal turquoise fountain, the water rippling under it.`],
    [5, 8, `${L} stands up and offers his hand; ${PR} rises beside him; both turn to face the turquoise-and-gold iwan and the gold dome at the end of the garden as the first stars appear.`],
  ],
}));

const project = {
  version: 1,
  meta: {
    project: 'Persia — videoclip', scene: 'VC01',
    look: base.meta.look,
    styleLock: base.meta.styleLock,
    locationTag: '', locationDesc: base.meta.locationDesc, timeOfDay: 'sunset',
  },
  objects, shots, current: 0,
};
fs.writeFileSync(path.join(ROOT, 'projects', 'persia-clip.blocking.json'), JSON.stringify(project, null, 2));
console.log('projects/persia-clip.blocking.json:', shots.length, 'shot,', shots.reduce((a, s) => a + s.duration, 0), 's');
void MOSQUE;
