// MyTEAM: card collection, packs, lineup and rewards. Kid-safe: MT coins are only earned by playing, never bought.
// Save lives in localStorage 'h27_myteam':
// { mt, cards:[{uid,pid,tier,ovr,b}], lineup:[10 uids: 5 starters PG..C + 5 bench], name, c1, c2, wins, losses, lastDaily }
const KEY = 'h27_myteam';

export const TIERS = [
  { k: 'bronze', n: 'BRONZE', lo: 0, hi: 69, sell: 25 },
  { k: 'silver', n: 'SILVER', lo: 70, hi: 74, sell: 50 },
  { k: 'gold', n: 'GOLD', lo: 75, hi: 79, sell: 100 },
  { k: 'emerald', n: 'EMERALD', lo: 80, hi: 83, sell: 250 },
  { k: 'sapphire', n: 'SAPPHIRE', lo: 84, hi: 86, sell: 500 },
  { k: 'ruby', n: 'RUBY', lo: 87, hi: 89, sell: 1000 },
  { k: 'amethyst', n: 'AMETHYST', lo: 90, hi: 92, sell: 1750 },
  { k: 'diamond', n: 'DIAMOND', lo: 93, hi: 95, sell: 3000 },
  { k: 'pink', n: 'PINK DIAMOND', lo: 96, hi: 97, sell: 5000 },
  { k: 'opal', n: 'GALAXY OPAL', lo: 98, hi: 99, sell: 8000 },
];
export const tierIdx = (k) => TIERS.findIndex(t => t.k === k);
export const tierOf = (ovr) => TIERS.find(t => ovr >= t.lo && ovr <= t.hi) || (ovr > 99 ? TIERS[9] : TIERS[0]);

// per-card odds in percent. guar = one card in the pack is this tier or better
export const PACKS = [
  { id: 'standard', name: 'STANDARD', price: 1500, n: 5, boost: false, tier: 'gold',
    odds: { bronze: 30, silver: 36, gold: 24, emerald: 7, sapphire: 2.4, ruby: 0.5, amethyst: 0.1 }, guar: null },
  { id: 'premium', name: 'PREMIUM', price: 4000, n: 5, boost: true, tier: 'sapphire',
    odds: { silver: 22, gold: 42, emerald: 24, sapphire: 8, ruby: 3, amethyst: 0.7, diamond: 0.25, pink: 0.05 }, guar: 'sapphire' },
  { id: 'elite', name: 'ELITE', price: 9000, n: 5, boost: true, tier: 'ruby',
    odds: { gold: 35, emerald: 38, sapphire: 18, ruby: 6, amethyst: 2, diamond: 0.7, pink: 0.25, opal: 0.05 }, guar: 'ruby' },
];

export const REWARD = { win: 1000, perPoint: 50, marginCap: 1000, loss: 300, daily: 500, start: 7500 };

const players = () => window.NBA_PLAYERS || [];
let PMAP = null;
export function playerById(id) {
  if (!PMAP) PMAP = new Map(players().map(p => [p.id, p]));
  return PMAP.get(id);
}
let uidN = 0;
const uid = () => Date.now().toString(36) + (uidN++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.cards)) return fix(s); } catch {}
  return null;
}
function fix(s) { // drop cards whose player left the data file
  s.cards = s.cards.filter(c => playerById(c.pid));
  const have = new Set(s.cards.map(c => c.uid));
  s.lineup = (s.lineup || []).map(u => (have.has(u) ? u : null));
  while (s.lineup.length < 10) s.lineup.push(null);
  s.mt = Math.max(0, Math.floor(s.mt || 0)); s.wins |= 0; s.losses |= 0;
  return s;
}
export function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
export function reset() { try { localStorage.removeItem(KEY); } catch {} }
export function newSave(name, c1, c2) {
  const s = { mt: REWARD.start, cards: [], lineup: Array(10).fill(null), name: name || 'HOOPS UNITED', c1: c1 || '#e0263a', c2: c2 || '#f2f2f0', wins: 0, losses: 0, lastDaily: today() };
  save(s); return s;
}

const card = (p, ovr, b) => ({ uid: uid(), pid: p.id, tier: tierOf(ovr).k, ovr, b: b ? 1 : 0 });

// all (player, card ovr) options for a tier; boosted versions (+2..+4) only from boost packs
function options(t, boost, pos) {
  const out = [];
  for (const p of players()) {
    if (pos && p.pos !== pos) continue;
    if (p.ovr >= t.lo && p.ovr <= t.hi) out.push({ p, ovr: p.ovr, b: false, w: 1 });
    if (boost) {
      const ups = [2, 3, 4].filter(u => p.ovr + u >= t.lo && p.ovr + u <= t.hi && p.ovr + u <= 99);
      if (ups.length) out.push({ p, ovr: p.ovr + ups[Math.floor(Math.random() * ups.length)], b: true, w: 0.45 });
    }
  }
  return out;
}
function pickWeighted(list) {
  const tot = list.reduce((a, o) => a + o.w, 0); let r = Math.random() * tot;
  for (const o of list) { r -= o.w; if (r <= 0) return o; }
  return list[list.length - 1];
}
function rollTier(odds, minK) {
  const min = minK ? tierIdx(minK) : 0;
  const ent = Object.entries(odds).filter(([k]) => tierIdx(k) >= min);
  const tot = ent.reduce((a, [, v]) => a + v, 0); let r = Math.random() * tot;
  for (const [k, v] of ent) { r -= v; if (r <= 0) return k; }
  return ent[ent.length - 1][0];
}
function drawCard(tierK, boost, pos, avoid) {
  for (let i = tierIdx(tierK); i >= 0; i--) { // no player in that tier: step down
    let o = options(TIERS[i], boost, pos).filter(x => !avoid || !avoid.has(x.p.id));
    if (o.length) { const x = pickWeighted(o); return card(x.p, x.ovr, x.b); }
  }
  return card(players()[0], players()[0].ovr, false);
}

// buy + open a pack: returns {cards} (already added to the save) or {err}
export function buyPack(s, packId) {
  const P = PACKS.find(p => p.id === packId);
  if (!P) return { err: 'No such pack' };
  if (s.mt < P.price) return { err: 'Not enough MT' };
  s.mt -= P.price;
  const cards = [];
  for (let i = 0; i < P.n; i++) cards.push(drawCard(rollTier(P.odds, i === 0 ? P.guar : null), P.boost));
  cards.sort(() => Math.random() - 0.5);
  s.cards.push(...cards); save(s);
  return { cards, pack: P };
}

// free starter pack: 10 cards that always fill a lineup (G G F F C + bench G F C G F)
export function starterPack(s) {
  const pos = ['G', 'G', 'F', 'F', 'C', 'G', 'F', 'C', 'G', 'F'];
  const tiers = ['gold', 'silver', 'silver', 'gold', 'silver', 'bronze', 'silver', 'bronze', 'gold', 'bronze'];
  const used = new Set(), cards = [];
  pos.forEach((p, i) => { const c = drawCard(tiers[i], false, p, used); used.add(c.pid); cards.push(c); });
  s.cards.push(...cards); s.starter = 1; autoLineup(s); save(s);
  return cards;
}

export const cardOf = (s, u) => s.cards.find(c => c.uid === u) || null;
export const inLineup = (s, u) => s.lineup.includes(u);
const SLOTPOS = ['G', 'G', 'F', 'F', 'C'];

// best cards by position for the five starters, then best five others (one copy of each player)
export function autoLineup(s) {
  const sorted = [...s.cards].sort((a, b) => b.ovr - a.ovr), used = new Set(), uids = new Set(), L = Array(10).fill(null);
  const take = (c, i) => { L[i] = c.uid; used.add(c.pid); uids.add(c.uid); };
  SLOTPOS.forEach((pos, i) => { const c = sorted.find(c => !used.has(c.pid) && playerById(c.pid).pos === pos); if (c) take(c, i); });
  for (let i = 0; i < 10; i++) if (!L[i]) { const c = sorted.find(c => !used.has(c.pid)); if (c) take(c, i); }
  // starters PG, SG: better ball handler first is not needed here, keep the order
  s.lineup = L; save(s);
}

// put card uid into slot i (swaps if it is already in the lineup, refuses a second copy of the same player)
export function setSlot(s, i, u) {
  const c = cardOf(s, u); if (!c) return false;
  const j = s.lineup.indexOf(u);
  if (j >= 0) { s.lineup[j] = s.lineup[i]; s.lineup[i] = u; save(s); return true; }
  const dup = s.lineup.findIndex((x, k) => k !== i && x && cardOf(s, x).pid === c.pid);
  if (dup >= 0) s.lineup[dup] = s.lineup[i];
  s.lineup[i] = u; save(s); return true;
}

export function quickSell(s, u) {
  const c = cardOf(s, u); if (!c || inLineup(s, u)) return 0;
  const v = TIERS[tierIdx(c.tier)].sell;
  s.cards = s.cards.filter(x => x.uid !== u); s.mt += v; save(s);
  return v;
}

export function lineupCards(s) { return s.lineup.map(u => (u ? cardOf(s, u) : null)); }
// same weighting as ratings.teamOvr: starters 75%, best 4 bench 25%, +4
export function teamOvr(s) {
  const L = lineupCards(s), st = L.slice(0, 5).filter(Boolean), bn = L.slice(5, 9).filter(Boolean);
  if (!st.length) return 0;
  const a = st.reduce((x, c) => x + c.ovr, 0) / 5, b = bn.length ? bn.reduce((x, c) => x + c.ovr, 0) / bn.length : a - 8;
  return Math.min(99, Math.round(a * 0.75 + b * 0.25 + 4));
}
export const lineupReady = (s) => s.lineup.slice(0, 5).every(Boolean);

// players for the game: copies of NBA_PLAYERS with the card's OVR; starters first
export function roster(s) {
  return lineupCards(s).filter(Boolean).map(c => Object.assign({}, playerById(c.pid), { ovr: c.ovr }));
}
export function teamObj(s) { return { id: 'MYT', city: '', name: s.name, abbr: 'MYT', c1: s.c1, c2: s.c2, logo: null }; }

export function claimDaily(s) {
  const d = today(); if (s.lastDaily === d) return 0;
  s.lastDaily = d; s.mt += REWARD.daily; save(s); return REWARD.daily;
}

// after a MyTEAM game (user team is always 'home'). quit = no reward, no record. s.beat = Domination teams beaten
export function applyResult(s, res, oppId) {
  if (!res || res.quit || !res.score) return { mt: 0, quit: true };
  const m = res.score.home - res.score.away, win = res.winner ? res.winner === 'home' : m > 0;
  let mt, bonus = 0;
  if (win) { bonus = Math.min(REWARD.marginCap, Math.max(0, m) * REWARD.perPoint); mt = REWARD.win + bonus; s.wins++; if (oppId) { s.beat = s.beat || []; if (!s.beat.includes(oppId)) s.beat.push(oppId); } }
  else { mt = REWARD.loss; s.losses++; }
  s.mt += mt; save(s);
  return { mt, win, bonus, margin: m };
}
