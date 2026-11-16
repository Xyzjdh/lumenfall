// The core's published vocabulary, and nothing else.
//
// The rules of LUMENFALL — the corridor's drift, the comet's physics, the glow economy, the spawn
// clocks and the collisions — live in Rust, in lumenfall-core/src/world.rs, and reach the page as
// game/core.wasm. This file is the small piece that was never worth moving: the numbers the core
// uses to say WHAT happened in a step, so the page's sound and announcements can name it.
//
// The values are the core's own (world.rs, EVENT_*): they must not drift, because the page reads
// the bit field straight out of the wasm call.

/** A step in which the comet took a mote. */
export const EVENT_MOTE = 1;
/** A step in which the comet took a bright star. */
export const EVENT_STAR = 2;
/** A step in which a rock tore the glow away. */
export const EVENT_HIT = 4;
/** A step in which the comet scraped the corridor's wall. */
export const EVENT_WALL = 8;
/** A step that ended the run: the glow ran out. */
export const EVENT_OVER = 16;
/** A step that ended the run: the core was reached. */
export const EVENT_WIN = 32;
/** A step that crossed into a new stratum. */
export const EVENT_STRATUM = 64;

/** The kinds of thing in the water, as the core's item table spells them. */
export const KIND_MOTE = 'mote';
export const KIND_STAR = 'star';
export const KIND_STONE = 'stone';
export const KIND_SHARD = 'shard';
