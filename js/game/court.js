// Court geometry (meters). x runs baseline to baseline, z sideline to sideline, y up.
// The broadcast camera sits on the +z side.
export const CT = {
  L: 28.65, W: 15.24, HL: 14.325, HW: 7.62,
  HOOP_X: 12.75,          // rim centre distance from mid court
  RIM_Y: 3.048, RIM_R: 0.2286, RIM_T: 0.012,
  BOARD_X: 13.105, BOARD_W: 1.83, BOARD_BOT: 2.90, BOARD_TOP: 3.97,
  BALL_R: 0.12,
  THREE_R: 7.24, THREE_CORNER_Z: 6.71, THREE_BREAK_U: 4.27, // corner 3 runs straight 4.27 m out from the baseline
  KEY_HW: 2.44, FT_U: 5.79, RA_R: 1.22,
};
// hoop centre for attacking direction dir (+1 attacks +x)
export function hoop(dir) { return { x: dir * CT.HOOP_X, y: CT.RIM_Y, z: 0 }; }
// convert a point in "hoop space" (u = distance from the baseline toward mid court, v = z) to world
export function fromHoop(dir, u, v) { return { x: dir * (CT.HL - u), z: v * dir }; }
export function toHoop(dir, x, z) { return { u: CT.HL - dir * x, v: z * dir }; }
export function distToHoop(dir, x, z) { const dx = x - dir * CT.HOOP_X; return Math.hypot(dx, z); }
// is a spot (x,z) behind the three-point line for the hoop at dir
export function isThree(dir, x, z) {
  const u = CT.HL - dir * x;
  if (Math.abs(z) >= CT.THREE_CORNER_Z && u < CT.THREE_BREAK_U + 0.6) return true;
  return distToHoop(dir, x, z) >= CT.THREE_R;
}
export function inBounds(x, z, m = 0) { return Math.abs(x) <= CT.HL - m && Math.abs(z) <= CT.HW - m; }
