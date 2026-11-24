// Arena map → world coordinates. Pure data, no imports: shared by the editor (arena.js)
// and by tools/make-arena.mjs, which writes the ready-made project.
// Source: hand-drawn plan (1179×1254 px). North is up on the plan = -Z in the 3D world.
export const S = 0.25;            // metres per plan pixel → arena about 250 × 275 m
export const CX = 690, CY = 652;  // plan pixel of the centre (the round dais)
export const wx = (px) => (px - CX) * S;
export const wz = (py) => (py - CY) * S;

export const ARENA = { x0: 95, x1: 1085, y0: 28, y1: 1135, r: 50 };      // rounded rectangle (shield)
export const FOREST = { x0: 100, x1: 400, y0: 290, y1: 1070 };
export const RIDGE = { x0: 100, x1: 1075, yFront: 290, yBack: 28 };
// Crest line as drawn on the plan (x px, y px): lower y = higher peak.
export const CREST = [[100, 290], [240, 145], [357, 215], [502, 72], [648, 186], [793, 86], [940, 200], [1072, 145], [1075, 290]];
export const PEAK_SCALE = 0.35;   // metres of height per plan pixel of the drawn peak
export const RIVER = [[325, 290], [328, 400], [338, 520], [350, 640], [342, 700], [348, 765], [385, 835], [455, 900], [555, 950], [690, 985], [870, 993]];
export const RIVER_WIDTH = 5;
export const POND = { x: 925, y: 993, rx: 52, ry: 30 };
export const CENTRE = { meadowR: 150, ringR: 117, daisR: 38, plates: 24 };

// Height of the crest above the meadow at plan x (piecewise linear between drawn points).
export function crestHeight(px) {
  for (let i = 0; i < CREST.length - 1; i++) {
    const [ax, ay] = CREST[i], [bx, by] = CREST[i + 1];
    if (px >= ax && px <= bx) { const t = (px - ax) / Math.max(1e-6, bx - ax); return (RIDGE.yFront - (ay + (by - ay) * t)) * PEAK_SCALE; }
  }
  return 0;
}
// Cross-section of the ridge: t = 0 at the meadow edge, 1 at the back. Steep face toward the meadow.
export const CREST_T = 0.6;
export function ridgeShape(t) {
  return t < CREST_T ? Math.pow(t / CREST_T, 1.25) : 1 - ((t - CREST_T) / (1 - CREST_T)) * 0.85;
}
export function crestZ() { return wz(RIDGE.yFront + (RIDGE.yBack - RIDGE.yFront) * CREST_T); }

// Small deterministic random generator, so the forest and flowers are identical on every device.
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function riverWorld() { return RIVER.map(([x, y]) => [wx(x), wz(y)]); }

// Distance (m) from a world point to the river polyline.
export function distToRiver(x, z) {
  const pts = riverWorld();
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az; const L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

// Where each kit piece sits in the world (its local origin). Geometry is built around it.
export const KIT_CENTER = {
  arena_meadow: [wx((ARENA.x0 + ARENA.x1) / 2), wz((ARENA.y0 + ARENA.y1) / 2)],
  arena_shield: [wx((ARENA.x0 + ARENA.x1) / 2), wz((ARENA.y0 + ARENA.y1) / 2)],
  arena_ridge: [wx((RIDGE.x0 + RIDGE.x1) / 2), wz((RIDGE.yFront + RIDGE.yBack) / 2)],
  arena_forest: [wx((FOREST.x0 + FOREST.x1) / 2), wz((FOREST.y0 + FOREST.y1) / 2)],
  arena_river: [wx(597.5), wz(641.5)],
  arena_pond: [wx(POND.x), wz(POND.y)],
  arena_flowers: [0, 0],
  arena_hub: [0, 0],
  arena_plates: [0, 0],
};
