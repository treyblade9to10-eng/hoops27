// MyTEAM card faces. Size comes from the size class (font-size), everything inside is in em.
import { esc, hs, logo, teamById, lastName, firstName, rate } from './common.js';
import { TIERS, tierIdx, playerById } from '../myteam.js';

export function renderCard(c, size = 'md', extra = '') {
  const p = playerById(c.pid), t = teamById(p.t), T = TIERS[tierIdx(c.tier)] || TIERS[0];
  return `<div class="card ${size} t-${T.k} ${extra}" data-uid="${esc(c.uid)}">
    <div class="cd">
      <div class="cd-bg"></div>
      <div class="cd-art">${hs(p)}</div>
      <div class="cd-top"><b class="cd-ovr">${c.ovr}</b><span class="cd-pos">${p.pos}</span>${c.b ? '<span class="cd-boost">+</span>' : ''}</div>
      <div class="cd-logo">${logo(t, 'xs')}</div>
      <div class="cd-name"><small>${esc(firstName(p.n))}</small><b>${esc(lastName(p.n))}</b></div>
      <div class="cd-tier">${T.n}</div>
      <div class="cd-sheen"></div>
    </div>
  </div>`;
}
export const cardBack = (size = 'md') => `<div class="card ${size} back"><div class="cd cd-backface"><span class="cb-mark">H<i>27</i></span></div></div>`;

// one row for list pickers
export function cardRow(c, extra = '', id = '') {
  const p = playerById(c.pid), t = teamById(p.t), r = rate(p);
  return `<button class="crow f ${extra}" data-uid="${esc(c.uid)}" data-id="${id || 'c-' + esc(c.uid)}">
    <span class="crow-ovr t-${c.tier}">${c.ovr}</span>${hs(p, 'sm')}
    <span class="crow-n"><b>${esc(p.n)}</b><small>${p.pos} &middot; ${esc(r.arch)}${c.b ? ' &middot; BOOSTED' : ''}</small></span>${logo(t, 'xs')}
  </button>`;
}
