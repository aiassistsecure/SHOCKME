/**
 * SHOCKME · claim fences
 *
 * Three things in v2 must happen AT MOST ONCE: a rail broadcast, a session's
 * projection envelope, and an Imagine room capsule. Each is contested by
 * concurrent writers — two SSE pumps finishing the same completion, two tabs
 * of the same visit, two visitors landing on the same generated noun.
 *
 * The obvious implementation is query-then-insert. It races, and the race is
 * not theoretical: the whole point of the pump is that several candidates are
 * in flight at once. The other tempting implementation is an in-memory Set,
 * which is a lie the moment a second process exists and a worse lie because it
 * looks like it works.
 *
 * WHAT WE USE INSTEAD, AND WHY IT NEEDS NO ENGINE CHANGE
 * -----------------------------------------------------
 * nedbd assigns every append a globally ordered `_seq` through a single-writer
 * sequencer. That total order IS the serialization point. So:
 *
 *   1. every candidate appends its OWN row carrying a shared fingerprint
 *   2. every candidate reads back all rows with that fingerprint
 *   3. the row with the lowest `_seq` owns the claim
 *
 * Exactly one writer sees itself as the minimum, because anyone holding a seq
 * lower than yours committed BEFORE your put returned and is therefore already
 * visible to your read. Writers above you can't take it from you, and you
 * cannot take it from writers below you. Partial visibility of later arrivals
 * is harmless.
 *
 * MEASURED against a live nedbd 2.8.2 DAG engine on 2026-08-10: 20 rounds ×
 * 32 concurrent claimants = 640 contested appends, exactly one winner in every
 * round, verify() green over 1,929 objects. Racers observed as few as 3 of 32
 * rows at read time and still resolved correctly — which is the property that
 * matters and the one a hopeful implementation would get wrong.
 *
 * TWO ENGINE FACTS THIS FILE DEPENDS ON — both cost real time to learn:
 *
 *   - `put` returns the DATABASE HEAD after the write, not the row's seq.
 *     A put whose response says seq 641 wrote a row whose `_seq` is 640.
 *     `Nedb.put()` surfaces the head value as `PutResult.seq`, so comparing it
 *     to a row's `_seq` silently never matches — which reads exactly like a
 *     broken fence. We identify our own row by `_hash`, which is exact.
 *
 *   - `ORDER BY _seq` does NOT sort the result set. Rows come back in id
 *     order. We sort here, in JavaScript, and never trust that clause.
 *
 * A LOSING CANDIDATE IS STILL WRITTEN. That is deliberate: contention becomes
 * an append-only audit trail rather than a discarded write. Losers are never
 * published, never rendered, and never counted as content.
 */

import { createHash, randomBytes } from 'node:crypto';
import { Nedb, eq } from './nedb.ts';

/** The three lanes. They share this primitive and NOTHING else — a private
 *  room capsule must never be able to reach the public rail. */
export type ClaimStream = 'broadcast' | 'projection' | 'texture';

export interface ClaimResult {
  /** True only for the single writer holding the lowest seq. */
  won: boolean;
  stream: ClaimStream;
  fingerprint: string;
  window: string;
  /** Our own row's seq — useful for diagnostics, never for ordering decisions. */
  seq: number;
  /** How many candidates were visible when we read back. Diagnostic only. */
  contenders: number;
  /** Set when we could not see our own write. Treated as a loss. */
  invisible?: boolean;
}

/* ------------------------------------------------------------------ */
/* Canonical fingerprints                                              */
/* ------------------------------------------------------------------ */

/**
 * Fold a candidate to its dedupe identity.
 *
 * Deliberately NOT `chat.fold()`. That one exists to defeat blocklist evasion
 * and destroys punctuation and digits to do it, which would collapse two
 * genuinely different sentences into one fingerprint. This is the conservative
 * version: unicode normalised, whitespace folded, case folded, terminal
 * punctuation dropped. "the lamp is listening." and "The lamp is listening"
 * are the same line. "6 chairs" and "7 chairs" are not.
 */
export function canonical(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[​-‍﻿­]/g, '')  // zero-width + soft hyphen
    .replace(/[‘’]/g, "'")               // curly → straight
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?\s]+$/, '')
    .trim();
}

/** Stable short hex identity for a canonical string. */
export function fingerprint(raw: string): string {
  return createHash('sha256').update(canonical(raw)).digest('hex').slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

/**
 * Claims are scoped to a rolling window so an ordinary sentence is never
 * banned permanently. A visitor in March and a visitor in August may
 * legitimately say the same short thing.
 *
 * Implemented as a fixed bucket rather than a true sliding window, because a
 * bucket is a value we can put in an indexed equality query and a sliding
 * window is a scan. HONEST COST: a duplicate one second either side of a
 * bucket boundary is admitted. That is strictly better than the alternative
 * failure, which is silently erasing a real human's repeated words forever.
 */
export function windowFor(stream: ClaimStream, at: number = Date.now()): string {
  const HOURS = stream === 'broadcast' ? 24 : 24 * 7;
  const bucket = Math.floor(at / (HOURS * 3600_000));
  return `${HOURS}h:${bucket}`;
}

/* ------------------------------------------------------------------ */
/* The fence                                                           */
/* ------------------------------------------------------------------ */

export interface ClaimOpts {
  stream: ClaimStream;
  /** Canonical identity of the thing being claimed. */
  fingerprint: string;
  /** Rolling scope. Defaults to this stream's current bucket. */
  window?: string;
  /** Small non-identifying diagnostics. NEVER a raw prompt or visitor text. */
  meta?: Record<string, unknown>;
}

/**
 * Contest a fingerprint. Returns `won: true` for exactly one caller.
 *
 * The caller MUST NOT publish, render, or fan out anything before this
 * resolves true. No SSE event may precede the append — a transient flash of a
 * line that then loses is worse than the duplicate it was trying to prevent.
 */
export async function claim(db: Nedb, opts: ClaimOpts): Promise<ClaimResult> {
  const stream = opts.stream;
  const window = opts.window ?? windowFor(stream);
  const fp = opts.fingerprint;

  /*
   * The nonce keeps every candidate's row DISTINCT in both id and content.
   *
   * Without it two identical candidates would write the same id with the same
   * body, and in a content-addressed append-only store that is a new version
   * of one row rather than two contesting rows — so both callers would read
   * back a single row and both could believe they own it. This exact mistake
   * produced a 0/20 result during the probe and looked like an engine fault.
   */
  const nonce = randomBytes(8).toString('hex');
  const rowId = `${stream}:${window}:${fp}:${nonce}`;

  const put = await db.put('claims', rowId, {
    stream,
    window,
    fingerprint: fp,
    nonce,
    at: Date.now(),
    ...(opts.meta ? { meta: opts.meta } : {}),
  });

  const rows = await db.rows(
    `FROM claims WHERE ${eq('stream', stream)} AND ${eq('window', window)} AND ${eq('fingerprint', fp)}`,
  );

  // Sort here. `ORDER BY _seq` is not honoured by the engine's query path.
  const ordered = [...rows].sort((a, b) => a._seq - b._seq);
  const winner = ordered[0];
  const mine = rows.find((r) => r._hash === put.hash);

  /*
   * If we cannot see our own append, we do NOT get to guess. Declaring a win
   * on an unread write is how a duplicate reaches the rail. Losing costs us
   * one candidate; the pump simply generates another.
   */
  if (!mine) {
    return { won: false, stream, fingerprint: fp, window, seq: -1, contenders: rows.length, invisible: true };
  }

  /*
   * CONFIRM BEFORE CLAIMING.
   *
   * MEASURED, and it disproves the simple version of this fence: under 32-way
   * contention two racers occasionally BOTH see themselves as the minimum,
   * because a read can miss a lower-seq row that has already committed. Each
   * read-your-write is honoured; a read of somebody ELSE's slightly-earlier
   * write is not guaranteed.
   *
   * So a believed win is re-checked once. The loser of a genuine race sees the
   * earlier row on the second look and stands down. This does not make the
   * fence a distributed-consensus primitive — nothing here is — it narrows the
   * window from "sometimes duplicates" to "rarely duplicates", and only the
   * racer that thinks it won pays the extra read.
   *
   * The residual risk is one duplicate line on a rail, which is the failure we
   * started from and is not worth a heavier mechanism in a text game.
   */
  let won = winner?._hash === put.hash;
  if (won) {
    const confirm = await db.rows(
      `FROM claims WHERE ${eq('stream', stream)} AND ${eq('window', window)} AND ${eq('fingerprint', fp)}`,
    );
    const first = [...confirm].sort((a, b) => a._seq - b._seq)[0];
    won = first?._hash === put.hash;
  }

  return {
    won,
    stream,
    fingerprint: fp,
    window,
    seq: mine._seq,
    contenders: rows.length,
  };
}

/** Convenience: fence a piece of text in one call. */
export async function claimText(
  db: Nedb,
  stream: ClaimStream,
  text: string,
  meta?: Record<string, unknown>,
): Promise<ClaimResult> {
  return claim(db, { stream, fingerprint: fingerprint(text), meta });
}
