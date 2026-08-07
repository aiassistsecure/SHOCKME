/**
 * SHOCKME · HOTPATCH — sentinel emission for imagine / Qwen3.5-0.8B
 *
 * WHAT THIS IS
 * ------------
 * A compatibility shim between what the sentinel-blocks spec asks a model to
 * emit and what an 0.8B model actually emits. It is not a workaround hidden in
 * a regex; it is a documented adapter with the measurements that justify it.
 *
 * THE MEASUREMENT (SHOCKME, 2026-08-07, imagine-0.8b-v0.1.0-Q4_K_M,
 * llama.cpp b10322, 2 vCPU, temp 1.0, 16 samples)
 * ------------------------------------------------------------------
 * Asked to reply with `<<<LINE>>>...<<<END>>>`, the model produced a
 * WELL-FORMED opening delimiter in 0 of 16 samples. Every sample carried a
 * recognisable *intent* to open a sentinel block, and essentially none got the
 * delimiter exactly right. Verbatim openers observed:
 *
 *     <<YOUR LINE>>        <<YOUR LINE HERE>>     <<BEGIN>>
 *     <<LINE>>>            <<line>>               <<YOU>>
 *     <<SILENCE>>          <<>>                   <|COMMAND>\n>>
 *     <<<<<< your line here <<< END >>>>>
 *
 * Closers were equally loose: `<<END>>`, `<< END >>`, `>>`, or absent.
 *
 * WHY THE NAIVE READING IS WRONG
 * ------------------------------
 * The tempting conclusion is "the model can't follow the format." It is closer
 * to the truth that it CAN follow the *shape* and cannot reproduce the exact
 * *character count*. `<<` vs `<<<` is one token's difference and carries no
 * semantic weight the model was ever trained to preserve. Treating this as a
 * capability failure leads to fine-tuning; treating it as a tokenisation
 * mismatch leads to ten lines of normalisation. The second one is correct.
 *
 * This matters beyond SHOCKME: any small model asked to emit sentinel blocks
 * will hit the same wall. Candidate upstream note for the `imagine` repo's
 * §11 weaknesses, and arguably a "tolerant reader" mode for sentinel-blocks
 * itself — Postel's law at the model boundary.
 *
 * WHAT WE DO INSTEAD
 * ------------------
 * Two layers, belt and braces:
 *   1. PREVENT — the canonical opener is prefilled into the assistant turn, so
 *      the model never writes the delimiter it keeps getting wrong.
 *   2. TOLERATE — this module strips any pseudo-sentinel the model emits
 *      anyway, canonicalises to a real block, and lets sentinel-blocks do the
 *      actual verbatim extraction. The payload is still never re-parsed.
 */

import { extractBlock } from 'sentinel-blocks';

/**
 * A pseudo-sentinel: 1–8 `<`, an optional `|`, an optional tag word (letters,
 * spaces, underscores), then 1–8 `>`. Deliberately generous on the tag, since
 * the model invents tag names freely (LINE, BEGIN, YOU, SILENCE, COMMAND, "").
 */
const PSEUDO_OPEN = /^\s*<{1,8}\|?\s*[A-Za-z_ ]{0,24}\s*>{1,8}\s*/;

/** A trailing pseudo-sentinel, with or without the word END. */
const PSEUDO_CLOSE = /\s*<{1,8}\|?\s*(END|STOP|DONE)?\s*>{1,8}\s*$/i;

/** Leftover bracket runs anywhere (the `<<<<<< ... <<< END >>>>>` case). */
const STRAY_BRACKETS = /<{2,}|>{2,}/g;

export interface Normalised {
  text: string;
  /** True when the raw output needed repair — worth counting in telemetry. */
  patched: boolean;
  raw: string;
}

/**
 * Turn whatever the model said into the payload it meant to say.
 *
 * `raw` is the completion AFTER the prefilled `<<<LINE>>>`, so in the happy
 * path it is already just the payload and this is close to a no-op.
 */
export function normaliseSentinel(raw: string, tag = 'LINE'): Normalised {
  const original = raw ?? '';
  let t = original;

  // 1. canonical block already present (model re-emitted a full correct one)
  const clean = extractBlock(t, tag);
  if (clean !== null && !PSEUDO_OPEN.test(clean)) {
    return { text: clean.trim(), patched: false, raw: original };
  }

  // 2. strip a leading pseudo-opener, possibly more than one
  let patched = false;
  for (let i = 0; i < 3 && PSEUDO_OPEN.test(t); i++) {
    t = t.replace(PSEUDO_OPEN, '');
    patched = true;
  }

  // 3. strip a trailing pseudo-closer, possibly more than one
  for (let i = 0; i < 3 && PSEUDO_CLOSE.test(t); i++) {
    t = t.replace(PSEUDO_CLOSE, '');
    patched = true;
  }

  // 4. the model sometimes emits a second block after the first. Keep the
  //    first non-empty line — that is the utterance; the rest is drift.
  const firstLine = t.split('\n').map((s) => s.trim()).find((s) => s.length > 0) ?? '';
  if (firstLine !== t.trim()) patched = true;
  t = firstLine;

  // 5. any surviving bracket runs are noise, never content
  if (STRAY_BRACKETS.test(t)) {
    t = t.replace(STRAY_BRACKETS, ' ');
    patched = true;
  }

  // 6. canonicalise and let sentinel-blocks perform the real extraction, so
  //    the verbatim-payload guarantee still comes from the library.
  const canonical = `<<<${tag}>>>${t.trim()}<<<END>>>`;
  const extracted = extractBlock(canonical, tag) ?? t;

  return {
    text: extracted.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/[.]+$/, ''),
    patched,
    raw: original,
  };
}
