// The screenshot scenes behind ?shot=start|play|stratum|win|end (&seed=N). Each one plays the
// real rules forward from a fresh world, steered by the same look-ahead pilot the offline tuning
// uses, so the frame a screenshot catches is a frame the game really reaches: the same seed
// always stages the same one.
//
//   start    the title screen over a live descent, a few seconds in
//   play     a run in progress, deep enough to have earned a chain, with the HUD live
//   stratum  the moment a new stratum is announced, deep in the world
//   win      the core reached, with the run's ledger
//   end      the glow run out, with the score and restart screen

import { GOAL_DEPTH_M, PIXELS_PER_METRE, STEP, VIEW } from './config.js';
import { EVENT_OVER, EVENT_STRATUM, EVENT_WIN, KIND_MOTE, KIND_STAR, screenY } from './world.js';

/**
 * Light in the upper part of the frame. A screenshot of a run should show the thing the run is
 * about, so the scenes look for a moment where the descent's own light is on screen ahead.
 */
function lightOnScreen(world) {
  const { state, items } = world;
  let count = 0;
  for (const item of items) {
    if (item.kind !== KIND_MOTE && item.kind !== KIND_STAR) continue;
    const y = screenY(item.at, state.depth);
    if (y > VIEW.height * 0.42 && y < VIEW.height - 40) count += 1;
  }
  return count;
}

/** Rock on screen, for a scene that wants a threat in frame without it being on the comet. */
function rockOnScreen(world) {
  const { state, items } = world;
  let count = 0;
  for (const item of items) {
    if (item.kind === KIND_MOTE || item.kind === KIND_STAR) continue;
    const y = screenY(item.at, state.depth);
    if (y > VIEW.height * 0.2 && y < VIEW.height - 30) count += 1;
  }
  return count;
}
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { pilotDirection } from './pilot.js';

/** Play `seconds` of the real rules with the pilot steering; stop early on death or the core. */
function fly(world, seconds, { untilStratum = null, win = false } = {}) {
  const { state } = world;
  const steps = Math.round(seconds / STEP);
  let bias = 0;
  for (let index = 0; index < steps; index += 1) {
    bias = pilotDirection(world, bias, undefined, { urgentClearance: true });
    const events = world.step(STEP, { x: bias, y: 0 }, false);
    if (events & EVENT_OVER) return { over: true, won: false };
    if (win && (events & EVENT_WIN)) return { over: true, won: true };
    if (untilStratum !== null && (events & EVENT_STRATUM) && state.stratum >= untilStratum) {
      return { over: false, won: false };
    }
  }
  return { over: false, won: false };
}

/**
 * Set `world` to the named scene and hand back the screen to draw over it and the best score to
 * show. Any other name stages the title.
 */
export function stageShot(name, world) {
  const { state } = world;
  world.reset();

  if (name === 'play') {
    // Fly on until the frame has light ahead and some rock in it, so the shot shows the run.
    fly(world, 18);
    const limit = Math.round(22 / STEP);
    for (let index = 0; index < limit; index += 1) {
      if (lightOnScreen(world) >= 3) break;
      const direction = pilotDirection(world, 0, undefined, { urgentClearance: true });
      const events = world.step(STEP, { x: direction, y: 0 }, false);
      if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: state.score, ok: false };
      if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: state.score, ok: false };
    }
    const ok = lightOnScreen(world) >= 3 && state.glow > 35 && state.depth > 500;
    return { screen: state.glow > 0 ? SCREEN_PLAY : SCREEN_OVER, best: state.score, ok };
  }

  if (name === 'stratum') {
    // Fly until the fourth stratum is announced, then stop inside the banner's first second.
    const result = fly(world, 200, { untilStratum: 3 });
    if (state.glow <= 0) return { screen: SCREEN_OVER, best: state.score, ok: false };
    const ok = state.stratumBanner > 0 && state.stratum >= 3;
    return { screen: SCREEN_PLAY, best: state.score, ok };
  }

  if (name === 'win') {
    // (the shot is the core reached, flown for real)
    // The core is the point of this shot, so the pilot flies the whole run for real and the
    // scene keeps a little glow in reserve for the last metres.
    const result = fly(world, 220, { win: true });
    if (result.won || state.depth >= GOAL_DEPTH_M) return { screen: SCREEN_WIN, best: state.score, ok: true };
    return { screen: SCREEN_OVER, best: state.score, ok: false };
  }

  if (name === 'end') {
    // A hurried player who chases no light: a short look-ahead and rock only to dodge. The glow
    // runs down on its own and the rock takes the rest, which is the ending the game really
    // gives; the limit is only there so a lucky run still stops short of the core.
    fly(world, 22);
    const limit = Math.round(110 / STEP);
    for (let index = 0; index < limit; index += 1) {
      const direction = pilotDirection(world, 0, 0.5, { dodgeOnly: true, repelLight: true });
      const events = world.step(STEP, { x: direction, y: 0 }, false);
      if (events & (EVENT_OVER | EVENT_WIN)) break;
      if (state.depth > GOAL_DEPTH_M * 0.55) break;
    }
    return { screen: state.glow > 0 ? SCREEN_PLAY : SCREEN_OVER, best: state.score, ok: state.glow <= 0 };
  }

  // The title: the world falling behind the wordmark.
  fly(world, 4.5);
  return { screen: SCREEN_TITLE, best: 0, ok: true };
}
