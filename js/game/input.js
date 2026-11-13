// Keyboard + gamepad + touch controls -> one intent object per frame.
// Movement comes out in world space: screen right = +x, screen up = -z (the camera looks across the floor at -z).
export class Input {
  constructor(root) {
    this.root = root; this.keys = new Set(); this.pressed = new Set(); this.released = new Set();
    this.touch = { mx: 0, mz: 0, btn: new Set(), pressed: new Set(), released: new Set() };
    this.padPrev = {}; this.lastDevice = 'keys';
    this.onKey = (e) => {
      if (e.repeat) { if (!['Escape'].includes(e.key)) e.preventDefault(); return; }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.type === 'keydown') { this.keys.add(k); this.pressed.add(k); this.lastDevice = 'keys'; }
      else { this.keys.delete(k); this.released.add(k); }
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    };
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKey);
    this.onBlur = () => { this.keys.clear(); };
    addEventListener('blur', this.onBlur);
  }
  destroy() { removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKey); removeEventListener('blur', this.onBlur); }

  // touch UI: joystick on the left, buttons on the right (labels change with offense/defense)
  buildTouch(el) {
    const z = document.createElement('div'); z.className = 'h27-touch'; el.appendChild(z);
    z.innerHTML = `<div class="joy"><div class="joy-base"></div><div class="joy-knob"></div></div>
      <div class="btns">
        <button data-b="a" class="b-a"><span>SHOOT</span></button>
        <button data-b="b" class="b-b"><span>PASS</span></button>
        <button data-b="c" class="b-c"><span>MOVE</span></button>
        <button data-b="d" class="b-d"><span>LOB</span></button>
        <button data-b="e" class="b-e"><span>SPRINT</span></button>
      </div>`;
    this.tz = z;
    const joy = z.querySelector('.joy'), knob = z.querySelector('.joy-knob'), base = z.querySelector('.joy-base');
    let jid = null, cx = 0, cy = 0;
    const R = 46;
    joy.addEventListener('pointerdown', (e) => { jid = e.pointerId; joy.setPointerCapture(e.pointerId); const r = joy.getBoundingClientRect(); cx = e.clientX; cy = e.clientY; base.style.left = (cx - r.left) + 'px'; base.style.top = (cy - r.top) + 'px'; knob.style.left = base.style.left; knob.style.top = base.style.top; joy.classList.add('on'); this.lastDevice = 'touch'; e.preventDefault(); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId !== jid) return; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } const r = joy.getBoundingClientRect(); knob.style.left = (cx - r.left + dx) + 'px'; knob.style.top = (cy - r.top + dy) + 'px'; this.touch.mx = dx / R; this.touch.mz = dy / R; });
    const end = (e) => { if (e.pointerId !== jid) return; jid = null; this.touch.mx = 0; this.touch.mz = 0; joy.classList.remove('on'); };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    for (const b of z.querySelectorAll('button')) {
      const k = b.dataset.b;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); this.touch.btn.add(k); this.touch.pressed.add(k); b.classList.add('on'); this.lastDevice = 'touch'; });
      const up = (e) => { if (!this.touch.btn.has(k)) return; this.touch.btn.delete(k); this.touch.released.add(k); b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }
  setTouchMode(off) {
    if (!this.tz || this.tzMode === off) return; this.tzMode = off;
    const L = off ? ['SHOOT', 'PASS', 'MOVE', 'LOB', 'SPRINT'] : ['BLOCK', 'SWITCH', 'STEAL', 'STANCE', 'SPRINT'];
    this.tz.querySelectorAll('button span').forEach((s, i) => { s.textContent = L[i]; });
    this.tz.classList.toggle('def', !off);
  }

  // read everything into a frame intent
  read(offense) {
    const K = this.keys, P = this.pressed, Rl = this.released, T = this.touch;
    let mx = 0, mz = 0;
    if (K.has('a') || K.has('ArrowLeft')) mx -= 1; if (K.has('d') || K.has('ArrowRight')) mx += 1;
    if (K.has('w') || K.has('ArrowUp')) mz -= 1; if (K.has('s') || K.has('ArrowDown')) mz += 1;
    const kl = Math.hypot(mx, mz); if (kl > 1) { mx /= kl; mz /= kl; }
    const U = { mx, mz, sprint: K.has('Shift'), shootHeld: false, shootDown: false, shootUp: false, pass: false, move: false, lob: false, screen: false, switch: false, steal: false, block: false, stance: false, pause: false };
    // keyboard buttons
    const kd = (k) => P.has(k), kh = (k) => K.has(k), ku = (k) => Rl.has(k);
    if (offense) {
      U.shootDown = kd('j') || kd(' '); U.shootHeld = kh('j') || kh(' '); U.shootUp = ku('j') || ku(' ');
      U.pass = kd('k'); U.move = kd('l'); U.lob = kd('i'); U.screen = kd('u');
    } else {
      U.steal = kd('j'); U.block = kd(' ') || kd('i'); U.switch = kd('k'); U.stance = kh('l');
    }
    U.pause = kd('Escape') || kd('p');
    // touch
    if (T.mx || T.mz) { U.mx = T.mx; U.mz = T.mz; }
    const td = (k) => T.pressed.has(k), th = (k) => T.btn.has(k), tu = (k) => T.released.has(k);
    if (th('e')) U.sprint = true;
    if (offense) {
      if (td('a')) U.shootDown = true; if (th('a')) U.shootHeld = true; if (tu('a')) U.shootUp = true;
      if (td('b')) U.pass = true; if (td('c')) U.move = true; if (td('d')) U.lob = true;
    } else {
      if (td('a')) U.block = true; if (td('b')) U.switch = true; if (td('c')) U.steal = true; if (th('d')) U.stance = true;
    }
    // gamepad
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, dz = 0.18;
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const prev = this.padPrev, now = {};
      for (let i = 0; i < 16; i++) now[i] = b(i);
      const dn = (i) => now[i] && !prev[i], up = (i) => !now[i] && prev[i];
      if (Math.hypot(ax, ay) > dz) { U.mx = ax; U.mz = ay; this.lastDevice = 'pad'; }
      let dx = (now[15] ? 1 : 0) - (now[14] ? 1 : 0), dy = (now[13] ? 1 : 0) - (now[12] ? 1 : 0); if (dx || dy) { U.mx = dx; U.mz = dy; }
      if (now[7] || (gp.buttons[7] && gp.buttons[7].value > 0.3)) U.sprint = true;
      if (offense) {
        if (dn(2)) U.shootDown = true; if (now[2]) U.shootHeld = true; if (up(2)) U.shootUp = true;
        if (dn(0)) U.pass = true; if (dn(3)) U.lob = true; if (dn(1)) U.move = true; if (dn(4)) U.screen = true;
        // right stick flick = dribble move
        const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
        if (Math.hypot(rx, ry) > 0.7 && !this.rsOn) { U.move = true; U.mx = rx; U.mz = ry; this.rsOn = true; } else if (Math.hypot(rx, ry) < 0.3) this.rsOn = false;
      } else {
        if (dn(0)) U.switch = true; if (dn(2)) U.steal = true; if (dn(3)) U.block = true; if (now[6] || (gp.buttons[6] && gp.buttons[6].value > 0.3)) U.stance = true;
      }
      if (dn(9)) U.pause = true;
      if (Object.values(now).some(Boolean)) this.lastDevice = 'pad';
      this.padPrev = now;
    }
    return U;
  }
  endFrame() { this.pressed.clear(); this.released.clear(); this.touch.pressed.clear(); this.touch.released.clear(); }
}
