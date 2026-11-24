// Keyframe sampling. Pure data in, pure data out: no Three.js scene mutation here.
import * as THREE from 'three';
import { lerpPose, clonePose } from './mannequin.js';

const D2R = Math.PI / 180;
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _e = new THREE.Euler();

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function ease(t, mode) {
  if (mode === 'linear') return t;
  return t * t * (3 - 2 * t); // smoothstep: starts and stops gently, like a real dolly or a person
}

function bracket(keys, t) {
  if (!keys || !keys.length) return null;
  if (t <= keys[0].t) return [keys[0], keys[0], 0];
  const last = keys[keys.length - 1];
  if (t >= last.t) return [last, last, 0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) return [a, b, (t - a.t) / Math.max(1e-6, b.t - a.t)];
  }
  return [last, last, 0];
}

export function slerpEuler(ra, rb, t) {
  _qa.setFromEuler(_e.set(ra[0] * D2R, ra[1] * D2R, ra[2] * D2R));
  _qb.setFromEuler(_e.set(rb[0] * D2R, rb[1] * D2R, rb[2] * D2R));
  _qa.slerp(_qb, t);
  _e.setFromQuaternion(_qa);
  return [_e.x / D2R, _e.y / D2R, _e.z / D2R];
}

// Returns {p, r (deg), s, pose} for an object at time t inside a shot.
export function sampleObject(obj, shot, t) {
  const keys = shot && shot.tracks && shot.tracks[obj.id];
  const b = bracket(keys, t);
  if (!b) return { p: obj.base.p.slice(), r: obj.base.r.slice(), s: obj.base.s.slice(), pose: obj.base.pose ? clonePose(obj.base.pose) : null };
  const [ka, kb, f] = b;
  const e = ease(f, shot.easing);
  return {
    p: lerp3(ka.p, kb.p, e),
    r: slerpEuler(ka.r, kb.r, e),
    s: lerp3(ka.s, kb.s, e),
    pose: ka.pose && kb.pose ? lerpPose(ka.pose, kb.pose, e) : (ka.pose ? clonePose(ka.pose) : null),
  };
}

export function sampleCam(shot, t) {
  const b = bracket(shot.camKeys, t);
  if (!b) return { p: shot.camBase.p.slice(), target: shot.camBase.target.slice(), focal: shot.camBase.focal, roll: shot.camBase.roll || 0 };
  const [ka, kb, f] = b;
  const e = ease(f, shot.easing);
  return {
    p: lerp3(ka.p, kb.p, e), target: lerp3(ka.target, kb.target, e),
    focal: lerp(ka.focal, kb.focal, e), roll: lerp(ka.roll || 0, kb.roll || 0, e),
  };
}

export function setKey(keys, key) {
  const i = keys.findIndex(k => Math.abs(k.t - key.t) < 0.02);
  if (i >= 0) keys[i] = key; else keys.push(key);
  keys.sort((a, b) => a.t - b.t);
}

export function removeKeyNear(keys, t) {
  const i = keys.findIndex(k => Math.abs(k.t - t) < 0.06);
  if (i >= 0) { keys.splice(i, 1); return true; }
  return false;
}

// Aspect ratios and focal length <-> field of view (full-frame 36 mm along the long side).
export const ASPECTS = { '16:9': 16 / 9, '21:9': 21 / 9, '9:16': 9 / 16, '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4 };

export function focalToVFov(focal, aspect) {
  const sensorH = aspect >= 1 ? 36 / aspect : 36;
  return 2 * Math.atan(sensorH / 2 / focal) / D2R;
}

export function applyCamToThree(cam, c, aspect) {
  cam.position.set(c.p[0], c.p[1], c.p[2]);
  cam.up.set(0, 1, 0);
  cam.lookAt(c.target[0], c.target[1], c.target[2]);
  if (c.roll) cam.rotateZ(c.roll * D2R);
  cam.aspect = aspect;
  cam.fov = focalToVFov(c.focal, aspect);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}
