/**
 * SHOCKME · THE ARRIVAL RECORD
 *
 * The measured problem: ~78% of visitors touch nothing. The room is lovely and
 * most people never make contact with it. At a normal desktop viewport the
 * four real choices began below the fold, so the first thing a stranger met
 * was a headline that reads as an image rather than an invitation.
 *
 * The fix is not a louder headline. It is giving a stranger something to DO
 * inside fifteen seconds, that costs nothing, that is legible, and that turns
 * into a real event in their history:
 *
 *     THE ROOM ARRIVED FIRST.
 *     It has started a file on you.
 *
 *     ARRIVAL RECORD / [serial]
 *     time received   00:00
 *     origin          unconfirmed
 *     reason          [choose one]
 *
 *       I FOUND IT      I FOLLOWED IT      IT FOUND ME
 *
 * It is not a quiz, a survey, onboarding, or a profile. It is a tiny act of
 * authorship: the visitor tells the room which version of the arrival it may
 * keep. Then the existing Waiting Room unfolds — not a loading screen, not
 * another explanation.
 *
 * THE TWO RECORDS, which is where all the new strangeness comes from:
 *
 *   what happened          exact, append-only, never wrong
 *   what the room made of it   restrained interpretation, visibly fallible
 *
 * If you choose I FOLLOWED IT the factual record says exactly that, forever.
 * Later the room may call it willingness, or curiosity, or an open door. It
 * may NOT claim you clicked, waited, arrived from, or revealed anything you
 * did not. The room can be poetically wrong about meaning and never factually
 * wrong about the visitor — break that and the effect dies on the second
 * visit, which is the only visit that matters for word of mouth.
 */

import { Rng } from '../rng.ts';

export const ARRIVAL_EVENT = 'arrival_declared';

/* ------------------------------------------------------------------ */
/* The three declarations                                              */
/* ------------------------------------------------------------------ */

export type ArrivalChoice = 'found' | 'followed' | 'taken';

export interface ArrivalOption {
  id: ArrivalChoice;
  label: string;
  /** The factual record. Exact, and never rephrased anywhere. */
  factual: string;
}

export const ARRIVAL_OPTIONS: readonly ArrivalOption[] = [
  { id: 'found',    label: 'I FOUND IT',     factual: 'said they found it' },
  { id: 'followed', label: 'I FOLLOWED IT',  factual: 'said they followed it' },
  { id: 'taken',    label: 'IT FOUND ME',    factual: 'said it found them' },
] as const;

/**
 * What the room makes of each declaration. Several per choice, picked
 * deterministically, so two people who pressed the same button do not
 * necessarily get the same reading — and neither of them is being told a fact
 * about themselves, only an interpretation the room is happy to be wrong about.
 */
const READINGS: Record<ArrivalChoice, readonly string[]> = {
  found: ['deliberate', 'a search concluded', 'arrival by intent', 'looking, and then this'],
  followed: ['willingness', 'an open door', 'curiosity, unresolved', 'a suggestion taken'],
  taken: ['selection', 'arrival by arrangement', 'not your idea', 'the shorter explanation'],
};

export interface ArrivalRecord {
  choice: ArrivalChoice;
  /** Exact. Quoted in the ledger and the artifact without alteration. */
  factual: string;
  /** The room's interpretation. Always presented AS an interpretation. */
  reading: string;
  serial: string;
}

/** Deterministic from the session seed. Same visit, same reading, forever. */
export function readArrival(seed: string, choice: ArrivalChoice): ArrivalRecord {
  const r = new Rng(seed, `arrival:${choice}`);
  const opt = ARRIVAL_OPTIONS.find((o) => o.id === choice)!;
  return {
    choice,
    factual: opt.factual,
    reading: r.pick([...READINGS[choice]]),
    serial: serialFor(seed),
  };
}

/**
 * The visit's serial. Looks like a filing reference, is actually just the seed
 * folded — so it is stable across refresh and cannot be used to reconstruct
 * anything. It appears on the record, on the artifact, and in the share card.
 */
export function serialFor(seed: string): string {
  const r = new Rng(seed, 'serial');
  return `${String(r.int(100, 999))}-${String(r.int(1000, 9999))}`;
}

/** The one calm line the room says after you choose. Ordinary room copy. */
export function filedLine(rec: ArrivalRecord): string {
  return `The room has filed that under ${rec.reading}. It may be corrected later.`;
}

/* ------------------------------------------------------------------ */
/* The honest misfile                                                  */
/* ------------------------------------------------------------------ */

/**
 * A later room shows the two records side by side after a REAL action:
 *
 *     event record : counted the chairs
 *     room record  : waited for permission
 *
 * The first is factual. The second is explicitly labelled as the room's
 * reading. This replaces the brief's original "record an action you never
 * took", which would have broken the invariant and taught repeat visitors
 * that the room lies — at which point nothing it says lands again.
 */
const MISREADINGS: Record<string, readonly string[]> = {
  counted: ['waited for permission', 'wanted a second opinion', 'did not trust the number'],
  pressed: ['accepted the apology', 'tested whether it was real', 'agreed to something'],
  refused: ['declined politely', 'thought better of it', 'was not ready to be counted'],
  answered: ['explained themselves', 'left a note for the next one', 'wanted to be understood'],
  waited: ['was listening', 'expected someone', 'let the room go first'],
  arrived: ['was expected', 'came directly', 'had been told about this'],
};

export interface Misfile { factual: string; reading: string }

/** Only ever called with an action the event log actually contains. */
export function misfileFor(seed: string, action: keyof typeof MISREADINGS, factual: string): Misfile {
  const r = new Rng(seed, `misfile:${action}`);
  return { factual, reading: r.pick([...MISREADINGS[action]!]) };
}

/* ------------------------------------------------------------------ */
/* One anomaly per visit                                               */
/* ------------------------------------------------------------------ */

/**
 * Three strange things, and a visit gets exactly ONE. A page full of tricks
 * reads as a gimmick; a single deliberate one reads as a rule.
 *
 *   audience  other people were near the door, and disagreed about it
 *   foretold  the rail mentions a door before the visitor reaches one
 *   misfile   the two records disagree, visibly, after a real action
 *
 * `audience` additionally requires consent, because it is the only one that
 * touches the coarse arrival class. Declining consent must still yield a
 * complete visit, so the selector falls through to the other two rather than
 * leaving the visitor with none.
 */
export type Anomaly = 'audience' | 'foretold' | 'misfile';

export function anomalyFor(seed: string, consent: boolean): Anomaly {
  const r = new Rng(seed, 'anomaly');
  const pool: [Anomaly, number][] = consent
    ? [['audience', 3], ['foretold', 3], ['misfile', 4]]
    : [['foretold', 4], ['misfile', 6]];
  return r.weighted(pool);
}

/** The Audience line. Never names a platform, never retains a URL. */
export const AUDIENCE_LINE = 'Other people were near the door. They did not agree which way it opened.';

/* ------------------------------------------------------------------ */
/* Copy for the record itself                                          */
/* ------------------------------------------------------------------ */

export const ARRIVAL_CLAIM = 'THE ROOM ARRIVED FIRST.';
export const ARRIVAL_SUB = 'It has started a file on you.';

/** Seeded phrasing. The shape never varies: one claim, one document, three equal choices. */
export function arrivalPrompt(seed: string): { claim: string; sub: string; reason: string } {
  const r = new Rng(seed, 'arrival:prompt');
  return {
    claim: ARRIVAL_CLAIM,
    sub: r.pick([
      ARRIVAL_SUB,
      'It has started a file on you.',
      'A file was opened before you got here.',
    ]),
    reason: r.pick(['choose one', 'one of three', 'select one']),
  };
}
