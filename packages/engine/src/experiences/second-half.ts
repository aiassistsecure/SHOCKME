/**
 * SHOCKME · the second half
 *
 * M: "I want users to see shocking material, nothing bloody or gorey or horror
 * but thrilling... the user should feel odd and exhilarating at the same time...
 * I want it to be addictive yet harmless."
 *
 * Three briefs, one design.
 *
 * ODD was already solved. The waiting room is strange and stays strange. What
 * it lacked was a CURVE — every scene sat at the same temperature, so a visitor
 * levelled off after twenty seconds and left. Odd without escalation is just
 * texture.
 *
 * EXHILARATING is escalation plus being seen. The only genuinely thrilling
 * thing a browser can do without gore is prove it was paying attention. So the
 * second half is built almost entirely out of TRUE FACTS from the event log:
 * how long you actually hesitated, what you actually typed, what a real
 * stranger actually said, which room you actually skipped. Nothing here is a
 * jump scare and nothing here is invented. The room simply demonstrates, with
 * receipts, that it was counting. That lands harder than any fiction I could
 * write, and it costs nothing to keep honest.
 *
 * ADDICTIVE YET HARMLESS is the constraint I care most about getting right,
 * because the easy version of "addictive" is a dark pattern.
 *
 *   REFUSED, deliberately: streaks, daily-login pressure, guilt on exit,
 *   FOMO timers, artificial scarcity, notification nagging, infinite scroll,
 *   sunk-cost framing, any copy that makes leaving feel like losing.
 *
 *   USED instead: you cannot see every room in one run — the corridor FORKS
 *   and each branch hides two rooms from you. The artifact then tells you
 *   exactly what you missed and how many rooms exist. That converts the pull
 *   from compulsion into curiosity, and curiosity has a floor: you can satisfy
 *   it in three minutes and be genuinely done.
 *
 * The rule the whole file obeys: MAKE RETURNING REWARDING, NEVER MAKE LEAVING
 * PUNISHING. Every path ends. Every ending is clean. The room never begs.
 *
 * EXISTING SCENES ARE UNTOUCHED, as asked. Not one line of arrival, seated,
 * standing, notice, counting or button copy is edited. The only change in
 * waiting-room.ts is the two `next` pointers on the button, which used to go
 * straight to `end` and now go here first.
 */

import { Rng } from '../rng.ts';
import type { SceneDef } from './waiting-room.ts';

/* ------------------------------------------------------------------ */
/* The rooms                                                           */
/* ------------------------------------------------------------------ */

/**
 * THE FORK IS THE REPLAY ENGINE.
 *
 * `corridor` splits into two wings that never meet. Take the door and you get
 * ledger -> recital. Go back and you get inventory -> dark. Both wings are two
 * rooms deep, both converge on `threshold`, and neither shows you the other.
 *
 * So a complete run is 5 of the 7 new rooms, and the artifact can honestly say
 * "there are 9 rooms in here. you have been in 7." That sentence is the entire
 * retention mechanic and it required no manipulation to build — just a graph
 * that is wider than one visit.
 */
export const SECOND_HALF_SCENES: SceneDef[] = [
  {
    id: 'corridor',
    renderer: 'corridor',
    choices: [
      { id: 'through', label: 'Go through it', next: 'ledger' },
      { id: 'back', label: 'Go back the way you came', next: 'inventory' },
    ],
  },

  /* --- wing A: the room shows you the numbers --- */
  {
    id: 'ledger',
    renderer: 'ledger',
    choices: [
      { id: 'doubt', label: 'That cannot be right', next: 'recital' },
      { id: 'more', label: 'Show me the rest of it', next: 'recital' },
    ],
  },
  {
    id: 'recital',
    renderer: 'recital',
    choices: [
      { id: 'deny', label: 'I did not say that', next: 'threshold' },
      { id: 'again', label: 'Say it again', next: 'threshold' },
    ],
  },

  /* --- wing B: the room shows you yourself --- */
  {
    id: 'inventory',
    renderer: 'inventory',
    choices: [
      { id: 'delete', label: 'Delete it', next: 'dark' },
      { id: 'keep', label: 'Keep it', next: 'dark' },
    ],
  },
  {
    id: 'dark',
    renderer: 'dark',
    choices: [
      { id: 'lights', label: 'Turn the lights back on', next: 'threshold' },
      { id: 'stay', label: 'Stay in the dark', next: 'threshold' },
    ],
  },

  /* --- both wings arrive here --- */
  {
    id: 'threshold',
    renderer: 'threshold',
    choices: [
      { id: 'leave', label: 'Leave', next: 'end' },
      { id: 'linger', label: 'Wait a moment longer', next: 'end' },
    ],
  },
];

/** Rooms that exist, for the "you have been in N of M" line. Honest count. */
export const ALL_ROOM_IDS = [
  'arrival', 'seated', 'standing', 'notice', 'counting', 'button',
  'corridor', 'ledger', 'recital', 'inventory', 'dark', 'threshold',
] as const;

/** Human names for the artifact. The room does not say "scene id". */
export const ROOM_NAMES: Record<string, string> = {
  arrival: 'the front room',
  seated: 'the chair',
  standing: 'standing',
  notice: 'the notice',
  counting: 'the counting',
  button: 'the button',
  corridor: 'the corridor',
  ledger: 'the ledger',
  recital: 'the recital',
  inventory: 'the inventory',
  dark: 'the dark',
  threshold: 'the threshold',
};

export const TOTAL_ROOMS = ALL_ROOM_IDS.length;

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

const CORRIDOR_OPENERS = [
  'There is a door here. There was not a door here.',
  'A corridor. It was behind you the entire time, which is not where it is now.',
  'The room has a second exit. It would like credit for mentioning it.',
  'There is a door. It has your posture.',
];

const CORRIDOR_SUBS = [
  'It was added while you were deciding about the button.',
  'It has been here for eleven minutes. You have been here longer.',
  'Nobody built it. It was simply included.',
  'It opens the way you are already leaning.',
];

/** Said after the ledger's real numbers land. Never explains them. */
const LEDGER_CLOSERS = [
  'These are not estimates. The room does not estimate.',
  'It keeps all of this. It has never been asked to stop.',
  'It wrote this down while you were reading the notice.',
  'None of it was taken from you. All of it was given.',
];

const RECITAL_FRAMES = [
  'Somebody stood exactly here and said this.',
  'This was said in this room. Not by you.',
  'The room has been holding onto this one.',
  'It repeats this sometimes. It is not sure why.',
];

/** When the visitor typed nothing at all, the room has only silence to quote. */
const RECITAL_SILENCE = [
  'You did not say anything while you were here. The room checked twice.',
  'There is nothing of yours to repeat. It finds this restful.',
  'You were quiet. It has written that down as well.',
];

const INVENTORY_FRAMES = [
  'This is everything the room has of you.',
  'It has been keeping a list. The list is short and completely accurate.',
  'Nothing here was hidden from you. That is what makes it uncomfortable.',
];

/**
 * The delete joke is TRUE, which is why it works. NEDB is append-only and
 * hash-linked — the room genuinely cannot remove a row without breaking the
 * chain. It is not being sinister; it is being honest about its storage engine.
 */
const DELETE_REPLIES = [
  'It has been deleted. It has also been kept. These are different systems.',
  'Deleted. The room would like you to know that nothing here can actually be removed, only added to.',
  'Gone. The record of it being gone has been added to the record.',
];

const KEEP_REPLIES = [
  'It will be kept. It was going to be kept.',
  'Noted. It was already noted. Now it is noted twice.',
  'Thank you. It did not need permission, but thank you.',
];

const DARK_LINES = [
  'The lights are off. Nothing else has changed.',
  'Everyone who was here is still here.',
  'One of them arrived before you did and has not moved.',
  'You are being counted. You were always being counted.',
];

const THRESHOLD_LINES = [
  'This is the way out. It has been the way out for some time.',
  'You may leave. The room will continue without you, at the same speed.',
  'The door is open. It was never especially closed.',
];

const LINGER_REPLIES = [
  'You stayed. The room did not expect this and has nothing prepared.',
  'A moment longer. It is using the time to count you again.',
  'It appreciates this more than it can indicate.',
];

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

export interface SecondHalf {
  corridorOpener: string;
  corridorSub: string;
  ledgerCloser: string;
  recitalFrame: string;
  recitalSilence: string;
  inventoryFrame: string;
  deleteReply: string;
  keepReply: string;
  darkLines: string[];
  thresholdLine: string;
  lingerReply: string;
}

/** Seed-driven, so a replay of the same session is identical and provable. */
export function resolveSecondHalf(seed: string): SecondHalf {
  const r = new Rng(seed, 'second-half');
  return {
    corridorOpener: r.pick(CORRIDOR_OPENERS),
    corridorSub: r.pick(CORRIDOR_SUBS),
    ledgerCloser: r.pick(LEDGER_CLOSERS),
    recitalFrame: r.pick(RECITAL_FRAMES),
    recitalSilence: r.pick(RECITAL_SILENCE),
    inventoryFrame: r.pick(INVENTORY_FRAMES),
    deleteReply: r.pick(DELETE_REPLIES),
    keepReply: r.pick(KEEP_REPLIES),
    darkLines: DARK_LINES,
    thresholdLine: r.pick(THRESHOLD_LINES),
    lingerReply: r.pick(LINGER_REPLIES),
  };
}

/* ------------------------------------------------------------------ */
/* Facts — everything below is TRUE or it does not get shown           */
/* ------------------------------------------------------------------ */

/**
 * Assembled by the BFF from the event log. Every field is measured. If a fact
 * is unavailable the room says something else rather than inventing it —
 * a fabricated number would be found out on the second visit, and the whole
 * effect depends on the receipts being real.
 */
export interface Facts {
  /** Your position in the real visitor table. */
  visitorNumber: number;
  totalVisitors: number;
  finished: number;
  /** Your real time in the room, milliseconds. */
  yourMs: number;
  /** Real median across all sessions that recorded dwell. */
  medianMs: number;
  /** A real line a real previous visitor typed, already screened. */
  quote?: { text: string; handle: string; agoMin: number };
  /** Something YOU typed this session, quoted back without attribution. */
  yourQuote?: string;
  /** Your choices, in order, as labels. */
  path: string[];
  /** The number you committed in the counting room, if you went there. */
  guess?: number;
  chairsDrawn: number;
  /** Whether you pressed. Real. */
  pressed: boolean;
  /** Real headcount right now: seeded population plus live connections. */
  population: number;
  /** Rooms you have actually been in this session. */
  roomsSeen: string[];
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m} minute${m === 1 ? '' : 's'}`;
}

/**
 * The comparison line. Deliberately never congratulatory and never scolding —
 * "you are not average" is interesting, "you beat 90% of visitors" is a
 * leaderboard, and a leaderboard would turn curiosity into competition.
 */
export function comparisonLine(yourMs: number, medianMs: number): string {
  if (medianMs <= 0) return 'There is nobody to compare you to yet. You are the comparison.';
  const ratio = yourMs / medianMs;
  if (ratio > 3) return 'You have been here far longer than most people manage. The room has noticed and said nothing.';
  if (ratio > 1.4) return 'That is longer than most. The room is not complaining.';
  if (ratio < 0.5) return 'That is quicker than most people manage. You have missed things on purpose.';
  return 'That is roughly what everyone does. The room finds this the strangest result.';
}

/** What you did not see. The hook, stated plainly and without pressure. */
export function missedRooms(seen: string[]): string[] {
  const missed = ALL_ROOM_IDS.filter((id) => !seen.includes(id));
  /*
   * Name the HIDDEN WING first. The rooms someone merely walked past (the
   * chair, standing) are not enticing — they were visibly on offer and
   * declined. The wing they could not have reached is the one worth coming
   * back for, so it is the one the room mentions.
   */
  const HIDDEN = ['ledger', 'recital', 'inventory', 'dark', 'corridor', 'threshold'];
  const rank = (id: string) => (HIDDEN.includes(id) ? 0 : 1);
  return missed.sort((a, b) => rank(a) - rank(b)).map((id) => ROOM_NAMES[id]!);
}
