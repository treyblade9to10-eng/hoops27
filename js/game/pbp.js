// Play-by-play lines (text commentary) from engine events.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nm = (P) => { const p = String(P && P.d && P.d.n || '').split(' '); return esc(p.length > 1 ? p.slice(1).join(' ') : p[0]); };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function pbpFor(G, e) {
  switch (e.k) {
    case 'score': {
      const P = e.P, a = e.assist ? ` <i>(${nm(e.assist)} with the dime)</i>` : '';
      if (e.type === 'ft') return null;
      if (e.type === 'dunk') return { text: pick([`<b>${nm(P)}</b> throws it DOWN!`, `<b>${nm(P)}</b> with the hammer!`, `Rim rocked by <b>${nm(P)}</b>!`]) + a, kind: 'hot' };
      if (e.three) return { text: pick([`<b>${nm(P)}</b> from downtown... BANG!`, `<b>${nm(P)}</b> buries the three!`, `Splash! <b>${nm(P)}</b> from deep.`, `<b>${nm(P)}</b> lets it fly... got it!`]) + a, kind: e.g === 'green' ? 'hot' : '' };
      if (e.type === 'layup') return { text: pick([`<b>${nm(P)}</b> gets to the rack.`, `<b>${nm(P)}</b> lays it in.`, `Easy two for <b>${nm(P)}</b>.`, `<b>${nm(P)}</b> finishes at the rim.`]) + a };
      if (e.type === 'putback') return { text: `Putback by <b>${nm(P)}</b>!` };
      return { text: pick([`<b>${nm(P)}</b> knocks down the jumper.`, `<b>${nm(P)}</b> pulls up... good.`, `Money from <b>${nm(P)}</b>.`]) + a };
    }
    case 'block': return { text: pick([`REJECTED by <b>${nm(e.P)}</b>!`, `<b>${nm(e.P)}</b> sends it back!`, `Get that outta here! <b>${nm(e.P)}</b> with the block.`]), kind: 'hot' };
    case 'steal': return { text: pick([`<b>${nm(e.P)}</b> picks his pocket!`, `Stolen by <b>${nm(e.P)}</b>.`, `<b>${nm(e.P)}</b> jumps the lane!`]) };
    case 'ankle': return { text: `<b>${nm(e.P)}</b> breaks <b>${nm(e.D)}</b>'s ankles!`, kind: 'hot' };
    case 'foul': return e.and1 ? { text: `And one! Foul on <b>${nm(e.P)}</b>.`, kind: 'hot' } : { text: `${e.shooting ? 'Shooting foul' : 'Foul'} on <b>${nm(e.P)}</b>.` };
    case 'turnover': return { text: `Turnover — ${esc(String(e.why || '').toLowerCase())}, <b>${nm(e.P)}</b>.` };
    case 'violation': return { text: `Shot clock violation.` };
    case 'oop': return { text: `ALLEY-OOP! <b>${nm(e.P)}</b> slams it home!`, kind: 'hot' };
    case 'reb': return e.off && Math.random() < 0.6 ? { text: `Offensive board, <b>${nm(e.P)}</b>.` } : null;
    case 'miss': return e.airball ? { text: `Airball from <b>${nm(e.P)}</b>.` } : null;
    case 'tip': return { text: `<b>${nm(e.P)}</b> wins the tip.` };
    case 'sub': return { text: `Sub: <b>${nm(e.in)}</b> in for <b>${nm(e.out)}</b>.`, kind: 'dim' };
    case 'quarter': return { text: e.q > 4 ? 'We are headed to overtime!' : `Start of the ${['1st', '2nd', '3rd', '4th'][e.q - 1]} quarter.`, kind: 'dim' };
  }
  return null;
}
