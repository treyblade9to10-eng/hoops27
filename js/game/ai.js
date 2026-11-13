// Team AI: offense (spacing, cuts, pick and roll, drives, kick-outs, shot selection) and defense
// (man-to-man, sagging, help rotations, close-outs, blocks, box-outs, rebounds).
import { CT, hoop, fromHoop, toHoop, distToHoop, isThree } from './court.js';
import { holder, offense, shotChance, contestOf, shotType, startShot, doPass, trySteal, jumpBlock, dribbleMove, DIFF, len } from './engine.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// offensive spots in hoop space (u = meters from the baseline, v = across)
const SPOTS5 = [[8.9, 0], [6.6, 5.6], [6.6, -5.6], [0.9, 6.95], [2.2, -2.3]];
const SPOTS3 = [[8.9, 0], [6.4, 5.6], [2.2, -2.3]];
const ALT5 = { 1: [[0.9, 6.95], [7.4, 3.0]], 2: [[0.9, -6.95], [7.4, -3.0]], 3: [[6.6, 5.6], [3.6, 6.0]], 4: [[4.6, 0], [2.2, 2.3]] };

export function aiInit(G) { for (const T of G.teams) for (const P of T.roster) P.ai = {}; }

function inside(p, m = 0.45) { return { x: clamp(p.x, -CT.HL + m, CT.HL - m), z: clamp(p.z, -CT.HW + m, CT.HW - m), s: p.s, sprint: p.sprint }; }
const dist = (a, b) => len(a.x - b.x, a.z - b.z);

export function aiTeam(G, T, dt) {
  const ctl = T.user ? G.ctl[T.i] : null;
  for (const P of T.on) {
    P.ai.face = null;
    if (P === ctl) { P.ai.dest = null; continue; }
    P.stance = false;
    if (P.act && P.act.k === 'stumble') { P.ai.dest = null; continue; }
    if (G.phase === 'tip') { P.ai.dest = { x: P.pos.x, z: P.pos.z, s: 0 }; P.ai.face = { x: 0, z: 0 }; continue; }
    if (G.phase === 'ft' || G.phase === 'dead' || G.phase === 'qbreak' || G.phase === 'final' || G.phase === 'buzzer') {
      if (G.phase !== 'ft') P.ai.dest = { x: P.pos.x + P.vel.x * 0.3, z: P.pos.z + P.vel.z * 0.3, s: 0.3 };
      else P.ai.dest = { x: P.pos.x, z: P.pos.z, s: 0 };
      if (G.phase === 'ft' && G.ball.state === 'air') ftRebound(G, P);
      continue;
    }
    if (G.phase === 'inbound') { inboundAI(G, T, P); continue; }
    const b = G.ball;
    const loose = b.state !== 'held' && (b.kind === 'loose' || b.kind === 'tip' || (b.kind === 'shot' && (b.rimHit || b.boardHit || b.p.y < 2.6 && b.v.y < 0)));
    if (loose || (b.kind === 'shot' && b.state === 'air')) { reboundAI(G, T, P, dt, loose); continue; }
    if (G.poss === T.i) offenseAI(G, T, P, dt); else if (G.poss >= 0) defenseAI(G, T, P, dt);
    else { P.ai.dest = { x: b.p.x, z: b.p.z, s: 1, sprint: true }; }
  }
}

// -------------------------------------------------------------------------------------------------- inbounds
function inboundAI(G, T, P) {
  const I = G.inb, b = G.ball;
  if (P === I.P) return; // engine walks him to the spot
  if (T.i === I.P.ti) {
    if (P === I.recv) {
      // come get it: a spot 3 m inside the line toward mid court
      const s = I.spot, inx = -Math.sign(s.x) * (Math.abs(s.x) > CT.HL ? 3.2 : 0), inz = Math.abs(s.z) > CT.HW ? -Math.sign(s.z) * 3 : 0;
      P.ai.dest = inside({ x: s.x + inx + (Math.abs(s.x) > CT.HL ? 0 : -T.dir * 1.5), z: s.z + inz + (Math.abs(s.z) > CT.HW ? 0 : 1.5 * Math.sign(-s.z || 1)), s: 1 });
      P.ai.face = I.P.pos;
    } else {
      const sp = spotFor(G, T, P), w = fromHoop(T.dir, sp[0], sp[1]);
      P.ai.dest = inside({ x: w.x, z: w.z, s: 0.8 });
    }
  } else defenseAI(G, T, P, 0.016, true);
}

// -------------------------------------------------------------------------------------------------- offense
function spotFor(G, T, P) {
  const S = G.fmt === 3 ? SPOTS3 : SPOTS5;
  const base = S[P.slot % S.length];
  const alt = G.fmt === 5 && ALT5[P.slot] && P.ai.alt ? ALT5[P.slot][P.ai.alt - 1] : null;
  return alt || base;
}

function offenseAI(G, T, P, dt) {
  const H = holder(G), b = G.ball;
  const hp = hoop(T.dir);
  if (H === P) { handlerAI(G, T, P, dt); return; }
  // alley-oop receiver
  if (P.ai.oop) {
    const o = P.ai.oop; o.t += dt;
    P.ai.dest = { x: o.at.x, z: o.at.z, s: 1, sprint: true };
    const dl = dist(P.pos, o.at), left = o.T - o.t;
    if (P.y === 0 && left < 0.42 && dl < 2.4) { P.vy = Math.max(P.jumpV, Math.sqrt(2 * 9.81 * Math.max(0.3, o.at.y - P.reach + 0.05))); P.y = 0.001; P.act = { k: 'oopjump', t: 0, dur: 1.2 }; }
    if (o.t > o.T + 1) P.ai.oop = null;
    return;
  }
  // pass in flight to me: go meet it
  if (b.state === 'air' && b.kind === 'pass' && b.pass && b.pass.to === P) { P.ai.dest = { x: b.pass.at.x, z: b.pass.at.z, s: 0.7 }; P.ai.face = b.p; return; }
  const u = toHoop(T.dir, (H || P).pos.x, (H || P).pos.z).u;
  // screens (called by the user with U, or the AI pick and roll)
  if (P.ai.screen) {
    const S = P.ai.screen; S.t += dt;
    const D = H && G.teams[1 - T.i].on.find(d => d.ai.man === H);
    if (!H || !D || S.t > 3.2) { P.ai.screen = null; P.ai.screening = false; }
    else if (S.t < 1.7) {
      // stand on the defender's hip, on the side away from the hoop direction the handler will go
      const sx = D.pos.x + (hp.x - D.pos.x) * 0.0 + (D.pos.x - H.pos.x) * 0.25, sz = D.pos.z + (D.pos.z - H.pos.z) * 0.25 + (S.side || 1) * 0.55;
      P.ai.dest = inside({ x: sx, z: sz, s: 1, sprint: dist(P.pos, D.pos) > 3 });
      P.ai.screening = dist(P.pos, { x: sx, z: sz }) < 0.8; P.ai.face = H.pos;
      return;
    } else { // roll to the rim
      P.ai.screening = false;
      const w = fromHoop(T.dir, 1.8, 0.6 * (S.side || 1)); P.ai.dest = inside({ x: w.x, z: w.z, s: 1, sprint: true }); P.ai.rolling = true; return;
    }
  }
  P.ai.rolling = false;
  // transition: run the floor
  if (u > 13.5) {
    const sp = spotFor(G, T, P), w = fromHoop(T.dir, sp[0], sp[1]);
    P.ai.dest = inside({ x: w.x, z: w.z, s: 1, sprint: true });
    return;
  }
  // cuts
  P.ai.cutT = (P.ai.cutT ?? (2 + G.rng() * 6)) - dt;
  if (P.ai.cutT <= 0 && !P.ai.cut && P.slot !== 0) {
    const slasher = (P.R.dunk + P.R.speed) / 2 > 70 ? 1.6 : 1;
    if (G.rng() < 0.32 * slasher) P.ai.cut = { t: 0, side: Math.sign(toHoop(T.dir, P.pos.x, P.pos.z).v || 1) };
    else if (G.fmt === 5 && ALT5[P.slot] && G.rng() < 0.4) P.ai.alt = P.ai.alt ? 0 : 1 + (G.rng() < 0.5 ? 0 : 1);
    P.ai.cutT = 3 + G.rng() * 6;
  }
  if (P.ai.cut) {
    const c = P.ai.cut; c.t += dt;
    const w = c.t < 1.9 ? fromHoop(T.dir, 1.5, 0.9 * c.side) : null;
    if (!w || c.t > 2.6) P.ai.cut = null;
    else { P.ai.dest = inside({ x: w.x, z: w.z, s: 1, sprint: true }); return; }
  }
  // spacing: drift with the drive
  let sp = spotFor(G, T, P);
  if (H && H.ai.mode === 'drive' && P.slot !== 4) sp = [Math.min(sp[0], 1.2), Math.sign(sp[1] || (P.slot % 2 ? 1 : -1)) * 6.95];
  const w = fromHoop(T.dir, sp[0], sp[1]);
  P.ai.dest = inside({ x: w.x, z: w.z, s: dist(P.pos, w) > 3 ? 1 : 0.6 });
  if (H) P.ai.face = H.pos;
}

function handlerAI(G, T, P, dt) {
  const A = P.act;
  if (A && (A.k === 'shoot' || A.k === 'pass' || A.k === 'stumble')) return;
  const hp = hoop(T.dir), hs = toHoop(T.dir, P.pos.x, P.pos.z), d = distToHoop(T.dir, P.pos.x, P.pos.z);
  P.ai.hold = (P.ai.hold || 0) + dt;
  const D = G.teams[1 - T.i].on;
  // bring it up
  if (hs.u > 12.5) {
    const ahead = T.on.filter(q => toHoop(T.dir, q.pos.x, q.pos.z).u < hs.u - 4).length;
    const back = D.filter(q => toHoop(T.dir, q.pos.x, q.pos.z).u < hs.u - 1).length;
    const fast = ahead >= back && G.shot > 16;
    const w = fromHoop(T.dir, fast ? 4 : 9.2, clamp(hs.v * 0.6, -3, 3));
    P.ai.dest = inside({ x: w.x, z: w.z, s: 1, sprint: fast || G.shot < 17 }); P.ai.mode = fast ? 'break' : 'bring';
    if (fast && d < 6) P.ai.mode = 'drive';
    if (P.ai.mode !== 'drive') return;
  }
  P.ai.dec = (P.ai.dec || 0) - dt;
  const ch = shotChance(G, P, 'jump');
  // driving to the rim
  if (P.ai.mode === 'drive' || P.ai.mode === 'break') {
    const w = fromHoop(T.dir, 1.6, clamp(hs.v * 0.3, -0.6, 0.6));
    P.ai.dest = { x: w.x, z: w.z, s: 1, sprint: d > 3 };
    const blocker = laneBlocker(G, P, 1.1);
    if (d < 3.2 && (!blocker || d < 1.8)) { P.ai.mode = 'set'; startShot(G, P, shotType(G, P) === 'jump' ? 'layup' : shotType(G, P), false); return; }
    if (blocker && d > 3.3 && P.ai.dec <= 0) {
      P.ai.dec = 0.3;
      const kick = bestPass(G, P);
      if (kick && kick.ev > 0.95 && G.rng() < 0.75) { doPass(G, P, kick.Q); P.ai.mode = 'set'; return; }
      if (d < 6.5 && G.rng() < 0.45 && ch.p > 0.3) { startShot(G, P, 'jump', false); P.ai.mode = 'set'; return; }
      if (G.rng() < 0.55 && P.R.handle > 62) { const s = G.rng() < 0.5 ? 1 : -1; dribbleMove(G, P, Math.cos(P.head) * s, -Math.sin(P.head) * s); return; }
      if (G.rng() < 0.35) return; // keep attacking
      P.ai.mode = 'set';
    }
    if (P.ai.hold > 6) P.ai.mode = 'set';
    return;
  }
  // half-court: probe around the top, decide every ~0.35 s
  const probe = fromHoop(T.dir, clamp(hs.u, 6.5, 9.5), clamp(hs.v, -4, 4) + Math.sin(G.t * 0.7 + P.slot) * 1.2);
  P.ai.dest = inside({ x: probe.x, z: probe.z, s: 0.55 });
  if (P.ai.dec > 0) return;
  P.ai.dec = 0.3 + G.rng() * 0.2;
  const hold = P.ai.hold, sc = G.shot;
  const evShoot = ch.p * ch.value;
  const lane = !laneBlocker(G, P, 1.3);
  const pass = bestPass(G, P);
  const tend = { three: P.R.three > 78 ? 1.15 : P.R.three < 55 ? 0.6 : 1 };
  // urgency
  if (sc < 3.2 && G.clock > sc) { startShot(G, P, shotType(G, P), false); return; }
  const r = G.rng();
  let wShoot = Math.max(0, evShoot - 0.9) * 4 * (ch.three ? tend.three : 1) * (ch.c > 0.35 ? 0.4 : 1) + (hold > 3 ? 0.08 : 0) + (sc < 6 ? 0.35 : 0);
  let wDrive = (lane && d < 10 ? 0.7 : 0.25) + (P.R.speed + P.R.close + P.R.handle - 220) / 80 + (d < 5 ? 0.5 : 0);
  let wPass = pass ? Math.max(0, pass.ev - evShoot + 0.25) * 2 + (hold > 1.5 ? 0.35 : 0.05) : 0;
  let wPnr = G.fmt === 5 && !T.on.some(q => q.ai.screen) && hold > 0.8 && hold < 5 ? 0.12 : 0;
  let wWait = hold < 0.9 ? 1.2 : 0.35;
  const sum = wShoot + wDrive + wPass + wPnr + wWait; let x = r * sum;
  if ((x -= wShoot) < 0) { startShot(G, P, ch.d < 2.6 ? 'layup' : 'jump', false); return; }
  if ((x -= wDrive) < 0) { P.ai.mode = 'drive'; P.ai.hold = Math.min(hold, 3); return; }
  if ((x -= wPass) < 0) { doPass(G, P, pass.Q); P.ai.hold = 0; return; }
  if ((x -= wPnr) < 0) { const S = T.on.find(q => q.slot === 4) || T.on[T.on.length - 1]; if (S && S !== P) S.ai.screen = { t: 0, side: G.rng() < 0.5 ? 1 : -1 }; return; }
}

// the closest defender standing in the lane between P and the rim
export function laneBlocker(G, P, w) {
  const hp = hoop(P.T.dir), dx = hp.x - P.pos.x, dz = hp.z - P.pos.z, L = len(dx, dz) || 1, fx = dx / L, fz = dz / L;
  let best = null, bd = 9;
  for (const D of G.teams[1 - P.ti].on) {
    const rx = D.pos.x - P.pos.x, rz = D.pos.z - P.pos.z, a = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
    if (a > 0 && a < Math.min(L, 4.5) && side < w && a < bd) { bd = a; best = D; }
  }
  return best;
}

function bestPass(G, P) {
  let best = null;
  for (const Q of P.T.on) {
    if (Q === P) continue;
    const d = dist(P.pos, Q.pos); if (d > 16 || d < 1.5) continue;
    const near = distToHoop(Q.T.dir, Q.pos.x, Q.pos.z) < 2.8;
    const c = shotChance(G, Q, near ? 'layup' : 'jump');
    let ev = c.p * c.value * (near ? 1.05 : 1);
    // passing-lane risk
    const risk = laneRisk(G, P, Q);
    ev -= risk * 1.2;
    if (!best || ev > best.ev) best = { Q, ev };
  }
  return best;
}
function laneRisk(G, P, Q) {
  const dx = Q.pos.x - P.pos.x, dz = Q.pos.z - P.pos.z, L = len(dx, dz) || 1, fx = dx / L, fz = dz / L;
  let r = 0;
  for (const D of G.teams[1 - P.ti].on) {
    const rx = D.pos.x - P.pos.x, rz = D.pos.z - P.pos.z, a = rx * fx + rz * fz;
    if (a < 0.8 || a > L - 0.4) continue;
    const side = Math.abs(rx * fz - rz * fx); if (side < 1.1) r = Math.max(r, (1.1 - side) / 1.1 * (D.R.steal / 90));
  }
  return r;
}

// user passing: teammate in the stick direction (or the most open one)
export function pickPassTarget(G, P, mx = 0, mz = 0) {
  const il = len(mx, mz);
  let best = null, bs = -1e9;
  for (const Q of P.T.on) {
    if (Q === P) continue;
    const dx = Q.pos.x - P.pos.x, dz = Q.pos.z - P.pos.z, d = len(dx, dz) || 1;
    let s;
    if (il > 0.3) s = (dx * mx + dz * mz) / (d * il) * 10 - d * 0.12;
    else { const c = contestOf(G, Q).c; s = -c * 4 - d * 0.1 - laneRisk(G, P, Q) * 5; }
    if (s > bs) { bs = s; best = Q; }
  }
  return best;
}

export function lobTarget(G, P) {
  const T = P.T;
  let best = null, bs = -1e9;
  for (const Q of T.on) {
    if (Q === P) continue;
    const d = distToHoop(T.dir, Q.pos.x, Q.pos.z); if (d > 10) continue;
    const s = Q.R.dunk + Q.R.hIn * 0.5 - d * 6 - contestOf(G, Q).c * 25;
    if (s > bs) { bs = s; best = Q; }
  }
  return best;
}

// -------------------------------------------------------------------------------------------------- defense
function defenseAI(G, T, P, dt, inb) {
  const O = G.teams[1 - T.i];
  const man = O.on.find(q => q.slot === P.slot) || O.on[0];
  P.ai.man = man;
  const hp = hoop(O.dir), H = holder(G), b = G.ball;
  const cpu = !T.user, k = cpu ? DIFF.cpuD[G.diff] : 1;
  // shot contest
  if (H && H.act && H.act.k === 'shoot' && !H.act.released) {
    const dd = dist(P.pos, H.pos);
    if (man === H || (dd < 2.2 && H.act.type !== 'jump')) {
      P.ai.dest = { x: H.pos.x + (hp.x - H.pos.x) * 0.06, z: H.pos.z + (hp.z - H.pos.z) * 0.06, s: 1, sprint: true };
      P.ai.face = H.pos;
      const tl = H.act.rel - H.act.t;
      if (dd < 1.5 && P.y === 0 && tl < 0.3 && tl > 0.05 && G.rng() < (0.25 + P.R.block / 250) * k * dt * 30) jumpBlock(G, P);
      return;
    }
  }
  let gap, help = 0;
  const mHoop = dist(man.pos, hp), ballD = dist(man.pos, b.p);
  if (man === H) {
    gap = clamp(1.05 / k + (man.R.speed - P.R.speed) * 0.01 + (mHoop > 9 ? 0.6 : 0), 0.75, 2.4);
    if (toHoop(O.dir, man.pos.x, man.pos.z).u > 13.5) gap = 2.2;
    P.stance = mHoop < 9;
  } else {
    gap = clamp(1.4 + ballD * 0.22, 1.4, 4.2) / Math.sqrt(k);
    help = 0.22;
  }
  // help rotation: the driver got by his man
  if (H && H !== man && H.ai) {
    const hd = dist(H.pos, hp);
    const hisD = T.on.find(q => q.ai.man === H);
    const beat = hisD && dist(hisD.pos, hp) > hd + 0.2;
    if (hd < 5.5 && beat && isHelper(G, T, P, H)) {
      const w = { x: H.pos.x + (hp.x - H.pos.x) / hd * 1.0, z: H.pos.z + (hp.z - H.pos.z) / hd * 1.0 };
      P.ai.dest = { x: w.x, z: w.z, s: 1, sprint: true }; P.ai.face = H.pos; P.stance = true; return;
    }
  }
  const mx = hp.x - man.pos.x, mz = hp.z - man.pos.z, ml = len(mx, mz) || 1;
  let tx = man.pos.x + mx / ml * Math.min(gap, ml - 0.3), tz = man.pos.z + mz / ml * Math.min(gap, ml - 0.3);
  // shade toward the ball
  tx += (b.p.x - tx) * help; tz += (b.p.z - tz) * help;
  P.ai.dest = inside({ x: tx, z: tz, s: 1, sprint: dist(P.pos, { x: tx, z: tz }) > 3.5 }, 0.3);
  P.ai.face = man === H ? H.pos : { x: (man.pos.x + b.p.x) / 2, z: (man.pos.z + b.p.z) / 2 };
  // gamble for a steal
  if (!inb && man === H && cpu && dist(P.pos, H.pos) < 1.3 && !P.act && !P.slow) {
    if (G.rng() < 0.16 * dt * (P.R.steal / 75) * k) trySteal(G, P);
  }
}
function isHelper(G, T, P, H) {
  // the defender closest to the driver who is not guarding him
  let best = null, bd = 1e9;
  for (const q of T.on) { if (q.ai.man === H || (q === G.ctl[T.i] && T.user)) continue; const d = dist(q.pos, H.pos); if (d < bd) { bd = d; best = q; } }
  return best === P;
}

// -------------------------------------------------------------------------------------------------- rebounds
function reboundAI(G, T, P, dt, loose) {
  const b = G.ball;
  const shotTeam = b.shot ? b.shot.P.ti : (b.lastTouch ? b.lastTouch.ti : -1);
  const hx = Math.sign(b.p.x || 1) * CT.HOOP_X, hp = { x: hx, z: 0 };
  // where is the ball coming down?
  const t = b.v.y < 0 ? clamp((b.p.y - 1.8) / Math.max(1, -b.v.y), 0, 0.8) : clamp(b.v.y / 9.81 + 0.4, 0, 1.2);
  const land = { x: b.p.x + b.v.x * t, z: b.p.z + b.v.z * t };
  const dl = dist(P.pos, land);
  // shooter's team: crash (bigs) or get back (guards); defenders: box out, then go get it
  const crash = P.ti === shotTeam ? (P.slot >= 3 || dl < 3) : true;
  if (!loose) {
    if (P.ti !== shotTeam && P.ai.man) {
      const m = P.ai.man, mx = hp.x - m.pos.x, mz = hp.z - m.pos.z, ml = len(mx, mz) || 1;
      P.ai.dest = { x: m.pos.x + mx / ml * 0.8, z: m.pos.z + mz / ml * 0.8, s: 1 }; P.ai.face = m.pos; return;
    }
    if (!crash) { const w = fromHoop(-P.T.dir, 9, 0); P.ai.dest = { x: P.pos.x + (w.x - P.pos.x) * 0.3, z: P.pos.z * 0.8, s: 0.7 }; return; }
    const w = { x: hp.x - Math.sign(hx) * 1.6, z: (P.pos.z > 0 ? 1 : -1) * 1.2 };
    P.ai.dest = { x: w.x, z: w.z, s: 1 }; P.ai.face = b.p; return;
  }
  if (!crash && dl > 4) { const w = fromHoop(-P.T.dir, 9, 0); P.ai.dest = { x: w.x, z: w.z, s: 0.8 }; return; }
  P.ai.dest = inside({ x: land.x, z: land.z, s: 1, sprint: dl > 2 }, 0.1);
  P.ai.face = b.p;
  // jump for it
  const hd = dist(P.pos, b.p);
  if (P.y === 0 && hd < 1.2 && b.v.y < 0.5 && b.p.y > P.reach + 0.1 && b.p.y < P.reach + 1.0 && !(P.act && P.act.k === 'block')) {
    P.vy = P.jumpV * 0.95; P.y = 0.001; P.act = { k: 'rebound', t: 0, dur: 0.9 };
  }
}

function ftRebound(G, P) {
  // lane players step in once the shot hits the rim
  const b = G.ball;
  if (b.rimHit && !b.scored) { P.ai.dest = { x: b.p.x, z: b.p.z, s: 1, sprint: true }; }
}
