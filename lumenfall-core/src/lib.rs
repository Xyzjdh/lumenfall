// LUMENFALL's simulation core, in Rust, compiled to WebAssembly and run by the page.
//
// The browser owns the pixels and the sound; this owns the rules. Everything that decides what
// the game does — the corridor's drift, the comet's physics, the glow economy, the spawn clocks
// and the collisions — lives here, behind a small WebAssembly interface, so a run is a pure
// function of its seed and the steering fed to it.

pub mod rng;
pub mod config;
pub mod world;
pub mod pilot;
pub mod abi;

/// One line of the interface, kept in step with `abi.rs`: the version the page checks for.
pub const ABI_VERSION: u32 = 1;
