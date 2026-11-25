// Persia map → world coordinates in metres. Pure data, no imports of three: shared by the editor
// (persia.js) and by tools/make-persia.mjs, which writes the ready-made project.
// North = -Z, east = +X. The sun sets in the west (-X): every sunset shot looks west.
// Built from the low-poly Higgsfield Elements: loc_lp_persia_sky_sunset_v1 (whole city),
// loc_lp_palace_garden_bluehour_v1, loc_lp_bazar_alley_sunset_v1, loc_lp_bazar_rooftop_sunset_v1.
import { rng } from './arena-map.js';
export { rng };

export const CITY = { x0: -190, x1: 190, z0: -230, z1: 170, wallH: 10 };
// Palace garden (chahar bagh) in front of the palace iwan; the palace gateway opens on the square.
export const GARDEN = { x0: -34, x1: 34, z0: -150, z1: -24 };
export const POOL = { hw: 2, z0: -140, z1: -34 };
export const FOUNTAIN = { x: 0, z: -87, r: 3.2 };
export const LANTERN_Z = [-130, -116, -102, -72, -58, -44]; // six per side of the pool = twelve
export const PALACE = { x0: -46, x1: 46, z0: -192, z1: -150, h: 14, domeZ: -172, domeR: 10 };
export const MEYDAN = { x0: -60, x1: 60, z0: -24, z1: 74 };
// Covered bazaar alley: runs west from the square to the mosque portal.
export const BAZAAR = { x0: -112, x1: -60, z: 25, w: 4, shop: 4, h: 5, crown: 7.2 };
export const ROOFTOP = { x0: -92, x1: -70, z0: 31, z1: 45, h: 6.5 };
export const MOSQUE = { portalX: -112, z: 25, x0: -150, x1: -115, z0: 4, z1: 46, h: 12, domeX: -132, domeR: 11 };
export const SHRINE = { x0: -156, x1: -132, z0: -24, z1: 2, h: 10, domeR: 6.5 };
export const MOSQUE2 = { x: 112, z: -60 };
export const ROADS = [
  { x0: -7, x1: 7, z0: MEYDAN.z1 + 8, z1: CITY.z1 },            // main street from the south gate to the square
  { x0: CITY.x0 + 4, x1: CITY.x1 - 4, z0: 98, z1: 108 },         // east-west street
  { x0: MEYDAN.x1 + 8, x1: CITY.x1 - 4, z0: 20, z1: 28 },        // street east of the square
];
// Far landscape (seen from the aerial shot): three pyramids in the south-west desert,
// blue mountains in an arc from west-north-west to north-east.
export const PYRAMIDS = [[-1230, 860, 115, 140], [-1400, 980, 108, 134], [-1090, 1040, 55, 66]]; // x, z, half base, height
export const MOUNTAINS = { a0: 282, a1: 398, r0: 2150, r1: 3000 }; // bearings in degrees clockwise from north
export const SUN = { az: 270, el: 4 };
// Camera of the aerial shot: the clouds keep clear of its view of the city.
export const SKY_CAM = { p: [520, 240, 60], target: [-600, 0, 20] }; // the sky's sun disc: due west, just above the horizon

// Places where no ordinary house goes (rectangles x0, x1, z0, z1).
export const RESERVED = [
  [PALACE.x0 - 6, PALACE.x1 + 6, PALACE.z0 - 6, GARDEN.z1 + 2],
  [MEYDAN.x0 - 10, MEYDAN.x1 + 10, MEYDAN.z0 - 10, MEYDAN.z1 + 10],
  [SHRINE.x0 - 6, -56, SHRINE.z0 - 6, ROOFTOP.z1 + 4],
  [MOSQUE2.x - 18, MOSQUE2.x + 22, MOSQUE2.z - 18, MOSQUE2.z + 18],
  ...ROADS.map(r => [r.x0 - 1, r.x1 + 1, r.z0 - 1, r.z1 + 1]),
];
export const inRect = (x, z, [x0, x1, z0, z1], m = 0) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m;

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Desert height: flat inside and near the city, rolling faceted dunes further out.
export function terrainH(x, z) {
  const dx = Math.max(CITY.x0 - x, 0, x - CITY.x1), dz = Math.max(CITY.z0 - z, 0, z - CITY.z1);
  const f = smooth(40, 700, Math.hypot(dx, dz));
  if (f <= 0) return -0.08;
  const n = Math.abs(Math.sin(x * 0.0031 + 1.3) + Math.sin(z * 0.0042 + 0.4)) * 0.6
    + Math.abs(Math.sin((x + z) * 0.0071 + 2.0)) * 0.35 + Math.sin(x * 0.013 - z * 0.011) * 0.12;
  return -0.08 + n * (3 + 24 * f) * f;
}

// Bearing (degrees clockwise from north) and distance → world x, z.
export const polar = (deg, d) => [Math.sin(deg * Math.PI / 180) * d, -Math.cos(deg * Math.PI / 180) * d];

// Where each kit piece sits in the world (its local origin). The prompt uses this point to say
// where a piece is in frame, so it is the heart of each place.
export const PERSIA_CENTER = {
  persia_ground: [0, (CITY.z0 + CITY.z1) / 2],
  persia_desert: [0, 0],
  persia_sky: [0, 0],
  persia_clouds: [0, 0],
  persia_mountains: polar(340, 2400),
  persia_pyramids: [PYRAMIDS[0][0], PYRAMIDS[0][1]],
  persia_walls: [0, CITY.z1],
  persia_houses: [70, 90],
  persia_meydan: [0, (MEYDAN.z0 + MEYDAN.z1) / 2],
  persia_palace: [0, PALACE.domeZ],
  persia_garden: [FOUNTAIN.x, FOUNTAIN.z],
  persia_bazaar: [(BAZAAR.x0 + BAZAAR.x1) / 2, BAZAAR.z],
  persia_rooftop: [(ROOFTOP.x0 + ROOFTOP.x1) / 2, (ROOFTOP.z0 + ROOFTOP.z1) / 2],
  persia_mosque: [MOSQUE.domeX, MOSQUE.z],
};
