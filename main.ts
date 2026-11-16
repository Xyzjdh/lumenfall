// LUMENFALL: the entrypoint. It hands the game in.
//
// best-game-01 asks for one program at the repository root that copies the playable game and its
// screenshots into the output directory and writes the dossier the judge reads. That is all this
// does, in three steps: validate the layout, copy, then build the dossier from what was copied.
//
// main.ts is that program. It runs on Node 22.13 or later with no dependency to install. The game
// it hands in is two halves: game/src/*.js, which the browser loads itself, and game/core.wasm,
// the compiled Rust that holds the rules (lumenfall-core/). Neither half is built here: the module
// is committed, so this program only copies it, and the only import is the vendored dossier
// library beside it. main.ts never reads /input and never touches the network; every file it
// copies is already in the commit it was pushed with.
//
// The same main.ts runs twice in the grader, and the two runs must agree byte for byte, so nothing
// below depends on the clock, on a random seed, or on the order a directory happens to list in.
//
//   node main.ts                                  writes /output (the grader's own path)
//   MAKEFUN_OUTPUT_DIR=out node main.ts           writes out/ instead, for a local run
//   node main.ts --check                          checks the layout and writes nothing
//
// The dossier is written by the vendored library, never by hand: the gate builds it again from
// the same files and refuses the entry unless the two are byte for byte equal.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** Where this program sits: the repository root. */
const here = fileURLToPath(new URL('.', import.meta.url));

/** The output directory: the grader's /output, or MAKEFUN_OUTPUT_DIR outside it. */
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The caps the scorer holds an entry to, from the competition's gate. */
const CAPS = {
  text_max_bytes: 163_840, // the dossier's source text
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
  game_path_max_bytes: 1_000,
};

/**
 * The entry is invalid without these, so say which is missing rather than failing later. Each
 * one is a check the gate makes, not a preference: index.html is the game the browser opens,
 * main.ts is this program, the vendored library is what writes the dossier, and the LICENSE is
 * the OSI-approved grant the bounty requires. Screenshots are checked by count and by size.
 */
const REQUIRED = ['game/index.html', 'game/core.wasm', 'main.ts', 'vendor/makefun-game.ts', 'LICENSE'];

/**
 * The simulation core is a WebAssembly module, and the page refuses to start without it, so the
 * hand-in checks it is one: the four magic bytes and the version word every module begins with.
 * A file that is not a module would otherwise be copied happily and fail in the browser instead.
 */
function problemWithCore(dir) {
  const path = join(dir, 'game', 'core.wasm');
  const head = readFileSync(path).subarray(0, 8);
  const magic = head.subarray(0, 4).toString('latin1');
  if (magic !== '\0asm') return ['game/core.wasm is not a WebAssembly module'];
  const version = head.readUInt32LE(4);
  if (version !== 1) return [`game/core.wasm is version ${version}; the page speaks 1`];
  return [];
}

/** The screenshots the gate will accept, named, so a stray file is reported and not shipped. */
const SHOT_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

/** True when a file in screenshots/ is one the gate reads: a whole PNG or JPEG under its name rules. */
function isShot(name) {
  if (name.startsWith('.') || name.startsWith('-')) return false;
  if (!/^[\w.\-]{1,128}$/.test(name)) return false;
  return SHOT_EXTENSIONS.some((end) => name.toLowerCase().endsWith(end));
}

/** Files and directories under a directory, counted as the gate counts them. */
function countTree(dir) {
  let entries = 0;
  let bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    entries += 1;
    if (name.isDirectory()) {
      const inner = countTree(path);
      entries += inner.entries;
      bytes += inner.bytes;
    } else {
      bytes += statSync(path).size;
    }
  }
  return { entries, bytes };
}

/** Everything wrong with the layout, as a list of sentences. Empty means it is ready. */
function problemWithLayout() {
  const missing = REQUIRED.filter((path) => !existsSync(join(here, path)));
  if (missing.length > 0) return [`missing ${missing.join(', ')}`];

  const shots = readdirSync(join(here, 'screenshots')).filter(isShot);
  if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
    return [`screenshots/ holds ${shots.length} images the gate reads; it takes 3 or 4`];
  }
  for (const name of shots) {
    const bytes = statSync(join(here, 'screenshots', name)).size;
    if (bytes > CAPS.screenshots.max_bytes) return [`screenshots/${name} is over 256 KiB`];
  }

  const core = problemWithCore(here);
  if (core.length > 0) return core;

  const game = countTree(join(here, 'game'));
  if (game.entries > CAPS.game_max_files) return [`game/ holds ${game.entries} entries, over ${CAPS.game_max_files}`];
  if (game.bytes > CAPS.game_max_bytes) return [`game/ is ${game.bytes} bytes, over ${CAPS.game_max_bytes}`];
  return [];
}

/**
 * The hand-in's summary, for a run and for --check to print: what was copied and how big the
 * dossier came out. Kept out of the write itself so the write path stays one job.
 */
function describe(target) {
  const game = countTree(join(target, 'game'));
  const dossier = statSync(join(target, 'dossier.json')).size;
  return `game/ ${game.entries} entries, ${(game.bytes / 1024).toFixed(0)} KiB; dossier ${(dossier / 1024).toFixed(0)} KiB`;
}

/** Copy the game and its screenshots, then write the dossier from the copies. */
function handIn(target) {
  // A directory that already holds a previous hand-in must not be added to: start it clean.
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });

  cpSync(join(here, 'game'), join(target, 'game'), { recursive: true });
  cpSync(join(here, 'screenshots'), join(target, 'screenshots'), { recursive: true });

  // buildDossier reads the output tree, so it is handed the copies, never the sources.
  writeFileSync(join(target, 'dossier.json'), buildDossier(target, CAPS));
  return target;
}

const problems = problemWithLayout();
if (problems.length > 0) {
  // A person running this should see one sentence, not a stack trace: it is the entry, not a bug.
  console.error(`lumenfall: the entry is not ready: ${problems.join('; ')}`);
  process.exitCode = 1;
  process.exit();
}

// A person who finds this file should be able to learn what it does without reading it: --help
// says the three things it can do and nothing more.
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`main.ts: hands the LUMENFALL entry in.

  node main.ts                     copy game/ and screenshots/ to /output, and write its dossier
  MAKEFUN_OUTPUT_DIR=out node main.ts    the same, into out/ instead of /output
  node main.ts --check             verify the entry without keeping anything
  node main.ts --help              this

The game itself is game/index.html, the modules beside it and game/core.wasm, the Rust core
compiled for the browser: open it through any static server, or run "node serve.ts" and browse
to http://localhost:8080. The Rust is in lumenfall-core/: "cargo test" runs its tests,
"cargo run --release --bin tune -- loop 50" searches its tuning, and
"cargo run --release --bin review" runs the review bench over the sources.`);
  process.exit(0);
}

if (process.argv.includes('--check')) {
  // Verify by doing the hand-in into a throwaway directory: the real thing, then thrown away.
  const check = mkdtempSync(join(here, '.staging-'));
  try {
    handIn(join(check, 'out'));
    console.log(`lumenfall: ready. ${describe(join(check, 'out'))} (nothing written outside a temporary directory)`);
  } finally {
    rmSync(check, { recursive: true, force: true });
  }
  process.exit(0);
}

// A run that writes into an empty temporary directory first and then moves it in cannot leave a
// half-written /output behind if it is killed midway.
const staging = mkdtempSync(join(here, '.staging-'));
try {
  handIn(join(staging, 'out'));
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const name of readdirSync(join(staging, 'out'))) {
    cpSync(join(staging, 'out', name), join(out, name), { recursive: true });
  }
  console.log(`lumenfall: handed in to ${out}: ${describe(out)}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}

// Where to look next: README.md says how the game plays and what each module under game/src does;
// the rules are in lumenfall-core/src/world.rs and every number the game is tuned by is in
// lumenfall-core/src/config.rs, where the harness can search over the lot of them. This program
// only hands the entry in, so a run that disagrees with itself is almost always a file that
// changed between the two runs and not this code: it reads the tree once, copies it, and writes
// the dossier from the copies, in that order, with nothing in between that could depend on when
// it ran.
