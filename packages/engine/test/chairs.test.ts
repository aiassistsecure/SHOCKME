/**
 * The chair count lives in three places — the drawing, the tally, and the
 * artifact. They MUST agree. They did not: the room drew 4, said 4, then
 * announced 5, because the client did `Number(text)+1` on a chair that was
 * already included in the total.
 */
import { resolveRoom } from '../src/experiences/waiting-room.ts';
import { renderRoom } from '../../bff/src/render.ts';

let fail = 0;
for (let i = 0; i < 200; i++) {
  const seed = `seed_${i}`;
  const r = resolveRoom(seed, 0);
  const html = renderRoom({
    sceneId: 'counting', renderer: 'counting', greeting: r.anomaly.line, body: '',
    choices: [], resolved: r, lines: [], visitCount: 0, origin: 'http://x',
    nudges: [], lateChairAfterMs: r.lateChairAfterMs,
  });

  const drawn = (html.match(/class="chair"/g) ?? []).length;
  const tally = Number(/id="chaircount"[^>]*>(\d+)/.exec(html)?.[1] ?? -1);
  const final = Number(/CHAIRS_FINAL = (\d+)/.exec(html)?.[1] ?? -1);
  const diff  = Number(/CHAIRS_DIFF = (\d+)/.exec(html)?.[1] ?? -1);
  const artifactSays = r.chairCount;      // what the end card will print

  const problems: string[] = [];
  if (drawn !== r.chairCount)  problems.push(`drew ${drawn} but chairCount is ${r.chairCount}`);
  if (final !== r.chairCount)  problems.push(`CHAIRS_FINAL ${final} != ${r.chairCount}`);
  if (tally !== drawn - 1 && !(drawn === 1 && tally === 1))
                               problems.push(`tally starts at ${tally}, expected ${drawn - 1}`);
  if (diff !== Math.abs(r.chairCount - r.claimedChairCount))
                               problems.push(`diff ${diff} wrong`);
  if (artifactSays !== drawn)  problems.push(`artifact says ${artifactSays}, drew ${drawn}`);

  if (problems.length) { fail++; if (fail < 4) console.log(`  ${seed}: ${problems.join('; ')}`); }
}
console.log(`  200 seeds — ${fail === 0 ? 'PASS all three counts agree' : `FAIL ${fail} mismatches`}`);
if (fail) process.exit(1);

// The room must never accidentally be right — that is a silent joke failure.
import { resolveRoom as rr } from '../src/experiences/waiting-room.ts';
let correct = 0;
const seen = new Map<number, number>();
for (let i = 0; i < 500; i++) {
  const r = rr(`agree_${i}`, 0);
  seen.set(r.chairCount, (seen.get(r.chairCount) ?? 0) + 1);
  if (r.chairCount === r.claimedChairCount) correct++;
}
console.log('  chair spread :', [...seen.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}:${v}`).join('  '));
console.log(`  room ever correct: ${correct}  ${correct === 0 ? 'PASS always wrong' : 'FAIL'}`);
if (correct) process.exit(1);
