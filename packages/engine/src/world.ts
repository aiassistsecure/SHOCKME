/**
 * SHOCKME · the world clock and its inhabitants
 *
 * The room is never empty. A deterministic bot population keeps the chat
 * stream alive between real visitors, and real visitors drop into the same
 * stream — so "is that a person?" stays genuinely unanswerable.
 *
 * DETERMINISTIC BY DESIGN (no LLM in the loop):
 *   every line is a pure function of (worldSeed, tick, botId), so the same
 *   tick replays identically forever. That is what makes the chat stream
 *   AS-OF replayable and TRACE-able alongside everything else. It also means
 *   the room costs nothing to run and can never say something unsafe.
 *
 * THE TRICK — per-observer divergence:
 *   one broadcast is written once, then rendered per observer. Two visitors
 *   watching the same instant read different words. Neither is shown the
 *   other's version until they compare. That is the whole product in one
 *   mechanism.
 */

import { Rng } from './rng.ts';

/** Real time is quantised into ticks so every client agrees on "now". */
export const TICK_MS = 4000;

export function currentTick(now: number = Date.now()): number {
  return Math.floor(now / TICK_MS);
}

/** The world's own seed. Stable per deployment; salts every shared event. */
export const WORLD_SEED = process.env.SHOCKME_WORLD_SEED ?? 'the-room-remembers';

/* ------------------------------------------------------------------ */
/* Inhabitants                                                         */
/* ------------------------------------------------------------------ */

/**
 * Handles read as anonymous visitors, not as characters with names — the
 * moment a bot is called "Sally" the illusion becomes fiction. These read
 * like other people who also didn't give their name.
 */
export const HANDLE_STEMS = [
  'someone', 'a visitor', 'nobody', 'a guest', 'the other one', 'a passerby',
  'anon', 'a stranger', 'not you', 'a later arrival', 'an earlier arrival',
  'a quiet one', 'the seventh', 'a returning shape', 'a held breath',
] as const;

export interface Inhabitant {
  botId: string;
  handle: string;
  /** How talkative. Low values make the room feel sparse and real. */
  chattiness: number;
  /** Ticks between this bot's possible utterances. */
  cadence: number;
}

/**
 * The population curve. Deliberately not flat — a room whose occupancy never
 * changes reads as fake within about a minute. This drifts slowly and
 * deterministically, so two visitors present at the same instant see the
 * same number of others.
 */
export function populationAt(tick: number): number {
  const slow = new Rng(WORLD_SEED, `pop:${Math.floor(tick / 90)}`).int(3, 9);
  const jitter = new Rng(WORLD_SEED, `popjit:${Math.floor(tick / 12)}`).int(-1, 2);
  return Math.max(2, slow + jitter);
}

export function inhabitantsAt(tick: number): Inhabitant[] {
  const n = populationAt(tick);
  const epoch = Math.floor(tick / 90);

  /*
   * Handles are drawn WITHOUT REPLACEMENT.
   *
   * Independent r.pick() per bot meant three separate speakers could all be
   * called "anon" — which reads as one person repeating themselves, not as
   * three people. Observed live (IMG_3205): ANON appeared three times in a
   * nine-line rail. A shuffle guarantees every speaker in an epoch is
   * distinct, and stays deterministic because the shuffle is seeded.
   */
  const handles = new Rng(WORLD_SEED, `handles:${epoch}`).shuffle(HANDLE_STEMS);

  const out: Inhabitant[] = [];
  for (let i = 0; i < n; i++) {
    const r = new Rng(WORLD_SEED, `bot:${epoch}:${i}`);
    out.push({
      botId: `b_${epoch}_${i}`,
      handle: handles[i % handles.length]!,
      chattiness: r.float() * 0.5 + 0.08,
      cadence: r.int(2, 7),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* What they say                                                       */
/* ------------------------------------------------------------------ */

/**
 * Ambient lines. Rules for this corpus, held strictly:
 *   - never frightening, never gory, never a threat
 *   - never claims knowledge of the visitor's real identity or device
 *   - strange because of what it implies, not because of what it states
 *   - reads like half of a conversation you walked in on
 */
export const AMBIENT = [
  // — the count —
  'did yours have the door on the left',
  'i counted four. it says four. they are not the same four.',
  'there is one more chair than there was',
  'nobody has told me how many there should be',
  'i stopped counting and it started again',
  // — the colour —
  'mine was blue. i think mine was blue.',
  'it asked me about a colour i had not thought of yet',
  'yours is warmer than mine',
  'i was not given a colour',
  'did anyone else get the green one',
  // — the difference —
  'i got a different question than that',
  'that is not what mine said',
  'i do not think we saw the same thing',
  'i think we are looking at different pages',
  'mine never mentioned a room',
  'yours has more words in it',
  'we are not reading the same notice',
  'mine did not have that part',
  // — the repetition —
  'has anyone else been asked twice',
  'the second one is not the same as the first one',
  'i am fairly sure i have been here before',
  'nobody tell it i came back',
  'it greeted me like it had already met me',
  'this is the third time i have sat down',
  // — the object —
  'i keep the object. i do not know why i keep it.',
  'is anyone else still holding theirs',
  'mine is heavier than it looks',
  'i was not supposed to keep this',
  'it did not say i could take it',
  // — the others —
  'someone left before the part with the chair',
  'the one before me did not finish',
  'somebody was here a moment ago',
  'there were more of us earlier',
  'the quiet one has not said anything yet',
  'did the person before you get the same door',
  // — the politeness —
  'it apologised. before i did anything.',
  'it thanked me for something i have not done',
  'it said sorry and then nothing happened',
  'it keeps being kind about it',
  // — the contradiction —
  'i chose the other one and it also worked',
  'both of them were correct',
  'i said no and it continued anyway',
  'there was no wrong answer. that is the problem.',
  // — the ending —
  'my version ended early',
  'mine is still going',
  'i do not think mine ended at all',
  'it told me i was not supposed to see that',
  // — the room —
  'the light has not changed since i arrived',
  'it is the same temperature as before',
  'i cannot hear anything from outside',
  'the notice was shorter this morning',
  'the clock agrees with itself and nothing else',
  // — the doubt —
  'wait, yours talks?',
  'the counter went down for me',
  'are you seeing this or am i',
  'i would rather not ask what happens next',
  'i am not certain i am the one being waited for',
  'nothing has been wrong. that is what is wrong.',
] as const;

/** Lines that land only for a visitor who has already done something. */
const CALLBACK = [
  'someone here picked {choice} too',
  'the one who chose {choice} left a moment ago',
  'i almost picked {choice}',
  'you are not the only {choice} in the room',
  'it told me somebody chose {choice}. was that you?',
  'everyone who picked {choice} got the same door',
  'i heard {choice} does not work twice',
  'the person before you also said {choice}',
  'nobody picks {choice} on the first visit',
  '{choice}. that is what it wrote down about you.',
  'they warned me about {choice}',
  'i wish i had picked {choice} instead',
] as const;

export type ChatKind = 'ambient' | 'callback' | 'arrival' | 'departure';

export interface ChatLine {
  /** Stable id — the same tick always produces the same ids. */
  lineId: string;
  tick: number;
  botId: string;
  handle: string;
  kind: ChatKind;
  /** Template before per-observer resolution. */
  template: string;
}

/**
 * Everything said at a given tick, before any observer sees it.
 * Pure: same tick in, same lines out, forever.
 */
/**
 * NO SHARED STATE. EVERY BOT WALKS ITS OWN DECK.
 *
 * Three attempts at a rolling "recently said" window all failed the same way:
 * the window has to be reconstructed to answer "what happened at tick T",
 * and every reconstruction disagreed slightly with what was actually
 * published. First the predictor used the unfiltered pool; then the rebuild
 * depended on call order; then the epoch warm-up produced a different history
 * than the epoch itself. Same bug, three costumes — two implementations of
 * one rule always drift apart.
 *
 * So there is no window now. Each bot gets a seeded PERMUTATION of the corpus
 * and walks it in order, one step per utterance. A bot physically cannot
 * repeat itself until it has used every line, and the position is a pure
 * function of (botId, tick) — nothing to reconstruct, nothing to cache,
 * nothing to disagree with.
 *
 * Cross-bot collisions inside a single tick are still possible (two decks can
 * surface the same line at the same moment), so `takenThisTick` walks the
 * offending bot one step further down its own deck. Deterministic, local,
 * and it cannot drift.
 */

/** Which utterance number this is for a given bot, as a pure function of tick. */
function speakIndex(tick: number, cadence: number): number {
  return Math.floor(tick / Math.max(1, cadence));
}

/**
 * Everything said at a given tick, before any observer sees it.
 * Pure: same tick in, same lines out, forever, regardless of call order.
 */
export function chatAt(tick: number): ChatLine[] {
  const lines: ChatLine[] = [];
  const takenThisTick = new Set<string>();

  for (const bot of inhabitantsAt(tick)) {
    if (tick % bot.cadence !== 0) continue;
    const r = new Rng(WORLD_SEED, `say:${bot.botId}:${tick}`);
    if (!r.bool(bot.chattiness)) continue;

    const kind: ChatKind = r.bool(0.22) ? 'callback' : 'ambient';
    const pool = kind === 'callback' ? CALLBACK : AMBIENT;

    // this bot's private, stable ordering of the corpus
    const deck = new Rng(WORLD_SEED, `deck:${bot.botId}:${kind}`).shuffle(pool);
    const base = speakIndex(tick, bot.cadence);

    let template = deck[base % deck.length]!;
    for (let step = 1; takenThisTick.has(template) && step <= deck.length; step++) {
      template = deck[(base + step) % deck.length]!;
    }
    if (takenThisTick.has(template)) continue;   // stay quiet rather than repeat
    takenThisTick.add(template);

    lines.push({ lineId: `l_${tick}_${bot.botId}`, tick, botId: bot.botId, handle: bot.handle, kind, template });
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Per-observer divergence — the mechanism the whole product rests on  */
/* ------------------------------------------------------------------ */

/**
 * Small, meaning-preserving mutations. The line stays recognisably "the same
 * message" so that two visitors comparing notes can tell they saw one event
 * — but the words differ, so they can also tell they were told different
 * things. Divergence that is too large reads as two unrelated messages;
 * too small and nobody notices. This is tuned for "wait, mine said—".
 */
const SUBSTITUTIONS: Record<string, readonly string[]> = {
  blue: ['blue', 'green', 'the other colour', 'a colour i cannot name'],
  door: ['door', 'window', 'gap', 'opening'],
  left: ['left', 'right', 'far side'],
  chair: ['chair', 'table', 'shape', 'empty part'],
  room: ['room', 'hallway', 'space', 'place before this one'],
  twice: ['twice', 'three times', 'more than once'],
};

export interface ObservedLine {
  lineId: string;
  tick: number;
  handle: string;
  kind: ChatKind;
  /** What THIS observer reads. */
  text: string;
  /** True when this observer's rendering differs from the canonical text. */
  diverged: boolean;
}

/**
 * Render a line for one observer.
 *
 * `observerSeed` is the visitor's session seed. It never leaves the server;
 * only the resolved `text` is sent. Two observers therefore cannot predict
 * each other's rendering, which is what makes the compare screen land.
 */
export function observeLine(
  line: ChatLine,
  observerSeed: string,
  ctx: { lastChoice?: string } = {},
): ObservedLine {
  const r = new Rng(observerSeed, `obs:${line.lineId}`);

  let text = line.template;

  if (line.kind === 'callback') {
    // A callback with nothing to call back to would expose the machinery.
    if (!ctx.lastChoice) {
      const amb = new Rng(WORLD_SEED, `fallback:${line.lineId}`);
      text = amb.pick(AMBIENT);
    } else {
      text = text.replace('{choice}', ctx.lastChoice);
    }
  }

  const canonical = text;
  // Roughly a third of observers get a mutated rendering. Frequent enough to
  // be discovered by comparing, rare enough that it isn't obviously a gimmick.
  if (r.bool(0.34)) {
    for (const [needle, options] of Object.entries(SUBSTITUTIONS)) {
      if (text.includes(needle)) {
        text = text.replace(needle, r.pick(options));
        break;
      }
    }
  }

  return {
    lineId: line.lineId,
    tick: line.tick,
    handle: line.handle,
    kind: line.kind,
    text,
    diverged: text !== canonical,
  };
}

/** A window of chat as one observer experienced it. */
export function observeWindow(
  fromTick: number,
  toTick: number,
  observerSeed: string,
  ctx: { lastChoice?: string } = {},
): ObservedLine[] {
  const out: ObservedLine[] = [];
  for (let t = fromTick; t <= toTick; t++) {
    for (const line of chatAt(t)) out.push(observeLine(line, observerSeed, ctx));
  }
  return out;
}
