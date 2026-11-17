// The record book and the achievement list, as words.
//
// The numbers live in save.js; this file is the vocabulary around them: what each achievement is
// called, what it asks for, and how a run is summarised for the end screen. Keeping the words
// apart from the storage means the achievement list can be read, tested and shown without a
// browser, and the save file never carries copy that would have to be migrated.

/** Every achievement, in the order the book shows them. */
export const ACHIEVEMENTS = [
  { id: 'first', name: 'FIRST FALL', hint: 'Finish a run, however it ends.' },
  { id: 'core', name: 'TO THE CORE', hint: 'Reach 4,000 metres.' },
  { id: 'unharmed', name: 'UNTOUCHED', hint: 'Reach the core without a rock landing.' },
  { id: 'chain25', name: 'LONG THREAD', hint: 'Hold a chain of 25.' },
  { id: 'chain50', name: 'UNBROKEN', hint: 'Hold a chain of 50.' },
  { id: 'clean30', name: 'CLEAN HANDS', hint: 'Thirty seconds without a scratch.' },
  { id: 'graze20', name: 'NERVE', hint: 'Twenty near misses in one run.' },
  { id: 'shielded', name: 'BULWARK', hint: 'Let shields eat three rocks in one run.' },
  { id: 'guardian', name: 'GUARDIAN-SLAYER', hint: 'Outlast the guardian at the mouth of the core.' },
  { id: 'daily', name: 'SAME STARS', hint: 'Finish a daily descent.' },
  { id: 'thrifty', name: 'WELL KEPT', hint: 'Hold 500 shards at once.' },
  { id: 'collector', name: 'FULL RIG', hint: 'Buy every upgrade to its last level.' },
];

/** What a record is called on the end screen. */
export const RECORD_NAMES = {
  score: 'SCORE',
  depth: 'DEPTH',
  chain: 'BEST CHAIN',
  clean: 'CLEAN STREAK',
  grazes: 'NEAR MISSES',
  pickups: 'PICKUPS',
  time: 'LONGEST RUN',
};

/**
 * Summarises a finished run for the end screen: the numbers the player wants once, in the order
 * they want them, with the ones that beat a record marked. `best` is the stored book before this
 * run was filed, so the comparison is honest.
 */
export function summarise(run, best) {
  const rows = [
    { key: 'depth', label: 'DEPTH', value: `${Math.round(run.depth)} m`, record: run.depth > (best.depth ?? 0) },
    { key: 'score', label: 'SCORE', value: String(Math.round(run.score)), record: run.score > (best.score ?? 0) },
    { key: 'chain', label: 'BEST CHAIN', value: String(run.bestChain ?? 0), record: (run.bestChain ?? 0) > (best.chain ?? 0) },
    { key: 'clean', label: 'CLEAN', value: `${(run.bestClean ?? 0).toFixed(1)} s`, record: (run.bestClean ?? 0) > (best.clean ?? 0) },
    { key: 'grazes', label: 'NEAR MISSES', value: String(run.grazes ?? 0), record: (run.grazes ?? 0) > (best.grazes ?? 0) },
    { key: 'pickups', label: 'PICKUPS', value: String(run.pickups ?? 0), record: (run.pickups ?? 0) > (best.pickups ?? 0) },
    { key: 'time', label: 'TIME', value: `${Math.round(run.time ?? 0)} s`, record: (run.time ?? 0) > (best.time ?? 0) },
  ];
  return rows;
}

/** The line the title screen shows under the record: how much of the book is filled. */
export function bookProgress(earned) {
  const have = Array.isArray(earned) ? earned.length : 0;
  return { have, total: ACHIEVEMENTS.length, text: `${have} / ${ACHIEVEMENTS.length} ACHIEVEMENTS` };
}
