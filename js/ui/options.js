// OPTIONS and CONTROLS screens.
import { register, confirm, toast } from './core.js';
import { Audio } from '../audio.js';
import { Settings, saveSettings, DIFFS } from '../settings.js';
import { el, esc, icon, optRow, volBar } from './common.js';
import { QLENS } from './play.js';
import * as MT from '../myteam.js';

const VOLS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const near = (arr, v) => arr.reduce((b, x, i) => (Math.abs(x - v) < Math.abs(arr[b] - v) ? i : b), 0);

register('options', () => {
  const e = el(`<section class="opt-scr"><div class="opt-list"></div><div class="opt-side"><h4></h4><p></p></div></section>`);
  const L = e.querySelector('.opt-list'), H = e.querySelector('.opt-side h4'), D = e.querySelector('.opt-side p');
  const set = (k, v) => { Settings[k] = v; saveSettings(); };
  const rows = [
    ['camera', 'CAMERA', 'Broadcast follows the play from the sideline like TV. High looks down from the rafters. Low sits courtside, close to the action.',
      optRow('camera', 'CAMERA', ['broadcast', 'high', 'low'], ['broadcast', 'high', 'low'].indexOf(Settings.camera), v => set('camera', v), v => v.toUpperCase())],
    ['meter', 'SHOT METER', 'Shows the timing meter above your shooter. Release at the top for a perfect shot.',
      optRow('meter', 'SHOT METER', [true, false], Settings.meter ? 0 : 1, v => set('meter', v), v => (v ? 'ON' : 'OFF'))],
    ['sfx', 'SOUND EFFECTS', 'Ball, rim, whistle, sneakers and menu sounds.',
      optRow('sfx', 'SOUND FX', VOLS, near(VOLS, Settings.sfx), v => { set('sfx', v); Audio.play('bounce', 1); }, volBar)],
    ['crowd', 'CROWD', 'How loud the arena crowd is during games.',
      optRow('crowd', 'CROWD', VOLS, near(VOLS, Settings.crowd), v => { set('crowd', v); Audio.refresh(); Audio.play('cheer', 0.5); }, volBar)],
    ['qlen', 'QUARTER LENGTH', 'Default minutes per quarter for new games. The game clock runs faster than real time.',
      optRow('qlen', 'QUARTER LENGTH', QLENS, Math.max(0, QLENS.indexOf(Settings.qLen)), v => set('qLen', v), v => `${v} MIN`)],
    ['diff', 'DIFFICULTY', 'How smart and accurate the CPU is. Rookie is relaxed, Hall of Fame punishes every mistake.',
      optRow('diff', 'DIFFICULTY', DIFFS, Settings.diff, (v, i) => set('diff', i))],
    ['gfx', 'GRAPHICS', 'Auto picks the best look your device can run smoothly. Fast lowers detail for older phones.',
      optRow('gfx', 'GRAPHICS', ['auto', 'high', 'fast'], Math.max(0, ['auto', 'high', 'fast'].indexOf(Settings.gfx)), v => set('gfx', v), v => v.toUpperCase())],
    ['hints', 'BUTTON HINTS', 'Shows control tips during games.',
      optRow('hints', 'IN-GAME HINTS', [true, false], Settings.hints ? 0 : 1, v => set('hints', v), v => (v ? 'ON' : 'OFF'))],
  ];
  for (const [id, h, d, r] of rows) { r.dataset.h = h; r.dataset.d = d; L.appendChild(r); }
  const reset = el(`<button class="btn danger f" data-id="reset" data-h="RESET MyTEAM" data-d="Deletes your MyTEAM cards, lineup, record and MT. You start over with a new starter pack.">RESET MyTEAM</button>`);
  L.appendChild(reset);
  reset.addEventListener('click', async () => {
    if (!MT.load()) { toast('No MyTEAM save yet.'); return; }
    if (await confirm('RESET MyTEAM?', 'All your cards, your lineup, your record and your MT will be deleted. This cannot be undone.', 'RESET', 'KEEP')) { MT.reset(); toast('MyTEAM reset.'); }
  });
  e.addEventListener('focusin', ev => { const r = ev.target.closest('[data-h]'); if (r) { H.textContent = r.dataset.h; D.textContent = r.dataset.d; } });
  H.textContent = rows[0][1]; D.textContent = rows[0][2];
  L.firstElementChild.classList.add('dflt');
  return { el: e, title: 'OPTIONS', coins: false, hints: [['ud', 'SELECT'], ['lr', 'CHANGE'], ['back', 'BACK']] };
});

// ---------- CONTROLS ----------
const KB = {
  off: [['W A S D', 'Move'], ['SHIFT', 'Sprint'], ['J', 'Shoot (hold, release at the top of the meter)'], ['J near rim', 'Layup while moving, dunk while sprinting'], ['K', 'Pass to the teammate you move toward'], ['L', 'Dribble move: crossover, spin, behind the back'], ['I', 'Alley-oop lob'], ['U', 'Call a screen']],
  def: [['W A S D', 'Move'], ['SHIFT', 'Sprint'], ['K', 'Switch player'], ['J', 'Steal'], ['SPACE', 'Block / contest jump'], ['hold L', 'Defensive stance (slower, better D)'], ['ESC', 'Pause']],
};
const PAD = {
  off: [['LS', 'Move'], ['RT', 'Sprint'], ['X', 'Shoot (hold, release at the top)'], ['A', 'Pass'], ['Y', 'Alley-oop'], ['B', 'Dribble move'], ['LB', 'Call a screen']],
  def: [['LS', 'Move'], ['RT', 'Sprint'], ['A', 'Switch player'], ['X', 'Steal'], ['Y', 'Block'], ['LT', 'Defensive stance'], ['START', 'Pause']],
};
const keycaps = (s) => s.split(' ').map(k => (k.length <= 6 && k === k.toUpperCase() ? `<kbd>${esc(k)}</kbd>` : `<i>${esc(k)}</i>`)).join('');
const padcap = (s) => `<kbd class="${['A', 'B', 'X', 'Y'].includes(s) ? 'pb pb-' + s.toLowerCase() : ''}">${esc(s)}</kbd>`;

function sheet(map, cap, note = '') {
  const col = (h, rows) => `<div class="cs-col"><h4>${h}</h4>${rows.map(([k, a]) => `<div class="cs-row"><span class="cs-k">${cap(k)}</span><span class="cs-a">${esc(a)}</span></div>`).join('')}</div>`;
  return `<div class="cs-cols">${col('OFFENSE', map.off)}${col('DEFENSE', map.def)}</div>${note}`;
}
function touchSheet() {
  const btn = (o, d, cls) => `<span class="tb ${cls}"><b>${o}</b><small>${d}</small></span>`;
  return `<div class="touch-wrap">
    <div class="phone"><div class="ph-screen">
      <span class="ph-joy"><i></i></span>
      <span class="ph-btns">${btn('SHOOT', 'BLOCK', 'big')}${btn('PASS', 'SWITCH', '')}${btn('MOVE', 'STEAL', '')}${btn('LOB', 'STANCE', '')}${btn('SPRINT', 'SPRINT', '')}</span>
    </div></div>
    <div class="touch-notes">
      <div class="cs-row"><span class="cs-k"><kbd>LEFT</kbd></span><span class="cs-a">Left joystick moves your player</span></div>
      <div class="cs-row"><span class="cs-k"><kbd>SHOOT</kbd></span><span class="cs-a">Hold, release at the top of the meter. Near the rim: layup, sprinting: dunk</span></div>
      <div class="cs-row"><span class="cs-k"><kbd>PASS</kbd></span><span class="cs-a">Passes to the teammate you are moving toward</span></div>
      <div class="cs-row"><span class="cs-k"><kbd>MOVE</kbd></span><span class="cs-a">Dribble move: crossover, spin, behind the back</span></div>
      <div class="cs-row"><span class="cs-k"><kbd>LOB</kbd></span><span class="cs-a">Alley-oop</span></div>
      <div class="cs-row def"><span class="cs-k"><kbd>DEFENSE</kbd></span><span class="cs-a">Buttons turn into BLOCK, SWITCH, STEAL, STANCE (small labels)</span></div>
    </div>
  </div>`;
}

register('controls', (P) => {
  const TABS = [['kb', 'KEYBOARD', 'keys'], ['pad', 'CONTROLLER', 'pad'], ['touch', 'TOUCH', 'touch']];
  P.tab = P.tab || (matchMedia('(pointer: coarse)').matches ? 'touch' : 'kb');
  const e = el(`<section class="ctl-scr"><div class="tabs big">${TABS.map(([id, n, ic]) => `<button class="tab f" data-tab="${id}" data-id="t-${id}">${icon(ic)}<span>${n}</span></button>`).join('')}</div><div class="ctl-body"></div></section>`);
  const body = e.querySelector('.ctl-body');
  function tab(id) {
    P.tab = id;
    e.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
    body.innerHTML = id === 'kb' ? sheet(KB, keycaps, '<p class="cs-note">Arrow keys also move. <kbd>ESC</kbd> pauses the game.</p>') : id === 'pad' ? sheet(PAD, padcap, '<p class="cs-note">Xbox layout shown. On PlayStation: A = Cross, B = Circle, X = Square, Y = Triangle.</p>') : touchSheet();
  }
  e.querySelectorAll('.tab').forEach(b => { b.addEventListener('click', () => tab(b.dataset.tab)); b.addEventListener('focus', () => tab(b.dataset.tab)); });
  tab(P.tab);
  e.querySelector(`[data-tab=${P.tab}]`).classList.add('dflt');
  return {
    el: e, title: 'CONTROLS', coins: false, hints: [['lr', 'SWITCH'], ['back', 'BACK']],
    key(k) { if (k === 'prev' || k === 'next') { const i = TABS.findIndex(t => t[0] === P.tab), n = TABS[(i + (k === 'next' ? 1 : 2)) % 3][0]; e.querySelector(`[data-tab=${n}]`).focus(); return true; } return false; },
  };
});
