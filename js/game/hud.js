// In-game HUD (DOM over the 3D canvas): broadcast score bug, clocks, shot meter, controlled-player tag with
// stamina, play-by-play ticker, big moment banners, pause menu and the final screen.
import { REL } from './engine.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtClock = (s) => { s = Math.max(0, s); if (s < 60) return s.toFixed(1); const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };
export const shortName = (n) => { const p = String(n || '').split(' '); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : n; };
const lastName = (n) => { const p = String(n || '').split(' '); return p.length > 1 ? p.slice(1).join(' ') : n; };
function lum(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5; const v = parseInt(m[1], 16); return (0.3 * (v >> 16) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255)) / 255; }
const QN = (q) => q <= 4 ? ['1ST', '2ND', '3RD', '4TH'][q - 1] : (q === 5 ? 'OT' : `${q - 4}OT`);

export class Hud {
  constructor(root, G, opts) {
    this.G = G; this.opts = opts;
    const el = this.el = document.createElement('div'); el.className = 'h27-hud'; root.appendChild(el);
    const [H, Aw] = G.teams;
    const slab = (T) => { const c = lum(T.team.c1) > 0.8 ? T.team.c2 : T.team.c1; return `<div class="bug-team" style="--tc:${c}"><span class="bug-abbr">${esc(T.team.abbr || T.team.id)}</span><span class="bug-score" data-s="${T.i}">0</span><span class="bug-fouls" data-f="${T.i}"></span></div>`; };
    el.innerHTML = `
      <div class="bug">${slab(Aw)}${slab(H)}<div class="bug-clock"><span class="bug-q">1ST</span><span class="bug-time">0:00</span></div><div class="bug-shot"><span>24</span></div></div>
      <div class="pbp"></div>
      <div class="banner"><div class="banner-in"><span class="b1"></span><span class="b2"></span></div></div>
      <div class="tag"><div class="tag-name"></div><div class="tag-stam"><i></i></div></div>
      <div class="meter"><div class="meter-bar"><i class="meter-fill"></i><i class="meter-win"></i></div><div class="meter-grade"></div></div>
      <div class="ft-tip">HOLD SHOOT, RELEASE AT THE TOP</div>
      <button class="pause-btn" aria-label="Pause"><svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg></button>
      <div class="pause hide"></div>
      <div class="final hide"></div>`;
    this.q = (s) => el.querySelector(s);
    this.sEls = [this.q('[data-s="0"]'), this.q('[data-s="1"]')];
    this.qEl = this.q('.bug-q'); this.tEl = this.q('.bug-time'); this.scEl = this.q('.bug-shot span'); this.scBox = this.q('.bug-shot');
    this.tag = this.q('.tag'); this.tagName = this.q('.tag-name'); this.stam = this.q('.tag-stam i');
    this.meter = this.q('.meter'); this.mFill = this.q('.meter-fill'); this.mWin = this.q('.meter-win'); this.mGrade = this.q('.meter-grade');
    this.pbp = this.q('.pbp'); this.ban = this.q('.banner'); this.ftTip = this.q('.ft-tip');
    this.lines = []; this.banT = 0; this.meterT = 0; this.lastScore = [-1, -1];
    this.q('.pause-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); opts.onPause && opts.onPause(); });
  }
  destroy() { this.el.remove(); }

  update(dt, G, proj) {
    // score bug
    for (const T of G.teams) if (this.lastScore[T.i] !== T.score) {
      this.lastScore[T.i] = T.score; const e = this.sEls[T.i]; e.textContent = T.score; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop');
    }
    this.qEl.textContent = QN(G.q);
    this.tEl.textContent = fmtClock(G.clock);
    const showShot = G.phase !== 'ft' && G.clock > G.shot - 0.05;
    this.scEl.textContent = showShot ? (G.shot < 5 ? Math.max(0, G.shot).toFixed(1) : Math.ceil(Math.max(0, G.shot))) : '';
    this.scBox.classList.toggle('low', showShot && G.shot < 5);
    for (const T of G.teams) { const f = this.q(`[data-f="${T.i}"]`); const bonus = G.teams[1 - T.i].fouls >= 5; f.textContent = bonus ? 'BONUS' : ''; }
    // controlled player tag + meter
    const ut = G.userTeam >= 0 ? G.teams[G.userTeam] : null;
    const C = ut ? G.ctl[ut.i] : null;
    if (C && proj) {
      const p = proj(C, C.R.hM + 0.38 + C.y);
      if (p) {
        this.tag.style.transform = `translate(${p.x}px, ${p.y}px)`; this.tag.classList.add('on');
        const nm = `${C.d.num ? '#' + C.d.num + ' ' : ''}${lastName(C.d.n).toUpperCase()}`;
        if (this.tagName.textContent !== nm) this.tagName.textContent = nm;
        this.stam.style.width = Math.round(C.stam * 100) + '%'; this.stam.classList.toggle('low', C.stam < 0.35);
      } else this.tag.classList.remove('on');
      // shot meter
      const A = C.act;
      if (A && A.k === 'shoot' && A.user && this.opts.meter !== false && !(A.type !== 'jump' && A.type !== 'ft' && A.t < 0.1 && !A.held && A.released)) {
        const mp = proj(C, C.R.hM * 0.75 + C.y);
        if (mp) this.meter.style.transform = `translate(${mp.x + 48}px, ${mp.y}px)`;
        const t = A.released ? A.relT : A.t, f = Math.min(1.15, t / A.rel);
        this.mFill.style.height = Math.min(100, f / 1.15 * 100) + '%';
        if (!A.released) { this.mGrade.textContent = ''; this.meter.className = 'meter on'; }
        this.meterT = 1.2;
      } else if (this.meterT > 0) { this.meterT -= dt; if (this.meterT <= 0) this.meter.classList.remove('on'); }
    } else this.tag.classList.remove('on');
    this.ftTip.classList.toggle('on', !!(G.phase === 'ft' && G.ft && G.ft.P.T.user && G.ft.i === 0 && G.ft.made === 0 && !G.ft.P.act && G.ball.holder === G.ft.P));
    // banners
    if (this.banT > 0) { this.banT -= dt; if (this.banT <= 0) this.ban.classList.remove('on'); }
    // pbp fade
    const now = performance.now();
    for (const l of this.lines) if (!l.gone && now - l.t > 4200) { l.gone = true; l.el.classList.add('out'); setTimeout(() => l.el.remove(), 500); }
    this.lines = this.lines.filter(l => !l.gone || now - l.t < 5000);
  }

  grade(g) {
    if (!g) return;
    const good = g === 'green', ok = g.startsWith('slightly');
    this.meter.className = 'meter on ' + (good ? 'green' : ok ? 'ok' : 'bad');
    this.mGrade.textContent = good ? 'EXCELLENT' : g.toUpperCase();
    this.meterT = 1.3;
  }
  // green window marker (fraction of the bar)
  meterWindow(rel, W) { const lo = Math.max(0, (rel - W) / rel / 1.15), hi = Math.min(1, (rel + W) / rel / 1.15); this.mWin.style.bottom = (lo * 100) + '%'; this.mWin.style.height = ((hi - lo) * 100) + '%'; }

  say(text, kind = '') {
    const d = document.createElement('div'); d.className = 'pbp-line ' + kind; d.innerHTML = text; this.pbp.prepend(d);
    this.lines.push({ el: d, t: performance.now() });
    while (this.pbp.children.length > 3) this.pbp.lastChild.remove();
  }
  banner(a, b = '', kind = '', dur = 2) {
    this.q('.b1').textContent = a; this.q('.b2').textContent = b;
    this.ban.className = 'banner on ' + kind; this.banT = dur;
  }

  // pause menu
  showPause(items) {
    const p = this.q('.pause'); p.classList.remove('hide');
    p.innerHTML = `<div class="pause-in"><div class="pause-title">PAUSED</div>${items.map((it, i) => `<button class="pi" data-i="${i}">${esc(it.label)}${it.value != null ? `<span>${esc(it.value)}</span>` : ''}</button>`).join('')}</div>`;
    p.querySelectorAll('.pi').forEach(b => b.addEventListener('click', () => items[+b.dataset.i].fn()));
    this.pauseItems = items; this.pauseSel = 0; this.markPause();
  }
  markPause() { this.q('.pause').querySelectorAll('.pi').forEach((b, i) => b.classList.toggle('sel', i === this.pauseSel)); }
  pauseNav(d) { if (!this.pauseItems) return; this.pauseSel = (this.pauseSel + d + this.pauseItems.length) % this.pauseItems.length; this.markPause(); }
  pauseOk() { if (this.pauseItems) this.pauseItems[this.pauseSel].fn(); }
  hidePause() { this.q('.pause').classList.add('hide'); this.pauseItems = null; }

  showFinal(G, onDone) {
    const f = this.q('.final'); f.classList.remove('hide');
    const [H, Aw] = G.teams;
    const top = (T) => T.roster.filter(p => p.box.min > 0).sort((a, b) => (b.box.pts + b.box.reb * 0.8 + b.box.ast) - (a.box.pts + a.box.reb * 0.8 + a.box.ast))[0];
    const line = (P) => P ? `<div class="fin-top"><b>${esc(shortName(P.d.n).toUpperCase())}</b><span>${P.box.pts} PTS &nbsp; ${P.box.reb} REB &nbsp; ${P.box.ast} AST</span></div>` : '';
    const col = (T) => { const c = lum(T.team.c1) > 0.8 ? T.team.c2 : T.team.c1; return `<div class="fin-team" style="--tc:${c}"><div class="fin-abbr">${esc(T.team.abbr || T.team.id)}</div><div class="fin-score">${T.score}</div>${line(top(T))}</div>`; };
    f.innerHTML = `<div class="final-in"><div class="fin-title">FINAL${G.ot ? (G.ot > 1 ? ' / ' + G.ot + 'OT' : ' / OT') : ''}</div><div class="fin-row">${col(Aw)}${col(H)}</div><button class="fin-go">CONTINUE</button></div>`;
    f.querySelector('.fin-go').addEventListener('click', onDone);
    this.finalGo = onDone;
  }
}
