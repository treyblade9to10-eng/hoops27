// Matchup intro (before the game) and the final score / box score screen (after it).
import { app, register, replace, back, home, popTo, bumpCoins } from './core.js';
import { Audio } from '../audio.js';
import { DIFFS } from '../settings.js';
import { el, esc, hs, logo, icon, fmt, teamColor, lastName, PLAYERS } from './common.js';
import * as MT from '../myteam.js';

const pmap = () => new Map(PLAYERS().map(p => [p.id, p]));
const tOvr = (side) => { const r = side.roster.slice(0, 5); return Math.round(r.reduce((a, p) => a + p.ovr, 0) / Math.max(1, r.length)); };

register('intro', (P) => {
  const o = P.opts, A = o.away.team, H = o.home.team;
  const side = (s, t, cls) => `<div class="in-side ${cls}" style="--tc:${teamColor(t)};--tc2:${t.c2}">
      <div class="in-logo">${logo(t, 'xl')}</div>
      <div class="in-name"><small>${esc(t.city || (t.id === 'MYT' ? 'MyTEAM' : ''))}</small><b>${esc(t.name)}</b></div>
      <div class="in-five">${s.roster.slice(0, o.format === '3v3' ? 3 : 5).map(p => `<span>${hs(p, 'sm')}<b>${esc(lastName(p.n))}</b></span>`).join('')}</div>
      <div class="in-tag">${o.user === cls ? 'YOU' : 'CPU'} &middot; ${cls.toUpperCase()}</div>
    </div>`;
  const e = el(`<section class="intro-scr">
    ${side(o.away, A, 'away')}${side(o.home, H, 'home')}
    <div class="in-vs"><b>VS</b></div>
    <div class="in-info">${o.format.toUpperCase()} &middot; ${o.qLen} MIN QUARTERS &middot; ${DIFFS[o.diff]}</div>
    <div class="in-go">TIP-OFF</div>
  </section>`);
  let launched = false, timer = null;
  async function launch() {
    if (launched) return; launched = true; clearTimeout(timer);
    const res = await app.launch(o);
    if (!res || res.quit) { back(); return; }
    let reward = null;
    if (o.mode === 'myteam') { const s = MT.load(); if (s) reward = MT.applyResult(s, res, o.away.team.id); }
    replace('results', { opts: o, res, reward });
  }
  return {
    el: e, chrome: false, coins: false, hints: [],
    enter() { Audio.play('reveal', 0.7); timer = setTimeout(launch, 2600); e.addEventListener('click', launch); },
    leave() { clearTimeout(timer); },
    key(k) { if (k === 'ok') launch(); if (k === 'back' && !launched) { clearTimeout(timer); back(); } return true; },
  };
});

register('results', (P) => {
  const { opts: o, res, reward } = P, A = o.away.team, H = o.home.team, sc = res.score || { home: 0, away: 0 };
  const win = res.winner || (sc.home > sc.away ? 'home' : sc.away > sc.home ? 'away' : null);
  const box = res.box || { home: [], away: [] }, PM = pmap();
  const pl = (id, side) => PM.get(id) || o[side].roster.find(p => p.id === id) || { id, n: '?' };
  const all = ['home', 'away'].flatMap(s => (box[s] || []).map(b => ({ ...b, side: s })));
  const top = all.sort((a, b) => (b.pts + b.reb * 0.8 + b.ast) - (a.pts + a.reb * 0.8 + a.ast)).slice(0, 3);
  const userWon = win === o.user;
  P.tab = P.tab || o.user;
  const e = el(`<section class="res-scr">
    <div class="res-score">
      <div class="rs-team ${win === 'away' ? 'won' : ''}" style="--tc:${teamColor(A)}">${logo(A, 'lg')}<span><small>${esc(A.city || 'MyTEAM')}</small><b>${esc(A.name)}</b></span><em>${sc.away}</em></div>
      <div class="rs-mid"><span>FINAL</span><b class="${userWon ? 'w' : 'l'}">${win ? (userWon ? 'VICTORY' : 'DEFEAT') : 'TIE'}</b></div>
      <div class="rs-team home ${win === 'home' ? 'won' : ''}" style="--tc:${teamColor(H)}"><em>${sc.home}</em><span><small>${esc(H.city || 'MyTEAM')}</small><b>${esc(H.name)}</b></span>${logo(H, 'lg')}</div>
    </div>
    <div class="res-body">
      <div class="res-top"><h4>TOP PERFORMERS</h4><div class="tops">${top.map(b => { const p = pl(b.id, b.side), t = o[b.side].team; return `<div class="topp" style="--tc:${teamColor(t)}">${hs(p)}<div><small>${esc(t.abbr || t.id)}</small><b>${esc(lastName(p.n))}</b><span><em>${b.pts}</em> PTS <em>${b.reb}</em> REB <em>${b.ast}</em> AST</span></div></div>`; }).join('') || '<p class="muted">No stats recorded.</p>'}</div>
        ${reward ? `<div class="reward"><span>MyTEAM REWARD</span><b>${icon('coin')}+${fmt(reward.mt)} MT</b><small>${reward.win ? `WIN ${fmt(MT.REWARD.win)}${reward.bonus ? ` + MARGIN BONUS ${fmt(reward.bonus)}` : ''}` : 'GAME PLAYED'}</small></div>` : ''}
      </div>
      <div class="res-box">
        <div class="tabs">${['away', 'home'].map(s => `<button class="tab f" data-tab="${s}" data-id="tab-${s}">${esc(o[s].team.abbr || o[s].team.id)} ${esc(o[s].team.name)}</button>`).join('')}</div>
        <div class="boxwrap"><table class="box"><thead><tr><th>PLAYER</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3PT</th></tr></thead><tbody></tbody></table></div>
      </div>
    </div>
    <div class="res-btns"><button class="btn go f dflt" data-id="cont">CONTINUE</button></div>
  </section>`);
  const tbody = e.querySelector('tbody');
  function tab(s) {
    P.tab = s;
    e.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === s));
    const rows = (box[s] || []).slice().sort((a, b) => (b.min || 0) - (a.min || 0));
    tbody.innerHTML = rows.map(b => `<tr><td>${esc(pl(b.id, s).n)}</td><td>${Math.round(b.min || 0)}</td><td class="hl">${b.pts}</td><td>${b.reb}</td><td>${b.ast}</td><td>${b.stl}</td><td>${b.blk}</td><td>${b.fgm}-${b.fga}</td><td>${b.tpm}-${b.tpa}</td></tr>`).join('') || '<tr><td colspan="9">No box score.</td></tr>';
  }
  e.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => tab(b.dataset.tab)));
  tab(P.tab);
  const done = () => { if (o.mode === 'myteam') popTo('mt'); else home(); };
  e.querySelector('[data-id=cont]').addEventListener('click', done);
  return {
    el: e, title: 'FINAL', coins: o.mode === 'myteam',
    hints: [['ok', 'CONTINUE'], ['tab', 'BOX SCORE']],
    enter() { Audio.play(userWon ? 'cheer' : 'buzzer', userWon ? 0.6 : 0.35); if (reward) bumpCoins(); },
    back: done,
    key(k) { if (k === 'prev' || k === 'next') { tab(P.tab === 'home' ? 'away' : 'home'); return true; } return false; },
  };
});
