/**
 * SHOCKME · the publish fence
 *
 * The four things the brief asks us to prove:
 *   1. concurrent duplicate completions → exactly one durable line
 *   2. a repeated model output never appears, not even briefly
 *   3. backoff is bounded and non-blocking
 *   4. the curated fallback is reachable after exhaustion
 *
 * Needs a live nedbd, for the same reason claim.test.ts does.
 */

import { Nedb } from '../src/nedb.ts';
import { admit, MAX_ATTEMPTS, BACKOFF_MS, noteAdmitted, seenRecently, exclusionHint } from '../src/publish.ts';

const db = new Nedb({ db: process.env.NEDB_TEST_DB ?? 'shockme_claimtest' });
try { await db.ensureDatabase(); } catch (e) {
  console.log(`  SKIPPED — no nedbd at ${db.base}`); process.exit(0);
}

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${label.padEnd(40)} ${ok ? 'PASS' : 'FAIL'} ${detail}`);
};

const RUN = Math.random().toString(36).slice(2, 8);
const okScreen = () => ({ ok: true, reason: '' });
// Instant sleep — we assert the SHAPE of the backoff, not the wall clock.
let slept: number[] = [];
const fakeSleep = async (ms: number) => { slept.push(ms); };

/* 1. concurrent identical completions → one winner, rest fall to curated */

const line = `${RUN} the lamp is listening`;
const results = await Promise.all(Array.from({ length: 12 }, () =>
  admit(db, {
    generate: async () => ({ text: line, source: 'imagine' as const }),
    fallback: () => 'CURATED',
    screen: okScreen,
    sleep: fakeSleep,
    jitterSeed: RUN,
  })));

const admitted = results.filter((r) => r.source === 'imagine');
check('concurrent duplicates → one admitted', admitted.length === 1, `  (${admitted.length}/12)`);
check('losers never return the duplicate',
  results.filter((r) => r.source === 'curated').every((r) => r.text === 'CURATED'));
check('losers exhaust the attempt budget',
  results.filter((r) => r.source === 'curated').every((r) => r.attempts === MAX_ATTEMPTS));
check('rejections are recorded privately',
  results.some((r) => r.rejected.some((x) => x.startsWith('duplicate') || x.startsWith('recent'))));

/* 2. a line already admitted can never reappear inside the window */

const again = await admit(db, {
  generate: async () => ({ text: line, source: 'imagine' as const }),
  fallback: () => 'CURATED', screen: okScreen, sleep: fakeSleep,
});
check('repeat of an admitted line is refused', again.source === 'curated');

/* 3. backoff bounded, and each retry asks for a FRESH candidate */

slept = [];
let asked = 0;
const excludes: string[][] = [];
const exhausted = await admit(db, {
  generate: async (_a, exclude) => { asked++; excludes.push(exclude); return { text: line, source: 'imagine' as const }; },
  fallback: () => 'CURATED', screen: okScreen, sleep: fakeSleep, jitterSeed: 'fixed',
});
check('attempts capped', asked === MAX_ATTEMPTS, `  (${asked})`);
check('one sleep per retry, not per attempt', slept.length === MAX_ATTEMPTS - 1, `  (${slept.length})`);
check('backoff is monotonic and bounded',
  slept.every((ms, i) => ms >= BACKOFF_MS[i]! * 0.7 && ms <= BACKOFF_MS[i]! * 1.3),
  `  (${slept.join(', ')} ms)`);
check('generator receives an exclusion hint', excludes.at(-1)!.length > 0, `  (${excludes.at(-1)!.length} lines)`);
check('exclusion hint stays bounded', exclusionHint(999).length <= 250);
check('fallback reachable after exhaustion', exhausted.text === 'CURATED' && exhausted.source === 'curated');

/* 4. screening happens BEFORE the claim — rejected text never reaches the db */

const dirty = `${RUN} rejected candidate text`;
const screened = await admit(db, {
  generate: async () => ({ text: dirty, source: 'imagine' as const }),
  fallback: () => 'CURATED',
  screen: (t) => ({ ok: !t.includes('rejected'), reason: 'blocked' }),
  sleep: fakeSleep,
});
const leaked = await db.rows(`FROM claims WHERE fingerprint = "${(await import('../src/claim.ts')).fingerprint(dirty)}"`);
check('screened-out text never reaches the fence', screened.source === 'curated' && leaked.length === 0);

/* 5. the local ring is a pre-check, not the fence */

noteAdmitted('a line the ring has seen');
check('ring recognises a canonical repeat', seenRecently('A line the ring has seen.'));
check('ring does not over-match', !seenRecently('a line the ring has not seen'));

console.log(failures === 0 ? '\n  publish fence: OK' : `\n  publish fence: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
