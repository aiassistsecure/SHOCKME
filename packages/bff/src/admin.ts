/**
 * SHOCKME · the back room
 *
 * Everything the site knows about how people move through it, read out of
 * NEDB rather than a separate analytics store — because the event log IS the
 * analytics. Every choice, dwell, press and utterance is already an
 * append-only, hash-chained row; this just asks it questions.
 *
 * WHAT IS DELIBERATELY ABSENT: there is no IP, no user agent, no referrer, no
 * device, no location, no fingerprint. Not because it is hard — because the
 * product promises the room is strange from its own world model and never
 * from surveillance, and an admin panel quietly hoarding what the public copy
 * denies would make that promise a lie. Behavioural depth, zero identity.
 *
 * SECURITY POSTURE: with no SHOCKME_ADMIN_TOKEN set, /admin does not respond
 * 401 or "disabled" — it 404s exactly like any other unknown path, so a
 * scanner cannot learn the panel exists.
 */

import { timingSafeEqual } from 'node:crypto';
import type { Repo } from '../../engine/src/repo.ts';
import type { NedbRow } from '../../engine/src/nedb.ts';
import { TICK_MS, currentTick, populationAt } from '../../engine/src/world.ts';

export const ADMIN_TOKEN = process.env.SHOCKME_ADMIN_TOKEN ?? '';
export const adminEnabled = (): boolean => ADMIN_TOKEN.length >= 16;

/** Constant-time compare — a plain `===` leaks the token a character at a time. */
export function tokenOk(given: string): boolean {
  if (!adminEnabled() || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length) return false;      // length is not a secret
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Gathering                                                           */
/* ------------------------------------------------------------------ */

export interface Stats {
  visitors: number;
  returning: number;
  sessions: number;
  replays: number;
  completed: number;
  artifacts: number;
  utterances: number;
  events: number;
  funnel: { scene: string; reached: number; pct: number }[];
  choices: { label: string; n: number }[];
  chairs: { drawn: number; n: number }[];
  dwell: { p50: number; p90: number; max: number };
  pressed: number;
  refused: number;
  said: { text: string; handle: string; tick: number; sessionId: string }[];
  engine: { ok: boolean; seq: number; objects: number; tampered: number };
  live: { tick: number; population: number; connections: number };
  spokenPerSession: number;
  drawings: { total: number; blank: number; avgMs: number; subjects: { subject: string; n: number }[] };
  /** Opt-in only, and deliberately NOT joined to behaviour. Address + when. */
  subs: { email: string; tick: number }[];
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[i]!;
}

/**
 * One pass over the log. Everything below is derived, never separately
 * tracked — so the numbers cannot drift away from what actually happened.
 */
export async function gather(repo: Repo, connections: number): Promise<Stats> {
  const [visitors, sessions, events, artifacts, verify, subs] = await Promise.all([
    repo.db.rows('FROM visitors'),
    repo.db.rows('FROM sessions'),
    repo.db.rows('FROM events ORDER BY tick'),
    repo.db.rows('FROM artifacts'),
    repo.db.verify(),
    repo.subscribers(),
  ]);

  const evOf = (kind: string) => events.filter((e) => e.kind === kind);

  // funnel: how far each session actually got
  const reachedBy = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.kind !== 'choice') continue;
    const to = String((e.payload as Record<string, unknown>)?.to ?? '');
    if (!to) continue;
    if (!reachedBy.has(to)) reachedBy.set(to, new Set());
    reachedBy.get(to)!.add(String(e.sessionId));
  }
  const ORDER = ['arrival', 'seated', 'standing', 'notice', 'counting', 'button', 'end'];
  const started = sessions.length;
  const funnel = ORDER.map((scene) => {
    const reached = scene === 'arrival' ? started : (reachedBy.get(scene)?.size ?? 0);
    return { scene, reached, pct: pct(reached, started) };
  });

  // which branches people take
  const choiceTally = new Map<string, number>();
  for (const e of evOf('choice')) {
    const label = String((e.payload as Record<string, unknown>)?.label ?? '?');
    choiceTally.set(label, (choiceTally.get(label) ?? 0) + 1);
  }

  // dwell — the only engagement signal that is not a click
  const dwells = evOf('dwell')
    .map((e) => Number((e.payload as Record<string, unknown>)?.dwellMs ?? 0))
    .sort((a, b) => a - b);

  // how many chairs the room actually drew, per completed session
  const chairTally = new Map<number, number>();
  for (const a of artifacts) {
    const line = (a.lines as string[] | undefined)?.[1] ?? '';
    const m = /it drew (\d+)/.exec(line);
    if (m) {
      const n = Number(m[1]);
      chairTally.set(n, (chairTally.get(n) ?? 0) + 1);
    }
  }

  const said = evOf('said').slice(-60).reverse().map((e) => ({
    text: String((e.payload as Record<string, unknown>)?.text ?? ''),
    handle: String((e.payload as Record<string, unknown>)?.handle ?? ''),
    tick: Number(e.tick ?? 0),
    sessionId: String(e.sessionId ?? ''),
  }));

  const realArtifacts = artifacts.filter((a) => !String((a as NedbRow)._id ?? '').startsWith('token:'));

  return {
    visitors: visitors.length,
    returning: visitors.filter((v) => Number(v.visitCount ?? 0) > 0).length,
    sessions: sessions.length,
    replays: sessions.filter((s) => Number(s.replayIndex ?? 0) > 0).length,
    completed: reachedBy.get('end')?.size ?? 0,
    artifacts: realArtifacts.length,
    utterances: evOf('said').length,
    events: events.length,
    funnel,
    choices: [...choiceTally.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
    chairs: [...chairTally.entries()].map(([drawn, n]) => ({ drawn, n })).sort((a, b) => a.drawn - b.drawn),
    dwell: { p50: quantile(dwells, 0.5), p90: quantile(dwells, 0.9), max: dwells.at(-1) ?? 0 },
    pressed: evOf('press').length,
    refused: (choiceTally.get('Refuse') ?? 0),
    said,
    engine: {
      ok: verify.ok,
      seq: verify.seq,
      objects: verify.objects_checked,
      tampered: verify.tampered?.length ?? 0,
    },
    live: { tick: currentTick(), population: populationAt(currentTick()), connections },
    subs: subs.slice(-100).reverse(),
    spokenPerSession: sessions.length ? Math.round((evOf('said').length / sessions.length) * 100) / 100 : 0,
    drawings: (() => {
      const d = evOf('drawn');
      const subj = new Map<string, number>();
      let ms = 0, blank = 0;
      for (const e of d) {
        const p = e.payload as Record<string, unknown>;
        const key = String(p?.subject ?? '?');
        subj.set(key, (subj.get(key) ?? 0) + 1);
        ms += Number(p?.ms ?? 0);
        if (p?.blank) blank++;
      }
      return {
        total: d.length, blank,
        avgMs: d.length ? Math.round(ms / d.length) : 0,
        subjects: [...subj.entries()].map(([subject, n]) => ({ subject, n })).sort((a, b) => b.n - a.n),
      };
    })(),
  };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ago = (tick: number): string => {
  const s = Math.max(0, (currentTick() - tick) * (TICK_MS / 1000));
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};

function bar(p: number): string {
  const w = Math.max(0, Math.min(100, p));
  return `<div class="bar"><div class="fill" style="width:${w}%"></div></div>`;
}

export function renderAdmin(s: Stats, env: Record<string, string>): string {
  const row = (k: string, v: string | number, note = '') =>
    `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(String(v))}</span>${note ? `<span class="n">${esc(note)}</span>` : ''}</div>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>the back room</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=VT323&display=swap" rel="stylesheet">
<style>
:root{--p:#ffb347;--pd:#8a5d24;--ph:#ffd9a0;--bg:#0a0806;--line:#2a2318;--bad:#ff4d3d;--good:#8fd14f}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--p);font:14px/1.5 "IBM Plex Mono",monospace;padding:2rem 1.2rem 5rem}
.wrap{max-width:1100px;margin:0 auto}
h1{font-family:"VT323",monospace;font-size:2.6rem;color:var(--ph);font-weight:400;line-height:1;margin-bottom:.2rem}
.sub{color:var(--pd);font-size:.78rem;margin-bottom:2rem;letter-spacing:.04em}
h2{font-size:.7rem;letter-spacing:.28em;text-transform:uppercase;color:var(--pd);
   font-weight:500;margin:2.2rem 0 .9rem;padding-bottom:.4rem;border-bottom:1px solid var(--line)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.8rem}
.card{border:1px solid var(--line);padding:.9rem 1rem}
.card .big{font-family:"VT323",monospace;font-size:2.4rem;line-height:1;color:var(--ph)}
.card .lbl{font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:var(--pd);margin-top:.3rem}
.kv{display:flex;gap:.8rem;align-items:baseline;padding:.35rem 0;border-bottom:1px solid rgba(42,35,24,.5)}
.k{min-width:190px;color:var(--pd);font-size:.8rem}
.v{color:var(--ph);font-variant-numeric:tabular-nums}
.n{color:var(--pd);font-size:.72rem}
.bar{height:6px;background:rgba(255,179,71,.1);flex:1;min-width:90px}
.fill{height:100%;background:var(--p)}
table{width:100%;border-collapse:collapse;font-size:.82rem}
td,th{text-align:left;padding:.45rem .6rem;border-bottom:1px solid rgba(42,35,24,.6);vertical-align:top}
th{color:var(--pd);font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;font-weight:500}
td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--ph)}
.said{color:var(--ph)}
.sid{color:var(--pd);font-size:.7rem}
.ok{color:var(--good)}.bad{color:var(--bad)}
.note{color:var(--pd);font-size:.75rem;line-height:1.6;border-left:2px solid var(--line);padding-left:.9rem;margin-top:.8rem}
.flex{display:flex;gap:.7rem;align-items:center}
@media(max-width:640px){.k{min-width:120px}body{padding:1.2rem .8rem 4rem}}
</style></head><body><div class="wrap">

<h1>the back room</h1>
<div class="sub">tick ${s.live.tick} · ${s.live.population} in the room · ${s.live.connections} streams open · refreshes every 15s</div>

<div class="grid">
  <div class="card"><div class="big">${s.visitors}</div><div class="lbl">visitors</div></div>
  <div class="card"><div class="big">${s.sessions}</div><div class="lbl">sessions</div></div>
  <div class="card"><div class="big">${s.completed}</div><div class="lbl">finished</div></div>
  <div class="card"><div class="big">${pct(s.completed, s.sessions)}%</div><div class="lbl">completion</div></div>
  <div class="card"><div class="big">${s.utterances}</div><div class="lbl">spoken</div></div>
  <div class="card"><div class="big">${s.replays}</div><div class="lbl">replays</div></div>
</div>

<h2>Funnel</h2>
<table>
<tr><th>scene</th><th>sessions</th><th></th><th class="num">%</th></tr>
${s.funnel.map((f) => `<tr><td>${esc(f.scene)}</td><td class="num">${f.reached}</td><td>${bar(f.pct)}</td><td class="num">${f.pct}%</td></tr>`).join('')}
</table>
<div class="note">Drop-off between <b>arrival</b> and the next row is the only
number that matters early — it is the share of people who opened the room and
did not touch anything.</div>

<h2>Branches taken</h2>
<table>
<tr><th>choice</th><th class="num">n</th><th></th></tr>
${s.choices.length ? s.choices.map((c) => `<tr><td>${esc(c.label)}</td><td class="num">${c.n}</td><td>${bar(pct(c.n, s.choices[0]!.n))}</td></tr>`).join('')
  : '<tr><td colspan="3" class="sid">nobody has chosen anything yet</td></tr>'}
</table>

<h2>The impossible button</h2>
${row('pressed it', s.pressed)}
${row('refused', s.refused)}
${row('press rate', `${pct(s.pressed, s.pressed + s.refused)}%`, 'of those who reached it')}
<div class="note">Everyone who presses is told they did not. If press rate is
very high, the joke is landing. If it is very low, the copy is scaring people
off a harmless button.</div>

<h2>Attention</h2>
${row('dwell p50', `${(s.dwell.p50 / 1000).toFixed(1)}s`, 'median time on the notice')}
${row('dwell p90', `${(s.dwell.p90 / 1000).toFixed(1)}s`)}
${row('dwell max', `${(s.dwell.max / 1000).toFixed(1)}s`, 'the most patient visitor')}
${row('spoken per session', s.spokenPerSession)}
${row('returning visitors', s.returning, 'came back with their cookie')}

<h2>What the room drew</h2>
<table>
<tr><th>chairs drawn</th><th class="num">sessions</th><th></th></tr>
${s.chairs.length ? s.chairs.map((c) => `<tr><td>${c.drawn}${c.drawn === 4 ? ' <span class="sid">(matches the claim)</span>' : ''}</td><td class="num">${c.n}</td><td>${bar(pct(c.n, Math.max(...s.chairs.map((x) => x.n))))}</td></tr>`).join('')
  : '<tr><td colspan="3" class="sid">no artifacts yet</td></tr>'}
</table>
<div class="note">The room always claims four. Rows other than 4 are visitors
who were told something demonstrably false — that is the product working.</div>

<h2>Everything said, newest first</h2>
<table>
<tr><th>when</th><th>as</th><th>said</th><th>session</th></tr>
${s.said.length ? s.said.map((u) => `<tr><td class="sid">${esc(ago(u.tick))}</td><td class="sid">${esc(u.handle)}</td><td class="said">${esc(u.text)}</td><td class="sid">${esc(u.sessionId.slice(0, 10))}</td></tr>`).join('')
  : '<tr><td colspan="4" class="sid">nobody has spoken yet</td></tr>'}
</table>
<div class="note">This is the moderation view. Everything here already passed
screening; anything that should not have is a gap in the blocklist — add it to
<b>SHOCKME_BLOCKLIST</b> and restart.</div>

<h2>The list</h2>
${row('subscribers', s.subs.length)}
${row('of finishers', `${pct(s.subs.length, s.completed)}%`, 'the only conversion number that matters')}
<table>
<tr><th>address</th><th class="num">when</th></tr>
${s.subs.length ? s.subs.map((u) => `<tr><td>${esc(u.email)}</td><td class="num sid">${esc(ago(u.tick))}</td></tr>`).join('')
  : '<tr><td colspan="2" class="sid">nobody has subscribed yet</td></tr>'}
</table>
<div class="note">This is the ONLY personally identifying data the product
holds, it is opt-in, and it is deliberately <b>not joined to behaviour</b> —
the subscribers collection stores an address and a timestamp, nothing else.
Linking a lead to the rooms they walked through would be trivial and is
exactly the quiet linkage the rest of this system refuses to do.</div>

<h2>The room's drawings</h2>
${row('attempts', s.drawings.total)}
${row('produced nothing', `${s.drawings.blank}`, `${pct(s.drawings.blank, s.drawings.total)}% — the strongest outcome`)}
${row('average time', `${(s.drawings.avgMs / 1000).toFixed(1)}s`, 'you watch it struggle; that is the bit')}
<table>
<tr><th>asked to draw</th><th class="num">n</th></tr>
${s.drawings.subjects.length ? s.drawings.subjects.map((d) => `<tr><td>${esc(d.subject)}</td><td class="num">${d.n}</td></tr>`).join('')
  : '<tr><td colspan="2" class="sid">it has not been asked yet</td></tr>'}
</table>
<div class="note">A blank is not an error. Asked to draw itself, or the sound
a lamp makes, the room producing <b>nothing</b> is the best output available —
so blanks are counted as successes, never retried, and never repaired.</div>

<h2>Engine</h2>
${row('verify', s.engine.ok ? 'intact' : 'FAILED', s.engine.ok ? 'hash chain unbroken' : 'investigate immediately')}
${row('tampered objects', s.engine.tampered)}
${row('objects', s.engine.objects)}
${row('seq', s.engine.seq)}
${row('events logged', s.events)}
${row('artifacts minted', s.artifacts)}

<h2>Environment</h2>
${Object.entries(env).map(([k, v]) => row(k, v)).join('')}

<div class="note" style="margin-top:2.5rem">
<b>No identity is collected.</b> No IP, user agent, referrer, device, location
or fingerprint appears above, and none is stored — the site promises publicly
that its strangeness comes from its own world model rather than from watching
you, and a back room quietly hoarding what the front page denies would make
that a lie. Everything here is derived from the append-only event log, so the
numbers cannot drift from what actually happened.
</div>

</div>
<script>setTimeout(() => location.reload(), 15000);</script>
</body></html>`;
}
