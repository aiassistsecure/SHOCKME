/**
 * SHOCKME · the afterimage
 *
 * Oracle: "This is not analytics bolted onto a game. It is a consented,
 * first-party behavioral memory that lets the room become more observant over
 * time. The visitor should feel 'This room knows something about how I arrived
 * here.' Not 'This site is showing me a marketing segment.'"
 *
 * THE ONE PLACE I DEPARTED FROM THE SPEC, stated up front.
 *
 * The spec mounts a client script with data-consent="granted" hard-coded in
 * the tag. That attribute is not consent — it is the site owner ASSERTING
 * consent on the visitor's behalf, which is the exact move that made tracking
 * pixels the thing everybody blocks. M's own instruction was "later pixel with
 * proper notice", so the notice is the feature, not the wrapper.
 *
 * The split I built instead:
 *
 *   ARRIVAL CLASS is derived SERVER-SIDE from the Referer header of the
 *   request the visitor already made. No script, no storage of the raw URL,
 *   no third party, nothing to consent to beyond loading the page — we keep
 *   the CLASS ("social_reddit") and discard the referrer itself in the same
 *   function. This covers every arrival at thrilling.world, which is the only
 *   property that exists today, and it works with JS disabled and through
 *   every content blocker on the internet.
 *
 *   THE PIXEL, which is genuinely needed to see a visitor across OTHER
 *   first-party properties, is gated behind a real recorded choice. See
 *   pixel.ts.
 *
 * So the Afterimage is real, the room gets its memory, and the part that
 * requires consent is the part that actually asks.
 *
 * SOURCE-OF-TRUTH RULE, inherited from every other file here: only signals we
 * actually received. Nothing inferred about where else somebody has been. If
 * the referrer is absent, the arrival is "direct" and the room says nothing
 * about it rather than guessing.
 */

import { Rng } from './rng.ts';

/* ------------------------------------------------------------------ */
/* Arrival                                                             */
/* ------------------------------------------------------------------ */

export type ReferrerClass =
  | 'direct'
  | 'social_facebook'
  | 'social_instagram'
  | 'social_reddit'
  | 'social_x'
  | 'social_other'
  | 'search'
  | 'internal'
  | 'unknown';

const HOSTS: [RegExp, ReferrerClass][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.(com|me)$/i, 'social_facebook'],
  [/(^|\.)instagram\.com$/i, 'social_instagram'],
  [/(^|\.)reddit\.com$|(^|\.)redd\.it$/i, 'social_reddit'],
  [/(^|\.)(twitter|x)\.com$|(^|\.)t\.co$/i, 'social_x'],
  [/(^|\.)(tiktok|threads|bsky|mastodon|linkedin|pinterest|tumblr|discord|youtube)\./i, 'social_other'],
  [/(^|\.)(google|bing|duckduckgo|ecosia|yahoo|brave)\./i, 'search'],
];

/**
 * Classify and DISCARD. The raw referrer never leaves this function and is
 * never stored — a full URL can carry a username, a search query, a private
 * group id. The class cannot.
 */
export function classifyReferrer(referer: string | undefined, ownHost: string): ReferrerClass {
  if (!referer) return 'direct';
  let host: string;
  try {
    host = new URL(referer).hostname;
  } catch {
    return 'unknown';
  }
  if (!host) return 'unknown';
  if (ownHost && (host === ownHost || host.endsWith(`.${ownHost}`))) return 'internal';
  for (const [re, cls] of HOSTS) if (re.test(host)) return cls;
  return 'unknown';
}

/**
 * ARRIVAL BEATS. The Oracle's translation table, and it is the best idea in
 * the brief: never name the platform. "You arrived from Facebook" is a
 * marketing segment read aloud. The translation is the same information,
 * delivered as something the room noticed.
 */
const ARRIVAL_BEATS: Partial<Record<ReferrerClass, string[]>> = {
  social_facebook: [
    'You arrived from a place where people watch each other becoming themselves.',
    'You came in through somewhere with a lot of faces in it. None of them followed you.',
  ],
  social_instagram: [
    'You arrived from somewhere everything was already lit correctly.',
    'You came from a place made of surfaces. This room only has the one.',
  ],
  social_reddit: [
    'You arrived from a room inside a room. Somebody left a door open.',
    'You came from somewhere with a lot of smaller rooms in it. This is not one of them.',
  ],
  social_x: [
    'You arrived from a place where every sentence is already leaving.',
    'You came from somewhere brief. The room will try to match your pace and fail.',
  ],
  social_other: [
    'You arrived from somewhere with an audience. It did not come with you.',
  ],
  search: [
    'You went looking for something and were given this instead.',
    'You asked a question somewhere else. This is not the answer to it.',
  ],
  internal: [
    'You came from another part of this. The room does not consider that arriving.',
  ],
};

/** Never fabricates. Direct and unknown arrivals get nothing at all. */
export function arrivalBeat(seed: string, cls: ReferrerClass): string | undefined {
  const pool = ARRIVAL_BEATS[cls];
  if (!pool?.length) return undefined;
  return new Rng(seed, `arrival:${cls}`).pick(pool);
}

/** True only for arrivals that genuinely came from a social surface. */
export function isSocial(cls: ReferrerClass): boolean {
  return cls.startsWith('social_');
}

/* ------------------------------------------------------------------ */
/* The afterimage                                                      */
/* ------------------------------------------------------------------ */

/**
 * A compact, DERIVED view of one visitor across their visits. The event log
 * stays immutable and the room generator never sees it — it sees this.
 *
 * Everything here belongs to ONE visitorId. The isolation is not a nicety:
 * a room that quotes somebody else's sentence back at you is the single worst
 * failure this product could have, and we have already shipped a version of it
 * once (a finished session's answer leaking into the next game).
 * afterimage.test.ts exists specifically to keep that from recurring.
 */
export interface Afterimage {
  visitorId: string;
  visitCount: number;
  returned: boolean;
  arrival: { referrerClass: ReferrerClass; campaign?: string };
  behaviors: {
    pressesButtons: boolean;
    refusesButtons: boolean;
    waits: boolean;
    readsNotices: boolean;
    countsChairs: boolean;
    leavesResponses: boolean;
    signsForms: boolean;
  };
  memory: {
    roomsFound: string[];
    artifactsViewed: number;
    /** A SHORT excerpt of something they wrote on a PREVIOUS visit. */
    priorResponseExcerpt?: string;
    lastVisitAt?: number;
  };
}

/** Minimal event shape this module needs. Matches the repo's event rows. */
export interface AfterEvent {
  sessionId: string;
  kind: string;
  tick: number;
  payload?: Record<string, unknown>;
}

/**
 * Derive one visitor's afterimage.
 *
 * `events` MUST already be filtered to this visitor's own sessions. The filter
 * is the caller's job because only the caller knows the visitor->session
 * mapping, but the function double-checks with `ownSessions` so a caller
 * mistake produces an empty afterimage rather than somebody else's memory.
 */
export function deriveAfterimage(
  visitorId: string,
  visitCount: number,
  arrival: { referrerClass: ReferrerClass; campaign?: string },
  events: AfterEvent[],
  ownSessions: Set<string>,
  currentSessionId: string,
): Afterimage {
  const mine = events.filter((e) => ownSessions.has(e.sessionId));
  const p = (e: AfterEvent) => (e.payload ?? {}) as Record<string, unknown>;
  const has = (k: string) => mine.some((e) => e.kind === k);
  const choiceTo = (id: string) => mine.some((e) => e.kind === 'choice' && p(e).to === id);

  /*
   * PRIOR responses only — never this visit's. Quoting back something the
   * visitor typed ninety seconds ago is not memory, it is a mirror, and the
   * recital already does that deliberately. The afterimage is for the thing
   * they said LAST TIME.
   */
  const priorAnswers = mine
    .filter((e) => e.kind === 'answered' && e.sessionId !== currentSessionId)
    .sort((a, b) => a.tick - b.tick);
  const last = priorAnswers.at(-1);
  const excerpt = last
    ? String(p(last).fragment ?? String(p(last).text ?? '').split(/\s+/).slice(0, 6).join(' '))
    : undefined;

  const refused = mine.some((e) => e.kind === 'choice' && p(e).choiceId === 'refuse');

  return {
    visitorId,
    visitCount,
    returned: visitCount > 0,
    arrival,
    behaviors: {
      pressesButtons: has('press'),
      refusesButtons: refused && !has('press'),
      waits: mine.some((e) => e.kind === 'dwell' && Number(p(e).dwellMs ?? 0) >= 30_000),
      readsNotices: choiceTo('notice'),
      countsChairs: has('counted'),
      leavesResponses: has('answered'),
      signsForms: mine.some((e) => e.kind === 'choice' && p(e).choiceId === 'sign'),
    },
    memory: {
      roomsFound: [...new Set(mine.filter((e) => e.kind === 'choice')
        .map((e) => String(p(e).to ?? '')).filter(Boolean))],
      artifactsViewed: mine.filter((e) => e.kind === 'artifact_viewed').length,
      priorResponseExcerpt: excerpt && excerpt.length > 2 ? excerpt : undefined,
      lastVisitAt: priorAnswers.at(-1)?.tick,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Afterimage beats                                                    */
/* ------------------------------------------------------------------ */

/**
 * At most ONE per run, per the Oracle. These are quieter than stings — a sting
 * is about what you are doing right now, an afterimage beat is about who you
 * have been, and the second only works if it is almost inaudible.
 */
interface Beat { id: string; when: (a: Afterimage) => boolean; line: (a: Afterimage) => string; power: number }

const BEATS: Beat[] = [
  {
    id: 'prior-sentence',
    power: 96,
    when: (a) => Boolean(a.memory.priorResponseExcerpt),
    line: (a) => `You left us a sentence once. We did not know where else to put it, so it is still here: “${a.memory.priorResponseExcerpt}”`,
  },
  {
    id: 'refuses',
    power: 84,
    when: (a) => a.returned && a.behaviors.refusesButtons,
    line: () => 'The button remembers your manners. It has developed none of its own.',
  },
  {
    id: 'presses',
    power: 80,
    when: (a) => a.returned && a.behaviors.pressesButtons,
    line: () => 'You have pressed it before. It has not recovered, and it would like you to know that.',
  },
  {
    id: 'returned',
    power: 70,
    when: (a) => a.returned,
    line: () => 'The chair accepts you without checking your name.',
  },
  {
    id: 'waits',
    power: 66,
    when: (a) => a.returned && a.behaviors.waits,
    line: () => 'You are a person who waits. The room has arranged for there to be more of that.',
  },
  {
    id: 'signed',
    power: 74,
    when: (a) => a.behaviors.signsForms,
    line: () => 'Your signature is on file. The file is not.',
  },
];

/**
 * One beat, or none. Deterministic per visitor so a replay is reproducible.
 * Arrival beats are handled separately because they must fire on the FIRST
 * screen, before any behaviour exists to comment on.
 */
export function afterimageBeat(seed: string, a: Afterimage): { id: string; line: string } | undefined {
  const eligible = BEATS.filter((b) => { try { return b.when(a); } catch { return false; } });
  if (!eligible.length) return undefined;
  const r = new Rng(seed, 'afterimage');
  if (!r.bool(0.7)) return undefined;
  const top = eligible.sort((x, y) => y.power - x.power).slice(0, 2);
  const chosen = r.weighted(top.map((b, i) => [b, [5, 2][i] ?? 1] as const));
  try { return { id: chosen.id, line: chosen.line(a) }; } catch { return undefined; }
}
