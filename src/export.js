// Clean exports for Higgsfield: no grid, gizmos, camera frustums, paths or labels (skill: "export without axes, cones and paths").
import * as THREE from 'three';
import { ASPECTS, applyCamToThree, sampleCam, focalToVFov } from './anim.js';

let xr = null; // export renderer
function exportRenderer() {
  if (!xr) {
    xr = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    xr.shadowMap.enabled = true; xr.shadowMap.type = THREE.PCFSoftShadowMap;
    xr.outputColorSpace = THREE.SRGBColorSpace;
    xr.toneMapping = THREE.ACESFilmicToneMapping; xr.toneMappingExposure = 1.0;
    xr.setPixelRatio(1);
  }
  return xr;
}

export function exportSize(shot, res = '720p') {
  const a = ASPECTS[shot.aspect] || 16 / 9;
  const short = res === '1080p' ? 1080 : res === '480p' ? 480 : 720;
  return a >= 1 ? [Math.round(short * a / 2) * 2, short] : [short, Math.round(short / a / 2) * 2];
}

function withCleanScene(app, opts, fn) {
  const hidden = [];
  const hide = (o) => { if (o && o.visible) { o.visible = false; hidden.push(o); } };
  app.helpers.forEach(hide);
  hide(app.tc);
  if (opts.hideCharacters) {
    for (const o of app.state.objects) {
      if (o.kind === 'mannequin' || o.role === 'prop') hide(app.groups.get(o.id));
    }
  }
  const prevOverride = app.scene.overrideMaterial;
  if (opts.mode === 'depth') app.scene.overrideMaterial = new THREE.MeshDepthMaterial();
  try { return fn(); } finally {
    hidden.forEach(o => { o.visible = true; });
    app.scene.overrideMaterial = prevOverride;
  }
}

function depthCam(cam) {
  // Tighten near/far so the depth map uses the full range.
  cam.near = 0.3; cam.far = 25; cam.updateProjectionMatrix();
}

export function renderStill(app, shot, t, opts = {}) {
  const [w, h] = opts.size || exportSize(shot, opts.res || '1080p');
  const r = exportRenderer();
  r.setSize(w, h, false);
  app.applyTime(t);
  const cam = opts.camera || (() => {
    const c = new THREE.PerspectiveCamera(40, w / h, 0.05, 500);
    applyCamToThree(c, sampleCam(shot, t), w / h);
    return c;
  })();
  if (opts.mode === 'depth') depthCam(cam);
  return withCleanScene(app, opts, () => {
    r.render(app.scene, cam);
    return r.domElement.toDataURL('image/png');
  });
}

export function download(name, dataOrBlob, type) {
  const blob = dataOrBlob instanceof Blob ? dataOrBlob
    : typeof dataOrBlob === 'string' && dataOrBlob.startsWith('data:') ? dataURLtoBlob(dataOrBlob)
      : new Blob([dataOrBlob], { type: type || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function dataURLtoBlob(d) {
  const [head, b64] = d.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime });
}

function pickMime() {
  const c = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return c.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || 'video/webm';
}

// Real-time recording of the shot camera, 30 fps.
export function recordBlockingVideo(app, shot, onProgress) {
  return new Promise((resolve, reject) => {
    if (!window.MediaRecorder) { reject(new Error('MediaRecorder non supportato da questo browser')); return; }
    const [w, h] = exportSize(shot, '720p');
    const r = exportRenderer();
    r.setSize(w, h, false);
    const cam = new THREE.PerspectiveCamera(40, w / h, 0.05, 500);
    const stream = r.domElement.captureStream(30);
    const mime = pickMime();
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => resolve({ blob: new Blob(chunks, { type: mime }), ext: mime.includes('mp4') ? 'mp4' : 'webm' });
    app.exporting = true;
    const draw = (t) => {
      app.applyTime(t);
      applyCamToThree(cam, sampleCam(shot, t), w / h);
      withCleanScene(app, {}, () => r.render(app.scene, cam));
    };
    draw(0);
    rec.start(250);
    const start = performance.now();
    const step = () => {
      const t = (performance.now() - start) / 1000;
      if (t >= shot.duration) {
        draw(shot.duration);
        setTimeout(() => { rec.stop(); app.exporting = false; }, 120);
        return;
      }
      draw(t);
      onProgress && onProgress(t / shot.duration);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// Empty location views: wide 3/4, reverse, opposite 3/4 — characters and props hidden.
export function locationPack(app, shot) {
  const box = new THREE.Box3();
  let any = false;
  for (const o of app.state.objects) {
    if (o.hidden || o.kind === 'mannequin' || o.role === 'prop' || o.kind === 'plane') continue;
    box.expandByObject(app.groups.get(o.id)); any = true;
  }
  if (!any) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const cs = sampleCam(shot, 0);
  const dir = new THREE.Vector3(cs.target[0] - cs.p[0], 0, cs.target[2] - cs.p[2]).normalize();
  if (dir.lengthSq() < 0.1) dir.set(0, 0, -1);
  const R = Math.max(2.5, Math.max(size.x, size.z) * 0.45);
  const views = [['wide', -35], ['reverse', 180], ['threequarter', 145]];
  const [w, h] = exportSize({ aspect: '16:9' }, '1080p');
  return views.map(([id, deg]) => {
    const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), deg * Math.PI / 180);
    const p = c.clone().sub(d.clone().multiplyScalar(R)); p.y = 1.6;
    const cam = new THREE.PerspectiveCamera(focalToVFov(20, w / h), w / h, 0.05, 500);
    cam.position.copy(p); cam.lookAt(c.x, 1.3, c.z); cam.updateMatrixWorld(true);
    return { id, url: renderStill(app, shot, 0, { size: [w, h], camera: cam, hideCharacters: true }) };
  });
}

// Empty location seen from the shot's own camera: start, middle and end of the move, plus a wider
// pull-back in the same direction for context. These match exactly the background the video needs.
export function shotLocationViews(app, shot) {
  const [w, h] = exportSize(shot, '1080p');
  const views = [];
  const dur = shot.duration;
  for (const [id, t] of [['start', 0], ['mid', dur / 2], ['end', dur]]) {
    views.push({ id, url: renderStill(app, shot, t, { size: [w, h], hideCharacters: true }) });
  }
  const c = sampleCam(shot, 0);
  const p = new THREE.Vector3(...c.p), tg = new THREE.Vector3(...c.target);
  const back = p.clone().sub(tg); back.y = 0;
  const dist = Math.max(8, back.length() * 3.5);
  back.setLength(dist);
  const cam = new THREE.PerspectiveCamera(focalToVFov(24, w / h), w / h, 0.05, 1000);
  cam.position.set(tg.x + back.x, Math.max(p.y, 1.7), tg.z + back.z);
  cam.lookAt(tg.x, Math.max(1.2, tg.y), tg.z); cam.updateMatrixWorld(true);
  views.push({ id: 'wide', url: renderStill(app, shot, 0, { size: [w, h], camera: cam, hideCharacters: true }) });
  app.applyTime(app.time);
  return views;
}
