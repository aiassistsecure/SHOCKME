/**
 * SHOCKME · the answer
 *
 * Oracle #9: "At least one route should require the visitor to write something
 * into the room before continuing... This creates the first moment where the
 * visitor is not merely selecting from authored options. They contribute a
 * piece of language to the room, and the room decides what that contribution
 * means."
 *
 * M: "make it at the end right? then pipe it to the actual chat for the world
 * to see."
 *
 * Placed at the THRESHOLD — the last room before the artifact. By then the
 * visitor has an impression to report, which is the Oracle's own condition,
 * and it is the only gate in the experience: you cannot leave until you answer.
 *
 * PIPING IT TO THE RAIL IS THE BEST IDEA IN THIS FEATURE. The answer does not
 * go into a database and stop. It goes straight into the live chat, where it
 * becomes an ambient line for whoever is in the room right now — and later,
 * material for somebody else's recital. The loop closes: the strangers quoting
 * things at you were people who stood exactly where you are standing.
 *
 * WHICH MAKES THIS ANONYMOUS PUBLIC TEXT, so it inherits every protection the
 * chat has: the same screen(), the same length cap, the same handle pool.
 *
 * AND IT MAKES THE ACKNOWLEDGEMENT AN HONESTY PROBLEM. The Oracle suggests
 * "Your answer has been placed somewhere warmer", which is lovely and, if we
 * are broadcasting, a lie by omission. Every acknowledgement below says the
 * room is telling the others. Cryptic is the voice; quietly publishing
 * somebody's words while implying privacy is not something to be cryptic about.
 */

import { Rng } from '../rng.ts';

/** The Oracle's range. Long enough for a thought, short enough to read. */
export const ANSWER_MIN = 2;
export const ANSWER_MAX = 200;

export const ANSWER_PROMPT = 'Before you leave, tell us what this was like.';
export const ANSWER_PLACEHOLDER = 'one sentence is enough';

/**
 * Every one of these makes the broadcast plain while staying in voice. The
 * room is allowed to be strange about what it does with your words. It is not
 * allowed to be misleading about who will see them.
 */
const ACKS = [
  'The room read it twice. It is telling the others now.',
  'Thank you. It has already been repeated to somebody who just arrived.',
  'Your answer has been placed somewhere warmer. Everyone here can see it.',
  'Noted, and passed along. The room does not keep things to itself.',
  'It has gone into the room. You will not be able to take it back out.',
];

/**
 * WHAT THE ROOM DECIDES YOUR ANSWER MEANT.
 *
 * A keyword classifier is a crude instrument and will sometimes read you
 * wrong. That would normally be a defect — here it is the mechanic. The room
 * is characterised as confidently, politely mistaken about reality, so a
 * misread tone is IN CHARACTER, and the artifact line is written to disagree
 * with you rather than to summarise you. There is no failure mode where the
 * classifier being wrong makes the product worse.
 */
export type Tone = 'unsettled' | 'delighted' | 'dismissive' | 'searching' | 'flat';

const TONE_WORDS: Record<Exclude<Tone, 'flat'>, RegExp> = {
  unsettled: /\b(creep|weird|strange|odd|unsettl|uneasy|scar|spook|eerie|off|wrong|disturb|chill)/i,
  delighted: /\b(love|great|amazing|fun|cool|brilliant|beautiful|nice|good|excellent|lol|haha|wow|incredible)/i,
  dismissive: /\b(boring|dumb|stupid|pointless|meh|whatever|nothing|waste|confus|broken|bad)/i,
  searching: /\b(what|why|how|who|wonder|think|mean|understand|explain|\?)/i,
};

export function toneOf(text: string): Tone {
  for (const [tone, re] of Object.entries(TONE_WORDS)) {
    if (re.test(text)) return tone as Tone;
  }
  return 'flat';
}

/**
 * The room's reading of your tone, for the artifact. It never simply agrees —
 * agreement would make this a sentiment widget. It records what you said and
 * then declines to accept it, which is the same move the chair count makes.
 */
const TONE_LINES: Record<Tone, string[]> = {
  unsettled: [
    'you said it was strange. the room has recorded that as a compliment.',
    'you found it unsettling. the room found you very calm.',
  ],
  delighted: [
    'you enjoyed yourself. the room is not sure that was available.',
    'you said something kind. it has been filed under things that were said.',
  ],
  dismissive: [
    'you were unimpressed. the room has written down that you stayed anyway.',
    'you did not think much of it. it thought a great deal of you.',
  ],
  searching: [
    'you asked a question on your way out. the room has kept it, unanswered.',
    'you wanted to know what this was. so does it.',
  ],
  flat: [
    'you answered plainly. the room has chosen not to agree.',
    'one sentence was submitted. it did not match the room’s version of your visit.',
  ],
};

/**
 * A SHORT fragment only. The Oracle is explicit — do not echo the whole
 * submission back. Six words is enough to be recognisably yours and not
 * enough to be a transcript.
 */
export function fragmentOf(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length < text.trim().length ? `${words}…` : words;
}

export interface AnswerReading {
  ack: string;
  tone: Tone;
  /** The artifact line. Truthful about the act, sceptical about the content. */
  artifactLine: string;
  fragment: string;
}

export function readAnswer(seed: string, text: string): AnswerReading {
  const r = new Rng(seed, 'answer');
  const tone = toneOf(text);
  return {
    ack: r.pick(ACKS),
    tone,
    artifactLine: r.pick(TONE_LINES[tone]),
    fragment: fragmentOf(text),
  };
}
