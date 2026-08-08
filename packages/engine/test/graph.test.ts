/**
 * The scene graph must never strand anybody.
 *
 * The second half nearly tripled the number of rooms and introduced a FORK,
 * which is exactly the shape that produces an unreachable room or a scene with
 * no way out. Both failures are invisible in dev — you only find them when a
 * real visitor lands on a screen with no buttons, which is precisely what M
 * hit once already ("After playing the game it got stuck here").
 */

import { SCENES, INITIAL_SCENE } from '../src/experiences/waiting-room.ts';
import { ALL_ROOM_IDS, TOTAL_ROOMS, ROOM_NAMES, missedRooms } from '../src/experiences/second-half.ts';

const ids = new Set(SCENES.map((s) => s.id));
let fail = 0;
const bad = (m: string) => { fail++; console.log('  ' + m); };

// 1. every choice points somewhere real
for (const s of SCENES) {
  for (const c of s.choices) if (!ids.has(c.next)) bad(`${s.id} -> ${c.next} does not exist`);
}
// 2. nothing except the ending is a dead end
for (const s of SCENES) if (s.id !== 'end' && !s.choices.length) bad(`${s.id} has no way out`);

// 3. every room is reachable from the front door
const seen = new Set<string>();
const walk = (id: string) => {
  if (seen.has(id)) return;
  seen.add(id);
  for (const c of SCENES.find((s) => s.id === id)?.choices ?? []) walk(c.next);
};
walk(INITIAL_SCENE);
for (const s of SCENES) if (!seen.has(s.id)) bad(`${s.id} is unreachable`);

// 4. every path terminates at the artifact
for (const s of SCENES) {
  const reach = new Set<string>();
  const w = (id: string) => { if (reach.has(id)) return; reach.add(id);
    for (const c of SCENES.find((x) => x.id === id)?.choices ?? []) w(c.next); };
  w(s.id);
  if (!reach.has('end')) bad(`${s.id} cannot reach the ending`);
}

// 5. the room count the artifact quotes must be the truth
for (const id of ALL_ROOM_IDS) {
  if (!ids.has(id)) bad(`ALL_ROOM_IDS claims ${id}, which is not a scene`);
  if (!ROOM_NAMES[id]) bad(`${id} has no human name`);
}
const realRooms = SCENES.filter((s) => s.id !== 'end').length;
if (realRooms !== TOTAL_ROOMS) bad(`TOTAL_ROOMS says ${TOTAL_ROOMS}, graph has ${realRooms}`);

// 6. THE FORK: no single run may see every room — that is the whole hook
const longest = (() => {
  let best: string[] = [];
  const w = (id: string, path: string[]) => {
    if (path.includes(id)) return;
    const p = [...path, id];
    const cs = SCENES.find((s) => s.id === id)?.choices ?? [];
    if (!cs.length) { if (p.length > best.length) best = p; return; }
    for (const c of cs) w(c.next, p);
  };
  w(INITIAL_SCENE, []);
  return best.filter((x) => x !== 'end');
})();
if (longest.length >= TOTAL_ROOMS) bad(`a single run sees all ${TOTAL_ROOMS} rooms — nothing left to come back for`);
const missed = missedRooms(longest);
if (!missed.length) bad('the best possible run misses nothing');

console.log(`  ${SCENES.length} scenes, longest single run ${longest.length}/${TOTAL_ROOMS} rooms`);
console.log(`  always missed at least: ${missed.slice(0, 3).join(', ')}`);
console.log(`  graph — ${fail ? `FAIL ${fail}` : 'PASS reachable, no dead ends, fork holds'}`);
if (fail) process.exit(1);
