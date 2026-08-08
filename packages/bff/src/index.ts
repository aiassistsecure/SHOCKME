/**
 * SHOCKME · BFF
 *
 * The only process that has ever heard of nedbd.
 *
 * The browser holds one opaque cookie. It never receives `seed`, `seq`,
 * `hash`, `caused_by`, or a collection name. Routes are intent-shaped
 * (choose / dwell / press), never a generic query passthrough — a generic
 * proxy would let a curious visitor read the generator and spoil the trick
 * for themselves.
 *
 * Zero dependencies: node:http, node:crypto. Nothing to install, nothing to
 * audit, and a cold start measured in milliseconds. "Fast" is a product
 * constraint, so the server is part of that budget.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Repo } from '../../engine/src/repo.ts';
import { Nedb } from '../../engine/src/nedb.ts';
import {
  DEFINITION, EXPERIENCE_ID, INITIAL_SCENE, SCENES, sceneById,
  resolveRoom, noticeFor, NUDGES, HOVERS,
} from '../../engine/src/experiences/waiting-room.ts';
import { verdictFor, GUESS_MIN, GUESS_MAX } from '../../engine/src/experiences/waiting-room.ts';
import { renderRoom, renderArtifact } from './render.ts';
import { CONFIG, banner, type ImagineStatus } from './config.ts';
import { Rng } from '../../engine/src/rng.ts';
import { AMBIENT } from '../../engine/src/world.ts';
import { Imagine } from '../../engine/src/imagine.ts';
import { currentTick, inhabitantsAt, observeLine, HANDLE_STEMS, TICK_MS, type ObservedLine } from '../../engine/src/world.ts';
import { screen, decline, rateCheck, noteSpoke, handleFor, MAX_LEN, type Utterance } from '../../engine/src/chat.ts';
import { adminEnabled, tokenOk, gather, renderAdmin, ADMIN_TOKEN } from './admin.ts';
import { draw, subjectFor, type Drawing } from '../../engine/src/drawing.ts';
import { stingFor, MAX_STINGS } from '../../engine/src/experiences/sting.ts';
import {
  resolveSecondHalf, comparisonLine, missedRooms, fmtDuration,
  ROOM_NAMES, TOTAL_ROOMS, ALL_ROOM_IDS, type Facts,
} from '../../engine/src/experiences/second-half.ts';

const PORT = CONFIG.port;
const repo = new Repo(new Nedb({ url: CONFIG.nedbUrl, db: CONFIG.nedbDb }));
const imagine = new Imagine(CONFIG.imagineUrl, CONFIG.imagine);
let imagineStatus: ImagineStatus = CONFIG.imagine ? 'unreachable' : 'off-by-flag';

/**
 * One line per (tick, bot), generated ONCE and shared by every observer.
 * In-memory for now; the NEDB-backed version (so AS-OF replay reads the
 * stored line rather than regenerating) is the next slice — see README.
 */
const lineCache = new Map<string, string>();

/**
 * THE REQUEST PATH NEVER WAITS ON INFERENCE.
 *
 * An earlier build generated lines inside renderCurrent. Seven ticks of
 * backfill at ~1.4s each hung the page for over two minutes — "fast" is a
 * product constraint here, so this is a correctness bug, not a tuning issue.
 *
 * Now: a background pump generates ahead of the clock and fills the cache.
 * A request takes what is cached and otherwise falls back to the corpus
 * immediately. The room is never late, it is at worst less varied.
 */
function cachedOrCorpus(tick: number, botId: string): string {
  const hit = lineCache.get(`${tick}:${botId}`);
  if (hit !== undefined) return hit;
  return new Rng(CONFIG.worldSeed, `fallback:${tick}:${botId}`).pick(AMBIENT);
}

function roomLines(tick: number, observerSeed: string, lastChoice?: string): ObservedLine[] {
  const out: ObservedLine[] = [];
  for (const bot of inhabitantsAt(tick)) {
    if (tick % bot.cadence !== 0) continue;
    out.push(observeLine(
      { lineId: `l_${tick}_${bot.botId}`, tick, botId: bot.botId, handle: bot.handle,
        kind: 'ambient', template: cachedOrCorpus(tick, bot.botId) },
      observerSeed, { lastChoice },
    ));
  }
  return out;
}

/** Generate a little ahead of the clock, one line at a time, never blocking. */
function startPump(): void {
  if (!CONFIG.imagine) return;
  const LOOKAHEAD = 4;
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const now = currentTick();
      for (let t = now; t <= now + LOOKAHEAD; t++) {
        for (const bot of inhabitantsAt(t)) {
          if (t % bot.cadence !== 0) continue;
          const key = `${t}:${bot.botId}`;
          if (lineCache.has(key)) continue;
          const line = await imagine.line(t, bot.botId);
          lineCache.set(key, line.text);
          if (lineCache.size > 4000) lineCache.delete(lineCache.keys().next().value!);
          return; // one per pass — keeps the loop responsive on 2 cores
        }
      }
    } catch { /* pump failure is never fatal; corpus covers it */ }
    finally { running = false; }
  }, 400);
}

/* ---------------- live voices ---------------- */

/**
 * Recent human lines, kept in memory for the stream and written through to
 * NEDB for the record. A human utterance is rendered EXACTLY like a generated
 * one — same handle pool, same markup — so nobody can tell which voices in
 * the room belong to people. That indistinguishability is the feature.
 */
const liveVoices: Utterance[] = [];
const LIVE_KEEP = 120;

/**
 * Monotonic cursor over utterances.
 *
 * THE BUG THIS FIXES: the stream emitted only when the TICK CHANGED, and each
 * tick was emitted exactly once. A line spoken part-way through tick T was
 * therefore never sent — tick T had already fired — so the speaker got "It is
 * in the room now" and then watched nothing happen. It only appeared on a
 * full reload. Found by M typing "Boooo!" into the live site.
 *
 * Human speech is not tick-quantised any more. Bot lines still arrive on the
 * clock, because the room has a rhythm; people interrupt it.
 */
let voiceSeq = 0;

/**
 * Drawings, per session. Generated ONCE and kept — the room does not get a
 * second attempt at the same visitor, which is both cheaper and truer.
 */
const drawings = new Map<string, Drawing>();

/** Open event streams == people with the room actually on screen. */
let openStreams = 0;

function voicesInWindow(fromTick: number, toTick: number): Utterance[] {
  return liveVoices.filter((u) => u.tick >= fromTick && u.tick <= toTick);
}

/* ---------------- cookies ---------------- */

function readCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const cookie = (k: string, v: string) =>
  `${k}=${encodeURIComponent(v)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}`;

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { return {}; }
}

const json = (res: ServerResponse, data: unknown, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
};

/* ---------------- session resolution ---------------- */

interface Ctx { visitorId: string; sessionId: string; setCookies: string[] }

async function resolveCtx(req: IncomingMessage): Promise<Ctx> {
  const c = readCookies(req);
  const setCookies: string[] = [];

  let visitorId = c.sm_v ?? '';
  let visitor = visitorId ? await repo.getVisitor(visitorId) : null;
  if (!visitor) {
    visitor = await repo.createVisitor();
    visitorId = visitor.visitorId;
    setCookies.push(cookie('sm_v', visitorId));
  }

  let sessionId = c.sm_s ?? '';
  const existing = sessionId ? await repo.getSession(sessionId) : null;
  if (!existing) {
    const s = await repo.createSession(visitorId, EXPERIENCE_ID, INITIAL_SCENE);
    sessionId = s.sessionId;
    setCookies.push(cookie('sm_s', sessionId));
  }
  return { visitorId, sessionId, setCookies };
}

/* ---------------- the room ---------------- */

const BODIES: Record<string, string> = {
  arrival: 'Someone will be with you shortly. Nobody will be with you shortly.',
  seated: 'The chair accepts you. It has accepted others.',
  standing: 'Standing is permitted. It is noted, but permitted.',
  notice: 'There is a notice on the wall. It has been updated recently.',
  counting: '',
  button: 'There is a button. It would prefer you did not.',
  // the second half — see engine/src/experiences/second-half.ts
  corridor: '',
  ledger: 'The room has been keeping records. It would like to show you yours.',
  recital: '',
  inventory: '',
  dark: '',
  threshold: '',
  end: '',
};

/*
 * FACTS ARE MEASURED, NEVER INVENTED.
 *
 * The second half's whole effect is that the room can prove it was paying
 * attention. One fabricated number and the trick is dead on the second visit,
 * so everything here comes out of the event log or is omitted.
 */
async function buildFacts(
  ctx: Ctx, s: Awaited<ReturnType<Repo['getSession']>>, resolved: ReturnType<typeof resolveRoom>,
): Promise<Facts> {
  const [visitors, sessions, allEvents, myEvents] = await Promise.all([
    repo.db.rows('FROM visitors'),
    repo.db.rows('FROM sessions'),
    repo.db.rows('FROM events ORDER BY tick'),
    repo.eventsFor(ctx.sessionId),
  ]);

  const payload = (e: { payload?: unknown }) => (e.payload ?? {}) as Record<string, unknown>;

  // your real elapsed time, from your own dwell events
  const myDwells = myEvents.filter((e) => e.kind === 'dwell').map((e) => Number(payload(e).dwellMs ?? 0));
  /*
   * Dwell is only logged every 6s, so a fast visitor can reach the ledger with
   * none recorded and be told they have been here "0 seconds" — which reads as
   * a broken counter and destroys the one thing this room is selling. Fall
   * back to the session's real age, which is always true.
   */
  const sessionAgeMs = Math.max(0, (currentTick() - Number(s!.startedTick ?? currentTick())) * TICK_MS);
  const yourMs = Math.max(myDwells.length ? Math.max(...myDwells) : 0, sessionAgeMs, 1000);

  // the real median across every session that recorded one
  const perSession = new Map<string, number>();
  for (const e of allEvents) {
    if (e.kind !== 'dwell') continue;
    const id = String(e.sessionId);
    perSession.set(id, Math.max(perSession.get(id) ?? 0, Number(payload(e).dwellMs ?? 0)));
  }
  const spread = [...perSession.values()].sort((a, b) => a - b);
  const medianMs = spread.length ? spread[Math.floor(spread.length / 2)]! : 0;

  // a real line, from a real stranger, that is not yours
  const nowTickEarly = currentTick();
  const said = allEvents.filter((e) => e.kind === 'said');
  const theirs = said.filter((e) => String(e.sessionId) !== ctx.sessionId);
  // Prefer something said recently. A 16-hour-old line reads like a database
  // dump; a line from four minutes ago reads like someone is in the next room.
  const recent = theirs.filter((e) => (nowTickEarly - Number(e.tick ?? 0)) * TICK_MS < 45 * 60_000);
  const pool = recent.length ? recent : theirs.slice(-8);
  const pick = pool.length ? pool[pool.length - 1 - Math.floor(Math.random() * Math.min(4, pool.length))]! : undefined;
  const nowTick = currentTick();

  const mine = said.filter((e) => String(e.sessionId) === ctx.sessionId).at(-1);

  // rooms you have genuinely been in
  const roomsSeen = ['arrival', ...myEvents.filter((e) => e.kind === 'choice')
    .map((e) => String(payload(e).to ?? ''))]
    .filter((id) => (ALL_ROOM_IDS as readonly string[]).includes(id));   // 'end' is not a room

  const counted = myEvents.find((e) => e.kind === 'counted');

  return {
    visitorNumber: visitors.findIndex((v) => String(v.visitorId) === ctx.visitorId) + 1 || visitors.length,
    totalVisitors: visitors.length,
    finished: new Set(allEvents.filter((e) => e.kind === 'choice' && payload(e).to === 'end')
      .map((e) => String(e.sessionId))).size,
    yourMs,
    medianMs,
    quote: pick ? {
      text: String(payload(pick).text ?? ''),
      handle: String(payload(pick).handle ?? 'someone'),
      agoMin: Math.max(0, Math.round(((nowTick - Number(pick.tick ?? nowTick)) * TICK_MS) / 60000)),
    } : undefined,
    yourQuote: mine ? String(payload(mine).text ?? '') : undefined,
    path: myEvents.filter((e) => e.kind === 'choice').map((e) => String(payload(e).label ?? '')),
    guess: counted ? Number(payload(counted).guess) : undefined,
    chairsDrawn: resolved.chairCount,
    pressed: myEvents.some((e) => e.kind === 'press'),
    population: inhabitantsAt(nowTick).length + openStreams,
    roomsSeen: [...new Set(roomsSeen)],
  };
}

async function renderCurrent(ctx: Ctx, dwellMs = 0): Promise<string> {
  const s = (await repo.getSession(ctx.sessionId))!;
  const v = await repo.getVisitor(ctx.visitorId);
  const scene = sceneById(s.currentSceneId) ?? sceneById(INITIAL_SCENE)!;
  const resolved = resolveRoom(s.seed, v?.visitCount ?? 0);   // seed used HERE, server-side
  const tick = currentTick();
  const state = await repo.getSessionState(ctx.sessionId);

  const SECOND_HALF = new Set(['corridor', 'ledger', 'recital', 'inventory', 'dark', 'threshold', 'end']);
  const facts = SECOND_HALF.has(scene.id) ? await buildFacts(ctx, s, resolved) : undefined;
  const secondHalf = resolveSecondHalf(s.seed);

  /*
   * A sting only exists if something specific and MEASURED is true about this
   * visitor right now. Deterministic per session+scene so a replay reproduces
   * the same shocks in the same places.
   */
  let sting: string | undefined;
  if (facts) {
    const evs = await repo.eventsFor(ctx.sessionId);
    const buttonAt = evs.find((e) => e.kind === 'choice' &&
      (e.payload as Record<string, unknown>)?.to === 'button')?.tick ?? 0;
    const leftAt = evs.find((e) => e.kind === 'choice' &&
      (e.payload as Record<string, unknown>)?.from === 'button')?.tick ?? 0;
    const firedIds = new Set(evs.filter((e) => e.kind === 'sting')
      .map((e) => String((e.payload as Record<string, unknown>)?.id ?? '')));

    const hit = stingFor(s.seed, facts, {
      sceneId: scene.id,
      visitCount: v?.visitCount ?? 0,
      buttonHesitationMs: buttonAt && leftAt ? Math.max(0, (leftAt - buttonAt) * TICK_MS) : 0,
      fired: firedIds.size,
    });

    // Never repeat a sting to the same person — the second telling is a line
    // of text, not a shock.
    if (hit && !firedIds.has(hit.id)) {
      sting = hit.line;
      await repo.appendExperienceEvent(ctx.sessionId, 'sting', { id: hit.id, scene: scene.id });
    }
  }

  const lastChoice = state?.history.at(-1)?.toLowerCase();
  const lines: ObservedLine[] = [];
  for (let t = tick - 6; t <= tick; t++) {
    lines.push(...roomLines(t, s.seed, lastChoice));
    // Human voices are NOT put through observeLine — a real person's words
    // must reach every observer unaltered. Only the room's own lines diverge.
    for (const u of voicesInWindow(t, t)) {
      lines.push({ lineId: u.utteranceId, tick: u.tick, handle: u.handle,
                   kind: 'ambient', text: u.text, diverged: false });
    }
  }
  lines.sort((a, b) => a.tick - b.tick);

  let artifact;
  let shareToken: string | undefined;
  if (scene.id === 'end') {
    const check = await repo.verifyExperienceHistory(ctx.sessionId);
    const evs = await repo.eventsFor(ctx.sessionId);
    const pressed = evs.some((e) => e.kind === 'press');
    artifact = {
      mark: '\u25C8',
      title: resolved.closing,
      lines: [
        `you were told: ${resolved.greeting.toLowerCase()}`,
        (() => {
          // If they committed a number, the artifact is a three-way disagreement
          // between the visitor, the room's claim, and what it actually drew.
          // That is far more shareable than the room disagreeing with itself.
          const cnt = evs.find((e) => e.kind === 'counted');
          const g = cnt ? Number((cnt.payload as Record<string, unknown>)?.guess) : NaN;
          return Number.isFinite(g)
            ? `you counted ${g}. the room insisted on ${resolved.claimedChairCount}. it drew ${resolved.chairCount}.`
            : `the room insisted on ${resolved.claimedChairCount} chairs. it drew ${resolved.chairCount}.`;
        })(),
        `it said: ${resolved.anomaly.line.toLowerCase()}`,
        pressed ? `you pressed the button. the button disagrees.` : `you left the button alone. so did everyone.`,
        `${state?.history.length ?? 0} choices, none of them the same as theirs.`,
        /*
         * THE HOOK, STATED WITHOUT PRESSURE.
         *
         * The corridor forks, so a complete run sees 7 of 12 rooms. Naming
         * what you missed is the entire retention mechanic — and it is a fact,
         * not a manipulation. No streak, no timer, no guilt: just an accurate
         * sentence that happens to be unbearable to leave alone.
         */
        (() => {
          const seen = facts?.roomsSeen ?? [];
          const missed = missedRooms(seen);
          if (!missed.length) return `you have been in all ${TOTAL_ROOMS} rooms. nobody does this on the first visit.`;
          return `there are ${TOTAL_ROOMS} rooms. you found ${seen.length}. you did not find ${missed.slice(0, 2).join(' or ')}.`;
        })(),
      ],
      closing: pressed ? resolved.nonPress : 'nothing was pressed. nothing ever is.',
      historyIntact: check.intact,
      chainLength: check.chainLength,
    };

    /*
     * Mint ONCE and reuse. The artifact is a record of something that
     * happened, so re-minting on every reload would hand the same visitor a
     * new URL each time they refreshed — and quietly break any link they had
     * already sent to a friend.
     */
    const existing = await repo.artifactForSession(ctx.sessionId);
    if (existing) {
      shareToken = existing.comparisonToken;
    } else {
      const token = repo.createComparisonToken();
      await repo.createArtifact({
        artifactId: `art_${ctx.sessionId}`,
        sessionId: ctx.sessionId,
        experienceId: s.experienceId,
        title: artifact.title,
        body: artifact.closing,
        lines: artifact.lines,
        comparisonToken: token,
      });
      shareToken = token;
    }
  }

  return renderRoom({
    sceneId: scene.id,
    renderer: scene.renderer,
    greeting: scene.id === 'arrival' ? resolved.greeting : titleFor(scene.id, resolved),
    body: BODIES[scene.id] ?? '',
    choices: scene.choices.map((c) => ({ id: c.id, label: c.label, hover: HOVERS[c.id] })),
    resolved,
    lines,
    visitCount: v?.visitCount ?? 0,
    origin: CONFIG.origin,
    shareToken,
    nudges: [...NUDGES],
    lateChairAfterMs: resolved.lateChairAfterMs,
    noticeText: noticeFor(dwellMs),
    artifact,
    facts,
    secondHalf,
    sting,
  });
}

function titleFor(sceneId: string, r: ReturnType<typeof resolveRoom>): string {
  switch (sceneId) {
    case 'seated': return 'You are seated.';
    case 'standing': return 'You remain standing.';
    case 'notice': return 'The notice.';
    case 'corridor': return 'A corridor.';
    case 'ledger': return 'The ledger.';
    case 'recital': return 'The recital.';
    case 'inventory': return 'What the room has.';
    case 'dark': return 'The lights go out.';
    case 'threshold': return 'The threshold.';
    case 'counting': return r.anomaly.line;
    case 'button': return 'Ah.';
    default: return 'The room.';
  }
}

/* ---------------- server ---------------- */

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (path === '/health') {
      return json(res, {
        ok: true, tick: currentTick(),
        voice: imagineStatus,            // 'on' | 'off-by-flag' | 'unreachable'
        imagineUrl: CONFIG.imagine ? CONFIG.imagineUrl : null,
      });
    }

    /* ---- SSE: the room keeps talking ---- */
    if (path === '/bff/stream') {
      const ctx = await resolveCtx(req);
      const s = (await repo.getSession(ctx.sessionId))!;
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      openStreams++;
      let last = currentTick();
      // Everything spoken before this connection opened is already on the
      // page from the server render; only send what happens from here.
      let sentVoiceSeq = voiceSeq;
      let busy = false;

      const timer = setInterval(() => {
        if (busy) return;
        busy = true;
        try {
          // 1. HUMAN LINES FIRST, and on every pass — not on tick boundaries.
          //    Someone speaking should show up within a second, not whenever
          //    the room's clock next happens to turn over.
          for (const u of liveVoices) {
            if (u.seq <= sentVoiceSeq) continue;
            sentVoiceSeq = u.seq;
            res.write(`data: ${JSON.stringify({
              lineId: u.utteranceId, tick: u.tick, handle: u.handle,
              kind: 'ambient', text: u.text, diverged: false,
            })}\n\n`);
          }

          // 2. the room's own voices, still on the clock
          const t = currentTick();
          if (t !== last) {
            last = t;
            for (const o of roomLines(t, s.seed)) {
              res.write(`data: ${JSON.stringify(o)}\n\n`);
            }
          }
        } catch { /* a dropped tick is never fatal */ }
        finally { busy = false; }
      }, 900);
      req.on('close', () => { clearInterval(timer); openStreams = Math.max(0, openStreams - 1); });
      return;
    }

    /* ---- intent routes ---- */
    if (path === '/bff/choose' && req.method === 'POST') {
      const ctx = await resolveCtx(req);
      const { choiceId } = await body(req);
      const s = (await repo.getSession(ctx.sessionId))!;
      const scene = sceneById(s.currentSceneId)!;
      const choice = scene.choices.find((c) => c.id === choiceId);
      if (!choice) return json(res, { error: 'no such choice' }, 400);

      await repo.appendExperienceEvent(ctx.sessionId, 'choice', {
        choiceId: choice.id, label: choice.label, from: scene.id, to: choice.next,
      });

      /*
       * The button can be pressed two ways — the big button calls /bff/press,
       * but the choice list underneath it says "Press it" too. Only the first
       * recorded a press event, so a visitor who used the menu was told later
       * that they "left the button alone" while their own path said otherwise.
       * The second half quotes both of those back at you, so the contradiction
       * was guaranteed to be seen.
       */
      if (choice.id === 'press' && scene.id === 'button') {
        const already = (await repo.eventsFor(ctx.sessionId)).some((e) => e.kind === 'press');
        if (!already) await repo.appendExperienceEvent(ctx.sessionId, 'press', { via: 'menu' });
      }
      await repo.advanceScene(ctx.sessionId, choice.next);
      res.setHeader('set-cookie', ctx.setCookies);
      return json(res, { ok: true, sceneId: choice.next });
    }

    /* ---- the only thing we ever ask for ---- */
    if (path === '/bff/subscribe' && req.method === 'POST') {
      const raw = String((await body(req)).email ?? '').trim();

      /*
       * Validated, not verified. A regex cannot tell you an address is real,
       * so this only rejects what is obviously not an address and lets the
       * rest through — bouncing a legitimate lead to satisfy a clever pattern
       * is the more expensive mistake.
       */
      const ok = raw.length >= 6 && raw.length <= 200 &&
        /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(raw) && !/[\r\n,;<>]/.test(raw);
      if (!ok) return json(res, { ok: false, message: 'That is not an address the room can reach.' }, 400);

      try {
        await repo.addSubscriber(raw);
      } catch (err) {
        /*
         * The visitor still never sees a plumbing error — but this MUST be
         * logged. The first version swallowed it silently and the endpoint
         * cheerfully returned ok:true while storing nothing at all, which is
         * the worst possible failure for the one thing the business depends
         * on: a signup form that looks like it works and drops every lead.
         */
        console.error('[subscribe] FAILED TO STORE', (err as Error).message);
      }
      // Same reply whether or not they were already on the list — otherwise
      // the form becomes a way to test whether an address is subscribed.
      return json(res, { ok: true, message: 'Thank you. You will hear from the room.' });
    }

    /* ---- you commit to a number ---- */
    if (path === '/bff/count' && req.method === 'POST') {
      const ctx = await resolveCtx(req);
      const s2 = (await repo.getSession(ctx.sessionId))!;
      const resolved2 = resolveRoom(s2.seed, Number(s2.replayIndex ?? 0));

      const raw = Number((await body(req)).guess);
      if (!Number.isInteger(raw) || raw < GUESS_MIN || raw > GUESS_MAX) {
        return json(res, { error: 'The room cannot hold a number like that.' }, 400);
      }

      // What was ACTUALLY on screen when they committed. The late chair is one
      // OF the total, held back — so the honest "visible" count is total-1.
      const visible = Math.max(1, resolved2.chairCount - 1);
      const { verdict, line } = verdictFor(
        s2.seed, raw, visible, resolved2.chairCount, resolved2.claimedChairCount,
      );

      await repo.appendExperienceEvent(ctx.sessionId, 'counted', {
        guess: raw, visibleAtGuess: visible,
        drawn: resolved2.chairCount, claimed: resolved2.claimedChairCount, verdict,
      });

      return json(res, {
        ok: true, guess: raw, verdict, line,
        finalCount: resolved2.chairCount,
        difference: Math.abs(raw - resolved2.chairCount),
      });
    }

    if (path === '/bff/dwell' && req.method === 'POST') {
      const ctx = await resolveCtx(req);
      const { dwellMs } = await body(req);
      const ms = Number(dwellMs) || 0;
      if (ms % 6000 === 0 && ms > 0) {
        await repo.appendExperienceEvent(ctx.sessionId, 'dwell', { dwellMs: ms });
      }
      return json(res, { text: noticeFor(ms) });
    }

    /* ---- the impossible interaction ---- */
    if (path === '/bff/press' && req.method === 'POST') {
      const ctx = await resolveCtx(req);
      const s = (await repo.getSession(ctx.sessionId))!;
      const v = await repo.getVisitor(ctx.visitorId);
      const r = resolveRoom(s.seed, v?.visitCount ?? 0);
      // It is recorded, truthfully, as a press. The room simply declines to agree.
      await repo.appendExperienceEvent(ctx.sessionId, 'press', { pressed: true });
      return json(res, {
        message: r.nonPress,
        notPressedCount: r.notPressedCount + 1,   // goes UP. that is the rule.
      });
    }

    if (path === '/bff/state') {
      const ctx = await resolveCtx(req);
      res.setHeader('set-cookie', ctx.setCookies);
      return json(res, await repo.getSessionState(ctx.sessionId));
    }

    if (path === '/bff/replay' && req.method === 'POST') {
      const ctx = await resolveCtx(req);
      const s = await repo.replaySession(ctx.sessionId, INITIAL_SCENE);
      res.setHeader('set-cookie', [...ctx.setCookies, cookie('sm_s', s.sessionId)]);
      return json(res, { ok: true, replayIndex: s.replayIndex });
    }

    /* ---- the room tries to draw ---- */
    if (path === '/bff/drawing') {
      const ctx = await resolveCtx(req);
      const sess = await repo.getSession(ctx.sessionId);
      if (!sess) return json(res, { blank: true, caption: 'There is nobody to draw for.' });

      // Once per session. Asking twice would let a visitor reroll until they
      // got a "good" one, and the whole point is that they get what the room
      // managed on the day.
      let d = drawings.get(ctx.sessionId);
      if (!d) {
        d = CONFIG.imagine
          ? await draw(sess.seed, CONFIG.imagineUrl)
          : { subject: subjectFor(sess.seed), lines: [], caption: 'It was not asked today.', blank: true, ms: 0 };
        drawings.set(ctx.sessionId, d);
        if (drawings.size > 3000) drawings.delete(drawings.keys().next().value!);
        await repo.appendExperienceEvent(ctx.sessionId, 'drawn', {
          subject: d.subject, blank: d.blank, lines: d.lines.length, ms: d.ms,
        });
      }
      return json(res, d);
    }

    /* ---- the back room ---- */
    if (path === '/admin') {
      // With no token configured this path does not exist. Not 401, not
      // "disabled" — a scanner must not be able to learn the panel is here.
      if (!adminEnabled()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end('not here. or not yet.');
      }
      const given = url.searchParams.get('k')
        ?? readCookies(req).sm_admin
        ?? (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');

      if (!tokenOk(given)) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end('not here. or not yet.');
      }

      const stats = await gather(repo, openStreams);
      const html = renderAdmin(stats, {
        SHOCKME_IMAGINE: String(CONFIG.imagine),
        SHOCKME_CHAT: String(CONFIG.chat),
        IMAGINE_URL: CONFIG.imagineUrl,
        NEDB_URL: CONFIG.nedbUrl,
        NEDB_DB: CONFIG.nedbDb,
        SHOCKME_ORIGIN: CONFIG.origin,
        SHOCKME_WORLD_SEED: CONFIG.worldSeed,
        SHOCKME_BLOCKLIST: process.env.SHOCKME_BLOCKLIST ? 'set' : '(built-in only)',
        voice: imagineStatus,
        node: process.version,
        uptime: `${Math.round(process.uptime() / 60)}m`,
        rss: `${Math.round(process.memoryUsage().rss / 1e6)}MB`,
      });
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        // Session cookie so ?k= is only needed once and stops living in
        // browser history and the referrer of every subsequent request.
        'set-cookie': `sm_admin=${encodeURIComponent(given)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=43200`,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      return res.end(html);
    }

    /* ---- speaking into the room ---- */
    if (path === '/bff/say' && req.method === 'POST') {
      if (!CONFIG.chat) return json(res, { ok: false, message: 'The room is not taking words today.' }, 403);
      const ctx = await resolveCtx(req);
      const { text } = await body(req);
      const raw = String(text ?? '').slice(0, MAX_LEN * 2);

      const rate = rateCheck(ctx.sessionId);
      if (!rate.ok) return json(res, { ok: false, message: rate.message });

      const verdict = screen(raw);
      if (!verdict.ok) return json(res, { ok: false, message: decline(verdict.reason) });

      noteSpoke(ctx.sessionId);
      const u: Utterance = {
        utteranceId: `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        sessionId: ctx.sessionId,
        handle: handleFor(ctx.sessionId, HANDLE_STEMS),
        text: raw.replace(/\s+/g, ' ').trim(),
        tick: currentTick(),
        seq: ++voiceSeq,
      };
      liveVoices.push(u);
      while (liveVoices.length > LIVE_KEEP) liveVoices.shift();

      // the record: what was said, by which session, chained to the session
      await repo.appendExperienceEvent(ctx.sessionId, 'said', { text: u.text, handle: u.handle });

      res.setHeader('set-cookie', ctx.setCookies);
      return json(res, { ok: true, handle: u.handle });
    }

    /* ---- the public plane: a record anyone can open ---- */
    if (path.startsWith('/a/')) {
      const token = path.slice(3).replace(/[^a-z0-9]/gi, '');
      const art = token ? await repo.artifactByToken(token) : null;
      if (!art) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('There is no record with that name. There may have been.');
      }
      const cookies = readCookies(req);
      const html = renderArtifact({
        token,
        title: art.title,
        lines: art.lines ?? [],
        closing: art.body,
        historyIntact: art.historyIntact,
        chainLength: art.chainLength,
        origin: CONFIG.origin,
        isOwner: cookies.sm_s === art.sessionId,
      });
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        // Public, identical for everyone, and the growth surface — so unlike
        // the room this one SHOULD sit in a CDN.
        'cache-control': 'public, max-age=300',
      });
      return res.end(html);
    }

    /* ---- the room itself ---- */
    if (path === '/' || path === '/room') {
      const ctx = await resolveCtx(req);
      const html = await renderCurrent(ctx);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'set-cookie': ctx.setCookies,
        'cache-control': 'no-store',
      });
      return res.end(html);
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not here. or not yet.');
  } catch (err) {
    console.error('[bff]', err);
    json(res, { error: String(err) }, 500);
  }
});

/* ---------------- boot ---------------- */

async function main(): Promise<void> {
  await repo.init();
  const wrote = await repo.registerExperience({
    id: DEFINITION.id, version: DEFINITION.version, title: DEFINITION.title,
    invitation: DEFINITION.invitation, contentHash: DEFINITION.contentHash,
  });
  if (CONFIG.imagine) {
    imagineStatus = (await imagine.available()) ? 'on' : 'unreachable';
  }
  server.listen(PORT, () => {
    startPump();
    banner(imagineStatus, [
      `\x1b[2mscenes  \x1b[0m${SCENES.length}   \x1b[2mregistry \x1b[0m${wrote ? 'seeded' : 'already current (idempotent)'}`,
    ]);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
