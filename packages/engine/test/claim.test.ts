/**
 * SHOCKME · the claim fence, under real concurrency
 *
 * This test needs a live nedbd because the property under test IS the engine's
 * sequencer. A mocked datastore would assert my assumption about the ordering
 * rather than the ordering, which is the exact shape of "verifying the producer
 * instead of the product" from STATUS.md §13.
 *
 *   NEDB_URL=http://127.0.0.1:7070 node packages/engine/test/claim.test.ts
 *
 * Skips loudly — never silently — when nedbd is unreachable.
 */

import { Nedb } from '../src/nedb.ts';
import { claim, claimText, canonical, fingerprint, windowFor } from '../src/claim.ts';

const ROUNDS = 20;
const RACERS = 32;

const db = new Nedb({ db: process.env.NEDB_TEST_DB ?? 'shockme_claimtest' });

try {
  await db.ensureDatabase();
} catch (e) {
  console.log(`  SKIPPED — no nedbd at ${db.base} (${(e as Error).message.slice(0, 60)})`);
  console.log('  start one:  nedbd --dag --data ./nedbdata --port 7070');
  process.exit(0);
}

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${label.padEnd(38)} ${ok ? 'PASS' : 'FAIL'} ${detail}`);
};

/* ---------------- canonical folding ---------------- */

check('curly quotes fold',
  fingerprint('the lamp is listening') === fingerprint('the lamp is listening'));
check('trailing punctuation folds',
  fingerprint('the lamp is listening.') === fingerprint('The lamp is listening'));
check('different numbers do NOT fold',
  fingerprint('there are 6 chairs') !== fingerprint('there are 7 chairs'),
  '  (chat.fold would collapse these)');
check('canonical keeps digits', canonical('there are 6 chairs') === 'there are 6 chairs');

/* ---------------- the race ---------------- */

const RUN = Math.random().toString(36).slice(2, 10);

async function race(fp: string) {
  const results = await Promise.all(
    Array.from({ length: RACERS }, (_, w) =>
      claim(db, { stream: 'broadcast', fingerprint: fp, meta: { w } })),
  );
  return {
    winners: results.filter((r) => r.won).length,
    invisible: results.filter((r) => r.invisible).length,
    /** The dangerous combination: claimed a win on a write we could not read. */
    blindWins: results.filter((r) => r.won && r.invisible).length,
    minSeen: Math.min(...results.map((r) => r.contenders)),
  };
}

/*
 * OBSERVED, and worth stating plainly: under 32-way contention a racer
 * occasionally cannot see its own append on read-back. Rare — single digits
 * per several hundred — but NOT zero, so the earlier assertion that it never
 * happens was wrong and would have flaked in CI forever.
 *
 * The invariant that actually protects the rail is not "this never happens".
 * It is "this can never win". An unreadable write is treated as a loss, the
 * pump generates another candidate, and no duplicate reaches a visitor.
 */
let totalInvisible = 0;
let totalBlind = 0;
let allSingle = true;
for (let i = 0; i < ROUNDS; i++) {
  const { winners, invisible, blindWins, minSeen } = await race(`${RUN}-fp-${i}`);
  totalInvisible += invisible;
  totalBlind += blindWins;
  if (winners !== 1) {
    allSingle = false;
    console.log(`  round ${i}: ${winners} winners, ${invisible} invisible, min seen ${minSeen}`);
  }
}
const appends = ROUNDS * RACERS;
check(`exactly one winner × ${ROUNDS} rounds`, allSingle, `  (${appends} contested appends)`);
check('an unreadable write never wins', totalBlind === 0, `  (${totalBlind})`);
console.log(`  ${'unreadable self-writes'.padEnd(38)} ${totalInvisible}/${appends}` +
  `  (${((totalInvisible / appends) * 100).toFixed(2)}% — handled as losses)`);

/* ---------------- scoping ---------------- */

const shared = `${RUN}-scope`;
const a = await claim(db, { stream: 'broadcast', fingerprint: shared, window: 'w-1' });
const b = await claim(db, { stream: 'broadcast', fingerprint: shared, window: 'w-2' });
check('different windows do not collide', a.won && b.won);

const c = await claim(db, { stream: 'broadcast', fingerprint: `${RUN}-lane`, window: 'w-1' });
const d = await claim(db, { stream: 'texture', fingerprint: `${RUN}-lane`, window: 'w-1' });
check('lanes are independent', c.won && d.won, '  (a room capsule cannot consume a rail claim)');

// Namespaced per run. A fixed string here passes exactly once per 24h window
// and then fails forever, because the FIRST run legitimately owns the claim —
// a fixture that only works on a virgin database is a fixture that lies.
const first = await claimText(db, 'broadcast', `${RUN} nobody has been near it`);
const second = await claimText(db, 'broadcast', `${RUN} Nobody has been near it.`);
check('repeat inside a window loses', first.won && !second.won);

/* ---------------- durability ---------------- */

const losers = await db.rows(`FROM claims WHERE fingerprint = "${shared}"`);
check('losing candidates persist', losers.length >= 2, `  (${losers.length} rows — contention is auditable)`);

const v = await db.verify();
check('chain intact after contention', v.ok && v.tampered.length === 0, `  (${v.objects_checked} objects)`);

console.log(`\n  window ids: broadcast=${windowFor('broadcast')} texture=${windowFor('texture')}`);
console.log(failures === 0 ? '\n  claim fence: OK' : `\n  claim fence: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
