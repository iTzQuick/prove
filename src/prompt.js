// Scene analysis + Higgsfield prompt writer.
// Follows the Higgsfield Director rules: labelled sections, contiguous whole-second beats,
// one camera move per range, every reference bound to one job, counts and bans stated twice,
// no vague quality words, settings not repeated inside the prompt.
import * as THREE from 'three';
import { sampleObject, sampleCam, ASPECTS, applyCamToThree } from './anim.js';
import { describePose } from './mannequin.js';
import { CATALOG, colorName } from './objects.js';

const D2R = Math.PI / 180;
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const r1 = (x) => Math.round(x * 10) / 10;

export const MODELS = {
  seedance_2_5: { label: 'Seedance 2.5', min: 4, max: 30, res: ['480p', '720p', '1080p'] },
  cs4: { label: 'Cinema Studio 4.0', min: 4, max: 30, res: ['480p', '720p', '1080p'] },
  kling4: { label: 'Kling 4.0', min: 3, max: 30, res: ['720p', '1080p'] },
  veo31: { label: 'Veo 3.1', min: 4, max: 8, res: ['720p', '1080p'] },
};

export const RIGS = {
  tripod: 'locked-off tripod', dolly: 'dolly on track', slider: 'short slider', gimbal: 'stabilised gimbal',
  steadicam: 'Steadicam', handheld: 'handheld with natural breathing sway', crane: 'crane / jib arm',
  drone: 'aerial drone', fpv: 'FPV drone', robot: 'robot arm',
};

export const PANEL = {
  genre: ['General', 'Action', 'Epic', 'Drama', 'Comedy', 'Horror', 'Noir'],
  era: ['2020s', '2000s', '1990s', '1980s', '1960s'],
  tempo: ['Single shot', 'Calm', 'Dynamic', 'Chaotic', 'Auto'],
  body: ['Modern', '35mm Film', '8mm Film', 'DV Camcorder'],
  lens: ['Clean Sharp', 'Anamorphic', 'Vintage Anamorphic', 'Warm Vintage', 'Halation Vintage'],
  aperture: ['f/4 Moderate', 'f/1.4 Wide Open', 'f/11 Deep Focus'],
  light: ['Custom', 'Window', 'Contre-jour', 'Silhouette', 'Overhead fall', 'Soft cross', 'Practicals'],
};

// Light presets: azimuth relative to the camera (0 = from the camera, 90 = camera-right, 180 = behind subject).
export const LIGHT_PRESETS = {
  Window: { az: -70, el: 25, intensity: 2.4, color: '#fff3e0', fill: 0.45, soft: 0.8 },
  'Contre-jour': { az: 170, el: 18, intensity: 3.0, color: '#ffc98a', fill: 0.4, soft: 0.5 },
  Silhouette: { az: 180, el: 8, intensity: 3.5, color: '#ffe2bd', fill: 0.08, soft: 0.3 },
  'Overhead fall': { az: 20, el: 82, intensity: 2.8, color: '#f2f4ff', fill: 0.25, soft: 0.4 },
  'Soft cross': { az: -110, el: 22, intensity: 2.0, color: '#e8eeff', fill: 0.3, soft: 0.7, cross: true },
  Practicals: { az: -40, el: 30, intensity: 0.5, color: '#ffb36b', fill: 0.18, soft: 0.6 },
};

const BANNED = /\b(cinematic|stunning|breathtaking|masterpiece|epic|seamless|mesmeri[sz]ing|vibrant tapestry|elevate|unleash|high quality|8k)\b/gi;

// ---------- helpers ----------
export function refName(o) {
  if (o.tag && o.tag.trim()) return o.tag.trim().startsWith('@') ? o.tag.trim() : '@' + o.tag.trim();
  if (o.kind === 'mannequin') {
    // Default UI names are Italian ("Manichino 2"): never leak them into an English prompt.
    const m = /^Manichino (\d+)$/.exec(o.name || '');
    return m ? `Person ${m[1]}` : (o.name || 'the person');
  }
  return 'the ' + CATALOG[o.kind].en;
}

function camAt(shot, t) {
  const c = sampleCam(shot, t);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
  applyCamToThree(cam, c, ASPECTS[shot.aspect] || 16 / 9);
  return { c, cam };
}

function charHeight(o, s) { return (o.height || 1.8) * (s ? s.s[1] : 1); }

// Screen analysis of one character at time t.
function frameInfo(o, shot, t) {
  const s = sampleObject(o, shot, t);
  const { c, cam } = camAt(shot, t);
  const h = charHeight(o, s);
  const scale = h / 1.8;
  const hipsY = (s.pose && s.pose.hipsY) || 0;
  const feet = V(s.p);
  const top = V(s.p).add(new THREE.Vector3(0, h + hipsY * scale, 0));
  const chest = V(s.p).add(new THREE.Vector3(0, (1.35 + hipsY) * scale, 0));
  const camPos = V(c.p);
  const dist = chest.distanceTo(camPos);
  const toObj = chest.clone().sub(camPos);
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const inFront = toObj.dot(fwd) > 0.1;
  const headP = V(s.p).add(new THREE.Vector3(0, h + hipsY * scale - 0.12 * scale, 0));
  const pf = feet.clone().project(cam), pt = top.clone().project(cam);
  const pcChest = chest.clone().project(cam), ph = headP.clone().project(cam);
  const inFrame = (q) => Math.abs(q.x) < 1.02 && Math.abs(q.y) < 1.05;
  const visible = inFront && (inFrame(pcChest) || inFrame(ph));
  // Screen position: chest if it is in frame, otherwise the head (close-ups).
  const pc = inFrame(pcChest) ? pcChest : ph;
  const ratio = Math.abs(pt.y - pf.y) / 2; // body height / frame height
  let size;
  if (ratio < 0.25) size = 'extreme wide shot';
  else if (ratio < 0.6) size = 'wide shot';
  else if (ratio < 1.0) size = 'full shot';
  else if (ratio < 1.5) size = 'medium wide shot';
  else if (ratio < 2.2) size = 'medium shot';
  else if (ratio < 3.2) size = 'medium close-up';
  else if (ratio < 6) size = 'close-up';
  else size = 'extreme close-up';
  const third = pc.x < -0.33 ? 'frame-left third' : pc.x > 0.33 ? 'frame-right third' : 'frame centre';
  const depth = dist < 2.5 ? 'foreground' : dist < 7 ? 'mid-ground' : 'background';
  // Facing relative to camera.
  const yaw = s.r[1] * D2R;
  const facing = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const toCam = camPos.clone().sub(feet).setY(0).normalize();
  const dot = facing.dot(toCam);
  let facingTxt;
  if (dot > 0.7) facingTxt = 'facing the camera';
  else if (dot < -0.7) facingTxt = 'back to the camera';
  else {
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
    const side = facing.dot(camRight) > 0 ? 'frame-right' : 'frame-left';
    facingTxt = dot > 0.2 ? `three-quarter to camera, turned toward ${side}` : dot < -0.2 ? `three-quarter away, turned toward ${side}` : `in profile, facing ${side}`;
  }
  return { s, visible, size, ratio, third, depth, dist, facingTxt, facing, ndc: pc, pose: s.pose };
}

function camDescribe(shot, t) {
  const { c, cam } = camAt(shot, t);
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const pitch = Math.asin(fwd.y) / D2R;
  const h = c.p[1];
  let height;
  if (h < 0.5) height = 'ground level';
  else if (h < 1.15) height = 'low height';
  else if (h < 1.85) height = 'eye level';
  else if (h < 4) height = 'raised';
  else height = 'aerial height';
  let angle = '';
  if (pitch < -65) angle = 'top-down';
  else if (pitch < -22) angle = 'high angle looking down';
  else if (pitch > 15) angle = 'low angle looking up';
  return { c, cam, fwd, pitch, height, angle, heightM: r1(h) };
}

function lensWords(f) {
  const mm = Math.round(f);
  const fov = f < 20 ? 'ultra-wide' : f < 30 ? 'wide' : f < 45 ? 'normal' : f < 75 ? 'short telephoto' : 'long telephoto';
  return `${mm}mm ${fov} lens`;
}

// One dominant camera move between t0 and t1 (skill: one move per range).
export function cameraMove(shot, t0, t1) {
  const a = camDescribe(shot, t0), b = camDescribe(shot, t1);
  const dt = Math.max(0.1, t1 - t0);
  const pa = V(a.c.p), pb = V(b.c.p), ta = V(a.c.target), tb = V(b.c.target);
  const d = pb.clone().sub(pa);
  const right = new THREE.Vector3().crossVectors(a.fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const fwdH = a.fwd.clone(); fwdH.y = 0; fwdH.normalize();
  const comp = { forward: d.dot(fwdH), lateral: d.dot(right), vertical: d.y };
  const mag = d.length();
  const speed = mag / dt;
  const spd = speed < 0.35 ? 'slow' : speed < 1.3 ? 'steady' : 'fast';
  const zoom = b.c.focal / a.c.focal;

  // Orbit: position rotates around a roughly fixed target, distance stays similar.
  const va = pa.clone().sub(ta).setY(0), vb = pb.clone().sub(tb).setY(0);
  let orbitDeg = 0;
  if (va.length() > 0.3 && vb.length() > 0.3) {
    orbitDeg = Math.atan2(va.x * vb.z - va.z * vb.x, va.x * vb.x + va.z * vb.z) / D2R;
  }
  const distRatio = vb.length() / Math.max(0.01, va.length());
  if (Math.abs(orbitDeg) > 15 && ta.distanceTo(tb) < 1.0 && distRatio > 0.7 && distRatio < 1.4) {
    const dir = orbitDeg > 0 ? 'counter-clockwise' : 'clockwise';
    return { kind: 'orbit', text: `${spd} ${Math.round(Math.abs(orbitDeg))}-degree ${dir} orbit around the subject, keeping ${r1(va.length())} m distance` };
  }
  if (mag < 0.12) {
    const yawA = Math.atan2(a.fwd.x, a.fwd.z), yawB = Math.atan2(b.fwd.x, b.fwd.z);
    let dyaw = (yawB - yawA) / D2R; dyaw = ((dyaw + 540) % 360) - 180;
    const dp = b.pitch - a.pitch;
    if (Math.abs(zoom - 1) > 0.15) return { kind: 'zoom', text: `${spd} optical zoom ${zoom > 1 ? 'in' : 'out'} from ${Math.round(a.c.focal)}mm to ${Math.round(b.c.focal)}mm, camera body static` };
    if (Math.abs(dyaw) > 5 && Math.abs(dyaw) >= Math.abs(dp)) return { kind: 'pan', text: `${spd} pan ${dyaw > 0 ? 'left' : 'right'} of ${Math.round(Math.abs(dyaw))} degrees, camera position fixed` };
    if (Math.abs(dp) > 4) return { kind: 'tilt', text: `${spd} tilt ${dp > 0 ? 'up' : 'down'} of ${Math.round(Math.abs(dp))} degrees, camera position fixed` };
    return { kind: 'static', text: 'static frame, no camera movement' };
  }
  const ax = Object.entries(comp).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0];
  const m = r1(Math.abs(ax[1]));
  if (ax[0] === 'forward') return { kind: ax[1] > 0 ? 'push' : 'pull', text: ax[1] > 0 ? `${spd} push-in of ${m} m toward the subject` : `${spd} pull-back of ${m} m away from the subject` };
  if (ax[0] === 'lateral') return { kind: 'truck', text: `${spd} lateral tracking move of ${m} m to the ${ax[1] > 0 ? 'right' : 'left'}, parallel to the action` };
  return { kind: ax[1] > 0 ? 'crane-up' : 'crane-down', text: `${spd} ${ax[1] > 0 ? 'rise' : 'descent'} of ${m} m (pedestal/crane ${ax[1] > 0 ? 'up' : 'down'})` };
}

function characters(state) { return state.objects.filter(o => o.kind === 'mannequin' && !o.hidden); }
function props(state) { return state.objects.filter(o => o.role === 'prop' && o.kind !== 'mannequin' && !o.hidden); }

// Who actually appears in this shot. Skill rule: off-screen = nonexistent, so counts, references
// and locks only cover what the camera sees at some point of the shot.
function sampleTimes(shot) { const ts = []; for (let t = 0; t <= shot.duration + 1e-6; t += 0.5) ts.push(Math.min(t, shot.duration)); return ts; }
export function cast(state, shot) {
  return characters(state).filter(o => sampleTimes(shot).some(t => frameInfo(o, shot, t).visible));
}
function shotProps(state, shot) {
  const c = cast(state, shot);
  return props(state).filter(p => sampleTimes(shot).some(t => {
    const h = holder(state, shot, p, t);
    if (h && c.includes(h.o)) return true;
    const s = sampleObject(p, shot, t);
    const { cam } = camAt(shot, t);
    const q = V(s.p).add(new THREE.Vector3(0, 0.1, 0)).project(cam);
    return q.z < 1 && Math.abs(q.x) < 1 && Math.abs(q.y) < 1;
  }));
}
function setPieces(state) { return state.objects.filter(o => o.role === 'set' && !o.hidden && !['plane'].includes(o.kind)); }

function mainSubject(state, shot, t) {
  let best = null, bd = Infinity;
  for (const o of characters(state)) {
    const f = frameInfo(o, shot, t);
    if (!f.visible) continue;
    const score = Math.abs(f.ndc.x) * 3 + f.dist * 0.2;
    if (score < bd) { bd = score; best = { o, f }; }
  }
  return best;
}

// Which character holds a prop at time t (prop near a hand, between 0.5 and 1.7 m height).
function holder(state, shot, p, t) {
  const ps = sampleObject(p, shot, t);
  for (const o of characters(state)) {
    const s = sampleObject(o, shot, t);
    const sc = charHeight(o, s) / 1.8;
    const yaw = s.r[1] * D2R;
    for (const [side, sx] of [['left', 1], ['right', -1]]) {
      // Approximate hand position when arms hang or reach forward.
      const local = new THREE.Vector3(sx * 0.26 * sc, 0, 0.15 * sc).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const hand = V(s.p).add(local);
      const dx = Math.hypot(ps.p[0] - hand.x, ps.p[2] - hand.z);
      const hy = ps.p[1] - s.p[1];
      if (dx < 0.4 * sc && hy > 0.4 * sc && hy < 1.9 * sc) return { o, side };
    }
  }
  return null;
}

function nearestLandmark(state, obj, pos) {
  let best = null, bd = 1.4;
  for (const o of state.objects) {
    if (o === obj || o.hidden || ['plane', 'wall'].includes(o.kind)) continue;
    const d = Math.hypot(o.base.p[0] - pos[0], o.base.p[2] - pos[2]);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

const POSE_TRANSITIONS = {
  'sitting': 'sits down', 'kneeling on the right knee': 'kneels down on the right knee', 'crouching low': 'crouches down',
  'standing relaxed': 'stands upright', 'hands raised above the head': 'raises both hands above the head',
  'pointing forward with the right arm': 'raises the right arm and points forward', 'arms crossed': 'crosses the arms',
  'waving with the right hand': 'waves with the right hand', 'holding a phone to the right ear': 'lifts the phone to the right ear',
  'reaching forward with both hands': 'reaches forward with both hands', 'in a fighting guard stance': 'raises the fists into a guard',
  'turning the head to look aside': 'turns the head to look aside', 'dancing with arms up': 'starts dancing, arms up',
  'arms spread wide': 'spreads the arms wide',
};

// Natural-language description of what one character does between t0 and t1.
function describeCharacterBeat(state, shot, o, t0, t1) {
  const a = frameInfo(o, shot, t0), b = frameInfo(o, shot, t1);
  const who = refName(o);
  const parts = [];
  const { cam } = camAt(shot, t0);
  const d = V(b.s.p).sub(V(a.s.p)); d.y = 0;
  const dist = d.length();
  const dt = Math.max(0.1, t1 - t0);
  const v = dist / dt;
  const poseA = a.pose ? describePose(a.pose) : 'standing relaxed';
  const poseB = b.pose ? describePose(b.pose) : poseA;

  if (!a.visible && b.visible) {
    const side = b.ndc.x < 0 ? 'frame-left' : 'frame-right';
    parts.push(`enters from ${side}`);
  }
  if (dist > 0.25) {
    const verb = v < 0.9 ? 'walks slowly' : v < 1.8 ? 'walks' : v < 3.2 ? 'jogs' : 'runs';
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
    const lat = d.dot(camRight), dep = -d.dot(camFwd);
    const dirs = [];
    if (Math.abs(lat) > 0.35 * dist) dirs.push(lat > 0 ? 'toward frame-right' : 'toward frame-left');
    if (Math.abs(dep) > 0.35 * dist) dirs.push(dep > 0 ? 'toward the camera' : 'away from the camera');
    let txt = `${verb} ${r1(dist)} m ${dirs.join(' and ')}`.trim();
    const after = sampleObject(o, shot, Math.min(shot.duration, t1 + 0.5));
    const stops = Math.hypot(after.p[0] - b.s.p[0], after.p[2] - b.s.p[2]) < 0.05;
    const lm = stops ? nearestLandmark(state, o, b.s.p) : null;
    if (lm) txt += `, stopping beside ${refName(lm)}`;
    parts.push(txt);
  }
  // Only report changes that land on a recognisable pose; interpolated in-between poses are noise.
  if (poseA !== poseB && poseB !== 'in a custom pose' && !/walking|running/.test(poseB)) {
    parts.push(POSE_TRANSITIONS[poseB] || `shifts to ${poseB}`);
  } else if (poseB === 'in a custom pose' && dist < 0.25 && b.pose && !/walking|running/.test(poseA)) {
    const keysHere = (shot.tracks[o.id] || []).some(k => Math.abs(k.t - t1) < 0.6);
    if (keysHere) parts.push('adjusts the body position');
  }
  // Turn: changed facing category or facing another character.
  if (a.facingTxt !== b.facingTxt) {
    let target = null;
    for (const other of characters(state)) {
      if (other === o) continue;
      const os = sampleObject(other, shot, t1);
      const to = V(os.p).sub(V(b.s.p)).setY(0).normalize();
      if (to.dot(b.facing) > 0.9) target = other;
    }
    parts.push(target ? `turns to face ${refName(target)}` : `turns, ending ${b.facingTxt}`);
  }
  if (a.visible && !b.visible) parts.push(`exits frame ${b.ndc.x < 0 ? 'left' : 'right'}`);
  if (!parts.length) {
    if (!b.visible) return null;
    return `${who} holds position, ${poseB}, small breathing movement and weight shifts`;
  }
  return `${who} ${parts.join(', then ')}`;
}

function describePropBeat(state, shot, p, t0, t1) {
  const a = sampleObject(p, shot, t0), b = sampleObject(p, shot, t1);
  const d = V(b.p).sub(V(a.p));
  if (d.length() < 0.15) return null;
  const hb = holder(state, shot, p, t1), ha = holder(state, shot, p, t0);
  if (hb && ha && hb.o === ha.o) return null; // carried along
  if (hb && !ha) return `${refName(hb.o)} picks up ${refName(p)} with the ${hb.side} hand`;
  if (ha && !hb) return `${refName(ha.o)} puts down ${refName(p)}`;
  if (d.y < -0.3) return `${refName(p)} falls ${r1(-d.y)} m and lands on the floor`;
  return `${refName(p)} slides ${r1(d.length())} m`;
}

// Beat boundaries: keyframe times rounded to whole seconds, merged to at least 1 s, contiguous 0..duration.
export function autoBeatRanges(shot) {
  const dur = Math.round(shot.duration);
  const times = new Set([0, dur]);
  for (const keys of Object.values(shot.tracks || {})) for (const k of keys) times.add(Math.round(k.t));
  for (const k of shot.camKeys || []) times.add(Math.round(k.t));
  let ts = [...times].filter(x => x >= 0 && x <= dur).sort((a, b) => a - b);
  ts = ts.filter((x, i) => i === 0 || x - ts[i - 1] >= 1);
  if (ts[ts.length - 1] !== dur) ts[ts.length - 1] = dur;
  // Enough beats for the duration: 8 s -> 3, 15 s -> 4-5, 30 s -> 6+ (skill 5.3).
  const want = Math.max(1, Math.min(9, Math.round(dur / 3.3)));
  while (ts.length - 1 < want) {
    let bi = 0, bl = 0;
    for (let i = 0; i < ts.length - 1; i++) if (ts[i + 1] - ts[i] > bl) { bl = ts[i + 1] - ts[i]; bi = i; }
    if (bl < 2) break;
    ts.splice(bi + 1, 0, ts[bi] + Math.round(bl / 2));
  }
  const ranges = [];
  for (let i = 0; i < ts.length - 1; i++) ranges.push([ts[i], ts[i + 1]]);
  return ranges;
}

export function autoBeats(state, shot) {
  const people = cast(state, shot), things = shotProps(state, shot);
  return autoBeatRanges(shot).map(([t0, t1]) => {
    const lines = [];
    for (const o of people) { const l = describeCharacterBeat(state, shot, o, t0, t1); if (l) lines.push(l); }
    for (const p of things) { const l = describePropBeat(state, shot, p, t0, t1); if (l) lines.push(l); }
    return { t0, t1, text: lines.join('. ') + (lines.length ? '.' : 'The scene holds; ambient movement only.') };
  });
}

// Normalise user beats into contiguous whole seconds covering 0..duration.
function normBeats(shot, beats) {
  const dur = Math.round(shot.duration);
  const b = beats.filter(x => x.text && x.text.trim()).map(x => ({ ...x, t0: Math.round(x.t0), t1: Math.round(x.t1) })).sort((a, b) => a.t0 - b.t0);
  if (!b.length) return [];
  b[0].t0 = 0;
  for (let i = 1; i < b.length; i++) b[i].t0 = b[i - 1].t1;
  b[b.length - 1].t1 = dur;
  return b.filter(x => x.t1 > x.t0);
}

export function getBeats(state, shot) {
  const user = normBeats(shot, shot.beats || []);
  return user.length ? user : autoBeats(state, shot);
}

function firstFrameText(state, shot, t) {
  const lines = [];
  for (const o of cast(state, shot)) {
    const f = frameInfo(o, shot, t);
    if (!f.visible) { lines.push(`${refName(o)} is not in frame yet`); continue; }
    const pose = f.pose ? describePose(f.pose) : 'standing relaxed';
    lines.push(`${refName(o)} in the ${f.third}, ${f.depth} (${r1(f.dist)} m from camera), ${f.facingTxt}, ${pose}`);
  }
  for (const p of shotProps(state, shot)) {
    const h = holder(state, shot, p, t);
    if (h) lines.push(`${refName(h.o)} holds ${refName(p)} in the ${h.side} hand`);
  }
  return lines.join('; ') + '.';
}

function locationText(state, shot) {
  const m = state.meta;
  const { cam } = camAt(shot, 0);
  const pieces = [];
  for (const o of setPieces(state)) {
    if (!o.tag && ['wall', 'cube', 'cylinder', 'cone', 'sphere'].includes(o.kind)) continue;
    const p = V(o.base.p).add(new THREE.Vector3(0, 0.5, 0)).project(cam);
    if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.2) continue;
    const where = p.x < -0.33 ? 'frame-left' : p.x > 0.33 ? 'frame-right' : 'centre frame';
    pieces.push(`${refName(o).replace(/^the /, 'a ')} ${where}`);
  }
  const parts = [];
  if (m.locationDesc) parts.push(m.locationDesc.trim().replace(/\.$/, ''));
  if (pieces.length) parts.push('key objects: ' + pieces.slice(0, 6).join(', '));
  parts.push(`time of day: ${m.timeOfDay || 'day'}`);
  return parts.join('; ') + '. No people in the location description.';
}

function lightingText(state, shot) {
  const L = shot.light;
  const preset = shot.panel.light;
  const az = ((L.az % 360) + 540) % 360 - 180;
  let from;
  const a = Math.abs(az);
  if (a < 25) from = 'from beside the camera, frontal';
  else if (a < 70) from = `from camera-${az > 0 ? 'right' : 'left'}, 45 degrees`;
  else if (a < 120) from = `from camera-${az > 0 ? 'right' : 'left'}, side light`;
  else if (a < 160) from = `from behind the subject, camera-${az > 0 ? 'right' : 'left'} rim light`;
  else from = 'from directly behind the subject, toward the camera';
  const col = new THREE.Color(L.color);
  const temp = col.r - col.b > 0.15 ? 'warm' : col.b - col.r > 0.08 ? 'cool' : 'neutral white';
  const quality = L.soft > 0.6 ? 'soft, diffused' : L.soft > 0.35 ? 'medium-soft' : 'hard, crisp-edged';
  const height = L.el > 70 ? 'from high overhead' : L.el > 40 ? 'high' : L.el > 15 ? 'slightly above head height' : 'low, near the horizon';
  const fill = L.fill < 0.15 ? 'almost no fill, deep shadows' : L.fill < 0.35 ? 'a weak ambient fill, bounce keeps shadows readable' : 'a gentle ambient fill, bounce keeps shadows open';
  const lamps = state.objects.filter(o => o.kind === 'lamp' && !o.hidden);
  let txt = `One ${temp} ${quality} key light ${from}, ${height}; ${fill}.`;
  if (L.cross || preset === 'Soft cross') txt = `Two ${temp} soft cross lights from camera-left and camera-right behind the subjects, faces modelled from both sides; ${fill}.`;
  if (lamps.length) txt += ` ${lamps.length} practical lamp${lamps.length > 1 ? 's' : ''} in the set cast${lamps.length > 1 ? '' : 's'} warm pools of light.`;
  txt += ' Light direction and left-right logic stay constant for the whole shot.';
  return txt;
}

function physicsText(state, shot, beats) {
  const all = beats.map(b => b.text).join(' ');
  const out = [];
  if (/runs|jogs/.test(all)) out.push('running with real weight: forefoot strikes, torso leans forward, arms pump in counter-rhythm');
  if (/walks/.test(all)) out.push('natural walking weight transfer, heel-to-toe footfalls, arms swing in counter-rhythm');
  if (/sits down|kneels|crouches/.test(all)) out.push('the body lowers under control, weight settles and the surface compresses');
  if (/picks up|puts down| in the (left|right) hand/.test(all)) out.push('objects have mass: hands grip before lifting, wrists take the weight');
  if (/falls/.test(all)) out.push('falling objects accelerate with gravity and bounce once on impact');
  if (!out.length) out.push('subtle breathing, small weight shifts, no frozen poses');
  out.push('clothing and hair react to movement; real-world physics, no slow motion');
  return out.join('; ') + '.';
}

function audioText(shot) {
  if (shot.audio && shot.audio.trim()) return shot.audio.trim();
  if (shot.musicVideo) return 'No music, no dialogue, no narration (the track is laid in edit). Only soft natural foley.';
  return 'Ambient room tone and foley synced to the action. No music, no dialogue, no narration.';
}

function locksText(state, shot, beats) {
  const chars = cast(state, shot);
  const n = chars.length;
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  const nw = words[n] || String(n);
  const l = [];
  if (n === 0) l.push('No people anywhere in the video');
  else l.push(`Exactly ${nw} ${n === 1 ? 'person' : 'people'}; only ${n === 1 ? 'this person exists' : `these ${nw} people exist`} in the entire video`);
  const untagged = chars.filter(o => !o.tag);
  if (untagged.length) l.push('each character has a wholly original, invented face');
  if (n) l.push('five fingers on each hand, no morphing, no duplicate figures');
  for (const p of shotProps(state, shot)) l.push(`${refName(p)} is one single object, only one instance`);
  if (shot.panel.tempo === 'Single shot' && !beats.some(b => /hard cut/i.test(b.text))) l.push('one continuous shot, no cuts');
  l.push('no text, no subtitles, no logos, no watermarks');
  if (shot.locks && shot.locks.trim()) l.push(shot.locks.trim().replace(/\.$/, ''));
  // Critical bans stated twice.
  const again = n ? `Again: exactly ${nw} ${n === 1 ? 'person' : 'people'}, no text.` : 'Again: no people, no text.';
  return l.join('; ') + '. ' + again;
}

export function colourMap(state, shot) {
  return (shot ? cast(state, shot) : characters(state)).map(o => `the ${colorName(o.color)} mannequin is ${refName(o)}`).join('; ');
}

function referencesBlock(state, shot, { video, image } = {}) {
  const L = [];
  for (const o of cast(state, shot)) {
    if (!o.tag) continue;
    L.push(`${refName(o)} controls identity and outfit only. It is a multi-view sheet: show one single character; do not copy the sheet layout, grey background or pose.`);
  }
  if (state.meta.locationTag) L.push(`${refName({ tag: state.meta.locationTag })} controls the place, architecture and materials only. Do not copy its camera angle.`);
  for (const p of shotProps(state, shot)) {
    if (!p.tag) continue;
    const s = sampleObject(p, shot, 0);
    const size = Math.round(Math.max(...p.base.s.map(Math.abs)) * (p.kind === 'phone' ? 15 : p.kind === 'bottle' ? 30 : p.kind === 'case' ? 45 : 100) * (s.s[1] || 1));
    const h = holder(state, shot, p, 0);
    L.push(`${refName(p)} is one single object, about ${size} cm${h ? `, held in ${refName(h.o)}'s ${h.side} hand` : ''}.`);
  }
  for (const o of setPieces(state)) if (o.tag) L.push(`${refName(o)} controls that set piece's shape and material only.`);
  if (image) L.push(`${image} is a grey 3D blockout: it controls only composition, camera angle, lens, character positions, facing directions, poses and scale. Do not copy its grey materials, mannequin bodies, floor grid or flat lighting. In ${image} ${colourMap(state, shot)}.`);
  if (video) L.push(`${video} controls camera path, blocking and pacing only. It is a grey 3D blockout with coloured mannequins: do not copy its shapes, grey materials, mannequin bodies, colours, floor grid or flat lighting. In ${video} ${colourMap(state, shot)}.`);
  return L;
}

function styleText(state, shot) {
  const m = state.meta;
  const parts = [];
  if (m.look) parts.push(m.look.trim().replace(/\.$/, ''));
  if (shot.model !== 'cs4') {
    const p = shot.panel;
    parts.push(`${p.body === 'Modern' ? 'modern digital cinema camera' : p.body} look with ${p.lens.toLowerCase()} lenses, ${p.aperture.replace(/ .*/, '')} depth of field, ${p.era} colour response`);
  }
  parts.push(`${shot.aspect} frame, natural 180-degree shutter motion blur`);
  let s = parts.join('; ') + '.';
  if (m.styleLock && m.styleLock.trim()) s += ' ' + m.styleLock.trim();
  return s;
}

function cameraLines(state, shot, beats) {
  return beats.map(b => {
    const cd = camDescribe(shot, b.t0);
    const mv = cameraMove(shot, b.t0, b.t1);
    const subjA = mainSubject(state, shot, b.t0), subjB = mainSubject(state, shot, b.t1);
    const rig = RIGS[shot.rig] || shot.rig;
    let framing = subjA ? `${subjA.f.size} of ${refName(subjA.o)}` : 'frame on the set';
    let txt = `${b.t0}-${b.t1}s: ${mv.text}, ${rig}, ${lensWords(cd.c.focal)}, ${framing}, camera at ${cd.height} (${cd.heightM} m)${cd.angle ? ', ' + cd.angle : ''}`;
    if (subjA && mv.kind !== 'static') {
      const endSize = frameInfo(subjA.o, shot, b.t1).size;
      if (endSize !== subjA.f.size) txt += `, ending in a ${endSize}`;
    }
    return txt + '.';
  });
}

export function costEstimate(shot) {
  const s = shot.duration, r = shot.resolution;
  const t = {
    cs4: { '480p': 3, '720p': 7, '1080p': 16 },
    seedance_2_5: { '480p': 3, '720p': 7, '1080p': 12 },
    kling4: { '720p': 5, '1080p': 7.5 },
  }[shot.model];
  if (!t || !t[r]) return null;
  return Math.round(t[r] * s);
}

export function risks(state, shot, beats) {
  const R = [];
  const chars = cast(state, shot);
  if (shot.duration > 8) R.push('Drift possibile dopo 5-8 s: ho aggiunto un anchor di posizione a metà clip; se cede, accorcia o fai Extend.');
  if (chars.length > 3) R.push('Più di 3 personaggi che agiscono: identità a rischio. Riduci chi agisce per beat o separa gli shot.');
  if (beats.some(b => /enters|exits/.test(b.text))) R.push('Entrata/uscita di campo: non far rientrare lo stesso personaggio nello stesso shot.');
  for (let i = 0; i < beats.length; i++) {
    const mv = cameraMove(shot, beats[i].t0, beats[i].t1);
    if (mv.kind === 'orbit' && /3[0-9]{2}-degree/.test(mv.text)) R.push('Orbita oltre 300°: preferisci 180° salvo azione molto semplice.');
  }
  if (shot.model === 'veo31' && shot.duration > 8) R.push('Veo 3.1 arriva a 8 s: accorcia lo shot o cambia modello.');
  if (!chars.some(o => o.tag) && chars.length) R.push('Personaggi senza Element: l\'identità cambierà tra uno shot e l\'altro. Crea gli Element prima dei final.');
  if (!state.meta.locationTag) R.push('Nessun Element location: la stanza può cambiare tra shot. Usa il Location pack per crearla.');
  if (!R.length) R.push('Nessun rischio evidente: verifica inizio, metà e fine della clip.');
  return R.slice(0, 3);
}

function midAnchor(state, shot) {
  if (shot.duration <= 8) return '';
  const tm = Math.round(shot.duration / 2);
  const lines = cast(state, shot).map(o => {
    const f = frameInfo(o, shot, tm);
    return f.visible ? `${refName(o)} in the ${f.third}, ${f.facingTxt}` : null;
  }).filter(Boolean);
  return lines.length ? `Mid-clip anchor at ${tm}s: ${lines.join('; ')}.` : '';
}

const clean = (s) => s.replace(BANNED, '').replace(/ {2,}/g, ' ').replace(/ ,/g, ',');

// ---------- public builders ----------
export function buildVideoPrompt(state, shot, opts = {}) {
  const beats = getBeats(state, shot);
  const useVideo = shot.useBlockingVideo;
  const refs = referencesBlock(state, shot, { video: useVideo ? '@Video 1' : null });
  const charTxt = cast(state, shot).map(o => {
    const h = (+(o.height || 1.8)).toFixed(2);
    return `${refName(o)}${o.desc ? ': ' + o.desc.trim().replace(/\.$/, '') : ''}, ${h} m tall`;
  }).join('. ');
  const subj = mainSubject(state, shot, 0);
  const scene = shot.purpose && shot.purpose.trim() ? shot.purpose.trim().replace(/\.$/, '') + '.' :
    `${cast(state, shot).map(refName).join(' and ') || 'The empty set'} at ${state.meta.locationTag ? refName({ tag: state.meta.locationTag }) : 'the location'}, ${state.meta.timeOfDay || 'day'}.`;

  if (shot.model === 'veo31') {
    const beat = beats.map(b => b.text).join(' ');
    const cam = cameraLines(state, shot, [{ t0: 0, t1: Math.round(shot.duration) }])[0].replace(/^\S+ /, '');
    return clean([
      `${scene} ${firstFrameText(state, shot, 0)}`,
      `${beat}`,
      `Camera: ${cam}`,
      `Lighting: ${lightingText(state, shot)}`,
      `Physics: ${physicsText(state, shot, beats)}`,
      `Style: ${styleText(state, shot)}`,
      `Audio: ${audioText(shot)}`,
      `${locksText(state, shot, beats)}`,
    ].join('\n'));
  }

  const out = [];
  if (refs.length) out.push('References:\n' + refs.join('\n'));
  out.push('Style: ' + styleText(state, shot));
  out.push('Scene: ' + scene);
  if (charTxt) out.push('Characters: ' + charTxt + '.');
  out.push('Location: ' + locationText(state, shot));
  out.push('First frame: ' + firstFrameText(state, shot, 0) + (subj ? ` Opening framing: ${subj.f.size}.` : ''));
  const anchor = midAnchor(state, shot);
  out.push('Action:\n' + beats.map(b => `${b.t0}-${b.t1}s: ${b.text.trim()}`).join('\n') + (anchor ? '\n' + anchor : ''));
  out.push('Camera:\n' + cameraLines(state, shot, beats).join('\n'));
  out.push('Physics: ' + physicsText(state, shot, beats));
  if (shot.model !== 'cs4' || shot.panel.light === 'Custom') out.push('Lighting: ' + lightingText(state, shot));
  if (shot.model !== 'kling4') out.push('Audio: ' + audioText(shot));
  out.push('Locks: ' + locksText(state, shot, beats));
  return clean(out.join('\n\n'));
}

export function buildKeyframePrompt(state, shot, which = 'start') {
  const t = which === 'start' ? 0 : shot.duration;
  const tmpShot = shot;
  const refs = referencesBlock(state, tmpShot, { image: '@Image 1' });
  const beats = getBeats(state, shot);
  return clean([
    'References:\n' + refs.join('\n'),
    `Image: one ${shot.aspect} still frame, the ${which === 'start' ? 'first' : 'last'} frame of shot ${shot.id}. ${firstFrameText(state, shot, t)}`,
    'Camera: ' + cameraLines(state, shot, [{ t0: Math.round(t), t1: Math.round(t) }])[0].replace(/^[^:]+: static frame, no camera movement, /, ''),
    'Location: ' + locationText(state, shot),
    'Lighting: ' + lightingText(state, shot),
    'Style: ' + styleText(state, shot),
    'Locks: ' + locksText(state, { ...shot, panel: { ...shot.panel, tempo: 'Auto' } }, beats).replace(/no subtitles, /, '') + ' No mannequins, no floor grid, no grey blockout materials in the result.',
  ].join('\n\n'));
}

export function buildLocationPrompts(state) {
  const m = state.meta;
  const desc = m.locationDesc || 'describe the place here: architecture, materials, furniture, mood';
  const views = [
    ['wide', 'neutral wide view of the whole space, 3/4 angle'],
    ['reverse', 'reverse angle of the same space, showing what is behind the camera of the wide view'],
    ['threequarter', 'second 3/4 angle from the opposite corner'],
  ];
  return views.map(([id, what]) => ({
    id,
    file: `${m.scene}_loc_${id}.png`,
    prompt: clean([
      `References: @Image 1 is a grey 3D blockout of the empty set. It controls only the layout, proportions, openings, furniture placement and camera angle. Do not copy its grey materials, floor grid or flat lighting.${m.styleLock ? '' : ''}`,
      `Image: ${what}, 16:9. ${desc.replace(/\.$/, '')}. Time of day: ${m.timeOfDay || 'day'}, in the final scene light.`,
      m.styleLock ? 'Style: ' + m.styleLock : 'Style: real photographic materials, natural light falloff.',
      'Empty location: no people, no text, no logos, no watermarks.',
    ].join('\n\n')),
  }));
}

export function buildSheetPrompt(state, o) {
  const style = state.meta.styleLock || '';
  if (o.kind === 'mannequin') {
    return clean([
      'Horizontal character sheet, 16:9, 4K. Strict 3x2 grid with exactly 6 equal-sized panels: 1 front, 2 three-quarter left, 3 profile left, 4 back, 5 three-quarter right, 6 face close-up (numbers only for reference; do not render any numbers in the image). All views different, same scale, no view repeated.',
      `Identical original character on all views: ${o.desc || 'describe identity, face, hair, outfit head to toe, shoes, accessories with counts'}. Height ${r1(o.height || 1.8)} m, mature adult proportions. Neutral expression, same outfit in every panel.`,
      style,
      'Neutral light grey seamless studio background, soft studio light.',
      'Single subject only, exactly one person per panel, no duplicate figures, no props, no annotations, no labels, no text, no logos, no watermark.',
    ].filter(Boolean).join('\n\n'));
  }
  return clean([
    'Horizontal prop sheet, 16:9, 4K. Strict 2x2 grid with exactly 4 equal-sized panels: 1 front, 2 three-quarter, 3 side, 4 top (numbers only for reference; do not render any numbers in the image). All views different, same scale, no view repeated.',
    `One single object, only one instance: ${o.desc || 'describe size, materials, colours and unique details'}.`,
    style,
    'Neutral light grey studio background, soft studio light.',
    'No annotations, callouts, arrows, labels, text, logos or people.',
  ].filter(Boolean).join('\n\n'));
}

export function buildSettings(state, shot) {
  const p = shot.panel;
  const L = [];
  const M = MODELS[shot.model];
  L.push(`Modello: ${M.label}`);
  const mode = shot.useStartFrame ? 'image-to-video (start frame)' : 'omni_reference / text-to-video';
  if (shot.model === 'seedance_2_5' || shot.model === 'cs4') L.push(`Modalità: ${mode}`);
  L.push(`Durata: ${shot.duration} s`);
  L.push(`Aspect ratio: ${shot.aspect}`);
  L.push(`Risoluzione: bozza ${shot.model === 'kling4' ? '720p (Kling 4.0 Flash)' : '480p (draft mode)'} → finale ${shot.resolution}`);
  L.push(`Audio nativo: ${shot.musicVideo ? 'OFF (traccia in montaggio)' : 'ON'}`);
  if (shot.model === 'cs4') {
    L.push(`Genre: ${p.genre}`, `Era: ${p.era}`, `Tempo: ${p.tempo}`, `Camera: ${p.body}`, `Lens: ${p.lens}`, `Aperture: ${p.aperture}`);
    L.push(`Lighting: ${p.light === 'Custom' ? 'Custom (descritta nel prompt)' : p.light}`);
    if (p.palette) L.push(`Colour palette: ${p.palette}`);
  }
  const files = [];
  if (shot.useStartFrame) files.push(`Start frame: ${shot.id}_keyframe_start.png (generato dal prompt Keyframe, approvato)`);
  if (shot.useBlockingVideo) files.push(`@Video 1: ${shot.id}_blocking.mp4/.webm`);
  const tags = [...cast(state, shot), ...shotProps(state, shot), ...setPieces(state).filter(o => o.tag)].filter(o => o.tag).map(refName);
  if (state.meta.locationTag) tags.push(refName({ tag: state.meta.locationTag }));
  if (tags.length) files.push('Elements: ' + [...new Set(tags)].join(', '));
  const cost = costEstimate(shot);
  if (cost) L.push(`Costo indicativo finale: ~${cost} crediti (x2-x3 per i retake; verifica sul pulsante Generate)`);
  else L.push('Costo: verifica sul pulsante Generate');
  return { settings: L, files };
}

export function buildAssetBible(state) {
  const rows = [];
  for (const o of state.objects) {
    if (o.hidden) continue;
    if (o.kind === 'mannequin') rows.push({ tag: refName(o), type: 'Character', desc: o.desc || '—', how: 'Sheet 3x2 → Element (Soul ID se persona reale)', model: 'Nano Banana Pro / Soul 2.0' });
    else if (o.role === 'prop') rows.push({ tag: refName(o), type: 'Prop', desc: o.desc || '—', how: 'Sheet 2x2 → Element', model: 'GPT Image 2.6 / Nano Banana Pro' });
    else if (o.tag) rows.push({ tag: refName(o), type: 'Prop/Set', desc: o.desc || '—', how: 'Sheet 2x2 → Element', model: 'GPT Image 2.6' });
  }
  if (state.meta.locationTag) rows.push({ tag: refName({ tag: state.meta.locationTag }), type: 'Location', desc: state.meta.locationDesc || '—', how: 'Location pack (wide, reverse, 3/4) → img2img → Element', model: 'Nano Banana Pro / Seedream 5.0 Pro' });
  if (state.meta.styleLock) rows.push({ tag: '@style_' + (state.meta.project || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_v1', type: 'Style lock', desc: state.meta.styleLock, how: 'Riga identica in ogni prompt', model: '—' });
  return rows;
}

export function buildShotListMarkdown(state) {
  let tc = 0;
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const lines = [
    `# ${state.meta.project} — shot list ${state.meta.scene}`, '',
    '| Shot ID | Timecode | Durata | Azione | Inquadratura + movimento | Asset | Modello | Audio | Rischio |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const shot of state.shots) {
    const beats = getBeats(state, shot);
    const subj = mainSubject(state, shot, 0);
    const mv = cameraMove(shot, 0, shot.duration);
    const assets = [...cast(state, shot), ...shotProps(state, shot)].filter(o => o.tag).map(refName).concat(state.meta.locationTag ? [refName({ tag: state.meta.locationTag })] : []);
    const action = (shot.purpose || beats[0]?.text || '').replace(/\|/g, '/').slice(0, 90);
    lines.push(`| ${shot.id} | ${fmt(tc)}-${fmt(tc + shot.duration)} | ${shot.duration}s | ${action} | ${subj ? subj.f.size : '—'}, ${mv.text} | ${assets.join(', ') || '—'} | ${MODELS[shot.model].label} | ${shot.musicVideo ? 'off' : 'nativo'} | ${risks(state, shot, beats)[0].replace(/\|/g, '/')} |`);
    tc += shot.duration;
  }
  return lines.join('\n');
}

// Live HUD info for the viewport.
export function hudInfo(state, shot, t) {
  const subj = mainSubject(state, shot, t);
  const c = sampleCam(shot, t);
  return { size: subj ? `${subj.f.size} · ${refName(subj.o)}` : 'nessun personaggio in campo', focal: Math.round(c.focal), height: r1(c.p[1]) };
}
