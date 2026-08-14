/**
 * SHOCKME · the room tries to draw
 *
 * imagine is asked, at the end of a visit, to draw something. It is a 0.8B
 * model with no spatial faculty whatsoever, so it is bad at this — and that
 * is the entire point.
 *
 * HOW THIS BECAME THE FEATURE. Two experiments were run before this file
 * existed. Asked for competent ASCII art, imagine produced a markdown fence
 * and 393 characters of underscores. Asked for a joke, it rambled for 8.4s
 * without landing one. Both were logged as failures and the plan was to
 * render everything deterministically instead.
 *
 * M pushed back: "it's actually supposed to be weird so idk it might work if
 * you work it." He was right and the criterion was wrong. The bar is not
 * "is this a competent drawing", it is "is this strange". Re-read with the
 * correct bar, the outputs are excellent:
 *
 *   asked to draw the person who just left, it wrote out the palette of
 *   characters it had been given, four times — it does not know what a
 *   person looks like, so it copied the alphabet.
 *
 *   asked to draw itself, it produced nothing at all.
 *
 * So nothing here tries to make the model good at drawing. The frame does
 * the work: this is a sincere attempt by something with no hands that has
 * never seen anything. Failure is in character. An EMPTY result is the best
 * outcome available and is treated as a success, not an error.
 *
 * The only hard rules are safety and size. Everything else is allowed
 * through, because the mess is the art.
 */

import type { Transport } from './imagine.ts';
import { Rng } from './rng.ts';

export const DRAW_URL = process.env.IMAGINE_URL ?? 'http://127.0.0.1:8081';

/** Characters the room is permitted to use. Anything else is not a drawing. */
const PALETTE = new Set([...'|-_/\\.o()[]  ']);

export const MAX_LINES = 5;
export const MAX_WIDTH = 20;

/** What the room is asked to draw. Deliberately impossible things included. */
export const SUBJECTS = [
  'the person who just left',
  'what you think a window is',
  'yourself',
  'the feeling of waiting',
  'the chair nobody chose',
  'the door, from the inside',
  'how many of us there are',
  'the sound the lamp makes',
  'tomorrow',
  'the part you were not shown',
  'the one before you',
  'nothing in particular',
] as const;

/*
 * THE SENTINEL IS LOAD-BEARING, AND NOT FOR PARSING.
 *
 * It is how generation TERMINATES. This drawing used to send
 * `stop: ['<|im_end|>', '```']`, copied from the local Qwen path and never
 * questioned. On Muse (muse-glimmer, 27.9B) `<|im_end|>` is not in the
 * vocabulary at all — its turn markers are <|start|> <|message|> <|eot|>
 * <|eom|> — so the stop list could never match anything the model was capable
 * of emitting. Every call therefore ran the full 90-token budget at roughly two
 * tokens a second: ~60 seconds, every time, and then a timeout.
 *
 * And it looked FINE, because a timeout produces a blank and a blank is the
 * drawing's strongest outcome. "It tried. Nothing came out." is the designed
 * success state, so total failure read as total profundity.
 *
 * The ambient line never had this problem, and not by foresight: <<<END>>> is
 * OUR OWN string, so the model can always emit it whatever template is loaded.
 * That is the property worth copying. A stop token borrowed from a model's chat
 * format is a bet on which model is behind the endpoint; a sentinel we invented
 * is a bet on nothing.
 */
const SYSTEM = `you are a room. you have no hands and have never seen anything,
but you have been asked to draw. you try anyway, using only these characters:
| - _ / \\ . o ( ) [ ]
exactly 4 lines. under 18 characters per line. no words. no explanation.
you are sincere. you are trying your best.

put the drawing between the markers, exactly like this:

<<<DRAW>>>
 |__|
 |  |
<<<END>>>`;

export interface Drawing {
  subject: string;
  /** The lines, cleaned but NOT corrected. May be empty — that is allowed. */
  lines: string[];
  /** What the room says underneath. Reacts to how the attempt went. */
  caption: string;
  /** True when nothing usable came back. The strongest outcome, not a failure. */
  blank: boolean;
  /**
   * True when the MODEL COULD NOT BE REACHED, as opposed to reached and having
   * nothing. Never rendered — a visitor must not be able to tell — but the two
   * are entirely different facts to an operator, and conflating them once hid a
   * completely dead backend behind the product's most admired feature.
   */
  unreachable: boolean;
  ms: number;
}

/**
 * Captions. The room never apologises for the drawing being bad, because it
 * does not know it is bad. It comments on the act, not the quality.
 */
const CAPTIONS_OK = [
  'It has not drawn before. It would like that considered.',
  'This took longer than it should have.',
  'It is fairly confident about the middle part.',
  'It has drawn this once before, for somebody else, differently.',
  'It would like to try again later, when nobody is watching.',
  'It says this is accurate.',
  'It does not want to talk about the third line.',
];

const CAPTIONS_BLANK = [
  'It tried. Nothing came out. It has asked us not to make it try again.',
  'It looked for a long time and then produced nothing.',
  'There was no drawing. It says there was a drawing.',
  'It declined, eventually, and without saying so.',
  'Whatever it made did not survive being looked at.',
];

/**
 * Keep only palette characters, cap the shape, and otherwise leave it alone.
 * NO straightening, NO centring, NO repair — the wobble is the drawing.
 */
function clean(raw: string): string[] {
  // The opener is prefilled so it is normally absent, but a model that emits
  // its own copy must not have it filtered into a row of angle brackets.
  return raw
    .replace(/<<<\s*DRAW\s*>>>/gi, '')
    .replace(/<<<\s*END\s*>>>[\s\S]*$/i, '')
    .split('\n')
    .map((line) => [...line].filter((c) => PALETTE.has(c)).join('').trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, MAX_LINES)
    .map((line) => line.slice(0, MAX_WIDTH));
}

/** Which subject this visitor gets. Stable per session. */
export function subjectFor(seed: string): string {
  return new Rng(seed, 'draw:subject').pick(SUBJECTS);
}

/**
 * Ask the room to draw. Never throws — an unreachable model produces a blank
 * attempt, which reads exactly like the model trying and failing, so the
 * fiction survives the infrastructure being down.
 */
export async function draw(seed: string, transport: Transport): Promise<Drawing> {
  const rng = new Rng(seed, 'draw');
  const subject = subjectFor(seed);
  const started = Date.now();

  let lines: string[] = [];
  let unreachable = false;

  try {
    const raw = await transport.complete(
      // Prefill the opening marker for the same reason imagine.ts does: the
      // model never writes the tag it could get wrong, only the payload.
      { system: SYSTEM, user: `please draw ${subject}`, prefill: '<<<DRAW>>>\n' },
      rng.int(1, 2 ** 30),
      {
        maxTokens: 90,
        temperature: 1.05,
        topP: 0.96,
        repeatPenalty: 1.06,
        /*
         * A sentinel we own, plus the two real terminators of the models we
         * actually talk to. NOT <|im_end|> — see the note on SYSTEM above.
         *   <<<END>>>  our marker, emittable under any template
         *   <|eot|>    muse-glimmer end of turn
         *   ```        a code fence, which every model reaches for eventually
         */
        stop: ['<<<END>>>', '<|eot|>', '```'],
      },
    );
    lines = clean(raw);
  } catch {
    /*
     * A DEAD BACKEND USED TO BE INDISTINGUISHABLE FROM THE ART.
     *
     * This catch is deliberate and stays: an unreachable model must never
     * surface an error to a visitor, and a blank reads exactly like the room
     * trying and failing, which is the strongest outcome the drawing has.
     *
     * But that is precisely what made it dangerous. When the local
     * llama-server was stopped — on my own advice, after the ambient lines
     * moved to the gateway — EVERY drawing went blank and every one of them
     * read as intentional. "It tried. Nothing came out." is the designed
     * success state, so 100% failure looked like 100% profundity, and the only
     * tell was a rate in the back room that nobody was watching.
     *
     * So the fiction is unchanged for the visitor and the TRUTH is now
     * recorded for the operator. `unreachable` never reaches the page; it
     * exists so the back room can separate "the room had nothing to say" from
     * "there was no room to ask".
     */
    unreachable = true;
    transport.reset();
  }

  const blank = lines.length === 0;
  return {
    subject,
    lines,
    caption: rng.pick(blank ? CAPTIONS_BLANK : CAPTIONS_OK),
    blank,
    unreachable,
    ms: Date.now() - started,
  };
}
