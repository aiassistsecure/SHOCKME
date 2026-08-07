import { chatAt, inhabitantsAt } from '../src/world.ts';

const N = 600, T0 = 800000;
let dupInTick = 0, ticksWithDup = 0, totalLines = 0, dupHandles = 0;
const seen = new Map<string, number[]>();

for (let i = 0; i < N; i++) {
  const t = T0 + i;
  const lines = chatAt(t);
  totalLines += lines.length;
  const texts = lines.map(l => l.template);
  const dups = texts.length - new Set(texts).size;
  if (dups > 0) { dupInTick += dups; ticksWithDup++; }
  for (const l of lines) { const a = seen.get(l.template) ?? []; a.push(t); seen.set(l.template, a); }
  const hs = inhabitantsAt(t).map(b => b.handle);
  dupHandles += hs.length - new Set(hs).size;
}
console.log(`  ticks scanned      : ${N}`);
console.log(`  lines emitted      : ${totalLines}`);
console.log(`  same-tick dupes    : ${dupInTick}   ${dupInTick === 0 ? 'PASS' : 'FAIL'}`);
console.log(`  ticks w/ a dupe    : ${ticksWithDup}`);
console.log(`  duplicate handles  : ${dupHandles}   ${dupHandles === 0 ? 'PASS' : 'FAIL'}`);

let tooSoon = 0, minGap = Infinity;
for (const [, ts] of seen) for (let i = 1; i < ts.length; i++) {
  const gap = ts[i]! - ts[i-1]!; minGap = Math.min(minGap, gap);
  if (gap < 24) tooSoon++;
}
console.log(`  repeats < 24 ticks : ${tooSoon}   min gap ${minGap === Infinity ? 'n/a' : minGap}`);
console.log(`  determinism        : ${JSON.stringify(chatAt(T0+7)) === JSON.stringify(chatAt(T0+7)) ? 'PASS' : 'FAIL'}`);

// call-order independence: the answer must not depend on when you ask
const { chatAt: fresh } = await import('../src/world.ts?v=2');
const forward = JSON.stringify(chatAt(T0 + 300));
const outOfOrder = (() => { chatAt(T0 + 900); chatAt(T0 + 100); return JSON.stringify(chatAt(T0 + 300)); })();
console.log(`  call-order stable  : ${forward === outOfOrder ? 'PASS' : 'FAIL'}`);
