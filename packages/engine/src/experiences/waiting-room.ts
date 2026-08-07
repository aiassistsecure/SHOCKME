/**
 * SHOCKME · experience 001 · THE WAITING ROOM
 *
 * A beautifully ordinary room. Nothing is dangerous. Everything is slightly
 * off, and the room is very polite about it.
 *
 * THE RULE THIS ROOM RUNS ON (never stated to the visitor):
 *   the room is counting. It counts chairs, it counts arrivals, it counts how
 *   long you look at things. Its counts are confident and wrong, and it is
 *   never defensive about being wrong. That is the joke, and the unease.
 *
 * THE IMPOSSIBLE INTERACTION: a button that apologises before it is pressed,
 * and, once pressed, records that you did not press it. The counter of people
 * who have not pressed it goes UP when you press it. It is harmless, it is
 * legible as a rule rather than a bug, and it survives being told to a friend
 * — which is the actual test.
 */

import { createHash } from 'node:crypto';
import { Rng } from '../rng.ts';

export const EXPERIENCE_ID = 'waiting-room';
export const EXPERIENCE_VERSION = '0.1.0';

/* ------------------------------------------------------------------ */
/* Variations — the room is different per visitor                      */
/* ------------------------------------------------------------------ */

/** The sentence the visitor did not type. */
export const GREETINGS = [
  'You are early.',
  'You are early. Everyone is early. That is the problem.',
  'You are late, but only slightly, and not in a way that matters to us.',
  'You came back.',
  'We kept it open. Not for you specifically.',
  'You are the fourth person to arrive first.',
  'We were told to expect someone taller. We will proceed anyway.',
  'You may sit anywhere except the one you were going to choose.',
  'Nothing has started yet. Nothing is going to start.',
  'Thank you for waiting. You have not waited yet.',
  'You have been assigned the good chair. It is the same chair.',
  'Please accept our apology for the thing that has not happened.',
  'Your appointment was moved. It was moved to now.',
  'We are so glad it is you. We were glad before we checked.',
  'Someone described you accurately and we would rather not say who.',
  'Welcome back. This is your first visit.',
] as const;

/** What is wrong with the room. One per session, quietly consistent. */
export const ANOMALIES = [
  { key: 'chairs', object: 'a chair',        line: 'There are four chairs in this room.' },
  { key: 'clock',  object: 'the clock',      line: 'The clock is correct.' },
  { key: 'plant',  object: 'the plant',      line: 'The plant was watered this morning, by someone.' },
  { key: 'window', object: 'the window',     line: 'The window looks out onto the corridor.' },
  { key: 'door',   object: 'the second door', line: 'There is one door.' },
  { key: 'lamp',   object: 'the lamp',       line: 'The lamp has been on since before the room.' },
  { key: 'carpet', object: 'the carpet',     line: 'The carpet is the original carpet. It is new.' },
  { key: 'ceiling',object: 'the ceiling',    line: 'The ceiling is at the usual height for this room.' },
] as const;

/** Dwell-reactive notice text. The longer you read it, the more it says. */
export const NOTICE_STAGES = [
  'PLEASE WAIT.',
  'PLEASE WAIT. YOU ARE DOING IT CORRECTLY.',
  'PLEASE WAIT. YOU ARE DOING IT CORRECTLY. BETTER THAN THE LAST ONE.',
  'PLEASE WAIT. WE HAVE STOPPED COUNTING YOUR WAITING. IT WAS MAKING YOU NERVOUS.',
  'YOU ARE STILL READING THIS. THAT HAS BEEN NOTED, KINDLY.',
  'THIS NOTICE WAS WRITTEN FOR SOMEONE ELSE. IT HAS BEEN WORKING OUT.',
  'WE HAVE RUN OUT OF NOTICE. PLEASE CONTINUE AS IF THERE WERE MORE.',
  'THE NOTICE IS NOW READING YOU. THIS IS WITHIN NORMAL PARAMETERS.',
] as const;

/** The apology, shown BEFORE the button is pressed. */
export const APOLOGIES = [
  'I am sorry about this.',
  'Apologies in advance.',
  'This was not my idea.',
  'Sorry. Genuinely.',
  'I would rather you did not, but I understand.',
  'No hard feelings, whatever happens.',
  'I want to say now that I tried.',
  'Please know that I liked you.',
  'This is going to be fine and I am sorry.',
] as const;

/** What the room says after you press the button you did not press. */
export const NON_PRESSES = [
  'You did not press it.',
  'Nothing was pressed. Thank you.',
  'The button remains unpressed. Your restraint is appreciated.',
  'No one has pressed it. Least of all you.',
  'The button has no record of you. The button is very tired.',
  'That did not happen, and we are both better for it.',
  'Unpressed. Beautifully unpressed.',
  'We have added you to the list of people who did not.',
] as const;

/** Closing lines for the artifact. */
export const CLOSINGS = [
  'You were not supposed to see this version.',
  'This version has been retired. You may keep it.',
  'Of everyone here today, you are the only one who saw it end this way.',
  'We will not be able to show you this again.',
  'This was the quiet one.',
  'Thank you for your patience, which we did not require.',
  'Your visit has been filed under the wrong heading, permanently.',
  'This has been the version with you in it.',
  'We enjoyed this. We are not certain we are allowed to.',
] as const;

/* ------------------------------------------------------------------ */
/* Scene graph                                                         */
/* ------------------------------------------------------------------ */

export interface Choice {
  id: string;
  label: string;
  next: string;
}

export interface SceneDef {
  id: string;
  renderer: string;
  choices: Choice[];
}

export const SCENES: SceneDef[] = [
  {
    id: 'arrival',
    renderer: 'room',
    choices: [
      { id: 'sit', label: 'Sit down', next: 'seated' },
      { id: 'read', label: 'Read the notice', next: 'notice' },
      { id: 'stand', label: 'Remain standing', next: 'standing' },
    ],
  },
  {
    id: 'seated',
    renderer: 'room',
    choices: [
      { id: 'wait', label: 'Wait', next: 'button' },
      { id: 'count', label: 'Count the chairs', next: 'counting' },
    ],
  },
  {
    id: 'notice',
    renderer: 'notice',
    choices: [
      { id: 'keep-reading', label: 'Keep reading', next: 'notice' },
      { id: 'look-away', label: 'Look away', next: 'button' },
    ],
  },
  {
    id: 'standing',
    renderer: 'room',
    choices: [
      { id: 'wait', label: 'Wait anyway', next: 'button' },
      { id: 'count', label: 'Count the chairs', next: 'counting' },
    ],
  },
  {
    id: 'counting',
    renderer: 'counting',
    choices: [
      { id: 'agree', label: 'Agree with the room', next: 'button' },
      { id: 'disagree', label: 'Disagree with the room', next: 'button' },
    ],
  },
  {
    id: 'button',
    renderer: 'button',
    choices: [
      { id: 'press', label: 'Press it', next: 'end' },
      { id: 'refuse', label: 'Refuse', next: 'end' },
    ],
  },
  { id: 'end', renderer: 'artifact', choices: [] },
];

export const INITIAL_SCENE = 'arrival';

export function sceneById(id: string): SceneDef | undefined {
  return SCENES.find((s) => s.id === id);
}

/* ------------------------------------------------------------------ */
/* Resolution — pure, seed-driven                                      */
/* ------------------------------------------------------------------ */

export interface Resolved {
  greeting: string;
  anomaly: (typeof ANOMALIES)[number];
  chairCount: number;
  /** What the room INSISTS the count is, regardless of what it drew. */
  claimedChairCount: number;
  apology: string;
  nonPress: string;
  closing: string;
  notPressedCount: number;
}

/**
 * Everything about this visitor's room, derived from the seed alone.
 * Called server-side only — the seed never leaves the BFF.
 */
export function resolveRoom(seed: string, visitCount: number): Resolved {
  const r = new Rng(seed, 'room');
  const anomaly = r.pick(ANOMALIES);

  // The room draws N chairs but claims four. It is never wrong on purpose.
  const claimed = 4;
  const drawn = r.weighted([[4, 3], [5, 4], [3, 2], [6, 1]] as const);

  return {
    greeting: visitCount > 0 && r.bool(0.7) ? 'You came back.' : r.pick(GREETINGS),
    anomaly,
    chairCount: drawn,
    claimedChairCount: claimed,
    apology: r.pick(APOLOGIES),
    nonPress: r.pick(NON_PRESSES),
    closing: r.pick(CLOSINGS),
    // A large, stable, faintly absurd number. Increments when you press.
    notPressedCount: 1200 + r.int(0, 800),
  };
}

/** Notice text for a dwell duration. Rewards attention, never punishes it. */
export function noticeFor(dwellMs: number): string {
  const i = Math.min(NOTICE_STAGES.length - 1, Math.floor(dwellMs / 3500));
  return NOTICE_STAGES[i]!;
}

/** Content hash — drives idempotent registration (SPEC §11.7). */
export function contentHash(): string {
  return createHash('sha256')
    .update(JSON.stringify({ SCENES, GREETINGS, ANOMALIES, NOTICE_STAGES, APOLOGIES, NON_PRESSES, CLOSINGS, EXPERIENCE_VERSION }))
    .digest('hex');
}

export const DEFINITION = {
  id: EXPERIENCE_ID,
  version: EXPERIENCE_VERSION,
  title: 'The Waiting Room',
  invitation: 'Someone will be with you shortly. Nobody will be with you shortly.',
  get contentHash() { return contentHash(); },
};
