// MyTEAM hub, the first-time welcome, and the team name / colors editor.
import { register, go, replace, modal, setCoins, bumpCoins, back } from './core.js';
import { Audio } from '../audio.js';
import { el, esc, icon, fmt, hs, lum, logo, TEAMS } from './common.js';
import { renderCard } from './cards.js';
import { packArt } from './mtpack.js';
import * as MT from '../myteam.js';

export const COLORS = ['#e0263a', '#f2c230', '#1d6fe0', '#0f8a4a', '#6d2fd1', '#f26b1d', '#14b5c9', '#d4148a', '#7a1020', '#0b1e44', '#2b2f36', '#f2f2f0', '#c9a45c', '#79bc43', '#9aa3ad', '#111214'];
const mtBg = (s) => ({ c1: lum(s.c1) < 0.05 ? s.c2 : s.c1, c2: s.c2, p: null });

function editorHTML(s) {
  const sw = (k, cur) => `<div class="sw-row" data-k="${k}">${COLORS.map(c => `<button class="sw f${c === cur ? ' on' : ''}" data-c="${c}" data-id="${k}-${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>`;
  return `<div class="ed">
    <label class="ed-l">TEAM NAME</label>
    <input class="ed-name f" data-id="name" maxlength="18" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(s.name)}">
    <label class="ed-l">PRIMARY COLOR</label>${sw('c1', s.c1)}
    <label class="ed-l">SECONDARY COLOR</label>${sw('c2', s.c2)}
  </div>`;
}
function bindEditor(root, s, onChange) {
  const inp = root.querySelector('.ed-name');
  inp.addEventListener('input', () => { s.name = inp.value.toUpperCase().replace(/[^A-Z0-9 .'-]/g, '').slice(0, 18); onChange(); });
  inp.addEventListener('click', e => e.stopPropagation());
  root.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () => {
    const k = b.parentNode.dataset.k; s[k] = b.dataset.c;
    b.parentNode.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); onChange();
  }));
}
const banner = (s) => `<div class="mt-banner" style="--m1:${s.c1};--m2:${s.c2};--mt:${lum(s.c1) > 0.45 ? '#0d0e10' : '#fff'}"><span class="mb-mark">${esc((s.name || 'MY TEAM').split(' ').map(w => w[0]).join('').slice(0, 3))}</span><b>${esc(s.name || 'MY TEAM')}</b></div>`;

register('mt', (P) => {
  const s = MT.load();
  if (!s) { // first time: name + colors, then the free starter pack
    const d = P.draft || (P.draft = { name: 'HOOPS UNITED', c1: '#e0263a', c2: '#f2f2f0' });
    const e = el(`<section class="mtw-scr">
      <div class="mtw-l"><h2>WELCOME TO My<i>TEAM</i></h2>
        <p>Collect player cards, build a lineup and take on all 30 NBA teams. MT coins are earned on the court: every win pays out, and there is a daily bonus.</p>
        <div class="mtw-gift">${icon('coin')}<span><b>${fmt(MT.REWARD.start)} MT</b> to start, plus a free <b>10-card starter pack</b>.</span></div>
        <div class="mtw-prev"></div>
      </div>
      <div class="mtw-r">${editorHTML(d)}<button class="btn go f dflt" data-id="create">OPEN STARTER PACK</button></div>
    </section>`);
    const prev = e.querySelector('.mtw-prev');
    const upd = () => { prev.innerHTML = banner(d); };
    bindEditor(e, d, upd); upd();
    e.querySelector('[data-id=create]').addEventListener('click', () => {
      const ns = MT.newSave(d.name.trim() || 'HOOPS UNITED', d.c1, d.c2);
      const cards = MT.starterPack(ns);
      replace('mt', {}); go('pack', { cards: cards.map(c => c.uid), starter: true, name: 'STARTER' });
    });
    return { el: e, title: 'MyTEAM', bg: mtBg(d), hints: [['ok', 'SELECT'], ['back', 'BACK']] };
  }

  const L = MT.lineupCards(s), ovr = MT.teamOvr(s);
  const beat = s.beat || [];
  const domArt = `<span class="dom-art">${TEAMS().map(t => `<i class="${beat.includes(t.id) ? 'on' : ''}">${logo(t, 'sm')}</i>`).join('')}</span>`;
  const packsArt = `<span class="packs-art">${packArt(MT.PACKS[2])}${packArt(MT.PACKS[1])}</span>`;
  const tiles = [
    ['dom', 'PLAY', `Domination: ${beat.length} of 30 teams beaten`, 'big', domArt],
    ['store', 'PACKS', 'Spend MT on new cards', 'big', packsArt],
    ['lineup', 'LINEUP', 'Starters and bench', '', icon('list')],
    ['coll', 'COLLECTION', `${s.cards.length} cards`, '', icon('cards')],
    ['edit', 'TEAM', 'Name and colors', '', icon('edit')],
  ];
  const e = el(`<section class="mt-scr">
    <div class="mt-top">
      ${banner(s)}
      <div class="mt-stats"><span><small>TEAM OVR</small><b>${ovr}</b></span><span><small>RECORD</small><b>${s.wins}-${s.losses}</b></span></div>
      <div class="mt-five" title="Lineup">${L.slice(0, 5).map((c, i) => c ? renderCard(c, 'xs') : `<div class="card xs empty"><div class="cd">${['PG', 'SG', 'SF', 'PF', 'C'][i]}</div></div>`).join('')}</div>
    </div>
    <div class="mt-tiles">${tiles.map(([id, n, sub, cls, ic]) => `<button class="mtile f ${cls}" data-id="${id}"><span class="mtile-in">${ic}<b>${n}</b><small>${esc(sub)}</small></span></button>`).join('')}</div>
  </section>`);
  e.querySelector('.mt-five').addEventListener('click', () => go('lineup'));
  e.querySelectorAll('.mtile').forEach(b => b.addEventListener('click', () => go({ dom: 'dom', store: 'store', lineup: 'lineup', coll: 'coll', edit: 'mtedit' }[b.dataset.id])));
  e.querySelector('[data-id=dom]').classList.add('dflt');
  return {
    el: e, title: 'MyTEAM', bg: mtBg(s), hints: [['ok', 'SELECT'], ['back', 'MAIN MENU']],
    enter() {
      const got = MT.claimDaily(s);
      if (got) {
        setCoins(true); bumpCoins(); Audio.play('reveal', 0.6);
        modal(`<h3>DAILY REWARD</h3><p class="big-mt">${icon('coin')}+${fmt(got)} MT</p><p>Come back tomorrow for another ${fmt(MT.REWARD.daily)} MT.</p>`, [{ label: 'COLLECT', value: 1, cls: 'go' }], 1);
      }
    },
  };
});

register('mtedit', (P) => {
  const s = MT.load(); if (!s) { setTimeout(back); return { el: el('<div></div>') }; }
  const d = P.d || (P.d = { name: s.name, c1: s.c1, c2: s.c2 });
  const e = el(`<section class="mtw-scr"><div class="mtw-l"><h2>EDIT TEAM</h2><div class="mtw-prev"></div></div><div class="mtw-r">${editorHTML(d)}<button class="btn go f dflt" data-id="save">SAVE</button></div></section>`);
  const prev = e.querySelector('.mtw-prev'); const upd = () => { prev.innerHTML = banner(d); }; bindEditor(e, d, upd); upd();
  e.querySelector('[data-id=save]').addEventListener('click', () => { const s2 = MT.load(); Object.assign(s2, { name: d.name.trim() || s2.name, c1: d.c1, c2: d.c2 }); MT.save(s2); back(); });
  return { el: e, title: 'MyTEAM  /  TEAM', bg: mtBg(d), hints: [['ok', 'SELECT'], ['back', 'BACK']] };
});
