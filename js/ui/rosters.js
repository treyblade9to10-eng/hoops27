// ROSTERS: any team's roster + a player card with key ratings.
import { register, setBg } from './core.js';
import { Audio } from '../audio.js';
import { el, esc, hs, logo, icon, bar, TEAMS, teamOvr, teamPlayersAll, rate, teamColor, firstName, lastName, bgFor } from './common.js';

export function playerCard(p, t, ovr = p.ovr) {
  const r = rate(p);
  const bars = [['3PT', r.three], ['MID', r.mid], ['CLOSE', r.close], ['DUNK', r.dunk], ['PASS', r.pass], ['HANDLE', r.handle], ['SPEED', r.speed], ['DEFENSE', r.def], ['REBOUND', r.reb]];
  return `<div class="pcard" style="--tc:${teamColor(t)};--tc2:${t.c2}">
    <div class="pcard-top">
      <div class="pcard-hs">${hs(p)}</div>
      <div class="pcard-id">
        <span class="pcard-num">#${esc(p.num || '-')} &middot; ${esc(t.full)}</span>
        <small>${esc(firstName(p.n))}</small><b>${esc(lastName(p.n))}</b>
        <span class="pcard-meta"><i>${p.pos}</i><i>${esc(p.ht || '')}</i><i>AGE ${p.age || '-'}</i></span>
        <span class="pcard-arch">${esc(r.arch)}</span>
      </div>
      <div class="pcard-ovr"><span>OVR</span><b>${ovr}</b>${p.pot && ovr === p.ovr ? `<small>POT ${p.pot}</small>` : ovr !== p.ovr ? '<small>BOOSTED</small>' : ''}</div>
    </div>
    <div class="pcard-bars">${bars.map(([k, v]) => bar(k, v)).join('')}</div>
  </div>`;
}

register('rosters', (P) => {
  const N = TEAMS().length;
  if (P.team == null) P.team = 0;
  const e = el(`<section class="ros-scr">
    <div class="ros-left">
      <div class="ros-team f" tabindex="0" data-id="ros-team">
        <button class="arw" tabindex="-1" data-d="-1">${icon('chevL')}</button>
        <span class="ros-t"></span>
        <button class="arw" tabindex="-1" data-d="1">${icon('chevR')}</button>
      </div>
      <div class="ros-head"><span>PLAYER</span><span>POS</span><span>HT</span><span>ARCHETYPE</span><span>OVR</span></div>
      <div class="ros-list"></div>
    </div>
    <div class="ros-right"></div>
  </section>`);
  const list = e.querySelector('.ros-list'), right = e.querySelector('.ros-right'), head = e.querySelector('.ros-team');
  let players = [];
  function draw(focusList) {
    const t = TEAMS()[P.team];
    players = teamPlayersAll(t.id);
    head.style.setProperty('--tc', teamColor(t));
    head.querySelector('.ros-t').innerHTML = `${logo(t, 'md')}<span><small>${esc(t.city)}</small><b>${esc(t.name)}</b></span><em>${teamOvr(t.id)}<i>OVR</i></em>`;
    list.innerHTML = players.map((p, i) => `<button class="prow f" data-i="${i}" data-id="pr-${p.id}">${hs(p, 'sm')}<b>${esc(p.n)}${p.inj ? '<i class="inj">INJ</i>' : ''}</b><span>${p.pos}</span><span>${esc(p.ht || '')}</span><span class="arch">${esc(rate(p).arch)}</span><em>${p.ovr}</em></button>`).join('');
    list.scrollTop = 0;
    P.sel = Math.min(P.sel || 0, players.length - 1);
    showCard(P.sel);
    setBg(bgFor(t, players[0]));
    if (focusList) { const b = list.querySelector('.prow'); b && b.focus({ preventScroll: true }); }
  }
  function showCard(i) {
    const p = players[i]; if (!p) return; P.sel = i;
    right.innerHTML = playerCard(p, TEAMS()[P.team]);
    list.querySelectorAll('.prow').forEach((b, j) => b.classList.toggle('on', j === i));
  }
  function cycle(d, keepFocus) { P.team = (P.team + d + N) % N; P.sel = 0; Audio.play('ui', 0.8); draw(false); if (keepFocus) head.focus({ preventScroll: true }); }
  head._lr = (d) => { cycle(d, true); return true; };
  head.addEventListener('click', ev => { const a = ev.target.closest('.arw'); cycle(a ? +a.dataset.d : 1, true); });
  list.addEventListener('focusin', ev => { const b = ev.target.closest('.prow'); if (b) showCard(+b.dataset.i); });
  list.addEventListener('click', ev => { const b = ev.target.closest('.prow'); if (b) showCard(+b.dataset.i); });
  draw(false);
  return {
    el: e, title: 'ROSTERS', coins: false,
    hints: [['ud', 'PLAYERS'], ['tab', 'CHANGE TEAM'], ['back', 'BACK']],
    key(k) { if (k === 'prev' || k === 'next') { cycle(k === 'prev' ? -1 : 1, document.activeElement === head); return true; } return false; },
  };
});
