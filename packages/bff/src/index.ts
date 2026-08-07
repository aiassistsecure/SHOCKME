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
  resolveRoom, noticeFor,
} from '../../engine/src/experiences/waiting-room.ts';
import { renderRoom, renderArtifact } from './render.ts';
import { CONFIG, banner, type ImagineStatus } from './config.ts';
import { Rng } from '../../engine/src/rng.ts';
import { AMBIENT } from '../../engine/src/world.ts';
import { Imagine } from '../../engine/src/imagine.ts';
import { currentTick, inhabitantsAt, observeLine, HANDLE_STEMS, type ObservedLine } from '../../engine/src/world.ts';
import { screen, decline, rateCheck, noteSpoke, handleFor, MAX_LEN, type Utterance } from '../../engine/src/chat.ts';
import { adminEnabled, tokenOk, gather, renderAdmin, ADMIN_TOKEN } from './admin.ts';

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
  end: '',
};

async function renderCurrent(ctx: Ctx, dwellMs = 0): Promise<string> {
  const s = (await repo.getSession(ctx.sessionId))!;
  const v = await repo.getVisitor(ctx.visitorId);
  const scene = sceneById(s.currentSceneId) ?? sceneById(INITIAL_SCENE)!;
  const resolved = resolveRoom(s.seed, v?.visitCount ?? 0);   // seed used HERE, server-side
  const tick = currentTick();
  const state = await repo.getSessionState(ctx.sessionId);

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
        `the room insisted on ${resolved.claimedChairCount} chairs. it drew ${resolved.chairCount}.`,
        `it said: ${resolved.anomaly.line.toLowerCase()}`,
        pressed ? `you pressed the button. the button disagrees.` : `you left the button alone. so did everyone.`,
        `${state?.history.length ?? 0} choices, none of them the same as theirs.`,
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
    choices: scene.choices.map((c) => ({ id: c.id, label: c.label })),
    resolved,
    lines,
    visitCount: v?.visitCount ?? 0,
    origin: CONFIG.origin,
    shareToken,
    noticeText: noticeFor(dwellMs),
    artifact,
  });
}

function titleFor(sceneId: string, r: ReturnType<typeof resolveRoom>): string {
  switch (sceneId) {
    case 'seated': return 'You are seated.';
    case 'standing': return 'You remain standing.';
    case 'notice': return 'The notice.';
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
      await repo.advanceScene(ctx.sessionId, choice.next);
      res.setHeader('set-cookie', ctx.setCookies);
      return json(res, { ok: true, sceneId: choice.next });
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
