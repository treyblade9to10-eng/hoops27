// Menu core: screen stack, frame (top bar / stage / hint bar), focus navigation for keyboard + gamepad + touch, modals, toasts.
import { Audio } from '../audio.js';
import { icon, esc, fmt, el, wordmark } from './common.js';
import * as MT from '../myteam.js';

export const app = { stack: [], cur: null, screens: {}, mode: 'kb', active: true, modal: null };
let root, stage, crumb, coins, hintsEl, bg, modalLayer, toasts;

export function mount(menuEl) {
  root = menuEl;
  root.innerHTML = `<div class="bg"><div class="bg-slab"></div><div class="bg-slab2"></div><div class="bg-p"></div><div class="bg-tex"></div></div>
  <header class="top"><div class="top-l">${wordmark('sm')}<span class="crumb"></span></div><div class="coins">${icon('coin')}<b>0</b><span>MT</span></div></header>
  <main class="stage"></main>
  <footer class="hints"></footer>
  <div class="modal-layer"></div><div class="toasts"></div>`;
  stage = root.querySelector('.stage'); crumb = root.querySelector('.crumb'); coins = root.querySelector('.coins');
  hintsEl = root.querySelector('.hints'); bg = root.querySelector('.bg'); modalLayer = root.querySelector('.modal-layer'); toasts = root.querySelector('.toasts');
  hintsEl.addEventListener('click', e => { const h = e.target.closest('[data-act]'); if (h) act(h.dataset.act); });
  initInput();
}

// ---------- screens ----------
export function register(name, fn) { app.screens[name] = fn; }
function render(entry, dir = 1) {
  const old = app.cur;
  if (old) { try { old.leave && old.leave(); } catch (e) { console.error(e); } const a = document.activeElement; if (a && a.dataset && a.dataset.id && old.entry) old.entry.params._focus = a.dataset.id; }
  const scr = app.screens[entry.name](entry.params) || {};
  scr.entry = entry; app.cur = scr;
  stage.innerHTML = ''; stage.className = 'stage in' + (dir < 0 ? ' back' : '');
  stage.dataset.screen = entry.name;
  if (scr.el) stage.appendChild(scr.el);
  root.classList.toggle('chromeless', scr.chrome === false);
  root.dataset.screen = entry.name;
  crumb.textContent = scr.title || '';
  setCoins(scr.coins !== false);
  setHints(scr.hints || [['ok', 'SELECT'], ['back', 'BACK']]);
  if (scr.bg) setBg(scr.bg); else setBg(null);
  void stage.offsetWidth; stage.classList.add('go');
  requestAnimationFrame(() => {
    const want = entry.params._focus && scr.el && scr.el.querySelector(`[data-id="${CSS.escape(entry.params._focus)}"]`);
    focusEl(want || (scr.el && (scr.el.querySelector('.f.dflt') || scr.el.querySelector('.f'))), true);
    scr.enter && scr.enter();
  });
}
export function go(name, params = {}) { app.stack.push({ name, params }); render(app.stack[app.stack.length - 1], 1); }
export function replace(name, params = {}) { app.stack[app.stack.length - 1] = { name, params }; render(app.stack[app.stack.length - 1], 1); }
export function back() {
  if (app.stack.length <= 1) return false;
  app.stack.pop(); Audio.play('ui_back', 0.8); render(app.stack[app.stack.length - 1], -1); return true;
}
export function home() { app.stack = app.stack.slice(0, 1).filter(e => e.name === 'main'); if (!app.stack.length) app.stack.push({ name: 'main', params: {} }); render(app.stack[0], -1); }
export function popTo(name) {
  const i = app.stack.map(e => e.name).lastIndexOf(name);
  if (i < 0) return home();
  app.stack = app.stack.slice(0, i + 1); Audio.play('ui_back', 0.8); render(app.stack[i], -1);
}
export function refresh() { render(app.stack[app.stack.length - 1], 0); }

export function setCoins(show) {
  coins.style.visibility = show ? '' : 'hidden';
  const s = MT.load(); coins.querySelector('b').textContent = fmt(s ? s.mt : 0);
}
export function bumpCoins() { setCoins(true); coins.classList.remove('bump'); void coins.offsetWidth; coins.classList.add('bump'); }
// background: team colors + a big star headshot
export function setBg(b) {
  bg.classList.toggle('plain', !b);
  if (!b) return;
  bg.style.setProperty('--b1', b.c1); bg.style.setProperty('--b2', b.c2);
  const pEl = bg.querySelector('.bg-p'), id = b.p ? String(b.p.id) : '';
  if (pEl.dataset.id !== id) {
    pEl.dataset.id = id;
    pEl.innerHTML = b.p ? `<img src="https://a.espncdn.com/i/headshots/nba/players/full/${b.p.id}.png" alt="" onerror="this.remove()">` : '';
  }
}

// ---------- hints ----------
const GLYPH = {
  kb: { ok: 'ENTER', back: 'ESC', lr: '&larr; &rarr;', ud: '&uarr; &darr;', tab: 'Q / E', alt: 'R', x: 'F' },
  pad: { ok: 'A', back: 'B', lr: 'D-PAD', ud: 'D-PAD', tab: 'LB / RB', alt: 'Y', x: 'X' },
};
let lastHints = [];
export function setHints(h) {
  lastHints = h;
  const m = app.mode === 'touch' ? null : GLYPH[app.mode] || GLYPH.kb;
  hintsEl.innerHTML = h.map(([a, label]) => {
    if (!m && !['back', 'alt', 'x'].includes(a)) return '';
    const g = m ? `<kbd class="${app.mode === 'pad' && a.length < 4 && ['ok', 'back', 'alt', 'x'].includes(a) ? 'pb pb-' + a : ''}">${m[a] || ''}</kbd>` : (a === 'back' ? icon('chevL') : '');
    return `<button class="hint${m ? '' : ' tap'}" data-act="${a}" tabindex="-1">${g}<span>${esc(label)}</span></button>`;
  }).join('');
}
function setMode(m) { if (app.mode === m) return; app.mode = m; root.dataset.input = m; setHints(lastHints); }

// ---------- focus + navigation ----------
const visible = (e) => { if (e.disabled || e.closest('[hidden]')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
export function focusables() { const scope = app.modal || (app.cur && app.cur.el) || root; return [...scope.querySelectorAll('.f')].filter(visible); }
export function focusEl(e, quiet) {
  if (!e) return;
  e.focus({ preventScroll: true });
  e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (!quiet) Audio.play('ui', 0.7);
}
function nav(dir) {
  const items = focusables(), cur = document.activeElement;
  if (!items.length) return;
  if (!items.includes(cur)) return focusEl(items[0]);
  const a = cur.getBoundingClientRect();
  let best = null, bs = 1e9;
  for (const e of items) {
    if (e === cur) continue;
    const b = e.getBoundingClientRect();
    let main, side;
    if (dir === 'right') { if (b.left < a.right - 6 && (b.left + b.right) / 2 <= (a.left + a.right) / 2 + 4) continue; main = Math.max(0, b.left - a.right); side = Math.max(0, b.top - a.bottom, a.top - b.bottom); }
    else if (dir === 'left') { if (b.right > a.left + 6 && (b.left + b.right) / 2 >= (a.left + a.right) / 2 - 4) continue; main = Math.max(0, a.left - b.right); side = Math.max(0, b.top - a.bottom, a.top - b.bottom); }
    else if (dir === 'down') { if (b.top < a.bottom - 6 && (b.top + b.bottom) / 2 <= (a.top + a.bottom) / 2 + 4) continue; main = Math.max(0, b.top - a.bottom); side = Math.max(0, b.left - a.right, a.left - b.right); }
    else { if (b.bottom > a.top + 6 && (b.top + b.bottom) / 2 >= (a.top + a.bottom) / 2 - 4) continue; main = Math.max(0, a.top - b.bottom); side = Math.max(0, b.left - a.right, a.left - b.right); }
    const cx = Math.abs((b.left + b.right) / 2 - (a.left + a.right) / 2), cy = Math.abs((b.top + b.bottom) / 2 - (a.top + a.bottom) / 2);
    const s = main + side * 3 + (dir === 'left' || dir === 'right' ? cy : cx) * 0.25;
    if (s < bs) { bs = s; best = e; }
  }
  if (best) focusEl(best);
}
export function act(k) {
  if (!app.active) return;
  const cur = document.activeElement;
  if (app.modal) {
    if (k === 'back') return closeModal(app.modal._cancel);
    if (k === 'ok') { if (cur && cur.classList.contains('f')) cur.click(); return; }
    if (['left', 'right'].includes(k) && cur && cur._lr && app.modal.contains(cur)) { cur._lr(k === 'left' ? -1 : 1); Audio.play('ui', 0.6); return; }
    if (['up', 'down', 'left', 'right'].includes(k)) nav(k);
    return;
  }
  const s = app.cur; if (!s) return;
  if (s.key && s.key(k, cur) === true) return;
  if ((k === 'left' || k === 'right') && cur && cur._lr && s.el && s.el.contains(cur)) { if (cur._lr(k === 'left' ? -1 : 1) !== false) { Audio.play('ui', 0.6); return; } }
  if (['up', 'down', 'left', 'right'].includes(k)) return nav(k);
  if (k === 'ok') { if (cur && cur.classList.contains('f') && document.body.contains(cur)) cur.click(); else { const f = focusables()[0]; if (f) focusEl(f); } return; }
  if (k === 'back') { if (s.back) s.back(); else back(); }
}

// ---------- modal + toast ----------
// buttons: [{label, value, cls}], resolves with the value (cancel value on back)
export function modal(html, buttons, cancel = null) {
  return new Promise(res => {
    const m = el(`<div class="modal"><div class="mbox">${html}<div class="mbtns">${buttons.map((b, i) => `<button class="btn f ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div></div>`);
    m._res = res; m._cancel = cancel;
    m.querySelectorAll('.mbtns .btn').forEach(b => b.addEventListener('click', () => closeModal(buttons[+b.dataset.i].value)));
    m.addEventListener('click', e => { if (e.target === m) closeModal(cancel); });
    m._prev = document.activeElement;
    modalLayer.appendChild(m); app.modal = m;
    requestAnimationFrame(() => focusEl(m.querySelector('.f.dflt') || m.querySelector('.mbtns .btn'), true));
  });
}
export function closeModal(v) {
  const m = app.modal; if (!m) return;
  app.modal = null; m.classList.add('out'); setTimeout(() => m.remove(), 180);
  if (m._prev && document.body.contains(m._prev)) m._prev.focus({ preventScroll: true });
  m._res(v);
}
export const confirm = (title, text, yes = 'CONFIRM', no = 'CANCEL') =>
  modal(`<h3>${esc(title)}</h3><p>${text}</p>`, [{ label: no, value: false }, { label: yes, value: true, cls: 'go dflt' }], false);
export function toast(msg, cls = '') {
  const t = el(`<div class="toast ${cls}">${msg}</div>`); toasts.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2400); setTimeout(() => t.remove(), 2800);
}

// ---------- input ----------
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', ' ': 'ok', Escape: 'back', Backspace: 'back', q: 'prev', Q: 'prev', e: 'next', E: 'next', r: 'alt', R: 'alt', f: 'x', F: 'x', PageUp: 'prev', PageDown: 'next' };
function initInput() {
  window.addEventListener('keydown', e => {
    if (!app.active) return;
    const k = KEYS[e.key]; if (!k) return;
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (typing) {
      if (k === 'back' && e.key === 'Escape') { t.blur(); e.preventDefault(); }
      else if (e.key === 'Enter') { t.blur(); e.preventDefault(); t.dispatchEvent(new Event('change')); }
      else if (k === 'up' || k === 'down') { e.preventDefault(); act(k); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault(); setMode('kb'); act(k);
  });
  root.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse' || !app.active) return;
    const f = e.target.closest('.f'); if (f && f !== document.activeElement && visible(f) && (!app.modal || app.modal.contains(f))) { f.focus({ preventScroll: true }); Audio.play('ui', 0.35); }
  });
  root.addEventListener('pointerdown', e => setMode(e.pointerType === 'touch' ? 'touch' : 'kb'), true);
  root.addEventListener('click', e => { const f = e.target.closest('.f, .tapsnd'); if (f && !f.classList.contains('opt')) Audio.play('ui_ok', 0.6); });
  // no pinch / double-tap zoom on iOS
  ['gesturestart', 'gesturechange'].forEach(n => document.addEventListener(n, e => e.preventDefault(), { passive: false }));
  let lastTouch = 0;
  document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouch < 300 && !e.target.closest('input')) e.preventDefault(); lastTouch = n; }, { passive: false });
  pollPad();
}
// gamepad: D-pad / left stick with key repeat, A ok, B back, X x, Y alt, LB/RB prev/next, START ok
const pad = { prev: {}, rep: {} };
function pollPad() {
  const step = (ts) => {
    requestAnimationFrame(step);
    if (!app.active || !navigator.getGamepads) return;
    const gp = [...navigator.getGamepads()].find(g => g && g.connected); if (!gp) return;
    const B = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const state = { up: B(12) || ay < -0.6, down: B(13) || ay > 0.6, left: B(14) || ax < -0.6, right: B(15) || ax > 0.6, ok: B(0) || B(9), back: B(1), x: B(2), alt: B(3), prev: B(4), next: B(5) };
    for (const k in state) {
      const was = pad.prev[k], now = state[k];
      if (now && !was) { setMode('pad'); act(k); pad.rep[k] = ts + 380; }
      else if (now && ['up', 'down', 'left', 'right'].includes(k) && ts > pad.rep[k]) { act(k); pad.rep[k] = ts + 110; }
      pad.prev[k] = now;
    }
  };
  requestAnimationFrame(step);
}
