// Shared menu helpers: HTML builders for logos, headshots, option rows, SVG icons.
import { headshot, teamById, rate, teamOvr, depthChart } from '../ratings.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const TEAMS = () => window.NBA_TEAMS || [];
export const PLAYERS = () => window.NBA_PLAYERS || [];
export { headshot, teamById, rate, teamOvr, depthChart };

export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const lastName = (n) => { const p = String(n).split(' '); return p.length > 1 ? p.slice(1).join(' ') : n; };
export const firstName = (n) => String(n).split(' ')[0];
export const initials = (n) => String(n).split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
export const teamColor = (t) => (t ? (lum(t.c1) < 0.06 ? t.c2 : t.c1) : '#e0263a'); // black primaries read badly on charcoal
export function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5;
  const n = parseInt(m[1], 16), f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

// team logo with a fallback badge (abbreviation on team colors) if ESPN is unreachable
export function logo(t, cls = '') {
  if (!t) return '';
  const src = t.logo ? `<img src="${esc(t.logo)}" alt="" draggable="false" onerror="this.parentNode.classList.add('nologo');this.remove()">` : '';
  return `<span class="logo ${cls}${t.logo ? '' : ' nologo'}" style="--c1:${t.c1};--c2:${t.c2}">${src}<span class="lgf">${esc(t.id === 'MYT' ? initials(t.name) : (t.abbr || t.id))}</span></span>`;
}
// player headshot with an initials silhouette fallback
export function hs(p, cls = '') {
  if (!p) return `<span class="hs noimg ${cls}"><i>${SIL}</i></span>`;
  return `<span class="hs ${cls}"><img src="${headshot(p)}" alt="" loading="lazy" draggable="false" onerror="this.parentNode.classList.add('noimg');this.remove()"><i>${SIL}<em>${esc(initials(p.n))}</em></i></span>`;
}
const SIL = '<svg viewBox="0 0 100 80" aria-hidden="true"><path d="M50 8c11 0 19 9 19 21s-8 22-19 22-19-10-19-22S39 8 50 8zM14 80c2-16 16-24 36-24s34 8 36 24z"/></svg>';

// option row: label + < value >. left/right while focused (or the arrows) change it.
export function optRow(id, label, values, idx, onChange, fmtV = (v) => v) {
  const r = el(`<div class="opt f" tabindex="0" data-id="${id}"><span class="ol">${esc(label)}</span>
    <span class="oc"><button class="oa" tabindex="-1" data-d="-1" aria-label="previous">${icon('chevL')}</button><span class="ov"></span><button class="oa" tabindex="-1" data-d="1" aria-label="next">${icon('chevR')}</button></span></div>`);
  const ov = r.querySelector('.ov');
  const show = () => { ov.innerHTML = fmtV(values[idx], idx); };
  r._lr = (d) => { idx = (idx + d + values.length) % values.length; show(); onChange(values[idx], idx); return true; };
  r.querySelectorAll('.oa').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); r.focus({ preventScroll: true }); r._lr(+b.dataset.d); }));
  r.addEventListener('click', () => r._lr(1));
  r.set = (i) => { idx = i; show(); };
  show(); return r;
}
// 10-step bar for volumes
export const volBar = (v) => `<span class="vbar">${Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(v * 10) ? 'on' : ''}"></i>`).join('')}</span><span class="vnum">${Math.round(v * 10)}</span>`;

// a small rating bar
export const bar = (k, v) => `<div class="rbar"><span>${k}</span><b style="--v:${v}%" class="${v >= 85 ? 'hi' : v >= 70 ? 'mid' : 'lo'}"><i></i></b><em>${v}</em></div>`;

// jersey icon in the uniform's colors. home = white, away = primary, alt = secondary
export function jersey(t, kind) {
  const W = '#f4f4f2', c1 = t.c1, c2 = t.c2;
  const [body, trim] = kind === 'home' ? [W, c1] : kind === 'away' ? [c1, lum(c2) > 0.8 && lum(c1) > 0.5 ? '#111' : c2] : [c2, c1];
  return `<svg class="jersey" viewBox="0 0 40 44"><path d="M12 2h5c0 3 1.5 5 3 5s3-2 3-5h5l2 1c0 7 2 9 5 9v30H5V12c3 0 5-2 5-9z" fill="${body}" stroke="${trim}" stroke-width="2.4"/><path d="M14 2.5c.5 5 3 7.5 6 7.5s5.5-2.5 6-7.5" fill="none" stroke="${trim}" stroke-width="2"/></svg>`;
}

export function bgFor(t, p) { return { c1: teamColor(t), c2: t ? t.c2 : '#333', p }; }
export function teamPlayersAll(teamId) { return PLAYERS().filter(p => p.t === teamId).sort((a, b) => b.ovr - a.ovr); }
export function starOf(teamId) { return PLAYERS().filter(p => p.t === teamId).sort((a, b) => b.ovr - a.ovr)[0]; }

const I = {
  chevL: '<path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="miter"/>',
  chevR: '<path d="m9 4 8 8-8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="miter"/>',
  coin: '<circle cx="12" cy="12" r="10.5" fill="#f2c230"/><circle cx="12" cy="12" r="8" fill="none" stroke="#9a7410" stroke-width="1.4"/><path d="M6.6 15.6V8.4h1.9l1.6 3.6 1.6-3.6h1.9v7.2h-1.6v-4.3l-1.4 3.1h-1l-1.4-3.1v4.3zM13.9 8.4h4.6v1.5h-1.5v5.7h-1.6V9.9h-1.5z" fill="#3b2c06"/>',
  pad: '<path d="M7 7h10a5 5 0 0 1 4.8 6.3l-1.4 5a2.6 2.6 0 0 1-4.5 1L14 17h-4l-1.9 2.3a2.6 2.6 0 0 1-4.5-1l-1.4-5A5 5 0 0 1 7 7z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 10.5v4M4 12.5h4" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="11" r="1.1" fill="currentColor"/><circle cx="18.6" cy="13.3" r="1.1" fill="currentColor"/>',
  keys: '<rect x="2" y="6" width="20" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 9.5h2M9 9.5h2M13 9.5h2M17 9.5h2M5 12.5h2M9 12.5h2M13 12.5h2M17 12.5h2M7 15.8h10" stroke="currentColor" stroke-width="1.8"/>',
  touch: '<rect x="5" y="2" width="14" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 18.5h4" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  gear: '<path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13" stroke="currentColor" stroke-width="2"/><path d="M3 5h2.4v2.4H3zM3 10.8h2.4v2.4H3zM3 16.6h2.4V19H3z" fill="currentColor"/>',
  shuffle: '<path d="M3 7h4l9 10h5M3 17h4l3-3.4M14 10.4 16 7h5M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.9"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  cards: '<path d="M4 6.5 13.5 4l3.6 13.5-9.5 2.5z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15 4.5h5v15h-2.2" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  rotate: '<rect x="18" y="6" width="22" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="8" y="30" width="36" height="22" rx="3" transform="rotate(0)" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".45"/><path d="M50 22a16 16 0 0 0-10-14" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="m36 4 4.5 4.5L35 12" fill="none" stroke="currentColor" stroke-width="2.4"/>',
  edit: '<path d="M4 20h4L19.5 8.5l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m13.5 6.5 4 4" stroke="currentColor" stroke-width="1.8"/>',
  ball: '<circle cx="12" cy="12" r="10" fill="#e8742a"/><path d="M2 12h20M12 2v20M5 4.8c3.4 3.6 3.4 10.8 0 14.4M19 4.8c-3.4 3.6-3.4 10.8 0 14.4" fill="none" stroke="#1a1310" stroke-width="1.3"/>',
  check: '<path d="m4 12.5 5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="2.6"/>',
};
export function icon(n, cls = '') { const vb = n === 'rotate' ? '0 0 56 56' : '0 0 24 24'; return `<svg class="ic ${cls}" viewBox="${vb}" aria-hidden="true">${I[n] || ''}</svg>`; }

// the HOOPS 27 wordmark (pure type + a slanted plate)
export const wordmark = (cls = '') => `<div class="wm ${cls}"><span class="wm-h">HOOPS</span><span class="wm-n">27</span></div>`;
