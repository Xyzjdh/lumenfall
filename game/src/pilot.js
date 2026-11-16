// A pilot: the steering an expert player would give, worked out by looking ahead. The game
// itself never uses this; the screenshot scenes fly with it so every staged frame is a frame
// the rules really reach. It is also what the offline tuning harness plays with.
//
// Each decision simulates the comet's own physics forward for three candidate directions and
// picks the one that survives longest and collects the most light on the way.

import { CORRIDOR, PLAYER, STEP } from './config.js';
import { KIND_MOTE, KIND_STAR, corridorCentre, corridorHalfWidth, screenY } from './world.js';

const DIRECTIONS = [-1, 0, 1];

/** How far ahead the pilot looks, in seconds. */
const HORIZON = 1.9;

/**
 * The comet's position, `tape` seconds from now, if it steers `direction` from here: the same
 * acceleration, drag-free ceiling and corridor clamp the world applies, integrated at STEP.
 */
function project(comet, state, direction, horizon) {
  let x = comet.x;
  let vx = comet.vx;
  const y = comet.y;
  const out = [];
  const steps = Math.round(horizon / STEP);
  for (let index = 1; index <= steps; index += 1) {
    const want = direction * PLAYER.speed;
    const rate = Math.abs(want) > Math.abs(vx) ? PLAYER.accel : PLAYER.drag;
    vx += Math.max(-rate * STEP, Math.min(rate * STEP, want - vx));
    x += vx * STEP;
    const depth = state.depth + state.speed * index * STEP;
    const centre = corridorCentre(depth);
    const room = corridorHalfWidth(depth) - PLAYER.radius;
    if (x > centre + room) x = centre + room;
    if (x < centre - room) x = centre - room;
    out.push({ x, depth, t: index * STEP });
  }
  return out;
}

/**
 * How close a projected path comes to rock. `danger` counts only genuine near-misses (rock well
 * clear of the path costs nothing, which leaves room for the light to matter), `worst` is the
 * tightest gap anywhere on the path, and `first` the direction of the nearest threat, so the
 * pilot can lean away from it.
 */
function threatAlong(items, path, y) {
  let danger = 0;
  let worst = 90;
  let nearX = 0;
  for (const point of path) {
    for (const item of items) {
      if (!item.active || item.kind === KIND_MOTE || item.kind === KIND_STAR) continue;
      // Vertical gap between the comet (fixed on screen) and this rock, at this instant.
      const dy = screenY(item.at, point.depth) - y;
      if (dy > 80 || dy < -80) continue;
      const dx = item.x - point.x;
      const gap = Math.sqrt(dx * dx + dy * dy) - item.r - PLAYER.radius;
      if (gap < 30) danger += 30 - Math.max(-30, gap);
      if (gap < worst) {
        worst = gap;
        nearX = item.x - point.x;
      }
    }
  }
  return { danger, worst, nearX };
}

/**
 * How long the projected path spends pinned against a wall. A real player keeps off the walls:
 * scraping one costs glow, so the pilot is scored as though it agrees.
 */
function timeAtWall(path) {
  let touching = 0;
  for (const point of path) {
    const centre = corridorCentre(point.depth);
    const room = corridorHalfWidth(point.depth) - PLAYER.radius - 1.5;
    if (Math.abs(point.x - centre) >= room) touching += 1;
  }
  return touching * STEP;
}

/**
 * How much light a projected path would gather. Nearness counts, not just contact: a path that
 * passes close to a mote is rewarded for turning toward it, which is what gives the pilot a
 * gradient to chase with rather than a bonus it only gets after it happens to touch one.
 */
function lightAlong(items, path, y) {
  let light = 0;
  const step = 2; // every other sample is plenty for a soft field
  for (let index = 0; index < path.length; index += step) {
    const point = path[index];
    for (const item of items) {
      if (!item.active) continue;
      if (item.kind !== KIND_MOTE && item.kind !== KIND_STAR) continue;
      const dy = screenY(item.at, point.depth) - y;
      if (dy > 34 || dy < -34) continue;
      const dx = Math.abs(item.x - point.x);
      if (dx > 70) continue;
      // Full credit inside 16 px, easing to nothing at 70 px.
      const near = Math.max(0, 1 - Math.max(0, dx - 16) / 54);
      light += near * (item.kind === KIND_STAR ? 3.2 : 1);
    }
  }
  return light;
}

/**
 * The direction to steer this step. `bias` keeps a pilot from dithering between two equal
 * choices: pass the direction it chose last.
 */
export function pilotDirection(world, bias = 0, horizon = HORIZON, options = {}) {
  const { state, comet, items } = world;
  // The nearest light ahead: what the pilot is steering toward when nothing is in the way.
  let target = null;
  for (const item of items) {
    if (!item.active) continue;
    if (item.kind !== KIND_MOTE && item.kind !== KIND_STAR) continue;
    if (item.at < state.depth) continue;
    if (target === null || item.at < target.at) target = item;
  }
  const corridor = corridorCentre(state.depth) + 0;
  // A dodge-only pilot ignores the light; a repel-light pilot steers away from it, as a player
  // does when the run is already lost and the light no longer matters.
  const homeX = target !== null && !options.dodgeOnly && !options.repelLight ? target.x : corridor;
  // A frame caught for a screenshot should not have a rock sitting on the comet: weight the
  // clearance of the very next moment heavily, so the comet is shown in clear air.
  const urgent = options.urgentClearance ? 1 : 0;

  let bestDirection = bias;
  let bestScore = -Infinity;
  for (const direction of DIRECTIONS) {
    const path = project(comet, state, direction, horizon);
    const { danger, worst, nearX } = threatAlong(items, path, comet.y);
    const light = lightAlong(items, path, comet.y);
    const scrape = timeAtWall(path);
    // A path that ever goes inside a rock is beyond saving, however good the rest of it looks.
    const smash = worst < 0 ? worst * 60 - 400 : 0;
    // Getting closer to the light is worth something, so the pilot chases rather than drifts.
    const endX = path[path.length - 1]?.x ?? comet.x;
    const chase = -Math.abs(homeX - endX) * 0.035;
    // Lean away from the nearest threat's side, as a player would.
    const avoid = worst < 46 ? -Math.sign(nearX) * direction * 2.2 : 0;
    // A whisper of stickiness stops the pilot dithering between two equal paths.
    const steer = direction === bias ? 0.08 : 0;
    const wantLight = options.repelLight ? -light * 4.2 : options.dodgeOnly ? 0 : light * 4.2;
    // The comet's own spot, on this path's first instant, must be clear air.
    let here = 0;
    if (urgent > 0) {
      const first = path[0] ?? { x: comet.x, depth: state.depth };
      for (const item of items) {
        if (!item.active || item.kind === KIND_MOTE || item.kind === KIND_STAR) continue;
        const dy = screenY(item.at, first.depth) - comet.y;
        if (dy > 46 || dy < -46) continue;
        const gap = Math.abs(item.x - first.x) - item.r - PLAYER.radius;
        if (gap < 60) here -= (60 - Math.max(0, gap)) * 1.4;
      }
    }
    const score = -danger * 2.6 + smash + wantLight - scrape * 7 + chase + avoid + steer + here;
    if (score > bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }
  return bestDirection;
}

/** A short horizon, for the scenes that want a hurried player rather than a perfect one. */
export function hurriedDirection(world, bias = 0) {
  return pilotDirection(world, bias, 0.45);
}

void CORRIDOR;
