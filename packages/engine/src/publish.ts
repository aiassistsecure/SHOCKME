/**
 * SHOCKME · the publish fence
 *
 * Generation and publication are different operations. A model completion is a
 * CANDIDATE. It is not a line in the room until the publisher admits it.
 *
 *     candidate
 *       → sentinel normalisation      (imagine.line, already)
 *       → safety / format screen      (validateLine + chat.screen)
 *       → canonical dedupe fingerprint
 *       → atomic claim                (claim.ts, min-seq fence)
 *       → only now: cache + fan out
 *
 * NO SSE EVENT MAY PRECEDE THE APPEND. A line that flashes on the rail and
 * then turns out to be a duplicate is worse than the duplicate would have
 * been — it makes the room look like it is glitching, and the room is allowed
 * to be strange but never broken.
 *
 * EVERYTHING HERE RUNS IN THE BACKGROUND PUMP. A request must never await it.
 * The earlier build generated inside the render path and hung the end scene
 * for over two minutes; that is a correctness bug in a product whose first
 * constraint is "fast", not a tuning problem.
 *
 * WHY RETRIES GENERATE A FRESH CANDIDATE INSTEAD OF RE-SUBMITTING
 * --------------------------------------------------------------
 * A duplicate rejection means the room already said this. Re-submitting the
 * same completion cannot succeed, it can only burn the attempt budget. So each
 * attempt asks for something NEW, and is handed the recent fingerprints as an
 * exclusion hint — an 0.8B model left to itself will happily produce the same
 * pleasant sentence forever, and that repetition is the failure mode most
 * visible to a visitor who stays more than a minute.
 */

import { claim, fingerprint, canonical, type ClaimStream } from './claim.ts';
import type { Nedb } from './nedb.ts';

/** 250ms → 4s, five attempts, then the curated corpus. Seeded jitter so two
 *  pumps racing the same slot do not synchronise their retries forever. */
export const BACKOFF_MS = [250, 500, 1000, 2000, 4000] as const;
export const MAX_ATTEMPTS = BACKOFF_MS.length;

/* ------------------------------------------------------------------ */
/* Recent-fingerprint ring — the exclusion hint                        */
/* ------------------------------------------------------------------ */

const RECENT_KEEP = 250;
const recent: string[] = [];
const recentText: string[] = [];

/** Note an admitted line so later attempts can be told to avoid it. */
export function noteAdmitted(text: string): void {
  recent.push(fingerprint(text));
  recentText.push(canonical(text));
  while (recent.length > RECENT_KEEP) { recent.shift(); recentText.shift(); }
}

/** A compact exclusion set for the generator. Bounded — a prompt is not a log. */
export function exclusionHint(n = 8): string[] {
  return recentText.slice(-n);
}

/** Cheap local pre-check. Saves a round trip to nedbd on the obvious repeats. */
export function seenRecently(text: string): boolean {
  return recent.includes(fingerprint(text));
}

/* ------------------------------------------------------------------ */
/* Admission                                                           */
/* ------------------------------------------------------------------ */

export interface Candidate {
  text: string;
  source: 'imagine' | 'curated';
}

export interface AdmitOpts {
  /** Asked for a NEW candidate each attempt, given the exclusion hint. */
  generate: (attempt: number, exclude: string[]) => Promise<Candidate | null>;
  /** Authored, pre-reviewed, deterministic. Used only after exhaustion. */
  fallback: () => string;
  /** Format + safety. Returning ok:false discards the candidate silently. */
  screen: (text: string) => { ok: boolean; reason: string };
  stream?: ClaimStream;
  /** Stable string so jitter is reproducible for a given slot. */
  jitterSeed?: string;
  meta?: Record<string, unknown>;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface AdmitResult {
  text: string;
  source: 'imagine' | 'curated';
  attempts: number;
  /** Private diagnostics. NEVER rendered, never broadcast. */
  rejected: string[];
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Deterministic 0.75–1.25 multiplier from a string. */
function jitter(seed: string, attempt: number): number {
  let h = 2166136261;
  const s = `${seed}:${attempt}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 0.75 + ((h >>> 0) % 1000) / 2000;
}

/**
 * Run a candidate through the whole fence. Resolves to something renderable —
 * either an admitted generation or the curated fallback. Never throws, never
 * blocks a request, never returns rejected content.
 */
export async function admit(db: Nedb, opts: AdmitOpts): Promise<AdmitResult> {
  const stream = opts.stream ?? 'broadcast';
  const sleep = opts.sleep ?? defaultSleep;
  const rejected: string[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(Math.round(BACKOFF_MS[attempt - 1]! * jitter(opts.jitterSeed ?? stream, attempt)));
    }

    let cand: Candidate | null = null;
    try {
      cand = await opts.generate(attempt, exclusionHint());
    } catch (e) {
      rejected.push(`error: ${String(e).slice(0, 60)}`);
      continue;
    }
    if (!cand || !cand.text.trim()) { rejected.push('empty'); continue; }

    const v = opts.screen(cand.text);
    if (!v.ok) { rejected.push(`${v.reason}: ${cand.text.slice(0, 40)}`); continue; }

    // Local ring first — a known repeat need not travel to the engine.
    if (seenRecently(cand.text)) { rejected.push(`recent: ${cand.text.slice(0, 40)}`); continue; }

    /*
     * The fence. Losing here is normal and cheap: another pump got there
     * first, so the room already has this line and we simply want a different
     * one. `invisible` (we could not read our own append) is also a loss —
     * publishing on an unverified write is how a duplicate reaches the rail.
     */
    const c = await claim(db, {
      stream,
      fingerprint: fingerprint(cand.text),
      meta: { ...opts.meta, source: cand.source },
    });
    if (!c.won) { rejected.push(c.invisible ? 'unreadable-write' : 'duplicate'); continue; }

    noteAdmitted(cand.text);
    return { text: cand.text, source: cand.source, attempts: attempt + 1, rejected };
  }

  /*
   * Exhausted. The curated corpus is authored, pre-reviewed and deterministic,
   * so it is NOT fenced — a fixed corpus is supposed to recur, and claiming
   * against it would eventually starve the room into silence. Never spin,
   * never fill the rail with a near-duplicate apology.
   */
  return { text: opts.fallback(), source: 'curated', attempts: MAX_ATTEMPTS, rejected };
}
