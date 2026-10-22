// Floor plan in metres, y grows downward (map "up" is -y). One step = STEP_M.
export const STEP_M = 0.9;
export const MAP_W = 36;
export const MAP_H = 30;

// Coworking area + pool table: 15 steps wide, 16 steps long.
export const ZONE = { x: 0, y: MAP_H - 16 * STEP_M, w: 15 * STEP_M, h: 16 * STEP_M };

const DESK = { w: 3.2, h: 1.0 };
const DESK_COLS = [1.2, 5.1, 9.0];
// Desks run from just above the 2nd left pillar down to the 3rd left pillar.
const DESK_ROW_Y = [15.6, 17.6, 19.6, 21.6, 23.6];

// Desks are numbered 1-15 left to right, top to bottom.
export const desks = Array.from({ length: 15 }, (_, i) => ({
  n: i + 1,
  x: DESK_COLS[i % 3],
  y: DESK_ROW_Y[Math.floor(i / 3)],
  ...DESK,
}));

export const poolTable = { x: 5.3, y: 27, w: 2.8, h: 1.5 };

export const walls = [
  { x1: 13.5, y1: 3, x2: 13.5, y2: MAP_H },
  { x1: 29.5, y1: 3, x2: 29.5, y2: MAP_H },
];
export const pillars = [
  { x: 13.5, y: 9 },
  { x: 13.5, y: 16.5 },
  { x: 13.5, y: 24.6 },
  { x: 29.5, y: 5.3 },
  { x: 29.5, y: 22 },
];
export const bars = [
  { x: 14.7, y: 0.3, w: 11, h: 1.4 },
  { x: 14.6, y: 2.2, w: 11, h: 3.8 },
];
export const cafe = { x: 30.2, y: 11.3, w: 5.2, h: 6.7 };
export const seats = Array.from({ length: 24 }, (_, i) => ({
  x: 15.5 + (i % 6) * 2.1,
  y: 7.5 + Math.floor(i / 6) * 1.2,
}));

export const START_DESK = 12;
export function startPosition() {
  const d = desks[START_DESK - 1];
  // Chair side of the desk, facing map-up (towards the desk).
  return { x: d.x + d.w / 2, y: d.y + d.h + 0.5 };
}
