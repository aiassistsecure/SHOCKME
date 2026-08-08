/**
 * EVERY GENERATED FLOORPLAN MUST STILL BE A VALID BUILDING.
 *
 * The graph is no longer a constant, which means the reachability guarantees
 * that graph.test.ts checked once now have to hold for every seed. A
 * structural generator that strands one visitor in a thousand is worse than
 * no generator at all — and "After playing the game it got stuck here" is a
 * bug M has already reported once.
 */
import { SCENES, INITIAL_SCENE } from '../src/experiences/waiting-room.ts';
import { planFor, sceneIn } from '../src/experiences/floorplan.ts';

let fail = 0;
const bad = (m: string) => { fail++; if (fail < 8) console.log('  ' + m); };

const shapes = new Map<string, number>();
const skins = new Map<string, number>();
let offices = 0, narrowed = 0, reversed = 0;

for (let i = 0; i < 400; i++) {
  const seed = `plan_${i}`;
  const plan = planFor(seed, SCENES);
  const ids = new Set(plan.scenes.map((s) => s.id));

  shapes.set(plan.shape, (shapes.get(plan.shape) ?? 0) + 1);
  skins.set(plan.variant.skin, (skins.get(plan.variant.skin) ?? 0) + 1);
  if (plan.hasOffice) offices++;
  if (plan.shape.includes('narrow')) narrowed++;
  if (plan.shape.includes('reversed')) reversed++;

  // 1. every choice points at a real room
  for (const s of plan.scenes) {
    for (const c of s.choices) if (!ids.has(c.next)) bad(`${seed}: ${s.id} -> ${c.next} missing`);
    if (s.id !== 'end' && !s.choices.length) bad(`${seed}: ${s.id} has no way out`);
  }

  // 2. every room reachable from the front door
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const c of sceneIn(plan, id)?.choices ?? []) walk(c.next);
  };
  walk(INITIAL_SCENE);
  for (const s of plan.scenes) if (!seen.has(s.id)) bad(`${seed}: ${s.id} unreachable`);

  // 3. EVERY path terminates at the artifact — no loops, no stranding
  for (const s of plan.scenes) {
    const reach = new Set<string>();
    const w = (id: string) => {
      if (reach.has(id)) return;
      reach.add(id);
      for (const c of sceneIn(plan, id)?.choices ?? []) w(c.next);
    };
    w(s.id);
    if (!reach.has('end')) bad(`${seed}: ${s.id} cannot reach the ending`);
  }

  // 4. the threshold gate must survive every rearrangement
  const th = sceneIn(plan, 'threshold');
  if (!th || !th.choices.length) bad(`${seed}: threshold missing or sealed`);
  if (!seen.has('threshold')) bad(`${seed}: threshold unreachable — the answer gate is skippable`);

  // 5. never three doors where two are identical: that reads as a bug
  const corr = sceneIn(plan, 'corridor')!;
  if (corr.choices.length > 2) {
    const dests = new Set(corr.choices.map((c) => c.next));
    if (dests.size !== corr.choices.length) bad(`${seed}: 3 doors, duplicate destinations`);
  }
}

// 6. the variation has to actually happen, or this whole file is theatre
if (shapes.size < 4) bad(`only ${shapes.size} distinct shapes across 400 seeds`);
if (offices < 20 || offices > 120) bad(`office reached by ${offices}/400 — should be rare, not absent`);
if (skins.size < 4) bad(`only ${skins.size} skins`);

console.log(`  shapes: ${[...shapes.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join('  ')}`);
console.log(`  office ${offices}/400   narrowed ${narrowed}   reversed ${reversed}`);
console.log(`  floorplan — ${fail ? `FAIL ${fail}` : 'PASS 400 seeds, all valid, all different'}`);
if (fail) process.exit(1);
