// Hoops 27 game engine: rules, clocks, possessions, player movement, shots, passes, rebounds, fouls, subs.
// Pure JS (no THREE) so it runs headless in node for balance tests. AI lives in ai.js.
import { CT, hoop, fromHoop, toHoop, distToHoop, isThree, inBounds } from './court.js';
import { makeBall, launch, passVel, stepBall, G as GRAV } from './ball.js';
import { rate } from '../ratings.js';
import { aiTeam, aiInit, pickPassTarget, lobTarget } from './ai.js';

export const DIFF = {
  cpuMake: [0.8, 0.9, 1.0, 1.07, 1.13],
  userMake: [1.12, 1.05, 1.0, 0.96, 0.92],
  green: [1.6, 1.3, 1.0, 0.82, 0.68],
  cpuD: [0.75, 0.9, 1.0, 1.1, 1.2],
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (G) => G.rng();
export const len = (x, z) => Math.hypot(x, z);
function seeded(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------------------------------------------------------
export function createGame(opts) {
  const fmt = opts.format === '3v3' ? 3 : 5;
  const G = {
    opts, fmt, t: 0, rng: seeded(opts.seed ?? (Date.now() & 0xffffffff)), diff: opts.diff ?? 2,
    teams: [], ball: makeBall(), phase: 'tip', phaseT: 0, poss: -1, q: 1, clock: (opts.qLen || 3) * 60, qLen: (opts.qLen || 3) * 60,
    shot: 24, shotOn: false, ev: [], ctl: [null, null], userTeam: opts.user === 'away' ? 1 : opts.user === 'none' ? -1 : 0,
    next: null, ft: null, inb: null, lastScoreT: -9, half: 1, firstPoss: -1, over: false, ot: 0, clockRun: false,
    stats: { lead: 0 },
  };
  for (const [i, side] of [[0, 'home'], [1, 'away']]) {
    const src = opts[side];
    const T = { i, side, team: src.team, roster: [], on: [], score: 0, fouls: 0, to: 4, dir: i === 0 ? 1 : -1, user: G.userTeam === i, qScore: [0, 0, 0, 0] };
    src.roster.forEach((d, k) => T.roster.push(makePlayer(G, d, T, k)));
    T.on = T.roster.slice(0, fmt);
    T.on.forEach((P, k) => { P.slot = k; P.onCourt = true; });
    G.teams.push(T);
  }
  aiInit(G);
  setupTip(G);
  return G;
}

function makePlayer(G, d, T, k) {
  const R = rate(d);
  return {
    id: d.id, d, R, T, ti: T.i, slot: k, onCourt: false, starter: k < G.fmt,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, y: 0, vy: 0, head: 0, want: { x: 0, z: 0, s: 0 },
    act: null, stam: 1, hand: 'r', ai: {}, slow: 0, burst: 0, stance: false, sprint: false,
    box: { min: 0, pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, to: 0, pf: 0 },
    reach: R.hM * 1.33, jumpV: 3.2 + (R.dunk - 50) * 0.018 + (R.speed - 60) * 0.006,
  };
}

const emit = (G, k, o = {}) => { G.ev.push(Object.assign({ k, t: G.t }, o)); };
export const offense = (G) => G.poss >= 0 ? G.teams[G.poss] : null;
export const defense = (G) => G.poss >= 0 ? G.teams[1 - G.poss] : null;
export const holder = (G) => G.ball.state === 'held' ? G.ball.holder : null;
export const allOn = (G) => G.teams[0].on.concat(G.teams[1].on);

// ---------------------------------------------------------------------------------------------------------------
// set pieces
function setupTip(G) {
  G.phase = 'tip'; G.phaseT = 0; G.poss = -1; G.clockRun = false; G.tipDone = false;
  const b = G.ball; b.state = 'dead'; b.holder = null; b.p = { x: 0, y: 1.2, z: 0 }; b.v = { x: 0, y: 0, z: 0 };
  for (const T of G.teams) {
    const d = T.dir; // stand on own defensive half (opposite of attack direction)
    const spots = G.fmt === 5 ? [[-0.6, 0], [-2.2, 3.0], [-2.2, -3.0], [-5.0, 2.0], [-5.0, -2.0]] : [[-0.6, 0], [-2.6, 2.5], [-2.6, -2.5]];
    const ord = tipOrder(T);
    ord.forEach((P, k) => { const s = spots[k]; P.pos = { x: d * s[0], z: s[1] }; P.vel = { x: 0, z: 0 }; P.head = d > 0 ? Math.PI / 2 : -Math.PI / 2; P.act = null; P.y = 0; P.vy = 0; P.ai.dest = null; });
  }
}
function tipOrder(T) { const c = T.on.slice().sort((a, b) => (b.R.hIn + b.R.reb / 10) - (a.R.hIn + a.R.reb / 10))[0]; return [c, ...T.on.filter(p => p !== c)]; }

// give the ball to team ti for an inbound at spot {x,z} (outside the lines)
function setupInbound(G, ti, spot, why, runClockOnPass = true) {
  const T = G.teams[ti];
  G.phase = 'inbound'; G.phaseT = 0; G.poss = ti; G.clockRun = false;
  G.shot = 24; G.shotOn = false;
  // inbounder: the closest non-PG (PG receives), or the C after a make
  const recv = T.on.find(p => p.slot === 0) || T.on[0];
  let inb = T.on.filter(p => p !== recv).sort((a, b) => len(a.pos.x - spot.x, a.pos.z - spot.z) - len(b.pos.x - spot.x, b.pos.z - spot.z))[0] || recv;
  G.inb = { P: inb, recv, spot, why, runClock: runClockOnPass, t: 0 };
  const b = G.ball; b.state = 'held'; b.holder = inb; b.kind = null; b.shot = null; b.pass = null; b.rimHit = false; b.scored = false;
  inb.act = null;
  autoSubs(G);
  emit(G, 'inbound', { ti, why });
}

function setupFT(G, P, n, and1) {
  const T = P.T, d = T.dir;
  G.phase = 'ft'; G.phaseT = 0; G.poss = P.ti; G.clockRun = false;
  G.ft = { P, n, i: 0, made: 0, and1, wait: 1.6 };
  autoSubs(G);
  // line everybody up
  const lane = [[3.2, 2.2], [3.2, -2.2], [4.3, 2.2], [4.3, -2.2], [5.4, 2.2], [5.4, -2.2], [8.5, 3], [8.5, -3]];
  let k = 0;
  const others = allOn(G).filter(p => p !== P);
  // defenders take the spots nearest the hoop
  others.sort((a, b) => (a.ti === P.ti) - (b.ti === P.ti));
  for (const Q of others) { const s = lane[k++] || [9, 0]; const w = fromHoop(d, s[0] + 0.0, s[1]); Q.pos = { x: w.x, z: w.z }; Q.vel = { x: 0, z: 0 }; Q.act = null; Q.y = 0; Q.ai.dest = null; faceTo(Q, hoop(d)); }
  const w = fromHoop(d, CT.FT_U + 0.25, 0); P.pos = { x: w.x, z: w.z }; P.vel = { x: 0, z: 0 }; P.act = null; P.y = 0; faceTo(P, hoop(d));
  const b = G.ball; b.state = 'held'; b.holder = P; b.kind = null; b.shot = null; b.scored = false; b.rimHit = false;
  emit(G, 'ft', { P, n });
}

function faceTo(P, p) { P.head = Math.atan2(p.x - P.pos.x, p.z - P.pos.z); }

function whistle(G, why, next, delay = 1.3) {
  G.phase = 'dead'; G.phaseT = 0; G.clockRun = false; G.next = next; G.deadFor = delay;
  emit(G, 'whistle', { why });
}

function changePoss(G, ti) { G.poss = ti; G.shot = 24; G.shotOn = true; emit(G, 'poss', { ti }); }

// ---------------------------------------------------------------------------------------------------------------
// substitutions at dead balls (both teams, AI decides)
function autoSubs(G) {
  for (const T of G.teams) {
    if (T.roster.length <= G.fmt) continue;
    const bench = T.roster.filter(p => !p.onCourt);
    for (const P of T.on.slice()) {
      if (G.ft && G.ft.P === P) continue;
      const tired = P.stam < 0.42, starterBack = !P.starter && P.stam < 0.75;
      let sub = null;
      if (tired) sub = bench.filter(b => b.stam > 0.78).sort((a, b) => (posFit(b, P) - posFit(a, P)) || (b.d.ovr - a.d.ovr))[0];
      else if (starterBack) sub = bench.filter(b => b.starter && b.stam > 0.86 && posFit(b, P) >= 1)[0];
      if (!sub) continue;
      // swap
      const k = T.on.indexOf(P); T.on[k] = sub; sub.slot = P.slot; sub.onCourt = true; P.onCourt = false;
      sub.pos = { ...P.pos }; sub.vel = { x: 0, z: 0 }; sub.head = P.head; sub.act = null; sub.y = 0; sub.ai = {};
      if (G.ball.holder === P) G.ball.holder = sub;
      if (G.inb && G.inb.P === P) G.inb.P = sub; if (G.inb && G.inb.recv === P) G.inb.recv = sub;
      if (G.ctl[T.i] === P) G.ctl[T.i] = sub;
      bench.splice(bench.indexOf(sub), 1); bench.push(P);
      emit(G, 'sub', { ti: T.i, out: P, in: sub });
    }
  }
}
const posFit = (a, b) => a.d.pos === b.d.pos ? 2 : (a.d.pos === 'F' || b.d.pos === 'F') ? 1 : 0;

// ---------------------------------------------------------------------------------------------------------------
// shooting model
export function contestOf(G, P, at) {
  const T = P.T, h = hoop(T.dir); at = at || P.pos;
  let c = 0, who = null;
  const tx = h.x - at.x, tz = h.z - at.z, tl = len(tx, tz) || 1;
  for (const D of G.teams[1 - P.ti].on) {
    const dx = D.pos.x - at.x, dz = D.pos.z - at.z, d = len(dx, dz);
    const between = (dx * tx + dz * tz) / (d * tl + 1e-6);
    let k = clamp((1.75 - d) / 1.3, 0, 1) * (between > 0.2 ? 1 : between > -0.3 ? 0.6 : 0.25);
    k *= (D.y > 0.15 || (D.act && D.act.k === 'block')) ? 1.15 : 0.85;
    k *= 0.75 + 0.25 * (D.R.def / 99) + 0.1 * (D.R.hIn - P.R.hIn) / 6;
    if (k > c) { c = k; who = D; }
  }
  return { c: clamp(c, 0, 1), who };
}

export function shotChance(G, P, type, at) {
  const R = P.R, T = P.T, h = hoop(T.dir); at = at || P.pos;
  const d = len(at.x - h.x, at.z - h.z), three = type === 'jump' && isThree(T.dir, at.x, at.z);
  const { c } = contestOf(G, P, at);
  let p;
  if (type === 'dunk') p = 0.95 + (R.dunk - 70) * 0.002 - c * 0.18;
  else if (type === 'layup') p = (0.56 + (R.close - 60) * 0.008) * (1 - 0.3 * c);
  else if (type === 'ft') p = 0.38 + R.ft * 0.0056;
  else {
    if (d < 3.0) p = 0.42 + (R.close - 60) * 0.0055;
    else if (!three) p = 0.36 + (R.mid - 60) * 0.0055 - Math.max(0, d - 4.5) * 0.012;
    else p = 0.345 + (R.three - 60) * 0.0058 - Math.max(0, d - 7.6) * 0.075;
    p *= 1 - 0.45 * c;
    const sp = len(P.vel.x, P.vel.z); if (sp > 3) p *= 0.86;
  }
  p *= 0.9 + 0.1 * P.stam;
  return { p: clamp(p, 0.01, 0.99), c, d, three, value: three ? 3 : 2 };
}

// which shot does a press of SHOOT make right now
export function shotType(G, P) {
  const h = hoop(P.T.dir), dx = h.x - P.pos.x, dz = h.z - P.pos.z, d = len(dx, dz);
  const sp = len(P.vel.x, P.vel.z), toward = sp > 0.5 ? (P.vel.x * dx + P.vel.z * dz) / (sp * d) : 0;
  if (d < 2.6 && (P.sprint || sp > 4.2) && toward > 0.3 && P.R.dunk >= 60) return 'dunk';
  if (d < 1.7 && P.R.dunk >= 74 && P.R.hIn >= 80) return 'dunk';
  if (d < 3.6 && toward > 0.35 && sp > 1.5) return 'layup';
  if (d < 1.6) return 'layup';
  return 'jump';
}

export const REL = { jump: 0.62, layup: 0.5, dunk: 0.48, ft: 0.62 };

// begin a shot (user or AI). The shot is released later by releaseShot.
export function startShot(G, P, type, user) {
  if (P.act && (P.act.k === 'shoot')) return;
  type = type || shotType(G, P);
  let rel = REL[type] * (1.05 - (type === 'jump' ? (P.R.three + P.R.mid) / 2 : P.R.close) / 1000);
  P.act = { k: 'shoot', type, t: 0, rel, user: !!user, held: !!user, released: false, jumped: false, start: { ...P.pos } };
  if (type === 'jump' || type === 'ft') { P.vel.x *= 0.3; P.vel.z *= 0.3; }
  emit(G, 'shotStart', { P, type, user: !!user });
}

// timing grade for user releases: e = seconds early(-)/late(+) vs. the perfect release
export function greenW(G, P, type, c) {
  const r = type === 'jump' ? (isThree(P.T.dir, P.pos.x, P.pos.z) ? P.R.three : P.R.mid) : type === 'ft' ? P.R.ft : type === 'dunk' ? P.R.dunk : P.R.close;
  let W = (0.024 + 0.032 * clamp((r - 55) / 40, 0, 1)) * DIFF.green[G.diff] * (1 - 0.55 * c);
  if (type === 'layup') W *= 1.6; if (type === 'dunk') W *= 1.9;
  return W;
}
function grade(G, P, type, e, c) {
  const W = greenW(G, P, type, c);
  const a = Math.abs(e);
  if (a <= W) return 'green';
  if (a <= W + 0.045) return e < 0 ? 'slightly early' : 'slightly late';
  if (a <= W + 0.11) return e < 0 ? 'early' : 'late';
  return e < 0 ? 'very early' : 'very late';
}

function releaseShot(G, P) {
  const A = P.act; if (!A || A.released) return;
  A.released = true; A.relT = A.t;
  const b = G.ball, T = P.T, h = hoop(T.dir);
  const ch = shotChance(G, P, A.type);
  let p = ch.p, g = null;
  const tapped = A.user && (A.type === 'layup' || A.type === 'dunk') && A.t < 0.1;
  if (A.user && G.opts.meter !== false && !tapped) {
    g = grade(G, P, A.type, A.t - A.rel, ch.c);
    const mul = { green: 9, 'slightly early': 0.85, 'slightly late': 0.85, early: 0.5, late: 0.5, 'very early': 0.12, 'very late': 0.12 }[g];
    p = g === 'green' ? (ch.c > 0.75 ? 0.75 : 1) : p * mul * DIFF.userMake[G.diff];
  } else if (A.user) p *= DIFF.userMake[G.diff];
  else if (!T.user) p *= DIFF.cpuMake[G.diff];
  // blocked? a defender in the air with his hands up close to the ball
  const blocker = blockCheck(G, P, A);
  const make = !blocker && rnd(G) < clamp(p, 0, 1);
  // foul on the shot
  let foul = null;
  if (ch.c > 0.35 && !blocker) {
    const fp = (A.type === 'jump' ? 0.035 : 0.13) * ch.c * (A.type === 'dunk' ? 0.8 : 1);
    if (rnd(G) < fp) foul = contestOf(G, P).who;
  }
  const hand = handPos(P);
  b.state = 'air'; b.kind = 'shot'; b.holder = null; b.lastTouch = P; b.rimHit = false; b.boardHit = false; b.scored = false; b.bounces = 0; b.madeHandled = false;
  b.p = { ...hand };
  b.shot = { P, type: A.type, make, value: A.type === 'ft' ? 1 : ch.value, three: ch.three, foul, at: { ...P.pos }, t: G.t, clockAt: G.clock, p, g, assist: assistOf(G, P), counted: false };
  P.box.fga += A.type === 'ft' ? 0 : 1; if (ch.three && A.type === 'jump') P.box.tpa++;
  if (A.type === 'ft') P.box.fta++;
  if (blocker) { doBlock(G, P, blocker); emit(G, 'release', { P, g, p, type: A.type, blocked: true }); return; }
  if (foul && !make) {
    // shooting foul on a miss: no FGA, free throws for the value of the shot
    P.box.fga--; if (ch.three && A.type === 'jump') P.box.tpa--;
    foul.box.pf++; foul.T.fouls++;
    emit(G, 'foul', { P: foul, on: P, shooting: true });
    b.shot.foulMiss = true;
    whistle(G, 'shooting foul', () => setupFT(G, P, ch.value, false), 1.5);
  }
  if (A.type === 'dunk') {
    // the dunker carries it in: ball goes straight down through (or off the back rim on a miss)
    const off = make ? 0 : 0.2;
    const dirx = h.x - P.pos.x, dirz = h.z - P.pos.z, dl = len(dirx, dirz) || 1;
    b.p = { x: h.x - dirx / dl * (0.1 - off) , y: h.y + 0.32, z: h.z - dirz / dl * (0.1 - off) };
    b.v = make ? { x: 0, y: -4.5, z: 0 } : { x: dirx / dl * -1.2, y: 4.2, z: dirz / dl * -1.2 + (rnd(G) - 0.5) * 2 };
    if (!make) b.rimHit = true;
    emit(G, 'release', { P, g, p, type: 'dunk', make });
    return;
  }
  // aim point: centre for makes, off the rim for misses
  let ax = h.x, az = h.z;
  const dx = h.x - b.p.x, dz = h.z - b.p.z, dl = len(dx, dz) || 1, fx = dx / dl, fz = dz / dl;
  let arc = A.type === 'layup' ? 0.75 : A.type === 'ft' ? 1.45 : clamp(1.05 + ch.d * 0.09, 1.2, 2.1);
  if (make) {
    const s = (rnd(G) - 0.5) * 0.06; ax += -fz * s; az += fx * s;

  } else {
    // front, back or side rim
    const r = rnd(G), side = rnd(G) < 0.5 ? -1 : 1;
    let off = 0.2 + rnd(G) * 0.14;
    if (g && (g.includes('early'))) off *= -1; // early = short
    else if (g && g.includes('late')) off *= 1;  // late = long
    else if (r < 0.35) off *= -1;
    const sideOff = (rnd(G) - 0.5) * 0.24;
    ax += fx * off - fz * sideOff * side; az += fz * off + fx * sideOff * side;
    if (A.type === 'layup' && rnd(G) < 0.35) { bankShot(G, b, h, fx, fz, P, 0.12 + rnd(G) * 0.12); emit(G, 'release', { P, g, p, type: A.type }); return; }
  }
  const L = launch(b.p, { x: ax, y: h.y + 0.02, z: az }, arc);
  b.v = L.v; b.spin = -8;
  emit(G, 'release', { P, g, p, type: A.type, make });
}

function bankShot(G, b, h, fx, fz, P, miss = 0) {
  // aim at a point on the glass that reflects into the rim
  const bx = Math.sign(h.x) * (CT.BOARD_X - 0.03);
  const tgt = { x: bx - Math.sign(h.x) * 0.02, y: h.y + 0.38 + miss, z: h.z + (b.p.z - h.z) * 0.18 };
  const L = launch(b.p, tgt, 0.35);
  b.v = L.v; b.spin = -6;
}

function blockCheck(G, P, A) {
  const hp = handPos(P);
  for (const D of G.teams[1 - P.ti].on) {
    if (D.y < 0.15) continue;
    const d = len(D.pos.x - P.pos.x, D.pos.z - P.pos.z);
    const top = D.reach + D.y + 0.1;
    if (d < 1.1 && top > hp.y + 0.05) {
      const close = clamp((1.1 - d) / 0.5, 0, 1), over = clamp((top - hp.y) / 0.5, 0, 1);
      let k = (0.06 + (D.R.block - 60) * 0.005) * close * (0.5 + 0.5 * over) * ({ jump: 0.55, layup: 1.25, dunk: 0.7, ft: 0 }[A.type] ?? 1);
      k *= 1 - clamp((P.R.hIn - D.R.hIn) * 0.03, -0.3, 0.4);
      if (D.T.user && D.act && D.act.k === 'block') k *= 1.3;
      if (rnd(G) < clamp(k, 0, 0.45)) return D;
    }
  }
  return null;
}
function doBlock(G, P, D) {
  const b = G.ball; b.shot.blocked = D; b.kind = 'loose'; b.lastTouch = D;
  const a = rnd(G) * Math.PI * 2;
  b.v = { x: Math.cos(a) * 3 + (P.pos.x - D.pos.x) * 2, y: 2 + rnd(G) * 2, z: Math.sin(a) * 3 + (P.pos.z - D.pos.z) * 2 };
  b.p.y = Math.max(b.p.y, 2.4);
  D.box.blk++;
  emit(G, 'block', { P: D, shooter: P });
}

function assistOf(G, P) {
  const lp = G.lastPass;
  if (lp && lp.to === P && lp.from.ti === P.ti && G.t - lp.caught < 4.5) return lp.from;
  return null;
}

// approximate hand position (engine side; the renderer uses real bones)
export function handPos(P) {
  const A = P.act, s = P.R.hM / 1.98;
  const fx = Math.sin(P.head), fz = Math.cos(P.head);
  if (A && A.k === 'shoot') {
    if (A.type === 'dunk') return { x: P.pos.x + fx * 0.3, y: P.y + P.reach + 0.05, z: P.pos.z + fz * 0.3 };
    return { x: P.pos.x + fx * 0.25, y: P.y + P.R.hM * (A.type === 'layup' ? 1.25 : 1.18), z: P.pos.z + fz * 0.25 };
  }
  return { x: P.pos.x + fx * 0.35, y: 1.05 * s, z: P.pos.z + fz * 0.35 };
}

// ---------------------------------------------------------------------------------------------------------------
// passing
export function doPass(G, P, Q, kind = 'pass') {
  const b = G.ball; if (b.holder !== P || !Q || Q === P) return false;
  const from = handPos(P); from.y = Math.max(from.y, 1.2);
  let to;
  if (kind === 'lob') {
    const h = hoop(Q.T.dir), dx = Q.pos.x - h.x, dz = Q.pos.z - h.z, dl = len(dx, dz) || 1;
    to = { x: h.x + dx / dl * 0.55, y: h.y + 0.55, z: h.z + dz / dl * 0.55 };
    const L = launch(from, to, 1.1);
    b.v = L.v; b.pass = { from: P, to: Q, kind, T: L.T, t: 0, at: to };
    Q.ai.oop = { at: to, T: L.T, t: 0 };
  } else {
    // lead the receiver a little
    const dist = len(Q.pos.x - from.x, Q.pos.z - from.z), speed = 11 + P.R.pass * 0.05, T = dist / speed;
    to = { x: Q.pos.x + Q.vel.x * T * 0.8, y: 1.15, z: Q.pos.z + Q.vel.z * T * 0.8 };
    const L = passVel(from, to, speed);
    b.v = L.v; b.pass = { from: P, to: Q, kind, T: L.T, t: 0, at: to };
  }
  b.state = 'air'; b.kind = kind; b.holder = null; b.lastTouch = P; b.p = from; b.shot = null; b.rimHit = false; b.scored = false; b.madeHandled = false;
  P.act = { k: 'pass', t: 0, dur: 0.35 };
  G.lastPass = { from: P, to: Q, t: G.t, caught: G.t + 9 };
  if (G.phase === 'inbound') { G.phase = 'live'; G.inb = null; G.shotOn = true; G.clockRun = true; b.pass.inb = true; }
  emit(G, 'pass', { P, Q, kind });
  return true;
}

function catchBall(G, P, how) {
  const b = G.ball, prevTeam = b.lastTouch ? b.lastTouch.ti : -1, wasShot = !!b.shot;
  const shotP = b.shot && b.shot.P;
  b.state = 'held'; b.holder = P; b.kind = null; b.lastTouch = P; b.pass = null; b.v = { x: 0, y: 0, z: 0 };
  P.ai.oop = null;
  if (G.lastPass && G.lastPass.to === P) G.lastPass.caught = G.t;
  if (how === 'reb') {
    P.box.reb++;
    if (shotP && shotP.ti === P.ti) { P.box.oreb++; G.shot = Math.max(G.shot, 14); emit(G, 'reb', { P, off: true }); }
    else emit(G, 'reb', { P, off: false });
  }
  if (G.poss !== P.ti) {
    // steal / defensive rebound / loose ball recovery -> new possession
    if (how === 'int') { P.box.stl++; const v = G.lastPass && G.lastPass.from; if (v) v.box.to++; emit(G, 'steal', { P, from: v, int: true }); }
    changePoss(G, P.ti);
  } else if (how === 'reb' && wasShot && b.rimHit) { G.shot = 14; }
  b.shot = null;
  if (G.phase === 'tip') { G.phase = 'live'; G.clockRun = true; G.shotOn = true; if (G.firstPoss < 0) G.firstPoss = P.ti; }
  P.act = how === 'reb' ? P.act : { k: 'catch', t: 0, dur: 0.22 };
  emit(G, 'catch', { P, how });
}

// ---------------------------------------------------------------------------------------------------------------
// steals and dribble moves
export function trySteal(G, D) {
  if (D.act && D.act.k !== 'stance') return;
  D.act = { k: 'steal', t: 0, dur: 0.45 };
  const H = holder(G);
  if (!H || H.ti === D.ti) { D.slow = 0.25; return; }
  const d = len(H.pos.x - D.pos.x, H.pos.z - D.pos.z);
  if (d > 1.5) { D.slow = 0.3; return; }
  const shooting = H.act && H.act.k === 'shoot';
  // which side is the ball on? (reaching across the body is harder)
  const fx = Math.sin(H.head), fz = Math.cos(H.head);
  let k = 0.13 + (D.R.steal - H.R.handle) * 0.006 - (d - 0.8) * 0.12 + (shooting ? -0.1 : 0) + (H.act && H.act.k === 'move' ? -0.06 : 0);
  k *= DIFF.cpuD[G.diff] ** (D.T.user ? 0 : 1);
  if (rnd(G) < clamp(k, 0.02, 0.45)) {
    const b = G.ball; b.state = 'air'; b.kind = 'loose'; b.holder = null; b.lastTouch = D; b.shot = null;
    b.p = handPos(H); b.v = { x: (D.pos.x - H.pos.x) * 1.5 + (rnd(G) - 0.5) * 2, y: 1.2, z: (D.pos.z - H.pos.z) * 1.5 + (rnd(G) - 0.5) * 2 };
    H.act = { k: 'stumble', t: 0, dur: 0.35 };
    G.pendingSteal = { D, H, t: G.t };
    emit(G, 'poke', { P: D, from: H });
  } else {
    if (rnd(G) < 0.13 + (D.T.user ? 0.05 : 0)) { foul(G, D, H, false); return; }
    D.slow = 0.55; // off balance
  }
}

export function dribbleMove(G, P, ix, iz) {
  if (holder(G) !== P || (P.act && P.act.k !== 'catch')) return;
  const fx = Math.sin(P.head), fz = Math.cos(P.head);
  const il = len(ix, iz); let kind = 'btb', dx = fx, dz = fz;
  if (il > 0.3) {
    const nx = ix / il, nz = iz / il, fwd = nx * fx + nz * fz, side = nx * fz - nz * fx; // side>0: to the player's left
    if (fwd < -0.35) kind = 'spin';
    else if (Math.abs(side) > 0.4) kind = 'cross';
    dx = nx; dz = nz;
  }
  if (kind === 'cross') P.hand = P.hand === 'r' ? 'l' : 'r';
  P.act = { k: 'move', kind, t: 0, dur: kind === 'spin' ? 0.5 : 0.38, dx, dz };
  P.burst = kind === 'spin' ? 0.5 : 0.4;
  // ankle breaker on the man guarding him
  const D = G.teams[1 - P.ti].on.map(D => [D, len(D.pos.x - P.pos.x, D.pos.z - P.pos.z)]).sort((a, b) => a[1] - b[1])[0];
  if (D && D[1] < 1.6 && !D[0].slow) {
    const k = 0.07 + (P.R.handle - D[0].R.def) * 0.006 + (D[0].stance ? -0.03 : 0.02) + (kind === 'spin' ? 0.02 : 0);
    if (rnd(G) < clamp(k, 0.02, 0.35)) { D[0].act = { k: 'stumble', t: 0, dur: 0.9 }; D[0].slow = 0.9; emit(G, 'ankle', { P, D: D[0] }); }
    else D[0].slow = Math.max(D[0].slow, 0.18);
  }
  emit(G, 'move', { P, kind });
}

export function jumpBlock(G, D) {
  if (D.y > 0.01 || (D.act && D.act.k === 'block')) return;
  D.act = { k: 'block', t: 0, dur: 0.9 };
  D.vy = D.jumpV * 1.0; D.y = 0.001;
  emit(G, 'jump', { P: D });
}

function foul(G, D, P, shooting, shot) {
  D.box.pf++; D.T.fouls++;
  emit(G, 'foul', { P: D, on: P, shooting });
  if (shooting) return;
  const bonus = D.T.fouls >= 5;
  const spot = { x: clamp(P.pos.x, -CT.HL + 1, CT.HL - 1), z: (P.pos.z >= 0 ? 1 : -1) * (CT.HW + 0.45) };
  whistle(G, 'foul', () => bonus ? setupFT(G, P, 2, false) : setupInbound(G, P.ti, spot, 'foul'));
}

// ---------------------------------------------------------------------------------------------------------------
// main step
export function step(G, dt, U) {
  G.t += dt; G.phaseT += dt;
  U = U || {};
  if (G.over) return;
  // clocks
  if (G.clockRun && (G.phase === 'live')) {
    G.clock -= dt;
    if (G.shotOn) G.shot -= dt;
    for (const T of G.teams) for (const P of T.on) P.box.min += dt;
    if (G.shotOn && G.shot <= 0 && G.clock > 0 && !(G.ball.state === 'air' && G.ball.kind === 'shot')) {
      G.shot = 0; const T = offense(G);
      if (T) { const H = holder(G); if (H) H.box.to++; emit(G, 'violation', { why: 'SHOT CLOCK', ti: T.i }); whistle(G, 'shot clock', () => setupInbound(G, 1 - T.i, sideSpot(G, 1 - T.i), 'violation')); }
    }
    if (G.clock <= 0) { G.clock = 0; endPeriod(G); }
  }
  // phases
  if (G.phase === 'dead') { if (G.phaseT > G.deadFor) { const n = G.next; G.next = null; n && n(); } }
  else if (G.phase === 'qbreak') { if (G.phaseT > 3.2) startPeriod(G); }
  else if (G.phase === 'buzzer') {
    const b = G.ball;
    if ((b.state === 'held' || (b.shot && b.shot.counted && (!b.scored || b.p.y < 1)) || G.phaseT > 4) && G.after) { const f = G.after; G.after = null; G.phase = 'dead'; G.deadFor = 99; f(); }
  }
  else if (G.phase === 'tip') tipStep(G, dt);
  else if (G.phase === 'inbound') inboundStep(G, dt, U);
  else if (G.phase === 'ft') ftStep(G, dt, U);

  // controlled players
  updateControl(G, U);
  // AI intentions
  for (const T of G.teams) aiTeam(G, T, dt);
  // user intentions override for the controlled player
  for (const T of G.teams) if (T.user && G.ctl[T.i]) userStep(G, G.ctl[T.i], U, dt);
  // move everybody
  for (const P of allOn(G)) movePlayer(G, P, dt);
  separate(G);
  // ball
  ballStep(G, dt);
  // stamina on the bench
  for (const T of G.teams) for (const P of T.roster) if (!P.onCourt) P.stam = Math.min(1, P.stam + dt * 0.03);
}

function sideSpot(G, ti) { const T = G.teams[ti]; return { x: -T.dir * 4, z: CT.HW + 0.45 }; }

function endPeriod(G) {
  G.clockRun = false;
  // a shot in the air at the buzzer still counts (released before 0)
  emit(G, 'buzzer', { q: G.q });
  const b = G.ball;
  const finish = () => {
    const [h, a] = [G.teams[0].score, G.teams[1].score];
    if (G.q >= 4 && h !== a) { G.phase = 'final'; G.over = true; emit(G, 'final', {}); return; }
    G.phase = 'qbreak'; G.phaseT = 0; emit(G, 'qend', { q: G.q });
  };
  if (b.state === 'air' && b.kind === 'shot' && b.shot && b.shot.clockAt > 0) { G.phase = 'buzzer'; G.phaseT = 0; G.after = finish; return; }
  G.phase = 'dead'; G.phaseT = 0; G.deadFor = 1.6; G.next = finish;
}

function startPeriod(G) {
  G.q++;
  if (G.q === 3) { for (const T of G.teams) T.dir *= -1; }
  G.clock = G.q > 4 ? Math.max(60, G.qLen * 0.42) : G.qLen; if (G.q > 4) G.ot++;
  for (const T of G.teams) { T.fouls = 0; for (const P of T.roster) P.stam = Math.min(1, P.stam + 0.25); }
  emit(G, 'quarter', { q: G.q });
  if (G.q > 4) { setupTip(G); return; }
  // quarter possession alternates: team that lost the tip gets Q2 and Q3, the tip winner Q4
  const fp = G.firstPoss < 0 ? 0 : G.firstPoss, ti = (G.q === 2 || G.q === 3) ? 1 - fp : fp;
  const T = G.teams[ti];
  setupInbound(G, ti, { x: -T.dir * 0.3, z: CT.HW + 0.45 }, 'period');
  // put everyone back in a sensible spot
  for (const S of G.teams) S.on.forEach((P, k) => { const w = fromHoop(S.dir, 8 + k * 1.2, (k - 2) * 2.4 * S.dir); P.pos = { x: -S.dir * 2 - S.dir * k * 0.8, z: (k - 2) * 2.2 }; P.vel = { x: 0, z: 0 }; P.act = null; P.y = 0; });
  G.inb.P.pos = { x: G.inb.spot.x, z: G.inb.spot.z };
}

function tipStep(G, dt) {
  const b = G.ball;
  if (G.phaseT > 1.2 && b.state === 'dead') {
    b.state = 'air'; b.kind = 'tip'; b.p = { x: 0, y: 1.9, z: 0 }; b.v = { x: 0, y: 6.4, z: 0 }; b.lastTouch = null; b.shot = null;
    emit(G, 'tipToss', {});
  }
  if (b.state === 'air' && b.kind === 'tip') {
    const [A, B] = G.teams.map(T => tipOrder(T)[0]);
    // jumpers go up as the ball peaks
    for (const P of [A, B]) if (P.y === 0 && b.v.y < 1.6 && !P.tipped) { P.vy = P.jumpV; P.y = 0.001; P.act = { k: 'tip', t: 0, dur: 0.8 }; P.tipped = true; }
    if (b.v.y < -0.4 && !G.tipDone) {
      G.tipDone = true; A.tipped = B.tipped = false;
      const sa = A.R.hIn + A.R.reb / 8 + rnd(G) * 8, sb = B.R.hIn + B.R.reb / 8 + rnd(G) * 8;
      const W = sa >= sb ? A : B;
      const mate = W.T.on.filter(p => p !== W).sort((p, q) => (p.pos.x * W.T.dir) - (q.pos.x * W.T.dir))[0];
      const L = passVel(b.p, { x: mate.pos.x, y: 1.3, z: mate.pos.z }, 8);
      b.v = L.v; b.kind = 'loose'; b.lastTouch = W;
      emit(G, 'tip', { P: W });
    }
  }
}

function inboundStep(G, dt, U) {
  const I = G.inb; if (!I) return;
  I.t += dt;
  const P = I.P, s = I.spot;
  // inbounder walks to the spot
  P.ai.dest = { x: s.x, z: s.z, s: 1 };
  const there = len(P.pos.x - s.x, P.pos.z - s.z) < 0.35;
  if (there) { P.pos.x = s.x; P.pos.z = s.z; }
  const ready = there && I.t > (I.why === 'make' ? 1.3 : 1.6);
  const userInb = P.T.user;
  if (ready && (!userInb || U.pass || I.t > 3.2)) {
    const Q = (userInb && U.pass) ? (pickPassTarget(G, P, U.mx, U.mz) || I.recv) : I.recv;
    doPass(G, P, Q, 'pass');
  }
}

function ftStep(G, dt, U) {
  const F = G.ft; if (!F) return;
  const P = F.P, b = G.ball;
  if (F.resetAt && G.t > F.resetAt) {
    F.resetAt = 0; b.state = 'held'; b.holder = P; b.kind = null; b.shot = null; b.scored = false; b.madeHandled = false; b.rimHit = false; P.act = null; P.y = 0; P.vy = 0;
  }
  if (b.state === 'held' && b.holder === P && !P.act) {
    F.wait -= dt;
    if (F.wait <= 0) {
      if (P.T.user) { if (U.shootDown) startShot(G, P, 'ft', true); }
      else if (F.wait < -0.6) startShot(G, P, 'ft', false);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// control switching for the user team
function updateControl(G, U) {
  for (const T of G.teams) {
    if (!T.user) continue;
    let C = G.ctl[T.i];
    if (C && !C.onCourt) C = null;
    const H = holder(G);
    if (H && H.ti === T.i && G.phase !== 'inbound') C = H; // offense: you are the ball handler
    else if (G.phase === 'inbound' && G.inb && G.inb.P.ti === T.i) C = G.inb.recv;
    if (!C) C = nearestTo(T.on, G.ball.p);
    if (U.switch && G.poss !== T.i) {
      // defense: switch to the defender closest to the ball (not the current one)
      const c = T.on.filter(p => p !== C).sort((a, b) => len(a.pos.x - G.ball.p.x, a.pos.z - G.ball.p.z) - len(b.pos.x - G.ball.p.x, b.pos.z - G.ball.p.z))[0];
      if (c) C = c;
      emit(G, 'switch', { P: C });
    }
    if (G.poss !== T.i && G.ctl[T.i] && G.ctl[T.i].ti === T.i && !U.switch && G.lastPossCtl === G.poss) C = G.ctl[T.i] && G.ctl[T.i].onCourt ? G.ctl[T.i] : C;
    if (G.poss !== T.i && G.lastPossCtl !== G.poss) {
      // new defensive possession: take the man guarding the ball, or the closest to the ball
      const D = T.on.find(p => p.ai.man && p.ai.man === H) || nearestTo(T.on, G.ball.p);
      if (D) C = D;
    }
    G.lastPossCtl = G.poss;
    if (C !== G.ctl[T.i]) { G.ctl[T.i] = C; }
  }
}
export function nearestTo(list, p) { let best = null, bd = 1e9; for (const P of list) { const d = len(P.pos.x - p.x, P.pos.z - p.z); if (d < bd) { bd = d; best = P; } } return best; }

function userStep(G, P, U, dt) {
  // movement
  const il = Math.min(1, len(U.mx || 0, U.mz || 0));
  P.sprint = !!U.sprint && il > 0.2; P.stance = !!U.stance && G.poss !== P.ti;
  if (G.phase === 'ft' || (G.phase === 'inbound' && G.inb && G.inb.P === P)) { /* fixed */ }
  else if (!(P.act && P.act.k === 'shoot' && (P.act.type === 'jump' || P.act.type === 'ft'))) {
    P.ai.dest = null;
    P.want = { x: il > 0.08 ? U.mx : 0, z: il > 0.08 ? U.mz : 0, s: il };
    P.ai.user = true;
  }
  const H = holder(G);
  if (H === P) {
    if (U.shootDown && !P.act) startShot(G, P, null, true);
    if (U.pass && (!P.act || P.act.k === 'catch' || P.act.k === 'move')) { const Q = pickPassTarget(G, P, U.mx, U.mz); if (Q) doPass(G, P, Q); }
    if (U.lob && (!P.act || P.act.k === 'catch')) { const Q = lobTarget(G, P); if (Q) doPass(G, P, Q, 'lob'); }
    if (U.move) dribbleMove(G, P, U.mx, U.mz);
    if (U.screen) {
      const S = P.T.on.filter(q => q !== P).sort((a, b) => (b.R.hIn - a.R.hIn) * 0.3 + len(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - len(b.pos.x - P.pos.x, b.pos.z - P.pos.z))[0];
      if (S) { S.ai.screen = { t: 0, side: G.rng() < 0.5 ? 1 : -1 }; emit(G, 'callScreen', { P, S }); }
    }
  } else if (G.poss !== P.ti && G.phase === 'live') {
    if (U.steal) trySteal(G, P);
    if (U.block || U.shootDown && false) jumpBlock(G, P);
  } else if (G.poss === P.ti && G.ball.state !== 'held') {
    if (U.block) jumpBlock(G, P); // jump for a rebound
  }
  if (P.act && P.act.k === 'shoot' && P.act.user && P.act.held && (U.shootUp || !U.shootHeld)) {
    P.act.held = false;
    if (P.act.t >= 0.12 || P.act.type !== 'jump') { P.act.relAt = P.act.t; }
    else { P.act.relAt = Math.max(P.act.t, 0.12); }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// movement + action timelines
function movePlayer(G, P, dt) {
  const A = P.act;
  if (A) { A.t += dt; actStep(G, P, A, dt); if (P.act === A && A.dur && A.t > A.dur) P.act = null; }
  if (P.slow > 0) P.slow = Math.max(0, P.slow - dt);
  if (P.burst > 0) P.burst = Math.max(0, P.burst - dt);
  // desired velocity
  let wx = 0, wz = 0, ws = 0;
  if (P.ai.dest && !P.ai.user) {
    const d = P.ai.dest, dx = d.x - P.pos.x, dz = d.z - P.pos.z, dl = len(dx, dz);
    if (dl > 0.12) { const s = Math.min(1, dl / 1.2) * (d.s ?? 1); wx = dx / dl * s; wz = dz / dl * s; ws = s; }
    P.sprint = !!d.sprint;
  } else if (P.want) { wx = P.want.x; wz = P.want.z; ws = P.want.s; }
  P.ai.user = false;
  const R = P.R, has = G.ball.holder === P;
  let vmax = (3.6 + R.speed * 0.017) * (P.sprint ? 1.42 : 1) * (has ? 0.93 : 1) * (0.82 + 0.18 * P.stam);
  if (P.stance) vmax *= 0.62;
  if (P.slow > 0) vmax *= 0.35;
  if (P.burst > 0) vmax *= 1.18;
  const lock = A && ((A.k === 'shoot' && (A.type === 'jump' || A.type === 'ft')) || A.k === 'stumble' || A.k === 'pass' && A.t < 0.15);
  if (lock) { wx = 0; wz = 0; }
  if (A && A.k === 'move' && A.t < A.dur * 0.8) { wx = A.dx; wz = A.dz; ws = 1; vmax *= 1.15; }
  if (A && A.k === 'shoot' && (A.type === 'dunk' || A.type === 'layup')) {
    // drive at the rim
    // run to a spot in front of the rim (never under / behind the glass)
    const h = hoop(P.T.dir), ox = P.pos.x - h.x, oz = P.pos.z - h.z, ol = len(ox, oz) || 1;
    let nx = ox / ol, nz = oz / ol; if (Math.sign(nx) === P.T.dir) { nx = -P.T.dir * 0.3; nz = Math.sign(oz || 1) * 0.95; }
    const stop = A.type === 'dunk' ? 0.6 : 1.05, tx = h.x + nx * stop, tz = h.z + nz * stop;
    const dx = tx - P.pos.x, dz = tz - P.pos.z, dl = len(dx, dz);
    if (dl > 0.12) { const s = Math.min(1, dl / 0.6); wx = dx / dl * s; wz = dz / dl * s; } else { wx = 0; wz = 0; }
    vmax = Math.max(vmax, 4.8);
  }
  const tvx = wx * vmax, tvz = wz * vmax;
  const air = P.y > 0.02;
  const acc = air ? 2 : (P.sprint ? 10 : 13) * (0.9 + R.speed / 1000);
  const dvx = tvx - P.vel.x, dvz = tvz - P.vel.z, dl = len(dvx, dvz), m = acc * dt;
  if (dl <= m) { P.vel.x = tvx; P.vel.z = tvz; } else { P.vel.x += dvx / dl * m; P.vel.z += dvz / dl * m; }
  P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
  // keep players on the floor area (a little out of bounds allowed)
  P.pos.x = clamp(P.pos.x, -CT.HL - 1.2, CT.HL + 1.2); P.pos.z = clamp(P.pos.z, -CT.HW - 1.2, CT.HW + 1.2);
  // vertical
  if (P.y > 0 || P.vy > 0) {
    P.vy -= GRAV * dt; P.y += P.vy * dt;
    if (P.hang > 0) { P.hang -= dt; P.y = Math.max(P.y, P.hangY); P.vy = Math.max(P.vy, 0); }
    if (P.y <= 0) { P.y = 0; P.vy = 0; emit(G, 'land', { P }); }
  }
  // facing
  const sp = len(P.vel.x, P.vel.z);
  let face = null;
  if (A && A.k === 'shoot') face = hoop(P.T.dir);
  else if (P.ai.face) face = P.ai.face;
  let th = P.head;
  if (face) th = Math.atan2(face.x - P.pos.x, face.z - P.pos.z);
  else if (sp > 0.6) th = Math.atan2(P.vel.x, P.vel.z);
  if (A && A.k === 'move' && A.kind === 'spin') th = P.head + dt * 13;
  let dh = th - P.head; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  const turn = (A && A.k === 'move' && A.kind === 'spin') ? 99 : (P.sprint ? 6 : 10) * dt;
  P.head += clamp(dh, -turn, turn);
  // stamina
  const drain = P.sprint && sp > 3 ? 0.03 : sp > 2 ? 0.006 : -0.012;
  P.stam = clamp(P.stam - drain * dt * (1.4 - R.stam / 100) * 1.6, 0, 1);
  P.speed = sp;
}

function actStep(G, P, A, dt) {
  if (A.k === 'shoot') {
    const gather = A.type === 'jump' ? 0.16 : A.type === 'ft' ? 0.3 : A.type === 'dunk' ? 0.16 : 0.2;
    if (!A.jumped && A.t >= gather) {
      A.jumped = true;
      if (A.type !== 'ft') {
        const air = A.rel - gather + 0.05; // apex near release
        P.vy = Math.min(P.jumpV * (A.type === 'jump' ? 0.7 : 1.05), GRAV * air);
        if (A.type === 'dunk') P.vy = Math.max(P.vy, Math.sqrt(2 * GRAV * Math.max(0.3, CT.RIM_Y + 0.1 - P.reach)));
        P.y = 0.001;
      }
    }
    const H = holder(G);
    if (!A.released && H === P) {
      let go = false;
      if (A.user) { if (A.relAt != null) { A.t = Math.max(A.t, A.relAt); go = true; } else if (A.t > A.rel * 1.6) { A.relAt = A.t; go = true; } }
      else if (A.t >= A.rel * (1 + (rnd(G) - 0.5) * 0.02)) go = true;
      if (go) {
        if (A.user) { const tt = A.t; A.t = A.relAt; releaseShot(G, P); A.t = tt; }
        else releaseShot(G, P);
        if (A.type === 'dunk' && G.ball.shot && G.ball.shot.make) { P.hang = 0.42; P.hangY = Math.max(0.2, CT.RIM_Y - P.reach + 0.05); }
      }
    } else if (!A.released && H !== P) { P.act = null; return; }
    if (A.released && A.t > A.relT + 0.55 && P.y === 0) P.act = null;
  } else if (A.k === 'catch' || A.k === 'pass') { /* timers only */ }
}

// player-vs-player separation (screens fall out of this) + bodies in the way
function separate(G) {
  const L = allOn(G);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const A = L[i], B = L[j];
    const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, d = len(dx, dz), min = 0.62;
    if (d < min && d > 1e-4) {
      const push = (min - d) / 2, nx = dx / d, nz = dz / d;
      // the screener / bigger body moves less
      const wa = B.R.hIn / (A.R.hIn + B.R.hIn), wb = 1 - wa;
      A.pos.x -= nx * push * 2 * wa; A.pos.z -= nz * push * 2 * wa; B.pos.x += nx * push * 2 * wb; B.pos.z += nz * push * 2 * wb;
      if (A.ti !== B.ti) { // a defender running into a screen loses speed
        for (const [X, Y] of [[A, B], [B, A]]) if (X.ai.screening && Y.ti !== X.ti && G.poss === X.ti) { Y.slow = Math.max(Y.slow, 0.5); }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
function ballStep(G, dt) {
  const b = G.ball;
  if (b.state === 'held') {
    const P = b.holder; if (!P) return;
    b.p = handPos(P);
    // stepping out of bounds with the ball
    if (G.phase === 'live' && !inBounds(P.pos.x, P.pos.z, -0.05) && !(P.act && P.act.k === 'shoot' && P.y > 0)) {
      P.box.to++; emit(G, 'turnover', { P, why: 'OUT OF BOUNDS' });
      const s = outSpot(P.pos);
      whistle(G, 'out of bounds', () => setupInbound(G, 1 - P.ti, s, 'out'));
    }
    return;
  }
  if (b.state === 'dead') return;
  const hoops = [{ ...hoop(1), dir: 1 }, { ...hoop(-1), dir: -1 }];
  b.events = [];
  stepBall(b, dt, hoops);
  for (const e of b.events) {
    if (e.t === 'rim') emit(G, 'rim', { s: e.s }); else if (e.t === 'board') emit(G, 'board', { s: e.s });
    else if (e.t === 'floor') emit(G, 'bounce', { s: e.s });
    else if (e.t === 'net') scored(G, e.hoop);
  }
  if (b.pass) b.pass.t += dt;
  // catches
  if (G.phase === 'live' || G.phase === 'tip' || G.phase === 'inbound' || G.phase === 'buzzer') tryCatches(G, dt);
  // shot that missed everything / finished: becomes a loose ball
  if (b.kind === 'shot' && b.shot && !b.scored && (b.rimHit || b.boardHit || b.p.y < 2.2) && b.v.y < 0 && !b.shot.counted) {
    if (b.shot.type !== 'ft' || b.rimHit) { b.shot.missed = true; }
  }
  if (b.kind === 'shot' && b.p.y < 1.6 && !b.scored && b.shot && !b.shot.counted) {
    b.shot.counted = true; emit(G, 'miss', { P: b.shot.P, airball: !b.rimHit && !b.boardHit });
    if (G.phase === 'ft' || (b.shot.type === 'ft')) ftAfter(G, false);
    if (G.phase === 'buzzer') { const f = G.after; G.after = null; f && f(); return; }
    if (G.shotOn && b.rimHit) { /* offensive rebound resets to 14 in catchBall */ }
  }
  // dead ball after a make: wait for it to drop, then inbound
  if (b.scored && b.p.y < 0.9 && !b.madeHandled) { b.madeHandled = true; afterMake(G); return; }
  // out of bounds
  if (G.phase === 'live' && b.state !== 'held' && !b.scored && (!inBounds(b.p.x, b.p.z, -0.1)) && b.p.y < 1.5 && !(b.pass && b.pass.inb && b.pass.t < 0.7)) {
    const lt = b.lastTouch ? b.lastTouch.ti : (G.poss >= 0 ? G.poss : 0);
    emit(G, 'out', {});
    const s = outSpot(b.p);
    b.state = 'dead';
    whistle(G, 'out of bounds', () => setupInbound(G, 1 - lt, s, 'out'));
  }
  // a pass that nobody caught: loose
  if (b.kind === 'pass' && b.pass && b.pass.t > b.pass.T + 0.35) { b.kind = 'loose'; b.pass = null; }
  if (b.kind === 'lob' && b.pass && b.pass.t > b.pass.T + 0.4) { b.kind = 'loose'; b.pass = null; }
}

function outSpot(p) {
  // nearest point on the boundary, then step outside
  const ox = CT.HL - Math.abs(p.x), oz = CT.HW - Math.abs(p.z);
  if (oz < ox) return { x: clamp(p.x, -CT.HL + 1.5, CT.HL - 1.5), z: Math.sign(p.z || 1) * (CT.HW + 0.45) };
  return { x: Math.sign(p.x) * (CT.HL + 0.45), z: clamp(p.z, -CT.HW + 1, CT.HW - 1) * 0.5 + (p.z >= 0 ? 1.5 : -1.5) };
}

function tryCatches(G, dt) {
  const b = G.ball;
  if (b.state === 'held' || b.scored || b.kind === 'tip') return;
  let best = null, bs = -1;
  for (const P of allOn(G)) {
    if (P.act && (P.act.k === 'stumble' || (P.act.k === 'pass' && P.act.t < 0.3))) continue;
    if (b.kind === 'shot' && b.shot && P === b.shot.P && !b.rimHit && !b.boardHit) continue;
    if ((b.kind === 'pass' || b.kind === 'lob') && b.pass && P.ti === b.pass.from.ti && P !== b.pass.to) continue;
    if ((b.kind === 'pass' || b.kind === 'lob') && b.pass && P !== b.pass.to && b.pass.t < 0.12) continue;
    if (b.kind === 'shot' && b.shot && !b.rimHit && !b.boardHit && (b.v.y > -1 || b.p.y > 2.4)) continue; // no catching a shot before it hits iron
    const dx = b.p.x - P.pos.x, dz = b.p.z - P.pos.z, hd = len(dx, dz);
    const top = P.y + P.reach + 0.05, bot = 0.15;
    const rad = b.kind === 'pass' && b.pass && b.pass.to === P ? 0.85 : b.kind === 'lob' && b.pass && b.pass.to === P ? 1.0 : 0.62;
    if (hd > rad || b.p.y > top || b.p.y < bot) continue;
    // goaltending-ish: defenders can't touch a make on its way down above the rim
    if (b.kind === 'shot' && b.shot && b.shot.make && !b.rimHit && b.p.y > CT.RIM_Y - 0.1) continue;
    let s = (P.R.reb + (b.kind === 'pass' && b.pass && b.pass.to === P ? 60 : 0)) + rnd(G) * 40;
    if (b.kind === 'pass' && b.pass && P.ti !== b.pass.from.ti) {
      // interception roll (once per defender per pass)
      b.pass.tried = b.pass.tried || new Set();
      if (b.pass.tried.has(P)) continue; b.pass.tried.add(P);
      const k = 0.18 + (P.R.steal - 60) * 0.008 + (b.kind === 'lob' ? 0.1 : 0) - (hd - 0.3) * 0.25;
      if (rnd(G) > clamp(k * (P.T.user ? 1 : DIFF.cpuD[G.diff]), 0.03, 0.6)) continue;
      s = 999;
    }
    if (s > bs) { bs = s; best = P; }
  }
  if (!best) return;
  if (b.kind === 'lob' && b.pass && b.pass.to === best && best.y > 0.15) { finishOop(G, best); return; }
  const how = b.kind === 'pass' && b.pass ? (best.ti === b.pass.from.ti ? 'pass' : 'int') : (b.kind === 'shot' || (b.shot && !b.scored)) ? 'reb' : 'loose';
  if (G.pendingSteal && G.t - G.pendingSteal.t < 3) {
    const S = G.pendingSteal; G.pendingSteal = null;
    if (best.ti === S.D.ti) { S.D.box.stl++; S.H.box.to++; emit(G, 'steal', { P: S.D, from: S.H }); }
  }
  catchBall(G, best, how);
}

function finishOop(G, P) {
  // caught in the air: slam it home
  const b = G.ball;
  catchBall(G, P, 'pass');
  const ch = shotChance(G, P, 'dunk');
  P.act = { k: 'shoot', type: 'dunk', t: 0.46, rel: 0.48, user: false, held: false, released: false, jumped: true, oop: true };
  P.vy = Math.max(P.vy, 0.5);
  emit(G, 'oop', { P });
}

function scored(G, H) {
  const b = G.ball, S = b.shot;
  if (!S) { // tip-in / putback by a loose ball rolling in
    const P = b.lastTouch; if (!P) return;
    const T = P.T; if (Math.sign(H.x) !== T.dir) return;
    T.score += 2; T.qScore[Math.min(3, G.q - 1)] += 2; P.box.pts += 2; P.box.fgm++; P.box.fga++;
    G.lastScore = { ti: T.i, t: G.t };
    emit(G, 'score', { P, pts: 2, type: 'putback', ti: T.i });
    return;
  }
  const P = S.P, T = P.T;
  if (Math.sign(H.x) !== T.dir) return; // wrong basket (should not happen)
  const pts = S.value;
  T.score += pts; T.qScore[Math.min(3, G.q - 1)] += pts; P.box.pts += pts;
  if (S.type === 'ft') P.box.ftm++; else { P.box.fgm++; if (S.three) P.box.tpm++; }
  if (S.assist && S.type !== 'ft') S.assist.box.ast++;
  S.counted = true;
  G.lastScore = { ti: T.i, t: G.t };
  emit(G, 'score', { P, pts, type: S.type, three: S.three, swish: !b.rimHit && !b.boardHit, assist: S.type !== 'ft' ? S.assist : null, ti: T.i, g: S.g, and1: !!S.foul });
  if (S.type === 'ft') { ftAfter(G, true); return; }
  if (S.foul) { // and one
    const D = S.foul; D.box.pf++; D.T.fouls++;
    emit(G, 'foul', { P: D, on: P, shooting: true, and1: true });
    b.andOne = { P };
  }
}

function afterMake(G) {
  const b = G.ball;
  if (G.phase === 'ft') return;
  if (G.phase === 'buzzer') { const f = G.after; G.after = null; f && f(); return; }
  const S = b.shot; const scorer = S ? S.P : b.lastTouch;
  if (b.andOne) { const P = b.andOne.P; b.andOne = null; whistle(G, 'and one', () => setupFT(G, P, 1, true), 1.4); return; }
  if (!scorer) return;
  const ti = 1 - scorer.ti, d = scorer.T.dir;
  // the team that was scored on inbounds from under the basket
  G.clockRun = G.clock < 120 && G.q >= 4 ? false : G.clockRun;
  setupInbound(G, ti, { x: d * (CT.HL + 0.45), z: (scorer.pos.z >= 0 ? -1 : 1) * 1.2 }, 'make');
  G.clockRun = !(G.q >= 4 && G.clock < 120);
  G.phase = 'inbound';
}

function ftAfter(G, made) {
  const F = G.ft; if (!F) return;
  F.i++; if (made) F.made++;
  const P = F.P;
  if (F.i < F.n) { F.resetAt = G.t + 0.9; F.wait = 1.6; return; }
  G.ft = null;
  if (made) { setupInbound(G, 1 - P.ti, { x: P.T.dir * (CT.HL + 0.45), z: -1.2 }, 'make'); }
  else { G.phase = 'live'; G.clockRun = true; G.shotOn = true; G.shot = 24; }
}

// expose the engine-side helpers needed by ai.js
export const _internal = { startShot, doPass, tryStealFn: trySteal, dribbleMove, jumpBlock, foul };
