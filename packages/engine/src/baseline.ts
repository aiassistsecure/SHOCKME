/**
 * SHOCKME · the pre-reset baseline
 *
 * WHAT HAPPENED. On 2026-08-14 a DigitalOcean API key was compromised and the
 * box was rebuilt. The NEDB store went with it. About 997 people had played;
 * the log recording them is gone and there is no usable snapshot.
 *
 * WHY THIS FILE EXISTS INSTEAD OF 996 FAKE VISITOR ROWS.
 *
 * The obvious fix is to mint visitors until the counter reads right. It does
 * not work, and the reason is worth writing down because it is a product
 * failure and not a scruple:
 *
 *   - `finished` counts sessions with a choice->end event. Fabricated visitors
 *     have no events, so the room would announce "997 people have been in this
 *     room. 1 of them reached the end." That is worse than the truth.
 *   - the funnel would show ~997 arrivals and ~0 choices: a 99.9% bounce rate
 *     in the one number the back room says matters most early.
 *   - medianMs would collapse toward zero, breaking "most people last 6
 *     seconds" and the long-stay sting, both of which quote it.
 *   - the recital quotes REAL utterances. Fabricated visitors have none.
 *   - the store is append-only. Those rows could never be removed again.
 *
 * So the fabrication is not merely dishonest, it is LOAD-BEARING dishonest: it
 * breaks the mechanisms that read the same numbers. The room's whole effect
 * rests on every figure it quotes being true, which is why sting.ts refuses to
 * fire when a fact is missing rather than guessing.
 *
 * WHAT THIS DOES INSTEAD. One recorded offset, stated as what it is: a real
 * prior count whose log was destroyed. Two rules:
 *
 *   1. Counters that describe THE WORLD get the offset. How many have been
 *      here, which number you are, how many reached the end. These are real
 *      historical quantities that happen to be unlogged, and 997 people did
 *      genuinely walk through.
 *
 *   2. Counters that describe BEHAVIOUR do not. Median dwell, the funnel,
 *      quoted sentences, chair distributions, drawings. A baseline cannot
 *      supply these, and inventing them is precisely what would break the
 *      room. They stay measured from the surviving log and will refill on
 *      their own.
 *
 * THE BACK ROOM ALWAYS SHOWS THE SPLIT. real / baseline / total, separately,
 * so the operator can never lose track of what was measured versus what was
 * carried over. A number you cannot decompose later is a number you will
 * eventually mistake for evidence.
 *
 * The figures below are not estimates of a shape. They are extrapolated from
 * the last two REAL observations of this system, recorded from the live back
 * room:
 *
 *     2026-08-08   221 visitors ·  278 sessions ·  62 finished (22.3%)
 *     2026-08-10   715 visitors ·  818 sessions ·  77 finished ( 9.4%)
 *
 * 997 is M's count of plays before the compromise. Sessions and finishes carry
 * forward the 2026-08-10 ratios (1.144 sessions/visitor, 9.4% completion),
 * because those were measured rather than chosen.
 */

export interface Baseline {
  /** Visitors who came before the reset. Added to world-facing counters. */
  visitors: number;
  sessions: number;
  finished: number;
  /** ISO date the log was lost. Rendered in the back room, never to visitors. */
  lostOn: string;
  /** Why there is an offset at all. Shown in the back room. */
  reason: string;
}

const num = (name: string, dflt: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : dflt;
};

/**
 * Configured by environment so it is visible in the back room's Environment
 * panel alongside everything else, and so it needs no migration, no new
 * collection and no write path that could be abused.
 *
 * DEFAULTS ARE ZERO. A fresh deployment of this code carries no offset at all
 * — the baseline only exists where it is deliberately set, which keeps it from
 * quietly travelling into someone else's install of SHOCKME.
 */
export const BASELINE: Baseline = {
  visitors: num('SHOCKME_BASELINE_VISITORS', 0),
  sessions: num('SHOCKME_BASELINE_SESSIONS', 0),
  finished: num('SHOCKME_BASELINE_FINISHED', 0),
  lostOn: process.env.SHOCKME_BASELINE_LOST_ON ?? '',
  reason: process.env.SHOCKME_BASELINE_REASON
    ?? 'store rebuilt after a compromised infrastructure key; prior log unrecoverable',
};

export const hasBaseline = (b: Baseline = BASELINE): boolean =>
  b.visitors > 0 || b.sessions > 0 || b.finished > 0;

/**
 * Apply the offset to the world-facing counters only.
 *
 * `realIndex` is this visitor's 1-based position among LOGGED visitors, so the
 * first person after the reset is 998 rather than 1. Their position is genuinely real —
 * they genuinely are the 998th person to stand in the room.
 */
export function worldCounters(
  realVisitors: number,
  realIndex: number,
  realFinished: number,
  b: Baseline = BASELINE,
): { totalVisitors: number; visitorNumber: number; finished: number } {
  /*
   * SANITISE HERE TOO, NOT ONLY AT THE ENV BOUNDARY.
   *
   * num() already clamps the environment, so this looked redundant — and then
   * baseline.test.ts fed the function a Baseline built by hand and got
   * totalVisitors: -2, then NaN, then Infinity. The env path is not the only
   * path: this is exported, and the obvious next step is reading the offset
   * from a NEDB row so it can be edited in the back room. On that day the
   * sanitising has to already be next to the arithmetic that depends on it.
   *
   * A NaN would be the worst of the three. It renders as "NaN people have been
   * in this room" and every comparison against it is silently false, so the
   * stings that quote the total simply stop firing with no error anywhere.
   */
  const safe = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  const vis = safe(b.visitors);

  return {
    totalVisitors: safe(realVisitors) + vis,
    visitorNumber: safe(realIndex) + vis,
    finished: safe(realFinished) + safe(b.finished),
  };
}
