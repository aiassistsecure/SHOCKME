/**
 * SHOCKME · the pre-reset baseline
 *
 * The offset exists because a compromised DigitalOcean key let someone rebuild
 * the box on 2026-08-14, taking ~997 players' worth of log with it.
 *
 * What this file protects is the BOUNDARY, not the arithmetic. Adding two
 * numbers is not worth a test; keeping the offset off the behavioural figures
 * is, because that is the thing which would quietly wreck the room and which a
 * future refactor could plausibly get wrong.
 */

import { worldCounters, hasBaseline, type Baseline } from '../src/baseline.ts';

let fail = 0;
const bad = (m: string) => { console.error(`  FAIL ${m}`); fail++; };

const b: Baseline = { visitors: 997, sessions: 1140, finished: 107, lostOn: '2026-08-14', reason: 'test' };
const none: Baseline = { visitors: 0, sessions: 0, finished: 0, lostOn: '', reason: '' };

/* ---------- default is OFF ---------- */

/*
 * THE MOST IMPORTANT ASSERTION HERE. SHOCKME is MIT and somebody else will run
 * it. A baseline that defaults to anything but zero means their fresh install
 * opens by announcing a thousand visitors it never had — our incident silently
 * becoming their lie.
 */
if (hasBaseline(none)) bad('an unset baseline must not register as present');
const off = worldCounters(1, 1, 1, none);
if (off.totalVisitors !== 1 || off.visitorNumber !== 1 || off.finished !== 1) {
  bad(`no baseline must be a pure pass-through, got ${JSON.stringify(off)}`);
}

/* ---------- the world counters carry it ---------- */

const w = worldCounters(1, 1, 0, b);
if (w.totalVisitors !== 998) bad(`totalVisitors should be 998, got ${w.totalVisitors}`);
if (w.visitorNumber !== 998) bad(`the first visitor after the reset is the 998th, got ${w.visitorNumber}`);
if (w.finished !== 107) bad(`finished should carry the baseline, got ${w.finished}`);

/*
 * MONOTONIC. The counter may never go backwards as real visitors accumulate —
 * "you are visitor 998" followed later by "997 people have been in this room"
 * is the kind of contradiction the room can survive exactly once.
 */
let prev = 0;
for (let real = 1; real <= 50; real++) {
  const c = worldCounters(real, real, 0, b);
  if (c.totalVisitors < prev) bad('totalVisitors went backwards as real visitors grew');
  if (c.visitorNumber > c.totalVisitors) {
    bad(`visitor ${c.visitorNumber} of ${c.totalVisitors} — you cannot be numbered beyond the total`);
    break;
  }
  prev = c.totalVisitors;
}

/* ---------- and nothing else does ---------- */

/*
 * THE REAL POINT OF THIS FILE. worldCounters must return ONLY the three
 * world-facing counters. If a later change starts routing medianMs, the funnel,
 * quotes, chair counts or drawings through here, the room begins asserting
 * measured-looking facts about behaviour that never happened — and unlike a
 * wrong total, those are the numbers the stings and the recital quote verbatim.
 */
const keys = Object.keys(worldCounters(1, 1, 1, b)).sort();
const expected = ['finished', 'totalVisitors', 'visitorNumber'];
if (JSON.stringify(keys) !== JSON.stringify(expected)) {
  bad(`worldCounters must return exactly ${expected.join(', ')} — got ${keys.join(', ')}. `
    + 'Behavioural figures must never be offset.');
}

/* ---------- hostile env values degrade to zero ---------- */

for (const v of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
  const junk: Baseline = { ...none, visitors: v as number };
  const r = worldCounters(3, 3, 0, junk);
  if (!Number.isFinite(r.totalVisitors) || r.totalVisitors < 3) {
    bad(`a nonsense baseline (${String(v)}) must not corrupt the real count, got ${r.totalVisitors}`);
  }
}

if (fail) { console.error(`baseline — FAIL (${fail})`); process.exit(1); }
console.log('baseline — PASS off by default, world counters carry it, behaviour never does');
