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
const HANDLE_STEMS = [
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
  const out: Inhabitant[] = [];
  for (let i = 0; i < n; i++) {
    const r = new Rng(WORLD_SEED, `bot:${epoch}:${i}`);
    out.push({
      botId: `b_${epoch}_${i}`,
      handle: r.pick(HANDLE_STEMS),
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
  'did yours have the door on the left',
  'mine was blue. i think mine was blue.',
  'i got a different question than that',
  'has anyone else been asked twice',
  'the second one is not the same as the first one',
  'i keep the object. i do not know why i keep it.',
  'someone left before the part with the chair',
  'that is not what mine said',
  'i am fairly sure i have been here before',
  'it asked me about a colour i had not thought of yet',
  'wait, yours talks?',
  'mine never mentioned a room',
  'i chose the other one and it also worked',
  'is anyone else still holding theirs',
  'i think we are looking at different pages',
  'the counter went down for me',
  'nobody tell it i came back',
  'my version ended early',
  'it apologised. before i did anything.',
  'i do not think we saw the same thing',
] as const;

/** Lines that land only for a visitor who has already done something. */
const CALLBACK = [
  'someone here picked {choice} too',
  'the one who chose {choice} left a moment ago',
  'i almost picked {choice}',
  'you are not the only {choice} in the room',
  'it told me somebody chose {choice}. was that you?',
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
export function chatAt(tick: number): ChatLine[] {
  const lines: ChatLine[] = [];
  for (const bot of inhabitantsAt(tick)) {
    if (tick % bot.cadence !== 0) continue;
    const r = new Rng(WORLD_SEED, `say:${bot.botId}:${tick}`);
    if (!r.bool(bot.chattiness)) continue;
    const kind: ChatKind = r.bool(0.22) ? 'callback' : 'ambient';
    lines.push({
      lineId: `l_${tick}_${bot.botId}`,
      tick,
      botId: bot.botId,
      handle: bot.handle,
      kind,
      template: kind === 'callback' ? r.pick(CALLBACK) : r.pick(AMBIENT),
    });
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
