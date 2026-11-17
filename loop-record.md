# The 50-iteration loop

Every number the game is played with was chosen by a search that plays it, not by hand. This is
the record: two full fifty-round searches (`tune loop 50`), then five passes of ten rounds, each
pass followed by the review bench and a real play of the page.

## Round set 1 — fifty rounds, shipped build as the starting point

- before: `score -385.1 | win 50% | median 61.7s | depth 3169m | glow-deaths 50% | closest 77%`
- after:  `score -98.6 | win 78% | median 68.5s | depth 3645m | glow-deaths 22% | closest 58%`
- the search plateaued from round 8, which is what the stagnation restarter in round set 2 fixed

## Round set 2 — fifty rounds, with the restarter

- before: shipped build again
- after:  `score -103.5 | win 81% | median 66.3s | depth 3693m | glow-deaths 19% | closest 56%`
- two restarts; the search found a build with a wider corridor (335 px against 300), a gentler
  drain and a lower ceiling on speed, which the pilot survives more often and a person can read

## What the score means

| term | what it asks for |
|---|---|
| win share | the pilot wins 55-85% of runs: a build everyone wins is a walk, one nobody wins is a wall |
| length | the median run lands near 72 seconds |
| tension | the glow's closest call is around 62% and it dips under a quarter for about 16% of the run |
| flow | deaths by running out of light (the build's fault) stay rare against deaths by rock (the player's) |
| walls | the pilot never scrapes |
| rocks | the run meets rock, but does not live in it |

## Loop run, 2026-11-16T13:23:22Z

### Pass 1

- tests: test result: ok. 28 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.06s
- core.wasm: 72080 bytes
  round  1/10  round-best   -169.2  best   -169.2  win  76.7%  median  64.5s
  round  2/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  3/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  4/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  5/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  6/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  7/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
  round  8/10  round-best   -144.5  best   -133.9  win  70.0%  median  66.7s
  round  9/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
  round 10/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
- build: score -133.9 | win 78% | median 67.3s | mean 63.2s | depth 3654m | pts 11229 | rocks 4.5 | glow-deaths 22% | closest 63% | danger 4% | walls 0.1%
- review: 14 files read 51 times. 0 reviewer(s) at high severity with findings, 3 at medium.
- high-severity reviewers still finding: 0
0
- play: 

### Pass 2

- tests: test result: ok. 28 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s
- core.wasm: 72080 bytes
  round  1/10  round-best   -169.2  best   -169.2  win  76.7%  median  64.5s
  round  2/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  3/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  4/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  5/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  6/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  7/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
  round  8/10  round-best   -144.5  best   -133.9  win  70.0%  median  66.7s
  round  9/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
  round 10/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
- build: score -133.9 | win 78% | median 67.3s | mean 63.2s | depth 3654m | pts 11229 | rocks 4.5 | glow-deaths 22% | closest 63% | danger 4% | walls 0.1%
- review: 14 files read 51 times. 0 reviewer(s) at high severity with findings, 3 at medium.
- high-severity reviewers still finding: 0
0
- play: 

### Pass 3

- tests: test result: ok. 28 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s
- core.wasm: 72080 bytes
  round  1/10  round-best   -169.2  best   -169.2  win  76.7%  median  64.5s
  round  2/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  3/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  4/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  5/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  6/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  7/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
  round  8/10  round-best   -144.5  best   -133.9  win  70.0%  median  66.7s
  round  9/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
  round 10/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
- build: score -133.9 | win 78% | median 67.3s | mean 63.2s | depth 3654m | pts 11229 | rocks 4.5 | glow-deaths 22% | closest 63% | danger 4% | walls 0.1%
- review: 14 files read 51 times. 0 reviewer(s) at high severity with findings, 3 at medium.
- high-severity reviewers still finding: 0
0
- play: PILOT FLIGHT {"before":{"x":0,"depth":6.392447471618652,"motes":0},"after":{"x":0,"depth":151.65516662597656,"motes":3,"glow":97.29679870605469,"score":187.65518188476562,"items":5,"screen":"play"}}
ERRORS none

### Pass 4

- tests: test result: ok. 28 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s
- core.wasm: 72080 bytes
  round  1/10  round-best   -169.2  best   -169.2  win  76.7%  median  64.5s
  round  2/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  3/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  4/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  5/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  6/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  7/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
  round  8/10  round-best   -144.5  best   -133.9  win  70.0%  median  66.7s
  round  9/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
  round 10/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
- build: score -133.9 | win 78% | median 67.3s | mean 63.2s | depth 3654m | pts 11229 | rocks 4.5 | glow-deaths 22% | closest 63% | danger 4% | walls 0.1%
- review: 14 files read 51 times. 0 reviewer(s) at high severity with findings, 3 at medium.
- high-severity reviewers still finding: 0
0
- play: PILOT FLIGHT {"before":{"x":0,"depth":8.721418380737305,"motes":0},"after":{"x":0,"depth":152.8933868408203,"motes":3,"glow":97.17910766601562,"score":188.89340209960938,"items":5,"screen":"play"}}
ERRORS none

### Pass 5

- tests: test result: ok. 28 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.08s
- core.wasm: 72080 bytes
  round  1/10  round-best   -169.2  best   -169.2  win  76.7%  median  64.5s
  round  2/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  3/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  4/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  5/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  6/10  round-best   -167.4  best   -167.4  win  69.2%  median  68.2s
  round  7/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
  round  8/10  round-best   -144.5  best   -133.9  win  70.0%  median  66.7s
  round  9/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
  round 10/10  round-best   -133.9  best   -133.9  win  77.5%  median  67.3s
- build: score -133.9 | win 78% | median 67.3s | mean 63.2s | depth 3654m | pts 11229 | rocks 4.5 | glow-deaths 22% | closest 63% | danger 4% | walls 0.1%
- review: 14 files read 51 times. 0 reviewer(s) at high severity with findings, 3 at medium.
- high-severity reviewers still finding: 0
0
- play: PILOT FLIGHT {"before":{"x":0,"depth":6.392447471618652,"motes":0},"after":{"x":0,"depth":150.41758728027344,"motes":3,"glow":97.41448211669922,"score":186.4176025390625,"items":4,"screen":"play"}}
ERRORS none

Loop finished 2026-11-16T13:33:14Z.

---

## Round set 4 — the v2 rules, re-tuned (40 rounds)

The v2 pass changed the game under the numbers: six biomes, five weathers, fifteen kinds of thing
in the water, shields and slows and lures, grazes, milestones, and a guardian in the last stratum.
A gain set tuned for the old game is not a gain set tuned for this one, so the search was run
again from the shipped build — 40 rounds, the same seeds, the same pilot, the same scoring.

Two rules bugs were found by playing, before the search could be blamed for the numbers:

- **BLOOM had less light than QUIET.** `mote_rate()` was multiplying the gap between mote
  clusters where it should have divided it, so a biome that promised "more light" delivered
  less. Fixed in `world.rs`; BLOOM now scores 13.5k against QUIET's 10.9k.
- **ECLIPSE was unbeatable.** −14 % light, +34 % rock, +34 % drain and a corridor at 0.82× is a
  wall, not a hard mode: the pilot died at 2,200 m every time. Eased to +26 % rock, +26 % drain
  and 0.87× corridor; it now wins 62 % of the pilot's runs, the hardest biome and still fair.

The search itself:

```
round 40/40  round-best -182.5  best -182.5  win 84.2%  median 70.1s
score -182.5 | win 84% | median 70.1s | mean 67.9s | depth 3713m | pts 10739
             | rocks 7.0 | glow-deaths 16% | closest 65% | danger 2% | walls 0.4%
```

The earlier round sets' headline (`-103.5`) was measured on the **v1 rules**, with none of the v2
systems in the world, so it is not comparable with this number and is not quoted as an
improvement. What the round set establishes is that the build the page plays under the v2 rules
wins 84 % of the pilot's runs with a 70 s median, 16 % glow deaths and 0.4 % wall scrapes — and
that all six biomes are playable:

```
biome       win  median    mean   depth     pts   pick  graze   chain
QUIET      100%   68.6s   68.3s   4001m   10940   0.98   3.47    18.5
STORM      100%   68.8s   68.7s   4001m   17189   0.93   4.90    32.3
BLOOM      100%   67.5s   67.5s   4001m   13563   0.82   3.25    24.4
GLACIER     90%   67.1s   66.8s   3902m   10548   1.15   4.20    19.5
VOLCANO     98%   68.0s   67.9s   3967m   10457   0.90   3.72    18.8
ECLIPSE     62%   64.8s   59.4s   3311m    8127   0.95   3.25    15.9
```

The build the page plays is the build the search chose, written to `game/gains.json` by the
harness itself: no number in this pass was typed in by hand.

### What the pass fixed on the way

- **The corridor was drawn in the wrong place.** `render.js`'s `corridorAt(world, depth, half)`
  dropped its third argument, so every wall was painted at the centre line. The tunnel looked
  plausible because the walls sat near the middle; measured against the core they were 345 px
  out. The probe that found it now reads the painted pixels and compares them with
  `corridor_centre_at` / `corridor_half_at`: peaks at 179 and 862 against a core that says
  480 ± (44.5 + 345.2). A bug from round one, found by measuring instead of looking.
- **The glow could read 112 %.** The Lantern upgrade raises the tank; the HUD divided by a
  hard-coded 100. The core now reports `max_glow_now()`, and the gauge is a fraction of the
  tank it actually has.
- **Two tests were lying.** One asserted a rock must be laid within three seconds of not
  steering (no longer true), and one depended on the test before it having left the shipped
  gains in the shared table. Both now set up their own world and assert something true.
