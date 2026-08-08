/**
 * SHOCKME · consequences
 *
 * The Oracle: "The room should not merely generate a strange report about what
 * happened. It should make the player feel that their behavior changed what
 * happened." Recommended first slice: a small behaviour ledger, used in three
 * places — the next room's text, one sidebar message, and the final artifact.
 *
 * ONE LEDGER, NOT TWO. The obvious move is a new BehaviourRecord type with
 * chairs_counted / pressed_button / read_notice / etc. I did not do that,
 * because `Facts` already derives most of those from the same event log, and
 * today alone three bugs in this codebase came from one rule living in two
 * places that drifted apart (the dedupe window, the chair count, the late
 * chair). A second ledger would be a fourth. So Facts IS the behaviour ledger
 * and the missing fields were added to it.
 *
 * WHAT MAKES AN ECHO WORK. An echo is a sentence in a LATER room that could
 * only exist because of something you did in an EARLIER one. Three rules:
 *
 *   1. IT MUST BE TRUE. Same constraint as the ledger, recital and stings. An
 *      echo that fires on a choice you did not make teaches the player the
 *      room is generating noise, and then every real echo reads as noise too.
 *   2. IT MUST NOT EXPLAIN ITSELF. "Because you pressed the button, this room
 *      is different" is a mechanic announcing itself. "The button is still
 *      warm" is the same information and lets the player do the connecting.
 *   3. IT MUST BE RECOGNISABLE ON THE SECOND PLAYTHROUGH, NOT THE FIRST. The
 *      Oracle's success condition is that after playing twice a visitor can
 *      explain ONE way their choices changed the room. That is the target —
 *      not comprehension on the first run, which would just be a tutorial.
 *
 * The sidebar echo is the sharpest of the three and the one to be most careful
 * with: a stranger's voice repeating your private choice back at you is the
 * strongest recognition moment available, and it stops working the instant it
 * happens twice.
 */

import { Rng } from '../rng.ts';
import type { Facts } from './second-half.ts';

/**
 * An echo binds a PAST action to a LATER room. `where` is the set of scenes it
 * may appear in — always downstream of the action, never in the room where the
 * choice was made, because a consequence you see immediately is just feedback.
 */
export interface Echo {
  id: string;
  where: string[];
  when: (f: Facts) => boolean;
  line: (f: Facts) => string;
  /** Higher is more specific and therefore more worth spending a slot on. */
  power: number;
}

export const ECHOES: Echo[] = [
  /* --- the chair count follows you --- */
  {
    id: 'chairs-in-corridor',
    where: ['corridor'],
    power: 80,
    when: (f) => f.guess !== undefined,
    line: (f) => `The corridor is ${f.guess} paces long. It was not measured for you.`,
  },
  {
    id: 'chairs-in-dark',
    where: ['dark'],
    power: 78,
    when: (f) => f.guess !== undefined,
    line: (f) => `You said ${f.guess}. Something in here is still counting to ${f.guess}.`,
  },
  {
    id: 'chairs-at-threshold',
    where: ['threshold'],
    power: 74,
    when: (f) => f.guess !== undefined && f.guess !== f.chairsDrawn,
    line: (f) => `There are ${f.chairsDrawn} chairs behind you. You still think there are ${f.guess}.`,
  },

  /* --- the button remembers --- */
  {
    id: 'button-pressed',
    where: ['corridor', 'ledger', 'inventory'],
    power: 76,
    when: (f) => f.pressed,
    line: () => 'The button is still warm. Nobody has been near it.',
  },
  {
    id: 'button-refused',
    where: ['corridor', 'ledger', 'inventory'],
    power: 76,
    when: (f) => !f.pressed,
    line: () => 'The button is exactly where you left it. It has not stopped waiting.',
  },

  /* --- the notice --- */
  {
    id: 'notice-read',
    where: ['ledger', 'recital', 'dark'],
    power: 70,
    when: (f) => f.roomsSeen.includes('notice'),
    line: () => 'The notice has been updated again. It now mentions you by position.',
  },
  {
    id: 'notice-skipped',
    where: ['threshold'],
    power: 55,
    when: (f) => !f.roomsSeen.includes('notice'),
    line: () => 'There was a notice. It was about this part.',
  },

  /* --- the chair you did or did not take --- */
  {
    id: 'sat-down',
    where: ['inventory', 'dark', 'threshold'],
    power: 66,
    when: (f) => f.roomsSeen.includes('seated'),
    line: () => 'The chair you used has not been straightened. It is the only one that has not.',
  },
  {
    id: 'stayed-standing',
    where: ['inventory', 'dark', 'threshold'],
    power: 66,
    when: (f) => f.roomsSeen.includes('standing') && !f.roomsSeen.includes('seated'),
    line: () => 'You never sat down. All four chairs are still perfect.',
  },

  /* --- what you said, surfacing where you did not say it --- */
  {
    id: 'spoke-earlier',
    where: ['dark', 'threshold', 'inventory'],
    power: 82,
    when: (f) => Boolean(f.yourQuote && f.yourQuote.length > 3),
    line: (f) => `Somewhere behind you, the front room is still holding “${f.yourQuote}”.`,
  },

  /* --- the wing you did not take --- */
  {
    id: 'other-wing',
    where: ['threshold'],
    power: 72,
    when: (f) => f.roomsSeen.includes('ledger') !== f.roomsSeen.includes('inventory'),
    line: (f) => f.roomsSeen.includes('ledger')
      ? 'The other corridor is still lit. Nobody walked down it this time.'
      : 'The room kept your numbers anyway. You did not ask to see them.',
  },
];

/** At most one echo per room, and never the same echo twice in a session. */
export function echoFor(
  seed: string,
  facts: Facts,
  sceneId: string,
  alreadyUsed: Set<string>,
): { id: string; line: string } | undefined {
  const eligible = ECHOES.filter((e) => {
    if (!e.where.includes(sceneId) || alreadyUsed.has(e.id)) return false;
    try { return e.when(facts); } catch { return false; }
  });
  if (!eligible.length) return undefined;

  const r = new Rng(seed, `echo:${sceneId}`);
  const top = eligible.sort((a, b) => b.power - a.power).slice(0, 3);
  const chosen = r.weighted(top.map((e, i) => [e, [5, 3, 2][i] ?? 1] as const));
  try {
    return { id: chosen.id, line: chosen.line(facts) };
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* The sidebar recognises you                                          */
/* ------------------------------------------------------------------ */

/**
 * THE SHARPEST MOMENT IN THE PRODUCT, AND THE MOST FRAGILE.
 *
 * The Oracle: "A voice appears immediately after the player acts: 'you chose
 * the second exit'." A stranger in the rail repeating your private choice back
 * at you is the strongest recognition beat available here — the sidebar stops
 * being wallpaper and becomes something that was watching.
 *
 * It fires ONCE per session, ever. Twice and the player works out it is a
 * script; the first time, they are not sure they read it correctly. The line
 * is deliberately lowercase and unpunctuated so it looks exactly like every
 * other ambient line in the rail, because the moment it looks special it
 * reads as a feature rather than a coincidence.
 */
const RECOGNITIONS: { id: string; when: (f: Facts) => boolean; line: (f: Facts) => string }[] = [
  { id: 'r-second-exit', when: (f) => f.roomsSeen.includes('corridor'), line: () => 'you chose the second exit' },
  { id: 'r-count', when: (f) => f.guess !== undefined, line: (f) => `${f.guess}. i heard someone say ${f.guess}` },
  { id: 'r-pressed', when: (f) => f.pressed, line: () => 'somebody pressed it. it was not me' },
  { id: 'r-refused', when: (f) => !f.pressed && f.roomsSeen.includes('button'), line: () => 'one of us left it alone' },
  { id: 'r-quiet', when: (f) => !f.yourQuote, line: () => 'the quiet one is still here' },
];

export function recognitionFor(seed: string, facts: Facts): { id: string; line: string } | undefined {
  const eligible = RECOGNITIONS.filter((r) => { try { return r.when(facts); } catch { return false; } });
  if (!eligible.length) return undefined;
  const r = new Rng(seed, 'recognition');
  const pick = r.pick(eligible);
  try { return { id: pick.id, line: pick.line(facts) }; } catch { return undefined; }
}
