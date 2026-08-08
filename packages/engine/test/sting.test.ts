/**
 * Stings must be TRUE, RARE, GRAMMATICAL and NEVER THREATENING.
 *
 * "Make it scarier" is unfalsifiable, so these assert the properties that
 * actually produce the effect — and the ones whose absence destroys it.
 */
import { STINGS, stingFor, MAX_STINGS } from '../src/experiences/sting.ts';
import type { Facts } from '../src/experiences/second-half.ts';

let fail = 0;
const bad = (m: string) => { fail++; if (fail < 8) console.log('  ' + m); };

const base: Facts = {
  visitorNumber: 41, totalVisitors: 188, finished: 48, yourMs: 62_000, medianMs: 30_000,
  quote: undefined, yourQuote: undefined, path: ['Count the chairs', 'Agree', 'Press it'],
  guess: 4, chairsDrawn: 6, pressed: true, population: 4,
  roomsSeen: ['arrival', 'counting', 'button'],
};
const ctx = { sceneId: 'ledger', visitCount: 0, buttonHesitationMs: 0, fired: 0 };

// 1. no threats, no horror register — M ruled this out explicitly
const BANNED = /\b(die|death|dead|kill|blood|scream|trapped|forever|never leave|hurt|suffer|corpse|flesh)\b/i;
// 2. no grammar slips — "1 seconds" breaks the spell faster than any bad line
const PLURAL = /\b1 (seconds|times|rooms|chairs)\b/;

for (const s of STINGS) {
  for (const probe of [
    base,
    { ...base, yourMs: 1_000, population: 1, guess: 6, pressed: false, yourQuote: 'hello' },
    { ...base, yourMs: 9_000, population: 9, roomsSeen: Array(8).fill('x'), medianMs: 1_000 },
  ] as Facts[]) {
    for (const c of [ctx, { ...ctx, visitCount: 1, buttonHesitationMs: 1_000 }, { ...ctx, visitCount: 4, buttonHesitationMs: 26_000 }]) {
      if (!s.when(probe, c)) continue;
      const line = s.line(probe, c);
      if (BANNED.test(line)) bad(`${s.id}: horror register — "${line}"`);
      if (PLURAL.test(line)) bad(`${s.id}: plural slip — "${line}"`);
      if (!line.trim()) bad(`${s.id}: empty line`);
      if (line.length > 150) bad(`${s.id}: too long to land (${line.length} chars)`);
      if (!/[.?]$/.test(line.trim())) bad(`${s.id}: no full stop — "${line}"`);
    }
  }
}

// 3. the skim sting must not fire on a fresh arrival — it reads as a bug
const skim = STINGS.find((s) => s.id === 'not-reading')!;
if (skim.when({ ...base, yourMs: 1_000 }, ctx)) bad('not-reading fires at 1s');
if (!skim.when({ ...base, yourMs: 12_000 }, ctx)) bad('not-reading does not fire at 12s');

// 4. RARITY: never more than MAX_STINGS, and not on every screen
let firedTotal = 0, screens = 0;
for (let i = 0; i < 300; i++) {
  let fired = 0;
  for (const scene of ['corridor', 'ledger', 'recital', 'threshold']) {
    screens++;
    const hit = stingFor(`s_${i}`, base, { ...ctx, sceneId: scene, fired });
    if (hit) { fired++; firedTotal++; }
  }
  if (fired > MAX_STINGS) bad(`seed ${i}: ${fired} stings, cap is ${MAX_STINGS}`);
}
const rate = firedTotal / screens;
if (rate > 0.6) bad(`fires on ${(rate * 100).toFixed(0)}% of screens — too common to shock`);

// 5. deterministic: a replay must reproduce the same shocks
for (let i = 0; i < 40; i++) {
  const a = stingFor(`d_${i}`, base, ctx);
  const b = stingFor(`d_${i}`, base, ctx);
  if (JSON.stringify(a) !== JSON.stringify(b)) bad(`seed ${i}: not deterministic`);
}

console.log(`  ${STINGS.length} stings, fires on ${(rate * 100).toFixed(0)}% of eligible screens`);
console.log(`  stings — ${fail ? `FAIL ${fail}` : 'PASS true, rare, grammatical, no threats'}`);
if (fail) process.exit(1);
