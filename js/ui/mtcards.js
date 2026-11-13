// MyTEAM collection, lineup editor and Domination (play vs any NBA team).
import { register, go, back, modal, toast, bumpCoins, refresh } from './core.js';
import { Audio } from '../audio.js';
import { Settings, saveSettings, DIFFS } from '../settings.js';
import { el, esc, icon, fmt, logo, optRow, TEAMS, teamOvr, teamById, lum } from './common.js';
import { renderCard, cardRow } from './cards.js';
import { playerCard } from './rosters.js';
import { QLENS, teamObj, quickRoster } from './play.js';
import * as MT from '../myteam.js';

const SL = ['PG', 'SG', 'SF', 'PF', 'C'];
const mtBg = (s) => ({ c1: lum(s.c1) < 0.05 ? s.c2 : s.c1, c2: s.c2, p: null });
const need = () => { const s = MT.load(); if (!s) setTimeout(back); return s; };

// card detail popup: ratings + quick sell
export async function cardModal(c, s) {
  const p = MT.playerById(c.pid), t = teamById(p.t), inL = MT.inLineup(s, c.uid), v = MT.TIERS[MT.tierIdx(c.tier)].sell;
  const btns = [{ label: 'CLOSE', value: 0, cls: 'dflt' }];
  if (!inL) btns.unshift({ label: `QUICK SELL +${fmt(v)} MT`, value: 1, cls: 'danger' });
  const r = await modal(`<div class="cm">${renderCard(c, 'md')}<div class="cm-r">${playerCard(p, t, c.ovr)}${inL ? '<p class="muted">In your lineup. Swap it out before selling.</p>' : ''}</div></div>`, btns, 0);
  if (r === 1) { const s2 = MT.load(), got = MT.quickSell(s2, c.uid); if (got) { bumpCoins(); toast(`Sold for ${fmt(got)} MT`); return true; } }
  return false;
}

register('coll', (P) => {
  const s = need(); if (!s) return { el: el('<div></div>') };
  P.f = P.f || { tier: 'ALL', pos: 'ALL', team: 'ALL', sort: 0 };
  const tiers = ['ALL', ...MT.TIERS.map(t => t.k)], poss = ['ALL', 'G', 'F', 'C'], teams = ['ALL', ...TEAMS().map(t => t.id)], sorts = ['OVR HIGH-LOW', 'OVR LOW-HIGH', 'NEWEST'];
  const e = el(`<section class="coll-scr"><div class="filters"></div><div class="coll-count"></div><div class="grid"></div></section>`);
  const grid = e.querySelector('.grid'), cnt = e.querySelector('.coll-count');
  const tName = (k) => (k === 'ALL' ? 'ALL' : MT.TIERS[MT.tierIdx(k)].n);
  e.querySelector('.filters').append(
    optRow('f-tier', 'TIER', tiers, tiers.indexOf(P.f.tier), v => { P.f.tier = v; draw(); }, tName),
    optRow('f-pos', 'POS', poss, poss.indexOf(P.f.pos), v => { P.f.pos = v; draw(); }),
    optRow('f-team', 'TEAM', teams, teams.indexOf(P.f.team), v => { P.f.team = v; draw(); }),
    optRow('f-sort', 'SORT', sorts, P.f.sort, (v, i) => { P.f.sort = i; draw(); }),
  );
  function draw() {
    const s2 = MT.load();
    let list = s2.cards.map((c, i) => ({ c, i, p: MT.playerById(c.pid) }));
    if (P.f.tier !== 'ALL') list = list.filter(x => x.c.tier === P.f.tier);
    if (P.f.pos !== 'ALL') list = list.filter(x => x.p.pos === P.f.pos);
    if (P.f.team !== 'ALL') list = list.filter(x => x.p.t === P.f.team);
    list.sort(P.f.sort === 0 ? (a, b) => b.c.ovr - a.c.ovr : P.f.sort === 1 ? (a, b) => a.c.ovr - b.c.ovr : (a, b) => b.i - a.i);
    cnt.textContent = `${list.length} OF ${s2.cards.length} CARDS`;
    grid.innerHTML = list.map(x => `<button class="gcard f" data-uid="${esc(x.c.uid)}" data-id="g-${esc(x.c.uid)}">${renderCard(x.c, 'sm', MT.inLineup(s2, x.c.uid) ? 'inl' : '')}</button>`).join('') || '<p class="muted">No cards match these filters.</p>';
  }
  grid.addEventListener('click', async ev => {
    const b = ev.target.closest('.gcard'); if (!b) return;
    const s2 = MT.load(), c = MT.cardOf(s2, b.dataset.uid); if (!c) return;
    if (await cardModal(c, s2)) draw();
  });
  draw();
  return { el: e, title: 'MyTEAM  /  COLLECTION', bg: mtBg(s), hints: [['ok', 'VIEW'], ['lr', 'FILTER'], ['back', 'BACK']] };
});

register('lineup', (P) => {
  const s0 = need(); if (!s0) return { el: el('<div></div>') };
  P.slot = P.slot ?? 0;
  const e = el(`<section class="lu-scr">
    <div class="lu-left">
      <div class="lu-head"><b>LINEUP</b><span class="lu-ovr"></span><button class="btn sm f" data-id="auto">AUTO</button></div>
      <div class="lu-start"></div>
      <div class="lu-benchl">BENCH</div>
      <div class="lu-bench"></div>
    </div>
    <div class="lu-pick"><div class="lu-ph"></div><div class="lu-list"></div></div>
  </section>`);
  const st = e.querySelector('.lu-start'), bn = e.querySelector('.lu-bench'), list = e.querySelector('.lu-list'), ph = e.querySelector('.lu-ph'), ov = e.querySelector('.lu-ovr');
  function draw(focus) {
    const s = MT.load(), L = MT.lineupCards(s);
    const slot = (c, i) => `<button class="lslot f ${i === P.slot ? 'on' : ''}" data-i="${i}" data-id="slot-${i}"><span class="ls-pos">${i < 5 ? SL[i] : 'B' + (i - 4)}</span>${c ? renderCard(c, i < 5 ? 'sm' : 'xs') : `<div class="card ${i < 5 ? 'sm' : 'xs'} empty"><div class="cd">${icon('cards')}</div></div>`}</button>`;
    st.innerHTML = L.slice(0, 5).map((c, i) => slot(c, i)).join('');
    bn.innerHTML = L.slice(5).map((c, i) => slot(c, i + 5)).join('');
    ov.innerHTML = `TEAM OVR <b>${MT.teamOvr(s)}</b>`;
    const want = P.slot < 5 ? ({ 0: 'G', 1: 'G', 2: 'F', 3: 'F', 4: 'C' })[P.slot] : null;
    const cur = L[P.slot];
    const cards = [...s.cards].sort((a, b) => {
      const pa = MT.playerById(a.pid).pos === want ? 1 : 0, pb = MT.playerById(b.pid).pos === want ? 1 : 0;
      return (pb - pa) || (b.ovr - a.ovr);
    });
    ph.innerHTML = `<b>${P.slot < 5 ? SL[P.slot] : 'BENCH ' + (P.slot - 4)}</b><span>${cur ? 'Swap ' + esc(MT.playerById(cur.pid).n) : 'Pick a card'}</span>`;
    list.innerHTML = cards.map(c => { const j = s.lineup.indexOf(c.uid); return cardRow(c, j === P.slot ? 'cur' : j >= 0 ? 'used' : '', 'pk-' + c.uid).replace('</button>', j >= 0 ? `<span class="crow-in">${j < 5 ? SL[j] : 'BENCH'}</span></button>` : '</button>'); }).join('');
    if (focus) { const f = e.querySelector(`[data-id="${focus}"]`); f && f.focus({ preventScroll: true }); }
  }
  e.addEventListener('click', ev => {
    const sl = ev.target.closest('.lslot');
    if (sl) { P.slot = +sl.dataset.i; draw(); const f = list.querySelector('.crow'); (ev.detail === 0 && f ? f : sl).focus({ preventScroll: true }); return; }
    const r = ev.target.closest('.crow');
    if (r) {
      const s = MT.load(); MT.setSlot(s, P.slot, r.dataset.uid); Audio.play('reveal', 0.4);
      const was = P.slot; draw('slot-' + was);
      e.querySelector(`[data-id="slot-${was}"]`)?.classList.add('placed');
    }
  });
  e.querySelector('[data-id=auto]').addEventListener('click', () => { const s = MT.load(); MT.autoLineup(s); draw('auto'); toast('Best lineup set.'); });
  draw();
  e.querySelector(`[data-i="${P.slot}"]`)?.classList.add('dflt');
  return {
    el: e, title: 'MyTEAM  /  LINEUP', bg: mtBg(s0), hints: [['ok', 'SELECT'], ['back', 'BACK']],
    back() { const s = MT.load(); if (!MT.lineupReady(s)) { toast('Fill all five starter spots first.'); return; } back(); },
  };
});

register('dom', (P) => {
  const s = need(); if (!s) return { el: el('<div></div>') };
  const teams = TEAMS().map(t => ({ t, o: teamOvr(t.id) })).sort((a, b) => a.o - b.o), beat = s.beat || [];
  const e = el(`<section class="dom-scr">
    <div class="dom-top"><div class="dom-me" style="--m1:${s.c1}"><small>YOUR TEAM</small><b>${esc(s.name)}</b><em>${MT.teamOvr(s)} OVR &middot; ${beat.length}/30 BEATEN</em></div>
      <div class="dom-opts"></div>
      <div class="dom-rw">${icon('coin')}<span>WIN <b>${fmt(MT.REWARD.win)}</b> + ${MT.REWARD.perPoint}/PT MARGIN<br>LOSS <b>${fmt(MT.REWARD.loss)}</b></span></div></div>
    <div class="dom-grid">${teams.map(({ t, o }) => `<button class="dteam f${beat.includes(t.id) ? ' beat' : ''}" data-id="d-${t.id}" data-t="${t.id}" style="--tc:${lum(t.c1) < 0.05 ? t.c2 : t.c1}">${logo(t, 'md')}<b>${t.id}</b><em>${o}</em>${beat.includes(t.id) ? `<i class="dbeat">${icon('check')}</i>` : ''}</button>`).join('')}</div>
  </section>`);
  e.querySelector('.dom-opts').append(
    optRow('qlen', 'QUARTER', QLENS, Math.max(0, QLENS.indexOf(Settings.qLen)), v => { Settings.qLen = v; saveSettings(); }, v => `${v} MIN`),
    optRow('diff', 'DIFFICULTY', DIFFS, Settings.diff, (v, i) => { Settings.diff = i; saveSettings(); }),
  );
  e.querySelector('.dom-grid').addEventListener('click', ev => {
    const b = ev.target.closest('.dteam'); if (!b) return;
    const s2 = MT.load();
    if (!MT.lineupReady(s2)) { toast('Set five starters in LINEUP first.'); return; }
    const t = teamById(b.dataset.t);
    go('intro', { opts: {
      home: { team: MT.teamObj(s2), roster: MT.roster(s2) },
      away: { team: teamObj(t), roster: quickRoster(t.id) },
      user: 'home', format: Settings.format, qLen: Settings.qLen, diff: Settings.diff,
      uniforms: { home: 'home', away: 'away' }, mode: 'myteam',
    } });
  });
  return { el: e, title: 'MyTEAM  /  DOMINATION', bg: mtBg(s), hints: [['ok', 'PLAY'], ['back', 'BACK']] };
});
