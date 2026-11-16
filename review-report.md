# The review bench

51 independent reviewers, each with one lens, over 14 files. Run with `cargo run --release --bin review`.

| # | reviewer | lenses on | findings | highest |
|---|---|---|---|---|
| 1 | the panicker | every path that can abort the wasm module | 0 | clean |
| 2 | the expecter | expect() calls, which are a panic with a nicer message | 0 | clean |
| 3 | the unsafe auditor | unsafe blocks, and whether each one is at the boundary | 0 | clean |
| 4 | the static mut questioner | mutable statics, which are a data race waiting for a second thread | 0 | clean |
| 5 | the slicing reviewer | indexing and slicing, which panic where a get() would return | 0 | clean |
| 6 | the division guard | a divisor that could be zero | 0 | clean |
| 7 | the casting reviewer | as casts between number types, which wrap or truncate silently | 0 | clean |
| 8 | the overflow watcher | arithmetic that can exceed its type | 0 | clean |
| 9 | the nan hunter | places where a NaN could enter the world | 0 | clean |
| 10 | the clamp auditor | clamps, and whether they run before a value is used | 0 | clean |
| 11 | the epsilon reviewer | float equality, which a NaN or a rounding makes a lie | 0 | clean |
| 12 | the unit keeper | metres, pixels and seconds mixed in one expression | 0 | clean |
| 13 | the allocator's friend | allocation on a path that runs every step | 0 | clean |
| 14 | the clone spotter | clones that copy more than they need | 0 | clean |
| 15 | the frame budgeter | per-frame work grown past what a frame has | 0 | clean |
| 16 | the loop auditor | loops whose bounds are not the loop's own | 0 | clean |
| 17 | the doc reader | public items without a word saying why they exist | 0 | clean |
| 18 | the naming reviewer | names that say what a thing is | 0 | clean |
| 19 | the long function spotter | functions grown past a screen | 0 | clean |
| 20 | the nesting reviewer | indentation deep enough to lose the thread | 0 | clean |
| 21 | the todo watcher | unfinished work left in the source | 0 | clean |
| 22 | the debug printer | debug output left in a shipping path | 0 | clean |
| 23 | the dead code spotter | exports or functions nothing calls | 0 | clean |
| 24 | the magic number reviewer | numbers in logic that a reader cannot name | 0 | clean |
| 25 | the loose-equality reviewer | == and != where === and !== are meant | 0 | clean |
| 26 | the var spotter | var, which has no block | 0 | clean |
| 27 | the console leak | console output left in the page | 1 | low |
| 28 | the innerHTML reviewer | HTML written from script | 0 | clean |
| 29 | the eval reviewer | code built from strings | 0 | clean |
| 30 | the promise reviewer | awaits that are not awaited | 0 | clean |
| 31 | the error path reviewer | catch blocks that swallow what happened | 5 | medium |
| 32 | the null reader | optional chaining, and whether the fallback is honest | 2 | low |
| 33 | the number parser | values read from the page or a file and used unchecked | 15 | medium |
| 34 | the import auditor | imports no code uses | 0 | clean |
| 35 | the module boundary reviewer | the page reaching past the bridge into the rules | 0 | clean |
| 36 | the async boot reviewer | boot order, and what happens when a file is missing | 7 | medium |
| 37 | the listener reviewer | listeners added and never removed | 2 | low |
| 38 | the frame loop reviewer | work done per frame that could be done once | 0 | clean |
| 39 | the accessibility reviewer | the page read aloud by a screen reader | 0 | clean |
| 40 | the canvas fallback reviewer | what a canvas shows before a frame is painted | 0 | clean |
| 41 | the meta reviewer | viewport, charset and colour scheme | 1 | low |
| 42 | the determinism reviewer | two builds that must agree byte for byte | 0 | clean |
| 43 | the wasm loader reviewer | a module that could be served with the wrong type | 0 | clean |
| 44 | the mime reviewer | the server and the file types it serves | 0 | clean |
| 45 | the licence reviewer | the licence, and whether the vendored code agrees | 0 | clean |
| 46 | the readme reviewer | the README a person reads first | 0 | clean |
| 47 | the line length reviewer | lines long enough to wrap in a review | 93 | low |
| 48 | the trailing whitespace reviewer | whitespace at the end of a line | 0 | clean |
| 49 | the tab spotter | tabs in a file indented with spaces | 0 | clean |
| 50 | the blank line reviewer | three blank lines in a row | 1 | note |
| 51 | the comment ratio reviewer | code with no word of explanation | 0 | clean |

### 27. the console leak — console output left in the page

- `game/src/main.js:288` — console.info(`LUMENFALL: playing ${gains === null ? 'the compiled build' : 'the tuned build'} (corridor ${core.gains_get

### 31. the error path reviewer — catch blocks that swallow what happened

- `game/src/audio.js:35` — } catch {
- `game/src/core.js:213` — } catch {
- `game/src/main.js:69` — } catch {
- `game/src/main.js:79` — } catch {
- `game/src/main.js:87` — } catch {

### 32. the null reader — optional chaining, and whether the fallback is honest

- `game/src/core.js:118` — Number.isFinite(steer?.x) ? steer.x : 0,
- `game/src/core.js:119` — Number.isFinite(steer?.y) ? steer.y : 0,

### 33. the number parser — values read from the page or a file and used unchecked

- `game/src/render.js:73` — const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
- `game/src/render.js:74` — const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
- `game/src/render.js:84` — const r = parseInt(colour.slice(1, 3), 16);
- `game/src/render.js:85` — const g = parseInt(colour.slice(3, 5), 16);
- `game/src/render.js:86` — const b = parseInt(colour.slice(5, 7), 16);
- `game/src/render.js:114` — export function formatNumber(value) {
- `game/src/render.js:580` — ctx.fillText(`${formatNumber(state.depth)} m`, pad, 46);
- `game/src/render.js:594` — ctx.fillText(`CORE ${formatNumber(GOAL_DEPTH_M)} m`, pad, 99);
- `game/src/render.js:600` — ctx.fillText(formatNumber(state.score), VIEW.width - pad, 46);
- `game/src/render.js:607` — ctx.fillText(`BEST ${formatNumber(Math.max(best, state.score))}  ·  ${formatClock(state.time)}`, VIEW.width - pad, 84);
- `game/src/render.js:760` — ['DEPTH REACHED', `${formatNumber(state.depth)} m`],
- `game/src/render.js:761` — ['SCORE', formatNumber(state.score)],
- …and 3 more

### 36. the async boot reviewer — boot order, and what happens when a file is missing

- `game/src/core.js:205` — const response = await fetch(url);
- `game/src/core.js:212` — ({ instance } = await WebAssembly.instantiateStreaming(response.clone(), {}));
- `game/src/core.js:214` — ({ instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {}));
- `game/src/main.js:51` — const response = await fetch('./gains.json');
- `game/src/main.js:53` — const table = await response.json();
- `game/src/main.js:279` — core = await loadCore('./core.wasm');
- `game/src/main.js:286` — const gains = await loadGains(core);

### 37. the listener reviewer — listeners added and never removed

- `game/src/input.js:28` — target.addEventListener(type, handler, options);
- `game/src/main.js:259` — document.addEventListener('visibilitychange', () => {

### 41. the meta reviewer — viewport, charset and colour scheme

- `game/index.html:1` — the page never declares theme-color

### 47. the line length reviewer — lines long enough to wrap in a review

- `README.md:3` — [![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=gi
- `README.md:4` — [![rank](https://make.fun/badge/best-game-01/Xyzjdh/lumenfall/rank.svg)](https://make.fun/bounty/best-game-01/leaderboar
- `README.md:5` — [![reward](https://make.fun/badge/best-game-01/Xyzjdh/lumenfall/reward.svg)](https://make.fun/bounty/best-game-01?utm_so
- `README.md:7` — A browser arcade game about falling. You are a comet descending into a gas giant: light is your life, your fuel and your
- `README.md:9` — The rules are **Rust**, compiled to WebAssembly and committed as `game/core.wasm`; the picture is plain JavaScript on a 
- `README.md:87` — \| `lumenfall-core/src/world.rs` \| The rules and nothing else: the comet's motion, the corridor's shape, spawning, collis
- `README.md:88` — \| `lumenfall-core/src/config.rs` \| Every number the game is tuned by, as a struct the harness can search over, with the 
- `README.md:89` — \| `lumenfall-core/src/rng.rs` \| The seeded generator. A faithful port of the script it replaced, so the same seed lays o
- `README.md:90` — \| `lumenfall-core/src/pilot.rs` \| A look-ahead pilot: the best steering it can find by simulating three candidates 1.9 s
- `README.md:91` — \| `lumenfall-core/src/abi.rs` \| The WebAssembly boundary: exported scalars, one item table in shared memory, and nothing
- `README.md:99` — \| `game/src/core.js` \| The only place the page talks to Rust: loads the module, and gives back a world with the same sur
- `README.md:102` — \| `game/src/audio.js` \| The game's own sound, synthesised with Web Audio: a pad under the fall and a chime on the stratu
- …and 81 more

### 50. the blank line reviewer — three blank lines in a row

- `game/src/main.js:272` — three blank lines in a row
