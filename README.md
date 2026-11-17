# lumenfall

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Xyzjdh/lumenfall/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Xyzjdh/lumenfall/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A browser arcade game about falling. You are a comet descending into a gas giant: light is your life, your fuel and your multiplier, and it burns away faster the deeper you go. Catch motes, dodge rock, and reach the core 4,000 metres down.

**134 features, counted:** six biomes that rewrite the rules, five weathers, fifteen kinds of thing in the water, a guardian at the mouth of the core, a combo that judges how you are playing, daily descents, and a shop of seven upgrades you keep between runs. [`FEATURES.md`](FEATURES.md) lists every one, with the file that owns it.

The rules are **Rust**, compiled to WebAssembly and committed as `game/core.wasm`; the picture is plain JavaScript on a canvas. No build step to play it, no library, no network, nothing to install.

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

Nothing to install and nothing to build: the game is static files, and the compiled core
(`game/core.wasm`) is committed beside them. To change the rules, you need Rust.

## Two halves

**The rules are Rust.** The corridor's drift, the comet's physics, the glow economy, the spawn
clocks and the collisions live in [`lumenfall-core/`](lumenfall-core) and reach the page as
`game/core.wasm` — about 70 KB, exported as plain numbers, loaded with
`WebAssembly.instantiateStreaming`, no wasm-bindgen and no package to install.

**The picture is JavaScript.** Sky, walls, comet, motes, rock, sparks, sound and the five screens
are `game/src/*.js`, which ask the core where everything is and draw it.

```sh
cd lumenfall-core
cargo test                                    # 37 tests: the rules, the systems, the interface
cargo run --release --bin tune -- loop 50      # 50 rounds of tuning by playing
cargo run --release --bin review               # 51 reviewers, one lens each, over the sources
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/lumenfall_core.wasm ../game/core.wasm
```

### Why Rust

Not for speed. It is for **honesty**: the rules became a pure function that can be played ten
thousand times in a second, offline, with no browser anywhere. That turned three things that were
vibes into measurements:

- **Tuning.** Every number the game is played with was searched for, not typed in. A cross-entropy
  search plays each candidate build over a fixed set of seeds with the same look-ahead pilot and
  scores it on win share, run length, how close the glow comes to empty, whether deaths are the
  player's fault or the build's, and how often the pilot scrapes a wall. The best build is written
  to `game/gains.json`, and the page plays the build the search chose — so nothing in the loop is
  transcribed by hand. Before: the pilot won 50% of runs and the median run was 62 s. After: 81%
  and 66 s, with deaths from running out of light down from 50% to 19%.
- **Testing.** 37 tests in the core, including that the same seed and the same steering play the
  same run twice, that a NaN steering value is read as no steering, that the comet can never
  leave the corridor, and that the weather never repeats itself two changes running.
- **Review.** `cargo run --release --bin review` runs 51 independent reviewers, each with exactly
  one lens — the panicker, the NaN hunter, the determinism reviewer, the accessibility reviewer,
  the licence reviewer — over every file. It found a real bug on its first run.

## How it plays

You are a comet falling into a gas giant. Light is the only thing keeping you alive: the **glow** meter
is at once your life, your fuel and your score multiplier, and it drains faster the deeper you fall.

- **Steer** with the arrow keys, `W`/`S`, or the mouse. WASD and the arrows work together.
- **Catch motes.** Each mote refills the glow and extends your **chain**; every eight motes in an
  unbroken chain raises the multiplier, up to ×5.
- **Catch stars.** The rare bright ones are worth three motes and a third of a tank.
- **Dodge the rock.** Hitting a stone tears out a fifth of your glow and breaks the chain; pressing
  against a wall bleeds it away slowly.
- **Go deep.** The run is a single descent to the core at **4,000 m**, through five strata — the Azure
  Veil, the Ember Waste, the Verdant Hush, the Violet Reach and the Gilded Core. Each one brings its
  own palette, its own key and its own weather. Reach the core and you win; let the glow run out and
  you do not.
### Living with it

- **Pick a biome** on the title with `B`: each one plays the same depth differently.
- **Play today's descent** with `D`: one seed for everyone, the same everywhere, every day.
- **Spend shards** in the supply (between runs) with `Shift`+`S`: seven upgrades, 29 levels, kept in
  `localStorage` so the next fall starts where the last one left off.
- **Read the run** on the end screen: chain, clean streak, near misses, pickups, and the records
  you beat, named in colour.
- **Chase the book**: twelve achievements, from `FIRST FALL` to `FULL RIG`.

`Esc` pauses, `M` mutes, `Space` starts and restarts.

The score is depth, carried by your multiplier and the light you gather. Runs are short by design —
most last about a minute — so the loop rewards the one after this one.

## Where the code is

`game/` is the whole game: plain static files, no build step, no network request, no library.

### The Rust

| File | Its one job |
| --- | --- |
| `lumenfall-core/src/world.rs` | The rules and nothing else: the comet's motion, the corridor's shape, spawning, collisions, the glow, the powers, the grazes and the score. Pure state, reproducible from a seed. |
| `lumenfall-core/src/kinds.rs` | The fifteen kinds of thing in the water, and the shop's seven upgrades with their costs and caps. |
| `lumenfall-core/src/systems.rs` | The parts of a run that are not the comet: the biome, the weather, the combo, the guardian, and the daily's seed. |
| `lumenfall-core/src/config.rs` | Every number the game is tuned by, as a struct the harness can search over, with the envelope each one may move in. |
| `lumenfall-core/src/rng.rs` | The seeded generator. A faithful port of the script it replaced, so the same seed lays out the same world in both. |
| `lumenfall-core/src/pilot.rs` | A look-ahead pilot: the best steering it can find by simulating three candidates 1.9 s ahead. It plays the tuning harness and stages the screenshots, so every staged frame is a frame the rules really reach. |
| `lumenfall-core/src/abi.rs` | The WebAssembly boundary: exported scalars, one item table in shared memory, and nothing else between Rust and the page. |
| `lumenfall-core/src/bin/tune.rs` | The search. Cross-entropy over the gains, scored by playing. |
| `lumenfall-core/src/bin/review.rs` | The review bench: 51 reviewers, one lens each. |

### The JavaScript

| File | Its one job |
| --- | --- |
| `game/src/core.js` | The only place the page talks to Rust: loads the module, and gives back a world with the same surface the script version had. |
| `game/src/render.js` | The whole picture: sky, corridor walls, comet, motes, rock, sparks and all five screens. |
| `game/src/input.js` | Keys, mouse, pointer lock and touch, turned into one steering value. |
| `game/src/audio.js` | The game's own sound, synthesised with Web Audio: a pad under the fall and a chime on the stratum's scale. |
| `game/src/shots.js` | The deterministic scenes behind `?shot=`, staged by flying the core's real rules forward. |
| `game/src/config.js` | The drawing constants the renderer needs (the viewport, the strata's palettes). The rules' numbers are in the Rust. |
| `game/src/world.js` | The core's vocabulary: the event bits and item kinds, so the page can name what a step did. |
| `game/src/save.js` | What the player keeps between visits: the upgrade sheet, the shard ledger, the record book, the dailies. |
| `game/src/records.js` | The record book and the twelve achievements, as words. |
| `game/src/shop.js` | The supply screen: the list, the pips, the prices, and the keyboard. |
| `game/src/main.js` | Boot: the module, the gains, the world. Then the one fixed-step loop and the five screens' transitions. |
| `main.ts` | The entrypoint: copies `game/` and `screenshots/` to the output directory and writes `dossier.json`. |

## Play it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Any static server works; the game is `game/index.html` and everything it loads sits beside it.

---

<sub>Entered on [make.fun](https://make.fun/?ref=dp0w7nr7&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
