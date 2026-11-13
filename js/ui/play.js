// PLAY NOW: the versus / team select screen.
import { register, go, setBg as setStageBg } from './core.js';
import { Audio } from '../audio.js';
import { Settings, saveSettings, DIFFS } from '../settings.js';
import { el, esc, hs, logo, icon, optRow, jersey, TEAMS, teamOvr, depthChart, teamColor, lastName, bgFor } from './common.js';
import { fav } from './title.js';

export const QLENS = [1, 2, 3, 5, 8, 12];
export const UNIS = ['home', 'away', 'alt'];
export const teamObj = (t) => ({ id: t.id, city: t.city, name: t.name, abbr: t.id, c1: t.c1, c2: t.c2, logo: t.logo });
export function quickRoster(id) { const d = depthChart(id); return [...d.start, ...d.bench.slice(0, 8)]; }
const SL = ['PG', 'SG', 'SF', 'PF', 'C'];

register('play', (P) => {
  const N = TEAMS().length, idx = (id) => Math.max(0, TEAMS().findIndex(t => t.id === id));
  if (P.home == null) {
    const f = fav.get(); P.home = f ? idx(f) : Math.floor(Math.random() * N);
    do { P.away = Math.floor(Math.random() * N); } while (P.away === P.home);
    P.user = 'home'; P.uni = { home: 'home', away: 'away' };
  }
  const e = el(`<section class="vs-scr">
    <div class="tp" data-side="away"></div>
    <div class="vs-mid">
      <div class="vs-big">VS</div>
      <div class="ctrl f" data-id="ctrl" tabindex="0" aria-label="choose your side">
        <span class="ctrl-l">AWAY</span><span class="ctrl-track"><span class="ctrl-pad">${icon('pad')}<em>YOU</em></span></span><span class="ctrl-r">HOME</span>
      </div>
      <div class="vs-opts"></div>
      <div class="vs-btns">
        <button class="btn f" data-id="rand">${icon('shuffle')}<span>RANDOM</span></button>
        <button class="btn go f dflt" data-id="go">${icon('play')}<span>PLAY</span></button>
      </div>
    </div>
    <div class="tp" data-side="home"></div>
  </section>`);
  const panels = { away: e.querySelector('[data-side=away]'), home: e.querySelector('[data-side=home]') };
  const ctrl = e.querySelector('.ctrl');

  function drawTeam(side, dir = 0) {
    const t = TEAMS()[P[side]], d = depthChart(t.id), pan = panels[side];
    pan.style.setProperty('--tc', teamColor(t)); pan.style.setProperty('--tc2', t.c2);
    pan.innerHTML = `
      <div class="tp-tag">${side === 'home' ? 'HOME' : 'AWAY'}${P.user === side ? '<em>YOU</em>' : '<em class="cpu">CPU</em>'}</div>
      <div class="tp-head f" tabindex="0" data-id="team-${side}">
        <button class="arw" tabindex="-1" data-d="-1" aria-label="previous team">${icon('chevL')}</button>
        <span class="tp-logo ${dir ? (dir > 0 ? 'in-r' : 'in-l') : ''}">${logo(t, 'lg')}</span>
        <button class="arw" tabindex="-1" data-d="1" aria-label="next team">${icon('chevR')}</button>
      </div>
      <div class="tp-name"><small>${esc(t.city)}</small><b>${esc(t.name)}</b></div>
      <div class="tp-ovr"><span>TEAM OVR</span><b>${teamOvr(t.id)}</b></div>
      <div class="tp-five">${d.start.map((p, i) => `<div class="pc">${hs(p)}<span class="pc-pos">${SL[i]}</span><b>${esc(lastName(p.n))}</b><em>${p.ovr}</em></div>`).join('')}</div>
      <div class="tp-uni"></div>`;
    const head = pan.querySelector('.tp-head');
    head._lr = (dd) => { cycle(side, dd); return true; };
    head.addEventListener('click', ev => { const a = ev.target.closest('.arw'); cycle(side, a ? +a.dataset.d : 1); });
    const uni = optRow('uni-' + side, 'UNIFORM', UNIS, UNIS.indexOf(P.uni[side]), (v) => { P.uni[side] = v; drawUni(side); }, (v) => `${jersey(t, v)}<span>${v.toUpperCase()}</span>`);
    pan.querySelector('.tp-uni').appendChild(uni);
    // swipe the panel to change team
    let sx = null;
    pan.onpointerdown = (ev) => { if (ev.pointerType === 'touch') sx = ev.clientX; };
    pan.onpointerup = (ev) => { if (sx != null && Math.abs(ev.clientX - sx) > 50) cycle(side, ev.clientX < sx ? 1 : -1); sx = null; };
  }
  function drawUni(side) { const r = panels[side].querySelector('.opt'); r && r.set(UNIS.indexOf(P.uni[side])); }
  function cycle(side, d) {
    const other = side === 'home' ? 'away' : 'home';
    let i = P[side];
    do { i = (i + d + N) % N; } while (i === P[other]);
    const had = panels[side].contains(document.activeElement);
    P[side] = i; Audio.play('ui', 0.8); drawTeam(side, d); setBg();
    const h = panels[side].querySelector('.tp-head'); if (h && had) h.focus({ preventScroll: true });
  }
  function drawCtrl() {
    ctrl.dataset.side = P.user;
    for (const s of ['home', 'away']) { const tag = panels[s].querySelector('.tp-tag em'); if (tag) { tag.textContent = P.user === s ? 'YOU' : 'CPU'; tag.className = P.user === s ? '' : 'cpu'; } }
    setBg();
  }
  function setBg() {
    const t = TEAMS()[P[P.user]]; const p = depthChart(t.id).start.slice().sort((a, b) => b.ovr - a.ovr)[0];
    setStageBg(bgFor(t, p));
  }
  ctrl._lr = (d) => { const s = d < 0 ? 'away' : 'home'; if (P.user !== s) { P.user = s; drawCtrl(); } return true; };
  ctrl.addEventListener('click', ev => {
    const r = ctrl.getBoundingClientRect(); P.user = ev.clientX < r.left + r.width / 2 ? 'away' : 'home';
    if (ev.detail === 0) P.user = P.user === 'home' ? 'away' : 'home'; // keyboard Enter: toggle
    drawCtrl();
  });

  const opts = e.querySelector('.vs-opts');
  opts.append(
    optRow('qlen', 'QUARTER', QLENS, Math.max(0, QLENS.indexOf(Settings.qLen)), (v) => { Settings.qLen = v; saveSettings(); }, (v) => `${v} MIN`),
    optRow('diff', 'DIFFICULTY', DIFFS, Settings.diff, (v, i) => { Settings.diff = i; saveSettings(); }),
    optRow('fmt', 'FORMAT', ['5v5', '3v3'], Settings.format === '3v3' ? 1 : 0, (v) => { Settings.format = v; saveSettings(); }, (v) => v.toUpperCase()),
  );
  e.querySelector('[data-id=rand]').addEventListener('click', () => {
    P.home = Math.floor(Math.random() * N); do { P.away = Math.floor(Math.random() * N); } while (P.away === P.home);
    drawTeam('home', 1); drawTeam('away', -1); drawCtrl();
  });
  const start = () => {
    const home = TEAMS()[P.home], away = TEAMS()[P.away];
    fav.set((P.user === 'home' ? home : away).id);
    go('intro', { opts: {
      home: { team: teamObj(home), roster: quickRoster(home.id) },
      away: { team: teamObj(away), roster: quickRoster(away.id) },
      user: P.user, format: Settings.format, qLen: Settings.qLen, diff: Settings.diff,
      uniforms: { home: P.uni.home, away: P.uni.away }, mode: 'quick',
    } });
  };
  e.querySelector('[data-id=go]').addEventListener('click', start);
  drawTeam('away'); drawTeam('home'); drawCtrl();
  const t0 = TEAMS()[P[P.user]];
  return {
    el: e, title: 'PLAY NOW', bg: bgFor(t0, depthChart(t0.id).start.slice().sort((a, b) => b.ovr - a.ovr)[0]),
    hints: [['ok', 'SELECT'], ['lr', 'CHANGE'], ['tab', 'TEAMS'], ['alt', 'RANDOM'], ['back', 'BACK']],
    key(k) {
      if (k === 'prev') { cycle(P.user, -1); return true; }
      if (k === 'next') { cycle(P.user, 1); return true; }
      if (k === 'alt') { e.querySelector('[data-id=rand]').click(); return true; }
      return false;
    },
  };
});
