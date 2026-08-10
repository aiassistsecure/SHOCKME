/**
 * SHOCKME · v2 room modules
 *
 * Seven new rooms, plus the office promoted out of floorplan.ts. Together with
 * the existing thirteen that is a catalogue of twenty-one, and a visit still
 * sees five to eight of them.
 *
 * HOUSE STYLE, because "make it stranger" is unfalsifiable:
 *   - the room is courteous, intimate, and confidently mistaken
 *   - it may be poetically wrong about what a true event MEANT
 *   - it may never invent the event
 *   - specificity is the entire effect; a vague room is a boring room
 *   - short. Tension dies in a subordinate clause
 *   - no threats, no horror vocabulary, no second person accusations
 *
 * Every `{object}` is a bound token: two to four words the model supplies
 * once, substituted into the authored sentences below, then fixed for the
 * whole visit and carried into the artifact. When the model is cold the
 * fallback nouns are used and nothing about the room reads as missing.
 */

import type { RoomModule } from './discovery.ts';

/* ------------------------------------------------------------------ */
/* 1 · THE CORRECTIONS DESK                                            */
/* ------------------------------------------------------------------ */

const CORRECTIONS: RoomModule = {
  id: 'corrections', version: 1, group: 'record', cost: 1, chance: 0.34,
  replace: { scene: 'corridor' },
  requires: (f) => f.arrivalReading !== null,
  scene: {
    id: 'corrections', renderer: 'discovery',
    choices: [
      { id: 'correct', label: 'File a correction' },
      { id: 'leave-it', label: 'Leave the record as it stands' },
    ],
  },
  /*
   * The two-record mechanic as furniture. What happened on the left, what the
   * room made of it on the right. You may disagree; you may not overwrite.
   * That is a literal description of the storage engine, which is the same
   * joke as "It has been deleted. It has also been kept."
   */
  variants: [
    {
      id: 'silent', weight: 4,
      lines: [
        'A desk with two columns. On the left, what happened. On the right, what the room made of it.',
        'The {object} is for corrections. Corrections are accepted immediately and without argument.',
        'The original reading stays above the correction. Both remain legible. That is the arrangement.',
      ],
    },
    {
      id: 'reason', weight: 3,
      lines: [
        'A desk with two columns, and a third the room has not labelled.',
        'You may file a correction. The {object} asks, politely, for a reason.',
        'Reasons are filed under a different heading than the corrections they belong to. Nobody here can say why.',
      ],
      labels: { correct: 'File it, with a reason' },
    },
    {
      id: 'second-opinion', weight: 3,
      lines: [
        'A desk. Two columns. The {object} has been used before and recently.',
        'There is a field for your correction. The button beneath it does not say submit.',
        'It says: file as second opinion.',
      ],
      labels: { correct: 'File as second opinion' },
    },
  ],
  slots: [
    { kind: 'bound_token', token: '{object}', fallback: [
      'correction tray', 'the second ledger', 'a shallow wooden tray', 'the amendments drawer',
    ] },
    { kind: 'margin', fallback: [
      'corrected, and kept',
      'the earlier version is still upstairs',
      'noted twice, deliberately',
      'both readings survive this',
    ] },
    { kind: 'heading', fallback: ['Corrections', 'The Second Column', 'Amendments'] },
    { kind: 'artifact_line', fallback: [
      'you corrected the room. the room kept the original.',
      'a second opinion was filed and both were preserved.',
    ] },
  ],
};

/* ------------------------------------------------------------------ */
/* 2 · THE FILE ROOM                                                   */
/* ------------------------------------------------------------------ */

const FILE_ROOM: RoomModule = {
  id: 'file-room', version: 1, group: 'record', cost: 1, chance: 0.34,
  replace: { scene: 'corridor' },
  requires: (f) => f.arrivalReading !== null,
  scene: {
    id: 'file-room', renderer: 'discovery',
    choices: [
      { id: 'read', label: 'Read your file' },
      { id: 'close', label: 'Close it' },
    ],
  },
  /*
   * verifyExperienceHistory() surfaced in-world, late, as atmosphere rather
   * than as a settings page. Tamper-evidence is the most literally true thing
   * this product can say about itself, and it has never been said to a
   * visitor. The inscription slot is the strongest object in the whole set:
   * a line already written inside your own file, in a hand that isn't yours.
   */
  variants: [
    {
      id: 'complete', weight: 4,
      lines: [
        'Your file is here. It is thinner than you would expect and entirely accurate.',
        'Someone has written on the {object} in a hand that is not the room\'s.',
        'Every page is linked to the page before it. Nothing has been altered since you started making it.',
      ],
    },
    {
      id: 'misfiled', weight: 3,
      lines: [
        'Your file is here, under a heading you would not have chosen.',
        'The {object} carries a note in a hand that is not the room\'s.',
        'The heading is wrong. The contents are yours. Both facts have been checked.',
      ],
    },
    {
      id: 'verify-only', weight: 2,
      lines: [
        'There is nothing in this room except the confirmation.',
        'Your history is intact and hash-linked. The room can prove this and has.',
        'It cannot prove anything about what the history means.',
      ],
      labels: { read: 'Read the confirmation' },
    },
  ],
  slots: [
    { kind: 'bound_token', token: '{object}', fallback: [
      'inside cover', 'first page', 'index card', 'folder flap',
    ] },
    { kind: 'inscription', fallback: [
      'do not let them tell you it was shorter',
      'the fourth page is the one that matters',
      'this was easier to keep than to explain',
      'someone will ask about the chairs',
      'filed early, on purpose',
    ] },
    { kind: 'object_label', fallback: [
      'file, unnumbered', 'record of a visit in progress', 'open matter',
    ] },
    { kind: 'heading', fallback: ['Your File', 'Records', 'Open Matter'] },
    { kind: 'artifact_line', fallback: [
      'you read your own file. it was intact.',
      'your history was checked in front of you and held.',
    ] },
  ],
};

/* ------------------------------------------------------------------ */
/* 3 · THE WAITING ROOM FOR THE WAITING ROOM                           */
/* ------------------------------------------------------------------ */

const RECURSION: RoomModule = {
  id: 'antechamber', version: 1, group: 'recursion', cost: 1, chance: 0.3,
  replace: { scene: 'counting', choice: 'disagree' },
  requires: (f) => f.counted,
  scene: {
    id: 'antechamber', renderer: 'discovery',
    choices: [{ id: 'through', label: 'Go through' }],
  },
  /*
   * One choice, deliberately. By this point the visitor has learned a
   * two-button grammar; a single door reads as the room having decided.
   * One inscription only — the power here is the repetition, and a second
   * generated line would dilute the one thing the room is doing.
   */
  variants: [
    {
      id: 'matching', weight: 4,
      lines: [
        'This is not the room you were in. It is the room that room was waiting in.',
        'The chairs are the same number you counted. The {object} is not the one you remember.',
      ],
    },
    {
      id: 'one-fewer', weight: 3,
      lines: [
        'This is not the room you were in. It is the room that room was waiting in.',
        'There is one chair fewer. A card on the {object} says seating was removed after the count.',
        'Your count is not affected. The room would like you to know it was accepted.',
      ],
    },
    {
      id: 'none', weight: 2,
      lines: [
        'This is not the room you were in. It is the room that room was waiting in.',
        'There are no chairs at all. The {object} explains that the count was accepted anyway.',
      ],
    },
  ],
  slots: [
    { kind: 'bound_token', token: '{object}', fallback: [
      'notice board', 'card on the wall', 'small brass plate', 'folded sign',
    ] },
    { kind: 'inscription', fallback: [
      'you have been here for slightly less time than you think',
      'the other room is still waiting',
      'this one does not need to be counted',
      'nobody has ever gone back through',
    ] },
    { kind: 'heading', fallback: ['Antechamber', 'Before The Room', 'The Other Waiting'] },
    { kind: 'artifact_line', fallback: [
      'you found the room the waiting room was waiting in.',
    ] },
  ],
};

/* ------------------------------------------------------------------ */
/* 4 · THE ROOM OF PEOPLE WHO CHOSE DIFFERENTLY                        */
/* ------------------------------------------------------------------ */

const AUDIENCE: RoomModule = {
  id: 'others', version: 1, group: 'audience', cost: 1, chance: 0.28,
  replace: { scene: 'button', choice: 'refuse' },
  requires: (f) => f.choices.length > 0,
  scene: {
    id: 'others', renderer: 'discovery',
    choices: [
      { id: 'listen', label: 'Listen' },
      { id: 'move-on', label: 'Move on' },
    ],
  },
  /*
   * The Audience, as a room rather than a rail event. Two of the three voices
   * are real prior visitors — screened answers that already exist. The third
   * is generated, and the three are presented identically.
   *
   * THE HONESTY LINE, and it is fine but it is close: the room says voices
   * were near the door, which is true. It never claims all three are people.
   * Never a platform, never a time, never who.
   */
  variants: [
    {
      id: 'three', weight: 5,
      lines: [
        'People were near this door. They did not agree which way it opened.',
        'Their {object} is still here. The room keeps these for a while and then does not.',
      ],
    },
    {
      id: 'silence', weight: 2,
      lines: [
        'People were near this door. Not recently.',
        'The {object} is empty, and the room says so rather than inventing company for you.',
      ],
    },
    {
      id: 'one-thrice', weight: 3,
      lines: [
        'One person was near this door three times.',
        'The {object} holds all three. They are not quite the same each time.',
      ],
    },
  ],
  slots: [
    { kind: 'bound_token', token: '{object}', fallback: [
      'overheard column', 'the near-door book', 'a short list', 'the listening shelf',
    ] },
    { kind: 'witness_fragment', fallback: [
      'i went the other way and it was the same corridor',
      'somebody counted out loud and then stopped',
      'the door on the left was mentioned before i saw it',
      'i do not think it was waiting for me specifically',
    ] },
    { kind: 'heading', fallback: ['Also Near', 'Others', 'Near The Door'] },
    { kind: 'artifact_line', fallback: [
      'you heard the people who chose the other door.',
    ] },
  ],
};

/* ------------------------------------------------------------------ */
/* 5 · THE LOST AND FOUND                                              */
/* ------------------------------------------------------------------ */

const LOST_FOUND: RoomModule = {
  id: 'lost-found', version: 1, group: 'residue', cost: 1, chance: 0.3,
  replace: { scene: 'button', choice: 'press' },
  scene: {
    id: 'lost-found', renderer: 'discovery',
    choices: [
      { id: 'look', label: 'Look at the shelf' },
      { id: 'leave', label: 'Leave it alone' },
    ],
  },
  /*
   * Objects left by visits that did not finish. Derived from the SHAPE of an
   * abandoned session — a number committed to, a room left early — and never
   * from its identity. "A number somebody committed to and did not come back
   * for: 7" is true, specific, and about nobody.
   */
  variants: [
    {
      id: 'full', weight: 4,
      lines: [
        'A shelf of things left by visits that stopped partway.',
        'A number somebody committed to and did not come back for. A {object}. Two rooms nobody finished.',
        'None of it is labelled with a person. The room is not able to do that and would not.',
      ],
    },
    {
      id: 'claimed', weight: 2,
      lines: [
        'A shelf, recently emptied.',
        'A card where the {object} was says the items were claimed. It does not say by whom.',
      ],
    },
    {
      id: 'yours', weight: 2,
      lines: [
        'A shelf of things left by visits that stopped partway.',
        'One of them is yours. The {object} has your previous visit\'s number on it.',
        'You are welcome to take it. It will be here either way.',
      ],
    },
  ],
  slots: [
    { kind: 'bound_token', token: '{object}', fallback: [
      'unopened envelope', 'half-finished tally', 'small numbered tag', 'folded paper square',
    ] },
    { kind: 'object_label', fallback: [
      'unclaimed count', 'left at the third room', 'nobody came back for this',
    ] },
    { kind: 'margin', fallback: [
      'kept longer than required',
      'nobody has asked about these',
      'the shelf is not full yet',
    ] },
    { kind: 'heading', fallback: ['Lost And Found', 'Left Behind', 'Unclaimed'] },
    { kind: 'artifact_line', fallback: [
      'you looked at what other visits left behind.',
    ] },
  ],
};

/* ------------------------------------------------------------------ */
/* 6 · THE NAMING ROOM                                                 */
/* ------------------------------------------------------------------ */

const NAMING: RoomModule = {
  id: 'naming', version: 1, group: 'authorship', cost: 1, chance: 0.26,
  replace: { scene: 'counting', choice: 'agree' },
  scene: {
    id: 'naming', renderer: 'naming',
    choices: [
      { id: 'name', label: 'Give it a name' },
      { id: 'decline', label: 'Leave it unnamed' },
    ],
  },
  /*
   * The strongest personal-difference generator in the set, for the price of
   * one input field. Your word is used verbatim in later authored copy and on
   * the artifact.
   *
   * TWO HARD RULES, enforced in the renderer, not here:
   *   1. the word NEVER enters an Imagine prompt
   *   2. the word NEVER enters a share unfurl
   *
   * The timing makes rule 1 free. Capsules are queued when the discovery
   * becomes eligible — before you arrive — so the model's provisional name
   * already exists and yours simply overwrites it. Which is also the better
   * story: the room had already called it something.
   */
  variants: [
    {
      id: 'accepted', weight: 4,
      lines: [
        'There is something here that should not need a name.',
        'The room has been calling it the {object}, provisionally, and is not attached to that.',
        'You may name it. Everything after this will use your word.',
      ],
    },
    {
      id: 'misspelled', weight: 3,
      lines: [
        'There is something here that should not need a name.',
        'The room has been calling it the {object}. It would prefer your version.',
        'It will repeat your word back to you slightly wrong, consistently, for the rest of the visit.',
      ],
    },
    {
      id: 'refused-later', weight: 2,
      lines: [
        'There is something here that should not need a name.',
        'The room has been calling it the {object} and would like to stop.',
        'One room later on will decline to use your word. It will not explain.',
      ],
    },
  ],
  slots: [
    { kind: 'bound_token', token: '{object}', fallback: [
      'upright thing', 'grey fixture', 'standing object', 'the unnamed one',
    ] },
    { kind: 'figure', fallback: [] },
    { kind: 'heading', fallback: ['Naming', 'The Unnamed', 'A Thing Without One'] },
    { kind: 'artifact_line', fallback: [
      'the room had already called it something else.',
    ] },
  ],
};

/* ------------------------------------------------------------------ */
/* 7 · THE DOOR MENTIONED TOO SOON                                     */
/* ------------------------------------------------------------------ */

const FORETOLD: RoomModule = {
  id: 'foretold', version: 1, group: 'foretold', cost: 1, chance: 0.24,
  replace: { scene: 'threshold' },
  scene: {
    id: 'foretold', renderer: 'discovery',
    choices: [
      { id: 'left', label: 'Take the door on the left' },
      { id: 'straight', label: 'Carry on' },
    ],
  },
  /*
   * A stranger on the rail says "there was a door on the left" and the next
   * room has one. Nothing highlights the relation and nothing acknowledges it.
   * The visitor is allowed to wonder whether the rail foresaw the door or
   * caused it — and one variant makes the rail simply wrong, which is what
   * stops the effect from becoming a reliable trick.
   */
  variants: [
    {
      id: 'opens', weight: 4,
      lines: [
        'A short corridor. There is a door on the left.',
        'The {object} beside it has been read many times.',
      ],
    },
    {
      id: 'not-installed', weight: 3,
      lines: [
        'A short corridor. There is a door on the left, and it does not open.',
        'The {object} on it says: mentioned, not yet installed.',
      ],
      labels: { left: 'Try it anyway' },
    },
    {
      id: 'wrong', weight: 3,
      lines: [
        'A short corridor. There is no door on the left.',
        'The {object} is where a door would be. Nothing in the room acknowledges this.',
      ],
      labels: { left: 'Look at the left wall' },
    },
  ],
  slots: [
    { kind: 'bound_token', token: '{object}', fallback: [
      'small plate', 'painted marker', 'notice at eye height', 'strip of tape',
    ] },
    { kind: 'inscription', fallback: [
      'this was here before it was here',
      'somebody described this correctly and early',
      'left, as stated',
      'the mention came first',
    ] },
    { kind: 'witness_fragment', fallback: [
      'there was a door on the left',
      'i remember a door on the left, i think',
      'somebody said left before anyone went left',
    ] },
    { kind: 'heading', fallback: ['On The Left', 'The Mentioned Door', 'Corridor'] },
    { kind: 'artifact_line', fallback: [
      'the door on the left was mentioned before you reached it.',
    ] },
  ],
};

/* ------------------------------------------------------------------ */
/* 8 · THE OFFICE WITHOUT A CHAIR — promoted, not rewritten            */
/* ------------------------------------------------------------------ */

/**
 * `office` already exists in floorplan.ts at ~17%, with its own copy pool. It
 * is the brief's own capsule example, so it becomes a registry module rather
 * than a ninth authored room — which also proves the registry can absorb a
 * room that predates it. floorplan.ts keeps its own office path untouched;
 * this module is skipped automatically when that path already placed one,
 * because planDiscoveries() refuses a scene id already in the plan.
 */
const OFFICE: RoomModule = {
  id: 'office-v2', version: 1, group: 'residue', cost: 1, chance: 0.2,
  replace: { scene: 'corridor' },
  scene: {
    id: 'office', renderer: 'office',
    choices: [
      { id: 'sign', label: 'Sign it' },
      { id: 'unsign', label: 'Leave it blank' },
    ],
  },
  variants: [
    {
      id: 'classic', weight: 5,
      lines: [
        'There is a desk in here. There is no chair for it.',
        'The {object} is open to a page with no beginning.',
      ],
    },
    {
      id: 'behind', weight: 3,
      lines: [
        'There is a desk in here and no chair for it.',
        'Somebody has been processing the visits. The {object} says they are behind.',
        'Your position has already been filled in.',
      ],
    },
  ],
  slots: [
    { kind: 'bound_token', token: '{object}', fallback: [
      'filing tray', 'open ledger', 'receipt for an unopened door', 'processing sheet',
    ] },
    { kind: 'margin', fallback: [
      'counted things are difficult to return',
      'signed in advance, by arrangement',
      'the desk was here first',
    ] },
    { kind: 'object_label', fallback: [
      'desk, no chair', 'position already filled', 'in progress',
    ] },
    { kind: 'artifact_line', fallback: [
      'you found the office. most visits do not.',
    ] },
  ],
};

/* ------------------------------------------------------------------ */

/** The catalogue. Unbounded by design — this is a launch batch, not a ceiling. */
export const REGISTRY: readonly RoomModule[] = [
  CORRECTIONS, FILE_ROOM, RECURSION, AUDIENCE, LOST_FOUND, NAMING, FORETOLD, OFFICE,
];

/** Every group in the registry. A visit gets at most one module per group. */
export const GROUPS = [...new Set(REGISTRY.map((m) => m.group))];
