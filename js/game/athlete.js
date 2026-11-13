// Basketball players: a CC0 rigged human (Quaternius Universal Base Characters) animated with the CC0 Quaternius
// Universal Animation Library (idle / walk / jog / sprint / crouch / jump clips blended by speed), plus basketball
// arm work on top (dribble, shot set + release, layup, dunk, pass, contest, steal) done with two-bone IK.
// Jersey, shorts, socks and sneakers are painted on by a shader from the body's rest-pose position.
import * as THREE from '../lib/three.min.js';

const BASE = new URL('../../models/', import.meta.url).href;
export let A = null; // loaded assets

function loadTex(url, srgb = true) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, t => { t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, rej));
}
function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }

export async function loadAthletes(onProgress) {
  if (A) return A;
  const L = new THREE.GLTFLoader();
  let done = 0; const tick = (x) => { done++; onProgress && onProgress(done / 12); return x; };
  const [body, a1, a2, buzz, parted, brows, skinL, skinD, normal, hairT, eyeT] = await Promise.all([
    L.loadAsync(BASE + 'body.glb').then(tick), L.loadAsync(BASE + 'anim1.glb').then(tick), L.loadAsync(BASE + 'anim2.glb').then(tick),
    L.loadAsync(BASE + 'hair_buzzed.glb').then(tick), L.loadAsync(BASE + 'hair_simpleparted.glb').then(tick), L.loadAsync(BASE + 'eyebrows_regular.glb').then(tick),
    loadImg(BASE + 'skinL.jpg').then(tick), loadImg(BASE + 'skinD.jpg').then(tick), loadTex(BASE + 'bodyN.jpg', false).then(tick), loadTex(BASE + 'hair1.jpg').then(tick), loadTex(BASE + 'eye.jpg').then(tick),
  ]);
  const tpl = body.scene; tpl.updateMatrixWorld(true);
  let bodyMesh = null, eyes = null, browMesh = null;
  tpl.traverse(o => { if (o.isSkinnedMesh) { if (/Superhero/i.test(o.material.name)) bodyMesh = o; else if (/Eye/i.test(o.material.name)) eyes = o; else browMesh = o; } });
  athleteBody(bodyMesh);
  if (browMesh) { const P = browMesh.geometry.attributes.position; for (const sg of [-1, 1]) { let cy = 0, n = 0; for (let i = 0; i < P.count; i++) if (Math.sign(P.getX(i)) === sg) { cy += P.getY(i); n++; } cy /= n || 1; for (let i = 0; i < P.count; i++) if (Math.sign(P.getX(i)) === sg) P.setY(i, cy + (P.getY(i) - cy) * 0.6); } P.needsUpdate = true; }
  const bones = {}; tpl.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const hb = bodyMesh.skeleton.bones.indexOf(bones.Head);
  const headInv = bodyMesh.skeleton.boneInverses[hb].clone();
  const rigid = (gl) => { let g = null; gl.scene.traverse(o => { if (o.isMesh && !g) g = o.geometry.clone(); }); if (!g) return null; for (const k of ['skinIndex', 'skinWeight']) if (g.attributes[k]) g.deleteAttribute(k); g.applyMatrix4(headInv); g.computeBoundingSphere(); return g; };
  hairT.wrapS = hairT.wrapT = THREE.RepeatWrapping;
  const box = new THREE.Box3().setFromBufferAttribute(bodyMesh.geometry.attributes.position);
  const clips = {}; for (const c of [...a1.animations, ...a2.animations]) clips[c.name] = c;
  A = { tpl, bodyMesh, clips, hair: { buzz: rigid(buzz), parted: rigid(parted) }, skinImgs: [skinL, skinD], normal, hairT, eyeT, skinCache: new Map(), height: box.max.y - box.min.y };
  return A;
}

// ---- a leaner, longer basketball build: slimmer limbs and waist, less superhero V ----
const RESHAPE = {
  thigh_l: 0.8, thigh_r: 0.8, calf_l: 0.86, calf_r: 0.86, upperarm_l: 0.78, upperarm_r: 0.78, lowerarm_l: 0.86, lowerarm_r: 0.86,
  clavicle_l: 0.84, clavicle_r: 0.84, neck_01: 0.88, spine_03: [0.86, 0.9], spine_02: [0.9, 0.92], spine_01: [0.96, 0.98], pelvis: [0.86, 0.8],
};
const CHILD = { thigh_l: 'calf_l', thigh_r: 'calf_r', calf_l: 'foot_l', calf_r: 'foot_r', upperarm_l: 'lowerarm_l', upperarm_r: 'lowerarm_r', lowerarm_l: 'hand_l', lowerarm_r: 'hand_r', clavicle_l: 'upperarm_l', clavicle_r: 'upperarm_r', neck_01: 'Head', spine_03: 'neck_01', spine_02: 'spine_03', spine_01: 'spine_02', pelvis: 'spine_01' };
function athleteBody(mesh) {
  const sk = mesh.skeleton, G = mesh.geometry, P = G.attributes.position, SI = G.attributes.skinIndex, SW = G.attributes.skinWeight;
  const bindPos = sk.boneInverses.map(m => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(m).invert()));
  const idx = {}; sk.bones.forEach((b, i) => { idx[b.name] = i; });
  const seg = sk.bones.map((b) => { const f = RESHAPE[b.name], c = CHILD[b.name]; if (!f || idx[c] == null) return null; const A0 = bindPos[idx[b.name]], B0 = bindPos[idx[c]]; return { A: A0, AB: B0.clone().sub(A0), L2: B0.distanceToSquared(A0), f }; });
  const v = new THREE.Vector3(), out = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i); out.set(0, 0, 0); let wsum = 0;
    for (let k = 0; k < 4; k++) {
      const w = SW.getComponent(i, k); if (w <= 0) continue; const s = seg[SI.getComponent(i, k)];
      if (!s) { out.addScaledVector(v, w); wsum += w; continue; }
      const t = Math.max(0, Math.min(1, d.copy(v).sub(s.A).dot(s.AB) / s.L2));
      p.copy(s.A).addScaledVector(s.AB, t); d.copy(v).sub(p);
      if (Array.isArray(s.f)) { d.x *= s.f[0]; d.z *= s.f[1]; } else d.multiplyScalar(s.f);
      out.addScaledVector(p.add(d), w); wsum += w;
    }
    if (wsum > 0) P.setXYZ(i, out.x / wsum, out.y / wsum, out.z / wsum);
  }
  P.needsUpdate = true; G.computeVertexNormals(); G.computeBoundingSphere();
}

// ---- skin tones ----
const TONES = [[0, 1.04], [0.14, 1.0], [0.3, 0.97], [0.5, 0.94], [0.7, 0.9], [0.9, 0.84], [1, 0.74], [1, 0.6]];
function skinTex(idx) {
  idx = Math.max(0, Math.min(7, idx | 0));
  if (A.skinCache.has(idx)) return A.skinCache.get(idx);
  const [t, mul] = TONES[idx], S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d'); x.drawImage(A.skinImgs[0], 0, 0, S, S);
  if (t > 0) { x.globalAlpha = t; x.drawImage(A.skinImgs[1], 0, 0, S, S); x.globalAlpha = 1; }
  if (mul !== 1) { x.globalCompositeOperation = mul < 1 ? 'multiply' : 'screen'; const v = mul < 1 ? Math.round(255 * mul) : Math.round(255 * (mul - 1) * 4); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, 0, S, S); x.globalCompositeOperation = 'source-over'; }
  const tx = new THREE.CanvasTexture(cv); tx.flipY = false; tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  A.skinCache.set(idx, tx); return tx;
}

// ---- uniform shader: tank top, shorts, socks, sneakers ----
const C = (h) => new THREE.Color(h || '#ffffff');
function uniformMaterial(skinIdx, U, o) {
  const m = new THREE.MeshStandardMaterial({ map: skinTex(skinIdx), normalMap: A.normal, roughness: 0.58, metalness: 0 });
  m.normalScale.set(0.4, 0.4);
  const u = {
    uJersey: { value: C(U.base) }, uShorts: { value: C(U.shorts || U.base) }, uTrim: { value: C(U.trim) }, uTrim2: { value: C(U.trim2 || U.trim) },
    uSock: { value: C(U.sock) }, uShoe: { value: C(U.shoe) }, uShoe2: { value: C(U.shoe2 || '#f2f2f2') }, uDecal: { value: o.decal }, uSeed: { value: o.seed || 0 },
    uFaceA: { value: new THREE.Vector4(...o.face.slice(0, 4)) }, uFaceB: { value: new THREE.Vector4(...o.face.slice(4, 8)) }, uBeard: { value: o.beard || 0 }, uHairC: { value: C(o.hairHex || '#1a120c') },
    uSleeve: { value: o.sleeve ? 1 : 0 }, uSleeveC: { value: C(o.sleeveC || '#111') }, uBand: { value: o.band ? 1 : 0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vB; varying vec3 vBN; uniform vec4 uFaceA; uniform vec4 uFaceB;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vB = position; vBN = normal;
        {
          float ax = abs(position.x), y = position.y;
          bool arm = ax > 0.2 && y > 1.27;
          float puff = 0.0;
          // tank top hangs a little loose off the chest
          if (!arm && y > 1.0 && y < 1.46 && ax < 0.21) puff += 0.012 + 0.012 * smoothstep(1.25, 1.02, y);
          // long, baggy shorts that flare toward the hem
          if (!arm && y > 0.47 && y < 1.04 && ax < 0.3) puff += 0.022 + 0.03 * smoothstep(0.75, 0.5, y) + 0.008 * smoothstep(0.85, 1.0, y);
          // socks / high-top shoes
          if (y < 0.13) puff += 0.006;
          vec3 p = transformed;
          if (y > 1.545) {
            float hw = smoothstep(1.545, 1.575, y);
            float front = smoothstep(-0.02, 0.04, p.z);
            vec2 eL = vec2(ax - 0.033, y - 1.699);
            float eyeK = 1.0 - exp(-dot(eL, eL) / (0.021 * 0.021));
            float jaw = hw * (1.0 - smoothstep(1.62, 1.68, y)) * front;
            p.x *= 1.0 + 0.16 * uFaceA.x * jaw * eyeK;
            float chin = hw * (1.0 - smoothstep(1.595, 1.625, y)) * smoothstep(0.02, 0.06, p.z) * (1.0 - smoothstep(0.03, 0.06, ax));
            p.y -= 0.014 * uFaceA.y * chin; p.z += 0.008 * uFaceA.y * chin;
            vec3 nb = vec3(0.0, 1.652, 0.088); vec3 dn = p - nb;
            float nose = exp(-dot(dn, dn) / (0.026 * 0.026)) * step(0.075, p.z);
            p.z += dn.z * 0.45 * uFaceA.z * nose; p.y += dn.y * 0.22 * uFaceA.z * nose;
            p.x *= 1.0 + 0.4 * uFaceA.w * nose;
            p.x *= 1.0 + 0.032 * uFaceB.y * hw;
            vec3 ck = vec3(ax - 0.056, y - 1.664, p.z - 0.062);
            float cheek = exp(-dot(ck, ck) / (0.024 * 0.024)) * eyeK;
            p.x *= 1.0 + 0.1 * uFaceB.z * cheek; p.z += 0.004 * uFaceB.z * cheek;
            vec3 lp = vec3(p.x, y - 1.616, p.z - 0.088);
            p.z += 0.0055 * (uFaceB.w + 0.4) * exp(-dot(lp, lp) / (0.017 * 0.017));
          }
          transformed = p + normal * puff;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vB; varying vec3 vBN;
        uniform vec3 uJersey, uShorts, uTrim, uTrim2, uSock, uShoe, uShoe2, uHairC, uSleeveC; uniform sampler2D uDecal; uniform float uSeed, uBeard, uSleeve, uBand;
        float fhash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float cloth = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float x = vB.x, ax = abs(vB.x), y = vB.y;
          vec3 col = diffuseColor.rgb; float c = 0.0;
          bool arm = ax > 0.2 && y > 1.27;
          bool front = vBN.z > 0.0;
          if (y < 0.135 && !arm) {
            // high-top sneakers: colored upper, white midsole, dark outsole, a swoosh-free side panel
            col = uShoe; c = 1.0;
            if (y < 0.03) col = uShoe2 * 0.35; else if (y < 0.048) col = uShoe2;
            else if (abs(vBN.x) > 0.6 && y > 0.06 && y < 0.1) col = mix(uShoe, uShoe2, 0.85);
            if (y > 0.122) col = uShoe2;
          } else if (y < 0.33 && !arm) {
            col = uSock; c = 1.0;
            if (y > 0.3) col = mix(uSock, uTrim, 0.0);
          } else if (y < 0.495 && !arm) {
            // bare knees (or a leg sleeve)
            if (uSleeve > 0.5 && x < 0.0) { col = uSleeveC; c = 1.0; }
          } else if (y < 1.035 && !arm && ax < 0.31) {
            col = uShorts; c = 1.0;
            if (y > 0.985) col = uTrim;                                    // waistband
            if (abs(vBN.x) > 0.8 && y < 0.98) col = uTrim;               // side panel stripe
            if (abs(vBN.x) > 0.8 && y < 0.98 && abs(vBN.x) < 0.88) col = uTrim2;
            if (y < 0.52) col = mix(col, uTrim, 0.0);
            if (y < 0.515 && y > 0.5) col = uTrim;                        // hem stripe
          } else if (!arm) {
            // tank top: open arm holes, straps over the shoulders, scoop neck
            float strapIn = 0.058, strapOut = 0.155;
            bool body = y < 1.315 && ax < 0.205;
            float neck = front ? 1.38 : 1.46;
            bool upper = y >= 1.315 && ax < strapOut && (ax > strapIn ? y < 1.56 : y < neck);
            if (body || upper) {
              col = uJersey; c = 1.0;
              // trim on the arm holes and the neck
              float armEdge = y >= 1.24 ? abs(ax - mix(0.205, strapOut, smoothstep(1.24, 1.36, y))) : 1.0;
              if (armEdge < 0.011 && y > 1.2) col = uTrim;
              if (ax <= strapIn + 0.003 && abs(y - neck) < 0.013) col = uTrim;
              if (y >= 1.315 && abs(ax - strapIn) < 0.007 && y > neck) col = uTrim;
              if (y >= 1.315 && abs(ax - strapOut) < 0.007) col = uTrim;
              // name / number / wordmark
              if (y > 1.02 && y < 1.44 && ax < 0.2) {
                vec2 dv; bool on = false;
                if (vBN.z < -0.2) { dv = vec2(0.25 - 0.5 * x / 0.4, (1.44 - y) / 0.42); on = true; }
                else if (vBN.z > 0.25) { dv = vec2(0.75 + 0.5 * x / 0.4, (1.40 - y) / 0.38); on = true; }
                if (on && dv.y > 0.0 && dv.y < 1.0) { vec4 d = texture2D(uDecal, dv); col = mix(col, d.rgb, d.a); }
              }
            }
          } else {
            // arms: skin; optional wristband / arm sleeve on the left arm
            if (uBand > 0.5 && ax > 0.6 && ax < 0.64) { col = uTrim; c = 1.0; }
            if (uSleeve > 0.5 && x > 0.0 && ax > 0.26 && ax < 0.62) { col = uSleeveC; c = 1.0; }
          }
          if (c < 0.5 && y > 1.53 && vB.z > -0.06) {
            float lum = dot(col, vec3(0.3, 0.55, 0.15));
            vec2 lq = vec2(ax / 0.026, (y - 1.615) / 0.0105);
            float lip = (1.0 - smoothstep(0.7, 1.0, length(lq))) * smoothstep(0.072, 0.082, vB.z);
            col = mix(col, mix(vec3(lum), col, 0.55) * vec3(1.0, 0.85, 0.83), lip * 0.75);
            vec3 nt = vec3(ax, y - 1.655, vB.z - 0.105);
            col = mix(col, mix(vec3(lum), col, 0.7), exp(-dot(nt, nt) / (0.018 * 0.018)) * 0.6);
            vec2 eo = vec2(ax - 0.034, (y - 1.701) * 1.35);
            float sock = exp(-dot(eo, eo) / (0.024 * 0.024)) * smoothstep(0.03, 0.07, vB.z);
            col *= 1.0 - 0.2 * sock;
            float top = mix(1.636, 1.676, smoothstep(0.03, 0.068, ax));
            float jawZ = smoothstep(1.566, 1.582, y) * (1.0 - smoothstep(top - 0.008, top + 0.004, y)) * smoothstep(-0.035, 0.0, vB.z);
            float must = smoothstep(1.621, 1.626, y) * (1.0 - smoothstep(1.638, 1.645, y)) * (1.0 - smoothstep(0.026, 0.034, ax)) * smoothstep(0.07, 0.085, vB.z);
            float bm = clamp(max(jawZ, must) - lip * 1.2, 0.0, 1.0);
            float n = fhash(floor(vB * vec3(1500.0, 520.0, 1500.0)) + uSeed);
            float stub = min(uBeard, 0.45), full = smoothstep(0.5, 1.0, uBeard);
            col = mix(col, col * mix(vec3(1.0), uHairC * 1.4 + 0.25, 0.6) * 0.8, bm * stub * (0.55 + 0.45 * n));
            col = mix(col, uHairC * 0.75 * (0.7 + 0.6 * n), bm * full * (0.6 + 0.4 * n));
            col *= 0.97 + 0.06 * fhash(floor(vB * 900.0));
          }
          diffuseColor.rgb = col; cloth = c;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.72, cloth);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, cloth * 0.9));');
  };
  m.customProgramCacheKey = () => 'h27Uniform1';
  return m;
}

// decal atlas: left half = back (name over number), right half = front (wordmark over number)
function decalCanvas(o, U) {
  const W = 1024, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const num = String(o.num ?? ''), name = (o.last || '').toUpperCase();
  const font = (sz, it = true) => `${it ? 'italic ' : ''}900 ${sz}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const txt = (s, cx, cy, size, sx, lw, it) => { x.save(); x.translate(cx, cy); x.scale(sx, 1); x.font = font(size, it); x.lineWidth = lw; x.strokeStyle = U.stroke; x.fillStyle = U.text; if (lw) x.strokeText(s, 0, 0); x.fillText(s, 0, 0); x.restore(); };
  if (name) { let sz = 62; x.font = font(sz, false); const w = x.measureText(name).width; if (w > 330) sz = Math.floor(sz * 330 / w); txt(name, 256, 62, sz, 1, 0, false); }
  if (num) txt(num, 256, 285, 300, num.length > 1 ? 0.78 : 1, 14, false);
  // front: arched wordmark
  const w = (U.word || '').toUpperCase();
  if (w) {
    let sz = 92; x.font = font(sz); let full = x.measureText(w).width; if (full > 300) { sz = Math.floor(sz * 300 / full); x.font = font(sz); full = x.measureText(w).width; }
    const n = w.length, span = full * (n > 1 ? (n - 1) / n : 0);
    x.save(); x.translate(768, 120);
    for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) - 0.5 : 0; x.save(); x.translate(t * span, -Math.cos(t * 1.3) * 22 + 22); x.rotate(t * 0.26); x.lineWidth = 6; x.strokeStyle = U.stroke; x.fillStyle = U.text; x.strokeText(w[i], 0, 0); x.fillText(w[i], 0, 0); x.restore(); }
    x.restore();
  }
  if (num) txt(num, 768, 330, 190, num.length > 1 ? 0.8 : 1, 10, false);
  return cv;
}

// ---- uniforms for a team ----
function lum(hex) { const c = C(hex); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
export function uniformFor(team, kind) {
  let c1 = team.c1 || '#1d428a', c2 = team.c2 || '#c8102e';
  if (lum(c1) > 0.85) [c1, c2] = [c2, c1];
  const dark = (h) => lum(h) < 0.45;
  const word = (team.name || team.abbr || '').toUpperCase();
  if (kind === 'home') return { key: 'home', base: '#f3f3f1', shorts: '#f3f3f1', trim: c1, trim2: c2, text: c1, stroke: lum(c2) > 0.85 ? c1 : c2, sock: '#f4f4f4', shoe: '#f0f0f0', shoe2: c1, word };
  if (kind === 'alt') {
    const b = lum(c2) > 0.8 ? '#16181d' : c2;
    return { key: 'alt', base: b, shorts: b, trim: c1, trim2: '#f3f3f1', text: dark(b) ? '#f3f3f1' : c1, stroke: dark(b) ? c1 : '#111', sock: '#141414', shoe: '#18181a', shoe2: c1, word: (team.city || word).toUpperCase() };
  }
  return { key: 'away', base: c1, shorts: c1, trim: lum(c2) > 0.85 || Math.abs(lum(c2) - lum(c1)) < 0.12 ? '#f3f3f1' : c2, trim2: '#f3f3f1', text: dark(c1) ? '#f3f3f1' : '#141414', stroke: lum(c2) > 0.85 || !dark(c1) ? (dark(c1) ? c1 : '#f3f3f1') : c2, sock: dark(c1) ? '#141414' : '#f4f4f4', shoe: '#141416', shoe2: '#f0f0f0', word };
}

// ---- deterministic look per player ----
function hashU(s, k = 0) { let h = 2166136261 ^ k; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
function faceParams(id) { const o = []; for (let i = 0; i < 8; i++) { const u = hashU(id, i + 1) * 2 - 1; o.push(u * (0.5 + 0.5 * Math.abs(u))); } return o; }
export function lookFor(d, toneIdx) {
  const id = d.id, u = (k) => hashU(id, 100 + k);
  const tone = toneIdx ?? 4;
  const hairHex = tone <= 1 && u(1) < 0.35 ? (u(2) < 0.5 ? '#6b4a2b' : '#3b2618') : '#14100c';
  const hair = u(3) < 0.16 ? 'bald' : u(3) < 0.82 ? 'buzz' : 'parted';
  return { tone, hairHex, hair, beard: u(4) < 0.45 ? 0.75 + u(5) * 0.25 : u(4) < 0.75 ? 0.15 + u(5) * 0.3 : 0, sleeve: u(6) < 0.18, sleeveC: u(7) < 0.5 ? '#111' : '#f2f2f2', band: u(8) < 0.3, face: faceParams(id) };
}

// ---- IK helpers ----
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3(), _pp = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion();
function aimBone(bone, from, to, want) {
  // rotate bone (world) so that the direction from->to becomes want
  _d.copy(to).sub(from).normalize();
  _q.setFromUnitVectors(_d, want);
  bone.getWorldQuaternion(_qw); _qw.premultiply(_q);
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}
function ik(upper, lower, hand, target, pole, w) {
  if (w <= 0.001) return;
  _q0.copy(upper.quaternion); _q1.copy(lower.quaternion);
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); hand.getWorldPosition(_c);
  const la = _a.distanceTo(_b), lb = _b.distanceTo(_c);
  _t.copy(target).sub(_a); let d = _t.length(); const dir = _t.normalize();
  d = Math.min(Math.max(d, Math.abs(la - lb) + 1e-3), la + lb - 1e-3);
  const cosA = (la * la + d * d - lb * lb) / (2 * la * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _pp.copy(pole).sub(_a); _pp.addScaledVector(dir, -_pp.dot(dir)); if (_pp.lengthSq() < 1e-8) _pp.set(0, -1, 0); _pp.normalize();
  _e.copy(_a).addScaledVector(dir, la * cosA).addScaledVector(_pp, la * sinA);
  aimBone(upper, _a, _b, _d.copy(_e).sub(_a).normalize().clone());
  lower.getWorldPosition(_b); hand.getWorldPosition(_c);
  const end = _a.clone().addScaledVector(dir, d);
  aimBone(lower, _b, _c, end.sub(_b).normalize());
  if (w < 0.999) { upper.quaternion.slerpQuaternions(_q0, upper.quaternion.clone(), w); lower.quaternion.slerpQuaternions(_q1, lower.quaternion.clone(), w); upper.updateMatrixWorld(true); }
}

// ---- the athlete ----
// clip "speeds": meters per cycle at scale 1 (tuned by eye so feet don't skate)
const STRIDE = { Walk_Loop: 1.35, Jog_Fwd_Loop: 2.6, Sprint_Loop: 3.9, Crouch_Fwd_Loop: 1.2 };
const LOCO = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Jump_Loop', 'Jump_Start', 'Jump_Land', 'Dance_Loop', 'Idle_FoldArms_Loop'];

export class Athlete {
  constructor(P, team, U, opts = {}) {
    this.P = P;
    const look = this.look = lookFor(P.d, opts.tone);
    const root = this.root = new THREE.Group();
    const m = this.model = THREE.cloneSkinned(A.tpl);
    this.scale = P.R.hM / A.height * 1.0;
    m.scale.setScalar(this.scale);
    root.add(m);
    const bones = this.bones = {}; m.traverse(o => { if (o.isBone) bones[o.name] = o; });
    let body = null, eyes = null, brows = null;
    m.traverse(o => { if (o.isSkinnedMesh) { if (/Superhero/i.test(o.material.name)) body = o; else if (/Eye/i.test(o.material.name)) eyes = o; else brows = o; o.frustumCulled = false; o.castShadow = true; } });
    const last = (P.d.n || '').split(' ').slice(1).join(' ').replace(/ (Jr\.|Sr\.|II|III|IV)$/i, '') || P.d.n;
    const decal = new THREE.CanvasTexture(decalCanvas({ num: P.d.num, last }, U)); decal.flipY = false; decal.colorSpace = THREE.SRGBColorSpace; decal.anisotropy = 4;
    this.decal = decal;
    body.material = uniformMaterial(look.tone, U, { decal, face: look.face, beard: look.beard, hairHex: look.hairHex, seed: hashU(P.id, 9) * 50, sleeve: look.sleeve, sleeveC: look.sleeveC, band: look.band });
    this.body = body;
    eyes.material = new THREE.MeshStandardMaterial({ map: A.eyeT, roughness: 0.3, color: '#d8d2cc' }); eyes.castShadow = false;
    const hc = new THREE.Color(look.hairHex);
    brows.material = new THREE.MeshStandardMaterial({ color: hc.clone().multiplyScalar(0.9), roughness: 0.95, transparent: true, opacity: 0.8 }); brows.castShadow = false;
    if (look.hair !== 'bald') {
      const g = A.hair[look.hair === 'parted' ? 'parted' : 'buzz'];
      if (g) { const h = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: hc, map: A.hairT, roughness: 0.85, side: THREE.DoubleSide })); h.castShadow = true; h.scale.set(1.015, 1.008, 1.012); bones.Head.add(h); }
    }
    // animation
    this.mixer = new THREE.AnimationMixer(m);
    this.act = {};
    for (const n of LOCO) { const c = A.clips[n]; if (!c) continue; const a = this.mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); this.act[n] = a; }
    this.w = Object.fromEntries(LOCO.map(n => [n, n === 'Idle_Loop' ? 1 : 0]));
    this.phase = Math.random(); this.idleT = Math.random() * 3;
    this.armW = { l: 0, r: 0 }; this.tgt = { l: new THREE.Vector3(), r: new THREE.Vector3() };
    this.dribPh = Math.random(); this.ballPos = new THREE.Vector3(); this.hasBallPos = false;
    this.handSide = 'r'; this.cross = 0;
    this.spineLean = 0; this.landT = 9;
    // a soft contact shadow under the feet (cheap, always looks grounded)
    this.root.userData.athlete = this;
  }

  // world position of a point given in body space (unscaled model units: x = player's left, y up, z forward)
  toWorld(v, x, y, z) { return v.set(x, y, z).multiplyScalar(this.scale).applyMatrix4(this.root.matrixWorld); }

  update(dt, G) {
    const P = this.P, b = G.ball, root = this.root;
    root.position.set(P.pos.x, P.y, P.pos.z);
    root.rotation.y = P.head;
    root.updateMatrixWorld(true);
    const has = b.state === 'held' && b.holder === P;
    const Ak = P.act ? P.act.k : null, At = P.act ? P.act.t : 0;
    const air = P.y > 0.04;
    // ---- locomotion weights ----
    const sp = P.speed || 0, s = this.scale;
    const fwd = sp > 0.05 ? (P.vel.x * Math.sin(P.head) + P.vel.z * Math.cos(P.head)) / sp : 1;
    const stance = (P.stance || (G.poss >= 0 && G.poss !== P.ti && P.ai && P.ai.man && G.ball.holder === P.ai.man && sp < 3.2)) && !air;
    const W = {};
    for (const n of LOCO) W[n] = 0;
    if (air) { W.Jump_Loop = 1; this.landT = 0; }
    else if (stance) {
      const k = Math.min(1, sp / 1.5);
      W.Crouch_Idle_Loop = 0.38 * (1 - k); W.Idle_Loop = 0.62 * (1 - k);
      W.Crouch_Fwd_Loop = 0.45 * k; W.Jog_Fwd_Loop = 0.0; W.Walk_Loop = 0.55 * k;
    } else {
      const ws = sp;
      if (ws < 0.25) W.Idle_Loop = 1;
      else if (ws < 1.8) { const k = (ws - 0.25) / 1.55; W.Idle_Loop = 1 - k; W.Walk_Loop = k; }
      else if (ws < 3.6) { const k = (ws - 1.8) / 1.8; W.Walk_Loop = 1 - k; W.Jog_Fwd_Loop = k; }
      else if (ws < 5.6) { const k = (ws - 3.6) / 2; W.Jog_Fwd_Loop = 1 - k; W.Sprint_Loop = k; }
      else W.Sprint_Loop = 1;
      if (has && ws < 1.5) { W.Crouch_Idle_Loop = 0.16; W.Idle_Loop *= 0.84; }
    }
    if (!air && this.landT < 0.35) { this.landT += dt; const k = 1 - this.landT / 0.35; W.Crouch_Idle_Loop = (W.Crouch_Idle_Loop || 0) + 0.35 * k; }
    // gather before a jumper / block: dip
    if (!air && (Ak === 'shoot' || Ak === 'block' || Ak === 'rebound' || Ak === 'tip') && At < 0.25) { W.Crouch_Idle_Loop += 0.3; }
    if (P.celebrate > 0) { W.Dance_Loop = 1; for (const n of LOCO) if (n !== 'Dance_Loop') W[n] *= 0.0; }
    if (P.bench) { for (const n of LOCO) W[n] = 0; W.Idle_FoldArms_Loop = 1; }
    // smooth weights
    let sum = 0;
    for (const n of LOCO) { this.w[n] += (W[n] - this.w[n]) * Math.min(1, dt * (air ? 14 : 9)); sum += this.w[n]; }
    // shared gait phase so walk / jog / sprint stay in step
    let stride = 0, sw = 0;
    for (const n of ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Fwd_Loop']) { stride += this.w[n] * STRIDE[n]; sw += this.w[n]; }
    if (sw > 0.01) { stride /= sw; this.phase = (this.phase + dt * sp / (stride * s) * (fwd < -0.3 ? -1 : 1) + 1) % 1; }
    this.idleT += dt;
    for (const n of LOCO) {
      const a = this.act[n]; if (!a) continue;
      a.setEffectiveWeight(this.w[n] / (sum || 1));
      const D = a.getClip().duration;
      if (STRIDE[n]) a.time = this.phase * D;
      else if (n === 'Jump_Loop') a.time = Math.min(D * 0.999, D * 0.35);
      else a.time = (this.idleT % D);
    }
    this.mixer.update(0);
    this.model.updateMatrixWorld(true);
    // ---- basketball arm work ----
    this.arms(dt, G, has, Ak, At, air);
  }

  arms(dt, G, has, Ak, At, air) {
    const P = this.P, b = G.ball, B = this.bones, A0 = P.act;
    const wantL = new THREE.Vector3(), wantR = new THREE.Vector3();
    let wl = 0, wr = 0; let ball = null; // ball position in body space
    const h = 1.0; // body units are model units (the model is ~1.9 tall before scaling)
    if (has && Ak === 'shoot') {
      const T = A0.type, rel = A0.rel, t = At;
      if (T === 'jump' || T === 'ft') {
        const k = Math.min(1, t / Math.max(0.1, rel * 0.85)); // rise from chest to set point
        const after = A0.released ? 1 : 0;
        wantR.set(-0.06, 1.25 + 0.68 * k, 0.3 - 0.12 * k); wantL.set(0.13, 1.25 + 0.6 * k, 0.3 - 0.12 * k);
        ball = new THREE.Vector3(0.02, 1.33 + 0.7 * k, 0.33 - 0.1 * k);
        wl = wr = 1;
      } else if (T === 'layup') {
        const k = Math.min(1, t / 0.45);
        wantR.set(-0.12, 1.3 + 0.95 * k, 0.32 + 0.1 * k); wantL.set(0.1, 1.3 + 0.55 * k, 0.32);
        ball = new THREE.Vector3(-0.1, 1.4 + 0.98 * k, 0.4 + 0.1 * k); wl = 1 - 0.6 * k; wr = 1;
      } else { // dunk
        const k = Math.min(1, t / 0.35);
        wantR.set(-0.12, 1.3 + 1.0 * k, 0.32 + 0.12 * k); wantL.set(0.12, 1.3 + 1.0 * k, 0.32 + 0.12 * k);
        ball = new THREE.Vector3(0, 1.42 + 1.05 * k, 0.42 + 0.12 * k); wl = wr = 1;
      }
    } else if (Ak === 'shoot' && A0.released) {
      // follow through (jumper) / reach (layup) / hang (dunk)
      if (A0.type === 'dunk') { wantR.set(-0.13, 2.3, 0.3); wantL.set(0.13, 2.3, 0.3); wl = wr = 1; }
      else if (A0.type === 'layup') { wantR.set(-0.1, 2.3, 0.45); wr = Math.max(0, 1 - (At - A0.relT) * 2); }
      else { wantR.set(-0.04, 2.15, 0.42); wantL.set(0.16, 1.9, 0.26); const f = Math.max(0, 1 - Math.max(0, At - A0.relT - 0.45) * 3); wr = f; wl = f * Math.max(0, 1 - (At - A0.relT) * 4); }
    } else if (has && (Ak === 'catch' || G.phase === 'inbound' || G.phase === 'ft' || (P.ai && P.ai.hold < 0.2 && !P.T.user))) {
      wantR.set(-0.13, 1.22, 0.36); wantL.set(0.13, 1.22, 0.36); ball = new THREE.Vector3(0, 1.24, 0.47); wl = wr = 1;
      if (G.phase === 'inbound' && G.inb && G.inb.P === P) { wantR.set(-0.13, 1.5, 0.36); wantL.set(0.13, 1.5, 0.36); ball.set(0, 1.55, 0.45); }
    } else if (has) {
      // dribbling: ball bounces between the hand and the floor beside the front foot
      const sp = P.speed || 0, f = 1.9 + Math.min(1.2, sp * 0.18);
      this.dribPh = (this.dribPh + dt * f) % 1;
      const side = P.hand === 'l' ? 1 : -1;
      if (this.handSide !== P.hand) { this.cross = 1; this.handSide = P.hand; }
      this.cross = Math.max(0, this.cross - dt * 3.2);
      const ph = this.dribPh, top = 0.98, low = 0.13 / this.scale;
      const lead = 0.38 + Math.min(0.35, sp * 0.06);
      const hx = side * (0.27 - this.cross * 0.0), hz = lead;
      // ball height: down 0..0.45, up 0.45..1
      const by = ph < 0.45 ? top - (top - low) * (ph / 0.45) : low + (top - low) * ((ph - 0.45) / 0.55);
      let bx = hx, bz = hz + 0.04;
      if (this.cross > 0) { // crossover / between the legs: ball goes low across the body
        const k = this.cross, kind = A0 && A0.k === 'move' ? A0.kind : 'cross';
        if (kind === 'btb') { bx = side * (0.27 * (1 - 2 * k)); bz = -0.25 * Math.sin(k * Math.PI) + hz * (1 - Math.sin(k * Math.PI)); }
        else { bx = side * 0.27 * (1 - 2 * k); bz = hz * 0.8; }
      }
      ball = new THREE.Vector3(bx, Math.max(low, this.cross > 0 ? Math.min(by, 0.45) : by), bz);
      const handY = Math.max(by + 0.1, 0.78) + (ph < 0.12 ? -0.06 : 0);
      const tw = side > 0 ? wantL : wantR;
      tw.set(bx + side * 0.02, handY, bz - 0.02);
      if (side > 0) wl = 1; else wr = 1;
      // off arm: protect the ball when a defender is close
      const off = side > 0 ? wantR : wantL;
      off.set(-side * 0.3, 1.12, 0.32); if (side > 0) wr = 0.55; else wl = 0.55;
    } else if (Ak === 'pass' && At < 0.3) {
      const k = Math.min(1, At / 0.12);
      wantR.set(-0.14, 1.25, 0.36 + 0.3 * k); wantL.set(0.14, 1.25, 0.36 + 0.3 * k); wl = wr = 1 - Math.max(0, (At - 0.18) / 0.12);
    } else if (Ak === 'block' || Ak === 'rebound' || Ak === 'tip' || Ak === 'oopjump' || (air && G.ball.state !== 'held')) {
      wantR.set(-0.16, 2.32, 0.24); wantL.set(0.16, 2.32, 0.24); wl = wr = 1;
      if (Ak === 'tip') { wantL.set(0.2, 1.4, 0.1); wl = 0.4; }
    } else if (Ak === 'steal' && At < 0.4) {
      const k = Math.sin(Math.min(1, At / 0.35) * Math.PI);
      wantR.set(-0.12, 1.0, 0.45 + 0.35 * k); wr = 1;
    } else if (G.poss >= 0 && G.poss !== P.ti && P.ai && P.ai.man) {
      // defense: active hands; one hand up to contest a shooter
      const M = P.ai.man, onBall = b.holder === M, d = Math.hypot(M.pos.x - P.pos.x, M.pos.z - P.pos.z);
      if (onBall && M.act && M.act.k === 'shoot' && d < 2.5) { wantR.set(-0.1, 2.33, 0.35); wantL.set(0.42, 1.25, 0.25); wr = 1; wl = 0.6; }
      else if (onBall && d < 2.4) { const wob = Math.sin(G.t * 5 + P.slot) * 0.06; wantR.set(-0.5, 1.12 + wob, 0.3); wantL.set(0.48, 1.4 - wob, 0.3); wl = wr = 0.85; }
      else if (P.stance) { wantR.set(-0.5, 1.05, 0.22); wantL.set(0.5, 1.05, 0.22); wl = wr = 0.6; }
    } else if (Ak === 'catch' || (b.state === 'air' && b.kind === 'pass' && b.pass && b.pass.to === P && b.pass.t > b.pass.T - 0.35)) {
      wantR.set(-0.14, 1.28, 0.45); wantL.set(0.14, 1.28, 0.45); wl = wr = 1;
    }
    // smooth arm weights
    const k = Math.min(1, dt * 14);
    this.armW.l += (wl - this.armW.l) * k; this.armW.r += (wr - this.armW.r) * k;
    if (wl > 0.01) this.tgt.l.lerp(wantL, this.armW.l < 0.05 ? 1 : Math.min(1, dt * 22)); if (wr > 0.01) this.tgt.r.lerp(wantR, this.armW.r < 0.05 ? 1 : Math.min(1, dt * 22));
    const poleL = new THREE.Vector3(), poleR = new THREE.Vector3();
    if (this.armW.l > 0.01) { this.toWorld(poleL, 0.75, 0.9, -0.4); ik(B.upperarm_l, B.lowerarm_l, B.hand_l, this.toWorld(new THREE.Vector3(), this.tgt.l.x, this.tgt.l.y, this.tgt.l.z), poleL, this.armW.l); }
    if (this.armW.r > 0.01) { this.toWorld(poleR, -0.75, 0.9, -0.4); ik(B.upperarm_r, B.lowerarm_r, B.hand_r, this.toWorld(new THREE.Vector3(), this.tgt.r.x, this.tgt.r.y, this.tgt.r.z), poleR, this.armW.r); }
    // the ball sits in the hands
    if (ball) {
      this.hasBallPos = true;
      if (has && Ak !== 'shoot' && G.phase !== 'inbound' && !(Ak === 'catch') && !(G.phase === 'ft')) this.toWorld(this.ballPos, ball.x, ball.y, ball.z);
      else {
        // between the hands (shot / hold): use the real hand bones so it never floats
        const hl = new THREE.Vector3(), hr = new THREE.Vector3(); B.hand_l.getWorldPosition(hl); B.hand_r.getWorldPosition(hr);
        const mid = hl.add(hr).multiplyScalar(0.5);
        const fwd = new THREE.Vector3(Math.sin(P.head), 0, Math.cos(P.head));
        if (Ak === 'shoot' && (A0.type === 'layup')) { B.hand_r.getWorldPosition(mid); mid.y += 0.1 * this.scale; mid.addScaledVector(fwd, 0.05); }
        else if (Ak === 'shoot' && (A0.type === 'jump' || A0.type === 'ft')) { B.hand_r.getWorldPosition(mid); mid.y += 0.13 * this.scale; mid.addScaledVector(fwd, 0.03); }
        else { mid.addScaledVector(fwd, 0.1 * this.scale); }
        this.ballPos.copy(mid);
      }
    } else this.hasBallPos = false;
  }

  dispose() { this.decal.dispose(); this.body.material.dispose(); }
}
