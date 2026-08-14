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

import { AIAS_BASE, AiasTransport } from './imagine-aias.ts';
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
/**
 * ONE PROMPT, TWO WIRE FORMATS.
 *
 * The local path speaks llama.cpp's /completion, which wants the chat template
 * baked into a single string. The AiAS path speaks /v1/chat/completions, which
 * wants structured roles. Those are transport concerns, so the prompt is
 * expressed once as parts and each transport renders it its own way.
 *
 * This is the same "one rule, one place" fix as the chair count and the footer
 * heights: two hand-maintained copies of this prompt would drift within a week,
 * and a drifted system prompt is invisible until the room stops sounding like
 * one place.
 */
export interface PromptParts { system: string; user: string; prefill: string }

/**
 * Per-call sampler settings. The ambient line and the drawing want genuinely
 * different ones — the drawing runs hotter, longer, and stops on a code fence
 * rather than a sentinel — so they are arguments rather than constants baked
 * into each transport.
 */
export interface CompleteOpts {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  repeatPenalty?: number;
  stop?: string[];
}

/** A way of getting a completion. Both transports satisfy this. */
export interface Transport {
  readonly id: string;
  readonly build: string;
  /** 'fast' = local, sub-second. 'slow' = over the network, tens of seconds. */
  readonly latency: 'fast' | 'slow';
  readonly timeoutMs: number;
  available(): Promise<boolean>;
  complete(parts: PromptParts, seed: number, opts?: CompleteOpts): Promise<string>;
  reset(): void;
}

/** Loose comparison for the topic-echo check: case, punctuation, spacing. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function promptFor(topic: string): PromptParts {
  return { system: SYSTEM, user: topic, prefill: '<<<LINE>>>' };
}

/** llama.cpp's raw chat template, unchanged from the original buildPrompt. */
function renderLlamaCpp(parts: PromptParts): string {
  return (
    `<|im_start|>system\n${parts.system}<|im_end|>\n` +
    `<|im_start|>user\n${parts.user}<|im_end|>\n` +
    `<|im_start|>assistant\n<think>\n\n</think>\n\n${parts.prefill}`
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
  /** How many completions needed sentinel repair (see imagine-hotpatch). */
  patched: number;
  /** Which transport produced it: 'llamacpp' (local) or 'aias' (PIN → Muse). */
  transport: string;
}

/**
 * The original local transport: llama-server on 127.0.0.1. Byte-for-byte the
 * same request it has always sent — same endpoint, same sampler settings, same
 * 20s timeout, same `cache_prompt`. Nothing about the local path changed when
 * the gateway route was added, which is the point.
 */
export class LlamaCppTransport implements Transport {
  readonly id = 'llamacpp';
  readonly build = IMAGINE_BUILD;
  readonly latency = 'fast' as const;
  readonly timeoutMs = 20_000;

  readonly url: string;
  private healthy: boolean | null = null;

  constructor(url: string = IMAGINE_URL) {
    this.url = url.replace(/\/+$/, '');
  }

  async available(): Promise<boolean> {
    if (this.healthy !== null) return this.healthy;
    try {
      const r = await fetch(`${this.url}/health`, { signal: AbortSignal.timeout(2500) });
      this.healthy = r.ok;
    } catch {
      this.healthy = false;
    }
    return this.healthy;
  }

  reset(): void { this.healthy = null; }

  async complete(parts: PromptParts, seed: number, opts: CompleteOpts = {}): Promise<string> {
    const res = await fetch(`${this.url}/completion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: renderLlamaCpp(parts),
        seed,
        n_predict: opts.maxTokens ?? 48,
        temperature: opts.temperature ?? 1.0,
        top_p: opts.topP ?? 0.95,
        repeat_penalty: opts.repeatPenalty ?? 1.12,
        // <<<END>>> terminates the payload; no newline stop token, so a
        // stray newline can no longer truncate the line mid-sentence.
        stop: opts.stop ?? ['<<<END>>>', '<|im_end|>'],
        cache_prompt: true,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`imagine ${res.status}`);
    const data = (await res.json()) as { content?: string };
    return data.content ?? '';
  }
}

export class Imagine {
  readonly enabled: boolean;
  readonly transport: Transport;

  /** Kept so existing callers and the admin panel can still read `.url`. */
  get url(): string { return this.transport instanceof LlamaCppTransport ? this.transport.url : AIAS_BASE; }
  /** What the pump needs to know to schedule itself. */
  get latency(): 'fast' | 'slow' { return this.transport.latency; }

  /**
   * `enabled` comes from SHOCKME_IMAGINE (default ON) and is decided by the
   * caller at boot, never sniffed here. If it is false we never touch the
   * network at all — "off" means off, not "off unless something answers".
   *
   * The first argument still accepts a URL string so every existing call site
   * — `new Imagine(CONFIG.imagineUrl, CONFIG.imagine)` — keeps working
   * untouched. Pass a Transport instead to choose the route explicitly.
   */
  constructor(urlOrTransport: string | Transport = IMAGINE_URL, enabled = true) {
    this.enabled = enabled;
    this.transport = typeof urlOrTransport === 'string'
      ? new LlamaCppTransport(urlOrTransport)
      : urlOrTransport;
  }

  async available(): Promise<boolean> {
    if (!this.enabled) return false;
    return this.transport.available();
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
          const raw = await this.transport.complete(promptFor(topic), seed);
          // The opener is prefilled, so `raw` is normally the payload onward.
          // The hotpatch absorbs the cases where the model emits its own
          // malformed sentinel anyway — see imagine-hotpatch.ts for the
          // measured failure modes this exists to handle.
          const { text, patched } = normaliseSentinel(raw, 'LINE');
          if (patched) patchedCount++;
          const v = validateLine(text);
          /*
           * TOPIC ECHO. Measured on the Muse route: asked for a line about
           * "whether your version was different from theirs", it returned
           * exactly that string. It is lowercase, seven words and contains no
           * banned term, so validateLine passes it happily — the topics are
           * written in the room's own register, which is what makes an echo
           * both plausible and useless.
           *
           * Checked here rather than in validateLine because this is the only
           * place the topic is in scope, and because it is a property of the
           * REQUEST, not of the line. A prompt read back to you is not a line.
           */
          const echo = norm(text) === norm(topic);
          if (echo) rejected.push(`topic echo: ${text.slice(0, 48)}`);
          if (v.ok && !echo) {
            return {
              text, source: 'imagine', topic, seed,
              build: this.transport.build, attempts: attempt + 1,
              rejected, patched: patchedCount, transport: this.transport.id,
            };
          }
          rejected.push(`${v.reason}: ${text.slice(0, 48)}`);
        } catch (e) {
          rejected.push(`error: ${String(e).slice(0, 120)}`);
          this.transport.reset(); // re-probe next time
          break;
        }
      }
    }

    return {
      text: rng.pick(AMBIENT),
      source: 'corpus',
      topic,
      seed: baseSeed,
      build: this.transport.build,
      attempts: maxAttempts,
      rejected,
      patched: patchedCount,
      transport: this.transport.id,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Which route                                                         */
/* ------------------------------------------------------------------ */

/**
 * SHOCKME_IMAGINE_PROVIDER picks the transport. DEFAULT IS `llamacpp`, so a box
 * that pulls this change and restarts behaves exactly as it did before —
 * opting in to the gateway is a deliberate act, not a surprise.
 *
 *   llamacpp  local llama-server on IMAGINE_URL          (default)
 *   aias      AiAS gateway → PIN → muse-local:latest
 *
 * `aias` needs AIASSIST_API_KEY. Without it AiasTransport.available() is false
 * and every line comes from the curated corpus — the room still works, which
 * is the same failure posture the local path has always had.
 */
export function transportFromEnv(): Transport {
  const want = (process.env.SHOCKME_IMAGINE_PROVIDER ?? 'llamacpp').toLowerCase();
  if (want === 'aias' || want === 'pin' || want === 'muse') return new AiasTransport();
  return new LlamaCppTransport();
}
