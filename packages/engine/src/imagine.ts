/**
 * SHOCKME · imagine — the voice of the room
 *
 * `imagine` (github.com/aiassistsecure/imagine) is a CPU-first fork of
 * Qwen3.5-0.8B. It runs locally through llama-server: no GPU, no metered
 * inference, no third party ever sees a visitor's room.
 *
 * WHY THIS MODEL, AND WHICH BUILD:
 *   v0.1.0, deliberately — NOT v0.2.0. imagine's own SPEC measures v0.1.0 at
 *   0/12 self-reference hijack and v0.2.0 at 8/12. We never ask this model who
 *   it is, so identity accuracy is worthless here, while a model that
 *   volunteers "I am imagine" mid-line would break the fiction outright.
 *   Its measured weakness is tool-call argument construction, which we never
 *   use; its measured strength is conversation and restraint (9/9), which is
 *   the entire job.
 *
 * DETERMINISM IS PRESERVED — TWICE OVER:
 *   1. the sampler seed is a pure function of (worldSeed, tick, botId), and
 *      llama.cpp is reproducible for a fixed seed + fixed weights (verified:
 *      same seed -> byte-identical output).
 *   2. more importantly, generation happens ONCE per (tick, botId) globally
 *      and the result is committed to NEDB. Every later observer and every
 *      AS-OF replay reads the stored line. Determinism therefore rests on
 *      STORAGE, not on trusting the sampler across model or build changes.
 *
 * EXTRACTION USES SENTINEL BLOCKS, NOT STOP TOKENS:
 *   an earlier build clipped output with `stop: ["\n"]` and stripped quotes by
 *   hand. It leaked trailing punctuation, wrapping quotes, and once truncated
 *   a `<think>` tag into the visible line. Sentinel blocks make the payload
 *   boundary explicit and extract it verbatim — the content is never re-parsed.
 */

import { normaliseSentinel } from './imagine-hotpatch.ts';
import { Rng } from './rng.ts';
import { AMBIENT, WORLD_SEED } from './world.ts';

export const IMAGINE_URL = process.env.IMAGINE_URL ?? 'http://127.0.0.1:8081';
export const IMAGINE_BUILD = process.env.IMAGINE_BUILD ?? 'imagine-0.8b-v0.1.0-Q4_K_M';

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

/**
 * The curated corpus doubles as the few-shot style guide. One source of
 * truth for the register: if the fallback lines and the generated lines
 * drift apart, the room stops sounding like one place.
 */
const STYLE_EXEMPLARS = AMBIENT.slice(0, 10).join('\n');

/**
 * System prompt, distilled from KeyStone-Lite's ChatPanel edit-format prompt
 * (aiassistsecure/KeyStone-Lite, src/renderer/components/ChatPanel.tsx) —
 * the same discipline that produced sentinel-blocks in the first place.
 *
 * Five things carried over from that prompt, each load-bearing:
 *   1. "use this EXACT format" — imperative, EXACT capitalised
 *   2. the format on its own lines, never inline in a sentence
 *   3. numbered FORMAT RULES *after* the example, restating the shape
 *   4. a separate DO NOT list, including "never skip the <<<END>>> tag"
 *   5. strict prompt, tolerant parser (Postel's law at the model boundary)
 *
 * ONE DELIBERATE DEPARTURE. KeyStone-Lite's example body reads
 * "complete new code for those lines" — a safe placeholder when the payload
 * is a multi-line code block. Here the payload is ONE SHORT SENTENCE, so a
 * placeholder is the same shape as a valid answer and the model simply
 * returns it. Measured: an earlier version of this prompt contained the
 * literal text "your line here", and the model emitted `<<YOUR LINE HERE>>`
 * and `<<YOUR LINE>>`. It was not failing to follow the format — it was
 * following it and filling the slot with the words I put in the slot.
 * The example below is therefore a REAL line, never a description of one.
 */
const SYSTEM = `you are one of several strangers waiting in a quiet, strange, harmless room.
you speak one line aloud, as if overheard mid-conversation.

VOICE RULES:
1. first person, spoken aloud, present tense
2. all lowercase, under 11 words
3. you are speaking, never narrating what other people do
4. unsettling only in what it implies — never frightening, never violent

DO NOT:
- describe other people in the third person
- mention screens, phones, devices, or any modern technology
- mention ai, models, assistants, helping, or guests
- explain yourself or add commentary
- skip the <<<END>>> tag

the register, spoken by others in this room:
${STYLE_EXEMPLARS}

Output your line using this EXACT format:

<<<LINE>>>
did yours have the door on the left
<<<END>>>`;

/**
 * Two prefills, both load-bearing:
 *
 *  1. an empty <think> block — Qwen3.5 is a reasoning model, and without this
 *     it spends its whole budget thinking and emits no line at all.
 *
 *  2. the OPENING SENTINEL `<<<LINE>>>`. Measured: when asked to emit the
 *     opening delimiter itself, an 0.8B model produces `<<LINE>>`,
 *     `<<BEGIN>>`, `<<YOUR LINE HERE>>`, `<<<<<<` — 6 of 8 samples had a
 *     malformed opener. Putting it in the assistant turn makes that class of
 *     failure impossible: the model never writes the tag it keeps getting
 *     wrong, it only writes the payload and the closer.
 */
function buildPrompt(topic: string): string {
  return (
    `<|im_start|>system\n${SYSTEM}<|im_end|>\n` +
    `<|im_start|>user\n${topic}<|im_end|>\n` +
    `<|im_start|>assistant\n<think>\n\n</think>\n\n<<<LINE>>>`
  );
}

/** What the room is currently preoccupied with. */
export const TOPICS = [
  'how many chairs there are',
  'whether your version was different from theirs',
  'an object you were given and still hold',
  'the notice on the wall changing while you read it',
  'the feeling you have been here before',
  'being greeted by something you did not say',
  'the button nobody presses',
  'how long you have been waiting',
  'a door that was not there earlier',
  'what the room told you that it did not tell them',
  'someone who left before the end',
  'two options that both seemed to work',
] as const;

/* ------------------------------------------------------------------ */
/* Validation — a line must earn its place                             */
/* ------------------------------------------------------------------ */

const BANNED = /\b(ai|a\.i\.|model|assistant|chatbot|help(ing|er)?|screen|phone|notification|app|comput\w*|robot|guest|welcome|device|glass|digital|online|user)\b/i;
const NARRATION = /\b(he|she|they|it)\s+(looked|moved|walked|said|smiled|hummed|turned|flickered|sat|stood)\b/i;
const SELFREF = /\b(i am imagine|as an|i cannot|i can't help|language)\b/i;

export interface Verdict { ok: boolean; reason: string }

/**
 * Deliberately strict. A rejected line costs one cheap retry; a bad line
 * that ships costs the illusion. The fallback corpus is always there, so
 * the strictness has no downside.
 */
export function validateLine(raw: string): Verdict {
  const t = (raw ?? '').trim();
  if (!t) return { ok: false, reason: 'empty' };
  if (t.includes('"') || t.includes('<') || t.includes('>')) return { ok: false, reason: 'markup or quotes' };
  if (t !== t.toLowerCase()) return { ok: false, reason: 'capitals' };
  const words = t.split(/\s+/);
  if (words.length < 3) return { ok: false, reason: `too short (${words.length}w)` };
  if (words.length > 11) return { ok: false, reason: `too long (${words.length}w)` };
  if (BANNED.test(t)) return { ok: false, reason: 'banned term' };
  if (NARRATION.test(t)) return { ok: false, reason: 'third-person narration' };
  if (SELFREF.test(t)) return { ok: false, reason: 'self-reference' };
  return { ok: true, reason: 'ok' };
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export interface GeneratedLine {
  text: string;
  /** 'imagine' when the model produced it, 'corpus' when we fell back. */
  source: 'imagine' | 'corpus';
  topic: string;
  seed: number;
  build: string;
  attempts: number;
  rejected: string[];
  patched: number;
  /** How many completions needed sentinel repair (see imagine-hotpatch). */
  patched: number;
}

export class Imagine {
  readonly url: string;
  readonly enabled: boolean;
  private healthy: boolean | null = null;

  /**
   * `enabled` comes from SHOCKME_IMAGINE (default ON) and is decided by the
   * caller at boot, never sniffed here. If it is false we never touch the
   * network at all — "off" means off, not "off unless something answers".
   */
  constructor(url: string = IMAGINE_URL, enabled = true) {
    this.url = url.replace(/\/+$/, '');
    this.enabled = enabled;
  }

  async available(): Promise<boolean> {
    if (!this.enabled) return false;
    if (this.healthy !== null) return this.healthy;
    try {
      const r = await fetch(`${this.url}/health`, { signal: AbortSignal.timeout(2500) });
      this.healthy = r.ok;
    } catch {
      this.healthy = false;
    }
    return this.healthy;
  }

  private async complete(prompt: string, seed: number): Promise<string> {
    const res = await fetch(`${this.url}/completion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        seed,
        n_predict: 48,
        temperature: 1.0,
        top_p: 0.95,
        repeat_penalty: 1.12,
        // <<<END>>> terminates the payload; no newline stop token, so a
        // stray newline can no longer truncate the line mid-sentence.
        stop: ['<<<END>>>', '<|im_end|>'],
        cache_prompt: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`imagine ${res.status}`);
    const data = (await res.json()) as { content?: string };
    return data.content ?? '';
  }

  /**
   * One line for one (tick, bot). Pure in its inputs.
   * Falls back to the curated corpus rather than ever returning nothing —
   * the room going silent would be a worse failure than a repeated line.
   */
  async line(tick: number, botId: string, maxAttempts = 2): Promise<GeneratedLine> {
    const rng = new Rng(WORLD_SEED, `imagine:${botId}:${tick}`);
    const topic = rng.pick(TOPICS);
    const baseSeed = rng.int(1, 2 ** 30);
    const rejected: string[] = [];
    let patchedCount = 0;

    if (await this.available()) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const seed = baseSeed + attempt;
        try {
          const raw = await this.complete(buildPrompt(topic), seed);
          // The opener is prefilled, so `raw` is normally the payload onward.
          // The hotpatch absorbs the cases where the model emits its own
          // malformed sentinel anyway — see imagine-hotpatch.ts for the
          // measured failure modes this exists to handle.
          const { text, patched } = normaliseSentinel(raw, 'LINE');
          if (patched) patchedCount++;
          const v = validateLine(text);
          if (v.ok) {
            return { text, source: 'imagine', topic, seed, build: IMAGINE_BUILD, attempts: attempt + 1, rejected, patched: patchedCount };
          }
          rejected.push(`${v.reason}: ${text.slice(0, 48)}`);
        } catch (e) {
          rejected.push(`error: ${String(e).slice(0, 48)}`);
          this.healthy = null; // re-probe next time
          break;
        }
      }
    }

    return {
      text: rng.pick(AMBIENT),
      source: 'corpus',
      topic,
      seed: baseSeed,
      build: IMAGINE_BUILD,
      attempts: maxAttempts,
      rejected,
      patched: patchedCount,
    };
  }
}
