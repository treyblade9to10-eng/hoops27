// Title / PRESS START and the main menu tile row.
import { app, register, go, replace } from './core.js';
import { Audio } from '../audio.js';
import { el, esc, hs, icon, logo, wordmark, PLAYERS, TEAMS, teamById, teamColor, starOf, lastName, firstName, bgFor } from './common.js';
import * as MT from '../myteam.js';
import { renderCard } from './cards.js';

export const fav = {
  get() { try { return localStorage.getItem('h27_fav') || null; } catch { return null; } },
  set(id) { try { localStorage.setItem('h27_fav', id); } catch {} },
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const stars = () => PLAYERS().filter(p => p.ovr >= 86 && !p.inj);

register('title', (params) => {
  // neon title: three real stars in front of a glowing neon half-court, red-to-blue haze, live loading %
  if (!params.ps) { const pool = stars().sort(() => Math.random() - 0.5); const ps = []; for (const p of pool) { if (!ps.some(q => q.t === p.t)) ps.push(p); if (ps.length === 3) break; } params.ps = ps; }
  const ps = params.ps, lead = ps[1] || ps[0], t = teamById(lead.t);
  const e = el(`<section class="title-scr neon">
    <div class="nz-haze"></div>
    <svg class="nz-27" viewBox="0 0 600 300" aria-hidden="true"><defs>
      <linearGradient id="nzg" x1="0" x2="1"><stop offset="0" stop-color="#ff2a3d"/><stop offset=".55" stop-color="#ff3b5c"/><stop offset="1" stop-color="#3fb4ff"/></linearGradient>
      <filter id="nzf" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g filter="url(#nzf)" fill="none" stroke="url(#nzg)" stroke-width="4" stroke-linecap="round">
        <path d="M20 290 L20 60 Q300 -40 580 60 L580 290"/>
        <rect x="225" y="120" width="150" height="170"/>
        <path d="M225 120 A75 75 0 0 1 375 120"/>
        <path d="M262 52 h76 M300 52 v18"/><ellipse cx="300" cy="78" rx="20" ry="6"/>
      </g></svg>
    <div class="nz-row">${ps.map((p, i) => `<div class="nz-p nz-p${i}" style="--tc:${teamColor(teamById(p.t))}">${hs(p, 'xl')}</div>`).join('')}</div>
    <div class="nz-streak"></div>
    <div class="nz-top">${wordmark('xl')}</div>
    <div class="nz-bot">
      <button class="press f dflt" data-id="start">PRESS START</button>
      <div class="nz-load"><i></i><span>LOADING 0%</span></div>
    </div>
    <div class="ts-feat"><span>${ps.map(p => esc(lastName(p.n))).join(' &middot; ')}</span><em>REAL ROSTERS &middot; 2026-27 SEASON</em></div>
  </section>`);
  const lb = e.querySelector('.nz-load'), li = lb.querySelector('i'), ls = lb.querySelector('span');
  const tick = () => { if (!e.isConnected && done) return; const p = app.loadP ?? 0; li.style.width = Math.round(p * 100) + '%'; ls.textContent = p >= 1 ? 'READY' : 'LOADING ' + Math.round(p * 100) + '%'; lb.classList.toggle('done', p >= 1); if (!done) requestAnimationFrame(tick); };
  let done = false;
  requestAnimationFrame(tick);
  const startNow = () => { if (done) return; done = true; Audio.init(); Audio.play('ui_ok'); replace('main'); };
  e.addEventListener('click', startNow);
  return { el: e, chrome: false, coins: false, hints: [], key: (k) => { if (k === 'ok' || k === 'alt' || k === 'x') { startNow(); return true; } return true; } };
});

const TILES = [
  { id: 'play', name: 'PLAY NOW', sub: 'Any two NBA teams', desc: 'Pick any two teams, choose your side, set the quarter length and difficulty, and tip off.', big: 1 },
  { id: 'myteam', name: 'MyTEAM', sub: 'Open packs, build a squad', desc: 'Collect player cards, open packs with MT earned on the court, set your lineup and take on all 30 teams.', big: 1 },
  { id: 'options', name: 'OPTIONS', sub: 'Camera, audio, difficulty', desc: 'Camera angle, shot meter, sound and crowd volume, default quarter length, difficulty and graphics.', big: 1 },
  { id: 'controls', name: 'CONTROLS', sub: 'Keys, pad, touch', desc: 'Every move on keyboard, controller and touch screen.' },
  { id: 'rosters', name: 'ROSTERS', sub: 'All 30 teams', desc: 'Browse every team, overall ratings, archetypes and player attributes.' },
];

register('main', (params) => {
  const favId = fav.get();
  const ft = favId ? teamById(favId) : null;
  const featured = params.featured || (params.featured = ft ? starOf(ft.id) : pick(stars()));
  const fteam = teamById(featured.t);
  // art for tiles
  const playA = params.playA || (params.playA = ft ? starOf(ft.id) : pick(stars()));
  const playB = params.playB || (params.playB = pick(stars().filter(p => p.t !== playA.t)));
  const rosterP = params.rosterP || (params.rosterP = pick(PLAYERS().filter(p => p.ovr >= 80)));
  const s = MT.load();
  let mtCard;
  if (s && s.cards.length) mtCard = [...s.cards].sort((a, b) => b.ovr - a.ovr)[0];
  else { const p = pick(stars()); mtCard = { uid: 'x', pid: p.id, ovr: p.ovr, tier: MT.tierOf(p.ovr).k }; }
  const art = {
    play: `<div class="art-two"><span style="--tc:${teamColor(teamById(playB.t))}">${hs(playB)}</span><span style="--tc:${teamColor(teamById(playA.t))}">${hs(playA)}</span></div>`,
    myteam: `<div class="art-card">${renderCard(mtCard, 'md')}</div>`,
    options: `<div class="art-icon">${icon('gear')}</div>`,
    controls: `<div class="art-icon sm">${icon('pad')}</div>`,
    rosters: `<div class="art-ros" style="--tc:${teamColor(teamById(rosterP.t))}">${hs(rosterP)}</div>`,
  };
  const tile = (T) => `<button class="tile f ${T.big ? 'big' : 'small'}" data-id="${T.id}" data-desc="${esc(T.desc)}"><span class="tile-in">
      <span class="tile-art">${art[T.id]}</span>
      <span class="tile-txt"><b>${T.name === 'MyTEAM' ? 'My<i>TEAM</i>' : T.name}</b><small>${esc(T.sub)}</small></span>
    </span></button>`;
  const e = el(`<section class="main-scr">
    <div class="feat">${logo(fteam, 'md')}<div><small>FEATURED &middot; ${esc(fteam.full)}</small><b>${esc(featured.n)}</b></div><em>${featured.ovr}<i>OVR</i></em></div>
    <div class="tiles">
      ${TILES.filter(t => t.big).map(tile).join('')}
      <div class="tiles-col">${TILES.filter(t => !t.big).map(tile).join('')}</div>
    </div>
    <div class="infobar"><span class="ib-desc"></span></div>
  </section>`);
  const desc = e.querySelector('.ib-desc');
  e.addEventListener('focusin', ev => { const t = ev.target.closest('.tile'); if (t) desc.textContent = t.dataset.desc; });
  e.querySelectorAll('.tile').forEach(t => t.addEventListener('click', () => {
    const id = t.dataset.id;
    if (id === 'play') go('play'); else if (id === 'myteam') go('mt'); else go(id);
  }));
  desc.textContent = TILES[0].desc;
  return {
    el: e, title: 'MAIN MENU', bg: bgFor(fteam, featured),
    hints: [['ok', 'SELECT'], ['lr', 'BROWSE']],
    back: () => {},
  };
});
