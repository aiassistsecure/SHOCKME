/**
 * SHOCKME · the discovery registry
 *
 * v1 had one graph, mutated four ways per visitor (floorplan.ts). That made
 * two visits structurally different. It could not make them CONTAIN different
 * things, because there were only ever thirteen rooms to contain.
 *
 * This is the other half: a versioned, unbounded catalogue of room modules
 * that become eligible through things the visitor actually did, occupy an
 * existing edge, and rejoin the core. The registry can grow forever. A visit
 * cannot.
 *
 *     New rooms spend visit budget. They never extend the default spine.
 *
 * That rule is the whole design. A catalogue that appends "one more room" to
 * the tail turns a tight seven-minute experience into a corridor simulator,
 * and the thing people forward to a friend stops being forwardable. So a
 * module REPLACES an edge: the door you were going to walk through now leads
 * somewhere else first, and that somewhere returns you exactly where the door
 * was going to put you.
 *
 * REJOIN IS CORRECT BY CONSTRUCTION, not by authoring. We capture the edge's
 * original destination and use it as the module's exit. A module cannot strand
 * a visitor even if its author forgets to think about it — the same trick
 * floorplan.ts used with pruning, and for the same reason: an invariant you
 * have to remember is an invariant you will eventually forget.
 *
 * WHAT IMAGINE MAY AND MAY NOT DO HERE
 * ------------------------------------
 * A module declares SLOTS. The model fills slots with short language. The
 * engine owns every rule: which rooms exist, what a choice does, where it
 * goes, what counts as budget. A generated label can rename a door; it can
 * never move one. That boundary is what keeps the whole thing testable.
 */

import { Rng } from '../rng.ts';
import type { SceneDef, Choice } from './waiting-room.ts';
import type { Floorplan } from './floorplan.ts';

/* ------------------------------------------------------------------ */
/* Slots — where the model is allowed to write                         */
/* ------------------------------------------------------------------ */

/**
 * Six surfaces. Texture is the brief's prose capsule and stays capped at two.
 * The rest are not prose: a noun, a button's wording, a heading, a drawing.
 *
 * BOUND TOKENS ARE THE LEVERAGE. One validated 2-4 word noun, substituted into
 * four or five authored sentences and carried into later rooms and the
 * artifact. The model writes three words; the engine writes the prose. That
 * buys per-visit uniqueness without a single generated paragraph, and it keeps
 * every sentence in the product reviewable.
 */
export type SlotKind =
  | 'inscription'      // 5-16 words · already written on the wall or the desk
  | 'margin'           // 3-12 words · the room's quiet, fallible annotation
  | 'object_label'     // 2-6 words  · the name of a thing that needs no name
  | 'witness_fragment' // 6-18 words · overheard, causally adjacent
  | 'bound_token'      // 2-4 words  · substituted into authored copy, propagates
  | 'choice_label'     // 2-5 words  · the wording of a door, never its destination
  | 'heading'          // 2-4 words  · what the room calls itself
  | 'figure'           // the room attempts to draw its own object
  | 'artifact_line';   // one sentence about this room on the share card

export interface SlotDecl {
  kind: SlotKind;
  /** Authored, pre-reviewed, deterministic. Used when the model is cold,
   *  rejected, or beaten to the claim. Never a hole. */
  fallback: readonly string[];
  /** For bound_token: the placeholder this fills, e.g. `{object}`. */
  token?: string;
}

/* ------------------------------------------------------------------ */
/* Facts — the only things a module may be eligible on                 */
/* ------------------------------------------------------------------ */

/**
 * Same-visit, already-persisted facts. Deliberately NOT: wall-clock races,
 * unrecorded browser behaviour, or anything about another visitor.
 *
 * `arrivalReading` is null for every session that predates the Arrival Record
 * — which is every session currently in the live database. A module that
 * requires a reading is simply not eligible for those visits. No migration,
 * no backfill, and an old artifact permalink renders exactly as it always did.
 */
export interface VisitFacts {
  arrivalReading: 'found' | 'followed' | 'taken' | null;
  /** Choice ids in order, e.g. ['count', 'left']. */
  choices: readonly string[];
  /** Scene ids already entered. */
  visited: readonly string[];
  counted: boolean;
  pressed: boolean;
  consent: boolean;
  returning: boolean;
}

export const NO_FACTS: VisitFacts = {
  arrivalReading: null, choices: [], visited: [],
  counted: false, pressed: false, consent: false, returning: false,
};

/* ------------------------------------------------------------------ */
/* A module                                                            */
/* ------------------------------------------------------------------ */

export interface LogicVariant {
  id: string;
  /** Weight within this module. Deterministic pick from a namespaced stream. */
  weight: number;
  /**
   * The room's authored body for THIS variant. `{object}` and friends are
   * bound-token placeholders, substituted once per visit and then fixed.
   *
   * Copy lives on the variant rather than the module because a logic variant
   * is supposed to be a different room, not the same room wearing a hat.
   */
  lines: readonly string[];
  /** Per-variant choice wording. Ids and destinations are never overridden. */
  labels?: Record<string, string>;
}

export interface RoomModule {
  id: string;
  version: number;
  /** Exclusive family. A visit gets ONE strong record room, not all of them. */
  group: string;
  /** How much of the visit budget entering this room costs. Normally 1. */
  cost: number;
  /** Base likelihood once eligible. Kept low — a discovery everyone gets is a
   *  corridor, and the artifact line "one door was not entered" has to stay true. */
  chance: number;
  /** Which edge it occupies: a scene, and optionally a specific choice on it. */
  replace: { scene: string; choice?: string };
  /** Factual preconditions. All must hold. */
  requires?: (f: VisitFacts) => boolean;
  /** Authored alternatives — different rules, reveals, exits. */
  variants: readonly LogicVariant[];
  /** The room itself. `next` is filled in by the planner, never by the author. */
  scene: Omit<SceneDef, 'choices'> & { choices: Omit<Choice, 'next'>[] };
  slots: readonly SlotDecl[];
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

export interface Discovery {
  moduleId: string;
  version: number;
  variant: string;
  /** The edge we took over, and where the room returns to. */
  replacedScene: string;
  replacedChoice: string;
  rejoin: string;
}

export interface Projection {
  discoveries: Discovery[];
  /** Longest path through the resulting graph. */
  depth: number;
  /** The ceiling this visit was held to — base depth + GROWTH_ALLOWANCE. */
  budget: number;
  /** Covers modules, variants and edges — the thing replay must reproduce. */
  fingerprint: string;
}

/**
 * The pacing ceiling.
 *
 * MEASURED, and it contradicts the brief: the brief says a visit is 5-8 rooms,
 * but the existing v1 graph's LONGEST path is 9 scenes. 5-8 describes the
 * typical walk, not the worst case. A hard ceiling of 8 therefore rejected
 * every single discovery — 400 seeds, zero rooms admitted, silently, because
 * "budget exceeded" and "no module was eligible" look identical from outside.
 *
 * So the budget is RELATIVE to the visitor's own plan: a discovery may not push
 * the longest path more than one scene beyond where that plan already sat. A
 * visit gains at most one room in depth no matter how many modules qualify,
 * which is what "spends the budget" has to mean in practice. GROWTH_ALLOWANCE
 * is the whole pacing lever and it is deliberately one.
 */
export const GROWTH_ALLOWANCE = 1;

/** Absolute backstop, so a future floorplan change cannot quietly sprawl. */
export const MAX_SCENES = 12;

/** Longest path from `arrival` to a terminal scene. Cycles are counted once. */
export function depthOf(scenes: readonly SceneDef[], from = 'arrival'): number {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const walk = (id: string, seen: Set<string>): number => {
    const s = byId.get(id);
    if (!s || s.choices.length === 0 || seen.has(id)) return 1;
    const next = new Set(seen).add(id);
    return 1 + Math.max(...s.choices.map((c) => walk(c.next, next)));
  };
  return walk(from, new Set());
}

/**
 * Choose this visit's discoveries and splice them into the plan.
 *
 * Determinism rules that matter more than they look:
 *   - modules are sorted by id before evaluation, so registration order (and
 *     therefore import order, and therefore a file rename) can never decide
 *     what a visitor sees;
 *   - each module draws from its OWN namespaced stream, so adding a module in
 *     October cannot shift the outcome of one shipped in August.
 */
export function planDiscoveries(
  seed: string,
  plan: Floorplan,
  facts: VisitFacts,
  registry: readonly RoomModule[],
): { scenes: SceneDef[]; projection: Projection } {
  const scenes: SceneDef[] = plan.scenes.map((s) => ({ ...s, choices: s.choices.map((c) => ({ ...c })) }));
  const discoveries: Discovery[] = [];
  const usedGroups = new Set<string>();

  // The visitor's own starting depth. Everything below is measured against it.
  const budget = Math.min(depthOf(scenes) + GROWTH_ALLOWANCE, MAX_SCENES);

  /*
   * ORDER BY SEEDED PRIORITY, NOT BY NAME.
   *
   * Sorting by id gave determinism and a serious bias with it: the budget is
   * finite, so whoever is evaluated first takes it. Measured over 2000 seeds,
   * `antechamber` (alphabetically first) landed 1202 times and `office-v2`
   * (last) landed 5. The alphabet was choosing the visitor's experience.
   *
   * Each module now draws a priority from ITS OWN namespace, so the order is
   * shuffled per visitor while every module's number stays independent of
   * which other modules exist. Determinism holds, and adding one in October
   * still cannot move one shipped in August.
   */
  const ordered = [...registry]
    .map((m) => ({ m, pri: new Rng(seed, `discover-order:${m.id}@${m.version}`).float() }))
    .sort((a, b) => a.pri - b.pri || a.m.id.localeCompare(b.m.id))
    .map((x) => x.m);

  for (const m of ordered) {
    if (usedGroups.has(m.group)) continue;
    if (m.requires && !m.requires(facts)) continue;

    const host = scenes.find((s) => s.id === m.replace.scene);
    if (!host) continue;                       // the edge isn't in this floorplan
    const edge = m.replace.choice
      ? host.choices.find((c) => c.id === m.replace.choice)
      : host.choices[0];
    if (!edge) continue;
    if (scenes.some((s) => s.id === m.scene.id)) continue;  // already present

    const r = new Rng(seed, `discover:${m.id}@${m.version}`);
    if (!r.bool(m.chance)) continue;

    const variant = r.weighted(m.variants.map((v) => [v.id, v.weight] as const));

    /*
     * Rejoin is the edge's ORIGINAL destination. Authors do not get to choose
     * it and therefore cannot get it wrong.
     */
    const rejoin = edge.next;
    const room: SceneDef = {
      ...m.scene,
      choices: m.scene.choices.map((c) => ({ ...c, next: rejoin })),
    };

    // Speculative splice, then verify the budget. Cheaper than predicting it.
    const trial = [...scenes, room];
    const trialEdge = trial.find((s) => s.id === host.id)!.choices.find((c) => c.id === edge.id)!;
    const before = trialEdge.next;
    trialEdge.next = room.id;
    if (depthOf(trial) > budget) { trialEdge.next = before; continue; }

    scenes.push(room);
    edge.next = room.id;
    usedGroups.add(m.group);
    discoveries.push({
      moduleId: m.id, version: m.version, variant,
      replacedScene: host.id, replacedChoice: edge.id, rejoin,
    });
  }

  return { scenes, projection: { discoveries, depth: depthOf(scenes), budget, fingerprint: fingerprintOf(discoveries) } };
}

export function fingerprintOf(discoveries: readonly Discovery[]): string {
  return discoveries
    .map((d) => `${d.moduleId}@${d.version}/${d.variant}/${d.replacedScene}:${d.replacedChoice}`)
    .join('|') || 'core';
}

/**
 * Rebuild a plan from a PERSISTED projection instead of planning again.
 *
 * This is what replay and refresh use. Re-planning would be almost right —
 * same seed, same facts, same answer — and "almost right" is the wrong
 * standard here: the registry is versioned and will grow, so a visit revisited
 * after a deploy would quietly become a different visit. The persisted
 * discovery event is the source of truth, exactly as the brief requires.
 *
 * A module that has since been removed from the registry is skipped rather
 * than faked, and the edge simply reverts to where it always went — so an old
 * artifact permalink degrades to the core spine instead of erroring.
 */
export function applyDiscoveries(
  plan: Floorplan,
  stored: readonly Discovery[],
  registry: readonly RoomModule[],
): SceneDef[] {
  const scenes: SceneDef[] = plan.scenes.map((s) => ({ ...s, choices: s.choices.map((c) => ({ ...c })) }));
  for (const d of stored) {
    const m = registry.find((x) => x.id === d.moduleId && x.version === d.version);
    if (!m) continue;
    const host = scenes.find((s) => s.id === d.replacedScene);
    const edge = host?.choices.find((c) => c.id === d.replacedChoice);
    if (!host || !edge) continue;
    if (scenes.some((s) => s.id === m.scene.id)) continue;
    scenes.push({ ...m.scene, choices: m.scene.choices.map((c) => ({ ...c, next: d.rejoin })) });
    edge.next = m.scene.id;
  }
  return scenes;
}
