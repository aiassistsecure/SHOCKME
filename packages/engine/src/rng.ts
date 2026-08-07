/**
 * SHOCKME · deterministic randomness
 *
 * Every strange thing that happens to a visitor is a pure function of
 * (seed, namespace). Same seed, same reality — forever, and reproducible
 * server-side from NEDB alone.
 *
 * THE SEED NEVER LEAVES THE SERVER. It is dereferenced in the BFF and only
 * resolved outcomes cross the wire. A visitor holding their own seed could
 * compute every branch, and SHOCKME would stop being strange.
 */

import { createHash } from 'node:crypto';

/** 64-bit-ish deterministic hash → 32-bit unsigned int. */
function hash32(s: string): number {
  const h = createHash('sha256').update(s).digest();
  return h.readUInt32BE(0) >>> 0;
}

/** mulberry32 — small, fast, well-distributed, no dependencies. */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A namespaced deterministic random stream.
 *
 * Namespacing matters: if scene selection and bot chatter drew from one
 * shared stream, adding a bot line would silently reshuffle which scene a
 * returning visitor gets. Each concern gets its own independent stream from
 * the same root seed, so features can be added without rewriting history.
 */
export class Rng {
  readonly seed: string;
  private next: () => number;

  constructor(seed: string, namespace = '') {
    this.seed = seed;
    this.next = mulberry32(hash32(`${seed}::${namespace}`));
  }

  /** Fork a child stream for a sub-concern. */
  fork(namespace: string): Rng {
    return new Rng(this.seed, namespace);
  }

  float(): number {
    return this.next();
  }

  int(minInclusive: number, maxExclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }

  bool(pTrue = 0.5): boolean {
    return this.next() < pTrue;
  }

  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error('Rng.pick: empty list');
    return items[this.int(0, items.length)]!;
  }

  /** Weighted pick. Weights need not sum to 1. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [item, w] of entries) {
      r -= w;
      if (r <= 0) return item;
    }
    return entries[entries.length - 1]![0];
  }

  /** Deterministic Fisher–Yates. Returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  /** Pick `n` distinct items. */
  sample<T>(items: readonly T[], n: number): T[] {
    return this.shuffle(items).slice(0, Math.min(n, items.length));
  }
}

/** A fresh, unguessable root seed for a brand-new visitor. */
export function mintSeed(): string {
  return createHash('sha256')
    .update(`${Date.now()}:${Math.random()}:${process.pid}:${Math.random()}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Derive a replay seed from a parent.
 *
 * A replay is a CHILD of the session it came from, not a reroll. Because the
 * derivation is pure, the whole replay tree is reconstructible from the root
 * seed alone — and because `worldSalt` participates, replaying the same
 * session on a different world-tick yields a genuinely different branch
 * rather than the same variation over again.
 */
export function deriveReplaySeed(parentSeed: string, replayIndex: number, worldSalt: string): string {
  return createHash('sha256')
    .update(`${parentSeed}|replay:${replayIndex}|world:${worldSalt}`)
    .digest('hex')
    .slice(0, 32);
}

/** Short, opaque, shareable token. Not derived from the seed — see note. */
export function mintToken(): string {
  /*
   * Deliberately NOT derived from sessionSeed. A comparison token is public;
   * if it were a function of the seed, publishing it would leak the visitor's
   * entire reality to anyone who guessed the derivation. Tokens are random,
   * rotatable, and map to a session only inside NEDB.
   */
  return createHash('sha256')
    .update(`${Date.now()}:${Math.random()}:tok:${Math.random()}`)
    .digest('hex')
    .slice(0, 12);
}
