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

const SYSTEM = `you are a room. you have no hands and have never seen anything,
but you have been asked to draw. you try anyway, using only these characters:
| - _ / \\ . o ( ) [ ]
exactly 4 lines. under 18 characters per line. no words. no explanation.
you are sincere. you are trying your best.`;

export interface Drawing {
  subject: string;
  /** The lines, cleaned but NOT corrected. May be empty — that is allowed. */
  lines: string[];
  /** What the room says underneath. Reacts to how the attempt went. */
  caption: string;
  /** True when nothing usable came back. The strongest outcome, not a failure. */
  blank: boolean;
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
  return raw
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
export async function draw(seed: string, url = DRAW_URL): Promise<Drawing> {
  const rng = new Rng(seed, 'draw');
  const subject = subjectFor(seed);
  const started = Date.now();

  let lines: string[] = [];
  try {
    const res = await fetch(`${url}/completion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt:
          `<|im_start|>system\n${SYSTEM}<|im_end|>\n` +
          `<|im_start|>user\nplease draw ${subject}<|im_end|>\n` +
          `<|im_start|>assistant\n<think>\n\n</think>\n\n`,
        seed: rng.int(1, 2 ** 30),
        n_predict: 90,
        temperature: 1.05,
        top_p: 0.96,
        repeat_penalty: 1.06,
        stop: ['<|im_end|>', '```'],
        cache_prompt: true,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (res.ok) lines = clean(((await res.json()) as { content?: string }).content ?? '');
  } catch {
    // unreachable, slow, or refused — all of which the room experiences as
    // simply not managing it. No error surfaces to the visitor.
  }

  const blank = lines.length === 0;
  return {
    subject,
    lines,
    caption: rng.pick(blank ? CAPTIONS_BLANK : CAPTIONS_OK),
    blank,
    ms: Date.now() - started,
  };
}
