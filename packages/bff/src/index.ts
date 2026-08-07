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
import { renderRoom } from './render.ts';
import { CONFIG, banner, type ImagineStatus } from './config.ts';
import { Rng } from '../../engine/src/rng.ts';
import { AMBIENT } from '../../engine/src/world.ts';
import { Imagine } from '../../engine/src/imagine.ts';
import { currentTick, inhabitantsAt, observeLine, type ObservedLine } from '../../engine/src/world.ts';

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
  for (let t = tick - 6; t <= tick; t++) lines.push(...roomLines(t, s.seed, lastChoice));

  let artifact;
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
      let last = currentTick();
      let busy = false;
      const timer = setInterval(async () => {
        const t = currentTick();
        if (t === last || busy) return;
        last = t; busy = true;
        try {
          for (const o of roomLines(t, s.seed)) {
            res.write(`data: ${JSON.stringify(o)}\n\n`);
          }
        } catch { /* the room simply stays quiet this tick */ }
        finally { busy = false; }
      }, 1000);
      req.on('close', () => clearInterval(timer));
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
