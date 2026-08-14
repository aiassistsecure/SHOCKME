/**
 * SHOCKME · the imagine transport seam
 *
 * Two transports now write the room — local llama.cpp and AiAS → PIN → Muse —
 * and this asserts the properties that make swapping them safe. It never
 * touches the network: the transports are stubs, because what needs protecting
 * is the SEAM, and a test that needs a gateway key is a test nobody runs.
 *
 * What the live route actually does was established empirically and is
 * recorded in imagine-aias.ts; measured figures do not belong in an assertion.
 */

import { Imagine, LlamaCppTransport, promptFor, transportFromEnv, validateLine, TOPICS, type PromptParts, type Transport } from '../src/imagine.ts';
import { AiasTransport } from '../src/imagine-aias.ts';

let fail = 0;
const bad = (m: string) => { console.error(`  FAIL ${m}`); fail++; };

/* ---------- one prompt, shared ---------- */

const parts = promptFor('how many chairs there are');
if (!parts.system.includes('<<<LINE>>>')) bad('system prompt lost the sentinel format');
if (parts.user !== 'how many chairs there are') bad('topic is not the user turn');
if (parts.prefill !== '<<<LINE>>>') bad('prefill is not the opening sentinel');

/*
 * The prefill is the whole reason ONE parser serves both transports: the model
 * never writes the opening delimiter, so it cannot write it wrong. If a future
 * transport stops prefilling, normaliseSentinel's contract changes with it.
 */

/* ---------- backward compatibility ---------- */

/*
 * THE LOAD-BEARING COMPAT CHECK. Every existing call site constructs
 * `new Imagine(url, enabled)` with a STRING. That must keep resolving to the
 * local transport, because the default has to be "behaves exactly as it did
 * before" — a box that pulls this change and restarts must not silently start
 * calling a paid gateway.
 */
const legacy = new Imagine('http://127.0.0.1:9999', true);
if (legacy.transport.id !== 'llamacpp') bad(`string ctor must give llamacpp, got ${legacy.transport.id}`);
if (legacy.url !== 'http://127.0.0.1:9999') bad('string ctor lost the url');
if (legacy.latency !== 'fast') bad('local transport must be fast');

const envDefault = transportFromEnv();
if (envDefault.id !== 'llamacpp') bad(`default env transport must be llamacpp, got ${envDefault.id}`);

for (const v of ['aias', 'pin', 'muse', 'AIAS']) {
  process.env.SHOCKME_IMAGINE_PROVIDER = v;
  if (transportFromEnv().id !== 'aias') bad(`SHOCKME_IMAGINE_PROVIDER=${v} should select aias`);
}
delete process.env.SHOCKME_IMAGINE_PROVIDER;

/* ---------- the slow route declares itself slow ---------- */

const aias = new AiasTransport({ key: 'test-key-not-used' });
if (aias.latency !== 'slow') bad('aias must declare latency slow — the pump reads this to widen its lookahead');
if (aias.timeoutMs <= 20_000) {
  bad('aias timeout must exceed the local 20s: a slow gateway response would otherwise abort and mark the whole route dead');
}
if (!aias.build.includes('muse-local') || !aias.build.includes('pin')) {
  bad(`aias build should name provider and model, got ${aias.build}`);
}

/** No key means unavailable, and unavailable means corpus — never a throw. */
const noKey = new AiasTransport({ key: '' });
if (await noKey.available()) bad('no api key must report unavailable');

/* ---------- disabled means disabled ---------- */

let touched = false;
const spy: Transport = {
  id: 'spy', build: 'spy', latency: 'fast', timeoutMs: 1,
  available: async () => { touched = true; return true; },
  complete: async () => { touched = true; return '<<<LINE>>>should never happen<<<END>>>'; },
  reset: () => {},
};
const off = new Imagine(spy, false);
const offLine = await off.line(1, 'b1');
if (touched) bad('SHOCKME_IMAGINE=false must never touch the transport');
if (offLine.source !== 'corpus') bad('disabled must yield corpus');

/* ---------- a transport failure degrades, never throws ---------- */

let resets = 0;
const broken: Transport = {
  id: 'broken', build: 'broken', latency: 'slow', timeoutMs: 1,
  available: async () => true,
  complete: async () => { throw new Error('gateway on fire'); },
  reset: () => { resets++; },
};
const b = await new Imagine(broken, true).line(2, 'b2');
if (b.source !== 'corpus') bad('a throwing transport must fall back to corpus');
if (!validateLine(b.text).ok) bad('the corpus fallback must itself be a valid line');
if (resets === 0) bad('a transport error must reset health so the route is re-probed');
if (!b.rejected.some((r) => r.includes('gateway on fire'))) bad('the real error must reach diagnostics');

/* ---------- topic echo is rejected ---------- */

/*
 * MEASURED ON THE LIVE MUSE ROUTE, roughly one call in six: asked for a line
 * about "two options that both seemed to work", it returns exactly that
 * string. It is lowercase, seven words, no banned term — validateLine passes
 * it, because the topics are written in the room's own register, which is what
 * makes the echo both plausible and worthless.
 */
const echoOf = (t: string): Transport => ({
  id: 'echo', build: 'echo', latency: 'fast', timeoutMs: 1,
  available: async () => true,
  complete: async (p: PromptParts) => `${p.user}<<<END>>>`,
  reset: () => {},
});

for (const topic of TOPICS) {
  const r = await new Imagine(echoOf(topic), true).line(3, 'b3');
  if (r.source === 'imagine') {
    bad(`topic echo shipped as a generated line: ${JSON.stringify(r.text)}`);
    break;
  }
}
const oneEcho = await new Imagine(echoOf(''), true).line(3, 'b3');
if (!oneEcho.rejected.some((r) => r.startsWith('topic echo'))) {
  bad('a topic echo must be recorded as such in diagnostics, not silently dropped');
}

/* ---------- provenance ---------- */

const good: Transport = {
  id: 'stub', build: 'stub/v1', latency: 'fast', timeoutMs: 1,
  available: async () => true,
  complete: async () => 'the chairs are not where i left them<<<END>>>',
  reset: () => {},
};
const g = await new Imagine(good, true).line(4, 'b4');
if (g.source !== 'imagine') bad(`a valid stub line should be admitted, got ${g.source}: ${g.rejected.join('|')}`);
if (g.transport !== 'stub') bad('the line must record which transport produced it');
if (g.build !== 'stub/v1') bad('build must come from the transport, not a module constant');

if (fail) { console.error(`transport — FAIL (${fail})`); process.exit(1); }
console.log('transport — PASS seam, compat, degradation, topic echo, provenance');
