// Every number the game is tuned by, in one place: the viewport, the descent, the glow
// economy, the corridor, the spawn rates and the milestone ladder.
//
// Distances are metres of descent ("depth"). PIXELS_PER_METRE turns them into the screen's
// pixels. Coordinates are:
//   x  = pixels from the middle of the corridor, positive to the right
//   y  = pixels up the screen, the comet kept at PLAYER_SCREEN_Y from the bottom
//   depth = metres fallen since the start

/** The fixed drawing size. The canvas is scaled to the window with letterboxing. */
export const VIEW = { width: 960, height: 540 };

/** The comet sits here, from the bottom, so most of the screen shows what is coming. */
export const PLAYER_SCREEN_Y = 0.30;

/** One physics step. The loop feeds the world in fixed steps of this length. */
export const STEP = 1 / 60;

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
export const MAX_FRAME = 0.25;

/** How many pixels one metre of descent moves the world up the screen. */
export const PIXELS_PER_METRE = 5.5;

/** The run's goal: the core of the world, and the win screen, at this depth. */
export const GOAL_DEPTH_M = 4000;

/** The descent speeds up from START to END across the whole run (metres a second). */
export const DESCEND_SPEED_MPS = { start: 30, end: 100 };

/** The comet itself. */
export const PLAYER = {
  radius: 11,
  speed: 430, // pixels a second at the sideways ceiling
  accel: 3400, // pixels a second squared toward the wanted direction
  drag: 2600, // pixels a second squared that bleed off a drift with no input
  /** How far the mouse may sit from the middle before the comet goes flat out. */
  mouse_deadzone: 18,
  mouse_full_throw: 170,
};

/** The corridor's half-width in pixels: it breathes, and sometimes pinches. */
export const CORRIDOR = { base: 300, breathe: 34, min: 210 };

/** Pressure in the wall eats the glow: this much a second while touching, and the push home. */
export const WALL = { drain_per_second: 9, push: 620, spark_per_second: 26 };

/** The glow meter: the comet's life, its fuel and the thing the motes feed. */
export const GLOW = {
  max: 100,
  start: 100,
  /** Drained a second, before the descent's own extra cost. */
  drain_base: 3.0,
  drain_per_mps: 0.018,
  /** What one mote and one bright star give back. */
  mote: 8.0,
  star: 22,
  /** A new stratum stands the comet back up a little. */
  stratum_refill: 18,
};

/** Score: depth is the spine, motes are the multiplier. */
export const SCORE = {
  per_metre: 1,
  mote: 12,
  star: 40,
  stratum: 250,
};

/**
 * How the world is laid out ahead. Gaps are in SECONDS of falling, not metres: the descent
 * triples in speed over the run, so a gap fixed in metres would silently triple the rock the
 * player meets each second. In seconds, the density stays honest and the speed is the difficulty.
 */
export const SPAWN = {
  ahead_m: 150,
  /** One mote cluster every these seconds at the start, tightening to the end. */
  mote_gap: { start: 0.7, end: 0.52 },
  /** How many motes in an arc. */
  cluster: { min: 4, max: 6 },
  /** One rock every these seconds at the start, tightening to the end. */
  rock_gap: { start: 1.75, end: 0.92 },
  /** A rock's collision radius, a little smaller than it draws so it plays fair. */
  rock_radius: { min: 15, max: 29 },
  /** Chance a mote cluster is a single bright star instead. */
  star_chance: 0.2,
  /** Chance a rock is a long shard rather than a stone. */
  shard_chance: 0.35,
};

/**
 * The strata: the run is told in bands of depth, each with its own palette, its own name and
 * its own weather. The last band is the one the core sits in.
 */
export const STRATA = [
  { at: 0, name: 'AZURE VEIL', sky: ['#071426', '#0d2f52', '#17496f'], haze: '#2e6f95', accent: '#7fe3ff', rock: ['#1b4a63', '#2b6f87'], mote: '#b9f6ff' },
  { at: 800, name: 'EMBER WASTE', sky: ['#1a0709', '#3d1010', '#6b1d12'], haze: '#9c3418', accent: '#ffb057', rock: ['#4a1a17', '#7a2a1e'], mote: '#ffd9a0' },
  { at: 1600, name: 'VERDANT HUSH', sky: ['#04160f', '#0b3a25', '#12553a'], haze: '#2f8a5c', accent: '#8cffbe', rock: ['#16452f', '#206845'], mote: '#d6ffe6' },
  { at: 2400, name: 'VIOLET REACH', sky: ['#0c0620', '#241040', '#3a1a64'], haze: '#6b3ba8', accent: '#d0a4ff', rock: ['#2c1a4e', '#452a72'], mote: '#edd6ff' },
  { at: 3200, name: 'GILDED CORE', sky: ['#1c1204', '#3d2608', '#6b440e'], haze: '#b8862b', accent: '#ffe07a', rock: ['#4e3410', '#7a5220'], mote: '#fff3c4' },
];

/** The stratum a depth falls in. */
export function stratumAt(depth) {
  let found = STRATA[0];
  for (let index = 0; index < STRATA.length; index += 1) {
    if (depth >= STRATA[index].at) found = STRATA[index];
  }
  return found;
}

/** Stands for a new stratum and returns its index, -1 when the depth is short of the next one. */
export function stratumIndexAt(depth) {
  for (let index = STRATA.length - 1; index >= 0; index -= 1) {
    if (depth >= STRATA[index].at) return index;
  }
  return 0;
}

/** The depth of the next stratum's edge, or null at the core. */
export function nextStratumAt(depth) {
  for (let index = 0; index < STRATA.length; index += 1) {
    if (STRATA[index].at > depth) return STRATA[index].at;
  }
  return null;
}

/** 0 at the start of the run, 1 at the core: everything that tightens follows this. */
export function progress(depth) {
  return Math.min(1, Math.max(0, depth / GOAL_DEPTH_M));
}

/** The descent speed at a depth. */
export function descendSpeedAt(depth) {
  const t = progress(depth);
  return DESCEND_SPEED_MPS.start + (DESCEND_SPEED_MPS.end - DESCEND_SPEED_MPS.start) * t;
}

/** How fast the glow drains a second at a depth. */
export function glowDrainAt(depth) {
  return GLOW.drain_base + descendSpeedAt(depth) * GLOW.drain_per_mps;
}
