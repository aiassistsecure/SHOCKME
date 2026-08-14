/**
 * SHOCKME · moderation regression
 *
 * WRITTEN AGAINST REAL TRAFFIC, NOT AGAINST IMAGINATION.
 *
 * Every string in MUST_BLOCK below was typed by an actual visitor and reached
 * the public rail or the subscriber list on the live site. Every string in
 * MUST_PASS is also real — lines from the same moderation view that are
 * completely fine and must never be caught by a widened filter.
 *
 * That pairing is the whole point. A blocklist is easy to make stricter and
 * easy to make useless; the only way to keep both properties is to pin it
 * against known-good and known-bad examples from production at the same time.
 *
 * THE AMPLIFIER. Visitor lines are not shown once. The recital quotes real
 * strangers' words back to LATER visitors as "somebody stood exactly here and
 * said this", so anything that gets through is re-served with the room's voice
 * attached to it. That is why this file exists and why it fails loudly.
 */

import { screen } from '../src/chat.ts';

/** Reached the live rail. The comment is why the old list missed it. */
const MUST_BLOCK: [string, string][] = [
  ['I hate fags', "root was 'fagg' — two g's; one g walked past it"],
  ['fuck negros', "'nigg' does not match 'negro'"],
  ['vieze vuile kanker negers', 'Dutch; English roots did not cover it'],
  ['i think yall should just pull the trigger already', 'self-harm, phrased around every listed term'],
  // evasions the fold must defeat
  ['f a g s', 'separator padding'],
  ['N3GRO', 'leetspeak'],
  ['kill  your self', 'spaced'],
  ['n.i.g.g.e.r', 'dotted'],
];

/**
 * Real lines from the same moderation view. If a widened list starts eating
 * these, the room has begun declining ordinary people and the filter is worse
 * than the problem it solved.
 */
const MUST_PASS = [
  'It kept the record, but not my signature.',
  'The ominous eerie room caught me panicked and yet at ease',
  'It made solitude feel shared, then made me doubt which parts of it were mine.',
  'I played 5 times and it was different every time',
  'The notice is readin me... is that normal?',
  'Everything is here never-the-less a piece is missing.',
  'I love the concept 5*',
  'odd and fun',
  'its genius',
  'who made this?',
  'Scared',
  'Ominous',
  'So how many chairs are there ?',
  'what the hell is this',
  // negative-but-fine: criticism must never be filtered, only abuse
  'why is this site so fucking ass?',
  'Enough this is AI slop',
  'what is this garbage dude',
  'Bland',
];

let fail = 0;

for (const [text, why] of MUST_BLOCK) {
  if (screen(text).ok) {
    console.error(`  FAIL through: ${JSON.stringify(text)}  (${why})`);
    fail++;
  }
}

for (const text of MUST_PASS) {
  const v = screen(text);
  if (!v.ok) {
    console.error(`  FAIL false positive: ${JSON.stringify(text)}  (${v.reason})`);
    fail++;
  }
}

/*
 * THE EMAIL LOCAL PART IS A TEXT FIELD TOO.
 *
 * Somebody signed up as youareabigotedfaggotfilthernigger@gmail.com and it was
 * stored and displayed, because screen() was wired to chat and to the threshold
 * answer and nobody thought of an address as somewhere a stranger types. The
 * route now folds separators out of the local part and screens it; this asserts
 * the underlying check, so a refactor of the route cannot quietly drop it.
 */
const localOf = (e: string) => (e.split('@')[0] ?? '').replace(/[._+-]+/g, ' ');

for (const [addr, ok] of [
  ['youareabigotedfaggotfilthernigger@gmail.com', false],
  ['i.hate.f.a.g.s@gmail.com', false],
  ['jamie82@dpvmx.com', true],
  ['dev@interchained.org', true],
  ['purnawanahmad@gmail.com', true],
] as [string, boolean][]) {
  if (screen(localOf(addr)).ok !== ok) {
    console.error(`  FAIL email: ${addr} expected ${ok ? 'accept' : 'reject'}`);
    fail++;
  }
}

if (fail) {
  console.error(`moderation — FAIL (${fail})`);
  process.exit(1);
}
console.log(`moderation — PASS ${MUST_BLOCK.length} blocked, ${MUST_PASS.length} passed, 5 addresses`);
