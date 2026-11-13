// TEMPORARY stand-in for js/game/game.js so the menus can be tested end to end. Not used once the real game loads.
import { Audio } from './audio.js';

export function preloadGame(onProgress) {
  return new Promise(res => { let p = 0; const t = setInterval(() => { p += 0.1; onProgress && onProgress(Math.min(1, p)); if (p >= 1) { clearInterval(t); res(); } }, 120); });
}

function fakeBox(side, win) {
  return side.roster.slice(0, 10).map((p, i) => {
    const st = i < 5, fga = st ? 8 + ((i * 7) % 9) : 2 + (i % 4), fgm = Math.round(fga * (win ? 0.52 : 0.42)), tpa = Math.round(fga * 0.35), tpm = Math.round(tpa * 0.37);
    return { id: p.id, n: p.n, min: st ? 30 + i : 12 + i, pts: fgm * 2 + tpm + (i % 3), reb: st ? 3 + (i * 3) % 8 : 1 + i % 3, ast: st ? 2 + (i * 5) % 7 : i % 2, stl: i % 3, blk: (i + 1) % 2, fgm, fga, tpm, tpa };
  });
}

export function startGame(o) {
  return new Promise(res => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;inset:0;background:#101114;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font:600 18px Barlow,sans-serif';
    d.innerHTML = `<div style="font:800 italic 34px 'Barlow Condensed',sans-serif">STUB GAME: ${o.away.team.name} at ${o.home.team.name}</div>
      <div>mode ${o.mode} &middot; ${o.format} &middot; ${o.qLen} min &middot; diff ${o.diff} &middot; you: ${o.user} &middot; uni ${o.uniforms.home}/${o.uniforms.away} &middot; rosters ${o.home.roster.length}/${o.away.roster.length}</div>
      <div style="display:flex;gap:12px"><button data-r="win">SIM WIN</button><button data-r="loss">SIM LOSS</button><button data-r="quit">QUIT</button></div>`;
    d.querySelectorAll('button').forEach(b => { b.style.cssText = 'font:800 20px "Barlow Condensed";padding:10px 22px;background:#e0263a;color:#fff;border:0;cursor:pointer'; });
    o.container.appendChild(d);
    Audio.crowd(0.4);
    d.addEventListener('click', e => {
      const r = e.target.dataset.r; if (!r) return;
      d.remove();
      if (r === 'quit') return res({ quit: true, score: { home: 0, away: 0 }, winner: null, box: { home: [], away: [] } });
      const me = o.user, them = me === 'home' ? 'away' : 'home', score = {};
      score[me] = r === 'win' ? 104 : 91; score[them] = r === 'win' ? 92 : 99;
      res({ quit: false, score, winner: r === 'win' ? me : them, box: { home: fakeBox(o.home, score.home > score.away), away: fakeBox(o.away, score.away > score.home) } });
    });
  });
}
