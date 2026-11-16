// Boot and the one loop. Input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, over and win.
//
// The world itself is not here: it is Rust, compiled to game/core.wasm, and this file is what
// drives it. Boot loads the module, reads the gains the tuning harness chose out of gains.json,
// and hands the page a world with the same surface the script version had — so the renderer, the
// HUD, the scenes and the sound did not change when the rules moved to Rust.
//
// ?seed=N fixes the descent's layout. ?shot=start|play|stratum|win|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot; src/shots.js says what each scene is.
import { GLOW, STEP, MAX_FRAME, VIEW } from './config.js';
import { EVENT_HIT, EVENT_MOTE, EVENT_OVER, EVENT_STAR, EVENT_STRATUM, EVENT_WALL, EVENT_WIN } from './world.js';
import { createWorld, loadCore } from './core.js';
import { ACTION_BACK, ACTION_CONFIRM, ACTION_MUTE, createInput } from './input.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

const BEST_KEY = 'lumenfall.best.v1';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
// The seed is where the game's randomness comes from, and it is chosen here and nowhere else: a
// visit with no ?seed gets a new world, and the same ?seed always replays the same one. Everything
// downstream — layout, drift, the pilot's own scenes — is a function of it, which is why nothing
// else in the page is allowed to call Math.random.
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const boot = document.getElementById('boot');
if (boot) boot.remove();
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();

/**
 * The gains the build is played with, in the order the core publishes them. The file is written
 * by the tuning harness (`cargo run --release --bin tune -- loop 50`), so the build a player gets
 * is the build that measured best — there is no step where a number is typed in by hand.
 *
 * A name crosses the boundary as bytes and is compared inside the call, so the page never has to
 * hold a pointer into the module's memory: a boot is the one moment its heap is still settling,
 * and a table read from there can hand back zeros. A knob the file does not name keeps the value
 * the core was compiled with, which is the last build that shipped.
 */
async function loadGains(core) {
  try {
    const response = await fetch('./gains.json');
    if (!response.ok) return null;
    const table = await response.json();
    const count = core.gains_count();
    const values = new Float32Array(count);
    for (let index = 0; index < count; index += 1) values[index] = core.gains_get(index);
    const encoder = new TextEncoder();
    for (const [name, value] of Object.entries(table)) {
      if (!Number.isFinite(value)) continue;
      const bytes = encoder.encode(name);
      // A fresh copy per call, written into the module's memory for the length of the call.
      const ptr = core.bytes_alloc(bytes.length);
      new Uint8Array(core.memory.buffer, ptr, bytes.length).set(bytes);
      const index = core.gains_index_of(ptr, bytes.length);
      core.bytes_free(ptr, bytes.length);
      if (index < count) values[index] = value;
    }
    return values;
  } catch {
    // No gains file: the core plays with the numbers it was compiled with, which are the ones
    // the game shipped with. A missing file is a fallback, not a failure.
    return null;
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

/**
 * A read-only hook for automated play-testing: the state a test needs to steer, and nothing that
 * changes the game. It never moves the comet; it only says where it is.
 */
function exposeHook(world) {
  window.__lumenfall = {
    state: world.state,
    screen: SCREEN_TITLE,
    seed,
    cometX: () => world.comet.x,
    cometY: () => world.comet.y,
    items: () => world.items.map((item) => ({ kind: item.kind, x: item.x, at: item.at, sy: VIEW.height - world.screenY(item.at) })),
    corridor: () => world.corridor(),
    outcome: () => world.outcome(),
    // The rules this build is played by, as the core reports them: what a test or a curious
    // player reads to see the tuning that shipped.
    gains: () => world.readGains(),
  };
}

function runShot(name, world) {
  const scene = stageShot(name, world);
  renderer.seedTrail(world);
  let painted = 0;
  function paint() {
    renderer.setAlive(scene.screen !== SCREEN_OVER);
    renderer.frame(world, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  window.__lumenfall.screen = scene.screen;
  window.__lumenfall.ok = scene.ok !== false;
  requestAnimationFrame(paint);
}

function runGame(world) {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let overTimer = 0;

  /** Screen readers, and anyone watching the page's text, hear the screen changes. */
  function announce(message) {
    status.textContent = message;
  }

  function setScreen(next) {
    screen = next;
    window.__lumenfall.screen = next;
  }

  function startRun() {
    world.reset();
    renderer.clearTrail();
    renderer.setAlive(true);
    accumulator = 0;
    overTimer = 0;
    audio.unlock();
    audio.play('start');
    setScreen(SCREEN_PLAY);
    announce(`Descending. Glow ${GLOW.start} percent. The core is 4,000 metres down.`);
  }

  function toTitle() {
    input.releasePointer();
    world.reset();
    renderer.clearTrail();
    renderer.setAlive(true);
    setScreen(SCREEN_TITLE);
    announce('Lumenfall. Press Space or click to descend.');
  }

  function endRun(won) {
    input.releasePointer();
    renderer.setAlive(won);
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    setScreen(won ? SCREEN_WIN : SCREEN_OVER);
    audio.play(won ? 'win' : 'over');
    overTimer = won ? 1.1 : 0.8;
    announce(won
      ? `You reached the core. Final score ${Math.round(world.state.score)}.`
      : `Your light went out at ${Math.round(world.state.depth)} metres. Score ${Math.round(world.state.score)}.`);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_BACK) {
      if (screen === SCREEN_PLAY) {
        setScreen(SCREEN_PAUSED);
        input.releasePointer();
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        setScreen(SCREEN_PLAY);
        announce('Descending.');
      } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
        if (overTimer <= 0) toTitle();
      }
      return;
    }
    if (!(actions & ACTION_CONFIRM)) return;
    if (screen === SCREEN_TITLE) startRun();
    else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      // A moment's guard, so the keystroke that ended the run does not skip its screen.
      if (overTimer <= 0) startRun();
    } else if (screen === SCREEN_PAUSED) {
      setScreen(SCREEN_PLAY);
      announce('Descending.');
    }
  }

  /** One fixed step of play, with the world's events turned into sound and announcements. */
  function step() {
    const steer = input.steer();
    const events = world.step(STEP, steer, false);
    renderer.react(events, world);
    if (events & EVENT_MOTE) audio.play('mote');
    if (events & EVENT_STAR) audio.play('star');
    if (events & EVENT_HIT) {
      audio.play('hit');
      announce(`Rock. Glow ${Math.max(0, Math.ceil(world.state.glow))} percent.`);
    }
    if (events & EVENT_WALL) audio.play('wall');
    if (events & EVENT_STRATUM) {
      audio.play('stratum');
      announce(`${STRATUM_NAMES[world.state.stratum] ?? 'A new'} stratum entered.`);
    }
    if (events & EVENT_OVER) endRun(false);
    else if (events & EVENT_WIN) endRun(true);
    audio.context(world.state.stratum, world.state.chain);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions(input.takeActions());
    if (overTimer > 0) overTimer = Math.max(0, overTimer - Math.min(0.05, (now - last) / 1000 + 0.016));

    if (screen === SCREEN_TITLE) {
      // The title's world keeps falling behind the wordmark, so the screen is alive.
      while (accumulator >= STEP) {
        world.step(STEP, { x: 0, y: 0 }, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }

    if (screen === SCREEN_TITLE) renderer.step(1 / 60, world);
    else if (screen !== SCREEN_PAUSED) renderer.step(1 / 60, world);
    renderer.frame(world, screen, best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      setScreen(SCREEN_PAUSED);
      input.releasePointer();
      announce('Paused.');
    }
  });

  announce('Lumenfall. Press Space or click to descend.');
  requestAnimationFrame(frame);
}



const STRATUM_NAMES = ['Azure Veil', 'Ember Waste', 'Verdant Hush', 'Violet Reach', 'Gilded Core'];

/** Boot: the core, then the build's gains, then the world the loop drives. */
async function boot2() {
  let core;
  try {
    core = await loadCore('./core.wasm');
  } catch (error) {
    announce('Lumenfall could not start its simulation core. Serve the folder (node serve.ts) rather than opening the file directly.');
    status.textContent = String(error?.message ?? error);
    document.body.dataset.bootFailed = 'core';
    return;
  }
  const gains = await loadGains(core);
  const built = createWorld(core, seed, gains);
  console.info(`LUMENFALL: playing ${gains === null ? 'the compiled build' : 'the tuned build'} (corridor ${core.gains_get(14).toFixed(1)} px, speed ${core.gains_get(16).toFixed(0)} px/s)`);
  const world = built.world;
  // A world of the same shape the script version returned: shots, renderer and hook all read it.
  world.readGains = built.readGains;
  exposeHook(world);
  window.__lumenfall.core = core;
  window.__lumenfall.abi = 1;
  if (shot) runShot(shot, world);
  else runGame(world);
}

function announce(message) {
  status.textContent = message;
}

boot2();
