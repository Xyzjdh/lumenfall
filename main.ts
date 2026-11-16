// LUMENFALL: the entrypoint. It hands the game in.
//
// best-game-01 asks for one program at the repository root that copies the playable game and its
// screenshots into the output directory and writes the dossier the judge reads. That is all this
// does, in three steps: validate the layout, copy, then build the dossier from what was copied.
//
//   node main.ts                                  writes /output (the grader's own path)
//   MAKEFUN_OUTPUT_DIR=out node main.ts           writes out/ instead, for a local run
//   node main.ts --check                          checks the layout and writes nothing
//
// The dossier is written by the vendored library, never by hand: the gate builds it again from
// the same files and refuses the entry unless the two are byte for byte equal.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

/** The entry is invalid without these, so say which is missing rather than failing later. */
const REQUIRED = ['game/index.html', 'main.ts', 'vendor/makefun-game.ts', 'LICENSE'];

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

  const shots = readdirSync(join(here, 'screenshots')).filter((name) => !name.startsWith('.'));
  if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
    return [`screenshots/ holds ${shots.length} images; the gate takes 3 or 4`];
  }
  for (const name of shots) {
    const bytes = statSync(join(here, 'screenshots', name)).size;
    if (bytes > CAPS.screenshots.max_bytes) return [`screenshots/${name} is over 256 KiB`];
  }

  const game = countTree(join(here, 'game'));
  if (game.entries > CAPS.game_max_files) return [`game/ holds ${game.entries} entries, over ${CAPS.game_max_files}`];
  if (game.bytes > CAPS.game_max_bytes) return [`game/ is ${game.bytes} bytes, over ${CAPS.game_max_bytes}`];
  return [];
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
  console.error(`lumenfall: the entry is not ready: ${problems.join('; ')}`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  const game = countTree(join(here, 'game'));
  console.log(`lumenfall: ready. game/ ${game.entries} entries, ${(game.bytes / 1024).toFixed(0)} KiB`);
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
  const dossier = statSync(join(out, 'dossier.json')).size;
  console.log(`lumenfall: handed in to ${out} (dossier ${(dossier / 1024).toFixed(0)} KiB)`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
