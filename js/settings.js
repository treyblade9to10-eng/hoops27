// Shared settings (menus write them, the game reads them). localStorage key: h27_settings
const KEY = 'h27_settings';
const DEF = { camera: 'broadcast', meter: true, sfx: 0.8, crowd: 0.7, qLen: 3, diff: 2, format: '5v5', hints: true, gfx: 'auto' };
export const Settings = Object.assign({}, DEF, (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } })());
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(Settings)); } catch {} }
export const DIFFS = ['ROOKIE', 'PRO', 'ALL-STAR', 'SUPERSTAR', 'HALL OF FAME'];
