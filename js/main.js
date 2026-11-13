// HOOPS 27 boot: menus, game launch, background preload of the 3D game.
import { app, mount, go, toast } from './ui/core.js';
import { Audio } from './audio.js';
import './ui/title.js';
import './ui/play.js';
import './ui/match.js';
import './ui/rosters.js';
import './ui/options.js';
import './ui/mt.js';
import './ui/mtpack.js';
import './ui/mtcards.js';

const menu = document.getElementById('menu'), gameEl = document.getElementById('game');
const forceStub = /[?&]stub\b/.test(location.search);

// the game module: ./game/game.js, or the menu test stub if it is not there yet (or ?stub is in the URL)
let gameP = null;
function loadGame() {
  if (!gameP) {
    gameP = (forceStub ? Promise.reject(new Error('stub requested')) : import('./game/game.js'))
      .catch(err => { if (!forceStub) console.warn('[hoops27] game engine not available, using menu stub:', err && err.message); return import('./menu-stub-game.js'); });
  }
  return gameP;
}

// thin loading bar along the bottom edge while the 3D models download
const bar = document.getElementById('loadbar');
function preload() {
  loadGame().then(m => {
    if (!m.preloadGame) { app.loadP = 1; bar.hidden = true; return; }
    bar.hidden = false;
    return m.preloadGame(p => { app.loadP = Math.max(0, Math.min(1, p)); bar.style.setProperty('--p', app.loadP); })
      .then(() => { app.loadP = 1; bar.style.setProperty('--p', 1); bar.classList.add('done'); setTimeout(() => (bar.hidden = true), 700); });
  }).catch(err => { console.warn('[hoops27] preload failed', err); app.loadP = 1; bar.hidden = true; });
}

// startGame contract: hide the menu, give the game #game, show the menu again when it resolves
app.launch = async (opts) => {
  let wait = null;
  const tm = setTimeout(() => { wait = document.createElement('div'); wait.className = 'gwait'; wait.textContent = 'Game engine loading...'; document.body.appendChild(wait); }, 250);
  let mod;
  try { mod = await loadGame(); } catch (e) { console.error(e); }
  clearTimeout(tm); if (wait) wait.remove();
  if (!mod || !mod.startGame) { toast('Game engine loading... try again in a moment.'); return { quit: true }; }
  app.active = false;
  if (document.activeElement) document.activeElement.blur();
  menu.style.display = 'none';
  gameEl.style.display = 'block';
  let res;
  try { res = await mod.startGame(Object.assign({}, opts, { container: gameEl })); }
  catch (e) { console.error('[hoops27] game crashed', e); res = { quit: true }; }
  gameEl.innerHTML = ''; gameEl.style.display = 'none';
  menu.style.display = '';
  Audio.crowd(0);
  app.active = true;
  return res || { quit: true };
};

mount(menu);
go('title');
document.documentElement.classList.add('ready');
// start fetching models a moment after the title is up
setTimeout(preload, 600);
