// The bridge to the Rust core.
//
// The rules of LUMENFALL — the corridor, the comet, the glow, the spawn clocks, the collisions —
// are not in this file and not in any other .js file: they are compiled from the Rust in
// lumenfall-core/ to game/core.wasm, and this is the only place the page talks to it.
//
// The shape of the interface is deliberate:
//   * no wasm-bindgen, no package to install, no glue to regenerate — the module exports plain
//     numbers, and `WebAssembly.instantiateStreaming` is the whole loader;
//   * `createWorld` returns the SAME surface the script version had (state, comet, items, step,
//     reset, corridor), so the renderer, the HUD, the shots and the audio did not change when the
//     rules moved: the renderer draws the same objects it always drew, only now they come out of
//     a shared memory buffer the module fills.
//
// A world is a pure function of its seed and the steering fed to it, which is what lets a
// screenshot be staged and what lets `cargo run --bin tune` play ten thousand runs offline.

/**
 * The names of the knobs, in the order the core publishes them. The page keeps this list only so
 * it can ask about each by name; a name it does not list is a gain it cannot show, never one it
 * silently plays wrong, because the playing side reads the keys out of gains.json instead.
 */
import { KIND_CODES } from './world.js';

const GAIN_NAMES = [
  'glow_start', 'glow_drain_base', 'glow_drain_per_mps', 'glow_mote', 'glow_star',
  'glow_stratum_refill', 'mote_gap_start', 'mote_gap_end', 'rock_gap_start', 'rock_gap_end',
  'star_chance', 'shard_chance', 'wall_drain', 'rock_drain', 'corridor_base', 'corridor_breathe',
  'player_speed', 'speed_start', 'speed_end', 'chain_step',
];

/** One world's worth of interface: everything the page is allowed to ask. */
export function createWorld(core, seed, gains = null) {
  // The item table. `items_fill` writes ITEM_WORDS floats an item into the module's memory and
  // `items_ptr` says where; this array is a live view over that block, so reading an item costs
  // nothing beyond the call that refreshed it.
  const stride = core.items_stride();
  let table = null;
  let tableLength = 0;

  /** A plain object shaped the way game/src/world.js's state was, for the HUD and the renderer. */
  const state = {
    depth: 0,
    speed: 0,
    glow: 0,
    score: 0,
    best: 0,
    chain: 0,
    motesTaken: 0,
    starsTaken: 0,
    hitsWall: 0,
    rocksPassed: 0,
    rockHits: 0,
    stratum: 0,
    stratumBanner: 0,
    time: 0,
    // --- the systems: biomes, weather, powers, the guardian and the combo
    biome: 0,
    weather: 0,
    rating: 0,
    clean: 0,
    bestClean: 0,
    bestChain: 0,
    shields: 0,
    slow: 0,
    lure: 0,
    double: 0,
    grazes: 0,
    pickups: 0,
    milestone: 0,
    guardian: 0,
    guardianHealth: 1,
    // The tank's ceiling: 100 plus whatever the Lantern has bought, so a gauge reads full
    // when it is full rather than over 100 %.
    maxGlow: 100,
  };

  const comet = { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, radius: 11, alive: true };

  const KINDS = KIND_CODES;
  let items = [];
  /** The events the last step raised, for anything that reads state after the fact. */
  let lastEvents = 0;

  /** Pulls the state, the comet and the item table out of the module into the script's shapes. */
  function sync() {
    state.depth = core.depth();
    state.speed = core.speed();
    state.glow = core.glow();
    state.score = core.score();
    state.chain = core.chain();
    state.motesTaken = core.motes_taken();
    state.starsTaken = core.stars_taken();
    state.hitsWall = core.wall_hits();
    state.rockHits = core.rock_hits();
    state.stratum = core.stratum();
    state.stratumBanner = core.stratum_banner();
    state.time = core.run_time();

    comet.x = core.comet_x();
    comet.y = core.comet_y();
    comet.tilt = core.comet_tilt();
    comet.alive = core.outcome() !== 2;

    // The v2 readouts. Each is a plain number from the module; the object above is the only
    // shape the rest of the page knows, so everything new lands here rather than in a new hook.
    state.biome = core.biome_id();
    state.weather = core.weather_code();
    state.rating = core.combo_rating();
    state.clean = core.combo_clean();
    state.bestClean = core.best_clean();
    state.bestChain = core.best_chain_key();
    state.shields = core.shields_held();
    state.slow = core.slow_left();
    state.lure = core.lure_left();
    state.double = core.double_left();
    state.grazes = core.grazes();
    state.pickups = core.pickups_taken();
    state.milestone = core.milestone();
    state.guardian = core.guardian_phase();
    state.guardianHealth = core.guardian_health();
    state.maxGlow = core.max_glow_now();

    tableLength = core.items_fill();
    if (table === null || table.length !== tableLength * stride) {
      table = new Float32Array(core.memory.buffer, core.items_ptr(), tableLength * stride);
    }
    // The module's memory is backed by one ArrayBuffer, and a refresh can only grow it; if it was
    // grown the old view is detached, so the view is taken again above. The item objects are
    // rebuilt each sync, which is a handful of small allocations a frame and nothing beside the
    // drawing that follows.
    items = new Array(tableLength);
    for (let row = 0; row < tableLength; row += 1) {
      const at = row * stride;
      items[row] = {
        kind: KINDS[table[at]] ?? 'mote',
        x: table[at + 1],
        at: table[at + 2],
        r: table[at + 3],
        drawR: table[at + 4],
        rot: table[at + 5],
        spin: table[at + 6],
        wobble: table[at + 7],
        phase: table[at + 8],
        active: true,
      };
    }
  }

  /** The world as the renderer wants to see it: the same object graph as before the port. */
  const world = {
    state,
    comet,
    get items() {
      return items;
    },
    step(dt, steer, idle = false) {
      const events = core.world_step(
        dt,
        Number.isFinite(steer?.x) ? steer.x : 0,
        Number.isFinite(steer?.y) ? steer.y : 0,
        idle ? 1 : 0,
      );
      lastEvents = events;
      sync();
      return events;
    },
    reset() {
      core.world_new(seed);
      sync();
    },
    reseed(nextSeed) {
      core.world_reseed(nextSeed);
      sync();
    },
    multiplier() {
      return core.multiplier();
    },
    corridor() {
      return { centre: core.corridor_centre_now(), half: core.corridor_half_now() };
    },
    /** The pilot: the same look-ahead the offline harness flies with. */
    pilot(bias = 0, horizon = 1.9, urgent = false) {
      return core.pilot_steer(bias, horizon, urgent ? 1 : 0);
    },
    pilotAway(bias = 0) {
      return core.pilot_steer_away(bias);
    },
    /** Start a new world with a biome and the upgrades held: the shop and the daily. */
    start({ seed: nextSeed = seed, biome = 0 } = {}) {
      core.world_new_full(nextSeed >>> 0, biome >>> 0);
      sync();
    },
    /** A word for the weather, freshly read: the core keeps it. */
    weatherName() {
      return readString(core.weather_name);
    },
    /** The combo's judgement, as a word. */
    ratingWord() {
      return readString(core.combo_word);
    },
    /** What the guardian is doing this moment. */
    guardianAttack() {
      return readString(core.guardian_attack_name);
    },
    /** The biome's name and one-line description. */
    biomeName() {
      return readString(() => core.biome_name(state.biome));
    },
    biomeBlurb() {
      return readString(() => core.biome_blurb(state.biome));
    },
    /** Why the run ended: 0 still going, 1 the core reached, 2 the glow spent. */
    outcome() {
      return core.outcome();
    },
    screenY(itemDepth) {
      return core.screen_y_of(itemDepth);
    },
    /** The corridor at a depth: `half` asks for the half-width, otherwise the middle. */
    corridorAt(depth, half = false) {
      return half ? core.corridor_half_at(depth) : core.corridor_centre_at(depth);
    },
  };

  /**
   * Reads a string the core wrote into its own scratch. The call returns the length; the bytes
   * start at the same block the gain names are written to, so there is one scratch and one rule:
   * a string is valid until the next call.
   */
  function readString(write) {
    const len = write();
    if (!len) return '';
    const ptr = core.bytes_alloc(len);
    return new TextDecoder().decode(new Uint8Array(core.memory.buffer, ptr, len));
  }

  /**
   * The gains the world is played with, read back for the console and for a curious player. The
   * names come from the same bytes-in, answer-out call the loader uses, so there is one way to
   * ask the module what it is playing: hand it a name and hear back whether it knows it.
   */
  function readGains() {
    const count = core.gains_count();
    const out = {};
    const encoder = new TextEncoder();
    for (const probe of GAIN_NAMES) {
      const bytes = encoder.encode(probe);
      const ptr = core.bytes_alloc(bytes.length);
      new Uint8Array(core.memory.buffer, ptr, bytes.length).set(bytes);
      const index = core.gains_index_of(ptr, bytes.length);
      if (index < count) out[probe] = core.gains_get(index);
    }
    return out;
  }

  /**
   * Plays the world with a set of gains, in the order the module publishes them: the array is
   * written into a block the module hands over and read once, so the whole tuning table crosses
   * the boundary as floats and not as an object.
   */
  function applyGains(values) {
    if (!values || values.length === 0) return 0;
    const count = Math.min(values.length, core.gains_count());
    const ptr = core.gains_block(count);
    new Float32Array(core.memory.buffer, ptr, count).set(values.subarray ? values.subarray(0, count) : values.slice(0, count));
    return core.gains_set_all(ptr, count);
  }

  // The gains go in first and the world second: `world_new` starts a descent with the gains the
  // module currently holds, so a world made before its gains would keep the ones it was born with.
  if (gains !== null) applyGains(gains);
  core.world_new(seed >>> 0);
  sync();

  /**
   * Hands the core the sheet the player has bought, one byte per level, before the first world
   * is made. The core owns the rules, the save owns the ledger, and this is the one place the
   * ledger becomes a rule.
   */
  function applyUpgrades(levels) {
    if (!Array.isArray(levels) || levels.length === 0) return 0;
    const bytes = new Uint8Array(levels.length);
    for (let index = 0; index < levels.length; index += 1) {
      bytes[index] = Math.max(0, Math.min(255, Math.floor(Number(levels[index]) || 0)));
    }
    const ptr = core.bytes_alloc(bytes.length);
    new Uint8Array(core.memory.buffer, ptr, bytes.length).set(bytes);
    return core.upgrades_set_block(ptr, bytes.length) >>> 0;
  }

  /** The shop, as data: every upgrade, with its name, cost, level and cap. */
  function shop() {
    const out = [];
    const count = core.upgrades_count();
    for (let index = 0; index < count; index += 1) {
      out.push({
        index,
        name: readString(() => core.upgrade_name(index)),
        blurb: readString(() => core.upgrade_blurb(index)),
        cost: core.upgrade_cost(index),
        level: core.upgrade_level(index),
        max: core.upgrade_max(index),
      });
    }
    return out;
  }

  /**
   * Buys one level with the shards the page holds. The page passes what it has and the core
   * answers with what it charged — 0 for a refusal — so the ledger is never decremented on a
   * promise. `world_buy` restarts the descent only if the shop is opened between runs, so a
   * purchase mid-run cannot change the run the player is already playing.
   */
  function buy(index, shards) {
    return core.upgrade_buy(index, shards) >>> 0;
  }

  return { world, state, comet, readGains, applyGains, sync, shop, buy, readString, applyUpgrades };
}

/**
 * Loads the module beside this file. Everything the page does is asked for here first, so a
 * missing or mismatched core fails loudly at boot rather than quietly later.
 */
export async function loadCore(url = './core.wasm') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`LUMENFALL's core did not load: ${url} answered ${response.status}`);
  // Streaming compile is the fast path, and it is strict: a host that serves .wasm as anything
  // but application/wasm makes it throw. The fallback compiles the same bytes from an ArrayBuffer,
  // which every host can do, so the game boots wherever the file can be fetched.
  let instance;
  try {
    ({ instance } = await WebAssembly.instantiateStreaming(response.clone(), {}));
  } catch {
    ({ instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {}));
  }
  const core = instance.exports;
  const version = core.abi_version();
  if (version !== 1) throw new Error(`LUMENFALL's core speaks version ${version}; this page speaks 1`);
  return core;
}
