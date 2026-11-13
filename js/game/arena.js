// The arena: hardwood floor with real NBA court markings, home team paint + logo, baskets (glass, rim, net),
// stanchions, scorer's table, benches, LED ribbon boards, a hanging scoreboard, and a seated crowd.
import * as THREE from '../lib/three.min.js';
import { CT } from './court.js';
import { makeCrowd } from './crowd.js';

const C = (h) => new THREE.Color(h);
function lum(hex) { const c = C(hex); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
export function loadImage(url) {
  return new Promise((res) => { if (!url) return res(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; setTimeout(() => res(null), 6000); });
}

// ---------------------------------------------------------------------------------------------- floor texture
function floorCanvas(team, logo, hi) {
  const PX = hi ? 110 : 64; // pixels per meter
  const FL = 34, FW = 21; // floor incl. apron (meters)
  const W = Math.round(FL * PX), H = Math.round(FW * PX);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const X = (m) => (m + FL / 2) * PX, Y = (m) => (m + FW / 2) * PX;
  // planks: maple boards run baseline to baseline
  const plankW = 0.057 * PX; let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#c9965c'; x.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += plankW) {
    let px = -r() * 300;
    while (px < W) {
      const L = (1.2 + r() * 2.6) * PX, t = r();
      const c = `hsl(${30 + t * 6}, ${46 + r() * 10}%, ${54 + (t - 0.5) * 9}%)`;
      x.fillStyle = c; x.fillRect(px, y, L, plankW + 0.5);
      // grain
      x.globalAlpha = 0.08; x.fillStyle = '#6b4320';
      for (let g = 0; g < 3; g++) x.fillRect(px, y + r() * plankW, L, 0.7);
      x.globalAlpha = 1;
      x.fillStyle = 'rgba(70,40,15,.25)'; x.fillRect(px, y, 1, plankW);
      px += L;
    }
    x.fillStyle = 'rgba(70,40,15,.18)'; x.fillRect(0, y, W, 0.8);
  }
  const c1 = team.c1 || '#1d428a', c2 = team.c2 || '#c8102e';
  const paint = lum(c1) > 0.8 ? c2 : c1, apron = lum(c1) > 0.7 ? '#1a1d24' : c1;
  // apron (out of bounds) stained in the team color
  x.save(); x.globalAlpha = 0.86; x.fillStyle = apron;
  x.fillRect(0, 0, W, Y(-CT.HW)); x.fillRect(0, Y(CT.HW), W, H - Y(CT.HW)); x.fillRect(0, 0, X(-CT.HL), H); x.fillRect(X(CT.HL), 0, W - X(CT.HL), H);
  x.restore();
  const lw = 0.06 * PX;
  x.strokeStyle = '#ffffff'; x.lineWidth = lw; x.lineJoin = 'miter';
  // painted keys (lanes) + center circle fill
  for (const s of [-1, 1]) {
    x.save(); x.globalAlpha = 0.82; x.fillStyle = paint;
    const bx = s > 0 ? X(CT.HL - CT.FT_U) : X(-CT.HL), w = CT.FT_U * PX;
    x.fillRect(bx, Y(-CT.KEY_HW), w, CT.KEY_HW * 2 * PX); x.restore();
  }
  x.save(); x.globalAlpha = 0.6; x.fillStyle = paint; x.beginPath(); x.arc(X(0), Y(0), 1.83 * PX, 0, Math.PI * 2); x.fill(); x.restore();
  // lines
  x.strokeRect(X(-CT.HL), Y(-CT.HW), CT.L * PX, CT.W * PX);
  x.beginPath(); x.moveTo(X(0), Y(-CT.HW)); x.lineTo(X(0), Y(CT.HW)); x.stroke();
  x.beginPath(); x.arc(X(0), Y(0), 1.83 * PX, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(X(0), Y(0), 0.61 * PX, 0, Math.PI * 2); x.stroke();
  for (const s of [-1, 1]) {
    const bl = s * CT.HL, hx = s * CT.HOOP_X, inw = -s; // inward direction
    // key
    x.strokeRect(s > 0 ? X(CT.HL - CT.FT_U) : X(-CT.HL), Y(-CT.KEY_HW), CT.FT_U * PX, CT.KEY_HW * 2 * PX);
    // free-throw circle (solid outer half, dashed inner half)
    const fx = X(bl + inw * CT.FT_U);
    x.beginPath(); x.arc(fx, Y(0), 1.83 * PX, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2); x.stroke();
    x.setLineDash([0.35 * PX, 0.3 * PX]); x.beginPath(); x.arc(fx, Y(0), 1.83 * PX, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : Math.PI * 1.5); x.stroke(); x.setLineDash([]);
    // three point line: corners + arc
    const cz = CT.THREE_CORNER_Z, ang = Math.asin(cz / CT.THREE_R), ux = Math.cos(ang) * CT.THREE_R; // arc meets the corner lines
    x.beginPath();
    x.moveTo(X(bl), Y(-cz)); x.lineTo(X(hx + inw * ux), Y(-cz));
    x.arc(X(hx), Y(0), CT.THREE_R * PX, s > 0 ? Math.PI + ang : -ang, s > 0 ? Math.PI - ang : ang, s > 0);
    x.lineTo(X(bl), Y(cz)); x.stroke();
    // restricted area arc
    x.beginPath(); x.arc(X(hx), Y(0), CT.RA_R * PX, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2); x.stroke();
    // lane hash marks
    for (const u of [2.13, 3.05, 3.96, 4.88]) for (const z of [-1, 1]) { x.beginPath(); x.moveTo(X(bl + inw * u), Y(z * CT.KEY_HW)); x.lineTo(X(bl + inw * u), Y(z * (CT.KEY_HW + 0.2))); x.stroke(); }
    // coaching box / hash on sidelines
    for (const z of [-1, 1]) { x.beginPath(); x.moveTo(X(bl + inw * 8.53), Y(z * CT.HW)); x.lineTo(X(bl + inw * 8.53), Y(z * (CT.HW - 0.9))); x.stroke(); }
  }
  // center court logo
  if (logo) {
    const s = 3.3 * PX, ar = logo.width / logo.height;
    x.save(); x.globalAlpha = 0.95; x.drawImage(logo, X(0) - s * Math.min(1, ar) / 2, Y(0) - s / Math.max(1, ar) / 2, s * Math.min(1, ar), s / Math.max(1, ar)); x.restore();
  } else {
    x.save(); x.fillStyle = '#fff'; x.font = `italic 900 ${1.4 * PX}px "Barlow Condensed", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText((team.abbr || team.id || '').toUpperCase(), X(0), Y(0)); x.restore();
  }
  // team name on the baselines (apron) and HOOPS 27 on the sidelines
  const name = (team.name || '').toUpperCase();
  x.save(); x.fillStyle = 'rgba(255,255,255,.92)'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `italic 900 ${1.05 * PX}px "Barlow Condensed", sans-serif`;
  for (const s of [-1, 1]) { x.save(); x.translate(X(s * (CT.HL + 1.05)), Y(0)); x.rotate(s * Math.PI / 2); x.fillText(name, 0, 0); x.restore(); }
  x.font = `italic 800 ${0.6 * PX}px "Barlow Condensed", sans-serif`; x.globalAlpha = 0.7;
  x.fillText('HOOPS 27', X(-8), Y(CT.HW + 0.75)); x.fillText((team.city || '').toUpperCase(), X(8), Y(CT.HW + 0.75));
  x.restore();
  // a soft polish sheen variation
  const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6); g.addColorStop(0, 'rgba(255,240,220,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  return { cv, FL, FW };
}

// ---------------------------------------------------------------------------------------------- baskets
function netTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const x = cv.getContext('2d');
  x.strokeStyle = '#ffffff'; x.lineWidth = 3;
  for (let i = -8; i < 16; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16 + 128, 128); x.stroke(); x.beginPath(); x.moveTo(i * 16 + 128, 0); x.lineTo(i * 16, 128); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1.2); return t;
}
function boardTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 300; const x = cv.getContext('2d');
  x.clearRect(0, 0, 512, 300); x.strokeStyle = '#fff'; x.lineWidth = 12; x.strokeRect(6, 6, 500, 288);
  // shooter's square: 0.61 x 0.46 m on a 1.83 x 1.07 board
  const sw = 512 * 0.61 / 1.83, sh = 300 * 0.46 / 1.07; x.lineWidth = 10; x.strokeRect(256 - sw / 2, 300 - 300 * 0.15 / 1.07 - sh, sw, sh);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeBasket(s, team, mats) {
  const g = new THREE.Group();
  const bx = s * CT.BOARD_X;
  // glass
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.03, CT.BOARD_TOP - CT.BOARD_BOT, CT.BOARD_W), new THREE.MeshPhysicalMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, depthWrite: false }));
  glass.position.set(bx, (CT.BOARD_TOP + CT.BOARD_BOT) / 2, 0); g.add(glass);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(CT.BOARD_W, CT.BOARD_TOP - CT.BOARD_BOT), new THREE.MeshBasicMaterial({ map: mats.board, transparent: true, depthWrite: false }));
  face.position.set(bx - s * 0.02, (CT.BOARD_TOP + CT.BOARD_BOT) / 2, 0); face.rotation.y = -s * Math.PI / 2; g.add(face);
  // padding along the bottom of the board
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, CT.BOARD_W + 0.04), mats.pad); pad.position.set(bx + s * 0.01, CT.BOARD_BOT - 0.02, 0); g.add(pad);
  // rim + bracket
  const rim = new THREE.Mesh(new THREE.TorusGeometry(CT.RIM_R + CT.RIM_T, 0.011, 8, 40), mats.rim); rim.rotation.x = Math.PI / 2; rim.position.set(s * CT.HOOP_X, CT.RIM_Y, 0); rim.castShadow = true; g.add(rim);
  const br = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.16), mats.rim); br.position.set(s * (CT.HOOP_X + CT.RIM_R + 0.08), CT.RIM_Y - 0.01, 0); g.add(br);
  // net: tapered tube, swishes on makes
  const ng = new THREE.CylinderGeometry(CT.RIM_R + 0.005, CT.RIM_R * 0.62, 0.44, 24, 6, true);
  ng.translate(0, -0.22, 0);
  const nm = new THREE.MeshStandardMaterial({ map: mats.net, alphaMap: mats.net, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, color: '#f4f4f4' });
  const nu = { uSwish: { value: 0 }, uSway: { value: new THREE.Vector2() } };
  nm.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, nu); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSwish; uniform vec2 uSway;').replace('#include <begin_vertex>', `#include <begin_vertex>
    float d = clamp(-position.y / 0.44, 0.0, 1.0);
    transformed.y -= uSwish * 0.16 * d * d;
    transformed.xz *= 1.0 - uSwish * 0.22 * d;
    transformed.x += uSway.x * d * d; transformed.z += uSway.y * d * d;`); };
  const net = new THREE.Mesh(ng, nm); net.position.set(s * CT.HOOP_X, CT.RIM_Y, 0); g.add(net);
  // stanchion: padded base behind the baseline, arm up and over to the board
  const baseX = s * (CT.HL + 1.55);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.4), mats.stan); base.position.set(baseX, 0.5, 0); base.castShadow = true; base.receiveShadow = true; g.add(base);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.3, 0.36), mats.stan); post.position.set(baseX + s * 0.25, 2.3, 0); post.castShadow = true; g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(baseX - bx) + 0.2, 0.2, 0.22), mats.metal); arm.position.set((baseX + bx) / 2, 3.55, 0); arm.rotation.z = 0; g.add(arm);
  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), mats.metal); arm2.position.set(bx + s * 0.25, 3.2, 0); arm2.rotation.z = s * 0.6; g.add(arm2);
  // team logo / word on the base padding (front face)
  const side = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), new THREE.MeshBasicMaterial({ map: mats.stanLogo, transparent: true }));
  side.position.set(baseX - s * 0.56, 0.5, 0); side.rotation.y = -s * Math.PI / 2; g.add(side);
  // shot clock on top of the board
  const sc = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.9), mats.dark); sc.position.set(bx + s * 0.05, CT.BOARD_TOP + 0.2, 0); g.add(sc);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.28), new THREE.MeshBasicMaterial({ map: mats.shotTex[s > 0 ? 1 : 0], toneMapped: false }));
  scr.position.set(bx - s * 0.06, CT.BOARD_TOP + 0.2, 0); scr.rotation.y = -s * Math.PI / 2; g.add(scr);
  return { g, net: nu, rim };
}

function textTex(lines, w, h, bg, fg, font) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d');
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.draw = (ls) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = font; ls.forEach((l, i) => x.fillText(l, w / 2, h * (i + 0.5) / ls.length)); t.needsUpdate = true; };
  t.draw(lines); return t;
}

// ---------------------------------------------------------------------------------------------- the arena
export async function buildArena(scene, home, away, opts = {}) {
  const hi = !opts.fast;
  const logo = await loadImage(home.logo);
  const A = { group: new THREE.Group(), baskets: [], t: 0 };
  scene.add(A.group);
  const { cv, FL, FW } = floorCanvas(home, logo, hi);
  const ft = new THREE.CanvasTexture(cv); ft.colorSpace = THREE.SRGBColorSpace; ft.anisotropy = opts.aniso || 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FL, FW), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.32, metalness: 0.0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; A.group.add(floor); A.floor = floor;
  // dark arena floor beyond the hardwood
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.9 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.01; A.group.add(outer);
  const c1 = home.c1 || '#1d428a', c2 = home.c2 || '#c8102e';
  const mats = {
    rim: new THREE.MeshStandardMaterial({ color: '#ff5a12', roughness: 0.4, metalness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.5, metalness: 0.6 }),
    stan: new THREE.MeshStandardMaterial({ color: lum(c1) > 0.75 ? '#1c1f26' : c1, roughness: 0.75 }),
    pad: new THREE.MeshStandardMaterial({ color: lum(c1) > 0.75 ? '#1c1f26' : c1, roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.6 }),
    net: netTexture(), board: boardTexture(),
    stanLogo: textTex([(home.name || '').toUpperCase()], 512, 300, 'rgba(0,0,0,0)', '#ffffff', 'italic 900 120px "Barlow Condensed", sans-serif'),
    shotTex: [0, 1].map(() => textTex(['24'], 256, 96, '#060606', '#ff3b2f', '900 84px "Barlow Condensed", monospace')),
  };
  if (logo) { const c = mats.stanLogo.image, x = c.getContext('2d'); x.clearRect(0, 0, 512, 300); const s = Math.min(420 / logo.width, 260 / logo.height); x.drawImage(logo, 256 - logo.width * s / 2, 150 - logo.height * s / 2, logo.width * s, logo.height * s); mats.stanLogo.needsUpdate = true; }
  A.shotTex = mats.shotTex;
  for (const s of [-1, 1]) { const b = makeBasket(s, home, mats); A.group.add(b.g); A.baskets.push({ s, ...b, swish: 0, sway: new THREE.Vector2(), swayV: new THREE.Vector2() }); }

  // courtside: scorer's table + benches on the far sideline (-z), seen by the broadcast camera
  const tableTex = textTex(['HOOPS 27'], 1024, 96, '#0b0c10', '#ffffff', 'italic 900 70px "Barlow Condensed", sans-serif');
  A.tableTex = tableTex;
  const table = new THREE.Mesh(new THREE.BoxGeometry(9, 0.85, 0.8), new THREE.MeshStandardMaterial({ color: '#0d0f14', roughness: 0.6 }));
  table.position.set(0, 0.425, -CT.HW - 1.6); A.group.add(table);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(8.9, 0.7), new THREE.MeshBasicMaterial({ map: tableTex, toneMapped: false }));
  led.position.set(0, 0.43, -CT.HW - 1.19); A.group.add(led); A.tableLed = led;
  const chairM = new THREE.MeshStandardMaterial({ color: '#202329', roughness: 0.7 });
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), chairM); ch.position.set(s * (5.5 + i * 0.62), 0.25, -CT.HW - 1.7); A.group.add(ch);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), chairM); bk.position.set(s * (5.5 + i * 0.62), 0.75, -CT.HW - 1.95); A.group.add(bk);
  }

  // seating bowl: lower bowl rises from courtside, upper deck behind; crowd sprites sit in the seats
  const seats = [];
  const bowl = new THREE.Group(); A.group.add(bowl);
  const stepM = new THREE.MeshStandardMaterial({ color: '#23262d', roughness: 0.9 });
  const seatM = new THREE.MeshStandardMaterial({ color: lum(c1) > 0.75 ? '#2a2e37' : C(c1).multiplyScalar(0.55), roughness: 0.85 });
  const rows = hi ? 22 : 16, rowD = 0.85, rowH = 0.42;
  const addSide = (cx, cz, len, rot, start, nRows, y0, upper) => {
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rot; bowl.add(g);
    for (let r = 0; r < nRows; r++) {
      const d = start + r * rowD, y = y0 + r * rowH;
      const step = new THREE.Mesh(new THREE.BoxGeometry(len + (upper ? 0 : r * rowD * 2), rowH, rowD), r % 2 ? stepM : seatM);
      step.position.set(0, y - rowH / 2 + 0.02, d); g.add(step);
      // seat positions in world space
      const L = len + (upper ? 0 : r * rowD * 2);
      for (let i = -L / 2 + 0.3; i < L / 2; i += 0.55) {
        const v = new THREE.Vector3(i, y, d + 0.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(new THREE.Vector3(cx, 0, cz));
        seats.push(v.x, v.y, v.z, 0.92, upper ? 0.62 : 0.85);
      }
    }
    // wall/fascia under the first row
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, y0 + 0.2, 0.2), stepM); wall.position.set(0, (y0 + 0.2) / 2, start - rowD / 2); g.add(wall);
    return g;
  };
  // sides: +z (behind camera, mostly off screen), -z far side (visible), baselines
  const sideStart = CT.HW + 3.2, endStart = CT.HL + 3.6;
  addSide(0, 0, CT.L + 5, Math.PI, sideStart, rows, 0.5, false);           // far side: rows go toward -z
  addSide(0, 0, CT.L + 5, 0, sideStart + 1.5, rows, 0.5, false);           // near side (camera side)
  addSide(0, 0, CT.W + 4, -Math.PI / 2, endStart, rows, 0.5, false);       // -x end... rotated to face the court
  addSide(0, 0, CT.W + 4, Math.PI / 2, endStart, rows, 0.5, false);
  // upper deck far side
  addSide(0, 0, CT.L + 26, Math.PI, sideStart + rows * rowD + 3, hi ? 14 : 8, 0.5 + rows * rowH + 3.2, true);
  addSide(0, 0, CT.W + 26, -Math.PI / 2, endStart + rows * rowD + 3, hi ? 12 : 6, 0.5 + rows * rowH + 3.2, true);
  addSide(0, 0, CT.W + 26, Math.PI / 2, endStart + rows * rowD + 3, hi ? 12 : 6, 0.5 + rows * rowH + 3.2, true);
  // LED ribbon boards on the upper deck fascia
  const ribbonTex = textTex(['HOOPS 27   ' + (home.name || '').toUpperCase() + '   HOOPS 27   ' + (home.city || '').toUpperCase()], 2048, 64, '#05060a', c2 && lum(c2) > 0.25 ? c2 : '#f2c230', 'italic 900 50px "Barlow Condensed", sans-serif');
  ribbonTex.wrapS = THREE.RepeatWrapping; ribbonTex.repeat.set(3, 1); A.ribbon = ribbonTex;
  const ribM = new THREE.MeshBasicMaterial({ map: ribbonTex, toneMapped: false });
  const rib = new THREE.Mesh(new THREE.PlaneGeometry(CT.L + 26, 0.9), ribM); rib.position.set(0, 0.5 + rows * rowH + 2.3, -(sideStart + rows * rowD + 2.3)); A.group.add(rib);
  // walls + roof darkness
  const wallM = new THREE.MeshStandardMaterial({ color: '#0c0d11', roughness: 1, side: THREE.BackSide });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(110, 46, 90), wallM); shell.position.y = 22; A.group.add(shell);
  // hanging scoreboard
  const jbTex = textTex(['0  -  0'], 512, 256, '#06070a', '#ffffff', '900 120px "Barlow Condensed", sans-serif');
  A.jbTex = jbTex;
  const jb = new THREE.Group(); jb.position.set(0, 15.5, 0); A.group.add(jb);
  const jbBox = new THREE.Mesh(new THREE.BoxGeometry(7, 3.6, 7), new THREE.MeshStandardMaterial({ color: '#0b0c10', roughness: 0.6 })); jb.add(jbBox);
  for (let i = 0; i < 4; i++) { const sc = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.2), new THREE.MeshBasicMaterial({ map: jbTex, toneMapped: false })); const a = i * Math.PI / 2; sc.position.set(Math.sin(a) * 3.51, 0, Math.cos(a) * 3.51); sc.rotation.y = a; jb.add(sc); }
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.6, 32, 1, true), ribM); ring.position.y = -2.4; jb.add(ring);
  // crowd
  const crowdTeam = { c1: lum(c1) > 0.8 ? c2 : c1, c2: lum(c1) > 0.8 ? c1 : c2, c3: '#ffffff' };
  A.crowd = makeCrowd(seats, crowdTeam, { fast: !hi, fill: 0.95 });
  A.group.add(A.crowd.mesh);

  // lights: bright court, dimmer stands
  const hemi = new THREE.HemisphereLight('#fff6ea', '#3a2d22', 1.25); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff3e2', 2.2); key.position.set(4, 22, 9); key.castShadow = true;
  key.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024); const sc = key.shadow.camera; sc.left = -17; sc.right = 17; sc.top = 11; sc.bottom = -11; sc.near = 5; sc.far = 45; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.6); fill.position.set(-6, 14, -12); scene.add(fill);
  A.lights = { hemi, key, fill };
  A.update = (dt, G, cam) => {
    A.t += dt;
    for (const b of A.baskets) {
      b.swish = Math.max(0, b.swish - dt * 2.2);
      // spring sway
      b.swayV.addScaledVector(b.sway, -60 * dt); b.swayV.multiplyScalar(Math.exp(-4 * dt)); b.sway.addScaledVector(b.swayV, dt);
      b.net.uSwish.value = Math.sin(Math.min(1, b.swish) * Math.PI) * 1.0; b.net.uSway.value.copy(b.sway);
    }
    ribbonTex.offset.x = (A.t * 0.03) % 1;
    A.crowd.update(dt, A.t, A.excite || 0.15, cam);
  };
  A.swish = (s, strength = 1, vx = 0, vz = 0) => { const b = A.baskets.find(q => q.s === s); if (!b) return; b.swish = 1; b.swayV.x += vx * 0.08 * strength; b.swayV.y += vz * 0.08 * strength; };
  A.rimHit = (s, vx = 0, vz = 0) => { const b = A.baskets.find(q => q.s === s); if (!b) return; b.swayV.x += vx * 0.05; b.swayV.y += vz * 0.05; };
  return A;
}
