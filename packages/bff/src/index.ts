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
import { currentTick, chatAt, observeLine, observeWindow } from '../../engine/src/world.ts';
import {
  DEFINITION, EXPERIENCE_ID, INITIAL_SCENE, SCENES, sceneById,
  resolveRoom, noticeFor,
} from '../../engine/src/experiences/waiting-room.ts';
import { renderRoom } from './render.ts';

const PORT = Number(process.env.PORT ?? 3400);
const repo = new Repo(new Nedb());

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

  const lines = observeWindow(tick - 12, tick, s.seed, {
    lastChoice: state?.history.at(-1)?.toLowerCase(),
  });

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
    if (path === '/health') return json(res, { ok: true, tick: currentTick() });

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
      const timer = setInterval(() => {
        const t = currentTick();
        if (t === last) return;
        last = t;
        for (const line of chatAt(t)) {
          const o = observeLine(line, s.seed);
          res.write(`data: ${JSON.stringify(o)}\n\n`);
        }
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
  console.log(`  experience registry: ${wrote ? 'wrote waiting-room' : 'already current (idempotent)'}`);
  console.log(`  scenes: ${SCENES.length}   tick: ${currentTick()}`);
  server.listen(PORT, () => {
    console.log(`\n  SHOCKME · the waiting room`);
    console.log(`  http://127.0.0.1:${PORT}\n`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
