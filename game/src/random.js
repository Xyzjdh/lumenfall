// A small seeded generator, so a run is reproducible: ?seed=N always lays out the same
// descent, which is what lets the screenshot scenes be staged frame for frame.

/** xoroshiro-style mixing on a 32-bit state, good enough for scatter and jitter. */
export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;

  /** The next float in [0, 1). */
  function next() {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z ^= (z + Math.imul(z ^ (z >>> 7), z | 61)) >>> 0;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  /** A float in [min, max). */
  function range(min, max) {
    return min + next() * (max - min);
  }

  /** An integer in [min, max]. */
  function int(min, max) {
    return Math.floor(min + next() * (max - min + 1));
  }

  /** True with probability p. */
  function chance(p) {
    return next() < p;
  }

  /** One element of a list. */
  function pick(list) {
    return list[Math.min(list.length - 1, Math.floor(next() * list.length))];
  }

  /** A float around 0, denser near the middle (mean of three draws). */
  function centred() {
    return (next() + next() + next()) / 1.5 - 1;
  }

  return { next, range, int, chance, pick, centred };
}
