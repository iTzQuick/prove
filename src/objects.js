// Primitive and set-piece factory. Every object is a THREE.Group whose origin sits on the floor.
import * as THREE from 'three';
import { buildMannequin } from './mannequin.js';
import { buildArenaPiece, isArenaKind } from './arena.js';
import { KIT_CENTER } from './arena-map.js';
import { buildPersiaPiece, isPersiaKind } from './persia.js';
import { PERSIA_CENTER } from './persia-map.js';

// Named colours: the prompt maps a mannequin colour to its Element tag, so names must be unambiguous.
export const CHAR_COLORS = [
  { name: 'red', hex: '#e0453a' }, { name: 'blue', hex: '#3a6fe0' }, { name: 'yellow', hex: '#e8c22e' },
  { name: 'green', hex: '#3fae5a' }, { name: 'orange', hex: '#ee8a2c' }, { name: 'purple', hex: '#8a4fd8' },
  { name: 'cyan', hex: '#2fc0cf' }, { name: 'magenta', hex: '#d64598' }, { name: 'white', hex: '#eeeeee' },
  { name: 'black', hex: '#2a2a2a' },
];

export function colorName(hex) {
  const c = new THREE.Color(hex);
  let best = 'grey', bd = Infinity;
  for (const k of CHAR_COLORS) {
    const d = new THREE.Color(k.hex); const dist = (c.r - d.r) ** 2 + (c.g - d.g) ** 2 + (c.b - d.b) ** 2;
    if (dist < bd) { bd = dist; best = k.name; }
  }
  return bd < 0.08 ? best : 'grey';
}

export const CATALOG = {
  // kind, label (IT), default role, default colour, English noun for the prompt
  mannequin: { label: 'Manichino', role: 'character', color: '#e0453a', en: 'person' },
  cube: { label: 'Cubo', role: 'set', color: '#9a9a9a', en: 'box' },
  sphere: { label: 'Sfera', role: 'prop', color: '#9a9a9a', en: 'sphere' },
  cylinder: { label: 'Cilindro', role: 'set', color: '#9a9a9a', en: 'cylinder' },
  cone: { label: 'Cono', role: 'set', color: '#9a9a9a', en: 'cone' },
  plane: { label: 'Pavimento', role: 'set', color: '#7d7d7d', en: 'floor' },
  wall: { label: 'Muro', role: 'set', color: '#b9b4ab', en: 'wall' },
  doorway: { label: 'Muro con porta', role: 'set', color: '#b9b4ab', en: 'wall with a doorway' },
  window: { label: 'Muro con finestra', role: 'set', color: '#b9b4ab', en: 'wall with a window' },
  stairs: { label: 'Scale', role: 'set', color: '#a5a5a5', en: 'staircase' },
  column: { label: 'Colonna', role: 'set', color: '#b0b0b0', en: 'column' },
  table: { label: 'Tavolo', role: 'set', color: '#8b6b4a', en: 'table' },
  chair: { label: 'Sedia', role: 'set', color: '#8b6b4a', en: 'chair' },
  sofa: { label: 'Divano', role: 'set', color: '#6b6f80', en: 'sofa' },
  bed: { label: 'Letto', role: 'set', color: '#c9c3b8', en: 'bed' },
  car: { label: 'Auto', role: 'prop', color: '#4a5a70', en: 'car' },
  tree: { label: 'Albero', role: 'set', color: '#4f7a45', en: 'tree' },
  lamp: { label: 'Luce pratica', role: 'set', color: '#ffd27a', en: 'practical lamp' },
  phone: { label: 'Oggetto piccolo', role: 'prop', color: '#333333', en: 'small object' },
  bottle: { label: 'Bottiglia', role: 'prop', color: '#2f7a5a', en: 'bottle' },
  case: { label: 'Valigetta', role: 'prop', color: '#5a4030', en: 'case' },
  // Arena kit (built from the arena plan; each piece knows where it belongs: `at`).
  arena_meadow: { label: 'Prato arena', role: 'set', color: '#6fae3c', en: 'flower meadow', lock: true, arena: true },
  arena_flowers: { label: 'Fiori', role: 'set', color: '#ff4f9a', en: 'wildflower drifts', lock: true, arena: true },
  arena_ridge: { label: 'Montagna e cresta', role: 'set', color: '#b9b2a4', en: 'jagged limestone mountain ridge', arena: true },
  arena_forest: { label: 'Bosco', role: 'set', color: '#3f7a33', en: 'dense forest', arena: true },
  arena_river: { label: 'Fiume', role: 'set', color: '#3f86e0', en: 'river', arena: true },
  arena_pond: { label: 'Laghetto', role: 'set', color: '#3f86e0', en: 'pond', arena: true },
  arena_hub: { label: 'Centro (fiore di metallo)', role: 'set', color: '#d4a640', en: 'golden metal blossom sculpture on a round white dais', arena: true },
  arena_plates: { label: '24 pedane', role: 'set', color: '#b8bcc2', en: 'ring of 24 round metal launch plates', arena: true },
  arena_shield: { label: 'Scudo (bordo)', role: 'set', color: '#7fe6d0', en: 'force-field boundary', lock: true, arena: true },
  // Persia kit (low-poly city from the Higgsfield Elements; each piece knows where it belongs: `at`).
  persia_sky: { label: 'Cielo al tramonto', role: 'set', color: '#c54b8d', en: 'sunset sky', lock: true, persia: true, far: true },
  persia_desert: { label: 'Deserto e dune', role: 'set', color: '#e4c48c', en: 'desert dunes', lock: true, persia: true, far: true },
  persia_clouds: { label: 'Nuvole', role: 'set', color: '#ff8fa8', en: 'faceted sunset clouds', lock: true, persia: true, far: true },
  persia_mountains: { label: 'Montagne blu', role: 'set', color: '#3f5693', en: 'blue mountains on the horizon', lock: true, persia: true, far: true },
  persia_pyramids: { label: 'Tre piramidi', role: 'set', color: '#d9b071', en: 'three pyramids in the desert', lock: true, persia: true, far: true },
  persia_ground: { label: 'Terreno città', role: 'set', color: '#e8cfa2', en: 'city ground', lock: true, persia: true },
  persia_walls: { label: 'Mura e porta sud', role: 'set', color: '#b98f63', en: 'city walls with the main gate', persia: true },
  persia_houses: { label: 'Case della città', role: 'set', color: '#d8b88a', en: 'flat-roofed clay houses with small domes and wind towers', persia: true },
  persia_meydan: { label: 'Piazza e portici', role: 'set', color: '#d3c3a0', en: 'great square with arcades and a long pool', persia: true },
  persia_palace: { label: 'Palazzo, iwan e cupola d\'oro', role: 'set', color: '#e3ad3b', en: 'palace with a turquoise-and-gold iwan and a gold dome', persia: true },
  persia_garden: { label: 'Giardino del palazzo', role: 'set', color: '#5d8e3c', en: 'palace garden with a reflecting pool, fountain and cypresses', persia: true },
  persia_bazaar: { label: 'Bazar coperto', role: 'set', color: '#f2a01f', en: 'covered bazaar alley', persia: true },
  persia_rooftop: { label: 'Terrazza sul bazar', role: 'set', color: '#c0623a', en: 'rooftop terrace above the bazaar', persia: true },
  persia_mosque: { label: 'Moschea turchese e minareti', role: 'set', color: '#24aeb0', en: 'mosque with a turquoise dome, two minarets and a gold-domed shrine', persia: true },
  persia_carpet: { label: 'Tappeto volante', role: 'prop', color: '#2b3a8f', en: 'flying carpet', tag: '@prop_flying_carpet_lp_v1', cm: 200 },
  persia_lamp: { label: 'Lampada magica', role: 'prop', color: '#c99a3e', en: 'brass oil lamp', tag: '@prop_magic_lamp_lp_v1', cm: 30 },
};
for (const [k, v] of Object.entries(CATALOG)) {
  if (v.arena) v.at = [KIT_CENTER[k][0], 0, KIT_CENTER[k][1]];
  if (v.persia) v.at = [PERSIA_CENTER[k][0], 0, PERSIA_CENTER[k][1]];
}
// Far clip needed by the scene: the Persia sky and horizon sit kilometres away.
export function sceneFar(state) {
  return state && state.objects.some(o => !o.hidden && CATALOG[o.kind] && CATALOG[o.kind].far) ? 9500 : 500;
}

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra });
}

function box(g, mat, w, h, d, x = 0, y = h / 2, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
function cyl(g, mat, rt, rb, h, x = 0, y = h / 2, z = 0, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}

export function buildObject(kind, color) {
  if (kind === 'mannequin') return buildMannequin(color);
  if (isArenaKind(kind)) return buildArenaPiece(kind, color);
  if (isPersiaKind(kind)) return buildPersiaPiece(kind, color);
  const g = new THREE.Group();
  const mat = std(color);
  g.userData.materials = [mat];
  switch (kind) {
    case 'cube': box(g, mat, 1, 1, 1); break;
    case 'sphere': { const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 20), mat); m.position.y = 0.5; m.castShadow = m.receiveShadow = true; g.add(m); break; }
    case 'cylinder': cyl(g, mat, 0.5, 0.5, 1); break;
    case 'cone': { const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 32), mat); m.position.y = 0.5; m.castShadow = m.receiveShadow = true; g.add(m); break; }
    case 'plane': { const m = new THREE.Mesh(new THREE.BoxGeometry(10, 0.02, 10), mat); m.position.y = -0.01; m.receiveShadow = true; g.add(m); break; }
    case 'wall': box(g, mat, 4, 2.8, 0.15); break;
    case 'doorway':
      box(g, mat, 1.5, 2.8, 0.15, -1.25); box(g, mat, 1.5, 2.8, 0.15, 1.25); box(g, mat, 1.0, 0.7, 0.15, 0, 2.45); break;
    case 'window':
      box(g, mat, 1.4, 2.8, 0.15, -1.3); box(g, mat, 1.4, 2.8, 0.15, 1.3);
      box(g, mat, 1.2, 0.9, 0.15, 0, 0.45); box(g, mat, 1.2, 0.6, 0.15, 0, 2.5); break;
    case 'stairs':
      for (let i = 0; i < 8; i++) box(g, mat, 1.2, 0.18 * (i + 1), 0.28, 0, 0.09 * (i + 1), -i * 0.28);
      break;
    case 'column': cyl(g, mat, 0.22, 0.25, 3); break;
    case 'table':
      box(g, mat, 1.6, 0.05, 0.9, 0, 0.75);
      for (const [x, z] of [[-0.72, -0.37], [0.72, -0.37], [-0.72, 0.37], [0.72, 0.37]]) box(g, mat, 0.06, 0.73, 0.06, x, 0.365, z);
      break;
    case 'chair':
      box(g, mat, 0.45, 0.05, 0.45, 0, 0.45); box(g, mat, 0.45, 0.5, 0.05, 0, 0.72, -0.2);
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(g, mat, 0.04, 0.43, 0.04, x, 0.215, z);
      break;
    case 'sofa':
      box(g, mat, 2.0, 0.42, 0.9, 0, 0.21); box(g, mat, 2.0, 0.45, 0.2, 0, 0.62, -0.35);
      box(g, mat, 0.2, 0.25, 0.9, -0.9, 0.54); box(g, mat, 0.2, 0.25, 0.9, 0.9, 0.54); break;
    case 'bed':
      box(g, mat, 1.6, 0.5, 2.0, 0, 0.25); box(g, mat, 1.6, 0.6, 0.08, 0, 0.8, -1.0); break;
    case 'car': {
      box(g, mat, 1.8, 0.65, 4.4, 0, 0.6);
      box(g, mat, 1.6, 0.5, 2.2, 0, 1.15, -0.2);
      const wm = std('#1c1c1c');
      for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 20), wm);
        w.rotation.z = Math.PI / 2; w.position.set(x, 0.33, z); w.castShadow = true; g.add(w);
      }
      break;
    }
    case 'tree': {
      cyl(g, std('#6b4b32'), 0.12, 0.18, 2.2);
      const c = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), mat); c.position.y = 3; c.castShadow = true; g.add(c);
      break;
    }
    case 'lamp': {
      cyl(g, std('#555555'), 0.02, 0.02, 1.5);
      cyl(g, std('#444444'), 0.15, 0.15, 0.03);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.25, 20, 1, true), std(color, { emissive: color, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
      shade.position.y = 1.55; g.add(shade);
      const light = new THREE.PointLight(color, 4, 8, 1.6);
      light.position.y = 1.5; light.castShadow = false; g.add(light);
      g.userData.light = light;
      g.userData.materials = [shade.material];
      break;
    }
    case 'phone': box(g, mat, 0.075, 0.15, 0.01, 0, 0.075); break;
    case 'bottle': cyl(g, mat, 0.035, 0.04, 0.3, 0, 0.15, 0, 16); break;
    case 'case': box(g, mat, 0.45, 0.33, 0.1, 0, 0.165); break;
    default: box(g, mat, 1, 1, 1);
  }
  return g;
}

export function setObjectColor(group, color) {
  for (const m of group.userData.materials || []) {
    m.color.set(color);
    if (m.emissive && m.emissiveIntensity > 0) m.emissive.set(color);
  }
  if (group.userData.light) group.userData.light.color.set(color);
}
