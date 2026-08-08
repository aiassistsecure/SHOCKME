/**
 * THE DATA LAYER IS NOT ALLOWED TO CONTRADICT THE VISITOR.
 *
 * Oracle: "Every visitorId must be isolated. A new session may retain that
 * visitor's own afterimage, but never another visitor's response or event
 * history... The room is allowed to contradict the visitor. The data layer is
 * not."
 *
 * This is the test file that matters most in the repo. A room that quotes
 * somebody else's sentence back at you is the worst failure this product can
 * have — it is not a glitch, it is a privacy incident wearing a costume — and
 * we have already shipped a near-miss (a finished session's answer surviving
 * into the next game).
 */
import {
  classifyReferrer, arrivalBeat, isSocial, deriveAfterimage, afterimageBeat,
  type AfterEvent,
} from '../src/afterimage.ts';

let fail = 0;
const bad = (m: string) => { fail++; if (fail < 10) console.log('  ' + m); };

/* ---- referrer classification, and that the raw URL never survives ---- */
const CASES: [string | undefined, string][] = [
  [undefined, 'direct'],
  ['https://www.facebook.com/groups/1234', 'social_facebook'],
  ['https://l.instagram.com/', 'social_instagram'],
  ['https://old.reddit.com/r/InternetIsBeautiful/comments/x', 'social_reddit'],
  ['https://t.co/abc', 'social_x'],
  ['https://x.com/someone/status/1', 'social_x'],
  ['https://www.google.com/search?q=my+private+search', 'search'],
  ['https://thrilling.world/a/abc', 'internal'],
  ['https://example.invalid/whatever', 'unknown'],
  ['not a url at all', 'unknown'],
];
for (const [ref, want] of CASES) {
  const got = classifyReferrer(ref, 'thrilling.world');
  if (got !== want) bad(`classify(${ref}) = ${got}, expected ${want}`);
}

// the class must not leak the source URL — no query strings, no paths, no ids
for (const [ref] of CASES) {
  const cls = classifyReferrer(ref, 'thrilling.world');
  if (/[/?=]/.test(cls)) bad(`class "${cls}" carries URL structure`);
  if (ref && /private|1234|groups|status/.test(cls)) bad(`class leaked path detail: ${cls}`);
}

// arrivals we did not observe must produce NO line rather than a guess
if (arrivalBeat('s', 'direct')) bad('direct arrival invented a beat');
if (arrivalBeat('s', 'unknown')) bad('unknown arrival invented a beat');
if (!arrivalBeat('s', 'social_reddit')) bad('reddit arrival produced nothing');
if (!isSocial('social_x') || isSocial('search')) bad('isSocial is wrong');

// never name the platform
const PLATFORMS = /facebook|instagram|reddit|twitter|tiktok|\bx\.com\b|google/i;
for (const cls of ['social_facebook','social_instagram','social_reddit','social_x','social_other','search','internal'] as const) {
  for (let i = 0; i < 20; i++) {
    const line = arrivalBeat(`seed_${i}`, cls);
    if (line && PLATFORMS.test(line)) bad(`${cls} named the platform: "${line}"`);
  }
}

/* ---- TWO CONCURRENT VISITORS MUST NOT SEE EACH OTHER ---- */
const evA: AfterEvent[] = [
  { sessionId: 'sA1', kind: 'answered', tick: 10, payload: { text: 'alice was here', fragment: 'alice was here' } },
  { sessionId: 'sA1', kind: 'press', tick: 11 },
];
const evB: AfterEvent[] = [
  { sessionId: 'sB1', kind: 'answered', tick: 12, payload: { text: 'bob said something else', fragment: 'bob said something else' } },
  { sessionId: 'sB1', kind: 'choice', tick: 13, payload: { choiceId: 'refuse' } },
];
const all = [...evA, ...evB];
const arrival = { referrerClass: 'direct' as const };

// alice, on a SECOND session, must see her own prior sentence and never bob's
const alice = deriveAfterimage('vA', 1, arrival, all, new Set(['sA1', 'sA2']), 'sA2');
if (alice.memory.priorResponseExcerpt !== 'alice was here') bad(`alice got: ${alice.memory.priorResponseExcerpt}`);
if (JSON.stringify(alice).includes('bob')) bad('ALICE CAN SEE BOB — cross-visitor leak');
if (!alice.behaviors.pressesButtons) bad('alice lost her own history');

const bob = deriveAfterimage('vB', 1, arrival, all, new Set(['sB1', 'sB2']), 'sB2');
if (bob.memory.priorResponseExcerpt !== 'bob said something else') bad(`bob got: ${bob.memory.priorResponseExcerpt}`);
if (JSON.stringify(bob).includes('alice')) bad('BOB CAN SEE ALICE — cross-visitor leak');
if (bob.behaviors.pressesButtons) bad("bob inherited alice's press");
if (!bob.behaviors.refusesButtons) bad('bob lost his own refusal');

// a caller passing the wrong session set gets NOTHING, not somebody else's memory
const confused = deriveAfterimage('vA', 1, arrival, all, new Set(), 'sA2');
if (confused.memory.priorResponseExcerpt) bad('empty session set still produced a memory');

/* ---- THE CURRENT VISIT'S OWN ANSWER IS NOT "PRIOR" ---- */
const firstTimer = deriveAfterimage('vC', 0, arrival, [
  { sessionId: 'sC1', kind: 'answered', tick: 5, payload: { text: 'said just now', fragment: 'said just now' } },
], new Set(['sC1']), 'sC1');
if (firstTimer.memory.priorResponseExcerpt) bad('quoted the CURRENT visit as a prior memory');
if (firstTimer.returned) bad('first-time visitor marked as returning');
if (afterimageBeat('s', firstTimer) && afterimageBeat('s', firstTimer)!.id === 'prior-sentence') {
  bad('first-timer got a prior-sentence beat');
}

/* ---- a new visitor has nothing, and the room says nothing ---- */
const fresh = deriveAfterimage('vD', 0, arrival, [], new Set(['sD1']), 'sD1');
if (Object.values(fresh.behaviors).some(Boolean)) bad('fresh visitor has behaviours');
if (fresh.memory.roomsFound.length) bad('fresh visitor remembers rooms');

/* ---- determinism: a replay reproduces the same beat ---- */
for (let i = 0; i < 30; i++) {
  const a = afterimageBeat(`d_${i}`, alice);
  if (JSON.stringify(a) !== JSON.stringify(afterimageBeat(`d_${i}`, alice))) bad(`seed ${i} not deterministic`);
}

console.log(`  ${CASES.length} referrer cases, 2 concurrent visitors, isolation asserted both ways`);
console.log(`  afterimage — ${fail ? `FAIL ${fail}` : 'PASS isolated, honest, never names a platform'}`);
if (fail) process.exit(1);
