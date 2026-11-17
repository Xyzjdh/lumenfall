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
import {
  BIOME_NAMES,
  EVENT_GRAZE,
  EVENT_GUARDIAN,
  EVENT_GUARDIAN_END,
  EVENT_GUARDIAN_START,
  EVENT_HIT,
  EVENT_MILESTONE,
  EVENT_MOTE,
  EVENT_OVER,
  EVENT_PICKUP,
  EVENT_RATING,
  EVENT_STAR,
  EVENT_STRATUM,
  EVENT_WALL,
  EVENT_WEATHER,
  EVENT_WIN,
} from './world.js';
import { createWorld, loadCore } from './core.js';
import {
  ACTION_BACK,
  ACTION_CONFIRM,
  ACTION_CYCLE_BIOME,
  ACTION_DAILY,
  ACTION_MUTE,
  ACTION_SHOP,
  ACTION_UP,
  ACTION_DOWN,
  createInput,
} from './input.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_SHOP, SCREEN_TITLE, SCREEN_WIN, createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';
import { openSave } from './save.js';
import { ACHIEVEMENTS, bookProgress, summarise } from './records.js';
import { createShop } from './shop.js';

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

// The record book, the shard ledger and the upgrade sheet all live in save.js; this file only
// reads and writes them. `best` is the score the HUD compares against.
function readBest(save) {
  return Math.round(save.save.best.score ?? 0);
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
    // The staged-scene hook: a scene that wants a world already in motion steps the core itself
    // and then asks the page to read the new state back into the objects the renderer draws.
    sync: () => world.sync?.(),
  };
}

function runShot(name, world, save) {
  // A staged scene still shows the save's own lines on the title: the scene is a frame of the
  // real game, and the title of the real game says what the player has.
  if (save && window.__lumenfall.core) {
    const today = window.__lumenfall.core.day_of_epoch(BigInt(Math.floor(Date.now() / 1000))) >>> 0;
    renderer.setTitleInfo({
      biome: () => BIOME_NAMES[world.state.biome] ?? 'Quiet',
      blurb: () => world.biomeBlurb(),
      shards: () => save.save.shards,
      books: () => bookProgress(save.save.achievements),
      daily: () => ({ day: today, best: save.dailyScore(today), played: save.save.lastDaily === today }),
      records: () => save.save.best,
    });
  }
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

function runGame(world, save, built) {
  const input = createInput(canvas);
  const shop = createShop(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest(save);
  let accumulator = 0;
  let last = performance.now();
  let overTimer = 0;
  /** Which biome the next run is played in, chosen on the title with B. */
  let biome = 0;
  /** Whether the run being played is the daily. */
  let daily = false;
  /** Today, in the game's own calendar: the day the daily is keyed to. */
  let today = 0;

  /** Screen readers, and anyone watching the page's text, hear the screen changes. */
  function announce(message) {
    status.textContent = message;
  }

  function setScreen(next) {
    screen = next;
    window.__lumenfall.screen = next;
  }

  function startRun(options = {}) {
    // The shop's upgrades and the chosen biome are rules, so they are given to the core before
    // the world is reset: the descent starts from the sheet the player bought.
    const seedFor = options.daily ? window.__lumenfall.core.daily_seed_of(today) : seed;
    world.start({ seed: seedFor >>> 0, biome: options.daily ? 0 : biome });
    world.reset();
    renderer.clearTrail();
    renderer.setAlive(true);
    accumulator = 0;
    overTimer = 0;
    daily = options.daily === true;
    audio.unlock();
    audio.play('start');
    setScreen(SCREEN_PLAY);
    const where = BIOME_NAMES[world.state.biome] ?? 'Quiet';
    announce(options.daily
      ? `Today's descent. Biome ${where}. The core is 4,000 metres down.`
      : `Descending. Glow ${Math.ceil(world.state.glow)} percent. ${where} biome. The core is 4,000 metres down.`);
  }

  /** The shop, opened between runs: it never changes a run already being played. */
  function openShop() {
    shop.open({ catalogue: () => built.shop(), saveRef: save, purchase: (index, shards) => built.buy(index, shards) });
    setScreen(SCREEN_SHOP);
    announce(`Supply. ${save.save.shards} shards.`);
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
    const state = world.state;
    const run = {
      score: state.score,
      depth: state.depth,
      won,
      biome: state.biome,
      bestChain: state.bestChain,
      bestClean: state.bestClean,
      grazes: state.grazes,
      pickups: state.pickups,
      rockHits: state.rockHits,
      shieldsSpent: state.shieldsSpent ?? 0,
      guardianBeaten: state.guardian === 2,
      time: state.time,
      daily,
    };
    // The book is compared before it is written, so the end screen's records are honest.
    const before = { ...save.save.best };
    const broken = save.record(run);
    const shards = save.pay({ motes: state.motesTaken + state.starsTaken, depth: state.depth, won, grazes: state.grazes, chain: state.bestChain, pickups: state.pickups });
    const earned = save.award(save.achievementsFor(run));
    if (daily) save.dailyRecord(today, state.score);
    save.commit();
    best = readBest(save);
    renderer.setRunEnd({ run, broken, shards, earned, rows: summarise(run, before), daily });
    setScreen(won ? SCREEN_WIN : SCREEN_OVER);
    audio.play(won ? 'win' : 'over');
    overTimer = won ? 1.1 : 0.8;
    announce(won
      ? `You reached the core. Final score ${Math.round(state.score)}. ${shards} shards.`
      : `Your light went out at ${Math.round(state.depth)} metres. Score ${Math.round(state.score)}. ${shards} shards.`);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      save.save.muted = muted;
      save.commit();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CYCLE_BIOME) {
      if (screen === SCREEN_TITLE) {
        biome = (biome + 1) % BIOME_NAMES.length;
        world.start({ seed, biome });
        world.reset();
        renderer.clearTrail();
        announce(`Biome: ${BIOME_NAMES[biome]}. ${world.biomeBlurb()}`);
      }
    }
    if (actions & ACTION_SHOP) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
        if (screen === SCREEN_TITLE || overTimer <= 0) openShop();
      }
    }
    if (actions & ACTION_DAILY) {
      if (screen === SCREEN_TITLE || ((screen === SCREEN_OVER || screen === SCREEN_WIN) && overTimer <= 0)) {
        startRun({ daily: true });
      }
    }
    if (screen === SCREEN_SHOP) {
      // The shop takes the arrows, so they cannot steer anything while it is up.
      if (actions & ACTION_UP) shop.move(-1);
      if (actions & ACTION_DOWN) shop.move(1);
      if (actions & ACTION_CONFIRM) {
        const result = shop.confirm();
        if (result.bought) {
          audio.play('pickup');
          announce(`Bought ${result.entry.name}. ${save.save.shards} shards left.`);
        }
      }
      if (actions & ACTION_BACK) {
        setScreen(SCREEN_TITLE);
        world.start({ seed, biome });
        world.reset();
        renderer.clearTrail();
        announce('Lumenfall. Press Space or click to descend.');
      }
      return;
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
    if (events & EVENT_PICKUP) {
      audio.play('pickup');
      announce(`${world.state.pickups} pickup${world.state.pickups === 1 ? '' : 's'} this run.`);
    }
    if (events & EVENT_GRAZE) {
      audio.play('graze');
      renderer.banner('CLOSE', 'rgba(255,240,210,0.9)');
    }
    if (events & EVENT_WEATHER) {
      audio.play('weather');
      audio.setWeather(world.state.weather);
      renderer.banner(`WIND TURNS — ${world.weatherName().toUpperCase()}`);
      announce(`The weather turns: ${world.weatherName()}.`);
    }
    if (events & EVENT_RATING) {
      audio.play('rating');
      const word = world.ratingWord();
      if (world.state.rating >= 2) renderer.banner(word, 'rgba(255,224,122,0.95)');
    }
    if (events & EVENT_MILESTONE) {
      audio.play('milestone');
      renderer.banner(`${Math.round(world.state.milestone)} METRES`, 'rgba(226,246,255,0.92)');
    }
    if (events & EVENT_GUARDIAN_START) {
      audio.play('guardianStart');
      renderer.banner('THE GUARDIAN WAKES', '#ff9d9d');
      announce('The guardian wakes. The arena closes in.');
    }
    if (events & EVENT_GUARDIAN) {
      audio.play('guardian');
      renderer.banner(world.guardianAttack(), '#ffb9b9');
    }
    if (events & EVENT_GUARDIAN_END) {
      audio.play('guardianEnd');
      renderer.banner('THE GUARDIAN LETS GO', '#a8ffb0');
      announce('The guardian is outlasted. The core is close.');
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

    if (screen === SCREEN_SHOP) {
      shop.tick(Math.min(0.05, (now - last) / 1000 + 0.016));
      world.step(STEP, { x: 0, y: 0 }, true);
      accumulator = 0;
    } else if (screen === SCREEN_TITLE) {
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
    if (screen === SCREEN_SHOP) {
      const { INK, INK_DIM, INK_FAINT, panel, alpha } = renderer.ink;
      const palette = renderer.paletteAt(world.state.depth);
      shop.draw(palette, INK, INK_DIM, INK_FAINT, panel, alpha);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      setScreen(SCREEN_PAUSED);
      input.releasePointer();
      announce('Paused.');
    }
  });

  // The day the daily is keyed to: the page's clock, through the core's own calendar.
  // An i64 crosses the boundary as a BigInt, which is the only way a wasm module takes one.
  today = window.__lumenfall.core.day_of_epoch(BigInt(Math.floor(Date.now() / 1000))) >>> 0;
  renderer.setTitleInfo({
    biome: () => BIOME_NAMES[biome],
    blurb: () => world.biomeBlurb(),
    shards: () => save.save.shards,
    books: () => bookProgress(save.save.achievements),
    daily: () => ({ day: today, best: save.dailyScore(today), played: save.save.lastDaily === today }),
    records: () => save.save.best,
  });
  if (save.save.muted) audio.toggleMute();
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
  const save = openSave();
  const built = createWorld(core, seed, gains);
  // The upgrade sheet the player has bought, handed to the core before the first run is played:
  // the shop's levels are rules, and a world made without them would be a different game.
  built.applyUpgrades(save.levels());
  console.info(`LUMENFALL: playing ${gains === null ? 'the compiled build' : 'the tuned build'} (corridor ${core.gains_get(14).toFixed(1)} px, speed ${core.gains_get(16).toFixed(0)} px/s)`);
  const world = built.world;
  // A world of the same shape the script version returned: shots, renderer and hook all read it.
  world.readGains = built.readGains;
  world.sync = built.sync;
  exposeHook(world);
  window.__lumenfall.core = core;
  window.__lumenfall.abi = 1;
  if (shot) runShot(shot, world, save);
  else runGame(world, save, built);
}

function announce(message) {
  status.textContent = message;
}

boot2();
