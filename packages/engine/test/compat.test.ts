/**
 * SHOCKME · backwards compatibility
 *
 * There is no flag, so this file IS the safety mechanism. The contract:
 *
 *   1. a session with no arrival_declared still gets rooms — the six that are
 *      not gated on an arrival reading
 *   2. the two reading-gated rooms exclude themselves, without a special case
 *   3. once a projection is persisted, the visit stops changing — a deploy
 *      that adds a module cannot mutate a walk already in progress
 *   4. a module removed from the registry degrades to the core spine rather
 *      than erroring, so an old permalink still renders
 */

import { planFor } from '../src/experiences/floorplan.ts';
import { SCENES } from '../src/experiences/waiting-room.ts';
import { planDiscoveries, applyDiscoveries, NO_FACTS, type RoomModule } from '../src/experiences/discovery.ts';
import { REGISTRY } from '../src/experiences/rooms-v2.ts';

let failures = 0;
const check = (l: string, ok: boolean, d = '') => { if (!ok) failures++; console.log(`  ${l.padEnd(46)} ${ok ? 'PASS' : 'FAIL'} ${d}`); };

const READING_GATED = ['corrections', 'file-room'];
const SEEDS = Array.from({ length: 300 }, (_, i) => `compat_${i}`);

/* 1 + 2 · a mid-flight session: no arrival reading, but it has been walking */
const midFlight = { ...NO_FACTS, choices: ['count', 'through'], counted: true, visited: ['arrival', 'counting'] };
const midPlans = SEEDS.map((s) => planDiscoveries(s, planFor(s, SCENES), midFlight, REGISTRY));
const midSeen = new Set(midPlans.flatMap((p) => p.projection.discoveries.map((d) => d.moduleId)));

check('pre-arrival sessions still get rooms',
  midPlans.some((p) => p.projection.discoveries.length > 0),
  `  (${midPlans.filter((p) => p.projection.discoveries.length > 0).length}/${SEEDS.length} visits)`);
check('exactly six modules are open to them',
  midSeen.size === REGISTRY.length - READING_GATED.length, `  (${midSeen.size} of ${REGISTRY.length})`);
check('reading-gated rooms exclude themselves',
  READING_GATED.every((id) => !midSeen.has(id)), `  (${[...midSeen].sort().join(', ')})`);

/* a full v2 session sees all eight */
const full = { ...midFlight, arrivalReading: 'followed' as const, consent: true };
const fullSeen = new Set(SEEDS.flatMap((s) => planDiscoveries(s, planFor(s, SCENES), full, REGISTRY).projection.discoveries.map((d) => d.moduleId)));
check('a declared arrival opens all eight', fullSeen.size === REGISTRY.length, `  (${fullSeen.size})`);

/* 3 · a persisted projection is immune to a registry that grew */
const NEWCOMER: RoomModule = {
  id: 'aaa-added-later', version: 1, group: 'brandnew', cost: 1, chance: 1.0,
  replace: { scene: 'corridor' },
  scene: { id: 'added-later', renderer: 'discovery', choices: [{ id: 'on', label: 'Continue' }] },
  variants: [{ id: 'only', weight: 1, lines: ['A room deployed while you were walking.'] }],
  slots: [],
};
let mutated = 0;
for (const s of SEEDS) {
  const base = planFor(s, SCENES);
  const stored = planDiscoveries(s, base, full, REGISTRY).projection.discoveries;
  const after = applyDiscoveries(base, stored, [...REGISTRY, NEWCOMER]);
  if (after.some((sc) => sc.id === 'added-later')) mutated++;
}
check('a deploy cannot mutate a walk in progress', mutated === 0, `  (${mutated}/${SEEDS.length})`);

/* replay of a stored projection is byte-stable */
const s0 = SEEDS[3]!;
const stored0 = planDiscoveries(s0, planFor(s0, SCENES), full, REGISTRY).projection.discoveries;
const a = JSON.stringify(applyDiscoveries(planFor(s0, SCENES), stored0, REGISTRY));
const b = JSON.stringify(applyDiscoveries(planFor(s0, SCENES), stored0, REGISTRY));
check('replaying a stored projection is stable', a === b);

/* 4 · a module withdrawn from the registry degrades, never throws */
const shrunk = REGISTRY.filter((m) => m.id !== stored0[0]?.moduleId);
let ok = true, scenes: ReturnType<typeof applyDiscoveries> = [];
try { scenes = applyDiscoveries(planFor(s0, SCENES), stored0, shrunk); } catch { ok = false; }
check('a withdrawn module degrades to the spine', ok && scenes.length > 0,
  `  (${scenes.length} scenes)`);
const ids = new Set(scenes.map((sc) => sc.id));
const dangling = scenes.flatMap((sc) => sc.choices).filter((c) => !ids.has(c.next));
check('and leaves no dangling edge behind it', dangling.length === 0, `  (${dangling.length})`);

console.log(failures === 0 ? '\n  compat: OK' : `\n  compat: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
