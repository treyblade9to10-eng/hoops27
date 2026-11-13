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
  const p = params.p || (params.p = pick(stars())), t = teamById(p.t);
  const e = el(`<section class="title-scr" style="--tc:${teamColor(t)};--tc2:${t.c2}">
    <div class="ts-court"></div>
    <div class="ts-slash"></div>
    <div class="ts-player">${hs(p, 'xl')}</div>
    <div class="ts-mid">
      ${wordmark('xl')}
      <div class="ts-sub">REAL ROSTERS &middot; 2026-27 SEASON</div>
      <button class="press f dflt" data-id="start">PRESS START</button>
    </div>
    <div class="ts-feat"><span>${esc(firstName(p.n))}</span><b>${esc(lastName(p.n))}</b><em>${esc(t.full)}</em></div>
  </section>`);
  let done = false;
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
