// The world: the falling comet, the corridor it falls through, the motes that feed it and the
// rock that eats it. Pure state and rules, no drawing and no browser: everything here is
// reproducible from a seed and a list of steering choices, which is what lets the screenshot
// scenes play the real rules forward and stage an honest frame.

import {
  CORRIDOR,
  GLOW,
  GOAL_DEPTH_M,
  PIXELS_PER_METRE,
  PLAYER,
  PLAYER_SCREEN_Y,
  SCORE,
  SPAWN,
  VIEW,
  WALL,
  descendSpeedAt,
  glowDrainAt,
  nextStratumAt,
  progress,
  stratumIndexAt,
} from './config.js';

/** Events a step reports back, as a bit field. */
export const EVENT_MOTE = 1;
export const EVENT_STAR = 2;
export const EVENT_HIT = 4;
export const EVENT_WALL = 8;
export const EVENT_OVER = 16;
export const EVENT_WIN = 32;
export const EVENT_STRATUM = 64;

export const KIND_STONE = 'stone';
export const KIND_SHARD = 'shard';
export const KIND_MOTE = 'mote';
export const KIND_STAR = 'star';

/** The comet's home line, in pixels from the bottom of the screen. */
const HOME_Y = VIEW.height * PLAYER_SCREEN_Y;

/** How far up and down the comet may be steered from home, in pixels. */
const STEER_Y = 74;

/** The corridor's middle, in pixels from the centre line, at a depth: two slow sine drifts. */
export function corridorCentre(depth) {
  return Math.sin(depth / 430) * 88 + Math.sin(depth / 137 + 1.7) * 42;
}

/** The corridor's half-width at a depth: it breathes, and now and then it pinches. */
export function corridorHalfWidth(depth) {
  const breathe = Math.sin(depth / 220 + 0.9) * CORRIDOR.breathe;
  // A pinch is a slow dip repeated every 340 m: deeper in, it bites harder.
  const bite = Math.pow(Math.max(0, Math.sin(depth / 108.1)), 6) * (26 + 74 * progress(depth));
  return Math.max(CORRIDOR.min, CORRIDOR.base + breathe - bite);
}

/** The depth at which an item sits, from its screen height. */
function depthOf(y) {
  return 0;
}

/** Where an item at a depth shows on screen, in pixels up from the bottom. */
export function screenY(itemDepth, depth) {
  return HOME_Y + (itemDepth - depth) * PIXELS_PER_METRE;
}

/** A fresh, idle world. */
export function createWorld(random) {
  const state = {
    depth: 0,
    speed: descendSpeedAt(0),
    glow: GLOW.start,
    score: 0,
    best: 0,
    chain: 0,
    motesTaken: 0,
    starsTaken: 0,
    hitsWall: 0,
    rocksPassed: 0,
    stratum: 0,
    stratumBanner: 0,
    time: 0,
  };

  const comet = { x: 0, y: HOME_Y, vx: 0, vy: 0, tilt: 0, radius: PLAYER.radius, alive: true };
  const items = [];
  let moteClock = 0.9;
  let rockClock = 2.2;
  let stratumEdge = nextStratumAt(0);

  /** The multiplier a run of unbroken motes earns: 1, and up to 5 as the chain grows. */
  function multiplier() {
    return Math.min(5, 1 + Math.floor(state.chain / 8));
  }

  function reset() {
    state.depth = 0;
    state.speed = descendSpeedAt(0);
    state.glow = GLOW.start;
    state.score = 0;
    state.chain = 0;
    state.motesTaken = 0;
    state.starsTaken = 0;
    state.hitsWall = 0;
    state.rocksPassed = 0;
    state.stratum = 0;
    state.stratumBanner = 0;
    state.time = 0;
    comet.x = 0;
    comet.y = HOME_Y;
    comet.vx = 0;
    comet.vy = 0;
    comet.tilt = 0;
    comet.alive = true;
    items.length = 0;
    moteClock = 0.9;
    rockClock = 2.2;
    stratumEdge = nextStratumAt(0);
  }

  /** Lay out one arc of motes, or one bright star, at a depth. */
  function spawnMoteCluster(atDepth) {
    const half = corridorHalfWidth(atDepth);
    const centre = corridorCentre(atDepth);
    const room = half - 26;
    const t = progress(atDepth);
    // The medians a player can fly through: the corridor's own drift.
    if (random.chance(SPAWN.star_chance)) {
      const x = centre + random.centred() * room * 0.8;
      items.push({ kind: KIND_STAR, x, at: atDepth, r: 15, phase: random.range(0, 6.28), active: true });
      return;
    }
    const count = random.int(SPAWN.cluster.min + (t > 0.6 ? 1 : 0), SPAWN.cluster.max);
    // An arc across the corridor, leaning the way the corridor leans, so it rewards a sweep.
    const lean = random.range(-0.55, 0.55);
    const span = Math.min(room * 1.2, count * 19);
    const startX = centre - span / 2 + random.range(-0.2, 0.2) * room;
    for (let index = 0; index < count; index += 1) {
      const f = count === 1 ? 0.5 : index / (count - 1);
      const bow = Math.sin(f * Math.PI) * 26;
      const x = startX + f * span + bow * lean;
      const at = atDepth + (f - 0.5) * span * 0.06;
      items.push({ kind: KIND_MOTE, x, at, r: 7, phase: random.range(0, 6.28), active: true });
    }
  }

  /** Drop one rock at a depth, kept clear of the corridor's walls so it can always be passed. */
  function spawnRock(atDepth) {
    const half = corridorHalfWidth(atDepth);
    const centre = corridorCentre(atDepth);
    const t = progress(atDepth);
    const size = random.range(SPAWN.rock_radius.min, SPAWN.rock_radius.max);
    const room = Math.max(0, half - size - 16);
    // Keep the rock's own line clear of the comet's resting line near where it will be met:
    // fair play, and it stops a rock being laid exactly under the comet in a staged frame.
    let x = centre + random.centred() * room;
    if (atDepth - state.depth < 170 && Math.abs(x) < size + PLAYER.radius + 26) {
      x = x >= 0 ? size + PLAYER.radius + 26 + random.range(0, 40) : -(size + PLAYER.radius + 26 + random.range(0, 40));
      x = Math.max(centre - room, Math.min(centre + room, x));
    }
    const shard = random.chance(SPAWN.shard_chance);
    items.push({
      kind: shard ? KIND_SHARD : KIND_STONE,
      x,
      at: atDepth,
      r: size * 0.92,
      drawR: size,
      rot: random.range(0, 6.28),
      spin: random.range(-0.5, 0.5) * (0.6 + t),
      wobble: random.range(0, 6.28),
      phase: random.range(0, 6.28),
      active: true,
    });
  }

  /**
   * Put the world's litter out ahead of the comet. Each kind keeps its own clock, in seconds of
   * descent: when the clock comes due, the item is placed at the depth it would be met at, and
   * the clock moves on. The look-ahead horizon in metres is only there so nothing pops in late.
   */
  function spawnAhead(dt) {
    if (dt <= 0) return;
    const t = progress(state.depth);
    const horizon = state.depth + SPAWN.ahead_m;
    moteClock -= dt;
    rockClock -= dt;
    while (moteClock <= 0) {
      const dueDepth = state.depth + Math.max(0, -moteClock) * state.speed;
      if (dueDepth > horizon) break;
      spawnMoteCluster(dueDepth);
      const gap = SPAWN.mote_gap.start + (SPAWN.mote_gap.end - SPAWN.mote_gap.start) * t;
      moteClock += gap * random.range(0.82, 1.18);
    }
    while (rockClock <= 0) {
      const dueDepth = state.depth + Math.max(0, -rockClock) * state.speed;
      if (dueDepth > horizon) break;
      spawnRock(dueDepth);
      // Deeper in, a second rock sometimes falls close behind the first.
      if (t > 0.5 && random.chance(0.16 + 0.26 * t)) spawnRock(dueDepth + random.range(26, 46));
      const gap = SPAWN.rock_gap.start + (SPAWN.rock_gap.end - SPAWN.rock_gap.start) * t;
      rockClock += gap * random.range(0.85, 1.15);
    }
  }

  /**
   * Advance the world one fixed step. `steer` is { x, y } in -1..1; `idle` runs the corridor
   * and the comet without spawning or draining, for a title screen with the world in motion.
   * Returns the events of the step.
   */
  function step(dt, steer, idle = false) {
    let events = 0;

    if (!idle) {
      state.speed = descendSpeedAt(state.depth);
      state.depth += state.speed * dt;
      state.time += dt;
    }

    // The comet: steer toward what was asked, bleed off drift when nothing is asked.
    // A steering value that is not a number is read as no steering: a NaN here would pass every
    // clearance test and quietly collect the whole world.
    const steerX = Number.isFinite(steer?.x) ? steer.x : 0;
    const steerY = Number.isFinite(steer?.y) ? steer.y : 0;
    const wantX = steerX * PLAYER.speed;
    const wantY = steerY * PLAYER.speed * 0.72;
    const rateX = Math.abs(wantX) > Math.abs(comet.vx) ? PLAYER.accel : PLAYER.drag;
    const rateY = Math.abs(wantY) > Math.abs(comet.vy) ? PLAYER.accel : PLAYER.drag;
    comet.vx += Math.max(-rateX * dt, Math.min(rateX * dt, wantX - comet.vx));
    comet.vy += Math.max(-rateY * dt, Math.min(rateY * dt, wantY - comet.vy));
    comet.x += comet.vx * dt;
    comet.y += comet.vy * dt;
    comet.tilt += (comet.vx / PLAYER.speed * 0.42 - comet.tilt) * Math.min(1, dt * 9);

    // Home line: a gentle spring back, so a mouse left alone does not strand the comet low.
    if (steerY === 0) comet.y += (HOME_Y - comet.y) * Math.min(1, dt * 1.5);
    comet.y = Math.max(HOME_Y - STEER_Y, Math.min(HOME_Y + STEER_Y, comet.y));

    // The corridor's pressure: past its wall the comet is shoved home and the glow bleeds.
    const centre = corridorCentre(state.depth);
    const half = corridorHalfWidth(state.depth);
    const offset = comet.x - centre;
    const room = half - comet.radius;
    if (Math.abs(offset) > room) {
      const side = Math.sign(offset);
      comet.x = centre + side * room;
      comet.vx *= -0.18;
      if (!idle) {
        state.glow -= WALL.drain_per_second * dt;
        events |= EVENT_WALL;
        if (state.hitsWall === 0) state.hitsWall = 1;
        // A wall scrape breaks the chain, but not to nothing: it halves it.
        state.chain = Math.floor(state.chain / 2);
      }
    }

    spawnAhead(idle ? 0 : dt);

    // Every item climbs the screen as the comet falls.
    const reachX = comet.radius;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (!item.active) continue;
      const y = screenY(item.at, state.depth);
      if (y < -70) {
        if (item.kind === KIND_STONE || item.kind === KIND_SHARD) state.rocksPassed += 1;
        items.splice(index, 1);
        continue;
      }
      if (idle) continue;
      const dy = y - comet.y;
      if (dy > 46 || dy < -46) continue;
      const dx = item.x - comet.x;
      const near = item.r + reachX;
      if (dx * dx + dy * dy > near * near) continue;

      if (item.kind === KIND_MOTE || item.kind === KIND_STAR) {
        item.active = false;
        items.splice(index, 1);
        if (item.kind === KIND_STAR) {
          state.starsTaken += 1;
          state.glow = Math.min(GLOW.max, state.glow + GLOW.star);
          state.chain += 3;
          state.score += SCORE.star * multiplier();
          events |= EVENT_STAR;
        } else {
          state.motesTaken += 1;
          state.glow = Math.min(GLOW.max, state.glow + GLOW.mote);
          state.chain += 1;
          state.score += SCORE.mote * multiplier();
          events |= EVENT_MOTE;
        }
      } else {
        // Rock: the glow is torn away, the chain breaks, and the comet is knocked aside.
        state.glow -= 18;
        state.chain = 0;
        comet.vx += (comet.x >= item.x ? 1 : -1) * 190;
        comet.vy -= 90;
        item.active = false;
        items.splice(index, 1);
        events |= EVENT_HIT;
      }
    }

    if (!idle) {
      // The glow drains faster as the descent speeds up, and the depth itself pays score.
      state.glow -= glowDrainAt(state.depth) * dt;
      state.score += state.speed * dt * SCORE.per_metre * multiplier();

      // A new stratum: named on screen, and a little light back in the tank.
      if (stratumEdge !== null && state.depth >= stratumEdge) {
        state.stratum = stratumIndexAt(state.depth);
        state.stratumBanner = 2.4;
        state.glow = Math.min(GLOW.max, state.glow + GLOW.stratum_refill);
        state.score += SCORE.stratum;
        events |= EVENT_STRATUM;
        stratumEdge = nextStratumAt(state.depth);
      }
      if (state.stratumBanner > 0) state.stratumBanner = Math.max(0, state.stratumBanner - dt);

      if (state.depth >= GOAL_DEPTH_M) {
        state.glow = Math.max(state.glow, 0);
        events |= EVENT_WIN;
      } else if (state.glow <= 0) {
        state.glow = 0;
        comet.alive = false;
        events |= EVENT_OVER;
      }
    }

    return events;
  }

  return {
    state,
    comet,
    items,
    step,
    reset,
    multiplier,
    corridor: () => ({ centre: corridorCentre(state.depth), half: corridorHalfWidth(state.depth) }),
  };
}

export { HOME_Y, STEER_Y, depthOf };
