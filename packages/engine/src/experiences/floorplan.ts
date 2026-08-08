/**
 * SHOCKME · the floorplan
 *
 * Oracle #5: "The claim that every visitor gets a different room is powerful.
 * The differences should occasionally exceed prose variation... The player
 * should be able to compare two permalink artifacts and see that they are
 * STRUCTURALLY different, not only linguistically different."
 *
 * This was the largest gap in the product and the most load-bearing, because
 * the promise on the front page is "You didn't find the same website they did"
 * and until now that was true of the WORDS and false of everything else. There
 * was exactly one SCENES array. Every visitor walked an identical graph, with
 * an identical two-button rhythm at every step, differing only in which
 * sentence got picked from which pool.
 *
 * So the graph is no longer a constant. It is derived from the session seed,
 * and four things about it vary:
 *
 *   1. ROOM ORDER. The wings run in either order — ledger then recital, or
 *      recital then ledger. Two visitors describing "the room with the
 *      numbers" will not agree on when it happened.
 *
 *   2. BRANCH ACCESS. Sometimes the corridor has a THIRD door, which leads
 *      somewhere most people never see. Sometimes one wing is simply not
 *      offered, and the corridor's two choices both go the same way — the
 *      Oracle's "both choices produce different text but the same action",
 *      which costs nothing and is quietly horrible.
 *
 *   3. CHOICE COUNT. Not every room offers two. Some offer one, which breaks
 *      the grammar the player has learned by then and makes the single
 *      remaining option feel like the room has decided for them.
 *
 *   4. THE OFFICE. A room roughly one visitor in six ever reaches. Its whole
 *      job is to be the thing in your artifact that somebody else's artifact
 *      does not have.
 *
 * THE HARD CONSTRAINT: whatever this generates must still be a valid graph —
 * every room reachable, no dead ends, every path terminating at the artifact.
 * A structural generator that produces a stranded visitor is strictly worse
 * than no generator, and "it got stuck here" is a bug M has already hit once.
 * floorplan.test.ts walks every seed's graph and asserts all of it.
 */

import { Rng } from '../rng.ts';
import type { SceneDef } from './waiting-room.ts';

/* ------------------------------------------------------------------ */
/* Visual variation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Oracle: "a missing border, altered cursor, changed light, extra chair."
 *
 * Deliberately subtle. None of these are announced and none of them change
 * what anything MEANS — they are there so that two people looking at
 * screenshots side by side find something they cannot quite account for.
 */
export interface Variant {
  /** Body class. Drives light level, borders, cursor. */
  skin: 'plain' | 'unlit' | 'borderless' | 'tight' | 'wide';
  /** The room's chairs are not always drawn the same way. */
  chairs: 'upright' | 'low' | 'thin';
  /** Some rooms hum. Some do not. */
  hum: boolean;
}

export interface Floorplan {
  scenes: SceneDef[];
  variant: Variant;
  /** True when this visitor can reach the office. Most cannot. */
  hasOffice: boolean;
  /** Human-readable, for the artifact's structural boast. */
  shape: string;
}

/* ------------------------------------------------------------------ */
/* The office — the room most people never find                        */
/* ------------------------------------------------------------------ */

const OFFICE: SceneDef = {
  id: 'office',
  renderer: 'office',
  choices: [
    { id: 'sign', label: 'Sign it', next: 'threshold' },
    { id: 'unsign', label: 'Leave it blank', next: 'threshold' },
  ],
};

export const OFFICE_LINES = [
  'There is a desk in here. There is no chair for it.',
  'Somebody has been processing the visits. They are behind.',
  'There is a form on the desk with your position already filled in.',
  'The office was not on the plan. It is on the plan now.',
];

/**
 * Build this visitor's floorplan.
 *
 * `base` is the canonical scene list; everything here is a transformation of
 * it rather than a parallel definition, so the copy in the existing rooms is
 * never duplicated and cannot drift.
 */
export function planFor(seed: string, base: readonly SceneDef[]): Floorplan {
  const r = new Rng(seed, 'floorplan');
  const scenes: SceneDef[] = base.map((s) => ({ ...s, choices: s.choices.map((c) => ({ ...c })) }));
  const find = (id: string) => scenes.find((s) => s.id === id);

  const notes: string[] = [];

  /* --- 1. the wings can run in either order --- */
  const swapped = r.bool(0.5);
  if (swapped) {
    const corridor = find('corridor')!;
    const ledger = find('ledger')!;
    const recital = find('recital')!;
    const inventory = find('inventory')!;
    const dark = find('dark')!;

    // wing A becomes recital -> ledger, wing B becomes dark -> inventory
    corridor.choices[0]!.next = 'recital';
    recital.choices.forEach((c) => { c.next = 'ledger'; });
    ledger.choices.forEach((c) => { c.next = 'threshold'; });

    corridor.choices[1]!.next = 'dark';
    dark.choices.forEach((c) => { c.next = 'inventory'; });
    inventory.choices.forEach((c) => { c.next = 'threshold'; });
    notes.push('reversed');
  }

  /* --- 2. the office, for the few --- */
  const hasOffice = r.bool(0.17);
  if (hasOffice) {
    scenes.splice(scenes.length - 1, 0, { ...OFFICE, choices: OFFICE.choices.map((c) => ({ ...c })) });
    find('corridor')!.choices.push({ id: 'sideways', label: 'Try the door nobody mentioned', next: 'office' });
    notes.push('office');
  }

  /*
   * --- 3. both doors, one destination ---
   *
   * The Oracle's "a room where both choices produce different text but the
   * same action". Only when the office is absent, so a visitor is never
   * offered three doors of which two are the same — that reads as a bug
   * rather than as the room being strange.
   */
  if (!hasOffice && r.bool(0.22)) {
    const corridor = find('corridor')!;
    corridor.choices[1]!.next = corridor.choices[0]!.next;
    notes.push('one-way');
  }

  /*
   * --- 4. a room that offers only one thing ---
   *
   * Breaks the two-button grammar the player has learned by the fourth room.
   * Never applied to the corridor (that is the fork that makes the graph wide)
   * and never to the threshold (that is the gate).
   */
  const CAN_NARROW = ['ledger', 'recital', 'inventory', 'dark'];
  if (r.bool(0.3)) {
    const target = find(r.pick(CAN_NARROW));
    if (target && target.choices.length > 1) {
      target.choices = [r.pick(target.choices)];
      notes.push(`narrow:${target.id}`);
    }
  }

  /*
   * PRUNE, ALWAYS, LAST.
   *
   * The one-way corridor sends both doors into the same wing, which leaves the
   * other wing with nothing pointing at it. floorplan.test.ts caught this
   * immediately: 152 failures, "inventory unreachable / dark unreachable".
   *
   * The fix is not to weaken the variation — it is to take the orphaned rooms
   * OUT. If no door in your building opens onto the dark, then for you there
   * is no dark. That is a better answer than the bug: it means some visitors
   * genuinely have fewer rooms than others, which is the whole point of this
   * file, and it keeps the invariant that every room in a plan is reachable
   * TRUE BY CONSTRUCTION rather than by careful authoring.
   *
   * The artifact still counts against the canonical 12, so a pruned visitor is
   * honestly told they found 6 of 12 — some of which were never on offer.
   */
  const reachable = new Set<string>();
  const walk = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const c of scenes.find((x) => x.id === id)?.choices ?? []) walk(c.next);
  };
  walk('arrival');
  const pruned = scenes.filter((s2) => reachable.has(s2.id));
  if (pruned.length !== scenes.length) notes.push(`pruned:${scenes.length - pruned.length}`);

  const variant: Variant = {
    skin: r.weighted([['plain', 6], ['unlit', 2], ['borderless', 2], ['tight', 1], ['wide', 1]] as const),
    chairs: r.weighted([['upright', 6], ['low', 2], ['thin', 2]] as const),
    hum: r.bool(0.4),
  };

  return {
    scenes: pruned,
    variant,
    hasOffice,
    shape: notes.length ? notes.join('+') : 'standard',
  };
}

/** Scene lookup within a specific visitor's floorplan. */
export function sceneIn(plan: Floorplan, id: string): SceneDef | undefined {
  return plan.scenes.find((s) => s.id === id);
}
