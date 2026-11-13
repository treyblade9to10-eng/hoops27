// HOOPS 27 sound. Web Audio only.
// Game + menu sound effects are synthesized here (short, layered, filtered: no chiptune beeps).
// The crowd bed / cheers / ooh use real CC0 crowd recordings from audio/ (see audio/CREDITS.txt) once they are loaded,
// with synthesized fallbacks until then.
// API (stable, the game imports it too): Audio.init(), Audio.play(name, vol=1), Audio.crowd(level 0..1), Audio.music(on), Audio.stopAll()
import { Settings } from './settings.js';

const FILES = { bed: 'audio/crowd_bed.mp3', hype: 'audio/crowd_hype.mp3', fx: 'audio/crowd_fx.mp3' };
const FX = { cheerBig: [0, 8.15], cheer: [8.21, 4.8], cheer2: [13.07, 4.8], ooh: [17.93, 5], groan: [22.99, 3],
  clap1: [37.67, 0.324], clap2: [38.054, 0.324], clap3: [38.438, 0.324], whistle: [38.822, 1.4], whistle2: [40.282, 0.53] };

let ctx = null, out = null, sfxBus = null, crowdBus = null, noiseBuf = null, unlocked = false, keep = null;
const buf = {};
let bed = null, crowdLevel = 0;
const R = (a, b) => a + Math.random() * (b - a);

function makeNoise() {
  const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function gain(v, dest) { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
function filt(type, f, q, dest) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; b.connect(dest); return b; }
function osc(type, f, t, dur, dest) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; }
function noise(t, dur, dest, rate = 1) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = rate; s.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return s; }
// percussive envelope: attack a, exponential fall over d
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
// held envelope: attack a, hold until h, release r
function hold(g, t, a, peak, h, r) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.setValueAtTime(peak, t + h); g.gain.exponentialRampToValueAtTime(0.0001, t + h + r); }
const tg = (v, dest) => gain(0, dest);

function marker(b) { const d = b.getChannelData(0), n = Math.min(d.length, Math.floor(b.sampleRate * 0.12)); let k = 0, m = 0; for (let i = 0; i < n; i++) if (Math.abs(d[i]) > m) { m = Math.abs(d[i]); k = i; } return k / b.sampleRate + 0.25; }
function load() {
  const order = ['fx', 'bed', 'hype'];
  const next = () => {
    const k = order.shift(); if (!k) return;
    fetch(FILES[k]).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(ab => new Promise((ok, no) => { const p = ctx.decodeAudioData(ab, ok, no); if (p && p.catch) p.catch(no); }))
      .then(b => { buf[k] = { b, at: marker(b) }; if ((k === 'bed' || k === 'hype') && bed && bed.synth) { stopBed(); applyCrowd(); } }, () => {})
      .then(next);
  };
  next();
}
// one slot of crowd_fx.mp3, trimmed with a fade
function sprite(slot, t, dest, len, rate = 1) {
  const B = buf.fx, s = FX[slot]; if (!B || !s) return false;
  const L = Math.min(len || s[1], s[1]), src = ctx.createBufferSource(), g = gain(1, dest);
  src.buffer = B.b; src.playbackRate.value = rate; src.connect(g);
  g.gain.setValueAtTime(1, t + Math.max(0.05, L - 0.5)); g.gain.linearRampToValueAtTime(0.0001, t + L);
  src.start(t, B.at + s[0], L + 0.05); return true;
}

// ---- the sounds. each gets (t, dest) where dest already carries the volume ----
const S = {
  bounce(t, d) { // ball on hardwood: low thump + the "pock" of the floor + a little shell ring
    const g = tg(0, d); env(g, t, 0.003, 0.9, 0.16);
    const o = osc('sine', R(140, 165), t, 0.2, g); o.frequency.exponentialRampToValueAtTime(R(48, 56), t + 0.09);
    const n = tg(0, d); env(n, t, 0.001, 0.32, 0.035); noise(t, 0.06, filt('bandpass', R(900, 1300), 1.4, n));
    const r = tg(0, d); env(r, t, 0.002, 0.08, 0.08); osc('triangle', R(230, 260), t, 0.12, r);
  },
  swish(t, d) { // net: band-passed noise sweeping up then settling, plus a high flutter
    const g = tg(0, d); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    const bp = filt('bandpass', 1800, 0.7, g); bp.frequency.setValueAtTime(1600, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 0.11); bp.frequency.exponentialRampToValueAtTime(2800, t + 0.3);
    noise(t, 0.35, bp);
    const g2 = tg(0, d); env(g2, t + 0.05, 0.02, 0.16, 0.2); noise(t + 0.05, 0.27, filt('highpass', 6500, 0.5, g2));
  },
  rim(t, d) { // metal ring: inharmonic partials (bar modes) + the impact + the ball's thunk
    const f0 = R(440, 520);
    [[1, 0.42, 0.42], [2.76, 0.26, 0.26], [5.4, 0.14, 0.14], [8.93, 0.07, 0.08], [1.52, 0.12, 0.3]].forEach(([m, a, dd]) => {
      const g = tg(0, d); env(g, t, 0.001, a, dd); osc('sine', f0 * m * R(0.995, 1.005), t, dd + 0.05, g); });
    const n = tg(0, d); env(n, t, 0.001, 0.35, 0.03); noise(t, 0.05, filt('bandpass', 3200, 0.9, n));
    const b = tg(0, d); env(b, t, 0.002, 0.4, 0.1); const o = osc('sine', 150, t, 0.13, b); o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
  },
  board(t, d) { // backboard: dull thud + glassy knock + a short frame rattle
    const g = tg(0, d); env(g, t, 0.002, 0.8, 0.17); const o = osc('sine', 120, t, 0.2, g); o.frequency.exponentialRampToValueAtTime(62, t + 0.12);
    const n = tg(0, d); env(n, t, 0.001, 0.4, 0.06); noise(t, 0.08, filt('bandpass', 650, 1.2, n));
    [1240, 1980, 3150].forEach((f, i) => { const k = tg(0, d); env(k, t, 0.001, 0.07 / (i + 1), 0.09); osc('sine', f * R(0.98, 1.02), t, 0.12, k); });
    const r = tg(0, d); env(r, t + 0.02, 0.004, 0.08, 0.12); noise(t + 0.02, 0.15, filt('bandpass', 2400, 4, r));
  },
  whistle(t, d) { // real ref whistle when loaded, else two beating sines with a pea trill
    if (sprite('whistle2', t, gain(0.8, d), 0.55)) return;
    const g = tg(0, d); hold(g, t, 0.02, 0.22, 0.42, 0.08);
    const am = ctx.createGain(); am.gain.value = 0.65; am.connect(g);
    const lfo = ctx.createOscillator(); lfo.frequency.value = R(26, 32); const lg = ctx.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(am.gain);
    const fm = ctx.createGain(); fm.gain.value = 60; lfo.connect(fm);
    [2950, 3080].forEach(f => { const o = osc('sine', f, t, 0.55, am); fm.connect(o.frequency); });
    lfo.start(t); lfo.stop(t + 0.6);
    const b = tg(0, d); hold(b, t, 0.02, 0.05, 0.42, 0.08); noise(t, 0.55, filt('bandpass', 3000, 3, b));
  },
  buzzer(t, d) { // arena horn: detuned saws + a square octave through a lowpass
    const g = tg(0, d); hold(g, t, 0.015, 0.3, 0.85, 0.08);
    const lp = filt('lowpass', 2000, 0.8, g);
    [[196, 'sawtooth', 0.5], [197.6, 'sawtooth', 0.5], [393, 'square', 0.18], [588, 'sawtooth', 0.12]].forEach(([f, ty, a]) => osc(ty, f, t, 0.95, gain(a, lp)));
  },
  squeak(t, d) { // sneaker chirp: quick vibrato glide
    const g = tg(0, d); env(g, t, 0.006, 0.12, 0.09);
    const o = osc('triangle', R(1700, 2300), t, 0.13, filt('bandpass', 2900, 2.2, g));
    o.frequency.linearRampToValueAtTime(R(3000, 3900), t + 0.05); o.frequency.linearRampToValueAtTime(R(2400, 2800), t + 0.11);
    const v = ctx.createOscillator(); v.frequency.value = R(55, 75); const vg = gain(140, o.frequency); v.connect(vg); v.start(t); v.stop(t + 0.15);
  },
  catch(t, d) { // soft palm slap on leather
    const n = tg(0, d); env(n, t, 0.002, 0.45, 0.05); noise(t, 0.07, filt('lowpass', 1700, 0.8, n));
    const g = tg(0, d); env(g, t, 0.002, 0.25, 0.06); const o = osc('sine', 210, t, 0.08, g); o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
  },
  cheer(t, d) {
    if (sprite(Math.random() < 0.5 ? 'cheer' : 'cheer2', t, gain(0.9, d), 2.6)) return;
    const g = tg(0, d); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.45); g.gain.setValueAtTime(0.5, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    [[700, 0.7], [1400, 0.8], [2600, 1]].forEach(([f, q]) => noise(t, 1.65, filt('bandpass', f * R(0.9, 1.1), q, gain(0.6, g)), R(0.9, 1.1)));
  },
  ooh(t, d) {
    if (sprite('ooh', t, gain(0.9, d), 2.2)) return;
    const g = tg(0, d); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    const f1 = filt('bandpass', 450, 3, g), f2 = filt('bandpass', 850, 4, gain(0.5, g));
    for (let i = 0; i < 8; i++) { const o = osc('sawtooth', R(150, 280), t, 1.55, f1); o.connect(f2); o.frequency.linearRampToValueAtTime(o.frequency.value * 0.85, t + 1.5); }
  },
  ui(t, d) { // soft menu tick
    const g = tg(0, d); env(g, t, 0.002, 0.05, 0.03); osc('sine', 2100, t, 0.05, g);
    const n = tg(0, d); env(n, t, 0.001, 0.03, 0.015); noise(t, 0.03, filt('highpass', 5000, 0.7, n));
  },
  ui_ok(t, d) {
    [[880, 0], [1320, 0.055]].forEach(([f, dt]) => { const g = tg(0, d); env(g, t + dt, 0.004, 0.07, 0.11); osc('triangle', f, t + dt, 0.15, filt('lowpass', 3000, 0.7, g)); });
    const n = tg(0, d); env(n, t, 0.001, 0.025, 0.02); noise(t, 0.03, filt('highpass', 4000, 0.7, n));
  },
  ui_back(t, d) {
    [[990, 0], [660, 0.055]].forEach(([f, dt]) => { const g = tg(0, d); env(g, t + dt, 0.004, 0.06, 0.1); osc('triangle', f, t + dt, 0.14, filt('lowpass', 2500, 0.7, g)); });
  },
  pack(t, d) { // foil rip: gated band noise sweeping up, then a low whump
    const g = tg(0, d); g.gain.setValueAtTime(0.0001, t);
    for (let i = 0, x = t; i < 34; i++, x += 0.013) g.gain.setValueAtTime(R(0.08, 0.5) * (1 - i / 44), x);
    g.gain.setValueAtTime(0.0001, t + 0.46);
    const bp = filt('bandpass', 1200, 0.9, g); bp.frequency.setValueAtTime(1100, t); bp.frequency.exponentialRampToValueAtTime(4800, t + 0.42);
    noise(t, 0.48, bp);
    const w = tg(0, d); env(w, t + 0.4, 0.01, 0.5, 0.25); const o = osc('sine', 110, t + 0.4, 0.3, w); o.frequency.exponentialRampToValueAtTime(48, t + 0.62);
  },
  reveal(t, d) { // short whoosh into a hit with a bright shimmer
    const w = tg(0, d); w.gain.setValueAtTime(0.0001, t); w.gain.exponentialRampToValueAtTime(0.3, t + 0.16); w.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const bp = filt('bandpass', 500, 1.1, w); bp.frequency.exponentialRampToValueAtTime(3500, t + 0.2); noise(t, 0.24, bp);
    const h = t + 0.18, g = tg(0, d); env(g, h, 0.003, 0.7, 0.3); const o = osc('sine', 95, h, 0.35, g); o.frequency.exponentialRampToValueAtTime(44, h + 0.25);
    const n = tg(0, d); env(n, h, 0.001, 0.25, 0.08); noise(h, 0.1, filt('lowpass', 2500, 0.7, n));
    [2637, 3520, 4186].forEach((f, i) => { const s = tg(0, d); env(s, h + i * 0.03, 0.004, 0.05, 0.5); osc('sine', f, h + i * 0.03, 0.55, s); });
  },
  big(t, d) { // big reveal sting: rising whoosh, then boom + opening brass-like chord + cymbal wash
    const w = tg(0, d); w.gain.setValueAtTime(0.0001, t); w.gain.exponentialRampToValueAtTime(0.35, t + 0.55); w.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    const bp = filt('bandpass', 300, 1, w); bp.frequency.exponentialRampToValueAtTime(5000, t + 0.6); noise(t, 0.62, bp);
    const h = t + 0.58;
    const b = tg(0, d); env(b, h, 0.004, 0.9, 1.0); const o = osc('sine', 72, h, 1.1, b); o.frequency.exponentialRampToValueAtTime(34, h + 0.8);
    const c = tg(0, d); hold(c, h, 0.03, 0.2, 0.7, 0.9);
    const lp = filt('lowpass', 500, 1.2, c); lp.frequency.setValueAtTime(500, h); lp.frequency.exponentialRampToValueAtTime(3800, h + 0.25); lp.frequency.exponentialRampToValueAtTime(1100, h + 1.5);
    [146.8, 220, 293.7, 370, 440].forEach(f => { osc('sawtooth', f * 0.997, h, 1.7, gain(0.2, lp)); osc('sawtooth', f * 1.003, h, 1.7, gain(0.2, lp)); });
    const cy = tg(0, d); env(cy, h, 0.005, 0.22, 1.3); noise(h, 1.4, filt('highpass', 5500, 0.6, cy));
  },
};

function bus(v) { const g = ctx.createGain(); g.gain.value = v; g.connect(out); return g; }
function stopBed() { if (!bed) return; const t = ctx.currentTime; for (const x of bed.srcs) { try { x.stop(t + 0.6); } catch {} } bed.g.gain.setTargetAtTime(0, t, 0.15); bed = null; }
function startBed() {
  const g = gain(0, crowdBus), lp = filt('lowpass', 2000, 0.5, g), hg = gain(0, g), srcs = [];
  const loopSrc = (B, dest) => { const s = ctx.createBufferSource(); s.buffer = B.b; s.loop = true; s.loopStart = B.at; s.loopEnd = B.b.duration; s.connect(dest); s.start(ctx.currentTime, B.at + Math.random() * 3); srcs.push(s); };
  let synth = false;
  if (buf.bed) loopSrc(buf.bed, lp);
  else { synth = true; // pinkish wash until the recording is ready
    [[400, 0.6], [900, 0.7], [1900, 0.9]].forEach(([f, q]) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = R(0.9, 1.1); s.connect(filt('bandpass', f, q, gain(0.35, lp))); s.start(); srcs.push(s); }); }
  if (buf.hype) loopSrc(buf.hype, hg);
  bed = { g, lp, hg, srcs, synth };
}
function applyCrowd() {
  if (!ctx || !out) return;
  const L = crowdLevel, v = (Settings.crowd ?? 0.7) * L;
  if (v <= 0.001) { if (bed) { bed.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); } return; }
  if (!bed) startBed();
  const t = ctx.currentTime;
  bed.g.gain.setTargetAtTime(v * 0.9, t, 0.35);
  bed.lp.frequency.setTargetAtTime(700 + L * L * 9000, t, 0.35);
  bed.hg.gain.setTargetAtTime(Math.max(0, L - 0.6) * 1.6, t, 0.3);
}

export const Audio = {
  init() {
    if (!unlocked) { unlocked = true; // iPhone: play through the silent switch
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
      try { const a = new window.Audio('data:audio/mp4;base64,AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAAhmcmVlAAAAGm1kYXQhEAUgpBv/wAAAAAAAAAAAAAAAAAAAAA=='); a.loop = true; a.volume = 0.01; a.setAttribute('playsinline', ''); a.play().catch(() => {}); keep = a; } catch {} }
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
    if (ctx.state === 'suspended') ctx.resume();
    if (!out) {
      const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 10; lim.attack.value = 0.003; lim.release.value = 0.2;
      out = ctx.createGain(); out.connect(lim); lim.connect(ctx.destination);
      noiseBuf = makeNoise(); sfxBus = bus(1); crowdBus = bus(1); load(); applyCrowd();
    }
  },
  get ready() { return !!(ctx && out && ctx.state === 'running'); },
  play(name, vol = 1) {
    if (!this.ready || !S[name]) return;
    const v = vol * (Settings.sfx ?? 0.8); if (v <= 0.001) return;
    try { S[name](ctx.currentTime + 0.005, gain(v, sfxBus)); } catch (e) { console.warn('[audio]', name, e); } // never break the game for a sound
  },
  crowd(level) { crowdLevel = Math.max(0, Math.min(1, +level || 0)); applyCrowd(); },
  refresh() { applyCrowd(); }, // after Settings.crowd changed
  music(on) { /* no menu music: a cheap loop would hurt more than help. kept for API stability */ this._music = !!on; },
  stopAll() {
    if (!ctx || !out) return;
    stopBed(); crowdLevel = 0;
    const t = ctx.currentTime;
    for (const b of [sfxBus]) { b.gain.setTargetAtTime(0, t, 0.03); setTimeout(() => { try { b.disconnect(); } catch {} }, 300); }
    sfxBus = bus(1);
  },
  get ctx() { return ctx; },
};
