// Persia kit: low-poly set pieces of the whole city, built from the plan in persia-map.js.
// Every piece is built in world coordinates and shifted so its origin sits at PERSIA_CENTER[kind].
import * as THREE from 'three';
import {
  rng, CITY, GARDEN, POOL, FOUNTAIN, LANTERN_Z, PALACE, MEYDAN, BAZAAR, ROOFTOP, MOSQUE, SHRINE, MOSQUE2, ROADS,
  PYRAMIDS, MOUNTAINS, SUN, SKY_CAM, RESERVED, inRect, terrainH, polar, PERSIA_CENTER,
} from './persia-map.js';

const C = {
  clay: '#d8b88a', clayDark: '#b98f63', clayLight: '#e8cfa2', sand: '#e4c48c', stone: '#d3c3a0',
  turq: '#24aeb0', turqDark: '#13606e', gold: '#e3ad3b', terracotta: '#c0623a', indigo: '#2b3a8f',
  saffron: '#f2a01f', wood: '#7a5233', brass: '#c99a3e', rose: '#c8203a', cypress: '#2d5a34',
  water: '#3b8fd8', lawn: '#5d8e3c', purple: '#6b2f7a', niche: '#6b4a32',
};
const D2R = Math.PI / 180;
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...extra });
const metal = (color) => mat(color, { metalness: 0.3, roughness: 0.42 }); // no env map: keep metals bright
const glow = (color = '#ffbe55', k = 1.6) => mat(color, { emissive: color, emissiveIntensity: k });

function add(out, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; out.push(m); return m;
}
// Axis-aligned box from world bounds.
function boxW(out, material, x0, x1, y0, y1, z0, z1) {
  return add(out, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
function cylW(out, material, r0, r1, h, x, y, z, seg = 10) {
  return add(out, new THREE.CylinderGeometry(r0, r1, h, seg), material, x, y + h / 2, z);
}

// Pointed (Persian) arch outline, w wide and h tall, from y0.
function archPath(p, w, h, y0 = 0) {
  const s = Math.max(y0 + 0.1, h - w * 0.55);
  p.moveTo(-w / 2, y0); p.lineTo(w / 2, y0); p.lineTo(w / 2, s);
  p.quadraticCurveTo(w / 2, h - w * 0.1, 0, h); p.quadraticCurveTo(-w / 2, h - w * 0.1, -w / 2, s); p.lineTo(-w / 2, y0);
  return p;
}
// Arch-shaped flat niche (decoration), facing +z.
function nicheGeo(w, h) { return new THREE.ShapeGeometry(archPath(new THREE.Shape(), w, h), 3); }

// Pishtaq: monumental portal with a pointed arch, front face at z = 0 facing +z, depth going to -d.
function pishtaq({ w, h, d, aw, ah, color = C.turq, trim = C.gold, through = false, back = C.turqDark, door = false }) {
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h); sh.lineTo(-w / 2, h); sh.lineTo(-w / 2, 0);
  sh.holes.push(archPath(new THREE.Path(), aw, ah, 0.02));
  const body = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 4 });
  body.translate(0, 0, -d);
  const out = [];
  add(out, body, mat(color));
  // Gold arch frame and top band.
  const fr = archPath(new THREE.Shape(), aw + 1.1, ah + 0.6, 0.02);
  fr.holes.push(archPath(new THREE.Path(), aw, ah, 0.03));
  add(out, new THREE.ExtrudeGeometry(fr, { depth: 0.18, bevelEnabled: false, curveSegments: 4 }), metal(trim), 0, 0, 0);
  boxW(out, metal(trim), -w / 2, w / 2, h - 0.9, h - 0.3, 0, 0.2);
  boxW(out, metal(trim), -w / 2, -w / 2 + 0.5, 0, h - 0.3, 0, 0.2);
  boxW(out, metal(trim), w / 2 - 0.5, w / 2, 0, h - 0.3, 0, 0.2);
  if (!through) boxW(out, mat(back), -aw / 2, aw / 2, 0, ah, -d + 0.05, -d + 0.35);
  if (door) boxW(out, mat(C.wood), -aw * 0.3, aw * 0.3, 0, Math.min(ah * 0.55, 4.2), -d + 0.35, -d + 0.5);
  for (const m of out) g.add(m);
  return g;
}

// Persian dome profile (slightly bulbous, pointed top), radius r, on a drum.
function domeGeo(r, seg = 12) {
  const pts = [[1, 0], [1.05, 0.2], [1.02, 0.48], [0.88, 0.8], [0.64, 1.06], [0.36, 1.26], [0.12, 1.4], [0, 1.47]]
    .map(([x, y]) => new THREE.Vector2(x * r, y * r));
  return new THREE.LatheGeometry(pts, seg);
}
function domeOnDrum(out, x, y, z, r, domeColor, drumColor, seg = 12, domeMetal = false) {
  const dh = r * 0.55;
  cylW(out, mat(drumColor), r * 1.02, r * 1.06, dh, x, y, z, seg);
  cylW(out, metal(C.gold), r * 1.07, r * 1.07, r * 0.08, x, y + dh * 0.82, z, seg);
  add(out, domeGeo(r, seg), domeMetal ? metal(domeColor) : mat(domeColor), x, y + dh, z);
  cylW(out, metal(C.gold), r * 0.04, r * 0.06, r * 0.45, x, y + dh + r * 1.42, z, 6);
  add(out, new THREE.IcosahedronGeometry(r * 0.07, 0), metal(C.gold), x, y + dh + r * 1.9, z);
  return y + dh + r * 1.9;
}
function minaret(out, x, z, h, y0 = 0) {
  const tq = mat(C.turq), gd = metal(C.gold);
  cylW(out, mat(C.clayLight), 2.1, 2.3, h * 0.1, x, y0, z, 8);
  cylW(out, tq, 1.35, 1.6, h * 0.7, x, y0 + h * 0.1, z, 8);
  for (const k of [0.32, 0.56]) cylW(out, gd, 1.52, 1.52, 0.5, x, y0 + h * k, z, 8);
  add(out, new THREE.ConeGeometry(2.3, 1.4, 8).rotateX(Math.PI), gd, x, y0 + h * 0.8 - 0.7, z);
  cylW(out, gd, 2.3, 2.3, 0.6, x, y0 + h * 0.8, z, 8);
  cylW(out, tq, 1.0, 1.1, h * 0.1, x, y0 + h * 0.8 + 0.6, z, 8);
  add(out, domeGeo(1.15, 8), gd, x, y0 + h * 0.9 + 0.6, z);
}
function instanced(geo, material, list, opts = {}) {
  const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  list.forEach((it, i) => {
    q.setFromEuler(e.set(it.rx || 0, it.ry || 0, it.rz || 0));
    m4.compose(new THREE.Vector3(it.x, it.y || 0, it.z), q, new THREE.Vector3(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1));
    im.setMatrixAt(i, m4);
    if (it.c) im.setColorAt(i, col.set(it.c));
  });
  im.count = list.length;
  im.castShadow = opts.shadow !== false; im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}
// Arched niches along a facade line from (x0,z0) to (x1,z1), facing angle ry, two storeys.
function nicheRow(list, x0, z0, x1, z1, ry, levels = [[0.4, 3.8], [4.8, 3.2]], step = 5) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.floor(L / step));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    for (const [y, h] of levels) list.push({ x, y, z, ry, sx: 1, sy: h / 3.8 });
  }
}
const nicheMesh = (list) => instanced(nicheGeo(2.6, 3.8), mat(C.niche, { side: THREE.DoubleSide }), list, { shadow: false });

// ------------------------------------------------------------------ landscape
function ground() {
  const out = [];
  const m = add(out, new THREE.PlaneGeometry(CITY.x1 - CITY.x0 + 80, CITY.z1 - CITY.z0 + 80).rotateX(-Math.PI / 2), mat(C.clayLight, { flatShading: false }),
    (CITY.x0 + CITY.x1) / 2, 0, (CITY.z0 + CITY.z1) / 2);
  m.castShadow = false;
  for (const r of ROADS) { const s = boxW(out, mat('#c9ab7c'), r.x0, r.x1, 0, 0.03, r.z0, r.z1); s.castShadow = false; }
  return out;
}

function desert() {
  const N = 150, size = 7000;
  let g = new THREE.PlaneGeometry(size, size, N, N).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainH(p.getX(i), p.getZ(i)));
  g = g.toNonIndexed(); g.computeVertexNormals();
  const q = g.attributes.position, colors = [], col = new THREE.Color(), hi = new THREE.Color('#ecc98c'), lo = new THREE.Color('#c48e55');
  for (let k = 0; k < q.count; k += 3) {
    const y = (q.getY(k) + q.getY(k + 1) + q.getY(k + 2)) / 3;
    col.copy(lo).lerp(hi, Math.min(1, 0.45 + y / 30));
    for (let j = 0; j < 3; j++) colors.push(col.r, col.g, col.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(g, mat('#ffffff', { vertexColors: true }));
  m.receiveShadow = true; m.position.y = -0.02;
  return [m];
}

function sky() {
  const g = new THREE.SphereGeometry(4300, 40, 20);
  const p = g.attributes.position, colors = [], col = new THREE.Color(), v = new THREE.Vector3();
  const west = new THREE.Vector3(-1, 0, 0);
  const sunset = new THREE.Color('#ff8a3a'), dusk = new THREE.Color('#3b2f78'), mid = new THREE.Color('#c54b8d'), top = new THREE.Color('#2e2466'), below = new THREE.Color('#8a5a4a');
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const e = Math.asin(v.y), w = (v.clone().setY(0).normalize().dot(west) + 1) / 2;
    if (e < 0) { col.copy(below); } else {
      const horizon = dusk.clone().lerp(sunset, Math.pow(w, 1.6));
      const t = Math.min(1, e / (Math.PI / 2));
      col.copy(horizon).lerp(mid, Math.min(1, t * 3.2) * (0.35 + 0.65 * w)).lerp(top, Math.pow(t, 0.7));
    }
    colors.push(col.r, col.g, col.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false }));
  dome.renderOrder = -10; dome.frustumCulled = false;
  const [sx, sz] = polar(SUN.az, 4100 * Math.cos(SUN.el * D2R));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(150, 20), new THREE.MeshBasicMaterial({ color: '#ffe2a0', toneMapped: false, fog: false }));
  sun.position.set(sx, 4100 * Math.sin(SUN.el * D2R), sz); sun.lookAt(0, 0, 0); sun.renderOrder = -9;
  const halo = new THREE.Mesh(new THREE.CircleGeometry(420, 24), new THREE.MeshBasicMaterial({ color: '#ffb05a', transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
  halo.position.copy(sun.position).multiplyScalar(1.03); halo.lookAt(0, 0, 0); halo.renderOrder = -9;
  return [dome, halo, sun];
}

function clouds() {
  const r = rng(41), list = [];
  const [kx, , kz] = SKY_CAM.p, [tx, , tz] = SKY_CAM.target;
  const clearOfView = (x, z) => { // distance from the aerial camera's line of sight over the city
    const dx = tx - kx, dz = tz - kz, L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - kx) * dx + (z - kz) * dz) / L));
    return Math.hypot(x - (kx + dx * t), z - (kz + dz * t)) > 260 && Math.hypot(x - kx, z - kz) > 300;
  };
  for (let c = 0, made = 0; c < 400 && made < 60; c++) {
    const ang = r() * 360, d = 420 + r() * 1700;
    const [cx, cz] = polar(ang, d), cy = 150 + r() * 70;
    if (!clearOfView(cx, cz)) continue;
    made++;
    const w = (ang > 200 && ang < 340) ? 1 : 0; // west half catches the sunset
    for (let k = 0; k < 5; k++) {
      const s = 14 + r() * 26;
      list.push({ x: cx + (r() - 0.5) * 120, y: cy + (r() - 0.5) * 16, z: cz + (r() - 0.5) * 80, sx: s * (1.3 + r()), sy: s * 0.45, sz: s, ry: r() * 6,
        c: w ? ['#ff8fa8', '#ffa35c', '#e86aa6'][Math.floor(r() * 3)] : ['#9a6bc8', '#c873b0', '#7b5cb8'][Math.floor(r() * 3)] });
    }
  }
  const m = instanced(new THREE.IcosahedronGeometry(1, 0), mat('#ffffff', { emissive: '#3a1640', emissiveIntensity: 0.6 }), list, { shadow: false });
  m.receiveShadow = false;
  return [m];
}

function mountains() {
  const [cx, cz] = PERSIA_CENTER.persia_mountains;
  const NX = 110, NZ = 12, r = rng(17);
  const verts = [];
  for (let j = 0; j <= NZ; j++) {
    const t = j / NZ;
    for (let i = 0; i <= NX; i++) {
      const a = MOUNTAINS.a0 + (MOUNTAINS.a1 - MOUNTAINS.a0) * (i / NX);
      const peak = 170 + 130 * Math.abs(Math.sin(a * 0.11)) + 100 * Math.abs(Math.sin(a * 0.37 + 1)) + 50 * r();
      const prof = t < 0.55 ? Math.pow(t / 0.55, 1.3) : 1 - ((t - 0.55) / 0.45) * 0.6;
      const edge = (i === 0 || i === NX) ? 0.05 : 1;
      const [x, z] = polar(a, MOUNTAINS.r0 + (MOUNTAINS.r1 - MOUNTAINS.r0) * t + (r() - 0.5) * 60);
      verts.push(x - cx, Math.max(0, peak * prof * edge * (0.85 + r() * 0.3)), z - cz);
    }
  }
  const idx = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx);
  g = g.toNonIndexed(); g.computeVertexNormals();
  const p = g.attributes.position, colors = [], col = new THREE.Color(), base = new THREE.Color('#3f5693'), peakC = new THREE.Color('#b4c2ee');
  for (let k = 0; k < p.count; k += 3) {
    const y = (p.getY(k) + p.getY(k + 1) + p.getY(k + 2)) / 3;
    col.copy(base).lerp(peakC, Math.min(1, y / 520)).multiplyScalar(0.9 + r() * 0.15);
    for (let q = 0; q < 3; q++) colors.push(col.r, col.g, col.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(g, mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide }));
  m.position.set(cx, 0, cz); m.receiveShadow = true;
  return [m];
}

function pyramids() {
  const out = [];
  for (const [x, z, hb, h] of PYRAMIDS) {
    const g = new THREE.ConeGeometry(hb * Math.SQRT2, h, 4).rotateY(Math.PI / 4);
    add(out, g, mat('#d9b071'), x, terrainH(x, z) - 4 + h / 2, z);
  }
  return out;
}

// ------------------------------------------------------------------ city
function walls() {
  const out = [], wm = mat(C.clayDark), H = CITY.wallH, T = 3;
  const { x0, x1, z0, z1 } = CITY, gate = 11;
  boxW(out, wm, x0, x1, 0, H, z0 - T, z0);
  boxW(out, wm, x0 - T, x0, 0, H, z0 - T, z1 + T);
  boxW(out, wm, x1, x1 + T, 0, H, z0 - T, z1 + T);
  boxW(out, wm, x0, -gate, 0, H, z1, z1 + T);
  boxW(out, wm, gate, x1, 0, H, z1, z1 + T);
  const merl = [], towers = [];
  const edge = (ax, az, bx, bz, ox, oz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 2.6);
    for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; if (Math.abs(x) < gate + 2 && z > z1 - 1) continue; merl.push({ x: x + ox, y: H + 0.6, z: z + oz }); }
    const nt = Math.max(1, Math.round(L / 46));
    for (let i = 0; i <= nt; i++) { const x = ax + (bx - ax) * i / nt, z = az + (bz - az) * i / nt; if (Math.abs(x) < gate + 10 && z > z1 - 1) continue; towers.push([x + ox * 0.5, z + oz * 0.5]); }
  };
  edge(x0, z0, x1, z0, 0, -T + 0.6); edge(x0, z1, x1, z1, 0, T - 0.6);
  edge(x0, z0, x0, z1, -T + 0.6, 0); edge(x1, z0, x1, z1, T - 0.6, 0);
  out.push(instanced(new THREE.BoxGeometry(1.3, 1.2, 1.3), wm, merl));
  const seen = new Set();
  for (const [x, z] of towers) { const k = `${Math.round(x)}_${Math.round(z)}`; if (seen.has(k)) continue; seen.add(k); cylW(out, mat(C.clay), 4.2, 4.6, H + 3, x, 0, z, 10); cylW(out, mat(C.clayDark), 4.6, 4.6, 0.8, x, H + 3, z, 10); }
  // South gate: portal facing south with two round gate towers.
  const gp = pishtaq({ w: 2 * gate + 2, h: 17, d: T + 4, aw: 7, ah: 11, color: C.clay, trim: C.turq, through: true });
  gp.position.set(0, 0, z1 + T + 1); out.push(gp);
  for (const s of [-1, 1]) { cylW(out, mat(C.clay), 6, 6.6, 19, s * (gate + 5), 0, z1 + 1, 12); cylW(out, mat(C.turq), 6.7, 6.7, 1, s * (gate + 5), 15, z1 + 1, 12); }
  return out;
}

function houses() {
  const r = rng(53), out = [];
  const boxes = [], domes = [], badgirs = [], courts = [], crowns = [], trunks = [];
  const clays = ['#d8b88a', '#cfae7e', '#e2c597', '#c9a172', '#dcbb8e', '#bf9a6c'];
  const step = 13;
  for (let x = CITY.x0 + 9; x < CITY.x1 - 6; x += step) {
    for (let z = CITY.z0 + 9; z < CITY.z1 - 6; z += step) {
      const px = x + (r() - 0.5) * 3, pz = z + (r() - 0.5) * 3;
      const w = 7 + r() * 4.5, d = 7 + r() * 4.5, h = 3.6 + r() * 4.6 + (r() < 0.1 ? 3 : 0);
      if (RESERVED.some(R => inRect(px, pz, R, Math.max(w, d) / 2))) continue;
      if (r() < 0.06) { courts.push([px, pz]); continue; } // small courtyard with a palm instead
      boxes.push({ x: px, y: h / 2, z: pz, sx: w, sy: h, sz: d, c: clays[Math.floor(r() * clays.length)] });
      if (r() < 0.16) { const dr = Math.min(w, d) * 0.28; domes.push({ x: px, y: h, z: pz, sx: dr, sy: dr, sz: dr, c: r() < 0.22 ? C.turq : '#d9bd90' }); }
      else if (r() < 0.12) badgirs.push({ x: px + w * 0.25, y: h + 2, z: pz - d * 0.25, c: clays[Math.floor(r() * clays.length)] });
    }
  }
  out.push(instanced(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff'), boxes));
  out.push(instanced(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffffff'), domes));
  out.push(instanced(new THREE.BoxGeometry(1.8, 4, 1.8), mat('#ffffff'), badgirs));
  for (const [x, z] of courts) for (let k = 0; k < 2; k++) {
    const px = x + (r() - 0.5) * 5, pz = z + (r() - 0.5) * 5, h = 7 + r() * 4;
    crowns.push({ x: px, y: h, z: pz, ry: r() * 6 }); trunks.push({ x: px, y: h / 2, z: pz, sy: h });
  }
  out.push(instanced(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), mat('#8a6a45'), trunks));
  out.push(instanced(new THREE.ConeGeometry(2.6, 1.6, 7).rotateX(Math.PI), mat('#4f7d36'), crowns));
  // Second mosque in the east quarter: turquoise dome and one minaret.
  const { x: mx, z: mz } = MOSQUE2;
  boxW(out, mat(C.clayLight), mx - 13, mx + 13, 0, 9, mz - 13, mz + 13);
  boxW(out, mat(C.turq), mx - 13.2, mx + 13.2, 8, 8.8, mz - 13.2, mz + 13.2);
  domeOnDrum(out, mx, 9, mz, 8, C.turq, C.turqDark, 12);
  minaret(out, mx + 17, mz - 10, 30);
  return out;
}

function meydan() {
  const out = [], { x0, x1, z0, z1 } = MEYDAN;
  const pav = boxW(out, mat(C.stone), x0, x1, 0, 0.06, z0, z1); pav.castShadow = false;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  boxW(out, mat(C.turq), cx - 32, cx + 32, 0, 0.45, cz - 5, cz + 5);
  boxW(out, mat(C.water, { roughness: 0.15, metalness: 0.2 }), cx - 31.4, cx + 31.4, 0, 0.5, cz - 4.4, cz + 4.4);
  // Rows of plane trees along the square.
  const trees = [];
  for (let x = x0 + 6; x <= x1 - 6; x += 8) for (const z of [z0 + 6, z1 - 6]) trees.push({ x, y: 4.6, z, sx: 2.2, sy: 2.4, sz: 2.2 });
  out.push(instanced(new THREE.IcosahedronGeometry(1, 0), mat('#4c7a34'), trees));
  out.push(instanced(new THREE.CylinderGeometry(0.2, 0.28, 3.4, 6), mat('#6b4b32'), trees.map(t => ({ x: t.x, y: 1.7, z: t.z }))));
  // Two-storey arcades around the square, open where the streets, bazaar and palace gateway arrive.
  const A = mat(C.clay), H = 9, D = 8, niches = [];
  const bz0 = BAZAAR.z - BAZAAR.w / 2 - BAZAAR.shop, bz1 = BAZAAR.z + BAZAAR.w / 2 + BAZAAR.shop;
  boxW(out, A, x1, x1 + D, 0, H, z0 - D, 20); boxW(out, A, x1, x1 + D, 0, H, 28, z1 + D);
  nicheRow(niches, x1 - 0.02, z0, x1 - 0.02, 20, -Math.PI / 2); nicheRow(niches, x1 - 0.02, 28, x1 - 0.02, z1, -Math.PI / 2);
  boxW(out, A, x0 - D, x0, 0, H, z0 - D, bz0); boxW(out, A, x0 - D, x0, 0, H, bz1, z1 + D);
  nicheRow(niches, x0 + 0.02, z0, x0 + 0.02, bz0 - 4, Math.PI / 2); nicheRow(niches, x0 + 0.02, bz1 + 4, x0 + 0.02, z1, Math.PI / 2);
  boxW(out, A, x0, -8, 0, H, z1, z1 + D); boxW(out, A, 8, x1, 0, H, z1, z1 + D);
  nicheRow(niches, x0, z1 - 0.02, -8, z1 - 0.02, Math.PI); nicheRow(niches, 8, z1 - 0.02, x1, z1 - 0.02, Math.PI);
  boxW(out, A, x0, GARDEN.x0, 0, H, z0 - D, z0); boxW(out, A, GARDEN.x1, x1, 0, H, z0 - D, z0);
  nicheRow(niches, x0, z0 + 0.02, GARDEN.x0, z0 + 0.02, 0); nicheRow(niches, GARDEN.x1, z0 + 0.02, x1, z0 + 0.02, 0);
  out.push(nicheMesh(niches));
  // Bazaar entrance portal on the west side of the square, facing east.
  const bp = pishtaq({ w: 12, h: 12, d: 2.5, aw: BAZAAR.w + 0.6, ah: 6.8, color: C.turq, through: true });
  bp.rotation.y = Math.PI / 2; bp.position.set(x0 + 0.3, 0, BAZAAR.z); out.push(bp);
  return out;
}

function palace() {
  const out = [], { x0, x1, z0, z1, h, domeZ, domeR } = PALACE;
  boxW(out, mat(C.clayLight), x0, x1, 0, h, z0, z1);
  boxW(out, mat(C.turq), x0 - 0.2, x1 + 0.2, h - 1.4, h - 0.5, z0 - 0.2, z1 + 0.2);
  boxW(out, metal(C.gold), x0 - 0.3, x1 + 0.3, h - 0.5, h - 0.2, z0 - 0.3, z1 + 0.3);
  const niches = [];
  nicheRow(niches, x0, z1 + 0.03, -13, z1 + 0.03, 0, [[0.5, 4], [6, 3.6]]);
  nicheRow(niches, 13, z1 + 0.03, x1, z1 + 0.03, 0, [[0.5, 4], [6, 3.6]]);
  out.push(nicheMesh(niches));
  // Iwan: the big turquoise-and-gold portal facing the garden.
  const iw = pishtaq({ w: 24, h: 25, d: 4, aw: 12, ah: 18, color: C.turq, trim: C.gold, back: '#1f4f7a', door: true });
  iw.position.set(0, 0, z1 + 4); out.push(iw);
  for (const s of [-1, 1]) minaret(out, s * 10.5, z1 + 1.5, 13, 25);
  // The gold dome sits on a tall square base so it rises well above the iwan seen from the garden.
  boxW(out, mat(C.clayLight), -domeR - 1.5, domeR + 1.5, h, h + 9, domeZ - domeR - 1.5, domeZ + domeR + 1.5);
  boxW(out, mat(C.turq), -domeR - 1.6, domeR + 1.6, h + 8, h + 8.8, domeZ - domeR - 1.6, domeZ + domeR + 1.6);
  domeOnDrum(out, 0, h + 9, domeZ, domeR, C.gold, C.turq, 14, true);
  for (const s of [-1, 1]) domeOnDrum(out, s * 31, h, -170, 4.5, C.turq, C.clayLight, 10);
  return out;
}

function garden() {
  const out = [], { x0, x1, z0, z1 } = GARDEN, hw = POOL.hw;
  const lawn = boxW(out, mat(C.lawn), x0, x1, 0, 0.05, z0, z1); lawn.castShadow = false;
  const W = mat(C.clay);
  boxW(out, W, x0 - 1.2, x0, 0, 5, z0, z1 + 1.2); boxW(out, W, x1, x1 + 1.2, 0, 5, z0, z1 + 1.2);
  boxW(out, W, x0, -7.5, 0, 5, z1, z1 + 1.2); boxW(out, W, 7.5, x1, 0, 5, z1, z1 + 1.2);
  for (const [a, b] of [[x0 - 1.2, x0], [x1, x1 + 1.2]]) { const t = boxW(out, mat(C.turq), a - 0.05, b + 0.05, 4.4, 5, z0, z1 + 1.2); t.castShadow = false; }
  // Terracotta walks along the pool and across at the fountain.
  const T = mat(C.terracotta);
  for (const s of [-1, 1]) { const w = boxW(out, T, s > 0 ? hw : -hw - 2.8, s > 0 ? hw + 2.8 : -hw, 0, 0.09, POOL.z0 - 3, z1); w.castShadow = false; }
  { const w = boxW(out, T, x0, x1, 0, 0.09, FOUNTAIN.z - 2.5, FOUNTAIN.z + 2.5); w.castShadow = false; }
  { const w = boxW(out, T, -hw - 2.8, hw + 2.8, 0, 0.09, z1 - 6, z1); w.castShadow = false; }
  // Long reflecting pool with a turquoise tile rim.
  boxW(out, mat(C.water, { roughness: 0.08, metalness: 0.3 }), -hw, hw, 0, 0.14, POOL.z0, POOL.z1);
  for (const s of [-1, 1]) boxW(out, mat(C.turq), s > 0 ? hw : -hw - 0.35, s > 0 ? hw + 0.35 : -hw, 0, 0.3, POOL.z0 - 0.35, POOL.z1 + 0.35);
  for (const z of [POOL.z0 - 0.35, POOL.z1]) boxW(out, mat(C.turq), -hw, hw, 0, 0.3, z, z + 0.35);
  // Octagonal turquoise fountain in the middle of the pool.
  const { x: fx, z: fz, r: fr } = FOUNTAIN;
  cylW(out, mat(C.turq), fr, fr + 0.15, 0.7, fx, 0, fz, 8);
  cylW(out, mat(C.water, { roughness: 0.08, metalness: 0.3 }), fr - 0.35, fr - 0.35, 0.05, fx, 0.66, fz, 8);
  cylW(out, mat(C.turq), 0.35, 0.45, 1.5, fx, 0.7, fz, 8);
  cylW(out, metal(C.gold), 1.0, 0.4, 0.3, fx, 2.2, fz, 8);
  cylW(out, mat('#bfe6ff', { transparent: true, opacity: 0.7, emissive: '#9fd6ff', emissiveIntensity: 0.4 }), 0.05, 0.12, 1.3, fx, 2.5, fz, 6);
  // Twelve brass lanterns along the pool, lit.
  for (const s of [-1, 1]) for (const z of LANTERN_Z) {
    const x = s * (hw + 0.9);
    cylW(out, metal(C.brass), 0.06, 0.08, 1.3, x, 0, z, 6);
    boxW(out, glow(), x - 0.17, x + 0.17, 1.3, 1.78, z - 0.17, z + 0.17);
    add(out, new THREE.ConeGeometry(0.3, 0.32, 6), metal(C.brass), x, 1.94, z);
  }
  // Red rose beds and two rows of cypresses.
  const beds = [], roses = [], cyps = [], r = rng(29);
  for (const s of [-1, 1]) {
    for (let z = POOL.z0; z < POOL.z1; z += 13) {
      const za = z, zb = Math.min(POOL.z1, z + 11);
      if (zb > FOUNTAIN.z - 3 && za < FOUNTAIN.z + 3) continue;
      beds.push([s > 0 ? hw + 3 : -hw - 5.2, s > 0 ? hw + 5.2 : -hw - 3, za, zb]);
    }
    for (let z = POOL.z0 + 1; z <= POOL.z1 - 1; z += 5) if (Math.abs(z - FOUNTAIN.z) > 4) cyps.push({ x: s * 8.6, z, sy: 0.9 + r() * 0.25, ry: r() * 6 });
  }
  for (const [a, b, c, d] of beds) {
    const bed = boxW(out, mat('#355e2a'), a, b, 0, 0.28, c, d); bed.castShadow = false;
    for (let k = 0; k < 26; k++) roses.push({ x: a + 0.25 + r() * (b - a - 0.5), y: 0.45, z: c + 0.3 + r() * (d - c - 0.6), sx: 0.2, sy: 0.2, sz: 0.2, c: r() < 0.85 ? C.rose : '#e04a5f' });
  }
  out.push(instanced(new THREE.IcosahedronGeometry(1, 0), mat('#ffffff'), roses, { shadow: false }));
  const cg = new THREE.ConeGeometry(1.15, 10, 7); cg.translate(0, 6, 0);
  out.push(instanced(cg, mat(C.cypress), cyps));
  out.push(instanced(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 5).translate(0, 0.6, 0), mat('#5a4330'), cyps.map(c => ({ x: c.x, z: c.z }))));
  // Orange trees in the side lawns.
  const oranges = [];
  for (const s of [-1, 1]) for (let x = 13; x <= 30; x += 6) for (let z = z0 + 6; z <= z1 - 5; z += 8) if (Math.abs(z - FOUNTAIN.z) > 4) oranges.push({ x: s * x, z, s: 0.9 + r() * 0.3 });
  out.push(instanced(new THREE.IcosahedronGeometry(1.5, 0), mat('#3f6e2c'), oranges.map(o => ({ x: o.x, y: 2.6, z: o.z, sx: o.s, sy: o.s, sz: o.s }))));
  out.push(instanced(new THREE.CylinderGeometry(0.12, 0.16, 1.6, 5), mat('#5a4330'), oranges.map(o => ({ x: o.x, y: 0.8, z: o.z }))));
  // Palace gateway: the portal between the square and the garden, facing the square.
  const gw = pishtaq({ w: 15, h: 14, d: 5, aw: 5.5, ah: 9, color: C.turq, trim: C.gold, through: true });
  gw.position.set(0, 0, z1 + 3.5); out.push(gw);
  for (const s of [-1, 1]) domeOnDrum(out, s * 6, 14, z1 + 1, 1.8, C.turq, C.clayLight, 8);
  return out;
}

function bazaar() {
  const out = [], { x0, x1, z, w, shop, h, crown } = BAZAAR;
  const za = z - w / 2, zb = z + w / 2, W = mat(C.clay), Wd = mat(C.clayDark);
  const fl = boxW(out, mat(C.stone), x0, x1, 0, 0.05, za, zb); fl.castShadow = false;
  // Shop cells on both sides: back walls, partitions every 4 m, lintels above the openings, flat roofs.
  const sx0 = x1 - 14, sx1 = x1 - 5, rx0 = x1 - 15; // brass stall (south) and rug stall (north)
  for (const sd of [-1, 1]) {
    const zi = z + sd * w / 2, zo = zi + sd * shop, lo = Math.min(zi, zo), hi = Math.max(zi, zo);
    boxW(out, W, x0, x1, 0, h, sd < 0 ? lo : hi - 0.5, sd < 0 ? lo + 0.5 : hi);
    for (let x = x0; x <= x1 + 0.01; x += 4) {
      if (sd > 0 && x > sx0 - 0.5 && x < sx1 + 0.5) continue;
      if (sd < 0 && x > rx0 - 0.5 && x < rx0 + 6.9) continue;
      boxW(out, W, x - 0.3, x + 0.3, 0, h, lo, hi);
    }
    boxW(out, W, x0, x1, 3.1, h, sd < 0 ? zi - 0.45 : zi, sd < 0 ? zi : zi + 0.45);
    boxW(out, Wd, x0, x1, h, h + 0.35, lo, hi);
  }
  // Vaulted roof in bays, with open slits between them for the sun shafts.
  const vr = w / 2 + 0.3;
  for (let x = x1; x > x0 + 0.1; x -= 4) {
    const g = new THREE.CylinderGeometry(vr, vr, 3.3, 9, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2); g.scale(1, (crown - h) / vr, 1);
    const m = add(out, g, mat(C.clayDark, { side: THREE.DoubleSide }), x - 2, h, z);
    m.castShadow = true;
  }
  // Sun shafts through the slits between the vault bays: the low western sun slants east and down.
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffcf8a', transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  for (let x = x1 - 20; x > x0 + 6; x -= 8) {
    const len = 9.5, b = new THREE.Mesh(new THREE.BoxGeometry(0.55, len, w * 0.9), beamMat);
    b.rotation.z = 0.78; b.position.set(x + Math.sin(0.78) * len / 2, crown - Math.cos(0.78) * len / 2, z);
    b.renderOrder = 5; out.push(b);
  }
  // Left (south) brass merchant stall, near the square.
  const zs = zb;
  boxW(out, mat(C.wood), sx0, sx1, 0, 0.95, zs + 0.3, zs + 1.0);
  const trays = [], pots = [];
  for (let x = sx0 + 0.6; x < sx1 - 0.4; x += 0.9) {
    if (Math.floor(x) % 2) trays.push({ x, y: 0.97, z: zs + 0.65 }); else pots.push({ x, y: 1.1, z: zs + 0.62 });
  }
  out.push(instanced(new THREE.CylinderGeometry(0.32, 0.3, 0.04, 10), metal(C.brass), trays));
  out.push(instanced(new THREE.SphereGeometry(0.14, 8, 6), metal(C.brass), pots));
  out.push(instanced(new THREE.ConeGeometry(0.035, 0.22, 5).rotateZ(-1.1), metal(C.brass), pots.map(p => ({ x: p.x + 0.16, y: p.y + 0.04, z: p.z }))));
  boxW(out, mat('#8a6440'), sx0, sx1, 1.6, 1.65, zs + 2.0, zs + 3.4); // back shelf with more brass
  out.push(instanced(new THREE.CylinderGeometry(0.22, 0.26, 0.3, 8), metal(C.brass), Array.from({ length: 8 }, (_, i) => ({ x: sx0 + 0.6 + i * 1.05, y: 1.8, z: zs + 2.7 }))));
  // Right (north) rug stall: three hanging kilims and four spice baskets.
  const zr = za;
  boxW(out, metal(C.brass), rx0, rx0 + 6.4, 2.85, 2.92, zr - 0.35, zr - 0.28);
  [['#a3262e', -0.2], [C.indigo, 2.0], [C.purple, 4.2]].forEach(([col, dx]) => {
    boxW(out, mat(col), rx0 + dx + 0.3, rx0 + dx + 1.9, 0.6, 2.85, zr - 0.36, zr - 0.3);
    boxW(out, metal(C.gold), rx0 + dx + 0.85, rx0 + dx + 1.35, 1.45, 2.0, zr - 0.29, zr - 0.27);
  });
  const spice = ['#f0a020', '#c0392b', '#e8c020', '#7a2a4a'];
  spice.forEach((col, i) => {
    const x = rx0 + 0.9 + i * 1.3, zz = zr + 0.6;
    cylW(out, mat('#b08850'), 0.38, 0.32, 0.4, x, 0, zz, 9);
    add(out, new THREE.ConeGeometry(0.36, 0.48, 9), mat(col), x, 0.64, zz);
  });
  // Saffron and indigo striped canopies over both stalls.
  for (const [cx0, cx1, zi, s] of [[sx0 - 0.5, sx1 + 0.5, zb, 1], [rx0 - 0.5, rx0 + 6.9, za, -1]]) {
    const n = 8, dx = (cx1 - cx0) / n;
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(dx, 0.04, 1.4); g.rotateX(s * 0.32);
      add(out, g, mat(i % 2 ? C.indigo : C.saffron), cx0 + dx * (i + 0.5), 2.75, zi - s * 0.45);
    }
  }
  // Hanging lamps along the alley, lit.
  const lamps = [];
  for (let x = x1 - 3; x > x0 + 2; x -= 5) lamps.push({ x, y: 3.6, z });
  for (let x = sx0 + 0.8; x < sx1; x += 2.2) lamps.push({ x, y: 2.25, z: zb - 0.8 });
  out.push(instanced(new THREE.OctahedronGeometry(0.2, 0), glow('#ffb347', 2), lamps, { shadow: false }));
  out.push(instanced(new THREE.CylinderGeometry(0.008, 0.008, 1, 3), metal(C.brass), lamps.map(l => ({ x: l.x, y: l.y + 0.7, z: l.z, sy: 1.2 })), { shadow: false }));
  // Goods in the other shops: stacked crates, sacks and rolled rugs.
  const goods = [], r = rng(61);
  for (let x = x0 + 2; x < x1 - 16; x += 4) for (const zi of [za - 1.2, zb + 1.2]) {
    if (r() < 0.25) continue;
    goods.push({ x: x + (r() - 0.5), y: 0.4, z: zi, sx: 1.2 + r(), sy: 0.8 + r() * 0.6, sz: 0.9, c: ['#8a6440', '#b07a4a', C.saffron, '#a3262e', '#6a8a3a'][Math.floor(r() * 5)] });
  }
  out.push(instanced(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff'), goods));
  return out;
}

function rooftop() {
  const out = [], { x0, x1, z0, z1, h } = ROOFTOP;
  boxW(out, mat(C.clay), x0, x1, 0, h, z0, z1);
  const tl = boxW(out, mat(C.terracotta), x0 + 0.4, x1 - 0.4, h, h + 0.06, z0 + 0.4, z1 - 0.4); tl.castShadow = false;
  const P = mat(C.sand);
  boxW(out, P, x0, x1, h, h + 1.0, z0, z0 + 0.4); boxW(out, P, x0, x1, h, h + 1.0, z1 - 0.4, z1);
  boxW(out, P, x0, x0 + 0.4, h, h + 1.0, z0, z1); boxW(out, P, x1 - 0.4, x1, h, h + 1.0, z0, z1);
  const y = h + 0.06;
  // Left (south): two striped saffron-and-indigo awnings on wooden poles.
  for (const ax of [x0 + 7, x0 + 11.5]) {
    for (const [dx, dz, ph] of [[-1.4, -1.0, 2.2], [1.4, -1.0, 2.2], [-1.4, 1.4, 2.6], [1.4, 1.4, 2.6]]) cylW(out, mat(C.wood), 0.05, 0.06, ph, ax + dx, y, z1 - 2.6 + dz, 5);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BoxGeometry(0.5, 0.04, 2.8); g.rotateX(-0.16);
      add(out, g, mat(i % 2 ? C.indigo : C.saffron), ax - 1.25 + i * 0.5, y + 2.45, z1 - 2.4);
    }
  }
  // Three brass lanterns, a wooden bench, two clay jars and a rolled purple kilim (right, north side).
  for (const [lx, lz] of [[x0 + 0.2, z1 - 0.2], [x0 + 0.2, z0 + 6], [x0 + 9, z1 - 0.2]]) {
    boxW(out, glow('#ffbd55', 1.4), lx - 0.16, lx + 0.16, h + 1.0, h + 1.45, lz - 0.16, lz + 0.16);
    add(out, new THREE.ConeGeometry(0.27, 0.28, 6), metal(C.brass), lx, h + 1.59, lz);
  }
  boxW(out, mat(C.wood), x0 + 8.4, x0 + 10.4, y + 0.4, y + 0.48, z1 - 5.4, z1 - 4.9);
  for (const dx of [8.6, 10.2]) boxW(out, mat(C.wood), x0 + dx - 0.06, x0 + dx + 0.06, y, y + 0.4, z1 - 5.35, z1 - 4.95);
  const jar = new THREE.LatheGeometry([[0, 0], [0.22, 0.02], [0.34, 0.25], [0.32, 0.5], [0.16, 0.66], [0.16, 0.74], [0.2, 0.78]].map(([a, b]) => new THREE.Vector2(a, b)), 8);
  add(out, jar, mat('#b5653c'), x0 + 3.2, y, z0 + 1.2);
  add(out, jar.clone().scale(0.8, 0.8, 0.8), mat('#c47448'), x0 + 4.1, y, z0 + 1.0);
  const kil = add(out, new THREE.CylinderGeometry(0.24, 0.24, 2.2, 8).rotateZ(Math.PI / 2), mat(C.purple), x0 + 6.2, y + 0.24, z0 + 1.0);
  kil.castShadow = true;
  return out;
}

function mosque() {
  const out = [], { portalX, z, x0, x1, z0, z1, h, domeX, domeR } = MOSQUE;
  boxW(out, mat(C.clayLight), x0, x1, 0, h, z0, z1);
  boxW(out, mat(C.turq), x0 - 0.2, x1 + 0.2, h - 1.3, h - 0.4, z0 - 0.2, z1 + 0.2);
  // Portal at the end of the bazaar alley, facing east.
  const p = pishtaq({ w: 14, h: 18, d: 3, aw: 6.4, ah: 11.5, color: C.turq, trim: C.gold, back: '#1d4e74', door: true });
  p.rotation.y = Math.PI / 2; p.position.set(portalX, 0, z); out.push(p);
  for (const s of [-1, 1]) minaret(out, portalX - 1.5, z + s * 8.6, 38);
  domeOnDrum(out, domeX, h, z, domeR, C.turq, C.turqDark, 14);
  // Shrine with the gold dome, beside the mosque.
  const S = SHRINE;
  boxW(out, mat(C.clayLight), S.x0, S.x1, 0, S.h, S.z0, S.z1);
  boxW(out, mat(C.turq), S.x0 - 0.2, S.x1 + 0.2, S.h - 1, S.h - 0.3, S.z0 - 0.2, S.z1 + 0.2);
  domeOnDrum(out, (S.x0 + S.x1) / 2, S.h, (S.z0 + S.z1) / 2, S.domeR, C.gold, C.turq, 12, true);
  return out;
}

// ------------------------------------------------------------------ props (Elements)
function carpet() {
  const out = [], y = 0.01;
  boxW(out, mat(C.indigo), -1, 1, 0, 0.02, -0.7, 0.7);
  const gd = metal(C.gold);
  for (const [a, b, c, d] of [[-1, 1, -0.7, -0.6], [-1, 1, 0.6, 0.7], [-1, -0.9, -0.7, 0.7], [0.9, 1, -0.7, 0.7]]) boxW(out, gd, a, b, 0.02, 0.026, c, d);
  add(out, new THREE.CylinderGeometry(0.38, 0.38, 0.008, 8), mat(C.terracotta), 0, 0.024, 0);
  add(out, new THREE.CylinderGeometry(0.38, 0.38, 0.008, 8).rotateY(Math.PI / 8), gd, 0, 0.022, 0);
  add(out, new THREE.CylinderGeometry(0.18, 0.18, 0.01, 8), mat(C.terracotta), 0, 0.03, 0);
  for (const [x, z] of [[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]]) add(out, new THREE.ConeGeometry(0.04, 0.14, 5).rotateZ(x < 0 ? 1.2 : -1.2), gd, x * 1.05, y, z);
  return out;
}
function magicLamp() {
  const out = [], b = metal(C.brass);
  cylW(out, b, 0.035, 0.045, 0.03, 0, 0, 0, 10);
  const body = add(out, new THREE.SphereGeometry(0.07, 10, 7), b, 0, 0.07, 0); body.scale.set(1.5, 0.6, 0.9);
  add(out, new THREE.ConeGeometry(0.018, 0.13, 6).rotateZ(-1.2), b, 0.15, 0.1, 0);
  add(out, new THREE.TorusGeometry(0.03, 0.007, 4, 10, Math.PI * 1.4), b, -0.13, 0.09, 0);
  add(out, new THREE.SphereGeometry(0.035, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), b, 0, 0.1, 0);
  add(out, new THREE.IcosahedronGeometry(0.012, 0), mat(C.turq), 0, 0.14, 0);
  return out;
}

const BUILDERS = {
  persia_ground: ground, persia_desert: desert, persia_sky: sky, persia_clouds: clouds, persia_mountains: mountains, persia_pyramids: pyramids,
  persia_walls: walls, persia_houses: houses, persia_meydan: meydan, persia_palace: palace, persia_garden: garden,
  persia_bazaar: bazaar, persia_rooftop: rooftop, persia_mosque: mosque,
};
const PROPS = { persia_carpet: carpet, persia_lamp: magicLamp };
// Pieces that only frame the world: not clickable, not part of the location pack box.
export const PERSIA_BACKDROP = ['persia_ground', 'persia_desert', 'persia_sky', 'persia_clouds', 'persia_mountains', 'persia_pyramids'];

export function buildPersiaPiece(kind) {
  const g = new THREE.Group();
  if (PROPS[kind]) { for (const m of PROPS[kind]()) g.add(m); g.userData.materials = []; return g; }
  const inner = new THREE.Group();
  const [cx, cz] = PERSIA_CENTER[kind];
  inner.position.set(-cx, 0, -cz);
  for (const m of BUILDERS[kind]()) inner.add(m);
  g.add(inner);
  g.userData.materials = [];
  g.userData.backdrop = PERSIA_BACKDROP.includes(kind);
  return g;
}
export const isPersiaKind = (k) => k in BUILDERS || k in PROPS;
