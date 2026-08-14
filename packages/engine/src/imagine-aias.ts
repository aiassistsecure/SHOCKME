/**
 * SHOCKME · imagine over AiAS → PIN → Muse
 *
 * M: "we gotta make imagine use aias pin provider model: muse-local:latest"
 *
 * WHAT THIS ROUTE IS. The AiAS gateway (api.aiassist.net) is OpenAI-compatible
 * and fans out across providers. One of those providers is PIN — Interchained's
 * peer-to-peer inference network — and one of the operators currently connected
 * to PIN serves `muse-local:latest`, which is Muse, the remote Ollama box.
 *
 * So the chain is: SHOCKME → AiAS → PIN → an operator → Muse.
 *
 * EVERYTHING BELOW WAS MEASURED AGAINST THE LIVE GATEWAY, NOT ASSUMED.
 * Four findings, each of which changed the code:
 *
 *   1. THE PROVIDER HEADER IS MANDATORY, NOT AN OVERRIDE.
 *      `X-AiAssist-Provider: pin` must be sent. Without it the gateway
 *      auto-detects the provider from the model name, fails to place
 *      `muse-local:latest`, and routes to Groq — which then returns the
 *      genuinely baffling `400 Groq: the model claude-haiku-4-5 does not
 *      exist`. An error naming two vendors neither of which you asked for is
 *      what a missing header looks like here, so it is sent unconditionally.
 *
 *   2. THE MODEL IS NOT IN THE CATALOGUE. /v1/models lists pin:auto,
 *      pin:llama3.3:70b, pin:qwen2.5:72b and four others. `muse-local:latest`
 *      is in none of them, and yet it answers 200 and reports itself back as
 *      `"model": "muse-local:latest"`. PIN operators connect and disconnect,
 *      so the catalogue is a snapshot and the route is the truth. Corollary:
 *      never gate on catalogue membership — try the call.
 *      (`pin:auto` currently 400s: "No operators available for model: auto".)
 *
 *   3. FORMAT COMPLIANCE IS PERFECT, SO THE HOTPATCH IS ALMOST IDLE.
 *      Every sampled call returned a clean `<<<LINE>>>…<<<END>>>`. The
 *      sentinel scaffolding in imagine.ts exists because an 0.8B model got the
 *      opening delimiter wrong in 6 of 8 samples; a model this size simply
 *      does not make that mistake. The scaffolding stays anyway — it costs
 *      nothing, and it is what lets the two transports share one parser.
 *
 *   4. LATENCY IS THE WHOLE ENGINEERING PROBLEM. 19–22s typical, 47s observed
 *      once, against a local llama.cpp path that answers in about a second.
 *      That is a 20x change and it is why this file exports a latency class
 *      rather than just a URL. See LATENCY below.
 *
 * DETERMINISM IS UNAFFECTED, and it is worth being precise about why.
 * `seed` is accepted by the gateway and does NOT reproduce — the same seed
 * twice gave two different lines. That would be fatal if determinism rested on
 * the sampler, and it does not: generation happens ONCE per (tick, botId)
 * globally and the result is committed to NEDB behind the publish fence. Every
 * later observer and every AS-OF replay reads the stored line. Determinism
 * rests on STORAGE, which is exactly why imagine.ts was built that way and
 * exactly what makes swapping the model out safe.
 *
 * PRIVACY IS UNAFFECTED, which is the only reason this route is acceptable at
 * all. imagine's prompt is a fixed system message plus one topic drawn from a
 * 12-item constant. No session id, no visitor id, no chat text, no dwell time,
 * nothing a visitor typed — the room's ambient murmur is generated from
 * nothing but the room's own idea of itself. The site promises publicly that
 * its strangeness comes from its own world model rather than from watching
 * anybody, and sending "how many chairs there are" to a gateway does not dent
 * that. If a future prompt ever wants real visitor text, this route has to be
 * reconsidered from scratch, and that is a deliberate tripwire.
 */

import type { CompleteOpts, PromptParts, Transport } from './imagine.ts';

export const AIAS_BASE = (process.env.AIASSIST_BASE_URL ?? 'https://api.aiassist.net').replace(/\/+$/, '');
export const AIAS_PROVIDER = process.env.AIASSIST_PROVIDER ?? 'pin';
export const AIAS_MODEL = process.env.AIASSIST_MODEL ?? 'muse-local:latest';

/**
 * LATENCY. Measured p50 ≈ 20s, worst observed 47s.
 *
 * The local timeout was 20_000, which would have aborted roughly half of all
 * Muse calls — and an aborted call is indistinguishable from a dead endpoint,
 * so `healthy` would have been cleared and the whole route marked down on its
 * first slow response. 90s gives the tail room to land.
 */
export const AIAS_TIMEOUT_MS = Number(process.env.AIASSIST_TIMEOUT_MS ?? 90_000);

export class AiasTransport implements Transport {
  readonly id = 'aias';
  readonly build: string;
  /**
   * 'slow' tells the pump to widen its lookahead window and stop retrying so
   * eagerly. A transport that knows its own speed is better than a constant in
   * the pump that nobody remembers to change — the same "one rule, one place"
   * lesson that the chair count and the footer heights both taught.
   */
  readonly latency = 'slow' as const;
  readonly timeoutMs = AIAS_TIMEOUT_MS;

  private readonly base: string;
  private readonly key: string;
  private readonly provider: string;
  private readonly model: string;
  private healthy: boolean | null = null;

  constructor(opts: {
    base?: string; key?: string; provider?: string; model?: string;
  } = {}) {
    this.base = (opts.base ?? AIAS_BASE).replace(/\/+$/, '');
    this.key = opts.key ?? process.env.AIASSIST_API_KEY ?? '';
    this.provider = opts.provider ?? AIAS_PROVIDER;
    this.model = opts.model ?? AIAS_MODEL;
    this.build = `${this.provider}/${this.model}`;
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.key}`,
      // Finding 1. Unconditional, never optional.
      'X-AiAssist-Provider': this.provider,
      /*
       * NO X-Agent-Id. The skill documentation lists it as an optional header
       * so it went in speculatively, and the gateway VALIDATES it against
       * registered agents: every call came back `404 Agent 'shockme' not
       * found`. The curl probes that established this route never sent it, so
       * the probe passed and the client failed — the exact "verified the
       * producer instead of the product" mistake this project keeps re-learning.
       * Do not add optional headers that were not in the request you measured.
       */
    };
  }

  /**
   * No /health on the gateway, so availability is "does the account answer".
   * /v1/models is the cheapest authenticated GET; we deliberately do NOT check
   * whether our model is listed in the response (finding 2 — it is not, and it
   * works anyway). This only answers "is the gateway reachable and is the key
   * valid", which are the two failures worth pre-empting.
   */
  async available(): Promise<boolean> {
    if (this.healthy !== null) return this.healthy;
    if (!this.key) { this.healthy = false; return false; }
    try {
      const r = await fetch(`${this.base}/v1/models`, {
        headers: { authorization: `Bearer ${this.key}` },
        signal: AbortSignal.timeout(8_000),
      });
      this.healthy = r.ok;
    } catch {
      this.healthy = false;
    }
    return this.healthy;
  }

  /** Let the caller force a re-probe after a transport error. */
  reset(): void { this.healthy = null; }

  async complete(parts: PromptParts, seed: number, opts: CompleteOpts = {}): Promise<string> {
    /*
     * The assistant turn carries the prefill, mirroring what the llama.cpp
     * path does inside its raw chat template. Two reasons it matters here:
     *
     *   - it is the same trick for the same reason (the model never writes the
     *     opening sentinel, so it cannot write it wrong), which keeps ONE
     *     parser valid for both transports; and
     *   - measured 2.1s against 19–22s without it on an otherwise identical
     *     request. Some of that is cache, but the shape is worth keeping.
     *
     * The empty <think> block is dropped: it is a Qwen3.5 reasoning-budget
     * workaround and belongs to that model, not to this route.
     */
    const messages = [
      { role: 'system', content: parts.system },
      { role: 'user', content: parts.user },
      // An empty prefill would send an empty assistant turn, which some
      // gateways reject outright. The drawing has no opening sentinel to
      // prefill, so it simply omits the turn.
      ...(parts.prefill ? [{ role: 'assistant', content: parts.prefill }] : []),
    ];

    const res = await fetch(`${this.base}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: opts.maxTokens ?? 48,
        temperature: opts.temperature ?? 1.0,
        top_p: opts.topP ?? 0.95,
        // Accepted and, on this route, not actually honoured — the closing
        // sentinel comes back in the body regardless. Sent anyway because it
        // costs nothing and the parser strips it either way.
        stop: opts.stop ?? ['<<<END>>>'],
        // Passed through for provenance. NOT relied on: verified
        // non-reproducible on this route. See the determinism note above.
        seed,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      // Surface the gateway's own message — it is genuinely diagnostic here
      // (finding 1's cross-vendor error is how a missing header announces
      // itself, and "No operators available" is how a dead PIN route does).
      let detail = '';
      try { detail = String((await res.json() as { detail?: unknown }).detail ?? ''); } catch { /* body not json */ }
      throw new Error(`aias ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? '';
  }
}
