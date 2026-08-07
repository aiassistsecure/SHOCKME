/**
 * SHOCKME · repository layer
 *
 * The thirteen abstractions from SPEC §05, over the nine collections.
 * Nothing above this file knows NEDB exists. Nothing below it knows what a
 * waiting room is.
 *
 * EVERY state transition is an append-only event carrying `caused_by`, so a
 * visitor's whole reality is a causal chain that TRACE can walk and verify()
 * can prove intact. That is not bookkeeping — it is what lets the site tell
 * a visitor, truthfully, that their history has not been altered.
 */

import { Nedb, eq, lit, type Hash, type NedbRow, type Seq } from './nedb.ts';
import { Rng, mintSeed, mintToken, deriveReplaySeed } from './rng.ts';
import { currentTick, WORLD_SEED } from './world.ts';

export const COLLECTIONS = [
  'visitors', 'sessions', 'experiences', 'scenes', 'events',
  'encounters', 'artifacts', 'broadcasts', 'experience_versions',
] as const;

/* ------------------------------------------------------------------ */
/* Public shapes — what the BFF may hand to a browser                  */
/* ------------------------------------------------------------------ */

export interface Visitor {
  visitorId: string;
  firstSeenTick: number;
  visitCount: number;
}

export interface Session {
  sessionId: string;
  visitorId: string;
  experienceId: string;
  /** SERVER ONLY. Never serialize this to a client. */
  seed: string;
  parentSessionId: string | null;
  replayIndex: number;
  startedTick: number;
  currentSceneId: string;
  /** Hash of the most recent event — the chain tip for this session. */
  tip: Hash | null;
}

/** Exactly what a browser is allowed to know about its own session. */
export interface PublicSessionState {
  sessionId: string;
  experienceId: string;
  sceneId: string;
  visitCount: number;
  replayIndex: number;
  /** Choices made so far, for callback lines. Labels only, never ids of unseen branches. */
  history: string[];
}

export interface ExperienceEvent {
  eventId: string;
  sessionId: string;
  kind: string;
  payload: Record<string, unknown>;
  tick: number;
}

export interface Artifact {
  artifactId: string;
  sessionId: string;
  experienceId: string;
  title: string;
  body: string;
  lines: string[];
  comparisonToken: string;
  /** Proven at creation time, not asserted. */
  historyIntact: boolean;
  chainLength: number;
}

/* ------------------------------------------------------------------ */

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Strip engine internals. The single chokepoint where rows become domain objects. */
function clean<T>(row: NedbRow | null): T | null {
  if (!row) return null;
  const { _id, _coll, _hash, _seq, _caused_by, ...rest } = row;
  return rest as T;
}

export class Repo {
  readonly db: Nedb;

  constructor(db?: Nedb) {
    this.db = db ?? new Nedb();
  }

  async init(): Promise<void> {
    await this.db.ensureDatabase();
  }

  /* ---------------- visitors ---------------- */

  /**
   * Anonymous. No name, no email, no fingerprint — just an opaque id the
   * visitor holds in a cookie they can burn at any time.
   */
  async createVisitor(): Promise<Visitor> {
    const v: Visitor = { visitorId: id('v'), firstSeenTick: currentTick(), visitCount: 0 };
    await this.db.put('visitors', v.visitorId, { ...v });
    return v;
  }

  async getVisitor(visitorId: string): Promise<Visitor | null> {
    return clean<Visitor>(await this.db.one(`FROM visitors WHERE ${eq('id', visitorId)}`));
  }

  /** Returning-visitor memory. Honest: powered by a cookie they control. */
  async touchVisitor(visitorId: string): Promise<Visitor> {
    const existing = await this.getVisitor(visitorId);
    if (!existing) return this.createVisitor();
    const next: Visitor = { ...existing, visitCount: existing.visitCount + 1 };
    await this.db.put('visitors', visitorId, { ...next });
    return next;
  }

  /* ---------------- sessions ---------------- */

  async createSession(visitorId: string, experienceId: string, initialSceneId: string): Promise<Session> {
    const s: Session = {
      sessionId: id('s'),
      visitorId,
      experienceId,
      seed: mintSeed(),
      parentSessionId: null,
      replayIndex: 0,
      startedTick: currentTick(),
      currentSceneId: initialSceneId,
      tip: null,
    };
    await this.db.put('sessions', s.sessionId, { ...s });
    const ev = await this.appendExperienceEvent(s.sessionId, 'session_start', { experienceId }, []);
    s.tip = ev.hash;
    await this.db.put('sessions', s.sessionId, { ...s });
    return s;
  }

  /** SERVER ONLY — this returns the seed. Never hand the result to a client. */
  async getSession(sessionId: string): Promise<Session | null> {
    return clean<Session>(await this.db.one(`FROM sessions WHERE ${eq('id', sessionId)}`));
  }

  /**
   * The browser-safe projection. Deliberately a separate method from
   * getSession so that handing a seed to a client requires actively choosing
   * the wrong function, rather than forgetting to delete a field.
   */
  async getSessionState(sessionId: string): Promise<PublicSessionState | null> {
    const s = await this.getSession(sessionId);
    if (!s) return null;
    const v = await this.getVisitor(s.visitorId);
    const evs = await this.db.rows(
      `FROM events WHERE ${eq('sessionId', sessionId)} AND kind = ${lit('choice')} ORDER BY tick`,
    );
    return {
      sessionId: s.sessionId,
      experienceId: s.experienceId,
      sceneId: s.currentSceneId,
      visitCount: v?.visitCount ?? 0,
      replayIndex: s.replayIndex,
      history: evs.map((e) => String((e.payload as Record<string, unknown>)?.label ?? '')).filter(Boolean),
    };
  }

  /** Time travel. What did this session look like at engine sequence `seq`? */
  async getSessionStateAsOf(sessionId: string, seq: Seq): Promise<{ sceneId: string; events: ExperienceEvent[] } | null> {
    const rows = await this.db.asOf('sessions', seq, eq('id', sessionId));
    if (!rows.length) return null;
    const evRows = await this.db.asOf('events', seq, eq('sessionId', sessionId));
    return {
      sceneId: String(rows[rows.length - 1]!.currentSceneId),
      events: evRows.map((r) => clean<ExperienceEvent>(r)!),
    };
  }

  /* ---------------- events ---------------- */

  /**
   * The spine. Every transition chains to the previous one, so the session
   * is a verifiable causal thread rather than a bag of rows.
   */
  async appendExperienceEvent(
    sessionId: string,
    kind: string,
    payload: Record<string, unknown> = {},
    causedBy?: Hash[],
  ): Promise<{ eventId: string; hash: Hash; seq: Seq }> {
    let parents = causedBy;
    if (parents === undefined) {
      const s = await this.getSession(sessionId);
      parents = s?.tip ? [s.tip] : [];
    }
    const ev: ExperienceEvent = { eventId: id('e'), sessionId, kind, payload, tick: currentTick() };
    const res = await this.db.put('events', ev.eventId, { ...ev }, parents);

    // advance the session tip so the next event chains onto this one
    const s = await this.getSession(sessionId);
    if (s) await this.db.put('sessions', sessionId, { ...s, tip: res.hash });

    return { eventId: ev.eventId, hash: res.hash, seq: res.seq };
  }

  async eventsFor(sessionId: string): Promise<ExperienceEvent[]> {
    const rows = await this.db.rows(`FROM events WHERE ${eq('sessionId', sessionId)} ORDER BY tick`);
    return rows.map((r) => clean<ExperienceEvent>(r)!);
  }

  /* ---------------- experiences ---------------- */

  /**
   * Content-addressed registry write. Re-seeding an unchanged experience is
   * a no-op, so `pnpm seed` is safe to run in a loop (SPEC §11.7).
   */
  async registerExperience(exp: { id: string; version: string; title: string; invitation: string; contentHash: string }): Promise<boolean> {
    const rowId = `${exp.id}@${exp.version}`;
    const existing = await this.db.one(`FROM experiences WHERE ${eq('id', rowId)}`);
    if (existing && existing.contentHash === exp.contentHash) return false; // idempotent
    await this.db.put('experiences', rowId, { ...exp });
    await this.db.put('experience_versions', `${rowId}:${exp.contentHash.slice(0, 8)}`, {
      experienceId: exp.id, version: exp.version, contentHash: exp.contentHash, tick: currentTick(),
    });
    return true;
  }

  async assignExperience(visitorId: string): Promise<string> {
    const rows = await this.db.rows('FROM experiences');
    if (!rows.length) throw new Error('no experiences registered — run the seed');
    // Deterministic per visitor: the same person returning gets a stable world.
    const r = new Rng(visitorId, 'assign');
    return String(r.pick(rows).experienceId ?? rows[0]!.experienceId);
  }

  /* ---------------- variation ---------------- */

  /**
   * Resolve a variation for a session. Pure in (seed, key), so it is stable
   * across reloads (SPEC §11.3) without storing every rendered string.
   */
  generateVariation(seed: string, key: string, options: readonly string[]): string {
    return new Rng(seed, `var:${key}`).pick(options);
  }

  /* ---------------- broadcasts ---------------- */

  /** Written ONCE, globally. */
  async publishBroadcast(kind: string, payload: Record<string, unknown>): Promise<string> {
    const bid = id('b');
    await this.db.put('broadcasts', bid, { broadcastId: bid, kind, payload, tick: currentTick() });
    return bid;
  }

  /**
   * Observed per visitor. The encounter row records THIS visitor's
   * perspective and links back to the one broadcast — that link is what the
   * compare page reads, and it never carries identity.
   */
  async observeBroadcast(
    broadcastId: string,
    sessionId: string,
    perspective: string,
    diverged: boolean,
  ): Promise<void> {
    await this.db.put(
      'encounters',
      `${broadcastId}:${sessionId}`,
      { broadcastId, sessionId, perspective, diverged, tick: currentTick() },
    );
  }

  async encountersOf(sessionId: string): Promise<NedbRow[]> {
    return this.db.rows(`FROM encounters WHERE ${eq('sessionId', sessionId)}`);
  }

  /* ---------------- artifacts + tokens ---------------- */

  createComparisonToken(): string {
    // Random, rotatable, expiring — never derived from the seed, so publishing
    // one reveals nothing about the visitor's reality. (SPEC §05.)
    return mintToken();
  }

  async createArtifact(a: Omit<Artifact, 'historyIntact' | 'chainLength'>): Promise<Artifact> {
    const check = await this.verifyExperienceHistory(a.sessionId);
    const full: Artifact = { ...a, historyIntact: check.intact, chainLength: check.chainLength };
    await this.db.put('artifacts', a.artifactId, { ...full }, []);
    await this.db.put('artifacts', `token:${a.comparisonToken}`, { artifactId: a.artifactId });
    return full;
  }

  async artifactByToken(token: string): Promise<Artifact | null> {
    const ptr = await this.db.one(`FROM artifacts WHERE ${eq('id', `token:${token}`)}`);
    if (!ptr) return null;
    return clean<Artifact>(await this.db.one(`FROM artifacts WHERE ${eq('id', String(ptr.artifactId))}`));
  }

  /* ---------------- replay ---------------- */

  /**
   * A replay is a CHILD of its parent, chained causally — so the replay tree
   * is provable, not merely recorded (SPEC §11.4).
   */
  async replaySession(parentSessionId: string, initialSceneId: string): Promise<Session> {
    const parent = await this.getSession(parentSessionId);
    if (!parent) throw new Error(`no such session: ${parentSessionId}`);
    const replayIndex = parent.replayIndex + 1;
    const worldSalt = `${WORLD_SEED}:${currentTick()}`;
    const s: Session = {
      sessionId: id('s'),
      visitorId: parent.visitorId,
      experienceId: parent.experienceId,
      seed: deriveReplaySeed(parent.seed, replayIndex, worldSalt),
      parentSessionId: parent.sessionId,
      replayIndex,
      startedTick: currentTick(),
      currentSceneId: initialSceneId,
      tip: null,
    };
    await this.db.put('sessions', s.sessionId, { ...s });
    const ev = await this.appendExperienceEvent(
      s.sessionId, 'replay_start', { parentSessionId, replayIndex },
      parent.tip ? [parent.tip] : [],   // the causal link to the life before this one
    );
    s.tip = ev.hash;
    await this.db.put('sessions', s.sessionId, { ...s });
    return s;
  }

  /* ---------------- verification ---------------- */

  /**
   * Two questions, both real:
   *   1. does the engine's own hash chain verify?
   *   2. does this session's causal thread resolve end to end?
   * Surfaced in-world as an artifact line, never as an admin panel.
   */
  async verifyExperienceHistory(sessionId: string): Promise<{ intact: boolean; chainLength: number; engineOk: boolean }> {
    const engine = await this.db.verify();
    const s = await this.getSession(sessionId);
    if (!s?.tip) return { intact: engine.ok, chainLength: 0, engineOk: engine.ok };
    const chain = await this.db.trace('events', eq('sessionId', sessionId));
    const own = await this.eventsFor(sessionId);
    return {
      intact: engine.ok && chain.length >= own.length,
      chainLength: own.length,
      engineOk: engine.ok,
    };
  }

  async advanceScene(sessionId: string, sceneId: string): Promise<void> {
    const s = await this.getSession(sessionId);
    if (!s) return;
    await this.db.put('sessions', sessionId, { ...s, currentSceneId: sceneId });
  }
}
