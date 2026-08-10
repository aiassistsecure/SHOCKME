/**
 * SHOCKME · micro-content capsules
 *
 * Six surfaces per discovered room. The model writes short language; the
 * engine writes every rule and every sentence around it.
 *
 *   texture   inscription · margin · object_label · witness_fragment   (max 2)
 *   token     bound_token — 2-4 words, substituted into authored prose
 *   structure choice_label · heading
 *   figure    the room attempts to draw its own object
 *   share     artifact_line
 *
 * THE BOUND TOKEN IS THE POINT. A generated noun is substituted into four or
 * five authored sentences, carried into later rooms, and printed on the
 * artifact. Three generated words make the whole room feel written for you,
 * and every sentence a visitor reads is still one a human wrote and reviewed.
 * That is the only way to get per-visit uniqueness at this scale without
 * putting an unreviewed paragraph in front of a stranger.
 *
 * FOUR RULES, none of them negotiable:
 *
 *   1. NEVER BLOCKS A ROOM. Capsules are queued when a discovery becomes
 *      eligible — before the visitor can reach it. The renderer takes what is
 *      pinned, or the authored fallback, and moves on. An earlier build in
 *      this codebase awaited inference in the render path and hung the end
 *      scene for two minutes.
 *   2. PINNED FOREVER. An accepted line is appended as `imagined_room_line`
 *      with a causal parent, and refresh, replay and artifact rendering all
 *      read that row. The room does not get a second opinion about itself.
 *      A fresh visit may receive a new line; one visit has one version.
 *   3. NOTHING PRIVATE IN THE PROMPT. The envelope carries short semantic
 *      tags the visitor has already generated and the room is already allowed
 *      to render. No seed, no referrer, no visitor id, no email, no typed
 *      answer, no other visitor's material. A model that never sees a private
 *      fact cannot invent a private biography.
 *   4. LANES DO NOT MIX. A room capsule is claimed on the `texture` stream. It
 *      can never become a rail broadcast, and a rail line can never become a
 *      room's inscription.
 */

import { claim, fingerprint } from './claim.ts';
import { screen } from './chat.ts';
import { Rng } from './rng.ts';
import type { Nedb, Hash } from './nedb.ts';
import type { SlotKind, SlotDecl, RoomModule, LogicVariant, VisitFacts } from './experiences/discovery.ts';

/* ------------------------------------------------------------------ */
/* Shape rules per slot                                                */
/* ------------------------------------------------------------------ */

interface Shape { minWords: number; maxWords: number; maxChars: number }

export const SHAPES: Record<SlotKind, Shape> = {
  inscription:      { minWords: 5, maxWords: 16, maxChars: 90 },
  margin:           { minWords: 3, maxWords: 12, maxChars: 70 },
  object_label:     { minWords: 2, maxWords: 6,  maxChars: 40 },
  witness_fragment: { minWords: 6, maxWords: 18, maxChars: 90 },
  bound_token:      { minWords: 2, maxWords: 4,  maxChars: 28 },
  choice_label:     { minWords: 2, maxWords: 5,  maxChars: 34 },
  heading:          { minWords: 1, maxWords: 4,  maxChars: 24 },
  figure:           { minWords: 0, maxWords: 999, maxChars: 200 },
  artifact_line:    { minWords: 4, maxWords: 16, maxChars: 90 },
};

/**
 * Vocabulary the room does not own. Horror words break the register — the
 * room is unsettling because it is polite, and one "scream" undoes that. The
 * rest is the same posture as the rail: no platforms, no contact details, no
 * instructions to the visitor.
 */
const OUT_OF_PALETTE = /\b(scream|blood|kill|die|dead|death|demon|ghost|haunt|evil|terror|horror|nightmare|monster|corpse|murder)\b/i;
const PLATFORMS = /\b(reddit|twitter|x\.com|facebook|instagram|tiktok|discord|telegram|google|youtube|hacker\s?news)\b/i;
const IMPERATIVE = /^(click|press|enter|type|subscribe|sign up|buy|visit|go to|follow)\b/i;

export interface Verdict { ok: boolean; reason: string }

/** Shape + palette + safety. Anything that fails is simply not a line. */
export function validateSlot(kind: SlotKind, raw: string): Verdict {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, reason: 'empty' };

  const s = SHAPES[kind];
  const words = text.split(' ').length;
  if (text.length > s.maxChars) return { ok: false, reason: 'too-long' };
  if (words < s.minWords) return { ok: false, reason: 'too-short' };
  if (words > s.maxWords) return { ok: false, reason: 'too-many-words' };

  if (OUT_OF_PALETTE.test(text)) return { ok: false, reason: 'out-of-palette' };
  if (PLATFORMS.test(text)) return { ok: false, reason: 'names-a-platform' };
  if (IMPERATIVE.test(text)) return { ok: false, reason: 'instructs-the-visitor' };
  // Second-person claims about behaviour are the room's job, from the event
  // log — not the model's, from nothing.
  if (/\byou (have|did|were|are being|always|never)\b/i.test(text)) {
    return { ok: false, reason: 'unsupported-claim-about-visitor' };
  }
  const chat = screen(text);
  if (!chat.ok) return { ok: false, reason: chat.reason };

  return { ok: true, reason: '' };
}

/* ------------------------------------------------------------------ */
/* The context envelope                                                */
/* ------------------------------------------------------------------ */

/**
 * Everything the model is allowed to know, and nothing else. Short semantic
 * tags only — this is deliberately not a transcript.
 */
export interface Envelope {
  room: string;
  discovery: string;
  arrival_reading: string;
  caused_by: string;
  factual_action: string;
  allowed_object: string;
  tone: string;
  slot: SlotKind;
}

const TONE = 'courteous, intimate, restrained, slightly mistaken';

export function envelopeFor(
  module: RoomModule, variant: LogicVariant, facts: VisitFacts, slot: SlotKind, allowedObject: string,
): Envelope {
  return {
    room: module.scene.id,
    discovery: `${module.id}@${module.version}/${variant.id}`,
    arrival_reading: facts.arrivalReading ?? 'unstated',
    caused_by: facts.choices.at(-1) ?? 'arrived',
    factual_action: facts.counted ? 'counted_chairs' : facts.pressed ? 'pressed_the_button' : 'walked',
    allowed_object: allowedObject,
    tone: TONE,
    slot,
  };
}

/** A digest of the envelope, safe to persist. Never the raw envelope. */
export function envelopeDigest(e: Envelope): string {
  return fingerprint(`${e.room}|${e.discovery}|${e.arrival_reading}|${e.caused_by}|${e.factual_action}|${e.slot}`);
}

/* ------------------------------------------------------------------ */
/* Materialisation                                                     */
/* ------------------------------------------------------------------ */

export interface Materialised {
  /** `{object}` → the noun this visit uses, everywhere, forever. */
  tokens: Record<string, string>;
  texture: Partial<Record<SlotKind, string>>;
  heading?: string;
  labels: Record<string, string>;
  artifactLine?: string;
  /** Per-slot provenance, for the back room. Never rendered. */
  provenance: Record<string, 'imagine' | 'curated'>;
}

export type SlotGenerator = (e: Envelope) => Promise<string | null>;

/**
 * Build every slot for one discovered room.
 *
 * Call this when the discovery becomes eligible, NOT when the visitor enters.
 * It resolves to something renderable in every case: an accepted generation,
 * or the authored fallback picked deterministically from the session seed so
 * that a cold model still produces a stable, reproducible room.
 */
export async function materialise(
  db: Nedb,
  opts: {
    seed: string;
    sessionId: string;
    module: RoomModule;
    variant: LogicVariant;
    facts: VisitFacts;
    /** Null when imagine is off or unreachable — every slot then falls back. */
    generate: SlotGenerator | null;
    /** The `discovered_room` event this line hangs off. */
    causedBy?: Hash[];
  },
): Promise<Materialised> {
  const { seed, module, variant, facts } = opts;
  const out: Materialised = { tokens: {}, texture: {}, labels: {}, provenance: {} };

  // Texture is capped at two regardless of what a module declares, so a future
  // module cannot quietly turn a room into a wall of generated prose.
  let textureUsed = 0;
  const TEXTURE: SlotKind[] = ['inscription', 'margin', 'object_label', 'witness_fragment'];

  for (const decl of module.slots) {
    const kind = decl.kind;
    if (TEXTURE.includes(kind)) {
      if (textureUsed >= 2) continue;
      textureUsed++;
    }

    const r = new Rng(seed, `capsule:${module.id}@${module.version}:${kind}`);
    const fallback = decl.fallback.length ? r.pick([...decl.fallback]) : '';
    let text = fallback;
    let source: 'imagine' | 'curated' = 'curated';

    if (opts.generate && kind !== 'figure') {
      const env = envelopeFor(module, variant, facts, kind, out.tokens['{object}'] ?? fallback);
      try {
        const raw = await opts.generate(env);
        if (raw) {
          const candidate = raw.trim().toLowerCase().replace(/\s+/g, ' ');
          if (validateSlot(kind, candidate).ok) {
            /*
             * The novelty fence, on its own lane. Losing means another visit
             * recently received this exact line; we keep the authored
             * fallback rather than serving a duplicate, and we do not retry
             * here — the pump owns retries, a render must never wait.
             */
            const c = await claim(db, {
              stream: 'texture',
              fingerprint: fingerprint(`${module.id}:${kind}:${candidate}`),
              meta: { room: module.scene.id, slot: kind, digest: envelopeDigest(env) },
            });
            if (c.won) { text = candidate; source = 'imagine'; }
          }
        }
      } catch { /* a cold model is a fallback, never an error page */ }
    }

    if (!text) continue;
    out.provenance[kind] = source;

    switch (kind) {
      case 'bound_token':
        out.tokens[decl.token ?? '{object}'] = text;
        break;
      case 'heading':
        out.heading = text;
        break;
      case 'artifact_line':
        out.artifactLine = text;
        break;
      case 'choice_label':
        break; // handled per-choice by the renderer, from variant.labels
      case 'figure':
        break; // drawing.ts owns this, with its own palette filter
      default:
        out.texture[kind] = text;
    }

    /*
     * PIN IT. This row is what refresh, replay and the artifact read. Without
     * it the room would quietly rewrite itself on reload and "revisit your
     * exact reality" would be false on the most visible surface we have.
     */
    if (source === 'imagine') {
      await db.put('imagined_room_lines', `${opts.sessionId}:${module.scene.id}:${kind}`, {
        sessionId: opts.sessionId,
        room: module.scene.id,
        module: `${module.id}@${module.version}`,
        variant: variant.id,
        slot: kind,
        text,
        source,
        digest: envelopeDigest(envelopeFor(module, variant, facts, kind, text)),
      }, opts.causedBy ?? []);
    }
  }

  return out;
}

/** Read the pinned capsules for a room. Replay and refresh use this path. */
export async function pinnedFor(db: Nedb, sessionId: string, room: string): Promise<Partial<Record<SlotKind, string>>> {
  const rows = await db.rows(
    `FROM imagined_room_lines WHERE sessionId = "${sessionId}" AND room = "${room}"`,
  );
  const out: Partial<Record<SlotKind, string>> = {};
  for (const r of rows) out[r.slot as SlotKind] = String(r.text);
  return out;
}

/* ------------------------------------------------------------------ */
/* Substitution                                                        */
/* ------------------------------------------------------------------ */

/**
 * Bind tokens into authored copy. Unfilled placeholders resolve to a neutral
 * noun rather than rendering `{object}` at a visitor — a leaked placeholder
 * is the one failure here that reads as broken software rather than as a
 * strange room.
 */
export function bind(lines: readonly string[], tokens: Record<string, string>): string[] {
  return lines.map((line) =>
    line.replace(/\{[a-z_]+\}/g, (m) => tokens[m] ?? 'thing on the desk'),
  );
}
