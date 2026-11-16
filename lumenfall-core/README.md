# lumenfall-core

The rules of LUMENFALL, in Rust, and the two tools that keep them honest.

```
cargo test                                        # 28 tests
cargo run --release --bin tune -- benchmark       # how fast a run plays here
cargo run --release --bin tune -- baseline        # the shipped build's numbers
cargo run --release --bin tune -- loop 50         # 50 rounds of tuning by playing
cargo run --release --bin review                  # 51 reviewers, one lens each
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/lumenfall_core.wasm ../game/core.wasm
```

| file | its one job |
| --- | --- |
| `src/world.rs` | The rules: the comet, the corridor, spawning, collisions, the glow, the score. |
| `src/config.rs` | Every tuned number as a struct the harness can search, with the envelope each may move in. |
| `src/rng.rs` | The seeded generator, a faithful port of the script it replaced. |
| `src/pilot.rs` | The look-ahead pilot that plays the harness and stages the screenshots. |
| `src/abi.rs` | The WebAssembly boundary: exported scalars and one item table, nothing else. |
| `src/bin/tune.rs` | The search: cross-entropy over the gains, scored by playing. |
| `src/bin/review.rs` | The review bench. |

`reference/` holds the script the port replaced, kept for comparison and not compiled.
