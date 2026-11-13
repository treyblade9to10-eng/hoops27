// Broadcast camera: sits up on the near sideline, follows the ball across the floor with a smooth lag,
// pushes in a little on half-court sets and pulls out in transition. Variants: broadcast / high / low.
import * as THREE from '../lib/three.min.js';
import { CT } from './court.js';

const PRESETS = {
  broadcast: { h: 8.6, z: 17.2, fov: 37, lookY: 0.2, lookZ: -1.6, xk: 0.95, lead: 2.6 },
  high: { h: 12.5, z: 18.5, fov: 38, lookY: 0.0, lookZ: -1.2, xk: 0.72, lead: 1.2 },
  low: { h: 4.2, z: 12.8, fov: 44, lookY: 1.0, lookZ: -1.0, xk: 0.86, lead: 1.8 },
};

export class BroadcastCam {
  constructor(cam, kind = 'broadcast') {
    this.cam = cam; this.set(kind);
    this.x = 0; this.vx = 0; this.zoom = 1; this.shake = 0; this.tz = 0;
    this.look = new THREE.Vector3(); this.first = true;
  }
  set(kind) { this.kind = PRESETS[kind] ? kind : 'broadcast'; this.p = PRESETS[this.kind]; }
  update(dt, G, aspect) {
    const p = this.p, b = G.ball;
    // focus: the ball, pulled toward the basket it is going to
    let fx = b.p.x, fz = b.p.z;
    const off = G.poss >= 0 ? G.teams[G.poss] : null;
    if (off && b.state === 'held') fx += off.dir * p.lead;
    if (G.phase === 'ft' && G.ft) fx = G.ft.P.T.dir * 9.5;
    const lim = CT.HL - 3.6;
    const tx = Math.max(-lim, Math.min(lim, fx * p.xk + (fx > 0 ? 1 : -1) * Math.min(2.5, Math.abs(fx) * 0.12)));
    // critically damped follow
    const k = 3.2, d = 2 * Math.sqrt(k);
    if (this.first) { this.x = tx; this.first = false; }
    const a = k * (tx - this.x) - d * this.vx; this.vx += a * dt; this.x += this.vx * dt;
    this.tz += ((fz * 0.18) - this.tz) * Math.min(1, dt * 2);
    // narrow screens (phones held sideways are wide; portrait-ish windows need to pull back)
    const wide = Math.max(0.85, Math.min(1.25, 1.78 / Math.max(1.1, aspect)));
    const z = p.z * wide, h = p.h * (0.92 + 0.08 * wide);
    this.cam.fov = p.fov; this.cam.updateProjectionMatrix();
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.15 : 0, sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.12 : 0;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.cam.position.set(this.x + sx, h + sy, z + this.tz * 0.5);
    this.look.set(this.x * 1.02, p.lookY, this.tz + p.lookZ);
    this.cam.lookAt(this.look);
  }
}
