// Player ratings for Hoops 27, built from the real stat lines in data.js (ESPN rosters + Basketball Reference stats).
// p.r = [pts, reb, ast, stl, blk] (per game), p.sh = [3P%, 3PA per game, FT%], p.ovr = overall.
// Rookies / players without stats get ratings from their overall, position and height.

const clamp = (v, a = 25, b = 99) => Math.max(a, Math.min(b, Math.round(v)));
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
export function heightIn(ht) { const m = /(\d+)'\s*(\d+)/.exec(ht || ''); return m ? (+m[1]) * 12 + (+m[2]) : 78; }

const cache = new Map();
// returns { ovr, three, mid, close, dunk, ft, pass, handle, speed, def, steal, block, reb, stam, hIn, hM, pos, arch }
export function rate(p) {
  // MyTEAM cards can carry a boosted overall: rate the real player, then lift every rating by the boost
  const real = (window.NBA_PLAYERS || []).find(q => q.id === p.id);
  if (real && real !== p && p.ovr !== real.ovr) {
    const key = p.id + ':' + p.ovr; if (cache.has(key)) return cache.get(key);
    const R0 = rate(real), dlt = p.ovr - real.ovr, R = { ...R0, ovr: p.ovr };
    for (const k of ['three', 'mid', 'close', 'dunk', 'ft', 'pass', 'handle', 'def', 'steal', 'block', 'reb']) R[k] = clamp(R0[k] + dlt);
    R.speed = clamp(R0.speed + dlt * 0.5, 40, 97); R.stam = clamp(R0.stam + dlt * 0.5, 55, 99);
    cache.set(key, R); return R;
  }
  if (cache.has(p.id)) return cache.get(p.id);
  const o = p.ovr || 60, hIn = heightIn(p.ht), pos = p.pos || 'F';
  const big = pos === 'C' ? 1 : pos === 'F' ? 0.5 : 0;
  const j = (k) => (hash(p.id + k) - 0.5) * 8; // fixed per-player wiggle so rookies are not clones
  const r = p.r || null, sh = p.sh || null;
  const base = 40 + (o - 60) * 1.05;
  let three, mid, ft, close, pass, handle, def, steal, block, reb;
  if (r && sh) {
    const [pts, rb, ast, stl, blk] = r, [p3, a3, ftp] = sh;
    const vol = Math.min(1, a3 / 5);
    three = vol * (33 + (p3 - 0.28) * 300 + Math.min(a3, 11) * 2.6) + (1 - vol) * (35 + (p3 > 0 ? (p3 - 0.28) * 90 : -8) + a3 * 4);
    ft = 20 + (ftp || 0.7) * 80;
    mid = 0.45 * three + 0.4 * ft + 0.15 * (40 + pts * 1.6);
    close = 40 + pts * 1.2 + big * 14 + (o - 70) * 0.6;
    pass = 38 + ast * 6.2 + (o - 70) * 0.3;
    handle = 40 + ast * 3.2 + pts * 0.7 + (1 - big) * 12 - big * 8 + (o - 75) * 0.4;
    steal = 38 + stl * 26 + (o - 70) * 0.2;
    block = 30 + blk * 24 + big * 8 + (hIn - 78) * 1.2;
    reb = 30 + rb * 4.2 + big * 6;
    def = 46 + stl * 9 + blk * 8 + (o - 70) * 0.55 + (hIn - 78) * 0.5;
  } else {
    three = base - big * 16 + j('3'); ft = base + 6 - big * 10 + j('f'); mid = (three + ft) / 2 + j('m');
    close = base + 6 + big * 10 + j('c'); pass = base - big * 10 + j('p'); handle = base + (1 - big) * 8 - big * 12 + j('h');
    steal = base - 4 + j('s'); block = base - 14 + big * 22 + j('b'); reb = base - 10 + big * 24 + j('r'); def = base + j('d');
  }
  const age = p.age || 25;
  const speed = 92 - (hIn - 73) * 2.3 - Math.max(0, age - 29) * 1.6 + (o - 70) * 0.25 + j('v');
  const dunk = 30 + (hIn - 70) * 3.2 + (speed - 60) * 0.35 + (o - 70) * 0.4 - Math.max(0, age - 32) * 3 + j('k');
  const stam = 70 + (o - 70) * 0.5 - Math.max(0, age - 31) * 2 + j('t');
  const R = {
    ovr: o, three: clamp(three), mid: clamp(mid), close: clamp(close), dunk: clamp(dunk), ft: clamp(ft), pass: clamp(pass),
    handle: clamp(handle), speed: clamp(speed, 40, 97), def: clamp(def), steal: clamp(steal), block: clamp(block), reb: clamp(reb), stam: clamp(stam, 55, 99),
    hIn, hM: hIn * 0.0254, pos,
  };
  R.arch = archetype(R);
  cache.set(p.id, R);
  return R;
}

function archetype(R) {
  const t = [['Sharpshooter', R.three], ['Slasher', (R.dunk + R.close + R.speed) / 3], ['Playmaker', (R.pass + R.handle) / 2], ['Lockdown', (R.def + R.steal) / 2], ['Rim Protector', (R.block + R.reb) / 2]];
  t.sort((a, b) => b[1] - a[1]);
  return t[0][0];
}

export function teamPlayers(teamId) {
  return (window.NBA_PLAYERS || []).filter(p => p.t === teamId && !p.inj).sort((a, b) => b.ovr - a.ovr);
}

// pick a sensible starting five (2 G, 2 F, 1 C when possible) + bench, best first
export function depthChart(teamId, n = 13) {
  const all = teamPlayers(teamId), start = [], need = { G: 2, F: 2, C: 1 };
  for (const p of all) if (need[p.pos] > 0 && start.length < 5) { start.push(p); need[p.pos]--; }
  for (const p of all) if (start.length < 5 && !start.includes(p)) start.push(p);
  // order: PG, SG, SF, PF, C
  const order = { G: 0, F: 1, C: 2 };
  start.sort((a, b) => order[a.pos] - order[b.pos] || rate(b).handle - rate(a).handle);
  const bench = all.filter(p => !start.includes(p)).slice(0, n - 5);
  return { start, bench };
}

export function teamOvr(teamId) {
  const { start, bench } = depthChart(teamId);
  const s = start.reduce((a, p) => a + p.ovr, 0) / 5, b = bench.slice(0, 4).reduce((a, p) => a + p.ovr, 0) / Math.max(1, Math.min(4, bench.length));
  return Math.round(s * 0.75 + b * 0.25 + 4);
}

export const SLOT = ['PG', 'SG', 'SF', 'PF', 'C'];
export function headshot(p) { return `https://a.espncdn.com/i/headshots/nba/players/full/${p.id}.png`; }
export function teamById(id) { return (window.NBA_TEAMS || []).find(t => t.id === id); }
