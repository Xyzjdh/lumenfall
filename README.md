# lumenfall

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Xyzjdh/lumenfall/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Xyzjdh/lumenfall/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A browser arcade game about falling. You are a comet descending into a gas giant: light is your life, your fuel and your multiplier, and it burns away faster the deeper you go. Catch motes, dodge rock, and reach the core 4,000 metres down. No build step, no library, no network — plain ES modules on a canvas.

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

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
- `Esc` pauses, `M` mutes, `Space` starts and restarts.

The score is depth, carried by your multiplier and the light you gather. Runs are short by design —
most last about a minute — so the loop rewards the one after this one.

## Where the code is

`game/` is the whole game: plain static files, no build step, no network request, no library.

| File | Its one job |
| --- | --- |
| `game/src/config.js` | Every tuned number: the viewport, the descent, the glow economy, the corridor, the spawn clocks and the strata's palettes. |
| `game/src/world.js` | The rules and nothing else: the comet's motion, the corridor's shape, spawning, collisions, the glow and the score. Pure state, reproducible from a seed. |
| `game/src/render.js` | The whole picture: sky, corridor walls, comet, motes, rock, sparks and all five screens. |
| `game/src/input.js` | Keys, mouse, pointer lock and touch, turned into one steering value. |
| `game/src/audio.js` | The game's own sound, synthesised with Web Audio: a pad under the fall and a chime on the stratum's scale. |
| `game/src/shots.js` | The deterministic scenes behind `?shot=`, staged by playing the real rules forward. |
| `game/src/pilot.js` | A look-ahead pilot, used only by the screenshot scenes and the offline tuning harness. |
| `game/src/main.js` | Boot, the one fixed-step loop, and the five screens' transitions. |
| `main.ts` | The entrypoint: copies `game/` and `screenshots/` to the output directory and writes `dossier.json`. |

## Play it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Any static server works; the game is `game/index.html` and everything it loads sits beside it.

---

<sub>Entered on [make.fun](https://make.fun/?ref=dp0w7nr7&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
