// What the player keeps between visits, and nothing the rules care about.
//
// The core holds the run; this file holds the three things a run cannot: the upgrade sheet that
// changes the next run's rules, the shard ledger the shop is paid from, and the record book. All
// three live in localStorage under one namespace, are read once at boot, and are written only
// when they change — a page that cannot reach storage (a private window, a locked-down embed)
// still plays the game, it just forgets between visits.

const KEY = 'lumenfall.v2.save';
const VERSION = 2;
const MAX_LEVELS = [5, 5, 5, 3, 4, 3, 4];

/** A fresh sheet: nothing bought, nothing earned. */
function fresh() {
  return {
    version: VERSION,
    // One number per upgrade, in the shop's order. These are the levels the core plays with.
    upgrades: [0, 0, 0, 0, 0, 0, 0],
    // The shards held. One shard is one point of light's worth of progress.
    shards: 0,
    // The record book: every kind of record the game keeps, all plain numbers.
    best: { score: 0, depth: 0, chain: 0, clean: 0, grazes: 0, pickups: 0, time: 0 },
    // Runs played, won, and the biome each deepest run happened in.
    runs: 0,
    wins: 0,
    deepestBiome: 0,
    // The achievements earned, by id. A set, written as an array.
    achievements: [],
    // The daily attempts, by day number: the best score per day.
    daily: {},
    // The last daily played, so the title can say whether today's is done.
    lastDaily: 0,
    muted: false,
  };
}

/** Reads the sheet, repairing anything a hand edit or an older build left broken. */
function read() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return fresh();
  }
  if (!raw) return fresh();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fresh();
  }
  const save = fresh();
  if (!parsed || typeof parsed !== 'object') return save;
  if (Array.isArray(parsed.upgrades)) {
    save.upgrades = save.upgrades.map((_, index) => {
      const level = Math.floor(Number(parsed.upgrades[index]) || 0);
      return Math.max(0, Math.min(MAX_LEVELS[index] ?? 0, level));
    });
  }
  save.shards = Math.max(0, Math.floor(Number(parsed.shards) || 0));
  for (const [name, value] of Object.entries(parsed.best ?? {})) {
    if (name in save.best) save.best[name] = Math.max(0, Number(value) || 0);
  }
  save.runs = Math.max(0, Math.floor(Number(parsed.runs) || 0));
  save.wins = Math.max(0, Math.min(save.runs, Math.floor(Number(parsed.wins) || 0)));
  save.deepestBiome = Math.max(0, Math.min(5, Math.floor(Number(parsed.deepestBiome) || 0)));
  if (Array.isArray(parsed.achievements)) {
    save.achievements = parsed.achievements.filter((item) => typeof item === 'string').slice(0, 64);
  }
  if (parsed.daily && typeof parsed.daily === 'object') {
    for (const [day, score] of Object.entries(parsed.daily)) {
      const number = Number(score) || 0;
      if (/^\d+$/.test(day) && number > 0) save.daily[day] = number;
    }
  }
  save.lastDaily = Math.max(0, Math.floor(Number(parsed.lastDaily) || 0));
  save.muted = parsed.muted === true;
  return save;
}

/** Writes the sheet, quietly: a full disk is not a crash. */
function write(save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage refused: the visit keeps its shards in memory and loses them at the door.
  }
}

/**
 * The save, as an object the rest of the page uses. Read the fields directly; call `commit()`
 * once after changing them, and call `earn()` when the other rewards should be counted.
 */
export function openSave() {
  const save = read();

  function commit() {
    write(save);
    return save;
  }

  /** Adds shards for a finished run: what was taken, what was survived, what was gambled. */
  function pay({ motes = 0, depth = 0, won = false, grazes = 0, chain = 0, pickups = 0 }) {
    const earned = Math.round(motes * 0.6 + depth * 0.05 + grazes * 0.8 + chain * 0.4 + pickups * 3 + (won ? 40 : 0));
    save.shards += Math.max(1, earned);
    return Math.max(1, earned);
  }

  /**
   * Records a finished run. Returns the records it broke, so the end screen can name them, and
   * the achievements it earned, so the banner can show them.
   */
  function record(run) {
    const broken = [];
    const check = (name, value, label) => {
      if (value > (save.best[name] ?? 0)) {
        save.best[name] = value;
        broken.push(label);
      }
    };
    check('score', Math.round(run.score), 'SCORE');
    check('depth', Math.round(run.depth), 'DEPTH');
    check('chain', run.bestChain ?? 0, 'CHAIN');
    check('clean', Math.round((run.bestClean ?? 0) * 10) / 10, 'CLEAN');
    check('grazes', run.grazes ?? 0, 'GRAZES');
    check('pickups', run.pickups ?? 0, 'PICKUPS');
    save.runs += 1;
    if (run.won) save.wins += 1;
    if (run.depth >= save.best.depth) save.deepestBiome = run.biome ?? 0;
    commit();
    return broken;
  }

  /** The achievements a run has just met, as ids not yet in the book. */
  function achievementsFor(run) {
    const met = [];
    const add = (id, condition) => {
      if (condition && !save.achievements.includes(id)) met.push(id);
    };
    add('first', save.runs >= 1);
    add('core', run.won === true);
    add('unharmed', run.won === true && (run.rockHits ?? 0) === 0);
    add('chain25', (run.bestChain ?? 0) >= 25);
    add('chain50', (run.bestChain ?? 0) >= 50);
    add('clean30', (run.bestClean ?? 0) >= 30);
    add('graze20', (run.grazes ?? 0) >= 20);
    add('shielded', (run.shieldsSpent ?? 0) >= 3);
    add('guardian', (run.guardianBeaten ?? false) === true);
    add('daily', run.daily === true);
    add('thrifty', save.shards >= 500);
    add('collector', save.upgrades.every((level, index) => level >= (MAX_LEVELS[index] ?? 0)));
    return met;
  }

  /** Puts the achievements on the page's book, so they are never handed out twice. */
  function award(ids) {
    for (const id of ids) {
      if (!save.achievements.includes(id)) save.achievements.push(id);
    }
    commit();
    return ids;
  }

  /** Today's score, if today has been played. */
  function dailyScore(day) {
    return save.daily[day] ?? 0;
  }

  /** Records today's score, keeping the best for the day. */
  function dailyRecord(day, score) {
    const rounded = Math.round(score);
    if (rounded > (save.daily[day] ?? 0)) save.daily[day] = rounded;
    save.lastDaily = day;
    commit();
    return save.daily[day];
  }

  /** The upgrade sheet, as the flat array the core reads: index order, levels. */
  function levels() {
    return save.upgrades.slice();
  }

  /** A level bought: adds one, and pays what the core charged. */
  function bought(index, cost) {
    save.upgrades[index] = Math.min(MAX_LEVELS[index] ?? 0, (save.upgrades[index] ?? 0) + 1);
    save.shards = Math.max(0, save.shards - cost);
    commit();
    return save.upgrades[index];
  }

  return {
    save,
    commit,
    pay,
    record,
    achievementsFor,
    award,
    dailyScore,
    dailyRecord,
    levels,
    bought,
  };
}
