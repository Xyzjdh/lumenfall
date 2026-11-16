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
