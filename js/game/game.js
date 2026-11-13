// Hoops 27 game: builds the 3D arena + players, runs the engine at a fixed 60 Hz, renders, and drives HUD/audio.
// Public API (used by the menus):  preloadGame(onProgress) / startGame(opts) -> Promise<result>
import * as THREE from '../lib/three.min.js';
import { loadAthletes, Athlete, uniformFor } from './athlete.js';
import { buildArena } from './arena.js';
import { BroadcastCam } from './camera.js';
import { Input } from './input.js';
import { Hud, shortName } from './hud.js';
import { createGame, step, greenW, contestOf, holder } from './engine.js';
import { CT } from './court.js';
import { Settings, saveSettings } from '../settings.js';
import { pbpFor } from './pbp.js';

let Audio = { init() {}, play() {}, crowd() {}, stopAll() {} };
import('../audio.js').then(m => { if (m && m.Audio) Audio = m.Audio; }).catch(() => {});

let preloadP = null;
export function preloadGame(onProgress) {
  if (!preloadP) preloadP = Promise.all([loadAthletes(onProgress), document.fonts ? document.fonts.ready : null]);
  return preloadP;
}

const isPhone = () => matchMedia('(pointer: coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent);

function ballTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#d8692a'); g.addColorStop(0.5, '#e07a35'); g.addColorStop(1, '#c55c22'); x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  // pebble grain
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '90,35,10' : '255,190,140'},${0.08 + Math.random() * 0.08})`; x.fillRect(Math.random() * 512, Math.random() * 256, 1.5, 1.5); }
  x.strokeStyle = '#1b130e'; x.lineWidth = 5;
  x.beginPath(); x.moveTo(0, 128); x.lineTo(512, 128); x.stroke();
  for (const u of [128, 384]) { x.beginPath(); x.moveTo(u, 0); x.lineTo(u, 256); x.stroke(); }
  for (const u of [0, 256]) { x.beginPath(); for (let v = 0; v <= 256; v += 4) { const t = v / 256; const xx = u + 128 + Math.sin(t * Math.PI) * 70 * (u ? 1 : -1) * 0 + (u ? 1 : -1) * Math.sin(t * Math.PI) * 64; if (v === 0) x.moveTo(xx, v); else x.lineTo(xx, v); } x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export async function startGame(opts) {
  const container = opts.container || document.body;
  container.innerHTML = ''; container.classList.add('h27-game-on');
  const wrap = document.createElement('div'); wrap.className = 'h27-wrap'; container.appendChild(wrap);
  const loading = document.createElement('div'); loading.className = 'h27-loading'; loading.innerHTML = '<div class="ld-t">LOADING</div><div class="ld-bar"><i></i></div>'; wrap.appendChild(loading);
  const ldBar = loading.querySelector('i');
  await preloadGame((f) => { ldBar.style.width = Math.round(f * 70) + '%'; });
  const phone = isPhone();
  const fast = Settings.gfx === 'fast' || (Settings.gfx === 'auto' && phone);
  // renderer
  const canvas = document.createElement('canvas'); canvas.className = 'h27-canvas'; wrap.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !fast || devicePixelRatio < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, fast ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0a0b0e'); scene.fog = new THREE.Fog('#0a0b0e', 40, 95);
  const cam = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 200);
  // environment for glossy floor / rim reflections
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); envScene.background = new THREE.Color('#2a2420');
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 18), new THREE.MeshBasicMaterial({ color: '#fff8ee' })); lamp.position.y = 12; envScene.add(lamp);
  scene.environment = pm.fromScene(envScene, 0.04).texture; scene.environmentIntensity = 0.35;
  // teams + uniforms
  const homeT = opts.home.team, awayT = opts.away.team;
  let uh = (opts.uniforms && opts.uniforms.home) || 'home', ua = (opts.uniforms && opts.uniforms.away) || 'away';
  if (uh === ua) ua = uh === 'home' ? 'away' : 'home';
  const U = [uniformFor(homeT, uh), uniformFor(awayT, ua)];
  ldBar.style.width = '78%';
  const arena = await buildArena(scene, homeT, awayT, { fast, aniso: renderer.capabilities.getMaxAnisotropy() });
  ldBar.style.width = '90%';
  // engine
  const G = createGame({ home: opts.home, away: opts.away, user: opts.user || 'home', format: opts.format || '5v5', qLen: opts.qLen || Settings.qLen || 3, diff: opts.diff ?? Settings.diff ?? 2, meter: Settings.meter !== false });
  // athletes (built on demand when a player checks in)
  const avatars = new Map();
  const avatarFor = (P) => {
    let a = avatars.get(P); if (a) return a;
    const look = window.NBA_LOOKS && window.NBA_LOOKS[P.id];
    a = new Athlete(P, P.T.team, U[P.ti], { tone: look ? look[0] : 4 });
    if (look && look[1]) a.body.material.userData.u.uBeard.value = 0.85;
    avatars.set(P, a); scene.add(a.root); return a;
  };
  for (const T of G.teams) for (const P of T.on) avatarFor(P);
  // ball
  const ball = new THREE.Mesh(new THREE.SphereGeometry(CT.BALL_R, 32, 20), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.55 }));
  ball.castShadow = true; scene.add(ball);
  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
  ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);
  // user indicator ring
  const ringC = new THREE.Color(lum(U[G.userTeam >= 0 ? G.userTeam : 0].base) > 0.8 ? '#f2c230' : '#f2c230');
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), new THREE.MeshBasicMaterial({ color: ringC, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; scene.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 3), new THREE.MeshBasicMaterial({ color: ringC, toneMapped: false })); arrow.rotation.x = Math.PI / 2; ring.add(arrow); arrow.position.set(0, -0.62, 0);
  // pass target icons (who the pass would go to)
  const bcam = new BroadcastCam(cam, Settings.camera || 'broadcast');
  const input = new Input(wrap);
  const touchUI = phone || ('ontouchstart' in window && matchMedia('(hover: none)').matches);
  if (touchUI) input.buildTouch(wrap);
  let paused = false, quit = false, finished = false, resolveFn;
  const done = new Promise(r => { resolveFn = r; });
  const hud = new Hud(wrap, G, { meter: Settings.meter !== false, onPause: () => togglePause() });
  const proj = (P, h) => {
    const v = new THREE.Vector3(P.pos.x, h, P.pos.z).project(cam);
    if (v.z > 1) return null;
    const r = canvas.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height };
  };
  // resize
  const resize = () => {
    const w = wrap.clientWidth || innerWidth, h = wrap.clientHeight || innerHeight;
    if (w === resize.w && h === resize.h) return; resize.w = w; resize.h = h;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  };
  resize();
  loading.remove();
  Audio.crowd && Audio.crowd(0.35);
  // intro banner
  hud.banner(`${(awayT.abbr || awayT.id)} AT ${(homeT.abbr || homeT.id)}`, (homeT.city ? homeT.city + ' ' : '') + (homeT.name || ''), 'intro', 2.6);
  hud.say(homeT.city ? `Welcome to ${esc(homeT.city)}. ${esc(awayT.name || '')} vs ${esc(homeT.name || '')}, tip-off coming up.` : `${esc(awayT.name || '')} vs ${esc(homeT.name || '')}, tip-off coming up.`);

  // pause menu
  function togglePause() {
    if (finished) return;
    paused = !paused;
    if (paused) {
      const items = () => [
        { label: 'RESUME', fn: () => togglePause() },
        { label: 'CAMERA', value: (Settings.camera || 'broadcast').toUpperCase(), fn: () => { const L = ['broadcast', 'high', 'low']; Settings.camera = L[(L.indexOf(Settings.camera || 'broadcast') + 1) % L.length]; saveSettings(); bcam.set(Settings.camera); hud.showPause(items()); } },
        { label: 'SHOT METER', value: Settings.meter !== false ? 'ON' : 'OFF', fn: () => { Settings.meter = Settings.meter === false; saveSettings(); G.opts.meter = Settings.meter; hud.opts.meter = Settings.meter; hud.showPause(items()); } },
        { label: 'QUIT GAME', fn: () => { quit = true; finish(); } },
      ];
      hud.showPause(items());
      Audio.crowd && Audio.crowd(0.1);
    } else { hud.hidePause(); }
  }

  function finish() {
    if (finished && !quit) return;
    finished = true;
    const result = {
      quit, score: { home: G.teams[0].score, away: G.teams[1].score },
      winner: quit ? null : G.teams[0].score > G.teams[1].score ? 'home' : 'away',
      box: { home: boxOf(G.teams[0]), away: boxOf(G.teams[1]) },
    };
    cleanup();
    resolveFn(result);
  }
  const boxOf = (T) => T.roster.filter(p => p.box.min > 0 || p.box.pts).map(p => ({ id: p.id, n: p.d.n, min: Math.round(p.box.min / 60 * 10) / 10, pts: p.box.pts, reb: p.box.reb, ast: p.box.ast, stl: p.box.stl, blk: p.box.blk, fgm: p.box.fgm, fga: p.box.fga, tpm: p.box.tpm, tpa: p.box.tpa, ftm: p.box.ftm, fta: p.box.fta }));
  let raf = 0;
  function cleanup() {
    cancelAnimationFrame(raf); input.destroy(); removeEventListener('resize', resize);
    Audio.crowd && Audio.crowd(0); Audio.stopAll && Audio.stopAll();
    renderer.dispose(); scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const a of avatars.values()) a.dispose();
    container.innerHTML = ''; container.classList.remove('h27-game-on');
  }
  addEventListener('resize', resize);

  // ---------------------------------------------------------------------------------------------- events -> audio / hud
  const handSide = { x: 0 };
  let excite = 0.2;
  function onEvent(e) {
    const ut = G.userTeam;
    switch (e.k) {
      case 'bounce': Audio.play('bounce', Math.min(1, e.s / 5)); break;
      case 'rim': Audio.play('rim', Math.min(1, e.s / 4)); arena.rimHit(Math.sign(G.ball.p.x), G.ball.v.x, G.ball.v.z); break;
      case 'board': Audio.play('board', Math.min(1, e.s / 4)); break;
      case 'pass': Audio.play('squeak', 0.25); break;
      case 'catch': if (e.how !== 'reb') Audio.play('catch', 0.5); break;
      case 'shotStart': if (e.user) { const C = e.P; hud.meterWindow(C.act.rel, greenW(G, C, C.act.type, contestOf(G, C).c)); } break;
      case 'release': if (e.P && e.P.act && e.P.act.user) hud.grade(e.g); if (e.g === 'green') Audio.play('ui_ok', 0.4); break;
      case 'score': {
        arena.swish(Math.sign(G.ball.p.x), 1, G.ball.v.x, G.ball.v.z);
        Audio.play('swish', 1); excite = Math.min(1, excite + (e.pts === 3 ? 0.7 : 0.45));
        const home = e.ti === 0; Audio.play(home ? 'cheer' : 'ooh', home ? (e.pts === 3 || e.type === 'dunk' ? 1 : 0.6) : 0.4);
        if (e.type === 'dunk') { bcam.shake = 1; hud.banner(e.and1 ? 'AND ONE' : 'SLAM', shortName(e.P.d.n).toUpperCase(), 'big', 1.6); }
        else if (e.pts === 3 && e.g === 'green') hud.banner('GREEN', shortName(e.P.d.n).toUpperCase() + ' FROM DEEP', 'green', 1.5);
        else if (e.and1) hud.banner('AND ONE', shortName(e.P.d.n).toUpperCase(), 'big', 1.6);
        if (e.P && ut === e.ti) { e.P.celebrate = 0; }
        break;
      }
      case 'block': Audio.play('board', 0.7); Audio.play('ooh', 0.8); excite = Math.min(1, excite + 0.5); hud.banner('BLOCKED', shortName(e.P.d.n).toUpperCase(), 'big', 1.4); break;
      case 'steal': excite = Math.min(1, excite + 0.35); Audio.play('cheer', e.P.ti === 0 ? 0.5 : 0.2); break;
      case 'ankle': hud.banner('ANKLES', shortName(e.P.d.n).toUpperCase(), 'big', 1.3); Audio.play('ooh', 1); excite = Math.min(1, excite + 0.5); break;
      case 'whistle': Audio.play('whistle', 0.8); break;
      case 'violation': hud.banner(e.why, 'VIOLATION', 'warn', 1.8); break;
      case 'buzzer': Audio.play('buzzer', 1); break;
      case 'qend': hud.banner(`END OF THE ${['1ST', '2ND', '3RD', '4TH'][Math.min(3, e.q - 1)]}`, `${G.teams[1].team.abbr || G.teams[1].team.id} ${G.teams[1].score}  -  ${G.teams[0].team.abbr || G.teams[0].team.id} ${G.teams[0].score}`, 'q', 3); break;
      case 'quarter': if (e.q > 4) hud.banner('OVERTIME', '', 'q', 2); break;
      case 'sub': { const a = avatars.get(e.out); if (a) a.root.visible = false; const b = avatarFor(e.in); b.root.visible = true; break; }
      case 'jump': break;
      case 'final': hud.banner('FINAL', `${G.teams[1].team.abbr || G.teams[1].team.id} ${G.teams[1].score}  -  ${G.teams[0].team.abbr || G.teams[0].team.id} ${G.teams[0].score}`, 'q', 3); setTimeout(() => { if (!finished) hud.showFinal(G, () => finish()); }, 2200); Audio.play('cheer', 1); break;
    }
    const line = pbpFor(G, e);
    if (line) hud.say(line.text, line.kind);
  }

  // ---------------------------------------------------------------------------------------------- loop
  let last = performance.now(), acc = 0;
  const FIX = 1 / 60;
  const ballVis = new THREE.Vector3(), ballOff = new THREE.Vector3();
  let wasHeld = true;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    resize();
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (window.__fixedDt) dt = window.__fixedDt;
    const ut = G.userTeam >= 0 ? G.teams[G.userTeam] : null;
    const off = ut ? G.poss === ut.i || G.poss < 0 && false : true;
    const U = input.read(ut ? G.poss === ut.i : true);
    input.setTouchMode(ut ? G.poss === ut.i || (G.phase === 'ft' && G.ft && G.ft.P.ti === ut.i) : true);
    if (U.pause) togglePause();
    if (paused) {
      if (U.mz < -0.5 && !frame.nav) { hud.pauseNav(-1); frame.nav = true; } else if (U.mz > 0.5 && !frame.nav) { hud.pauseNav(1); frame.nav = true; } else if (Math.abs(U.mz) < 0.3) frame.nav = false;
      if (input.pressed.has('Enter') || U.pass || U.shootDown) hud.pauseOk();
      input.endFrame(); render(0); return;
    }
    if (finished) { input.endFrame(); return; }
    if (G.over && hud.finalGo && (input.pressed.has('Enter') || U.pass || U.shootDown)) { input.endFrame(); hud.finalGo(); return; }
    acc += dt; let first = true;
    while (acc >= FIX) {
      acc -= FIX;
      const u = first ? U : Object.assign({}, U, { shootDown: false, pass: false, move: false, lob: false, screen: false, switch: false, steal: false, block: false, shootUp: false });
      step(G, FIX, u); first = false;
      for (const e of G.ev) onEvent(e);
      G.ev.length = 0;
    }
    input.endFrame();
    render(dt);
  }
  function render(dt) {
    // avatars
    for (const T of G.teams) for (const P of T.roster) {
      const a = avatars.get(P); if (!a) continue;
      if (!P.onCourt) { a.root.visible = false; continue; }
      a.root.visible = true;
      if (dt > 0) { if (P.celebrate > 0) P.celebrate -= dt; a.update(dt, G); }
    }
    // ball: in the hands when held, physics when loose; blend out the hand->physics handoff
    const b = G.ball, H = holder(G);
    const av = H ? avatars.get(H) : null;
    if (H && av && av.hasBallPos) { ballVis.copy(av.ballPos); wasHeld = true; ballOff.set(0, 0, 0); }
    else {
      if (wasHeld) { const prev = ballVis.clone(); ballOff.copy(prev).sub(new THREE.Vector3(b.p.x, b.p.y, b.p.z)); if (ballOff.length() > 1.2) ballOff.set(0, 0, 0); wasHeld = false; }
      ballOff.multiplyScalar(Math.exp(-dt * 14));
      ballVis.set(b.p.x, b.p.y, b.p.z).add(ballOff);
    }
    ball.position.copy(ballVis);
    if (dt > 0) { ball.rotation.x += dt * (H ? 6 : (b.spin || 4)); ball.rotation.z += dt * 2; }
    ballShadow.position.set(ballVis.x, 0.011, ballVis.z); ballShadow.material.opacity = Math.max(0.05, 0.4 - ballVis.y * 0.08); ballShadow.scale.setScalar(1 + ballVis.y * 0.15);
    // user ring
    const ut = G.userTeam >= 0 ? G.teams[G.userTeam] : null, C = ut ? G.ctl[ut.i] : null;
    if (C && C.onCourt) { ring.visible = true; ring.position.x = C.pos.x; ring.position.z = C.pos.z; ring.rotation.z = -C.head + Math.PI; ring.material.opacity = 0.75 + 0.2 * Math.sin(performance.now() / 180); }
    else ring.visible = false;
    // camera, arena, crowd
    if (window.__camOverride) { const o = window.__camOverride; const P = o.P ? (o.P === 'ctl' ? G.ctl[0] : G.teams[o.ti || 0].on[o.k || 0]) : null; const c = P ? [P.pos.x, 0, P.pos.z] : [0, 0, 0];
      cam.position.set(c[0] + o.pos[0], c[1] + o.pos[1], c[2] + o.pos[2]); cam.fov = o.fov || 30; cam.updateProjectionMatrix(); cam.lookAt(c[0] + o.look[0], c[1] + o.look[1], c[2] + o.look[2]); }
    else bcam.update(Math.max(dt, 0.0001), G, cam.aspect);
    excite = Math.max(0.15, excite - dt * 0.25);
    const close = Math.abs(G.teams[0].score - G.teams[1].score) < 6 && G.q >= 4 && G.clock < 60;
    arena.excite = Math.min(1, excite + (close ? 0.3 : 0));
    if (dt > 0) arena.update(dt, G, cam);
    Audio.crowd && Audio.crowd(paused ? 0.1 : 0.3 + arena.excite * 0.6);
    // shot clocks on the baskets + jumbotron + table
    const sc = G.clock > G.shot && G.phase !== 'ft' ? String(Math.ceil(Math.max(0, G.shot))) : '';
    if (sc !== render.sc) { render.sc = sc; for (const t of arena.shotTex) t.draw([sc]); }
    const jb = `${G.teams[1].score}  -  ${G.teams[0].score}`;
    if (jb !== render.jb) { render.jb = jb; arena.jbTex.draw([`${G.teams[1].team.abbr || ''}   ${G.teams[0].team.abbr || ''}`, jb]); }
    hud.update(dt, G, proj);
    renderer.render(scene, cam);
  }
  raf = requestAnimationFrame(frame);
  if (window.__h27debug) window.__h27 = { G, scene, cam, avatars, arena, hud, renderer, step: (n = 60) => { for (let i = 0; i < n; i++) { step(G, FIX, {}); for (const e of G.ev) onEvent(e); G.ev.length = 0; } },
    until: (pred, max = 3600, after = 0) => { let k = 0, hit = -1; for (; k < max; k++) { step(G, FIX, {}); const ev = G.ev.slice(); for (const e of G.ev) onEvent(e); G.ev.length = 0; if (hit < 0 && pred(G, ev)) hit = k; if (hit >= 0 && k - hit >= after) break; } bcam.first = true; bcam.vx = 0; for (let i = 0; i < 14; i++) render(1 / 60); return k; } };
  return done;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function lum(hex) { const c = new THREE.Color(hex || '#888'); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
