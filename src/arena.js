// Arena kit: big procedural set pieces built from the plan in arena-map.js.
import * as THREE from 'three';
import {
  S, wx, wz, ARENA, FOREST, RIDGE, POND, CENTRE, RIVER_WIDTH, crestHeight, ridgeShape, rng, riverWorld, distToRiver, KIT_CENTER,
} from './arena-map.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

function roundedRectShape(cx, cz) {
  const x0 = wx(ARENA.x0) - cx, x1 = wx(ARENA.x1) - cx, z0 = wz(ARENA.y0) - cz, z1 = wz(ARENA.y1) - cz, r = ARENA.r * S;
  const s = new THREE.Shape();
  s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r);
  s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1); s.lineTo(x0 + r, z1);
  s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
  return s;
}

function meadow(color) {
  const [cx, cz] = KIT_CENTER.arena_meadow;
  const g = new THREE.ShapeGeometry(roundedRectShape(cx, cz), 24);
  g.rotateX(Math.PI / 2); // shape is drawn in x/z via its y axis
  const m = new THREE.Mesh(g, std(color, { side: THREE.DoubleSide }));
  m.position.y = -0.02; m.receiveShadow = true;
  return [m];
}

function shield(color) {
  const [cx, cz] = KIT_CENTER.arena_shield;
  const pts = roundedRectShape(cx, cz).getSpacedPoints(200);
  const pos = [], h = 55;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    pos.push(a.x, 0, a.y, b.x, 0, b.y, b.x, h, b.y, a.x, 0, a.y, b.x, h, b.y, a.x, h, a.y);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
  const base = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, 0.15, p.y))),
    new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 2 }));
  base.computeLineDistances();
  return [new THREE.Mesh(g, mat), base];
}

function ridge(color) {
  const [cx, cz] = KIT_CENTER.arena_ridge;
  const NX = 90, NZ = 16, r = rng(7);
  const zF = wz(RIDGE.yFront), zB = wz(RIDGE.yBack);
  const verts = [];
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const px = RIDGE.x0 + (RIDGE.x1 - RIDGE.x0) * (i / NX);
      const t = j / NZ;
      const edge = (i === 0 || i === NX || j === 0) ? 0 : 1;
      const jitter = edge ? 1 + (r() - 0.5) * 0.22 : 1;
      const y = crestHeight(px) * ridgeShape(t) * jitter;
      verts.push(wx(px) - cx + (edge ? (r() - 0.5) * 2.5 : 0), Math.max(0, y), zF + (zB - zF) * t - cz + (edge ? (r() - 0.5) * 2.5 : 0));
    }
  }
  const idx = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    idx.push(a, b, c, b, d, c); // counter-clockwise seen from above: faces point up
  }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx);
  g = g.toNonIndexed(); g.computeVertexNormals();
  // Tone per facet: lighter limestone near the crest, green-grey slopes at the foot.
  const col = new THREE.Color(), rock = new THREE.Color(color), grass = new THREE.Color('#6f8f4a');
  const p = g.attributes.position, colors = [];
  for (let k = 0; k < p.count; k += 3) {
    const yAvg = (p.getY(k) + p.getY(k + 1) + p.getY(k + 2)) / 3;
    col.copy(grass).lerp(rock, Math.min(1, yAvg / 14)).multiplyScalar(0.92 + r() * 0.16);
    for (let q = 0; q < 3; q++) colors.push(col.r, col.g, col.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(g, std('#ffffff', { vertexColors: true, flatShading: true }));
  m.castShadow = true; m.receiveShadow = true;
  return [m];
}

function forest(color) {
  const [cx, cz] = KIT_CENTER.arena_forest;
  const r = rng(11);
  const spots = [];
  const x0 = wx(FOREST.x0) + 3, x1 = wx(FOREST.x1) - 2, z0 = wz(FOREST.y0) + 4, z1 = wz(FOREST.y1) - 3;
  for (let tries = 0; tries < 4000 && spots.length < 230; tries++) {
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
    if (distToRiver(x, z) < RIVER_WIDTH / 2 + 3) continue;
    if (spots.some(s => Math.hypot(s[0] - x, s[1] - z) < 4.2)) continue;
    spots.push([x, z, 9 + r() * 10, r() < 0.55, r()]);
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.35, 1, 6), std('#5b4330'), spots.length);
  const conGeo = new THREE.ConeGeometry(1, 1, 7); conGeo.translate(0, 0.5, 0);
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  const conifers = spots.filter(s => s[3]), broad = spots.filter(s => !s[3]);
  const conMesh = new THREE.InstancedMesh(conGeo, std(new THREE.Color(color).multiplyScalar(0.8), { flatShading: true }), conifers.length);
  const leafMesh = new THREE.InstancedMesh(leafGeo, std(color, { flatShading: true }), broad.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach(([x, z, h], i) => {
    m4.compose(new THREE.Vector3(x - cx, h * 0.2, z - cz), q, new THREE.Vector3(1, h * 0.4, 1)); trunks.setMatrixAt(i, m4);
  });
  conifers.forEach(([x, z, h, , k], i) => {
    m4.compose(new THREE.Vector3(x - cx, h * 0.22, z - cz), q.setFromEuler(e.set(0, k * 6, 0)), new THREE.Vector3(h * 0.22, h * 0.8, h * 0.22)); conMesh.setMatrixAt(i, m4);
  });
  broad.forEach(([x, z, h, , k], i) => {
    m4.compose(new THREE.Vector3(x - cx, h * 0.62, z - cz), q.setFromEuler(e.set(k, k * 5, 0)), new THREE.Vector3(h * 0.33, h * 0.38, h * 0.33)); leafMesh.setMatrixAt(i, m4);
  });
  q.identity();
  for (const im of [trunks, conMesh, leafMesh]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  // Dark forest floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 5, z1 - z0 + 7).rotateX(-Math.PI / 2), std('#3e5a2c'));
  floor.position.set((x0 + x1) / 2 - cx, 0.01, (z0 + z1) / 2 - cz); floor.receiveShadow = true;
  return [floor, trunks, conMesh, leafMesh];
}

function river(color) {
  const [cx, cz] = KIT_CENTER.arena_river;
  const curve = new THREE.CatmullRomCurve3(riverWorld().map(([x, z]) => new THREE.Vector3(x - cx, 0, z - cz)));
  const pts = curve.getSpacedPoints(160);
  const pos = [], idx = [];
  pts.forEach((p, i) => {
    const t = curve.getTangentAt(Math.min(1, i / 160)); const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
    const w = RIVER_WIDTH / 2 * (0.85 + 0.3 * (i / 160));
    pos.push(p.x + n.x * w, 0.04, p.z + n.z * w, p.x - n.x * w, 0.04, p.z - n.z * w);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, std(color, { roughness: 0.15, metalness: 0.2, side: THREE.DoubleSide })); m.receiveShadow = true;
  return [m];
}

function pond(color) {
  const g = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2); g.scale(POND.rx * S, 1, POND.ry * S);
  const m = new THREE.Mesh(g, std(color, { roughness: 0.12, metalness: 0.2 })); m.position.y = 0.05; m.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 40).rotateX(-Math.PI / 2).scale(POND.rx * S, 1, POND.ry * S), std('#8a8170'));
  rim.position.y = 0.045;
  return [m, rim];
}

const FLOWER_COLORS = ['#ff4f9a', '#ff9a1f', '#ff3b2f', '#9b6bff', '#ffd23a', '#ffffff', '#ff6fd8'];
const PATCH_COLORS = ['#ff4f9a', '#ff9a1f', '#ff3b2f', '#9b6bff', '#ff6fd8', '#f7c531'];
function flowers() {
  const r = rng(23);
  const ok = (x, z) => {
    if (x < wx(ARENA.x0) + 4 || x > wx(ARENA.x1) - 4 || z < wz(RIDGE.yFront) + 2 || z > wz(ARENA.y1) - 4) return false;
    if (x > wx(FOREST.x0) && x < wx(FOREST.x1) && z > wz(FOREST.y0) && z < wz(FOREST.y1)) return false;
    if (Math.hypot(x, z) < CENTRE.meadowR * S + 1) return false;
    if (distToRiver(x, z) < RIVER_WIDTH / 2 + 0.8) return false;
    if (((x - wx(POND.x)) / (POND.rx * S + 1)) ** 2 + ((z - wz(POND.y)) / (POND.ry * S + 1)) ** 2 < 1) return false;
    return true;
  };
  const out = [];
  // Colour drifts: big saturated patches that read from far away.
  const patchGeo = new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2);
  const patches = new THREE.InstancedMesh(patchGeo, std('#ffffff', { roughness: 1 }), 260);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  let n = 0;
  for (let t = 0; t < 5000 && n < 260; t++) {
    const x = wx(ARENA.x0) + r() * (wx(ARENA.x1) - wx(ARENA.x0)), z = wz(RIDGE.yFront) + r() * (wz(ARENA.y1) - wz(RIDGE.yFront));
    if (!ok(x, z)) continue;
    const s = 2 + r() * 6;
    m4.compose(new THREE.Vector3(x, 0.02 + n * 0.0025, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), new THREE.Vector3(s, 1, s * (0.5 + r() * 0.8)));
    patches.setMatrixAt(n, m4); patches.setColorAt(n, col.set(PATCH_COLORS[Math.floor(r() * PATCH_COLORS.length)]).multiplyScalar(0.85)); n++;
  }
  patches.count = n; patches.receiveShadow = true;
  out.push(patches);
  // Individual blooms: dense near the centre ring and along the river, sparse elsewhere.
  const bloomGeo = new THREE.IcosahedronGeometry(0.08, 0); bloomGeo.translate(0, 0.3, 0);
  const blooms = new THREE.InstancedMesh(bloomGeo, std('#ffffff', { roughness: 0.6, flatShading: true }), 4500);
  n = 0;
  for (let t = 0; t < 40000 && n < 4500; t++) {
    const ang = r() * Math.PI * 2, rad = CENTRE.meadowR * S + 1 + Math.pow(r(), 1.6) * 110;
    const near = r() < 0.6;
    const x = near ? Math.cos(ang) * rad : wx(ARENA.x0) + r() * (wx(ARENA.x1) - wx(ARENA.x0));
    const z = near ? Math.sin(ang) * rad : wz(RIDGE.yFront) + r() * (wz(ARENA.y1) - wz(RIDGE.yFront));
    if (!ok(x, z)) continue;
    const s = 0.6 + r() * 0.7;
    m4.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(s, s, s));
    blooms.setMatrixAt(n, m4); blooms.setColorAt(n, col.set(FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)])); n++;
  }
  blooms.count = n; blooms.castShadow = false;
  out.push(blooms);
  for (const im of out) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); }
  return out;
}

function hub(color) {
  const out = [];
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(CENTRE.meadowR * S, 64).rotateX(-Math.PI / 2), std('#b9d58a'));
  lawn.position.y = 0.01; lawn.receiveShadow = true; out.push(lawn);
  const daisR = CENTRE.daisR * S;
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(daisR, daisR + 0.4, 0.6, 48), std('#eeeae0'));
  dais.position.y = 0.3; dais.castShadow = dais.receiveShadow = true; out.push(dais);
  // Metal blossom: a ring of open petals around a stem, about 8 m tall.
  const gold = std(color, { metalness: 0.85, roughness: 0.28 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 4.5, 12), gold); stem.position.y = 2.85; stem.castShadow = true; out.push(stem);
  const petalGeo = new THREE.SphereGeometry(1, 16, 10); petalGeo.scale(1.1, 3.4, 0.35); petalGeo.translate(0, 3.2, 0);
  for (const [n, tilt, rad, h] of [[8, 0.55, 0.6, 4.6], [8, 0.25, 0.3, 5.0]]) {
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(petalGeo, gold);
      const a = (i / n) * Math.PI * 2 + (tilt < 0.4 ? Math.PI / n : 0);
      p.position.set(Math.cos(a) * rad, h, Math.sin(a) * rad);
      p.rotation.set(0, -a + Math.PI / 2, 0); p.rotateX(tilt);
      p.castShadow = true; out.push(p);
    }
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), std('#f3d27a', { metalness: 0.9, roughness: 0.2 })); core.position.y = 5.6; out.push(core);
  return out;
}

function plates(color) {
  const out = [];
  const geo = new THREE.CylinderGeometry(0.75, 0.8, 0.22, 24);
  const mat = std(color, { metalness: 0.7, roughness: 0.35 });
  const ringR = CENTRE.ringR * S;
  for (let i = 0; i < CENTRE.plates; i++) {
    const a = (i / CENTRE.plates) * Math.PI * 2 - Math.PI / 2;
    const m = new THREE.Mesh(geo, mat); m.position.set(Math.cos(a) * ringR, 0.11, Math.sin(a) * ringR);
    m.castShadow = m.receiveShadow = true; out.push(m);
  }
  return out;
}

const BUILDERS = { arena_meadow: meadow, arena_shield: shield, arena_ridge: ridge, arena_forest: forest, arena_river: river, arena_pond: pond, arena_flowers: flowers, arena_hub: hub, arena_plates: plates };

export function buildArenaPiece(kind, color) {
  const g = new THREE.Group();
  for (const m of BUILDERS[kind](color)) g.add(m);
  g.userData.materials = [];
  g.traverse(o => { if (o.material && !o.isInstancedMesh && !o.material.vertexColors && !o.isLine && o.material.transparent !== true) g.userData.materials.push(o.material); });
  if (kind === 'arena_hub' || kind === 'arena_flowers' || kind === 'arena_ridge') g.userData.materials = kind === 'arena_hub' ? [] : g.userData.materials;
  return g;
}
export const isArenaKind = (k) => k in BUILDERS;
