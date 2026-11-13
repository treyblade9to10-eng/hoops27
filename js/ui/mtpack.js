// MyTEAM pack store and the pack opening.
import { app, register, go, replace, back, confirm, toast, bumpCoins, setHints } from './core.js';
import { Audio } from '../audio.js';
import { el, esc, icon, fmt } from './common.js';
import { renderCard, cardBack } from './cards.js';
import * as MT from '../myteam.js';

export const packArt = (P, cls = '') => `<div class="pack ${cls} t-${P.tier}"><div class="pk-foil"></div><div class="pk-in"><span class="pk-mark">HOOPS<i>27</i></span><b>${P.name}</b><small>${P.n} CARDS</small></div><div class="pk-rip"></div></div>`;

register('store', () => {
  const s = MT.load(); if (!s) { setTimeout(back); return { el: el('<div></div>') }; }
  const e = el(`<section class="store-scr">
    <div class="packs">${MT.PACKS.map(P => `<button class="pk-tile f" data-id="${P.id}" ${s.mt < P.price ? 'data-poor="1"' : ''}>
      ${packArt(P)}
      <span class="pk-price">${icon('coin')}<b>${fmt(P.price)}</b></span>
      <span class="pk-sub">${P.guar ? `1 ${MT.TIERS[MT.tierIdx(P.guar)].n}+ GUARANTEED` : 'ALL TIERS'}</span>
    </button>`).join('')}</div>
    <div class="odds"><h4>PACK ODDS</h4><div class="odds-t"></div><p class="odds-n"></p></div>
  </section>`);
  const oddsT = e.querySelector('.odds-t'), oddsN = e.querySelector('.odds-n');
  const showOdds = (P) => {
    oddsT.innerHTML = MT.TIERS.map(T => { const v = P.odds[T.k]; return v ? `<div class="od"><i class="t-${T.k}"></i><span>${T.n}</span><b>${v < 1 ? v.toFixed(2).replace(/0$/, '') : v}%</b></div>` : ''; }).join('');
    oddsN.innerHTML = `Odds per card. ${P.guar ? `One card is always ${MT.TIERS[MT.tierIdx(P.guar)].n} or better. ` : ''}${P.boost ? 'Can contain BOOSTED cards (+2 to +4 OVR).' : ''}`;
  };
  showOdds(MT.PACKS[0]);
  e.addEventListener('focusin', ev => { const t = ev.target.closest('.pk-tile'); if (t) showOdds(MT.PACKS.find(p => p.id === t.dataset.id)); });
  e.querySelectorAll('.pk-tile').forEach(b => b.addEventListener('click', async () => {
    const P = MT.PACKS.find(p => p.id === b.dataset.id), s2 = MT.load();
    if (s2.mt < P.price) { toast(`You need ${fmt(P.price - s2.mt)} more MT. Win games to earn MT.`); Audio.play('ui_back'); return; }
    if (!(await confirm(`BUY ${P.name} PACK?`, `${icon('coin')} <b>${fmt(P.price)} MT</b> &nbsp;for ${P.n} cards. You have ${fmt(s2.mt)} MT.`, 'BUY', 'CANCEL'))) return;
    const r = MT.buyPack(s2, P.id);
    if (r.err) { toast(r.err); return; }
    bumpCoins();
    go('pack', { cards: r.cards.map(c => c.uid), name: P.name, tier: P.tier });
  }));
  return { el: e, title: 'MyTEAM  /  PACKS', bg: { c1: '#3a3f48', c2: '#111', p: null }, hints: [['ok', 'BUY'], ['lr', 'BROWSE'], ['back', 'BACK']] };
});

// ---------- pack opening ----------
register('pack', (P) => {
  let s = MT.load();
  const cards = P.cards.map(u => MT.cardOf(s, u)).filter(Boolean);
  const best = cards.reduce((b, c) => (c.ovr > b.ovr ? c : b), cards[0]);
  const many = cards.length > 5;
  P.shown = P.shown || [];
  P.sold = P.sold || {};
  const packDef = MT.PACKS.find(x => x.name === P.name) || { name: P.name, n: cards.length, tier: 'gold' };
  const e = el(`<section class="pack-scr ${many ? 'many' : ''}">
    <div class="pk-stage">${packArt(packDef, 'xl')}<button class="btn go f dflt" data-id="open">OPEN PACK</button></div>
    <div class="pk-row" hidden>${cards.map((c, i) => `<div class="slot" data-i="${i}">
        <button class="flip f" data-id="card-${i}" aria-label="card ${i + 1}"><div class="flip-in">${cardBack(many ? 'pk2' : 'pk')}${renderCard(c, many ? 'pk2' : 'pk', 'face')}</div></button>
        ${P.starter ? '' : `<button class="sell f" data-id="sell-${i}" hidden>QUICK SELL <b>+${fmt(MT.TIERS[MT.tierIdx(c.tier)].sell)}</b></button>`}
      </div>`).join('')}</div>
    <div class="pk-actions" hidden><button class="btn f" data-id="all">REVEAL ALL</button><button class="btn go f" data-id="done" hidden>${P.starter ? 'SET LINEUP' : 'DONE'}</button></div>
    <div class="reveal" hidden></div>
  </section>`);
  const stageEl = e.querySelector('.pk-stage'), row = e.querySelector('.pk-row'), acts = e.querySelector('.pk-actions'), rv = e.querySelector('.reveal');
  const slots = [...row.children];
  let opened = !!P.opened, busy = false;

  function showRow() {
    stageEl.hidden = true; row.hidden = false; acts.hidden = false;
    slots.forEach((sl, i) => { sl.style.setProperty('--d', `${i * 70}ms`); if (P.shown.includes(i)) sl.classList.add('up'); if (P.sold[i]) markSold(i); });
    row.classList.add('deal');
    afterFlip(true);
  }
  function open() {
    if (opened || busy) return; busy = true;
    stageEl.classList.add('ripping'); Audio.play('pack', 1);
    setTimeout(() => { opened = P.opened = true; busy = false; showRow(); setHints([['ok', 'FLIP'], ['alt', 'REVEAL ALL']]); const f = row.querySelector('.flip'); f && f.focus({ preventScroll: true }); }, 900);
  }
  function flip(i, quiet) {
    if (P.shown.includes(i) || busy) return Promise.resolve();
    if (cards[i] === best && !quiet) return bigReveal(i);
    P.shown.push(i); slots[i].classList.add('up');
    const T = MT.tierIdx(cards[i].tier);
    Audio.play(T >= 5 ? 'big' : 'reveal', T >= 5 ? 0.7 : 0.55);
    afterFlip();
    return Promise.resolve();
  }
  // the best card: dim, tier light rays, shake for Diamond+, headshot slides in, OVR ticks up
  function bigReveal(i) {
    busy = true;
    document.getElementById('menu').appendChild(rv); // above the top bar
    const c = cards[i], T = MT.tierIdx(c.tier);
    rv.hidden = false;
    rv.className = `reveal t-${c.tier} ${T >= 7 ? 'shake' : ''}`;
    rv.innerHTML = `<div class="rv-rays"></div><div class="rv-streak"></div><div class="rv-card">${renderCard(c, 'xl', 'rv')}</div><div class="rv-tier">${MT.TIERS[T].n}${c.b ? ' &middot; BOOSTED' : ''}</div><div class="rv-tap">TAP TO CONTINUE</div>`;
    Audio.play(T >= 4 ? 'big' : 'reveal', 1);
    if (T >= 5) setTimeout(() => Audio.play('cheer', 0.35), 700);
    const ovrEl = rv.querySelector('.cd-ovr'); let v = Math.max(40, c.ovr - 18);
    ovrEl.textContent = v;
    const tick = setInterval(() => { v++; ovrEl.textContent = v; if (v >= c.ovr) { clearInterval(tick); rv.classList.add('done'); } }, 900 / (c.ovr - v + 1));
    setTimeout(() => { rv.classList.add('ready'); }, 1100);
    return new Promise(res => {
      const close = () => {
        if (!rv.classList.contains('ready')) return;
        clearInterval(tick); rv.hidden = true; rv.innerHTML = ''; rv.onclick = null; app.revealClose = null; busy = false;
        P.shown.push(i); slots[i].classList.add('up'); afterFlip(); res();
      };
      rv.onclick = close; app.revealClose = close;
    });
  }
  function afterFlip(init) {
    const all = P.shown.length >= cards.length;
    e.querySelector('[data-id=all]').hidden = all;
    e.querySelector('[data-id=done]').hidden = !all;
    if (all) {
      slots.forEach((sl, i) => { const b = sl.querySelector('.sell'); if (b && !P.sold[i]) b.hidden = false; });
      if (!init) { const d = e.querySelector('[data-id=done]'); d.focus({ preventScroll: true }); }
      setHints(P.starter ? [['ok', 'SELECT']] : [['ok', 'SELECT'], ['back', 'DONE']]);
    }
  }
  async function revealAll() {
    if (busy) return;
    const order = cards.map((c, i) => i).filter(i => !P.shown.includes(i) && cards[i] !== best);
    for (const i of order) { flip(i, true); await new Promise(r => setTimeout(r, 160)); }
    const bi = cards.indexOf(best);
    if (!P.shown.includes(bi)) { await new Promise(r => setTimeout(r, 300)); await bigReveal(bi); }
  }
  function markSold(i) { slots[i].classList.add('sold'); const b = slots[i].querySelector('.sell'); if (b) { b.hidden = false; b.disabled = true; b.innerHTML = `SOLD <b>+${fmt(P.sold[i])}</b>`; } }
  async function sell(i) {
    if (MT.tierIdx(cards[i].tier) >= 5 && !(await confirm('QUICK SELL?', `Sell this ${MT.TIERS[MT.tierIdx(cards[i].tier)].n} card for ${fmt(MT.TIERS[MT.tierIdx(cards[i].tier)].sell)} MT? You can't get it back.`, 'SELL', 'KEEP'))) return;
    s = MT.load(); const v = MT.quickSell(s, cards[i].uid);
    if (!v) { toast('That card is in your lineup.'); return; }
    P.sold[i] = v; markSold(i); bumpCoins(); Audio.play('ui_ok');
    const nx = slots.find((sl, j) => !P.sold[j] && sl.querySelector('.sell')); (nx ? nx.querySelector('.sell') : e.querySelector('[data-id=done]')).focus({ preventScroll: true });
  }
  function done() { if (P.shown.length < cards.length) return revealAll(); if (P.starter) { replace('lineup', {}); } else back(); }

  e.querySelector('[data-id=open]').addEventListener('click', open);
  stageEl.querySelector('.pack').addEventListener('click', open);
  e.querySelector('[data-id=all]').addEventListener('click', revealAll);
  e.querySelector('[data-id=done]').addEventListener('click', done);
  slots.forEach((sl, i) => {
    sl.querySelector('.flip').addEventListener('click', () => flip(i));
    const b = sl.querySelector('.sell'); if (b) b.addEventListener('click', () => sell(i));
  });
  if (opened) showRow();
  return {
    el: e, title: `MyTEAM  /  ${P.name} PACK`, bg: { c1: '#2a2e35', c2: '#111', p: null },
    hints: opened ? [['ok', 'FLIP'], ['alt', 'REVEAL ALL']] : [['ok', 'OPEN PACK']],
    key(k) {
      if (app.revealClose) { if (k === 'ok' || k === 'back') app.revealClose(); return true; }
      if (k === 'alt') { if (opened) revealAll(); else open(); return true; }
      if (k === 'back') { if (!opened) { if (!P.starter) back(); } else if (P.shown.length >= cards.length) done(); return true; }
      return busy;
    },
    leave() { app.revealClose = null; rv.remove(); },
  };
});
