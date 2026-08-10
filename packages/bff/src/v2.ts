/**
 * SHOCKME · v2 wiring
 *
 * The seam between the BFF and the v2 engine pieces. It exists so index.ts
 * gains a handful of calls rather than three hundred lines, and so the rule
 * that decides whether a visit is a v2 visit lives in exactly one place.
 *
 * THAT RULE, and it is the whole backwards-compatibility story:
 *
 *     a session gains discovery rooms if and only if it has an
 *     `arrival_declared` event
 *
 * Every session already in the live database predates the Arrival Record and
 * therefore has none, so none of them can retroactively grow a room — which
 * is the one thing that would break "revisit your exact reality" on precisely
 * the visits most likely to be revisited. New sessions all have one, because
 * the record is now the way in. No flag, no migration, no backfill, and no
 * dead code path to delete later.
 */

import { planFor, type Floorplan } from '../../engine/src/experiences/floorplan.ts';
import { SCENES, type SceneDef } from '../../engine/src/experiences/waiting-room.ts';
import {
  planDiscoveries, applyDiscoveries, fingerprintOf,
  type VisitFacts, type Discovery, type RoomModule,
} from '../../engine/src/experiences/discovery.ts';
import { REGISTRY } from '../../engine/src/experiences/rooms-v2.ts';
import { materialise, bind, pinnedFor, type Materialised } from '../../engine/src/capsules.ts';
import { readArrival, misfileFor, anomalyFor, AUDIENCE_LINE, type ArrivalChoice, type ArrivalRecord } from '../../engine/src/experiences/arrival.ts';
import { claim } from '../../engine/src/claim.ts';
import { Rng } from '../../engine/src/rng.ts';
import type { Nedb } from '../../engine/src/nedb.ts';
import type { ExperienceEvent } from '../../engine/src/repo.ts';

/* ------------------------------------------------------------------ */
/* Facts, read only from the event log                                 */
/* ------------------------------------------------------------------ */

export function factsFrom(events: readonly ExperienceEvent[], consent: boolean, visitCount: number): VisitFacts {
  const decl = events.find((e) => e.kind === 'arrival_declared');
  const choices = events.filter((e) => e.kind === 'choice')
    .map((e) => String((e.payload as Record<string, unknown>)?.choiceId ?? ''));
  return {
    arrivalReading: (decl?.payload as Record<string, unknown> | undefined)?.choice as ArrivalChoice ?? null,
    choices,
    visited: events.filter((e) => e.kind === 'choice')
      .map((e) => String((e.payload as Record<string, unknown>)?.to ?? '')),
    counted: events.some((e) => e.kind === 'counted'),
    pressed: events.some((e) => e.kind === 'press'),
    consent,
    returning: visitCount > 0,
  };
}

export function hasArrived(events: readonly ExperienceEvent[]): boolean {
  return events.some((e) => e.kind === 'arrival_declared');
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

export interface V2Plan {
  plan: Floorplan;
  scenes: SceneDef[];
  discoveries: Discovery[];
  /** True when this session predates the Arrival Record. */
  preArrival: boolean;
}

/**
 * Build this visit's scene list.
 *
 * SESSIONS THAT PREDATE v2 STILL GET ROOMS. A session open at deploy time has
 * no `arrival_declared` event, so it plans with `arrivalReading: null` — and
 * the two reading-gated modules (Corrections Desk, File Room) exclude
 * themselves through their own `requires`. The other six are available to it.
 * No special case, no second code path: the gate that protects the invariant
 * is the same gate that decides eligibility.
 *
 * `stored` is the persisted projection when there is one, and it always wins.
 * Replay and refresh read it instead of planning again, so a deploy that adds
 * a module cannot change a visit that is already underway — and because we
 * persist immediately on first plan, a mid-flight session stops moving under
 * the visitor from the first render after the deploy.
 *
 * Old ARTIFACTS are a different matter and stay frozen: a shared certificate
 * names the rooms someone missed, and it would be lying if it silently gained
 * rooms they never entered. That is handled at the artifact, not here.
 */
export function planFrom(
  seed: string,
  events: readonly ExperienceEvent[],
  facts: VisitFacts,
  stored: Discovery[] | null,
): V2Plan {
  const plan = planFor(seed, SCENES);
  const preArrival = !hasArrived(events);
  if (stored) {
    return { plan, scenes: applyDiscoveries(plan, stored, REGISTRY), discoveries: stored, preArrival };
  }
  const out = planDiscoveries(seed, plan, facts, REGISTRY);
  return { plan, scenes: out.scenes, discoveries: out.projection.discoveries, preArrival };
}

/**
 * Persist the projection once, under a claim.
 *
 * The claim is not about concurrency between visitors — it is about the same
 * visitor with two tabs open. Both would plan identically, but only one row
 * should be the record of it, and whichever one wins is the one everything
 * afterwards reads.
 */
export async function persistProjection(
  db: Nedb, sessionId: string, discoveries: Discovery[], causedBy: string[] = [],
): Promise<void> {
  const fp = fingerprintOf(discoveries);
  const c = await claim(db, { stream: 'projection', fingerprint: `${sessionId}:${fp}`, meta: { sessionId } });
  if (!c.won) return;
  await db.put('projections', `proj:${sessionId}`, {
    sessionId, fingerprint: fp, discoveries, at: Date.now(),
  }, causedBy);
}

export async function loadProjection(db: Nedb, sessionId: string): Promise<Discovery[] | null> {
  const row = await db.one(`FROM projections WHERE sessionId = "${sessionId}"`);
  if (!row) return null;
  return (row.discoveries as Discovery[]) ?? [];
}

/* ------------------------------------------------------------------ */
/* Rendering a discovered room                                         */
/* ------------------------------------------------------------------ */

export interface DiscoveryView {
  lines: string[];
  heading?: string;
  inscription?: string;
  margin?: string;
  objectLabel?: string;
  witness?: string;
  provisional?: string;
  records?: { factual: string; reading: string };
}

export function moduleForScene(sceneId: string): RoomModule | undefined {
  return REGISTRY.find((m) => m.scene.id === sceneId);
}

/**
 * Assemble a discovered room for the renderer.
 *
 * `caps` is what materialise() produced when the discovery became eligible —
 * or the authored fallbacks if the model was cold. Either way this function
 * does no I/O and cannot block a paint.
 *
 * The naming room's own word, once given, replaces the bound token everywhere
 * from that point on. That word came from the visitor, so it is used verbatim
 * in authored copy and is never sent anywhere a prompt or a share card can
 * reach it.
 */
export function viewForDiscovery(
  seed: string,
  sceneId: string,
  discovery: Discovery,
  caps: Materialised,
  opts: { anomaly?: string; misfileAction?: string; misfileFactual?: string; givenName?: string } = {},
): DiscoveryView | undefined {
  const m = moduleForScene(sceneId);
  if (!m) return undefined;
  const variant = m.variants.find((v) => v.id === discovery.variant) ?? m.variants[0]!;

  const tokens = { ...caps.tokens };
  const provisional = tokens['{object}'];
  if (opts.givenName) tokens['{object}'] = opts.givenName;

  const view: DiscoveryView = {
    lines: bind(variant.lines, tokens),
    heading: caps.heading,
    inscription: caps.texture.inscription,
    margin: caps.texture.margin,
    objectLabel: caps.texture.object_label,
    witness: caps.texture.witness_fragment,
    provisional,
  };

  /*
   * THE HONEST MISFILE. Only ever built from an action the log contains —
   * `misfileAction` is derived from real events by the caller, never guessed
   * here. The left column is quoted exactly; the right is labelled as the
   * room's reading and is allowed to be wrong about what it meant.
   */
  if (opts.anomaly === 'misfile' && opts.misfileAction && opts.misfileFactual) {
    view.records = misfileFor(seed, opts.misfileAction as 'counted', opts.misfileFactual);
  }

  /*
   * THE AUDIENCE. Consent-gated upstream; this only renders the line. It never
   * names a platform, never keeps a URL, and never attributes a voice.
   */
  if (opts.anomaly === 'audience' && sceneId === 'others' && !view.witness) {
    view.witness = AUDIENCE_LINE;
  }

  return view;
}

export { readArrival, anomalyFor, materialise, pinnedFor };
export type { ArrivalRecord, Materialised };
