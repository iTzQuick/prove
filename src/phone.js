// Guided phone interface: five steps, each showing only what that step needs.
// 1 Ambiente · 2 Attori · 3 Camera · 4 Azione · 5 Prompt
import * as THREE from 'three';
import { POSES, JOINT_LABELS } from './mannequin.js';
import { CATALOG } from './objects.js';
import { ASPECTS, focalToVFov } from './anim.js';
import { MODELS, getBeats, cameraMove } from './prompt.js';

const D2R = Math.PI / 180;
const $ = (s) => document.querySelector(s);

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

const STEPS = [
  { id: 'set', n: 1, label: 'Ambiente', help: 'Aggiungi pareti e arredi. Tocca un oggetto nella scena per selezionarlo, poi trascina le frecce.' },
  { id: 'cast', n: 2, label: 'Attori', help: 'Aggiungi i personaggi, scegli la posa e collegali ai tuoi Element.' },
  { id: 'cam', n: 3, label: 'Camera', help: 'Scegli inquadratura e movimento. Con le dita: un dito ruota, due dita avvicinano.' },
  { id: 'act', n: 4, label: 'Azione', help: 'Porta il cursore al secondo giusto, sposta il personaggio e premi “Segna posizione”.' },
  { id: 'out', n: 5, label: 'Prompt', help: 'Scegli il modello e prendi prompt e file per Higgsfield.' },
];

const SET_ITEMS = ['wall', 'doorway', 'window', 'table', 'chair', 'sofa', 'bed', 'stairs', 'column', 'lamp', 'tree', 'car', 'plane', 'cube', 'cylinder', 'sphere', 'case', 'bottle', 'phone'];
const SHOT_SIZES = [
  { id: 'wide', label: 'Campo lungo', ratio: 0.33, aim: 0.55 },
  { id: 'full', label: 'Figura intera', ratio: 0.85, aim: 0.55 },
  { id: 'medium', label: 'Piano medio', ratio: 2.0, aim: 0.8 },
  { id: 'close', label: 'Primo piano', ratio: 4.2, aim: 0.92 },
];
const MOVES = [
  { id: 'static', label: 'Ferma', rig: 'tripod' },
  { id: 'push', label: 'Avvicina', rig: 'dolly' },
  { id: 'pull', label: 'Allontana', rig: 'dolly' },
  { id: 'left', label: '← Laterale', rig: 'slider' },
  { id: 'right', label: 'Laterale →', rig: 'slider' },
  { id: 'orbit', label: 'Gira attorno', rig: 'gimbal' },
  { id: 'crane', label: 'Sale (gru)', rig: 'crane' },
  { id: 'handheld', label: 'A mano', rig: 'handheld' },
];

export function initPhone(api) {
  const { app } = api;
  let step = 'set';
  const header = $('#phoneHeader'), panel = $('#phonePanel'), bar = $('#stepbar'), sheet = $('#phoneSheet');

  // ------------------------------------------------------------ header
  function renderHeader() {
    const sh = api.shot();
    header.replaceChildren(
      el('button', { class: 'ph-icon', title: 'Annulla', onclick: () => api.undo() }, '↶'),
      el('button', { class: 'ph-shot', onclick: openShotSheet }, el('b', {}, sh.id), el('span', {}, ` · ${sh.duration}s · ${sh.aspect} ▾`)),
      el('button', { class: 'ph-icon', title: 'Menu', onclick: openMenu }, '⋯'),
    );
  }

  // ------------------------------------------------------------ action sheet
  function openSheet(title, items) {
    sheet.replaceChildren(el('div', { class: 'ph-sheet-card' },
      el('div', { class: 'ph-sheet-title' }, title),
      ...items.map(it => it === '-' ? el('hr') : el('button', {
        class: 'ph-sheet-item' + (it.active ? ' active' : '') + (it.danger ? ' danger' : ''),
        onclick: () => { closeSheet(); it.run(); },
      }, it.label, it.note ? el('span', { class: 'note' }, it.note) : null)),
      el('button', { class: 'ph-sheet-item cancel', onclick: closeSheet }, 'Annulla')));
    sheet.classList.remove('hidden');
  }
  function closeSheet() { sheet.classList.add('hidden'); }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  function openShotSheet() {
    const S = api.S();
    openSheet('Shot', [
      ...S.shots.map((s, i) => ({ label: `${s.id}`, note: `${s.duration}s · ${MODELS[s.model].label}`, active: i === S.current, run: () => api.switchShot(i) })),
      '-',
      { label: '＋ Nuovo shot (parte da qui)', run: () => api.addShot(false) },
      { label: '⧉ Duplica questo shot', run: () => api.addShot(true) },
      ...(S.shots.length > 1 ? [{ label: 'Elimina questo shot', danger: true, run: () => api.deleteShot(S.current) }] : []),
    ]);
  }

  function openMenu() {
    openSheet('Menu', [
      { label: '↷ Ripeti', run: () => api.undo(true) },
      { label: 'Impostazioni progetto e location', run: () => api.openLeft() },
      '-',
      { label: 'Salva progetto', run: () => api.fileAction('save') },
      { label: 'Apri progetto…', run: () => api.fileAction('open') },
      { label: 'Importa libreria Elements…', run: () => api.fileAction('lib') },
      { label: 'Carica scena demo', run: () => api.fileAction('demo') },
      { label: 'Carica arena (mappa)', run: () => api.fileAction('arena') },
      { label: 'Nuovo progetto', danger: true, run: () => api.fileAction('new') },
      '-',
      { label: 'Versione completa (desktop)', note: 'tutti i comandi', run: () => { location.search = '?layout=desktop'; } },
      { label: 'Ricarica l\'app', note: 'versione ' + (document.querySelector('meta[name=app-version]')?.content || '?'), run: () => location.reload() },
    ]);
  }

  // ------------------------------------------------------------ step bar
  function renderBar() {
    bar.replaceChildren(...STEPS.map(s => el('button', { class: s.id === step ? 'active' : '', onclick: () => go(s.id) },
      el('span', { class: 'num' }, String(s.n)), el('span', { class: 'lab' }, s.label))));
  }

  function go(id) {
    step = id;
    api.closeSheets();
    // Camera step looks through the shot camera; every other step uses the free view to move things around.
    if (id === 'cam') { api.setView('shot'); api.setTime(0); }
    else if (api.app.viewMode === 'shot') api.setView('free');
    if (id !== 'cast' && app.poseMode) api.setPoseMode(false);
    if (id === 'out' || id === 'cam') api.setTool('translate');
    document.body.dataset.step = id;
    renderBar(); render(true);
    api.resize();
  }

  // ------------------------------------------------------------ helpers
  const big = (label, onclick, cls = '') => el('button', { class: 'ph-btn ' + cls, onclick }, label);
  const section = (title, ...kids) => el('div', { class: 'ph-sec' }, title ? el('div', { class: 'ph-sec-title' }, title) : null, ...kids);
  const seg = (items, active, onpick) => el('div', { class: 'ph-seg' }, ...items.map(([v, l]) => el('button', { class: v === active ? 'active' : '', onclick: () => onpick(v) }, l)));

  function characters() { return api.S().objects.filter(o => o.kind === 'mannequin' && !o.hidden); }

  function charChips(onlyChars = true) {
    const sel = api.selObj();
    const list = onlyChars ? characters() : api.S().objects.filter(o => !o.hidden && (o.kind === 'mannequin' || o.role === 'prop'));
    return el('div', { class: 'ph-chips' },
      ...list.map(o => el('button', { class: 'ph-chip' + (sel && sel.id === o.id ? ' active' : ''), onclick: () => api.select(o.id) },
        el('span', { class: 'dot', style: `background:${o.color}` }), o.name)),
    );
  }

  function moveRotateRow(o) {
    return seg([['translate', '✥ Sposta'], ['rotate', '⟳ Ruota']], app.poseMode ? '' : app.tool, (v) => { if (app.poseMode) api.setPoseMode(false); api.setTool(v); render(true); });
  }

  // Up/down (the vertical axis: Z in Blender, Y here). Finger-friendly steps instead of a thin arrow.
  function heightRow(o) {
    const y = api.sampleObject(o, api.shot(), app.time).p[1];
    const nudge = (d) => { api.setHeight(o, y + d); render(true); };
    return el('div', { class: 'ph-height' },
      el('div', { class: 'ph-height-top' },
        el('span', {}, 'Altezza da terra'), el('b', { id: 'phHeight' }, `${y.toFixed(2)} m`),
        big('Appoggia a terra', () => { api.setHeight(o, 0); render(true); }, 'mini-text')),
      el('div', { class: 'ph-row' },
        big('▼ 1 m', () => nudge(-1)), big('▼ 10 cm', () => nudge(-0.1)),
        big('▲ 10 cm', () => nudge(0.1)), big('▲ 1 m', () => nudge(1))),
      el('div', { class: 'ph-hint dim' }, 'Puoi anche trascinare la freccia verde verticale nella scena.'));
  }

  // ------------------------------------------------------------ step: set
  function stepSet() {
    const o = api.selObj();
    const out = [];
    if (o && o.kind !== 'mannequin') {
      out.push(section(`Selezionato: ${o.name}`,
        moveRotateRow(o),
        heightRow(o),
        el('div', { class: 'ph-row' },
          big('⧉ Duplica', api.duplicateSelected), big('Dettagli', () => api.openDetails('obj')),
          big('Elimina', api.deleteSelected, 'danger'), big('Fatto', () => api.select(null), 'primary'))));
    }
    out.push(section('Aggiungi', el('div', { class: 'ph-grid' },
      ...SET_ITEMS.map(k => big(CATALOG[k].label, () => api.addObject(k))))));
    return out;
  }

  // ------------------------------------------------------------ step: cast
  function stepCast() {
    const o = api.selObj();
    const out = [section(null, el('div', { class: 'ph-row' }, charChips(), big('＋ Personaggio', () => api.addObject('mannequin'), 'primary nogrow')))];
    if (!characters().length) { out.push(el('div', { class: 'ph-empty' }, 'Nessun personaggio. Tocca “＋ Personaggio”.')); return out; }
    if (!o || o.kind !== 'mannequin') { out.push(el('div', { class: 'ph-empty' }, 'Tocca un personaggio qui sopra o nella scena.')); return out; }
    out.push(section('Element Higgsfield',
      big(o.tag ? `${o.tag}  ›` : 'Collega un Element  ›', () => api.openDetails('obj'), 'wide' + (o.tag ? '' : ' primary'))));
    out.push(section('Posa', el('div', { class: 'ph-scroll' },
      ...Object.entries(POSES).map(([k, p]) => big(p.label, () => api.applyPose(o, p))))));
    out.push(section('Muovi',
      seg([['translate', '✥ Sposta'], ['rotate', '⟳ Ruota'], ['pose', '🦴 Braccia e gambe']], app.poseMode ? 'pose' : app.tool, (v) => {
        if (v === 'pose') api.setPoseMode(true); else { if (app.poseMode) api.setPoseMode(false); api.setTool(v); }
        render(true);
      }),
      app.poseMode ? el('div', { class: 'ph-hint' }, app.selJoint ? `Stai ruotando: ${JOINT_LABELS[app.selJoint]}. Tocca un altro arto per cambiarlo.` : 'Tocca un braccio, una gamba o la testa del manichino.') : null,
      app.poseMode ? null : heightRow(o),
      el('div', { class: 'ph-row' }, big('⧉ Duplica', api.duplicateSelected), big('Elimina', api.deleteSelected, 'danger'))));
    return out;
  }

  // ------------------------------------------------------------ step: camera
  function subject() {
    const o = api.selObj();
    if (o && o.kind === 'mannequin') return o;
    return characters()[0] || null;
  }

  function frame(size) {
    const o = subject();
    if (!o) { api.toast('Aggiungi prima un personaggio'); return; }
    api.pushUndo();
    const sh = api.shot();
    const s = api.sampleObject(o, sh, 0);
    const h = (o.height || 1.8) * s.s[1];
    const top = h + ((s.pose && s.pose.hipsY) || 0) * h / 1.8;
    const start = startCam(sh);
    let dir = new THREE.Vector3(start.p[0] - s.p[0], 0, start.p[2] - s.p[2]);
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(s.r[1] * D2R), 0, Math.cos(s.r[1] * D2R));
    dir.normalize();
    const vfov = focalToVFov(start.focal, ASPECTS[sh.aspect] || 16 / 9) * D2R;
    const d = (top / size.ratio) / (2 * Math.tan(vfov / 2));
    const aimY = s.p[1] + top * size.aim;
    const camY = size.ratio < 1 ? Math.max(1.4, aimY) : aimY;
    const target = [s.p[0], +aimY.toFixed(3), s.p[2]];
    const p = [s.p[0] + dir.x * d, +camY.toFixed(3), s.p[2] + dir.z * d];
    sh.frameSize = size.id;
    setStartAndMove(sh, { p, target, focal: start.focal });
  }

  function startCam(sh) {
    const k = sh.camKeys && sh.camKeys[0];
    const c = k || sh.camBase;
    return { p: c.p.slice(), target: c.target.slice(), focal: c.focal };
  }

  function endFor(kind, a, dur) {
    const p = new THREE.Vector3(...a.p), t = new THREE.Vector3(...a.target);
    const fwd = t.clone().sub(p); const dist = fwd.length(); fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const e = { p: p.clone(), target: t.clone(), focal: a.focal };
    const step = Math.min(2.5, Math.max(0.6, dist * 0.35));
    if (kind === 'push') e.p.add(fwd.clone().multiplyScalar(step));
    if (kind === 'pull') e.p.add(fwd.clone().multiplyScalar(-step));
    if (kind === 'left' || kind === 'right') { const v = right.clone().multiplyScalar(kind === 'left' ? -1.5 : 1.5); e.p.add(v); e.target.add(v); }
    if (kind === 'orbit') { const off = p.clone().sub(t).applyAxisAngle(new THREE.Vector3(0, 1, 0), 40 * D2R); e.p.copy(t).add(off); }
    if (kind === 'crane') e.p.y += 1.5;
    void dur;
    return { p: e.p.toArray().map(v => +v.toFixed(3)), target: e.target.toArray().map(v => +v.toFixed(3)), focal: a.focal };
  }

  function setStartAndMove(sh, start) {
    const kind = sh.move || 'static';
    if (kind === 'static' || kind === 'handheld') { sh.camKeys = []; sh.camBase = start; }
    else sh.camKeys = [{ t: 0, ...start }, { t: sh.duration, ...endFor(kind, start, sh.duration) }];
    api.changed(); render(true);
  }

  function setMove(m) {
    api.pushUndo();
    const sh = api.shot();
    sh.move = m.id; sh.rig = m.rig;
    if (sh.model && m.id !== 'static' && sh.panel && sh.panel.tempo !== 'Single shot') sh.panel.tempo = 'Single shot';
    setStartAndMove(sh, startCam(sh));
    api.setTime(0);
    if (m.id !== 'static' && m.id !== 'handheld') { api.togglePlay(true); }
  }

  function currentMove(sh) {
    if (sh.move) return sh.move;
    if (!sh.camKeys.length) return sh.rig === 'handheld' ? 'handheld' : 'static';
    const k = cameraMove(sh, 0, sh.duration).kind;
    return { push: 'push', pull: 'pull', orbit: 'orbit', 'crane-up': 'crane' }[k] || '';
  }

  function stepCam() {
    const sh = api.shot();
    const c = startCam(sh);
    const subj = subject();
    const focal = el('input', { type: 'range', min: 14, max: 135, step: 1, value: Math.round(c.focal), class: 'ph-range' });
    const fl = el('b', {}, Math.round(c.focal) + 'mm');
    focal.addEventListener('pointerdown', () => api.pushUndo());
    focal.addEventListener('input', () => {
      fl.textContent = focal.value + 'mm';
      const s = startCam(sh); s.focal = +focal.value;
      if (sh.camKeys.length) sh.camKeys.forEach(k => { k.focal = +focal.value; }); else sh.camBase.focal = +focal.value;
      api.changed();
    });
    const lensWord = (f) => f < 24 ? 'grandangolo spinto' : f < 35 ? 'grandangolo' : f < 60 ? 'normale' : 'teleobiettivo';
    return [
      section(`Inquadratura${subj ? ' su ' + subj.name : ''}`,
        characters().length > 1 ? charChips() : null,
        el('div', { class: 'ph-grid four' }, ...SHOT_SIZES.map(s => big(s.label, () => frame(s), sh.frameSize === s.id ? 'active' : '')))),
      section('Movimento della camera',
        el('div', { class: 'ph-grid four' }, ...MOVES.map(m => big(m.label, () => setMove(m), currentMove(sh) === m.id ? 'active' : '')))),
      section('Obiettivo',
        el('div', { class: 'ph-lens' }, focal, el('span', {}, fl, el('small', {}, ' ' + lensWord(c.focal))))),
      section('Formato',
        seg(Object.keys(ASPECTS).filter(a => ['16:9', '9:16', '21:9', '1:1'].includes(a)).map(a => [a, a]), sh.aspect, (v) => {
          api.pushUndo(); sh.aspect = v; api.changed(); api.resize(); render(true); renderHeader();
        })),
    ];
  }

  // ------------------------------------------------------------ step: action
  function setDur(sh, d) {
    const m = MODELS[sh.model];
    d = Math.max(m.min, Math.min(m.max, d));
    if (d === sh.duration) { api.toast(`${m.label}: da ${m.min} a ${m.max} secondi`); return; }
    api.pushUndo();
    sh.duration = d;
    if (sh.camKeys.length === 2 && sh.move && !['static', 'handheld'].includes(sh.move)) sh.camKeys[1].t = d; // camera move spans the whole shot
    if (app.time > d) api.setTime(d);
    api.changed(); render(true);
  }

  function stepAct() {
    const sh = api.shot();
    const o = api.selObj();
    const scrub = el('input', { type: 'range', min: 0, max: sh.duration, step: 0.1, value: app.time, class: 'ph-range', id: 'phScrub' });
    scrub.addEventListener('input', () => api.setTime(+scrub.value));
    const keys = o ? (sh.tracks[o.id] || []) : [];
    const beats = getBeats(api.S(), sh);
    return [
      section(null,
        el('div', { class: 'ph-play' },
          big(app.playing ? '❚❚' : '▶', () => { api.togglePlay(); render(true); }, 'round primary'),
          el('div', { class: 'ph-time' }, el('b', { id: 'phTime' }, app.time.toFixed(1) + ' s'), el('span', {}, ` di ${sh.duration} s`)),
          el('div', { class: 'ph-dur' },
            big('−', () => setDur(sh, sh.duration - 1), 'mini'),
            el('span', {}, 'durata'),
            big('＋', () => setDur(sh, sh.duration + 1), 'mini'))),
        el('div', { class: 'ph-scrubwrap' }, scrub, el('div', { class: 'ph-marks' },
          ...keys.map(k => el('span', { style: `left:${(k.t / sh.duration) * 100}%` }))))),
      section('Chi si muove', charChips(false)),
      o ? section(null,
        el('div', { class: 'ph-row' },
          Object.assign(big(`◆ Segna posizione a ${app.time.toFixed(1)} s`, () => { api.keyObject(); render(true); }, 'primary'), { id: 'phKeyBtn' }),
          keys.length ? big('Togli segno', () => { api.deleteKey(); render(true); }) : null),
        el('div', { class: 'ph-hint' }, keys.length
          ? `${o.name} ha ${keys.length} ${keys.length === 1 ? 'segno' : 'segni'}. Sposta il cursore, muovilo nella scena: il segno si aggiorna da solo.`
          : `Metti ${o.name} nella posizione iniziale e premi “Segna”. Poi vai avanti nel tempo, spostalo e segna di nuovo.`)) : el('div', { class: 'ph-empty' }, 'Scegli chi si muove.'),
      section('Cosa succede (va nel prompt)',
        el('div', { class: 'ph-beats' }, ...beats.map(b => el('div', { class: 'ph-beat', onclick: () => api.setTime(b.t0) }, el('b', {}, `${b.t0}-${b.t1}s`), ' ', b.text))),
        big('Modifica i testi', () => api.openDetails('beats'), 'wide')),
    ];
  }

  // ------------------------------------------------------------ step: output
  function stepOut() {
    const sh = api.shot();
    const card = (title, desc, onclick, cls = '') => el('button', { class: 'ph-card ' + cls, onclick }, el('b', {}, title), el('span', {}, desc));
    return [
      section('Modello',
        seg([['cs4', 'Cinema Studio 4'], ['seedance_2_5', 'Seedance 2.5'], ['kling4', 'Kling 4'], ['veo31', 'Veo 3.1']], sh.model, (v) => {
          api.pushUndo(); const m = MODELS[v]; sh.model = v;
          sh.duration = Math.max(m.min, Math.min(m.max, sh.duration));
          if (!m.res.includes(sh.resolution)) sh.resolution = m.res[m.res.length - 1];
          api.changed(); render(true); renderHeader();
        })),
      section('Prompt',
        card('Prompt video', 'Il testo da incollare in Higgsfield', () => api.openPrompt('video'), 'primary'),
        card('Primo frame (keyframe)', 'Trasforma il blockout in immagine reale', () => api.openPrompt('keyframe')),
        card('Connettore Higgsfield', 'Richieste pronte per Claude', () => api.openPrompt('higgsfield')),
        card('Elementi', 'Sheet di personaggi e oggetti', () => api.openPrompt('elements'))),
      section('File da salvare',
        el('div', { class: 'ph-grid' },
          big('Primo frame', () => api.doExport('still-start')),
          big('Ultimo frame', () => api.doExport('still-end')),
          big('Video blocking', () => api.doExport('video')),
          big('Location vuota', () => api.doExport('locpack')))),
    ];
  }

  // ------------------------------------------------------------ render
  let lastKey = '';
  function render(force) {
    if (!document.body.classList.contains('m')) return;
    const active = document.activeElement;
    if (!force && active && panel.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
    const o = api.selObj();
    const key = [step, o && o.id, app.tool, app.poseMode, app.selJoint, api.S().current].join('|');
    const keepScroll = key === lastKey ? panel.scrollTop : 0;
    lastKey = key;
    const s = STEPS.find(x => x.id === step);
    const body = { set: stepSet, cast: stepCast, cam: stepCam, act: stepAct, out: stepOut }[step]();
    panel.replaceChildren(el('div', { class: 'ph-help' }, s.help), ...body);
    panel.scrollTop = keepScroll;
    renderHeader();
  }

  function onTime() {
    const t = $('#phTime'); if (t) t.textContent = app.time.toFixed(1) + ' s';
    const sc = $('#phScrub'); if (sc && document.activeElement !== sc) sc.value = app.time;
    const kb = $('#phKeyBtn'); if (kb) kb.textContent = `◆ Segna posizione a ${app.time.toFixed(1)} s`;
  }

  // Selecting in the viewport moves you to the step that fits the object.
  function onSelect() {
    const o = api.selObj();
    if (o && step === 'set' && o.kind === 'mannequin') { go('cast'); return; }
    if (o && step === 'cast' && o.kind !== 'mannequin') { go('set'); return; }
    render(true);
  }

  // Camera dragged with fingers: keep the chosen movement, rebuilt from the new start.
  function camEdited() {
    const sh = api.shot();
    if (sh.camKeys.length === 2 && sh.move && !['static', 'handheld'].includes(sh.move)) {
      sh.camKeys[1] = { t: sh.duration, ...endFor(sh.move, sh.camKeys[0], sh.duration) };
      api.changed();
    }
    sh.frameSize = null;
    render(true);
  }

  renderBar();
  document.body.dataset.step = step;
  app.phone = { refresh: () => render(false), onTime, onSelect, camEdited, go, rerender: () => render(true) };
  return app.phone;
}
