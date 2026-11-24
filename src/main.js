import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { POSES, JOINTS, JOINT_LABELS, applyPose, readPose, clonePose, setMannequinColor } from './mannequin.js';
import { CATALOG, CHAR_COLORS, buildObject, setObjectColor, colorName } from './objects.js';
import { sampleObject, sampleCam, setKey, removeKeyNear, ASPECTS, applyCamToThree } from './anim.js';
import {
  MODELS, RIGS, PANEL, LIGHT_PRESETS, refName, autoBeats, getBeats, cameraMove, buildVideoPrompt, buildKeyframePrompt,
  buildLocationPrompts, buildSheetPrompt, buildSettings, buildAssetBible, buildShotListMarkdown, hudInfo, risks, costEstimate,
  buildMcpRequests, findElement,
} from './prompt.js';
import { renderStill, download, recordBlockingVideo, locationPack, exportSize } from './export.js';
import { initPhone } from './phone.js';

const D2R = Math.PI / 180;
const $ = (s) => document.querySelector(s);
const STORE_KEY = 'blocking-studio-v1';
const LIB_KEY = 'blocking-studio-elements';

// ---------------------------------------------------------------- state
function uid() { return 'o' + Math.random().toString(36).slice(2, 9); }
const pad2 = (n) => String(n).padStart(2, '0');

function newShot(id) {
  return {
    id, duration: 8, aspect: '16:9', resolution: '1080p', model: 'cs4', rig: 'dolly', easing: 'smooth',
    panel: { genre: 'Drama', era: '2020s', tempo: 'Single shot', body: 'Modern', lens: 'Clean Sharp', aperture: 'f/4 Moderate', light: 'Window', palette: '' },
    light: { ...LIGHT_PRESETS.Window },
    camBase: { p: [0, 1.6, 6], target: [0, 1.2, 0], focal: 35 },
    camKeys: [], tracks: {}, beats: [], purpose: '', audio: '', locks: '',
    musicVideo: false, useBlockingVideo: true, useStartFrame: true,
  };
}

function newProject() {
  return {
    version: 1,
    meta: { project: 'Nuovo progetto', scene: 'SC01', look: 'realistic live action', styleLock: '', locationTag: '', locationDesc: '', timeOfDay: 'late afternoon' },
    objects: [makeRecord('plane', { name: 'Pavimento' })],
    shots: [newShot('SC01_SH01')],
    current: 0,
  };
}

function makeRecord(kind, opts = {}, existing = []) {
  const cat = CATALOG[kind];
  let color = cat.color;
  if (kind === 'mannequin') {
    const used = new Set(existing.filter(o => o.kind === 'mannequin').map(o => o.color));
    color = (CHAR_COLORS.find(c => !used.has(c.hex)) || CHAR_COLORS[0]).hex;
  }
  const n = existing.filter(o => o.kind === kind).length + 1;
  return {
    id: uid(), kind, name: opts.name || `${cat.label} ${n}`, tag: opts.tag || '', role: cat.role, color: opts.color || color,
    desc: opts.desc || '', height: kind === 'mannequin' ? (opts.height || 1.8) : undefined, hidden: false,
    base: { p: opts.p || [0, 0, 0], r: opts.r || [0, 0, 0], s: opts.s || [1, 1, 1], pose: kind === 'mannequin' ? clonePose(opts.pose || POSES.stand) : null },
  };
}

function demoProject() {
  const st = newProject();
  st.meta = {
    project: 'Demo Blocking', scene: 'SC01', look: 'realistic live action, natural skin texture, no beauty filter',
    styleLock: '', locationTag: '@loc_office_dusk_v1',
    locationDesc: 'a small architect office with concrete walls, a wooden desk, a single doorway on the back wall and a floor lamp',
    timeOfDay: 'dusk',
  };
  const objs = st.objects;
  const add = (k, o) => { const r = makeRecord(k, o, objs); objs.push(r); return r; };
  add('wall', { name: 'Muro fondo', p: [-3, 0, -3] });
  add('doorway', { name: 'Porta fondo', p: [1, 0, -3] });
  add('wall', { name: 'Muro sinistro', p: [-5, 0, 0], r: [0, 90, 0], s: [1.5, 1, 1] });
  const desk = add('table', { name: 'Desk', p: [-1.4, 0, -0.6] });
  add('chair', { name: 'Chair', p: [-1.4, 0, -1.35] });
  add('lamp', { name: 'Floor lamp', p: [-3.6, 0, -2.2] });
  const mara = add('mannequin', { name: 'Mara', tag: '@char_mara_coat_v1', desc: 'woman in her 30s, short black hair, long camel wool coat, white shirt, dark trousers, black ankle boots', p: [-1.4, 0, -1.35], pose: POSES.sit, height: 1.7 });
  const leo = add('mannequin', { name: 'Leo', tag: '@char_leo_suit_v1', desc: 'man in his 40s, grey beard, navy suit, no tie, brown leather shoes', p: [1, 0, -3.6], r: [0, 0, 0], pose: POSES.stand, height: 1.84 });
  const brief = add('case', { name: 'Briefcase', tag: '@prop_briefcase_v1', desc: 'black leather briefcase with brass clasps, 45 x 33 x 10 cm', p: [0.75, 0.55, -3.45] });
  void desk;
  const sh = st.shots[0];
  sh.purpose = 'Leo enters the office at dusk and stops in front of Mara, who is working at her desk';
  sh.camBase = { p: [2.6, 1.5, 3.2], target: [-0.4, 1.1, -1.4], focal: 32 };
  sh.camKeys = [
    { t: 0, p: [2.6, 1.5, 3.2], target: [-0.4, 1.1, -1.4], focal: 32 },
    { t: 8, p: [1.4, 1.45, 1.7], target: [-0.6, 1.15, -1.2], focal: 32 },
  ];
  const walk = clonePose(POSES.walk), stand = clonePose(POSES.stand);
  sh.tracks[leo.id] = [
    { t: 0, p: [1, 0, -3.6], r: [0, 0, 0], s: [1, 1, 1], pose: stand },
    { t: 1.5, p: [0.9, 0, -2.6], r: [0, -20, 0], s: [1, 1, 1], pose: walk },
    { t: 4.5, p: [-0.4, 0, -0.1], r: [0, -60, 0], s: [1, 1, 1], pose: walk },
    { t: 5.5, p: [-0.6, 0, 0.1], r: [0, -150, 0], s: [1, 1, 1], pose: stand },
  ];
  sh.tracks[brief.id] = [
    { t: 0, p: [0.75, 0.55, -3.45], r: [0, 0, 0], s: [1, 1, 1] },
    { t: 1.5, p: [0.6, 0.55, -2.55], r: [0, -20, 0], s: [1, 1, 1] },
    { t: 4.5, p: [-0.66, 0.55, -0.25], r: [0, -60, 0], s: [1, 1, 1] },
    { t: 5.5, p: [-0.45, 0.55, -0.16], r: [0, -150, 0], s: [1, 1, 1] },
  ];
  const look = clonePose(POSES.sit); look.j.head = [-12, 25, 0];
  sh.tracks[mara.id] = [
    { t: 0, p: [-1.4, 0, -1.35], r: [0, 0, 0], s: [1, 1, 1], pose: clonePose(POSES.sit) },
    { t: 4, p: [-1.4, 0, -1.35], r: [0, 0, 0], s: [1, 1, 1], pose: clonePose(POSES.sit) },
    { t: 6, p: [-1.4, 0, -1.35], r: [0, 35, 0], s: [1, 1, 1], pose: look },
  ];
  const sh2 = newShot('SC01_SH02');
  sh2.duration = 5; sh2.rig = 'tripod';
  sh2.purpose = 'Reverse close-up on Mara as she looks up at Leo';
  sh2.camBase = { p: [-0.72, 1.12, 0.05], target: [-1.42, 1.02, -1.32], focal: 50 };
  const lookUp = clonePose(look); lookUp.j.head = [-24, 32, 0]; lookUp.j.neck = [-8, 6, 0];
  sh2.tracks[mara.id] = [
    { t: 0, p: [-1.4, 0, -1.35], r: [0, 35, 0], s: [1, 1, 1], pose: look },
    { t: 1, p: [-1.4, 0, -1.35], r: [0, 35, 0], s: [1, 1, 1], pose: look },
    { t: 3, p: [-1.4, 0, -1.35], r: [0, 35, 0], s: [1, 1, 1], pose: lookUp },
  ];
  sh2.beats = [
    { t0: 0, t1: 1, text: '@char_mara_coat_v1 sits at the desk, eyes fixed on a point off-camera-right, jaw still.' },
    { t0: 1, t1: 3, text: '@char_mara_coat_v1 slowly tilts her head up toward camera-right, a single swallow.' },
    { t0: 3, t1: 5, text: '@char_mara_coat_v1 holds the look, lips part slightly as she breathes in.' },
  ];
  sh2.tracks[leo.id] = [{ t: 0, p: [-0.6, 0, 0.1], r: [0, -150, 0], s: [1, 1, 1], pose: stand }];
  sh2.tracks[brief.id] = [{ t: 0, p: [-0.45, 0.55, -0.16], r: [0, -150, 0], s: [1, 1, 1] }];
  sh2.light = { ...LIGHT_PRESETS.Window };
  st.shots.push(sh2);
  return st;
}

function loadSaved() {
  try { const s = localStorage.getItem(STORE_KEY); if (s) return JSON.parse(s); } catch (e) { /* storage unavailable */ }
  return null;
}

const app = {
  state: loadSaved() || demoProject(),
  groups: new Map(), helpers: [], time: 0, playing: false, viewMode: 'free', tool: 'translate', poseMode: false,
  sel: null, selJoint: null, needsApply: true, exporting: false, tab: 'obj', undo: [], redo: [],
};
window.app = app; // handy for debugging from the console

// ---------------------------------------------------------------- Higgsfield Elements library
// Synced from the Higgsfield connector into higgsfield/elements.json (git-ignored), or imported by hand.
app.lib = [];
function setLibrary(list, source) {
  app.lib = (list || []).filter(e => e && e.id && e.name);
  try { localStorage.setItem(LIB_KEY, JSON.stringify(app.lib)); } catch (e) { /* ignore */ }
  const dl = document.getElementById('elementsList'), dlLoc = document.getElementById('elementsLocList');
  const opt = (e) => el('option', { value: '@' + e.name }, `${e.category.replace('auto:', '')} · ${e.description.slice(0, 70)}`);
  dl.replaceChildren(...app.lib.filter(e => !/environment/.test(e.category)).map(opt));
  dlLoc.replaceChildren(...app.lib.filter(e => /environment/.test(e.category)).map(opt));
  if (source) toast(`Libreria Elements: ${app.lib.length} elementi (${source})`);
  if (typeof renderInspector === 'function' && document.getElementById('inspector')) { renderInspector(); renderMeta(); }
}
async function loadLibrary() {
  try { const s = localStorage.getItem(LIB_KEY); if (s) setLibrary(JSON.parse(s)); } catch (e) { /* ignore */ }
  try {
    const r = await fetch('higgsfield/elements.json', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); setLibrary(j.elements || j); }
  } catch (e) { /* file not present */ }
}
// Fill fixed description and height from the Element when the tag matches.
function applyElementToObject(o) {
  const e = findElement(app.lib, o.tag);
  if (!e) return;
  o.desc = e.description; // the Element is the source of truth for what must stay fixed
  const cm = /(\d{3})\s?cm/.exec(e.description);
  if (o.kind === 'mannequin' && cm && !/with tail|with ears/.test(e.description)) o.height = +(cm[1] / 100).toFixed(2);
}
// Keep hand-written beats and loglines in sync when a tag is renamed.
function renameTagEverywhere(oldTag, newTag) {
  if (!oldTag || !newTag || oldTag === newTag) return;
  const re = new RegExp(oldTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9_])', 'g');
  for (const sh of S().shots) {
    sh.purpose = (sh.purpose || '').replace(re, newTag);
    sh.audio = (sh.audio || '').replace(re, newTag);
    sh.locks = (sh.locks || '').replace(re, newTag);
    for (const b of sh.beats || []) b.text = b.text.replace(re, newTag);
  }
}
function libPill(tag) {
  if (!tag) return null;
  if (!app.lib.length) return el('div', { class: 'field-help' }, 'Libreria Elements non caricata: Progetto → Importa libreria Elements.');
  const e = findElement(app.lib, tag);
  return e ? el('div', { class: 'field-help', style: 'color:#7fd18f' }, `✓ Element trovato su Higgsfield (${e.category.replace('auto:', '')})`)
    : el('div', { class: 'field-help', style: 'color:#f3c37a' }, '⚠ Non è nella tua libreria Elements: crealo o correggi il tag.');
}
const S = () => app.state;
const shot = () => S().shots[S().current] || S().shots[0];

// ---------------------------------------------------------------- three setup
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#aeb3ba');
app.scene = scene;

const hemi = new THREE.HemisphereLight('#dfe6ff', '#6a6258', 1.0);
scene.add(hemi);
const key = new THREE.DirectionalLight('#ffffff', 2.5);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 60 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const key2 = new THREE.DirectionalLight('#ffffff', 0);
scene.add(key2, key2.target);

const grid = new THREE.GridHelper(40, 40, 0x555a62, 0x7b8089);
grid.position.y = 0.002;
scene.add(grid); app.helpers.push(grid);

const editorCam = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
editorCam.position.set(8, 6, 10);
const editorOrbit = new OrbitControls(editorCam, canvas);
editorOrbit.target.set(0, 1, 0); editorOrbit.update();

const shotCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 500);
const shotOrbit = new OrbitControls(shotCam, canvas);
shotOrbit.enabled = false; shotOrbit.zoomSpeed = 0.6; shotOrbit.rotateSpeed = 0.5;

const proxyCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 1.4);
const camHelper = new THREE.CameraHelper(proxyCam);
scene.add(camHelper); app.helpers.push(camHelper);
const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xf0a23a }));
scene.add(camBody); app.helpers.push(camBody);

const pathMatCam = new THREE.LineBasicMaterial({ color: 0xf0a23a });
const pathMatObj = new THREE.LineBasicMaterial({ color: 0x3a8ef0 });
const camPath = new THREE.Line(new THREE.BufferGeometry(), pathMatCam);
const objPath = new THREE.Line(new THREE.BufferGeometry(), pathMatObj);
scene.add(camPath, objPath); app.helpers.push(camPath, objPath);

const tc = new TransformControls(editorCam, canvas);
tc.setSize(0.85);
scene.add(tc);
app.tc = tc;
let lastDragEnd = 0;
tc.addEventListener('dragging-changed', (e) => {
  editorOrbit.enabled = !e.value && app.viewMode === 'free';
  shotOrbit.enabled = !e.value && app.viewMode === 'shot' && !app.playing;
  if (e.value) pushUndo(); else { lastDragEnd = performance.now(); commitFromGizmo(); }
});
tc.addEventListener('objectChange', () => { if (app.poseMode) refreshJointSliders(); });

// ---------------------------------------------------------------- objects <-> three
function makeLabel(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = 'bold 44px system-ui, sans-serif';
  const w = Math.min(500, g.measureText(text).width + 40);
  g.fillStyle = 'rgba(15,16,20,0.78)';
  g.beginPath(); g.roundRect((512 - w) / 2, 10, w, 76, 18); g.fill();
  g.fillStyle = color; g.fillRect((512 - w) / 2 + 14, 38, 16, 16);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256 + 12, 49);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.1, 0.21, 1); sp.renderOrder = 10;
  return sp;
}

function buildGroup(o) {
  const g = buildObject(o.kind, o.color);
  g.userData.objId = o.id;
  if (o.kind === 'mannequin') {
    const label = makeLabel(o.tag || o.name, o.color);
    label.position.y = 2.15;
    g.add(label); app.helpers.push(label);
    g.userData.label = label;
  }
  scene.add(g);
  app.groups.set(o.id, g);
  return g;
}

function removeGroup(id) {
  const g = app.groups.get(id);
  if (!g) return;
  if (g.userData.label) app.helpers.splice(app.helpers.indexOf(g.userData.label), 1);
  if (tc.object && (tc.object === g || isDescendant(tc.object, g))) tc.detach();
  scene.remove(g);
  g.traverse(m => { if (m.geometry) m.geometry.dispose(); });
  app.groups.delete(id);
}
function isDescendant(a, root) { let p = a; while (p) { if (p === root) return true; p = p.parent; } return false; }

function rebuildAll() {
  for (const id of [...app.groups.keys()]) removeGroup(id);
  for (const o of S().objects) buildGroup(o);
  app.needsApply = true;
}

function heightFactor(o) { return o.kind === 'mannequin' ? (o.height || 1.8) / 1.8 : 1; }

function applyObj(o, smp) {
  const g = app.groups.get(o.id);
  if (!g) return;
  g.visible = !o.hidden;
  const hf = heightFactor(o);
  g.position.fromArray(smp.p);
  g.rotation.set(smp.r[0] * D2R, smp.r[1] * D2R, smp.r[2] * D2R);
  g.scale.set(smp.s[0] * hf, smp.s[1] * hf, smp.s[2] * hf);
  if (o.kind === 'mannequin' && smp.pose) applyPose(g, smp.pose);
}

function applyTime(t) {
  const sh = shot();
  for (const o of S().objects) applyObj(o, sampleObject(o, sh, t));
  const aspect = ASPECTS[sh.aspect] || 16 / 9;
  const c = sampleCam(sh, t);
  applyCamToThree(shotCam, c, aspect);
  if (!shotOrbitBusy) { shotOrbit.target.set(...c.target); }
  proxyCam.position.copy(shotCam.position); proxyCam.quaternion.copy(shotCam.quaternion);
  proxyCam.fov = shotCam.fov; proxyCam.aspect = aspect; proxyCam.updateProjectionMatrix(); proxyCam.updateMatrixWorld(true);
  camHelper.update();
  camBody.position.copy(shotCam.position); camBody.quaternion.copy(shotCam.quaternion);
  updateLights(sh, c);
}
app.applyTime = applyTime;

function updateLights(sh, c) {
  const L = sh.light;
  const target = new THREE.Vector3(...c.target);
  const back = new THREE.Vector3(c.p[0] - c.target[0], 0, c.p[2] - c.target[2]).normalize();
  if (back.lengthSq() < 0.1) back.set(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize().negate();
  const place = (light, az) => {
    const a = az * D2R, e = L.el * D2R;
    const dir = back.clone().multiplyScalar(Math.cos(a)).add(right.clone().multiplyScalar(Math.sin(a))).normalize();
    const pos = dir.multiplyScalar(Math.cos(e)).add(new THREE.Vector3(0, Math.sin(e), 0)).multiplyScalar(lightDist).add(target);
    light.position.copy(pos); light.target.position.copy(target); light.target.updateMatrixWorld();
  };
  // Shadow box follows the shot: tight for a room, wide for a landscape.
  const span = Math.min(90, Math.max(12, Math.hypot(c.p[0] - c.target[0], c.p[1] - c.target[1], c.p[2] - c.target[2]) * 1.4));
  const lightDist = Math.max(18, span * 2.5);
  if (key.shadow.camera.right !== span) {
    Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span, far: lightDist * 3 });
    key.shadow.camera.updateProjectionMatrix();
  }
  key.color.set(L.color); key.intensity = L.intensity * 1.2;
  place(key, L.az);
  const cross = L.cross || sh.panel.light === 'Soft cross';
  key2.intensity = cross ? L.intensity * 0.9 : 0; key2.color.set(L.color);
  if (cross) place(key2, -L.az);
  hemi.intensity = 0.25 + L.fill * 2.2;
  for (const o of S().objects) {
    if (o.kind !== 'lamp') continue;
    const g = app.groups.get(o.id);
    if (g && g.userData.light) g.userData.light.intensity = o.hidden ? 0 : (sh.panel.light === 'Practicals' ? 9 : 4);
  }
}

function updatePaths() {
  const sh = shot();
  const pts = [];
  if (sh.camKeys.length > 1) for (let t = 0; t <= sh.duration + 1e-6; t += sh.duration / 80) pts.push(new THREE.Vector3(...sampleCam(sh, t).p));
  camPath.geometry.dispose(); camPath.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  const op = [];
  const o = selObj();
  if (o && sh.tracks[o.id] && sh.tracks[o.id].length > 1) {
    for (let t = 0; t <= sh.duration + 1e-6; t += sh.duration / 80) { const s = sampleObject(o, sh, t); op.push(new THREE.Vector3(s.p[0], s.p[1] + 0.03, s.p[2])); }
  }
  objPath.geometry.dispose(); objPath.geometry = new THREE.BufferGeometry().setFromPoints(op);
}

// ---------------------------------------------------------------- editing / commit
function selObj() { return S().objects.find(o => o.id === app.sel) || null; }

function currentSample(o) {
  const g = app.groups.get(o.id);
  const hf = heightFactor(o);
  return {
    p: g.position.toArray().map(v => +v.toFixed(4)),
    r: [g.rotation.x / D2R, g.rotation.y / D2R, g.rotation.z / D2R].map(v => +v.toFixed(3)),
    s: [g.scale.x / hf, g.scale.y / hf, g.scale.z / hf].map(v => +v.toFixed(4)),
    pose: o.kind === 'mannequin' ? readPose(g) : null,
  };
}

function commitObject(o, smp) {
  const sh = shot();
  const track = sh.tracks[o.id];
  if (track && track.length) setKey(track, { t: +app.time.toFixed(2), ...smp });
  else o.base = { p: smp.p, r: smp.r, s: smp.s, pose: smp.pose };
  changed();
}

function commitFromGizmo() {
  const o = selObj();
  if (!o) return;
  commitObject(o, currentSample(o));
  renderInspector();
}

function camState() {
  return { p: shotCam.position.toArray().map(v => +v.toFixed(4)), target: shotOrbit.target.toArray().map(v => +v.toFixed(4)), focal: sampleCam(shot(), app.time).focal };
}

function commitCam(c) {
  const sh = shot();
  if (sh.camKeys.length) setKey(sh.camKeys, { t: +app.time.toFixed(2), ...c });
  else sh.camBase = c;
  changed();
}

let saveTimer = null;
function changed(opts = {}) {
  app.needsApply = true;
  updatePaths();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S())); } catch (e) { /* ignore */ } }, 600);
  drawTimeline();
  if (opts.lists) { renderOutliner(); renderShots(); }
  if (app.phone) app.phone.refresh();
}

function pushUndo() {
  app.undo.push(JSON.stringify(S()));
  if (app.undo.length > 80) app.undo.shift();
  app.redo.length = 0;
}
function undo(redo = false) {
  const from = redo ? app.redo : app.undo, to = redo ? app.undo : app.redo;
  if (!from.length) return;
  to.push(JSON.stringify(S()));
  app.state = JSON.parse(from.pop());
  afterLoad();
}
// Fit the free camera to the whole set (used after loading big scenes such as the arena).
function frameAll() {
  const box = new THREE.Box3();
  for (const o of S().objects) if (!o.hidden && !CATALOG[o.kind].lock) box.expandByObject(app.groups.get(o.id));
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  editorOrbit.target.set(c.x, 0, c.z);
  editorCam.position.set(c.x + size * 0.45, size * 0.38, c.z + size * 0.55);
  editorCam.far = Math.max(500, size * 4); editorCam.updateProjectionMatrix();
  editorOrbit.update();
}

async function loadBundledProject(file) {
  try {
    const r = await fetch(file, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    pushUndo(); app.state = await r.json(); app.sel = null; tc.detach(); afterLoad(); frameAll();
    toast('Arena caricata: 5 shot dalle frecce della mappa');
  } catch (e) { toast('Impossibile caricare ' + file); }
}

function afterLoad() {
  if (!S().shots.length) S().shots.push(newShot('SC01_SH01'));
  S().current = Math.min(S().current || 0, S().shots.length - 1);
  if (app.sel && !selObj()) { app.sel = null; tc.detach(); }
  rebuildAll(); app.time = Math.min(app.time, shot().duration);
  if (app.sel) attachGizmo();
  renderAllUI(); changed();
}

// ---------------------------------------------------------------- selection
function select(id, joint = null) {
  app.sel = id; app.selJoint = joint;
  attachGizmo();
  updatePaths();
  if (id) app.tab = 'obj';
  renderOutliner(); renderInspector(); drawTimeline();
  if (app.phone) app.phone.onSelect();
}

function attachGizmo() {
  const o = selObj();
  if (!o || o.hidden) { tc.detach(); return; }
  const g = app.groups.get(o.id);
  if (app.poseMode && o.kind === 'mannequin' && app.selJoint) {
    tc.attach(g.userData.joints[app.selJoint]);
    tc.setMode('rotate'); tc.setSpace('local');
  } else {
    tc.attach(g);
    tc.setMode(app.tool); tc.setSpace(app.tool === 'scale' ? 'local' : 'world');
  }
  tc.showX = tc.showY = tc.showZ = true;
  // Phones: only the handles that make sense with a finger (slide on the floor, turn around).
  if (document.body.classList.contains('m') && !(app.poseMode && app.selJoint)) {
    if (tc.mode === 'translate') tc.showY = o.role === 'prop';
    if (tc.mode === 'rotate') { tc.showX = false; tc.showZ = false; }
  }
}

const ray = new THREE.Raycaster();
let downPos = null;
canvas.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  const tol = e.pointerType === 'touch' ? 12 : 4; // fingers jitter more than a mouse
  if (!downPos || Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > tol) return;
  if (performance.now() - lastDragEnd < 150 || tc.dragging) return;
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, activeCam());
  const targets = [];
  for (const [id, g] of app.groups) { const o = S().objects.find(x => x.id === id); if (o && !o.hidden && !CATALOG[o.kind].lock) targets.push(g); }
  const hits = ray.intersectObjects(targets, true).filter(h => !(h.object.isSprite));
  if (!hits.length) { if (!app.poseMode) select(null); return; }
  let obj = hits[0].object, id = null;
  let p = obj; while (p && !id) { id = p.userData.objId; p = p.parent; }
  const o = S().objects.find(x => x.id === id);
  if (o && o.kind === 'mannequin' && app.poseMode) { select(id, obj.userData.joint || 'hips'); }
  else select(id, null);
});

function activeCam() { return app.viewMode === 'shot' ? shotCam : editorCam; }

// shot-camera piloting
let shotOrbitBusy = false;
shotOrbit.addEventListener('start', () => { pushUndo(); shotOrbitBusy = true; });
shotOrbit.addEventListener('change', () => { if (shotOrbitBusy) { commitCam(camState()); updateHud(); } });
shotOrbit.addEventListener('end', () => { shotOrbitBusy = false; renderInspectorIfShot(); if (app.phone && isPhone()) app.phone.camEdited(); });

// ---------------------------------------------------------------- view / resize
function setView(mode) {
  app.viewMode = mode;
  editorOrbit.enabled = mode === 'free';
  shotOrbit.enabled = mode === 'shot' && !app.playing;
  tc.camera = activeCam();
  camHelper.visible = camBody.visible = mode === 'free';
  document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
  resize(); updateHint();
}

function resize() {
  const vp = $('#viewport');
  const W = vp.clientWidth, H = vp.clientHeight;
  let x = 0, y = 0, w = W, h = H;
  const guide = $('#frameGuide');
  if (app.viewMode === 'shot') {
    const a = ASPECTS[shot().aspect] || 16 / 9;
    const pad = 16;
    if ((W - pad * 2) / (H - pad * 2) > a) { h = H - pad * 2; w = h * a; } else { w = W - pad * 2; h = w / a; }
    x = (W - w) / 2; y = (H - h) / 2;
    Object.assign(guide.style, { display: 'block', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  } else guide.style.display = 'none';
  Object.assign(canvas.style, { position: 'absolute', left: x + 'px', top: y + 'px' });
  renderer.setSize(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
  editorCam.aspect = w / h; editorCam.updateProjectionMatrix();
  app.needsApply = true;
  sizeTimeline();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- loop
let last = performance.now(), hudT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (app.exporting) return;
  if (app.playing) {
    app.time += dt;
    if (app.time >= shot().duration) {
      if ($('#loopChk').checked) app.time = 0; else { app.time = shot().duration; togglePlay(false); }
    }
    app.needsApply = true; updateTimeLabel(); drawTimeline();
    if (app.phone) app.phone.onTime();
  }
  if (app.needsApply && !tc.dragging) { applyTime(app.time); app.needsApply = false; }
  if (now - hudT > 200) { updateHud(); hudT = now; }
  renderer.render(scene, activeCam());
}

function togglePlay(force) {
  app.playing = force ?? !app.playing;
  if (app.playing && app.time >= shot().duration - 0.01) app.time = 0;
  $('#playBtn').textContent = app.playing ? '❚❚' : '▶';
  shotOrbit.enabled = app.viewMode === 'shot' && !app.playing;
  if (app.playing) tc.detach(); else attachGizmo();
  if (app.phone) app.phone.rerender();
}

function setTime(t) {
  app.time = Math.max(0, Math.min(shot().duration, t));
  app.needsApply = true; updateTimeLabel(); drawTimeline();
  if (app.phone) app.phone.onTime();
  if (app.tab === 'obj') renderInspectorLight();
}

function updateTimeLabel() { $('#timeLabel').textContent = `${app.time.toFixed(1)} / ${shot().duration} s`; }

function updateHud() {
  const sh = shot();
  const info = hudInfo(S(), sh, app.time);
  if (document.body.classList.contains('m')) {
    $('#hud').innerHTML = `<b>${esc(sh.id)}</b> · ${sh.aspect} · ${info.focal}mm<br>${esc(info.size)}`;
    return;
  }
  $('#hud').innerHTML = `<b>${esc(sh.id)}</b> · ${MODELS[sh.model].label} · ${sh.aspect}<br>` +
    `${info.focal}mm · camera ${info.height} m · ${esc(info.size)}` +
    (app.viewMode === 'free' ? '<br><span style="color:#8b929c">camera dello shot in arancione</span>' : '');
}

function updateHint() {
  const h = app.viewMode === 'shot'
    ? 'Camera shot: trascina = ruota attorno al target · tasto destro = sposta · rotella = avanti/indietro · cambia lente nel tab Shot · <span class="kbd">C</span> key camera'
    : app.poseMode ? 'Posa: clicca un arto e ruotalo · <span class="kbd">P</span> esci dalla posa'
      : 'Clic = seleziona · <span class="kbd">W</span>/<span class="kbd">E</span>/<span class="kbd">R</span> sposta/ruota/scala · <span class="kbd">K</span> key · <span class="kbd">F</span> centra · <span class="kbd">V</span> camera shot · <span class="kbd">Spazio</span> play';
  $('#hint').innerHTML = h;
}

// ---------------------------------------------------------------- DOM helpers
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
function row(label, input, help) {
  const r = [el('div', { class: 'row' }, el('label', {}, label), input)];
  if (help) r.push(el('div', { class: 'field-help' }, help));
  return r;
}
function input(value, onchange, attrs = {}) {
  const i = el('input', { value: value ?? '', ...attrs });
  i.addEventListener('focus', () => pushUndo());
  i.addEventListener(attrs.type === 'range' || attrs.live ? 'input' : 'change', () => onchange(attrs.type === 'number' || attrs.type === 'range' ? parseFloat(i.value) : i.value));
  return i;
}
function textarea(value, onchange, attrs = {}) {
  const t = el('textarea', attrs, value ?? '');
  t.addEventListener('focus', () => pushUndo());
  t.addEventListener('change', () => onchange(t.value));
  return t;
}
function select_(value, options, onchange) {
  const s = el('select', {}, ...options.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return el('option', { value: v, selected: v === value }, l);
  }));
  s.addEventListener('change', () => { pushUndo(); onchange(s.value); });
  return s;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------- top bar
function buildAddMenu() {
  const cats = [
    ['Personaggi', ['mannequin']],
    ['Forme', ['cube', 'sphere', 'cylinder', 'cone']],
    ['Set', ['plane', 'wall', 'doorway', 'window', 'stairs', 'column', 'table', 'chair', 'sofa', 'bed', 'tree', 'lamp']],
    ['Oggetti', ['car', 'phone', 'bottle', 'case']],
    ['Arena (dalla mappa)', ['arena_meadow', 'arena_flowers', 'arena_ridge', 'arena_forest', 'arena_river', 'arena_pond', 'arena_hub', 'arena_plates', 'arena_shield']],
  ];
  const menu = el('div', { class: 'menu left', id: 'addMenuList' });
  for (const [cat, kinds] of cats) {
    menu.append(el('div', { class: 'cat' }, cat));
    menu.append(el('div', { class: 'grid' }, ...kinds.map(k => el('button', { onclick: () => { addObject(k); closeMenus(); } }, CATALOG[k].label))));
  }
  menu.prepend(el('div', { class: 'menu-title' }, 'Aggiungi alla scena'));
  const dd = el('div', { class: 'dropdown' }, el('button', { class: 'primary', title: 'Aggiungi', onclick: (e) => { e.stopPropagation(); toggleMenu(menu); } }, '＋', el('span', { class: 'lbl' }, ' Aggiungi')), menu);
  $('#addMenu').append(dd,
    el('button', { title: 'Aggiungi manichino', onclick: () => addObject('mannequin') }, '🧍', el('span', { class: 'lbl' }, ' Manichino')));
}

function toggleMenu(m) { const open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); }
function closeMenus() { document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')); }
document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown')) closeMenus(); });

function addObject(kind) {
  pushUndo();
  const r = makeRecord(kind, {}, S().objects);
  const t = app.viewMode === 'shot' ? shotOrbit.target : editorOrbit.target;
  if (CATALOG[kind].at) r.base.p = CATALOG[kind].at.slice();
  else if (kind !== 'plane') r.base.p = [+t.x.toFixed(2), 0, +t.z.toFixed(2)];
  if (['phone', 'bottle', 'case'].includes(kind)) r.base.p[1] = 0.76;
  S().objects.push(r);
  buildGroup(r);
  changed({ lists: true });
  select(r.id);
  toast(`${CATALOG[kind].label} aggiunto`);
}

function deleteSelected() {
  const o = selObj(); if (!o) return;
  pushUndo();
  S().objects = S().objects.filter(x => x !== o);
  for (const sh of S().shots) delete sh.tracks[o.id];
  removeGroup(o.id);
  select(null); changed({ lists: true });
}

function duplicateSelected() {
  const o = selObj(); if (!o) return;
  pushUndo();
  const c = JSON.parse(JSON.stringify(o));
  c.id = uid(); c.name = o.name + ' copia'; c.tag = '';
  const smp = sampleObject(o, shot(), app.time);
  c.base = { ...smp, p: [smp.p[0] + 0.6, smp.p[1], smp.p[2] + 0.3] };
  if (c.kind === 'mannequin') {
    const used = new Set(S().objects.filter(x => x.kind === 'mannequin').map(x => x.color));
    c.color = (CHAR_COLORS.find(k => !used.has(k.hex)) || CHAR_COLORS[0]).hex;
  }
  S().objects.push(c); buildGroup(c); changed({ lists: true }); select(c.id);
}

// ---------------------------------------------------------------- left panel
function renderMeta() {
  const m = S().meta;
  const set = (k) => (v) => { m[k] = v; changed(); };
  $('#metaForm').replaceChildren(
    ...row('Progetto', input(m.project, set('project'))),
    ...row('Scena', input(m.scene, set('scene'))),
    ...row('Look', input(m.look, set('look'), { placeholder: 'realistic live action' })),
    el('label', {}, 'Style lock (riga identica in ogni prompt)'),
    textarea(m.styleLock, set('styleLock'), { rows: 2, placeholder: 'es. Look: strongly faceted low-poly 3D, …' }),
    ...row('Location @', input(m.locationTag, (v) => {
      const old = m.locationTag;
      m.locationTag = v.trim() ? '@' + v.trim().replace(/^@/, '') : '';
      renameTagEverywhere(old, m.locationTag);
      const e = findElement(app.lib, m.locationTag);
      if (e) m.locationDesc = e.description.replace(/\s*No people, no text\.?$/i, '');
      changed(); renderMeta();
    }, { placeholder: '@loc_room_time_v1', list: 'elementsLocList' })),
    libPill(m.locationTag),
    el('label', {}, 'Descrizione location (EN)'),
    textarea(m.locationDesc, set('locationDesc'), { rows: 2, placeholder: 'architecture, materials, key furniture' }),
    ...row('Ora del giorno', input(m.timeOfDay, set('timeOfDay'), { placeholder: 'dusk, noon, night…' })),
  );
}

function renderShots() {
  const list = $('#shotList');
  list.replaceChildren(...S().shots.map((sh, i) => el('div', {
    class: 'list-item' + (i === S().current ? ' sel' : ''),
    onclick: () => switchShot(i),
  },
  el('span', { class: 'name' }, sh.id),
  el('span', { class: 'meta' }, `${sh.duration}s · ${MODELS[sh.model].label.replace('Cinema Studio', 'CS')}`),
  S().shots.length > 1 ? el('button', { class: 'eye', title: 'Elimina shot', onclick: (e) => { e.stopPropagation(); deleteShot(i); } }, '✕') : null,
  )));
}

function switchShot(i) {
  S().current = i;
  app.time = Math.min(app.time, shot().duration);
  resize(); renderShots(); renderInspector(); changed(); updateTimeLabel();
}

function nextShotId() {
  const sc = S().meta.scene || 'SC01';
  let n = S().shots.length + 1;
  while (S().shots.some(s => s.id === `${sc}_SH${pad2(n)}`)) n++;
  return `${sc}_SH${pad2(n)}`;
}

function addShot(dup) {
  pushUndo();
  const cur = shot();
  let sh;
  if (dup) { sh = JSON.parse(JSON.stringify(cur)); sh.id = nextShotId(); }
  else {
    sh = newShot(nextShotId());
    const c = sampleCam(cur, app.time);
    sh.camBase = { p: c.p, target: c.target, focal: c.focal };
    sh.model = cur.model; sh.aspect = cur.aspect; sh.resolution = cur.resolution;
    sh.panel = { ...cur.panel }; sh.light = { ...cur.light };
    // Freeze every object where it is now, so the new shot starts from the current blocking.
    for (const o of S().objects) {
      if (cur.tracks[o.id] && cur.tracks[o.id].length) sh.tracks[o.id] = [{ t: 0, ...sampleObject(o, cur, app.time) }];
    }
  }
  S().shots.splice(S().current + 1, 0, sh);
  switchShot(S().current + 1);
  toast(dup ? 'Shot duplicato' : 'Nuovo shot: parte dalla posizione attuale');
}

function deleteShot(i) {
  if (!confirm(`Eliminare lo shot ${S().shots[i].id}?`)) return;
  pushUndo();
  S().shots.splice(i, 1);
  S().current = Math.max(0, Math.min(S().current, S().shots.length - 1));
  switchShot(S().current);
}

function renderOutliner() {
  const sh = shot();
  $('#outliner').replaceChildren(...S().objects.map(o => el('div', {
    class: 'list-item' + (o.id === app.sel ? ' sel' : ''), onclick: () => select(o.id),
  },
  el('span', { class: 'dot', style: `background:${o.color}` }),
  el('span', { class: 'name', title: o.tag || '' }, o.name),
  sh.tracks[o.id]?.length ? el('span', { class: 'meta', title: 'Animato in questo shot' }, '◆') : null,
  o.tag ? el('span', { class: 'meta' }, o.tag.replace(/^@?/, '@').slice(0, 14)) : null,
  el('button', {
    class: 'eye', title: o.hidden ? 'Mostra' : 'Nascondi',
    onclick: (e) => { e.stopPropagation(); pushUndo(); o.hidden = !o.hidden; if (o.id === app.sel) attachGizmo(); changed({ lists: true }); },
  }, o.hidden ? '◌' : '●'),
  )));
}

// ---------------------------------------------------------------- inspector
function renderInspector() {
  document.querySelectorAll('#inspTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === app.tab));
  const box = $('#inspector');
  if (app.tab === 'obj') box.replaceChildren(...inspectorObject());
  else if (app.tab === 'shot') box.replaceChildren(...inspectorShot());
  else box.replaceChildren(...inspectorBeats());
}
function renderInspectorIfShot() { if (app.tab === 'shot') renderInspector(); }
let lightTimer = null;
function renderInspectorLight() { clearTimeout(lightTimer); lightTimer = setTimeout(() => { if (!app.playing && !document.activeElement?.closest('#inspector')) renderInspector(); }, 60); }

function vec3Row(label, vals, onchange, step = 0.05) {
  const ins = vals.map((v, i) => {
    const x = el('input', { type: 'number', step, value: (+v).toFixed(step < 0.1 ? 2 : 0) });
    x.addEventListener('focus', () => pushUndo());
    x.addEventListener('change', () => { const nv = vals.slice(); nv[i] = parseFloat(x.value) || 0; onchange(nv); });
    return x;
  });
  return el('div', { class: 'row' }, el('label', {}, label), el('div', { class: 'row3' }, ...ins));
}

function inspectorObject() {
  const o = selObj();
  if (!o) return [el('div', { class: 'empty', html:
    'Nessun oggetto selezionato.<br><br>• Aggiungi manichini e forme da <b>＋ Aggiungi</b>.<br>• Clicca un oggetto per spostarlo.<br>• Con <b>Posa</b> attiva clicca un arto del manichino per ruotarlo.<br>• Premi <b>K</b> per creare un keyframe al tempo attuale: da quel momento ogni modifica crea o aggiorna un key.<br>• Dai a ogni personaggio il suo <b>@tag Element</b>: il prompt lo usa al posto del manichino.' })];
  const sh = shot();
  const smp = sampleObject(o, sh, app.time);
  const upd = (fn) => { const s = sampleObject(o, sh, app.time); fn(s); commitObject(o, s); };
  const out = [];
  const info = el('div', { class: 'box' },
    el('h4', {}, el('span', {}, CATALOG[o.kind].label), sh.tracks[o.id]?.length ? el('span', { class: 'pill' }, `${sh.tracks[o.id].length} key in ${sh.id}`) : el('span', { class: 'pill' }, 'statico')),
    ...row('Nome', input(o.name, v => { o.name = v; refreshLabel(o); changed({ lists: true }); })),
    ...row('@tag Element', input(o.tag, v => { const old = o.tag; o.tag = v.trim() ? '@' + v.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_') : ''; renameTagEverywhere(old, o.tag); applyElementToObject(o); refreshLabel(o); changed({ lists: true }); renderInspector(); }, { placeholder: o.kind === 'mannequin' ? '@char_nome_look_v1' : '@prop_oggetto_v1', list: 'elementsList' })),
    libPill(o.tag),
    o.kind === 'mannequin' ? null : row('Ruolo', select_(o.role, [['set', 'Set / arredo'], ['prop', 'Oggetto di scena']], v => { o.role = v; changed(); })),
    el('label', {}, 'Descrizione fissa (EN, cosa non deve cambiare)'),
    textarea(o.desc, v => { o.desc = v; changed(); }, { rows: 2, placeholder: o.kind === 'mannequin' ? 'age, hair, outfit head to toe, shoes, accessories' : 'size, materials, colours, unique details' }),
  );
  out.push(info);

  // colour
  const colorBox = el('div', { class: 'box' }, el('h4', {}, 'Colore', o.kind === 'mannequin' ? el('span', { class: 'pill' }, `${colorName(o.color)} mannequin`) : null));
  if (o.kind === 'mannequin') {
    colorBox.append(el('div', { class: 'field-help' }, 'Nel video di blocking ogni colore viene mappato al suo @tag: usa colori diversi per ogni personaggio.'));
    colorBox.append(el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' }, ...CHAR_COLORS.map(c => el('button', {
      title: c.name, style: `width:24px;height:24px;padding:0;background:${c.hex};${c.hex === o.color ? 'outline:2px solid #fff' : ''}`,
      onclick: () => { pushUndo(); o.color = c.hex; recolor(o); },
    }))));
  } else {
    colorBox.append(input(o.color, v => { o.color = v; recolor(o); }, { type: 'color', live: true }));
  }
  out.push(colorBox);

  const tf = el('div', { class: 'box' }, el('h4', {}, 'Trasformazione', el('span', { class: 'pill' }, `t = ${app.time.toFixed(1)} s`)),
    vec3Row('Posizione (m)', smp.p, v => upd(s => { s.p = v; })),
    vec3Row('Rotazione (°)', smp.r, v => upd(s => { s.r = v; }), 1),
    vec3Row('Scala', smp.s, v => upd(s => { s.s = v; })),
  );
  if (o.kind === 'mannequin') tf.append(...row('Altezza (m)', input(o.height, v => { o.height = Math.max(0.5, Math.min(2.5, v || 1.8)); changed(); }, { type: 'number', step: 0.01 }), 'Altezza fissa del personaggio: entra nel prompt.'));
  out.push(tf);

  if (o.kind === 'mannequin') {
    const pg = el('div', { class: 'pose-grid' }, ...Object.entries(POSES).map(([k, p]) => el('button', {
      onclick: () => { pushUndo(); upd(s => { s.pose = clonePose(p); }); renderInspector(); },
    }, p.label)));
    const jointSel = select_(app.selJoint || 'head', JOINTS.map(j => [j, JOINT_LABELS[j]]), v => { app.selJoint = v; if (app.poseMode) attachGizmo(); renderInspector(); });
    const j = app.selJoint || 'head';
    const cur = (smp.pose?.j?.[j]) || [0, 0, 0];
    const sliders = ['X', 'Y', 'Z'].map((ax, i) => {
      const r = el('input', { type: 'range', min: -180, max: 180, step: 1, value: cur[i] });
      const lab = el('span', { class: 'meta' }, Math.round(cur[i]) + '°');
      r.addEventListener('pointerdown', () => pushUndo());
      r.addEventListener('input', () => {
        const s = sampleObject(o, sh, app.time);
        s.pose = s.pose || { j: {}, hipsY: 0 };
        const v = (s.pose.j[j] || [0, 0, 0]).slice(); v[i] = parseFloat(r.value); s.pose.j[j] = v;
        lab.textContent = Math.round(v[i]) + '°';
        commitObject(o, s);
      });
      return el('div', { class: 'row4' }, el('label', {}, ax), r, lab, el('span'));
    });
    const hipsR = el('input', { type: 'range', min: -0.6, max: 0.3, step: 0.01, value: smp.pose?.hipsY || 0 });
    hipsR.addEventListener('pointerdown', () => pushUndo());
    hipsR.addEventListener('input', () => { const s = sampleObject(o, sh, app.time); s.pose.hipsY = parseFloat(hipsR.value); commitObject(o, s); });
    out.push(el('div', { class: 'box' }, el('h4', {}, 'Posa', el('button', { class: 'mini' + (app.poseMode ? ' active' : ''), onclick: () => setPoseMode(!app.poseMode) }, app.poseMode ? 'Posa attiva' : 'Attiva posa')),
      pg, el('hr'), ...row('Articolazione', jointSel), el('div', { id: 'jointSliders' }, ...sliders), ...row('Altezza bacino', hipsR)));
  }

  out.push(el('div', { class: 'box' }, el('h4', {}, 'Animazione in questo shot'),
    el('div', { class: 'field-help' }, sh.tracks[o.id]?.length
      ? 'L\'oggetto è animato: ogni modifica crea/aggiorna un key al tempo attuale.'
      : 'Statico: le modifiche cambiano la posizione di base (vale per tutti gli shot senza key). Premi K per iniziare ad animarlo.'),
    el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' },
      el('button', { onclick: () => keyObject() }, '◆ Key qui'),
      sh.tracks[o.id]?.length ? el('button', { class: 'danger', onclick: () => { pushUndo(); delete sh.tracks[o.id]; changed({ lists: true }); renderInspector(); } }, 'Rimuovi animazione') : null,
    )));
  out.push(el('div', { style: 'display:flex;gap:6px' },
    el('button', { onclick: duplicateSelected }, 'Duplica'),
    el('button', { onclick: () => focusSel() }, 'Centra'),
    el('button', { class: 'danger', onclick: deleteSelected }, 'Elimina')));
  return out;
}

function refreshJointSliders() {
  const o = selObj();
  if (!o || o.kind !== 'mannequin' || !app.selJoint) return;
  const g = app.groups.get(o.id); const r = g.userData.joints[app.selJoint].rotation;
  const box = document.getElementById('jointSliders'); if (!box) return;
  const vals = [r.x, r.y, r.z].map(v => v / D2R);
  box.querySelectorAll('input[type=range]').forEach((inp, i) => { inp.value = vals[i]; inp.nextSibling.textContent = Math.round(vals[i]) + '°'; });
}

function recolor(o) {
  const g = app.groups.get(o.id);
  if (o.kind === 'mannequin') setMannequinColor(g, o.color); else setObjectColor(g, o.color);
  refreshLabel(o); changed({ lists: true }); renderInspector();
}

function refreshLabel(o) {
  const g = app.groups.get(o.id);
  if (!g || !g.userData.label) return;
  const old = g.userData.label;
  g.remove(old); app.helpers.splice(app.helpers.indexOf(old), 1);
  const lab = makeLabel(o.tag || o.name, o.color); lab.position.y = 2.15;
  g.add(lab); app.helpers.push(lab); g.userData.label = lab;
}

function inspectorShot() {
  const sh = shot();
  const set = (k, rer) => (v) => { sh[k] = v; changed({ lists: true }); if (rer) { renderInspector(); resize(); } };
  const P = sh.panel;
  const setP = (k) => (v) => { P[k] = v; if (k === 'light' && LIGHT_PRESETS[v]) sh.light = { ...LIGHT_PRESETS[v] }; changed(); renderInspector(); };
  const M = MODELS[sh.model];
  const c = sampleCam(sh, app.time);
  const out = [];
  out.push(el('div', { class: 'box' }, el('h4', {}, 'Shot'),
    ...row('Shot ID', input(sh.id, v => { sh.id = v.trim() || sh.id; changed({ lists: true }); })),
    el('label', {}, 'Scopo / logline (EN)'),
    textarea(sh.purpose, set('purpose'), { rows: 2, placeholder: 'who, where, when, what happens' }),
    ...row('Modello', select_(sh.model, Object.entries(MODELS).map(([k, m]) => [k, m.label]), (v) => {
      sh.model = v; const m = MODELS[v];
      if (!m.res.includes(sh.resolution)) sh.resolution = m.res[m.res.length - 1];
      sh.duration = Math.max(m.min, Math.min(m.max, sh.duration));
      changed({ lists: true }); renderInspector(); updateTimeLabel();
    })),
    ...row('Durata (s)', input(sh.duration, v => { sh.duration = Math.max(M.min, Math.min(M.max, Math.round(v) || M.min)); app.time = Math.min(app.time, sh.duration); changed({ lists: true }); updateTimeLabel(); renderInspector(); }, { type: 'number', min: M.min, max: M.max, step: 1 }), `${M.label}: ${M.min}-${M.max} s.`),
    ...row('Formato', select_(sh.aspect, Object.keys(ASPECTS), set('aspect', true))),
    ...row('Risoluzione', select_(sh.resolution, M.res, set('resolution', true))),
    el('div', { class: 'field-help' }, costEstimate(sh) ? `Costo indicativo finale ~${costEstimate(sh)} crediti (bozza 480p molto meno). Verifica su Generate.` : 'Costo: verifica sul pulsante Generate.'),
  ));
  const focal = el('input', { type: 'range', min: 12, max: 200, step: 1, value: c.focal });
  const fl = el('span', { class: 'meta' }, Math.round(c.focal) + 'mm');
  focal.addEventListener('pointerdown', () => pushUndo());
  focal.addEventListener('input', () => { const cc = sampleCam(sh, app.time); cc.focal = parseFloat(focal.value); fl.textContent = cc.focal + 'mm'; commitCam(cc); });
  out.push(el('div', { class: 'box' }, el('h4', {}, 'Camera', el('span', { class: 'pill' }, sh.camKeys.length ? `${sh.camKeys.length} key` : 'statica')),
    ...row('Rig', select_(sh.rig, Object.entries(RIGS).map(([k, v]) => [k, v]), set('rig'))),
    el('div', { class: 'row' }, el('label', {}, 'Lente'), el('div', { style: 'display:flex;gap:6px;align-items:center' }, focal, fl)),
    ...row('Movimento', select_(sh.easing || 'smooth', [['smooth', 'Morbido (ease in/out)'], ['linear', 'Lineare']], set('easing'))),
    el('div', { class: 'field-help' }, 'Un solo movimento camera per beat. Inquadra in “Camera shot”, poi premi C ai punti chiave.'),
    el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' },
      el('button', { onclick: () => { pushUndo(); commitCam({ p: editorCam.position.toArray(), target: editorOrbit.target.toArray(), focal: sampleCam(sh, app.time).focal }); toast('Camera shot = vista libera'); } }, 'Camera = vista libera'),
      el('button', { onclick: frameSelection }, 'Inquadra selezione'),
      el('button', { onclick: keyCam }, '◆ Key camera'),
      sh.camKeys.length ? el('button', { class: 'danger', onclick: () => { pushUndo(); sh.camBase = { ...sampleCam(sh, app.time) }; sh.camKeys = []; changed(); renderInspector(); } }, 'Rimuovi movimento') : null,
    )));
  const panelBox = el('div', { class: 'box' }, el('h4', {}, sh.model === 'cs4' ? 'Director\'s Panel (CS 4.0)' : 'Look camera'),
    sh.model !== 'cs4' ? el('div', { class: 'field-help' }, 'Questo modello non ha il pannello: questi valori finiscono nella riga Style del prompt.') : null,
    ...(sh.model === 'cs4' ? [...row('Genre', select_(P.genre, PANEL.genre, setP('genre'))), ...row('Tempo', select_(P.tempo, PANEL.tempo, setP('tempo')))] : []),
    ...row('Era', select_(P.era, PANEL.era, setP('era'))),
    ...row('Camera', select_(P.body, PANEL.body, setP('body'))),
    ...row('Lens', select_(P.lens, PANEL.lens, setP('lens'))),
    ...row('Aperture', select_(P.aperture, PANEL.aperture, setP('aperture'))),
    ...(sh.model === 'cs4' ? row('Palette', input(P.palette, v => { P.palette = v; changed(); }, { placeholder: 'preset o #hex ombre→luci' })) : []),
  );
  out.push(panelBox);
  const L = sh.light;
  const lightSlider = (label, k, min, max, step) => {
    const r = el('input', { type: 'range', min, max, step, value: L[k] });
    const v = el('span', { class: 'meta' }, String(L[k]));
    r.addEventListener('pointerdown', () => pushUndo());
    r.addEventListener('input', () => { L[k] = parseFloat(r.value); v.textContent = r.value; if (P.light !== 'Custom') P.light = 'Custom'; changed(); });
    return el('div', { class: 'row' }, el('label', {}, label), el('div', { style: 'display:flex;gap:6px;align-items:center' }, r, v));
  };
  out.push(el('div', { class: 'box' }, el('h4', {}, 'Luce'),
    ...row('Preset', select_(P.light, PANEL.light, setP('light'))),
    lightSlider('Azimut (°)', 'az', -180, 180, 1),
    lightSlider('Elevazione (°)', 'el', 2, 89, 1),
    lightSlider('Intensità', 'intensity', 0, 5, 0.1),
    lightSlider('Fill', 'fill', 0, 1, 0.01),
    lightSlider('Morbidezza', 'soft', 0, 1, 0.05),
    ...row('Colore', input(L.color, v => { L.color = v; changed(); }, { type: 'color', live: true })),
    el('div', { class: 'field-help' }, 'Azimut rispetto alla camera: 0 = dalla camera, +90 = da destra, 180 = controluce.'),
  ));
  out.push(el('div', { class: 'box' }, el('h4', {}, 'Audio, lock e riferimenti'),
    el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox', checked: sh.musicVideo }), { onchange: (e) => { pushUndo(); sh.musicVideo = e.target.checked; changed(); } }), ' Videoclip (traccia in montaggio, audio OFF)'),
    el('label', {}, 'Audio (EN, vuoto = automatico)'),
    textarea(sh.audio, set('audio'), { rows: 2, placeholder: 'ambience, foley at seconds, (music), {dialogue}' }),
    el('label', {}, 'Lock extra (EN)'),
    textarea(sh.locks, set('locks'), { rows: 2, placeholder: 'scene-specific negatives' }),
    el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox', checked: sh.useStartFrame }), { onchange: (e) => { pushUndo(); sh.useStartFrame = e.target.checked; changed(); } }), ' Usa start frame (keyframe approvato)'),
    el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox', checked: sh.useBlockingVideo }), { onchange: (e) => { pushUndo(); sh.useBlockingVideo = e.target.checked; changed(); } }), ' Allega video di blocking come @Video 1'),
  ));
  return out;
}

function inspectorBeats() {
  const sh = shot();
  const beats = sh.beats;
  const out = [el('div', { class: 'field-help', style: 'margin:0 0 8px' },
    'Beat = una azione chiara per intervallo di secondi interi, da 0 alla fine. Se la lista è vuota il prompt li genera dai keyframe. Scrivi in inglese, al presente, solo ciò che si vede o si sente.')];
  out.push(el('div', { style: 'display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap' },
    el('button', { onclick: () => { pushUndo(); sh.beats = autoBeats(S(), sh); changed(); renderInspector(); } }, '⟳ Genera dai keyframe'),
    el('button', { onclick: () => { pushUndo(); const lt = beats.length ? beats[beats.length - 1].t1 : 0; beats.push({ t0: Math.min(lt, sh.duration - 1), t1: sh.duration, text: '' }); changed(); renderInspector(); } }, '+ Beat'),
    beats.length ? el('button', { class: 'danger', onclick: () => { pushUndo(); sh.beats = []; changed(); renderInspector(); } }, 'Svuota (auto)') : null,
  ));
  const list = beats.length ? beats : getBeats(S(), sh);
  if (!beats.length) out.push(el('div', { class: 'note' }, 'Anteprima automatica (non salvata):'));
  list.forEach((b, i) => {
    const mv = cameraMove(sh, b.t0, b.t1);
    const box = el('div', { class: 'beat' });
    if (beats.length) {
      const t0 = input(b.t0, v => { b.t0 = Math.max(0, Math.round(v)); changed(); }, { type: 'number', step: 1 });
      const t1 = input(b.t1, v => { b.t1 = Math.min(sh.duration, Math.round(v)); changed(); }, { type: 'number', step: 1 });
      box.append(el('div', { class: 'bt' }, t0, el('span', {}, '→'), t1, el('span', { class: 'meta' }, 's'), el('span', { style: 'flex:1' }),
        el('button', { class: 'mini', title: 'Vai', onclick: () => setTime(b.t0) }, '⇥'),
        el('button', { class: 'mini danger', onclick: () => { pushUndo(); beats.splice(i, 1); changed(); renderInspector(); } }, '✕')));
      box.append(textarea(b.text, v => { b.text = v; changed(); }, { rows: 3 }));
    } else {
      box.append(el('div', { class: 'bt' }, el('b', {}, `${b.t0}-${b.t1}s`), el('span', { style: 'flex:1' }), el('button', { class: 'mini', onclick: () => setTime(b.t0) }, '⇥')));
      box.append(el('div', { style: 'line-height:1.45' }, b.text));
    }
    box.append(el('div', { class: 'field-help', style: 'margin:4px 0 0' }, '🎥 ' + mv.text));
    out.push(box);
  });
  return out;
}

document.querySelectorAll('#inspTabs button').forEach(b => b.addEventListener('click', () => { app.tab = b.dataset.tab; renderInspector(); }));

// ---------------------------------------------------------------- actions
function keyObject() {
  const o = selObj();
  if (!o) { toast('Seleziona un oggetto'); return; }
  pushUndo();
  const sh = shot();
  sh.tracks[o.id] = sh.tracks[o.id] || [];
  setKey(sh.tracks[o.id], { t: +app.time.toFixed(2), ...currentSample(o) });
  changed({ lists: true }); renderInspector();
  toast(`Key ${o.name} a ${app.time.toFixed(1)} s`);
}

function keyCam() {
  pushUndo();
  const sh = shot();
  const c = sampleCam(sh, app.time);
  setKey(sh.camKeys, { t: +app.time.toFixed(2), p: c.p, target: c.target, focal: c.focal });
  changed(); renderInspectorIfShot();
  toast(`Key camera a ${app.time.toFixed(1)} s`);
}

function deleteKey() {
  const sh = shot();
  pushUndo();
  const o = selObj();
  if (o && sh.tracks[o.id] && removeKeyNear(sh.tracks[o.id], app.time)) {
    if (!sh.tracks[o.id].length) { o.base = { ...sampleObject(o, { tracks: {} }, 0), ...currentSample(o) }; delete sh.tracks[o.id]; }
    toast('Key oggetto eliminato');
  } else if (removeKeyNear(sh.camKeys, app.time)) {
    if (!sh.camKeys.length) sh.camBase = { ...sampleCam(sh, app.time) };
    toast('Key camera eliminato');
  } else { app.undo.pop(); toast('Nessun key al tempo attuale'); return; }
  changed({ lists: true }); renderInspector();
}

function setPoseMode(on) {
  app.poseMode = on;
  $('#poseBtn').classList.toggle('active', on);
  const o = selObj();
  if (on && o && o.kind === 'mannequin' && !app.selJoint) app.selJoint = 'head';
  attachGizmo(); updateHint(); renderInspector();
  if (app.phone) app.phone.rerender();
}

function setTool(t) {
  app.tool = t;
  document.querySelectorAll('#toolSeg button').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  if (app.poseMode) setPoseMode(false); else attachGizmo();
}

function focusSel() {
  const o = selObj(); if (!o) return;
  const g = app.groups.get(o.id);
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  const off = editorCam.position.clone().sub(editorOrbit.target);
  editorOrbit.target.copy(c);
  editorCam.position.copy(c).add(off.setLength(Math.max(3, box.getSize(new THREE.Vector3()).length() * 1.8)));
  editorOrbit.update();
}

function frameSelection() {
  const o = selObj();
  if (!o) { toast('Seleziona prima un personaggio o un oggetto'); return; }
  pushUndo();
  const g = app.groups.get(o.id);
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  if (o.kind === 'mannequin') c.y = box.min.y + (box.max.y - box.min.y) * 0.8;
  const cs = sampleCam(shot(), app.time);
  commitCam({ p: cs.p, target: c.toArray().map(v => +v.toFixed(3)), focal: cs.focal });
  toast('Camera puntata sulla selezione');
}

// ---------------------------------------------------------------- timeline
const tl = $('#tl');
const tg = tl.getContext('2d');
const tlLeft = () => (document.body.classList.contains('m') ? 52 : 90);
function sizeTimeline() {
  const r = tl.getBoundingClientRect();
  tl.width = Math.max(10, r.width * devicePixelRatio); tl.height = Math.max(10, r.height * devicePixelRatio);
  drawTimeline();
}
function tX(t) { const w = tl.width / devicePixelRatio; return tlLeft() + (t / shot().duration) * (w - tlLeft() - 14); }
function xT(x) { const w = tl.width / devicePixelRatio; return ((x - tlLeft()) / (w - tlLeft() - 14)) * shot().duration; }

function drawTimeline() {
  const dpr = devicePixelRatio, W = tl.width / dpr, H = tl.height / dpr;
  tg.setTransform(dpr, 0, 0, dpr, 0, 0);
  tg.clearRect(0, 0, W, H);
  const sh = shot();
  tg.font = '11px system-ui'; tg.textBaseline = 'middle';
  // ruler
  tg.fillStyle = '#8b929c';
  for (let s = 0; s <= sh.duration; s++) {
    const x = tX(s);
    tg.fillRect(x, 0, 1, s % 5 === 0 ? 10 : 6);
    if (s % (sh.duration > 15 ? 5 : 1) === 0) tg.fillText(s + 's', x + 3, 8);
  }
  const short = document.body.classList.contains('m');
  const rows = [[short ? 'Cam' : 'Camera', 22], [selObj() ? selObj().name.slice(0, short ? 6 : 12) : (short ? 'Ogg.' : 'Oggetto'), 42], ['Beat', 62]];
  for (const [label, y] of rows) {
    tg.fillStyle = '#20242a'; tg.fillRect(tlLeft(), y - 8, W - tlLeft() - 14, 16);
    tg.fillStyle = '#8b929c'; tg.fillText(label, 8, y);
  }
  const diamond = (x, y, c) => { tg.fillStyle = c; tg.beginPath(); tg.moveTo(x, y - 6); tg.lineTo(x + 6, y); tg.lineTo(x, y + 6); tg.lineTo(x - 6, y); tg.fill(); };
  for (const k of sh.camKeys) diamond(tX(k.t), 22, '#f0a23a');
  const o = selObj();
  if (o && sh.tracks[o.id]) for (const k of sh.tracks[o.id]) diamond(tX(k.t), 42, '#3a8ef0');
  // other animated objects as faint ticks
  for (const [id, keys] of Object.entries(sh.tracks)) {
    if (o && id === o.id) continue;
    tg.fillStyle = 'rgba(58,142,240,.35)';
    for (const k of keys) tg.fillRect(tX(k.t) - 1, 36, 2, 12);
  }
  const beats = getBeats(S(), sh);
  beats.forEach((b, i) => {
    const x0 = tX(b.t0), x1 = tX(b.t1);
    tg.fillStyle = i % 2 ? '#3b4656' : '#2f3a49';
    tg.fillRect(x0 + 1, 55, x1 - x0 - 2, 14);
    tg.fillStyle = '#c9d2de'; tg.save(); tg.beginPath(); tg.rect(x0 + 1, 55, x1 - x0 - 2, 14); tg.clip();
    tg.fillText(`${b.t0}-${b.t1}s ${b.text}`, x0 + 5, 62); tg.restore();
  });
  // playhead
  const px = tX(app.time);
  tg.fillStyle = '#e0533a'; tg.fillRect(px - 1, 0, 2, H);
}

let tlDrag = null;
tl.addEventListener('pointerdown', (e) => {
  const r = tl.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
  const sh = shot(); const o = selObj();
  const near = (keys) => keys && keys.find(k => Math.abs(tX(k.t) - x) < 7);
  if (y > 12 && y < 32) { const k = near(sh.camKeys); if (k) { pushUndo(); tlDrag = { k, keys: sh.camKeys }; } }
  else if (y >= 32 && y < 52 && o) { const k = near(sh.tracks[o.id]); if (k) { pushUndo(); tlDrag = { k, keys: sh.tracks[o.id] }; } }
  if (!tlDrag) tlDrag = { scrub: true };
  tl.setPointerCapture(e.pointerId);
  tlMove(e);
});
tl.addEventListener('pointermove', (e) => { if (tlDrag) tlMove(e); });
tl.addEventListener('pointerup', () => { if (tlDrag && tlDrag.k) { tlDrag.keys.sort((a, b) => a.t - b.t); changed(); } tlDrag = null; renderInspectorLight(); });
function tlMove(e) {
  const r = tl.getBoundingClientRect(); const t = Math.max(0, Math.min(shot().duration, xT(e.clientX - r.left)));
  if (tlDrag.k) { tlDrag.k.t = Math.round(t * 10) / 10; app.needsApply = true; updatePaths(); setTime(tlDrag.k.t); }
  else setTime(Math.round(t * 20) / 20);
}

// ---------------------------------------------------------------- prompt modal
function copyBtn(getText) {
  return el('button', { onclick: async () => {
    const text = getText();
    try { await navigator.clipboard.writeText(text); toast('Copiato'); return; } catch { /* fall back below */ }
    const ta = el('textarea', { style: 'position:fixed;top:0;left:0;opacity:0' }, text);
    document.body.append(ta); ta.focus(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand && document.execCommand('copy'); ta.remove();
    toast(ok ? 'Copiato' : 'Copia non riuscita: tieni premuto sul testo e copia');
  } }, 'Copia');
}
function outBlock(title, text, rows = 18) {
  const ta = el('textarea', { class: 'out', style: `min-height:${rows * 18}px` }, text);
  return [el('div', { class: 'out-head' }, el('b', {}, title), copyBtn(() => ta.value)), ta];
}

let modalTab = 'video';
function openPrompt(tab) {
  if (tab) modalTab = tab;
  $('#modal').classList.remove('hidden');
  renderModal();
}
function renderModal() {
  const sh = shot();
  $('#modalTitle').textContent = `Prompt Higgsfield — ${sh.id}`;
  const tabs = [['video', 'Video'], ['keyframe', 'Keyframe'], ['higgsfield', 'Connettore'], ['elements', 'Elements'], ['location', 'Location'], ['shotlist', 'Shot list'], ['workflow', 'Flusso di lavoro']];
  $('#modalTabs').replaceChildren(...tabs.map(([k, l]) => el('button', { class: k === modalTab ? 'active' : '', onclick: () => { modalTab = k; renderModal(); } }, l)));
  const body = $('#modalBody');
  const st = S();
  const B = [];
  if (modalTab === 'video') {
    const { settings, files } = buildSettings(st, sh);
    const beats = getBeats(st, sh);
    B.push(el('div', { class: 'out-head' }, el('b', {}, 'Impostazioni')),
      el('ul', { class: 'settings' }, ...settings.map(s => el('li', {}, s))),
      files.length ? el('div', { class: 'out-head' }, el('b', {}, 'Da allegare')) : null,
      files.length ? el('ul', { class: 'settings' }, ...files.map(s => el('li', {}, s))) : null);
    B.push(...outBlock('Prompt video (EN)', buildVideoPrompt(st, sh), 22));
    B.push(el('div', { class: 'out-head' }, el('b', {}, 'Rischi')), ...risks(st, sh, beats).map(r => el('div', { class: 'risk' }, '⚠ ' + r)));
  } else if (modalTab === 'keyframe') {
    B.push(el('div', { class: 'note', html: '1. <b>Esporta → Start frame blockout</b> (PNG pulito, senza griglia né gizmo).<br>2. In <b>GPT Image 2.6</b> o <b>Nano Banana Pro</b> allega il PNG come <b>@Image 1</b> + gli Element dei personaggi e della location.<br>3. Approva il keyframe e usalo come start frame nello shot video. Riusare lo stesso keyframe mantiene la continuità tra clip.' }));
    B.push(...outBlock('Keyframe START (EN)', buildKeyframePrompt(st, sh, 'start'), 16));
    B.push(...outBlock('Keyframe END (EN) — per start/end frame', buildKeyframePrompt(st, sh, 'end'), 16));
  } else if (modalTab === 'higgsfield') {
    const req = buildMcpRequests(st, sh, app.lib);
    B.push(el('div', { class: 'note', html:
      `Richieste pronte per il <b>connettore Higgsfield</b>. In una sessione Claude collegata a Higgsfield scrivi:<br><span class="kbd">genera bozza ${esc(sh.id)}</span> · <span class="kbd">genera keyframe ${esc(sh.id)}</span> · <span class="kbd">finalizza ${esc(sh.id)}</span><br>` +
      'Claude esporta il pacchetto (blockout + video di blocking), carica i file, calcola il costo e <b>chiede conferma prima di spendere crediti</b>.' }));
    B.push(el('div', { class: 'out-head' }, el('b', {}, `Elements (${req.elements.length} trovati, ${req.missing.length} mancanti)`)));
    B.push(el('ul', { class: 'settings' },
      ...req.elements.map(e => el('li', {}, `✓ ${e.tag} → ${e.id}`)),
      ...req.missing.map(t => el('li', { style: 'color:#f3c37a' }, `⚠ ${t} — non trovato`))));
    req.notes.forEach(n => B.push(el('div', { class: 'risk' }, n)));
    B.push(...outBlock('1. Keyframe — generate_image', JSON.stringify(req.keyframe, null, 2), 12));
    if (req.video) B.push(...outBlock('2. Video bozza — generate_video', JSON.stringify(req.video, null, 2), 16));
  } else if (modalTab === 'elements') {
    const rows = buildAssetBible(st);
    B.push(el('div', { class: 'note' }, 'Asset bible: un Element per ogni personaggio, oggetto ricorrente e location. Mai sovrascrivere: crea _v2.'));
    B.push(el('table', { class: 't' }, el('tr', {}, ...['Tag', 'Tipo', 'Descrizione fissa', 'Come', 'Modello'].map(h => el('th', {}, h))),
      ...rows.map(r => el('tr', {}, el('td', {}, r.tag), el('td', {}, r.type), el('td', {}, r.desc), el('td', {}, r.how), el('td', {}, r.model)))));
    for (const o of st.objects.filter(o => !o.hidden && (o.kind === 'mannequin' || o.role === 'prop'))) {
      B.push(...outBlock(`Sheet ${refName(o)} (EN)`, buildSheetPrompt(st, o), 9));
    }
  } else if (modalTab === 'location') {
    B.push(el('div', { class: 'note', html: '1. <b>Esporta → Location pack vuoto</b>: 3 PNG (wide 3/4, reverse, 3/4 opposto) senza personaggi né oggetti di scena.<br>2. Per ogni vista allega il PNG come @Image 1 e usa il prompt corrispondente (Nano Banana Pro / Seedream 5.0 Pro).<br>3. Crea un Element Location per stanza con le immagini approvate. Ora del giorno in ogni prompt.' }));
    for (const v of buildLocationPrompts(st)) B.push(...outBlock(`${v.file}`, v.prompt, 9));
  } else if (modalTab === 'shotlist') {
    B.push(...outBlock('Shot list (Markdown)', buildShotListMarkdown(st), 20));
  } else {
    B.push(el('div', { class: 'note', html: workflowHtml(sh) }));
  }
  body.replaceChildren(...B.filter(Boolean));
}

function workflowHtml(sh) {
  return `<b>Ordine di lavoro consigliato (Higgsfield Director)</b><ol style="line-height:1.8">
<li><b>Style lock</b>: una riga identica in tutti i prompt (pannello Progetto).</li>
<li><b>Elements</b>: sheet personaggi 3x2 e oggetti 2x2 (tab Elements) → crea gli Element con i tag usati qui.</li>
<li><b>Location</b>: Location pack vuoto → img2img → Element location.</li>
<li><b>Test di stabilità</b>: clip da 5 s per ogni Element; controlla inizio, metà e fine.</li>
<li><b>Keyframe</b>: Start frame blockout → keyframe realistico con gli Element (tab Keyframe).</li>
<li><b>Bozze</b>: ogni shot in ${sh.model === 'kling4' ? 'Kling 4.0 Flash 720p' : 'draft mode 480p'} con start frame + @Video 1 di blocking + prompt video.</li>
<li><b>Approvazione</b> → finali in ${sh.resolution} (Seedance/CS4: finalizza la bozza entro 7 giorni).</li>
<li><b>Post</b>: upscale, lip sync, montaggio, grading, reframe 9:16.</li></ol>
<b>Cartelle progetto</b>: 00_refs · 01_elements · 02_tests · 03_drafts · 04_finals · 05_post<br>
<b>Nomi file</b>: ${sh.id}_v1, ${sh.id}_keyframe_start.png, ${sh.id}_blocking.${'mp4/webm'}<br><br>
<b>Retake</b>: cambia una variabile alla volta; per un piccolo errore usa la modifica di regione (video edit) invece di rigenerare.`;
}

$('#modalClose').addEventListener('click', () => $('#modal').classList.add('hidden'));
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });

// ---------------------------------------------------------------- export / file menus
// ---------------------------------------------------------------- file delivery
// On iPhone the share sheet lets you save straight to Photos/Files or send to the Higgsfield app.
function toFile(name, data, type) {
  const blob = data instanceof Blob ? data : (typeof data === 'string' && data.startsWith('data:'))
    ? (() => { const [h, b] = data.split(','); const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: h.match(/:(.*?);/)[1] }); })()
    : new Blob([data], { type: type || 'text/plain' });
  return new File([blob], name, { type: blob.type });
}
function canShareFiles(files) {
  try { return document.body.classList.contains('m') && navigator.canShare && navigator.canShare({ files }); } catch { return false; }
}
async function deliverFiles(files) {
  if (canShareFiles(files)) {
    try { await navigator.share({ files }); return; } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (e && e.name === 'NotAllowedError') { offerFiles(files); return; } // user gesture expired (e.g. after recording)
    }
  }
  for (const f of files) { download(f.name, f); await new Promise(r => setTimeout(r, 350)); }
}
function offerFiles(files) {
  const bar = $('#fileOffer');
  bar.replaceChildren(
    el('span', {}, files.length > 1 ? `${files.length} file pronti` : `${files[0].name} pronto`),
    el('button', { class: 'primary', onclick: () => { bar.classList.add('hidden'); deliverFiles(files); } }, 'Salva / Condividi'),
    el('button', { onclick: () => bar.classList.add('hidden') }, '✕'));
  bar.classList.remove('hidden');
}

async function doExport(act) {
  const sh = shot();
  const keepT = app.time;
  try {
    if (act === 'still-start' || act === 'still-end' || act === 'still-depth') {
      const t = act === 'still-end' ? sh.duration : 0;
      const url = renderStill(app, sh, t, { res: '1080p', mode: act === 'still-depth' ? 'depth' : 'studio' });
      await deliverFiles([toFile(`${sh.id}_${act === 'still-end' ? 'end' : 'start'}${act === 'still-depth' ? '_depth' : ''}_blockout.png`, url)]);
    } else if (act === 'video') {
      toast(`Registrazione in tempo reale: ${sh.duration} s…`);
      const { blob, ext } = await recordBlockingVideo(app, sh, (p) => { $('#timeLabel').textContent = `REC ${Math.round(p * 100)}%`; });
      const f = toFile(`${sh.id}_blocking.${ext}`, blob);
      if (document.body.classList.contains('m')) offerFiles([f]); else await deliverFiles([f]); // recording outlives the tap: ask again
      if (ext === 'webm') toast('Video WebM: se Higgsfield lo rifiuta, convertilo in MP4');
    } else if (act === 'locpack') {
      await deliverFiles(locationPack(app, sh).map(v => toFile(`${S().meta.scene}_loc_${v.id}.png`, v.url)));
    } else if (act === 'shotlist') {
      await deliverFiles([toFile(`${S().meta.scene}_shotlist.md`, buildShotListMarkdown(S()), 'text/markdown')]);
    } else if (act === 'package') {
      const pkg = {
        generator: 'Blocking Studio', shot: sh.id, settings: buildSettings(S(), sh),
        prompts: { video: buildVideoPrompt(S(), sh), keyframeStart: buildKeyframePrompt(S(), sh, 'start'), keyframeEnd: buildKeyframePrompt(S(), sh, 'end') },
        beats: getBeats(S(), sh), risks: risks(S(), sh, getBeats(S(), sh)), assetBible: buildAssetBible(S()),
        higgsfield: buildMcpRequests(S(), sh, app.lib), project: S(),
      };
      await deliverFiles([toFile(`${sh.id}_package.json`, JSON.stringify(pkg, null, 2), 'application/json')]);
    }
  } catch (err) {
    console.error(err); toast('Errore esportazione: ' + err.message);
  } finally {
    app.time = keepT; app.needsApply = true; updateTimeLabel();
  }
}

function fileAction(act) {
  if (act === 'new') { if (!confirm('Nuovo progetto? Le modifiche non salvate in un file andranno perse.')) return; pushUndo(); app.state = newProject(); app.sel = null; tc.detach(); afterLoad(); }
  else if (act === 'demo') { pushUndo(); app.state = demoProject(); app.sel = null; tc.detach(); afterLoad(); }
  else if (act === 'save') deliverFiles([toFile(`${(S().meta.project || 'progetto').replace(/[^\w-]+/g, '_')}.blocking.json`, JSON.stringify(S(), null, 2), 'application/json')]);
  else if (act === 'open') $('#fileInput').click();
  else if (act === 'lib') $('#libInput').click();
  else if (act === 'arena') loadBundledProject('projects/arena.blocking.json');
}
$('#fileInput').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const st = data.project && data.generator ? data.project : data;
    if (!st.objects || !st.shots) throw new Error('file non valido');
    pushUndo(); app.state = st; app.sel = null; tc.detach(); afterLoad(); toast('Progetto caricato');
  } catch (err) { toast('Impossibile aprire: ' + err.message); }
  e.target.value = '';
});

$('#libInput').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const j = JSON.parse(await f.text()); setLibrary(j.elements || j, f.name); } catch (err) { toast('File libreria non valido'); }
  e.target.value = '';
});

// ---------------------------------------------------------------- headless API (tools/handoff.mjs)
// Used by the exporter that prepares files for the Higgsfield connector.
function blobToBase64(blob) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
}
window.blocking = {
  loadProject(st) { app.state = st; app.sel = null; tc.detach(); afterLoad(); return S().shots.map(s => s.id); },
  setLibrary(list) { setLibrary(list); },
  shotIds() { return S().shots.map(s => s.id); },
  async exportShot(id, { video = true } = {}) {
    const i = S().shots.findIndex(s => s.id === id);
    if (i < 0) throw new Error('shot non trovato: ' + id);
    S().current = i; app.time = 0;
    const sh = shot();
    const out = {
      files: {
        [`${sh.id}_start_blockout.png`]: renderStill(app, sh, 0, { res: '1080p' }).split(',')[1],
        [`${sh.id}_end_blockout.png`]: renderStill(app, sh, sh.duration, { res: '1080p' }).split(',')[1],
      },
    };
    if (video) {
      const { blob, ext } = await recordBlockingVideo(app, sh);
      out.files[`${sh.id}_blocking.${ext}`] = await blobToBase64(blob);
    }
    const beats = getBeats(S(), sh);
    out.package = {
      generator: 'Blocking Studio', shot: sh.id, exportSize: exportSize(sh, '1080p'),
      settings: buildSettings(S(), sh),
      prompts: { video: buildVideoPrompt(S(), sh), keyframeStart: buildKeyframePrompt(S(), sh, 'start'), keyframeEnd: buildKeyframePrompt(S(), sh, 'end') },
      beats, risks: risks(S(), sh, beats), higgsfield: buildMcpRequests(S(), sh, app.lib),
    };
    return out;
  },
};

$('#exportBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('#exportMenu')); });
$('#fileBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('#fileMenu')); });
$('#exportMenu').addEventListener('click', (e) => { const a = e.target.dataset.act; if (a) { closeMenus(); doExport(a); } });
$('#fileMenu').addEventListener('click', (e) => { const a = e.target.dataset.act; if (a) { closeMenus(); fileAction(a); } });
$('#promptBtn').addEventListener('click', () => openPrompt());
$('#undoBtn').addEventListener('click', () => undo());
$('#redoBtn').addEventListener('click', () => undo(true));
$('#playBtn').addEventListener('click', () => togglePlay());
$('#keyObjBtn').addEventListener('click', keyObject);
$('#keyCamBtn').addEventListener('click', keyCam);
$('#delKeyBtn').addEventListener('click', deleteKey);
$('#poseBtn').addEventListener('click', () => setPoseMode(!app.poseMode));
$('#addShotBtn').addEventListener('click', () => addShot(false));
$('#dupShotBtn').addEventListener('click', () => addShot(true));
document.querySelectorAll('#toolSeg button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
document.querySelectorAll('#viewSeg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(e.shiftKey); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); undo(true); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicateSelected(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === 'w') setTool('translate');
  else if (k === 'e') setTool('rotate');
  else if (k === 'r') setTool('scale');
  else if (k === 'p') setPoseMode(!app.poseMode);
  else if (k === 'k') keyObject();
  else if (k === 'c') keyCam();
  else if (k === 'v') setView(app.viewMode === 'free' ? 'shot' : 'free');
  else if (k === 'f') focusSel();
  else if (k === ' ') { e.preventDefault(); togglePlay(); }
  else if (k === 'delete' || k === 'backspace') deleteSelected();
  else if (k === 'escape') { if (!$('#modal').classList.contains('hidden')) $('#modal').classList.add('hidden'); else if (document.querySelector('.sheet.open')) closeSheets(); else select(null); }
  else if (k === 'arrowright') setTime(app.time + (e.shiftKey ? 1 : 0.1));
  else if (k === 'arrowleft') setTime(app.time - (e.shiftKey ? 1 : 0.1));
});

// ---------------------------------------------------------------- phone layout (iPhone etc.)
// On phones the desktop panels are replaced by the guided interface in phone.js.
const phoneMQ = window.matchMedia('(max-width: 760px), (max-height: 500px) and (pointer: coarse)');
const isPhone = () => document.body.classList.contains('m');

function applyLayout() {
  const force = new URLSearchParams(location.search).get('layout');
  const m = force ? force === 'phone' : phoneMQ.matches;
  const land = m && window.innerWidth > window.innerHeight;
  const changed = isPhone() !== m;
  document.body.classList.toggle('m', m);
  document.body.classList.toggle('land', land);
  tc.setSize(m ? 1.5 : 0.85);
  if (changed) { closeSheets(); updateHud(); attachGizmo(); }
  if (m && app.phone) app.phone.rerender();
  resize();
}

function openSheet(name) {
  closeMenus();
  $('#left').classList.toggle('open', name === 'scene');
  $('#right').classList.toggle('open', name !== 'scene');
  if (name !== 'scene') {
    app.tab = name; renderInspector();
    $('#rightTitle').textContent = { obj: 'Dettagli oggetto', shot: 'Dettagli shot', beats: 'Testi dell\'azione' }[name];
    $('#right').scrollTop = 0;
  }
}
function closeSheets() {
  document.querySelectorAll('.sheet.open').forEach(x => x.classList.remove('open'));
  if (app.phone) app.phone.rerender();
}
document.querySelectorAll('.sheet-close').forEach(b => b.addEventListener('click', closeSheets));
document.querySelectorAll('.sheet-head').forEach(h => {
  let start = null;
  h.addEventListener('touchstart', (e) => { start = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
  h.addEventListener('touchend', (e) => {
    if (!start) return;
    const t = e.changedTouches[0]; const dx = t.clientX - start[0], dy = t.clientY - start[1];
    if (dy > 60 || (document.body.classList.contains('land') && dx > 60)) closeSheets();
    start = null;
  });
});

phoneMQ.addEventListener('change', applyLayout);
window.addEventListener('resize', () => { if (isPhone() && document.body.classList.contains('land') !== (window.innerWidth > window.innerHeight)) applyLayout(); });
window.addEventListener('orientationchange', () => setTimeout(applyLayout, 250));

initPhone({
  app, S, shot, selObj, select, addObject, deleteSelected, duplicateSelected, keyObject, deleteKey,
  setTool, setView, setPoseMode, openPrompt, doExport, fileAction, switchShot, addShot, deleteShot,
  commitCam, sampleCam, sampleObject, pushUndo, changed, togglePlay, setTime, undo, toast, resize,
  closeSheets, openDetails: (tab) => openSheet(tab), openLeft: () => openSheet('scene'), frameAll,
  applyPose: (o, p) => { pushUndo(); const smp = sampleObject(o, shot(), app.time); smp.pose = clonePose(p); commitObject(o, smp); },
});

// ---------------------------------------------------------------- boot
function renderAllUI() { renderMeta(); renderShots(); renderOutliner(); renderInspector(); updateTimeLabel(); updateHint(); }
buildAddMenu();
loadLibrary();
rebuildAll();
setTool('translate');
applyLayout();
setView('free');
renderAllUI();
updatePaths();
requestAnimationFrame(loop);
requestAnimationFrame(() => { resize(); drawTimeline(); });
