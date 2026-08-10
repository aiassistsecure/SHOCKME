/**
 * SHOCKME · the discovery registry
 *
 * The gates from the brief §3.1, as assertions rather than intentions:
 *   fixed seed + same facts  -> same rooms
 *   an unrelated new module  -> cannot change existing plans
 *   every injected path      -> terminates, rejoins, stays in budget
 *   no single visit          -> reaches the whole catalogue
 *   every registered room    -> reachable somewhere in the matrix
 */

import { planFor } from '../src/experiences/floorplan.ts';
import { SCENES } from '../src/experiences/waiting-room.ts';
import { planDiscoveries, depthOf, GROWTH_ALLOWANCE, NO_FACTS, type VisitFacts, type RoomModule } from '../src/experiences/discovery.ts';
import { REGISTRY } from '../src/experiences/rooms-v2.ts';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${label.padEnd(42)} ${ok ? 'PASS' : 'FAIL'} ${detail}`);
};

const FACTS: VisitFacts = {
  arrivalReading: 'followed', choices: ['count', 'left'], visited: ['arrival', 'counting'],
  counted: true, pressed: true, consent: true, returning: false,
};

const SEEDS = Array.from({ length: 400 }, (_, i) => `seed_${i}`);
const plans = SEEDS.map((s) => {
  const base = planFor(s, SCENES);
  return { seed: s, ...planDiscoveries(s, base, FACTS, REGISTRY) };
});

/* determinism */
const twice = planDiscoveries(SEEDS[7]!, planFor(SEEDS[7]!, SCENES), FACTS, REGISTRY);
check('same seed + facts → same projection',
  twice.projection.fingerprint === plans[7]!.projection.fingerprint);

/* an unrelated module must not disturb existing outcomes */
const NEWCOMER: RoomModule = {
  id: 'zzz-newcomer', version: 1, group: 'unrelated', cost: 1, chance: 0.9,
  replace: { scene: 'threshold' },
  scene: { id: 'zzz', renderer: 'discovery', choices: [{ id: 'on', label: 'Continue' }] },
  variants: [{ id: 'only', weight: 1, lines: ['A room that did not exist last week.'] }],
  slots: [],
};
const withNewcomer = SEEDS.map((s) => planDiscoveries(s, planFor(s, SCENES), FACTS, [...REGISTRY, NEWCOMER]));

/*
 * WHAT NON-INTERFERENCE CAN AND CANNOT MEAN.
 *
 * This used to assert that adding a module changes NOTHING about the others,
 * and it passed — because the fixture was called `zzz-newcomer`, modules were
 * evaluated in alphabetical order, and it therefore sorted last and could
 * never take budget from anyone. A test that only holds because of the name of
 * its own fixture is not a test.
 *
 * The visit budget is finite and shared, so a new room genuinely does compete
 * for it. That is exactly what "additions spend the visit budget" means; the
 * alternative is a catalogue that lengthens the visit, which is the thing the
 * whole design exists to prevent.
 *
 * The invariant that IS load-bearing: every module's own decision — whether it
 * qualifies, and which authored variant it runs — comes from its own seeded
 * namespace and is untouched by what else is registered. A module never
 * changes another module's CONTENT; it can only win or lose the same budget.
 */
let variantDrift = 0, appearedBoth = 0;
plans.forEach((p, i) => {
  const after = new Map(withNewcomer[i]!.projection.discoveries.map((d) => [d.moduleId, d.variant]));
  for (const d of p.projection.discoveries) {
    const a = after.get(d.moduleId);
    if (a === undefined) continue;          // lost the budget race — legitimate
    appearedBoth++;
    if (a !== d.variant) variantDrift++;    // changed its content — never legitimate
  }
});
check('a new module never alters another\'s variant', variantDrift === 0,
  `  (${appearedBoth} co-occurrences, ${variantDrift} drifted)`);

const rollOf = (id: string, seed: string) =>
  planDiscoveries(seed, planFor(seed, SCENES), FACTS, REGISTRY.filter((m) => m.id === id))
    .projection.discoveries.map((d) => d.variant).join('');
const soloStable = SEEDS.slice(0, 60).every((s) => {
  const solo = rollOf('naming', s);
  const inCrowd = planDiscoveries(s, planFor(s, SCENES), FACTS, [...REGISTRY, NEWCOMER])
    .projection.discoveries.find((d) => d.moduleId === 'naming')?.variant;
  return inCrowd === undefined || inCrowd === solo;
});
check('a module decides the same alone or in a crowd', soloStable, '  (60 seeds)');

/* budget, termination, rejoin */
const overBudget = plans.filter((p) => p.projection.depth > p.projection.budget);
check('never exceeds its own visit budget', overBudget.length === 0,
  `  (depth ≤ base+${GROWTH_ALLOWANCE}, max ${Math.max(...plans.map((p) => p.projection.depth))})`);

const grew = plans.filter((p, i) => p.projection.depth > depthOf(planFor(SEEDS[i]!, SCENES).scenes) + GROWTH_ALLOWANCE);
check('a visit grows by at most one scene', grew.length === 0, `  (${grew.length})`);

let dangling = 0, unreachable = 0, terminates = 0;
for (const p of plans) {
  const ids = new Set(p.scenes.map((s) => s.id));
  for (const s of p.scenes) for (const c of s.choices) if (!ids.has(c.next)) dangling++;
  // reachability from arrival
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const c of p.scenes.find((x) => x.id === id)?.choices ?? []) walk(c.next);
  };
  walk('arrival');
  for (const s of p.scenes) if (!seen.has(s.id)) unreachable++;
  if (seen.has('artifact') || seen.has('end')) terminates++;
}
check('no choice points at a missing scene', dangling === 0, `  (${dangling})`);
check('no orphaned rooms', unreachable === 0, `  (${unreachable})`);
check('every plan reaches the ending', terminates === plans.length, `  (${terminates}/${plans.length})`);

/* rejoin correctness — a module's exits go where the edge it took over went */
const sceneIdOf = new Map(REGISTRY.map((m) => [m.id, m.scene.id]));
let badRejoin = 0, badTakeover = 0, checked = 0;
for (const p of plans) {
  for (const d of p.projection.discoveries) {
    checked++;
    const room = p.scenes.find((s) => s.id === sceneIdOf.get(d.moduleId));
    // The room must exist, and every exit must land on the replaced edge's
    // original destination — that is what makes rejoin true by construction.
    if (!room || !room.choices.length || !room.choices.every((c) => c.next === d.rejoin)) badRejoin++;
    // And the edge we claimed must now point AT the room.
    const host = p.scenes.find((s) => s.id === d.replacedScene);
    const edge = host?.choices.find((c) => c.id === d.replacedChoice);
    if (!edge || edge.next !== room?.id) badTakeover++;
  }
}
check('discoveries rejoin the edge they replaced', badRejoin === 0, `  (${badRejoin} of ${checked})`);
check('the replaced edge points at the new room', badTakeover === 0, `  (${badTakeover} of ${checked})`);

/* group exclusivity */
const groupOf = new Map(REGISTRY.map((m) => [m.id, m.group]));
const doubled = plans.filter((p) => {
  const gs = p.projection.discoveries.map((d) => groupOf.get(d.moduleId));
  return gs.length !== new Set(gs).size;
});
check('one module per group per visit', doubled.length === 0, `  (${doubled.length} violations)`);

/* catalogue coverage, both directions */
const everSeen = new Set(plans.flatMap((p) => p.projection.discoveries.map((d) => d.moduleId)));
check('every registered room is reachable', everSeen.size === REGISTRY.length,
  `  (${everSeen.size}/${REGISTRY.length})`);
const maxPerVisit = Math.max(...plans.map((p) => p.projection.discoveries.length));
check('no visit reaches the whole catalogue', maxPerVisit < REGISTRY.length,
  `  (most in one visit: ${maxPerVisit})`);

/* backwards compatibility — the live database is full of these */
const legacy = planDiscoveries('legacy_seed', planFor('legacy_seed', SCENES), NO_FACTS, REGISTRY);
const needsReading = legacy.projection.discoveries.filter((d) => d.moduleId === 'corrections' || d.moduleId === 'file-room');
check('sessions with no arrival reading still plan', legacy.projection.depth >= 3, `  (depth ${legacy.projection.depth})`);
check('reading-gated rooms stay out of legacy visits', needsReading.length === 0);

/* variety — the actual product claim */
const shapes = new Set(plans.map((p) => p.projection.fingerprint));
const withAny = plans.filter((p) => p.projection.discoveries.length > 0).length;
console.log(`\n  distinct projections : ${shapes.size} across ${plans.length} seeds`);
console.log(`  visits with a discovery: ${((withAny / plans.length) * 100).toFixed(0)}%`);
console.log(`  depth range          : ${Math.min(...plans.map((p) => p.projection.depth))}-${Math.max(...plans.map((p) => p.projection.depth))} scenes`);

console.log(failures === 0 ? '\n  discovery: OK' : `\n  discovery: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
