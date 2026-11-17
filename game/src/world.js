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
/** A step in which a pickup that is not light was taken: a flask, a shield, a slow, a lure… */
export const EVENT_PICKUP = 128;
/** A step in which the weather turned. */
export const EVENT_WEATHER = 256;
/** A step in which the guardian woke: the last stratum's boss. */
export const EVENT_GUARDIAN_START = 512;
/** A step in which the guardian attacked. */
export const EVENT_GUARDIAN = 1024;
/** A step in which the guardian was outlasted. */
export const EVENT_GUARDIAN_END = 2048;
/** A step in which the combo's rating changed. */
export const EVENT_RATING = 4096;
/** A step in which a rock passed close enough to count as a near miss. */
export const EVENT_GRAZE = 8192;
/** A step that reached a depth milestone: every 500 metres. */
export const EVENT_MILESTONE = 16384;

/** The kinds of thing in the water, as the core's item table spells them. */
export const KIND_MOTE = 'mote';
export const KIND_STAR = 'star';
export const KIND_STONE = 'stone';
export const KIND_SHARD = 'shard';
/** A storm-charged mote: bright, worth a chain of three. */
export const KIND_CHARGED = 'charged';
/** A mote caught in a swirl: lighter than a star, heavier than a mote. */
export const KIND_SWIRLING = 'swirling';
/** A flask of light: refills the tank outright. */
export const KIND_FLASK = 'flask';
/** A shield: eats the next rock for nothing. */
export const KIND_SHIELD = 'shield';
/** A slow packet: the descent eases for a few seconds. */
export const KIND_SLOW = 'slow';
/** A lure: light leans toward the comet while it burns. */
export const KIND_LURE = 'lure';
/** A prism: a star that pays six of chain. */
export const KIND_PRISM = 'prism';
/** A heart: fills the tank, and spends the chain to do it. */
export const KIND_HEART = 'heart';
/** A cinder thrown up by a vent: rises, and hurts less than rock. */
export const KIND_CINDER = 'cinder';
/** A frosted mote: glacier light. */
export const KIND_FROST = 'frost';
/** An iceberg: slow-moving rock, bigger than any stone. */
export const KIND_ICEBERG = 'iceberg';

/** The codes, in the order the core's `Kind::code` publishes them. This is the contract. */
export const KIND_CODES = [
  KIND_MOTE, KIND_STAR, KIND_STONE, KIND_SHARD, KIND_CHARGED, KIND_SWIRLING, KIND_FLASK,
  KIND_SHIELD, KIND_SLOW, KIND_LURE, KIND_PRISM, KIND_HEART, KIND_CINDER, KIND_FROST, KIND_ICEBERG,
];

/**
 * The names of the six biomes and what each does, as the core tells them. The page keeps this
 * list only for the record books and the HUD's bank; the rules read the biome from the core.
 */
export const BIOME_NAMES = ['Quiet', 'Storm', 'Bloom', 'Glacier', 'Volcano', 'Eclipse'];

/** The upgrade names, in the order the shop sells them. */
export const UPGRADE_NAMES = ['Lantern', 'Thrift', 'Harvest', 'Charm', 'Head Start', 'Reach', 'Greed'];
