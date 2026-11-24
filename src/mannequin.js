// Articulated mannequin: a hierarchy of joint groups with simple capsule limbs.
// Facing direction is +Z. Character's left side is +X.
import * as THREE from 'three';

export const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulder_l', 'elbow_l', 'wrist_l',
  'shoulder_r', 'elbow_r', 'wrist_r',
  'hip_l', 'knee_l', 'ankle_l',
  'hip_r', 'knee_r', 'ankle_r',
];

export const JOINT_LABELS = {
  hips: 'Bacino', spine: 'Schiena', chest: 'Petto', neck: 'Collo', head: 'Testa',
  shoulder_l: 'Spalla SX', elbow_l: 'Gomito SX', wrist_l: 'Polso SX',
  shoulder_r: 'Spalla DX', elbow_r: 'Gomito DX', wrist_r: 'Polso DX',
  hip_l: 'Anca SX', knee_l: 'Ginocchio SX', ankle_l: 'Caviglia SX',
  hip_r: 'Anca DX', knee_r: 'Ginocchio DX', ankle_r: 'Caviglia DX',
};

// Poses: joint -> [x, y, z] degrees. `hipsY` = vertical offset of the pelvis (m, at 1.80 m height).
export const POSES = {
  stand: { label: 'In piedi', en: 'standing relaxed', j: { shoulder_l: [0, 0, 8], shoulder_r: [0, 0, -8] } },
  tpose: { label: 'T-pose', en: 'arms spread wide', j: { shoulder_l: [0, 0, 88], shoulder_r: [0, 0, -88] } },
  walk: {
    label: 'Camminata', en: 'walking',
    j: { hip_l: [-25, 0, 0], knee_l: [12, 0, 0], hip_r: [20, 0, 0], knee_r: [28, 0, 0], ankle_r: [-10, 0, 0],
      shoulder_l: [22, 0, 6], shoulder_r: [-22, 0, -6], elbow_l: [-15, 0, 0], elbow_r: [-25, 0, 0] },
  },
  run: {
    label: 'Corsa', en: 'running',
    j: { spine: [12, 0, 0], hip_l: [-62, 0, 0], knee_l: [75, 0, 0], hip_r: [30, 0, 0], knee_r: [65, 0, 0],
      shoulder_l: [45, 0, 8], elbow_l: [-95, 0, 0], shoulder_r: [-55, 0, -8], elbow_r: [-90, 0, 0] },
    hipsY: -0.04,
  },
  sit: {
    label: 'Seduto', en: 'sitting',
    j: { hip_l: [-90, 0, 4], hip_r: [-90, 0, -4], knee_l: [90, 0, 0], knee_r: [90, 0, 0],
      shoulder_l: [-15, 0, 6], shoulder_r: [-15, 0, -6], elbow_l: [-45, 0, 0], elbow_r: [-45, 0, 0] },
    hipsY: -0.45,
  },
  kneel: {
    label: 'In ginocchio', en: 'kneeling on the right knee',
    j: { hip_l: [-90, 0, 0], knee_l: [90, 0, 0], hip_r: [0, 0, 0], knee_r: [90, 0, 0], ankle_r: [40, 0, 0],
      shoulder_l: [0, 0, 8], shoulder_r: [0, 0, -8] },
    hipsY: -0.45,
  },
  crouch: {
    label: 'Accovacciato', en: 'crouching low',
    j: { spine: [25, 0, 0], hip_l: [-110, 0, 8], hip_r: [-110, 0, -8], knee_l: [130, 0, 0], knee_r: [130, 0, 0],
      ankle_l: [-20, 0, 0], ankle_r: [-20, 0, 0], shoulder_l: [-40, 0, 10], shoulder_r: [-40, 0, -10],
      elbow_l: [-30, 0, 0], elbow_r: [-30, 0, 0] },
    hipsY: -0.5,
  },
  point: {
    label: 'Indica', en: 'pointing forward with the right arm',
    j: { shoulder_r: [-88, 0, -5], shoulder_l: [0, 0, 8], head: [0, -5, 0] },
  },
  reach: {
    label: 'Afferra', en: 'reaching forward with both hands',
    j: { spine: [10, 0, 0], shoulder_l: [-70, 0, 4], shoulder_r: [-70, 0, -4], elbow_l: [-20, 0, 0], elbow_r: [-20, 0, 0] },
  },
  armscross: {
    label: 'Braccia conserte', en: 'arms crossed',
    j: { shoulder_l: [-30, -10, 28], elbow_l: [-115, 0, -50], shoulder_r: [-30, 10, -28], elbow_r: [-115, 0, 50] },
  },
  handsup: {
    label: 'Mani in alto', en: 'hands raised above the head',
    j: { shoulder_l: [0, 0, 160], shoulder_r: [0, 0, -160], elbow_l: [0, 0, 15], elbow_r: [0, 0, -15] },
  },
  phone: {
    label: 'Al telefono', en: 'holding a phone to the right ear',
    j: { shoulder_r: [-25, 0, -35], elbow_r: [-140, 0, 0], head: [0, 0, -6], shoulder_l: [0, 0, 8] },
  },
  wave: {
    label: 'Saluta', en: 'waving with the right hand',
    j: { shoulder_r: [0, 0, -135], elbow_r: [0, 0, -40], shoulder_l: [0, 0, 8] },
  },
  look: {
    label: 'Guarda di lato', en: 'turning the head to look aside',
    j: { head: [0, 55, 0], neck: [0, 15, 0], shoulder_l: [0, 0, 8], shoulder_r: [0, 0, -8] },
  },
  fight: {
    label: 'Guardia', en: 'in a fighting guard stance',
    j: { spine: [10, 0, 0], hip_l: [-25, 0, 8], knee_l: [25, 0, 0], hip_r: [15, 0, -8], knee_r: [20, 0, 0],
      shoulder_l: [-55, 0, 20], elbow_l: [-110, 0, 0], shoulder_r: [-45, 0, -20], elbow_r: [-120, 0, 0] },
    hipsY: -0.05,
  },
  dance: {
    label: 'Ballo', en: 'dancing with arms up',
    j: { spine: [0, 0, 8], hip_l: [-15, 0, 10], knee_l: [25, 0, 0], shoulder_l: [0, 0, 130], elbow_l: [0, 0, 40],
      shoulder_r: [-30, 0, -60], elbow_r: [-70, 0, 0], head: [0, 0, 10] },
  },
};

// Body dimensions at 1.80 m.
const D = {
  hipsY: 0.95, spine: 0.12, chest: 0.2, neck: 0.2, head: 0.07,
  shoulderX: 0.19, shoulderY: 0.16, upperArm: 0.29, foreArm: 0.26,
  hipX: 0.095, hipY: -0.05, thigh: 0.43, shin: 0.42,
};

function limb(len, r, mat, joint) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 4, 10);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.joint = joint;
  return m;
}

export function buildMannequin(color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.7 });
  const root = new THREE.Group();
  const J = {};
  const mk = (name, parent, x, y, z) => {
    const g = new THREE.Group();
    g.name = name; g.position.set(x, y, z); g.userData.jointName = name;
    parent.add(g); J[name] = g; return g;
  };

  const hips = mk('hips', root, 0, D.hipsY, 0);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.18), mat);
  pelvis.position.y = 0.0; pelvis.userData.joint = 'hips'; pelvis.castShadow = true; hips.add(pelvis);

  const spine = mk('spine', hips, 0, D.spine * 0.4, 0);
  const abdomen = limb(D.spine + 0.06, 0.11, mat, 'spine'); abdomen.rotation.x = Math.PI; abdomen.position.y = -0.02; spine.add(abdomen);

  const chest = mk('chest', spine, 0, D.spine, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.2), mat);
  torso.position.y = 0.13; torso.userData.joint = 'chest'; torso.castShadow = true; chest.add(torso);

  const neck = mk('neck', chest, 0, D.chest + 0.06, 0);
  const neckM = limb(0.1, 0.045, mat, 'neck'); neckM.rotation.x = Math.PI; neck.add(neckM);

  const head = mk('head', neck, 0, D.head, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), mat);
  skull.scale.set(0.9, 1.1, 1.0); skull.position.y = 0.09; skull.userData.joint = 'head'; skull.castShadow = true; head.add(skull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 8), darkMat);
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.08, 0.11); nose.userData.joint = 'head'; head.add(nose);

  for (const side of ['l', 'r']) {
    const s = side === 'l' ? 1 : -1;
    const sh = mk('shoulder_' + side, chest, s * D.shoulderX, D.shoulderY + 0.08, 0);
    sh.add(limb(D.upperArm, 0.05, mat, 'shoulder_' + side));
    const el = mk('elbow_' + side, sh, 0, -D.upperArm, 0);
    el.add(limb(D.foreArm, 0.042, mat, 'elbow_' + side));
    const wr = mk('wrist_' + side, el, 0, -D.foreArm, 0);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.09), darkMat);
    hand.position.y = -0.08; hand.userData.joint = 'wrist_' + side; hand.castShadow = true; wr.add(hand);

    const hp = mk('hip_' + side, hips, s * D.hipX, D.hipY, 0);
    hp.add(limb(D.thigh, 0.07, mat, 'hip_' + side));
    const kn = mk('knee_' + side, hp, 0, -D.thigh, 0);
    kn.add(limb(D.shin, 0.055, mat, 'knee_' + side));
    const an = mk('ankle_' + side, kn, 0, -D.shin, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), darkMat);
    foot.position.set(0, -0.035, 0.06); foot.userData.joint = 'ankle_' + side; foot.castShadow = true; an.add(foot);
  }

  root.userData.joints = J;
  root.userData.materials = [mat, darkMat];
  return root;
}

export function setMannequinColor(root, color) {
  const [m, d] = root.userData.materials;
  m.color.set(color);
  d.color.set(color).multiplyScalar(0.55);
}

const D2R = Math.PI / 180;
export function applyPose(root, pose) {
  const J = root.userData.joints;
  for (const name of JOINTS) {
    const v = (pose && pose.j && pose.j[name]) || [0, 0, 0];
    J[name].rotation.set(v[0] * D2R, v[1] * D2R, v[2] * D2R);
  }
  J.hips.position.y = D.hipsY + ((pose && pose.hipsY) || 0);
}

export function readPose(root) {
  const J = root.userData.joints;
  const j = {};
  for (const name of JOINTS) {
    const r = J[name].rotation;
    if (Math.abs(r.x) + Math.abs(r.y) + Math.abs(r.z) > 1e-5) j[name] = [r.x / D2R, r.y / D2R, r.z / D2R];
  }
  return { j, hipsY: J.hips.position.y - D.hipsY };
}

export function clonePose(p) {
  return JSON.parse(JSON.stringify(p || { j: {}, hipsY: 0 }));
}

export function lerpPose(a, b, t) {
  const out = { j: {}, hipsY: (a.hipsY || 0) * (1 - t) + (b.hipsY || 0) * t };
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), e = new THREE.Euler();
  for (const name of JOINTS) {
    const va = (a.j && a.j[name]) || [0, 0, 0];
    const vb = (b.j && b.j[name]) || [0, 0, 0];
    qa.setFromEuler(e.set(va[0] * D2R, va[1] * D2R, va[2] * D2R));
    qb.setFromEuler(e.set(vb[0] * D2R, vb[1] * D2R, vb[2] * D2R));
    qa.slerp(qb, t);
    e.setFromQuaternion(qa);
    out.j[name] = [e.x / D2R, e.y / D2R, e.z / D2R];
  }
  return out;
}

// Name a pose for the prompt if it matches a preset closely.
export function describePose(p) {
  let best = null, bestErr = Infinity;
  for (const [key, preset] of Object.entries(POSES)) {
    let err = Math.abs((p.hipsY || 0) - (preset.hipsY || 0)) * 200;
    for (const name of JOINTS) {
      const a = (p.j && p.j[name]) || [0, 0, 0];
      const b = preset.j[name] || [0, 0, 0];
      err += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    }
    if (err < bestErr) { bestErr = err; best = key; }
  }
  return bestErr < 60 ? POSES[best].en : 'in a custom pose';
}
