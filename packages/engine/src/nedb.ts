/**
 * SHOCKME · NEDB transport
 *
 * The ONLY module in the codebase that speaks HTTP to nedbd.
 * Everything above this file thinks in domain nouns, never in seqs or hashes.
 *
 * Verified against a live nedbd 2.8.2 DAG engine on 2026-08-07:
 *   - put accepts `caused_by` at the TOP LEVEL of the body. A caused_by placed
 *     inside `doc` is stored as inert user data and creates NO causal edge.
 *   - the identity field in NQL is `_id`, NOT `id`. `WHERE id = "x"` silently
 *     matches nothing, which reads exactly like "TRACE is broken". It isn't.
 *     `eq()` below exists so that mistake is unrepeatable.
 *   - the engine normalizes int seqs to hash strings; rows expose `_caused_by`.
 */

export type Hash = string;
export type Seq = number;

export interface NedbRow {
  _id: string;
  _coll: string;
  _hash: Hash;
  _seq: Seq;
  _caused_by?: Hash[];
  [k: string]: unknown;
}

export interface PutResult {
  ok: boolean;
  seq: Seq;
  head: Hash;
  hash: Hash;
}

export interface QueryResult {
  count: number;
  head: Hash;
  seq: Seq;
  rows: NedbRow[];
}

export interface VerifyResult {
  ok: boolean;
  head: Hash;
  seq: Seq;
  objects_checked: number;
  tamper_evident: boolean;
  tampered: string[];
}

/** Quote a value for an NQL literal. */
export function lit(v: string | number | boolean): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // NQL string literals are double-quoted; escape embedded quotes.
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Build a `WHERE field = value` fragment with the identity field corrected.
 * Callers who write `eq('id', x)` get `_id` — the gotcha is unrepeatable.
 */
export function eq(field: string, value: string | number | boolean): string {
  const f = field === 'id' ? '_id' : field;
  return `${f} = ${lit(value)}`;
}

export class NedbError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'NedbError';
    this.status = status;
  }
}

export class Nedb {
  readonly base: string;
  readonly db: string;

  constructor(opts: { url?: string; db?: string } = {}) {
    const url = opts.url ?? process.env.NEDB_URL ?? 'http://127.0.0.1:7070';
    this.base = url.replace(/\/+$/, '');
    this.db = opts.db ?? process.env.NEDB_DB ?? 'shockme';
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}/v1/databases${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new NedbError(`nedbd ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`, res.status);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /**
   * Idempotent database creation.
   *
   * MUST list-then-create, not create-and-catch. Observed on nedbd 2.8.2:
   * POST /v1/databases for a database the daemon already holds open returns
   * **500 "locked by another process (pid N)"** — where pid N is the daemon
   * itself — not a 409. Catching only 409 makes every restart after the
   * first one fail to boot, and the error message sends you hunting for a
   * phantom second process.
   */
  async ensureDatabase(): Promise<void> {
    try {
      const list = await this.call<{ databases?: unknown[] }>('GET', '');
      const names = (list.databases ?? []).map((d) =>
        typeof d === 'string' ? d : String((d as { name?: string }).name ?? ''),
      );
      if (names.includes(this.db)) return;
    } catch {
      /* fall through and attempt creation */
    }
    try {
      await this.call('POST', '', { name: this.db });
    } catch (e) {
      if (e instanceof NedbError && (e.status === 409 || /exist|locked/i.test(e.message))) return;
      throw e;
    }
  }

  /**
   * Append an immutable record.
   * `causedBy` MUST be passed here, not folded into `doc` — see header note.
   */
  async put(
    coll: string,
    id: string,
    doc: Record<string, unknown>,
    causedBy: Hash[] = [],
  ): Promise<PutResult> {
    const body: Record<string, unknown> = { coll, id, doc };
    if (causedBy.length) body.caused_by = causedBy;
    const r = await this.call<{ ok: boolean; seq: Seq; head: Hash; doc: NedbRow }>(
      'POST',
      `/${this.db}/put`,
      body,
    );
    return { ok: r.ok, seq: r.seq, head: r.head, hash: r.doc._hash };
  }

  async query(nql: string): Promise<QueryResult> {
    return this.call<QueryResult>('POST', `/${this.db}/query`, { nql });
  }

  async rows(nql: string): Promise<NedbRow[]> {
    return (await this.query(nql)).rows;
  }

  async one(nql: string): Promise<NedbRow | null> {
    const r = await this.rows(`${nql} LIMIT 1`);
    return r[0] ?? null;
  }

  /** Time travel. `AS OF` is inclusive of rows whose _seq <= seq. */
  async asOf(coll: string, seq: Seq, where?: string): Promise<NedbRow[]> {
    const w = where ? ` WHERE ${where}` : '';
    return this.rows(`FROM ${coll} AS OF ${seq}${w}`);
  }

  /** Causal ancestry. Returns the row plus everything it descends from. */
  async trace(coll: string, where: string, reverse = false): Promise<NedbRow[]> {
    return this.rows(`FROM ${coll} WHERE ${where} TRACE caused_by${reverse ? ' REVERSE' : ''}`);
  }

  async verify(): Promise<VerifyResult> {
    return this.call<VerifyResult>('GET', `/${this.db}/verify`);
  }

  async head(): Promise<{ head: Hash; seq: Seq }> {
    const r = await this.query('FROM _nonexistent_probe_');
    return { head: r.head, seq: r.seq };
  }
}
