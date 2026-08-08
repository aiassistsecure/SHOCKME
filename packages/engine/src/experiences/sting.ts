/**
 * SHOCKME · stings
 *
 * M: "make it a little scary but not in a deathly horror more in a edge of my
 * seat manner when reading the words it should SHOCK ME sometimes."
 *
 * WHY THE COPY WAS NOT LANDING. Every line in the second half is drawn from a
 * pool at random. Pools produce ATMOSPHERE — a consistent, pleasant, slightly
 * wrong hum. They cannot produce TENSION, because tension requires the line to
 * be about you specifically, and a random pick is by definition about nobody.
 *
 * A sting is the opposite: it does not fire unless a specific, measured thing
 * is true about this visitor right now. If nothing is true, nothing fires. The
 * room says something ordinary instead and the visitor never knows a sting
 * existed.
 *
 * THE CRAFT RULES, since "make it scarier" is otherwise unfalsifiable:
 *
 *   1. SPECIFICITY IS THE WHOLE EFFECT. "You waited 41 seconds" is unsettling.
 *      "You waited a while" is set dressing. Every sting quotes a real number.
 *   2. SHORT. Tension does not survive a subordinate clause. Most stings are
 *      under twelve words and many are under six.
 *   3. THE TURN. Benign sentence, then a pivot that recontextualises it:
 *      "It is not following you. It is ahead of you."
 *   4. IMPLICATION, NEVER STATEMENT. The room never says anything frightening.
 *      It says something mundane whose implication is frightening, and lets
 *      the visitor do the work. Fear you assemble yourself is the good kind.
 *   5. NO THREAT, EVER. Nothing here menaces the visitor, promises harm, or
 *      implies they are trapped. That is the horror register M ruled out, and
 *      it is also cheap. The room is polite, patient and slightly wrong.
 *   6. RARE. Two per session, hard cap. A shock that happens every screen is
 *      a texture, and texture is what we already had.
 *
 * Everything a sting asserts is TRUE — the same rule the ledger and recital
 * follow. The room is unsettling because it was paying attention, not because
 * it is pretending to be haunted.
 */

import { Rng } from '../rng.ts';
import type { Facts } from './second-half.ts';

/** Hard cap per session. The third shock is not a shock. */
export const MAX_STINGS = 2;

export interface Sting {
  id: string;
  /** Only fires when this is genuinely true of this visitor, right now. */
  when: (f: Facts, ctx: StingCtx) => boolean;
  /** Written fresh each time so it can quote the real number. */
  line: (f: Facts, ctx: StingCtx) => string;
  /** Higher wins when several are eligible. The rarest facts hit hardest. */
  power: number;
}

export interface StingCtx {
  sceneId: string;
  visitCount: number;
  /** Real milliseconds between the button appearing and being resolved. */
  buttonHesitationMs: number;
  /** How many stings have already fired this session. */
  fired: number;
}

const secs = (ms: number) => Math.max(1, Math.round(ms / 1000));
/** "1 second", not "1 seconds". A grammar slip kills the spell instantly. */
const sec = (ms: number) => { const n = secs(ms); return `${n} second${n === 1 ? '' : 's'}`; };

/**
 * Ordered by power, not by scene. A sting belongs to a FACT, not a room —
 * which is what makes the room feel like it is watching rather than reciting.
 */
export const STINGS: Sting[] = [
  {
    /*
     * The strongest one available, and it costs nothing: people who skim are
     * told, accurately, that they are skimming. It tends to stop them dead.
     */
    id: 'not-reading',
    power: 95,
    /*
     * FLOOR AS WELL AS CEILING. Without the floor this fires at one second
     * and reads as a bug rather than an observation — the visitor has to have
     * been here long enough for "you are not reading this" to be a claim
     * about them instead of about the page load.
     */
    when: (f) => f.yourMs >= 8_000 && f.yourMs < 30_000 && f.path.length >= 3,
    line: (f) => `You have been here ${sec(f.yourMs)}. You are not reading this.`,
  },
  {
    id: 'hesitated',
    power: 90,
    when: (_f, c) => c.buttonHesitationMs > 12_000,
    line: (_f, c) => `You thought about the button for ${sec(c.buttonHesitationMs)}. It thought about you for exactly as long.`,
  },
  {
    id: 'been-here-before',
    power: 88,
    when: (_f, c) => c.visitCount > 0,
    line: (_f, c) => c.visitCount === 1
      ? 'You have been here before. The room did not mention it last time either.'
      : `This is visit ${c.visitCount + 1}. The room has stopped counting out loud.`,
  },
  {
    id: 'quoted-back',
    power: 86,
    when: (f) => Boolean(f.yourQuote && f.yourQuote.length > 3),
    line: (f) => `Somebody said \u201C${f.yourQuote}\u201D in this room. The room is not going to say who.`,
  },
  {
    id: 'alone',
    power: 80,
    when: (f) => f.population <= 1,
    line: () => 'There is nobody else here. Something is still typing.',
  },
  {
    id: 'crowded',
    power: 62,
    when: (f) => f.population >= 6,
    line: (f) => `There are ${f.population} of us in here. One of them has not moved since you arrived.`,
  },
  {
    id: 'prescient',
    power: 84,
    when: (f) => f.guess !== undefined && f.guess === f.chairsDrawn,
    line: (f) => `You said ${f.guess} chairs before there were ${f.guess} chairs. The room would like a word.`,
  },
  {
    id: 'long-stay',
    power: 70,
    when: (f) => f.medianMs > 0 && f.yourMs > f.medianMs * 4,
    line: (f) => `You have been here ${Math.round(f.yourMs / f.medianMs)} times longer than most people last. Nobody has come to check.`,
  },
  {
    id: 'refused',
    power: 66,
    when: (f) => !f.pressed && f.path.length >= 4,
    line: () => 'You left the button alone. It has your position.',
  },
  {
    id: 'pressed',
    power: 64,
    when: (f) => f.pressed,
    line: () => 'You pressed it. It has not finished happening yet.',
  },
  {
    id: 'thorough',
    power: 60,
    when: (f) => f.roomsSeen.length >= 7,
    line: (f) => `You have been in ${f.roomsSeen.length} rooms. Most people find four. The room is adjusting.`,
  },
  {
    /* The floor. Always true, so a sting is always available if one is due. */
    id: 'counted',
    power: 10,
    when: () => true,
    line: (f) => `You are visitor ${f.visitorNumber}. The room remembers ${f.totalVisitors}. These are not the same number for long.`,
  },
];

/**
 * Choose at most one sting for this screen.
 *
 * Deterministic per session and scene, so a replay of the same visit produces
 * the same shocks in the same places — the whole experience is provable from
 * the seed and a sting must not break that.
 */
export function stingFor(
  seed: string,
  facts: Facts,
  ctx: StingCtx,
): { id: string; line: string } | undefined {
  if (ctx.fired >= MAX_STINGS) return undefined;

  const eligible = STINGS.filter((s) => {
    try { return s.when(facts, ctx); } catch { return false; }
  });
  if (!eligible.length) return undefined;

  const r = new Rng(seed, `sting:${ctx.sceneId}`);

  /*
   * Not every eligible screen gets one. Guaranteeing a sting per room would
   * make them predictable, and a predictable shock is just a layout element.
   * Roughly half the time the room simply says nothing extra.
   */
  if (!r.bool(0.55)) return undefined;

  // Prefer the most powerful, but let the next few in occasionally so a
  // second run does not replay the same beat in the same place.
  const top = eligible.sort((a, b) => b.power - a.power).slice(0, 3);
  const chosen = r.weighted(top.map((s, i) => [s, [6, 3, 1][i] ?? 1] as const));

  try {
    return { id: chosen.id, line: chosen.line(facts, ctx) };
  } catch {
    return undefined;
  }
}
