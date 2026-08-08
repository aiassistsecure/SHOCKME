/**
 * The chair count has exactly one source of truth, and the VISITOR supplies
 * half of it.
 *
 * History: the count once lived in three places (render, tally, client
 * arithmetic) and no two agreed — the room drew 4, claimed 4, announced 5.
 * M: "it drew 5. but we both know it drew 4."
 *
 * Then M redesigned the scene: "let the user input how many chairs they think,
 * and then count the difference, then let them select agree or disagree."
 * So the room no longer counts FOR you. These assertions now cover the new
 * contract: the room states a claim, draws a number, and never fills in your
 * answer — and every number that reaches the visitor agrees with the drawing.
 */

import { resolveRoom } from '../src/experiences/waiting-room.ts';
import { verdictFor } from '../src/experiences/waiting-room.ts';

let fail = 0;
const bad = (m: string) => { if (fail++ < 3) console.log('  ' + m); };

for (let i = 0; i < 200; i++) {
  const seed = `chair_${i}`;
  const r = resolveRoom(seed, 0);
  const visible = Math.max(1, r.chairCount - 1);

  // the room is never accidentally correct
  if (r.chairCount === r.claimedChairCount) bad(`${seed}: room was right (${r.chairCount})`);
  // exactly one chair is held back, and it is one OF the total, never an extra
  if (r.chairCount - visible !== 1) bad(`${seed}: held back ${r.chairCount - visible}, expected 1`);
  // the late chair must actually be able to arrive
  if (r.lateChairAfterMs <= 0) bad(`${seed}: late chair never arrives`);

  // whatever you commit, the difference shown is against the FINAL drawing
  for (const guess of [0, visible, r.chairCount, r.claimedChairCount, 99]) {
    const { verdict, line } = verdictFor(seed, guess, visible, r.chairCount, r.claimedChairCount);
    if (!line || !line.trim()) bad(`${seed}: no verdict line for guess ${guess}`);
    const expected =
      guess === r.chairCount ? 'prescient'
      : guess === visible ? 'was-right'
      : guess === r.claimedChairCount ? 'exact'
      : guess < visible ? 'low' : 'high';
    if (verdict !== expected) bad(`${seed}: guess ${guess} -> ${verdict}, expected ${expected}`);
  }

  // the artifact quotes your number and the drawing, and they must not drift
  const g = 7;
  const artifact = `you counted ${g}. the room insisted on ${r.claimedChairCount}. it drew ${r.chairCount}.`;
  const drew = Number(/it drew (\d+)/.exec(artifact)![1]);
  if (drew !== r.chairCount) bad(`${seed}: artifact says ${drew}, drew ${r.chairCount}`);
}
console.log(`  200 seeds — ${fail ? `FAIL ${fail} mismatches` : 'PASS count contract holds'}`);

// The room must never accidentally be right — that is a silent joke failure.
let correct = 0;
const seen = new Map<number, number>();
for (let i = 0; i < 500; i++) {
  const r = resolveRoom(`agree_${i}`, 0);
  seen.set(r.chairCount, (seen.get(r.chairCount) ?? 0) + 1);
  if (r.chairCount === r.claimedChairCount) correct++;
}
console.log('  chair spread :', [...seen.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}:${v}`).join('  '));
console.log(`  room ever correct: ${correct}  ${correct === 0 ? 'PASS always wrong' : 'FAIL'}`);
if (fail || correct) process.exit(1);
