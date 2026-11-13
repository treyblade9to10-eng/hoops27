// Ball flight + rim / backboard / floor collisions. Pure math (no THREE) so the engine can run headless.
import { CT } from './court.js';

export const G = 9.81;
const R = CT.BALL_R;

export function makeBall() {
  return {
    p: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 0 }, spin: 0,
    state: 'held',      // held | air (shot/pass/loose flying) | loose (rolling / bouncing on the floor) | dead
    holder: null, kind: null, // kind: 'shot' | 'pass' | 'lob' | 'loose' | 'tip'
    shot: null, pass: null, lastTouch: null, rimHit: false, boardHit: false, scored: false, bounces: 0,
    events: [], // collision events for audio / net: {t:'rim'|'board'|'floor'|'net'}
  };
}

// launch velocity from p0 to target t with an apex `arc` meters above the higher of the two points
export function launch(p0, t, arc) {
  const top = Math.max(p0.y, t.y) + arc;
  const vy = Math.sqrt(2 * G * (top - p0.y));
  const tUp = vy / G, tDown = Math.sqrt(2 * (top - t.y) / G), T = tUp + tDown;
  return { v: { x: (t.x - p0.x) / T, y: vy, z: (t.z - p0.z) / T }, T };
}

// straight-ish pass: speed s (m/s) with a small lift
export function passVel(p0, t, s) {
  const dx = t.x - p0.x, dz = t.z - p0.z, dy = t.y - p0.y, d = Math.hypot(dx, dz);
  const T = Math.max(0.18, d / s);
  return { v: { x: dx / T, y: dy / T + 0.5 * G * T, z: dz / T }, T };
}

// step physics. hoops = [{x,y,z,dir}] rim centres. Returns events.
export function stepBall(b, dt, hoops) {
  const sub = 4, h = dt / sub;
  for (let s = 0; s < sub; s++) {
    const py = b.p.y;
    b.v.y -= G * h;
    b.p.x += b.v.x * h; b.p.y += b.v.y * h; b.p.z += b.v.z * h;
    for (const H of hoops) {
      // backboard (a thin box facing the court)
      const bx = Math.sign(H.x) * CT.BOARD_X, face = bx - Math.sign(H.x) * 0.03;
      if (Math.abs(b.p.z) < CT.BOARD_W / 2 + R * 0.5 && b.p.y > CT.BOARD_BOT - R && b.p.y < CT.BOARD_TOP + R) {
        const pen = Math.sign(H.x) * (b.p.x + Math.sign(H.x) * R - face);
        if (pen > 0 && Math.sign(H.x) * b.p.x < CT.BOARD_X + 0.1 && Math.sign(H.x) * b.v.x > 0) {
          b.p.x -= Math.sign(H.x) * pen; b.v.x *= -0.55; b.v.y *= 0.85; b.v.z *= 0.85; b.boardHit = true;
          b.events.push({ t: 'board', s: Math.abs(b.v.x) });
        }
      }
      // rim: torus, ring radius RIM_R + tube
      const dx = b.p.x - H.x, dz = b.p.z - H.z, rh = Math.hypot(dx, dz);
      if (rh < CT.RIM_R + 0.5 && Math.abs(b.p.y - H.y) < 0.5) {
        const ring = CT.RIM_R + CT.RIM_T;
        const cx = rh > 1e-6 ? H.x + dx / rh * ring : H.x + ring, cz = rh > 1e-6 ? H.z + dz / rh * ring : H.z;
        let nx = b.p.x - cx, ny = b.p.y - H.y, nz = b.p.z - cz; const d = Math.hypot(nx, ny, nz), min = R + CT.RIM_T;
        if (d < min && d > 1e-6) {
          nx /= d; ny /= d; nz /= d;
          b.p.x += nx * (min - d); b.p.y += ny * (min - d); b.p.z += nz * (min - d);
          const vn = b.v.x * nx + b.v.y * ny + b.v.z * nz;
          if (vn < 0) {
            const e = 0.52; // rim restitution
            b.v.x -= (1 + e) * vn * nx; b.v.y -= (1 + e) * vn * ny; b.v.z -= (1 + e) * vn * nz;
            b.v.x *= 0.9; b.v.z *= 0.9;
            b.rimHit = true; b.events.push({ t: 'rim', s: -vn });
          }
        }
        // scoring: centre crosses rim plane downward inside the ring
        if (!b.scored && py >= H.y && b.p.y < H.y && rh < CT.RIM_R - 0.02 && b.v.y < 0) {
          b.scored = true; b.scoredAt = H; b.events.push({ t: 'net', s: 1, hoop: H });
          // the net slows the ball and drops it straight down
          b.v.x *= 0.25; b.v.z *= 0.25; b.v.y *= 0.5;
        }
      }
      // stanchion / pole behind the board: stop balls flying too far
    }
    // floor
    if (b.p.y < R) {
      b.p.y = R;
      if (b.v.y < 0) {
        const s = -b.v.y;
        b.v.y = s > 0.6 ? s * 0.74 : 0; b.v.x *= 0.88; b.v.z *= 0.88; b.bounces++;
        if (s > 0.6) b.events.push({ t: 'floor', s });
      }
      // rolling friction
      if (b.v.y === 0) { const f = Math.max(0, 1 - 0.8 * h); b.v.x *= f; b.v.z *= f; }
    }
  }
  return b.events;
}
