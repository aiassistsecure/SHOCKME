/**
 * The answer is anonymous text from a stranger, shown to strangers, and it is
 * the one thing the room demands. These assert the properties that keep that
 * defensible.
 */
import { readAnswer, toneOf, fragmentOf, ANSWER_MAX } from '../src/experiences/answer.ts';
import { screen } from '../src/chat.ts';

let fail = 0;
const bad = (m: string) => { fail++; if (fail < 8) console.log('  ' + m); };

const SAMPLES = [
  ['that was genuinely unsettling and I liked it', 'unsettled'],
  ['this is amazing, I love it', 'delighted'],
  ['boring, pointless', 'dismissive'],
  ['what even was that?', 'searching'],
  ['ok', 'flat'],
] as const;

for (const [text, expected] of SAMPLES) {
  if (toneOf(text) !== expected) bad(`toneOf("${text}") = ${toneOf(text)}, expected ${expected}`);
}

/*
 * THE HONESTY RULE. Every acknowledgement must make the broadcast plain. The
 * room may be cryptic about what it does with your words; it may not imply
 * privacy while publishing them to a live rail.
 */
const SHARED = /\b(others|everyone|repeated|passed along|room|see)\b/i;
for (let i = 0; i < 60; i++) {
  const r = readAnswer(`seed_${i}`, 'it was strange in here');
  if (!SHARED.test(r.ack)) bad(`ack hides the broadcast: "${r.ack}"`);
  if (!r.artifactLine.trim()) bad('empty artifact line');
  // determinism — a replay must reproduce the same reading
  if (JSON.stringify(readAnswer(`seed_${i}`, 'it was strange in here')) !== JSON.stringify(r)) {
    bad(`seed ${i}: not deterministic`);
  }
}

// the Oracle is explicit: do not echo the whole submission back
const long = 'this was one of the strangest and most delightful things I have seen on the internet in a very long time';
const frag = fragmentOf(long);
if (frag.split(/\s+/).length > 7) bad(`fragment too long: "${frag}"`);
if (!frag.endsWith('…')) bad('truncated fragment is not marked');
if (frag.length >= long.length) bad('fragment is the whole submission');
if (fragmentOf('short one').endsWith('…')) bad('short answer wrongly marked as truncated');

// it goes on a public rail, so it must face the same screening as chat
if (screen('you are a nigg').ok) bad('slur would reach the rail');
if (screen('visit http://spam.example').ok) bad('link would reach the rail');
if (!screen('that was strange').ok) bad('ordinary answer rejected');

// the cap is real
if (ANSWER_MAX > 280 || ANSWER_MAX < 140) bad(`ANSWER_MAX ${ANSWER_MAX} outside the 140-280 brief`);

console.log(`  tone classes ${new Set(SAMPLES.map((s) => s[1])).size}, cap ${ANSWER_MAX}`);
console.log(`  answer — ${fail ? `FAIL ${fail}` : 'PASS honest acks, screened, fragment only'}`);
if (fail) process.exit(1);
