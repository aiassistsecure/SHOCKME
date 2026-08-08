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

/**
 * THE ROOM NOTICES YOU DOING NOTHING.
 *
 * Measured on the live site: 193 arrivals, 42 people who touched anything.
 * 78% opened the room and left without a single click, and the chat read
 * "im so confused by what this is". The room was atmospheric and completely
 * passive — it waited, and so did they, and then they left.
 *
 * These fire on a timer while you have not acted. They are the difference
 * between a room that is odd and a room that is playing with you: an entity
 * that comments on your hesitation is funny, an entity that just sits there
 * is furniture. Escalating, never hurrying you, increasingly personal.
 */
export const NUDGES = [
  'You have not moved.',
  'You have not moved. That is a choice, and it has been recorded as one.',
  'Take your time. We have taken ours.',
  'The others usually pick something by now. Not a criticism.',
  'We can wait. We are extremely good at waiting.',
  'Would it help if there were fewer options? We can remove one.',
  'You are the longest arrival today. Congratulations, probably.',
  'It is fine. Everyone hesitates. Almost everyone.',
  'We have started a small file on your hesitation. It is not a big file.',
  'Something will happen whether you choose or not. Probably.',
] as const;

/** What the room says when you hover a choice without taking it. */
export const HOVERS: Record<string, string> = {
  sit:            'That one is still warm.',
  read:           'Nobody finishes it.',
  stand:          'Standing is also permitted.',
  wait:           'You are already doing that.',
  count:          'Please do. We would like a second opinion.',
  'keep-reading': 'There is more. There is always more.',
  'look-away':    'It will still be there.',
  agree:          'The room appreciates agreement.',
  disagree:       'You are allowed to. It changes nothing.',
  press:          'Oh.',
  refuse:         'A popular decision.',
};

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
  /*
   * ARRIVAL OFFERS THE JOKE DIRECTLY.
   *
   * Measured: counting was reached by 7.8% of sessions and the button by
   * 21.8%, because both sat two or three clicks behind atmosphere. The chair
   * miscount is the strongest thing in the room and almost nobody met it.
   * "Count the chairs" is now on the first screen, one click from the
   * contradiction.
   */
  {
    id: 'arrival',
    renderer: 'room',
    choices: [
      { id: 'count', label: 'Count the chairs', next: 'counting' },
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

/**
 * ONE CHAIR ARRIVES LATE.
 *
 * The chair miscount is the best joke in the room and it was buried three
 * clicks deep — only 7.8% of visitors ever reached the counting scene. Now a
 * chair fades in a few seconds after arrival, while you are looking at the
 * screen and before you have clicked anything, and the eyebrow quietly
 * updates its count. The joke that 7.8% saw is now the joke 100% see.
 */
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
  /** Milliseconds after arrival before one more chair quietly appears. */
  lateChairAfterMs: number;
}

/**
 * Everything about this visitor's room, derived from the seed alone.
 * Called server-side only — the seed never leaves the BFF.
 */
export function resolveRoom(seed: string, visitCount: number): Resolved {
  const r = new Rng(seed, 'room');
  const anomaly = r.pick(ANOMALIES);

  /*
   * The room draws N chairs and claims four. It is never wrong on purpose.
   *
   * FOUR IS NOT IN THE POOL. It used to be, weighted highest, so about one
   * visitor in ten met a room that was simply correct — and for them the
   * strongest joke in the experience silently did not happen. The artifact
   * read "the room insisted on 4 chairs. it drew 4." which is just a sentence.
   * The room is now always, confidently, wrong.
   */
  const claimed = 4;
  const drawn = r.weighted([[5, 4], [3, 3], [6, 2], [2, 1], [7, 1]] as const);

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
    // Long enough that you have settled, short enough that you are still
    // looking. Under ~3s it reads as a loading artifact rather than an event.
    lateChairAfterMs: 3400 + r.int(0, 2600),
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
