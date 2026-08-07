import { Imagine, validateLine } from '../src/imagine.ts';

const im = new Imagine();
console.log('imagine available:', await im.available());
console.log();

const t0 = Date.now();
const out = [];
for (let i = 0; i < 8; i++) out.push(await im.line(600000 + i, `b_${i % 3}`));
const dt = (Date.now() - t0) / out.length;

for (const l of out) {
  const tag = l.source === 'imagine' ? ' ' : '~';
  console.log(`  ${tag} ${l.text}`);
  if (l.rejected.length) l.rejected.forEach(r => console.log(`      rejected -> ${r}`));
}
const fromModel = out.filter(l => l.source === 'imagine').length;
console.log(`\n  ${fromModel}/${out.length} from imagine, ${out.length - fromModel} corpus fallback`);
console.log(`  ${dt.toFixed(0)}ms per line`);

// determinism: same (tick,bot) must give the same line
const a = await im.line(700001, 'b_0');
const b = await im.line(700001, 'b_0');
console.log(`  determinism (same tick+bot): ${a.text === b.text ? 'PASS' : 'FAIL'}`);
console.log(`    -> ${a.text}`);
const c = await im.line(700002, 'b_0');
console.log(`  variety (next tick): ${c.text !== a.text ? 'PASS' : 'FAIL'}`);
console.log(`    -> ${c.text}`);

// unique within a tick?
const sameTick = await Promise.all(['b_0','b_1','b_2'].map(b => im.line(700003, b)));
const texts = sameTick.map(l => l.text);
console.log(`  distinct within one tick: ${new Set(texts).size === texts.length ? 'PASS' : 'FAIL'}`);
texts.forEach(t => console.log(`    -> ${t}`));
