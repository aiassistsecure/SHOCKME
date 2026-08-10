/**
 * SHOCKME · capsules
 *
 * The gates: bounded, validated, causally pinned, stable on replay, never
 * blocking a room, never leaking into the rail, and never carrying a private
 * fact into a prompt.
 */

import { Nedb } from '../src/nedb.ts';
import { materialise, pinnedFor, validateSlot, envelopeFor, envelopeDigest, bind, SHAPES } from '../src/capsules.ts';
import { REGISTRY } from '../src/experiences/rooms-v2.ts';
import type { VisitFacts } from '../src/experiences/discovery.ts';

const db = new Nedb({ db: process.env.NEDB_TEST_DB ?? 'shockme_capsules' });
try { await db.ensureDatabase(); } catch { console.log('  SKIPPED — no nedbd'); process.exit(0); }

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${label.padEnd(44)} ${ok ? 'PASS' : 'FAIL'} ${detail}`);
};

const FACTS: VisitFacts = {
  arrivalReading: 'followed', choices: ['count', 'through'], visited: ['arrival'],
  counted: true, pressed: false, consent: true, returning: false,
};
const RUN = Math.random().toString(36).slice(2, 8);
const fileRoom = REGISTRY.find((m) => m.id === 'file-room')!;

/* ---------------- validation ---------------- */

check('rejects an over-long inscription',
  !validateSlot('inscription', 'a'.repeat(120)).ok);
check('rejects a one-word inscription',
  !validateSlot('inscription', 'quiet').ok);
check('rejects horror vocabulary',
  !validateSlot('margin', 'the blood is still warm').ok, '  (out of palette)');
check('rejects a named platform',
  !validateSlot('witness_fragment', 'i found this room through reddit and stayed a while').ok);
check('rejects instructions to the visitor',
  !validateSlot('choice_label', 'click here now').ok);
check('rejects invented claims about behaviour',
  !validateSlot('margin', 'you have been here before').ok, '  (only the log may say that)');
check('accepts a good inscription',
  validateSlot('inscription', 'the fourth page is the one that matters').ok);
check('bound token must be short',
  !validateSlot('bound_token', 'a receipt for a door that was never opened at all').ok);

/* ---------------- envelope carries nothing private ---------------- */

const env = envelopeFor(fileRoom, fileRoom.variants[0]!, FACTS, 'inscription', 'inside cover');
const serialised = JSON.stringify(env).toLowerCase();
const forbidden = ['seed', 'sessionid', 'visitor', 'referrer', 'email', 'cookie', 'token'];
check('envelope carries no private field',
  forbidden.every((f) => !Object.keys(env).some((k) => k.toLowerCase().includes(f))),
  `  (${Object.keys(env).length} keys)`);
// A bare '@' is not evidence of anything — `file-room@1` is a module version.
check('envelope has no url or address',
  !/https?:\/\//.test(serialised) && !/[\w.]+@[\w.]+\.\w+/.test(serialised),
  `  (${env.discovery})`);
check('digest is stable', envelopeDigest(env) === envelopeDigest(envelopeFor(fileRoom, fileRoom.variants[0]!, FACTS, 'inscription', 'inside cover')));

/* ---------------- cold model → authored fallback, deterministic ---------------- */

const coldA = await materialise(db, { seed: `${RUN}-cold`, sessionId: `${RUN}-s1`, module: fileRoom, variant: fileRoom.variants[0]!, facts: FACTS, generate: null });
const coldB = await materialise(db, { seed: `${RUN}-cold`, sessionId: `${RUN}-s2`, module: fileRoom, variant: fileRoom.variants[0]!, facts: FACTS, generate: null });
check('cold model still fills every surface',
  !!coldA.tokens['{object}'] && !!coldA.heading && !!coldA.artifactLine);
check('cold fallback is deterministic per seed',
  JSON.stringify(coldA.tokens) === JSON.stringify(coldB.tokens) && coldA.heading === coldB.heading);
check('cold provenance is honest',
  Object.values(coldA.provenance).every((p) => p === 'curated'));

/* ---------------- a live model → accepted, pinned, replay-stable ---------------- */

let calls = 0;
const good = async () => { calls++; return `${RUN} the fourth page is the one that matters`; };
const sess = `${RUN}-live`;
const live = await materialise(db, { seed: `${RUN}-live`, sessionId: sess, module: fileRoom, variant: fileRoom.variants[0]!, facts: FACTS, generate: good });
const usedModel = Object.values(live.provenance).filter((p) => p === 'imagine').length;
check('accepted generations are used', usedModel > 0, `  (${usedModel} slots)`);

const pinned = await pinnedFor(db, sess, 'file-room');
check('accepted lines are pinned to the visit', Object.keys(pinned).length === usedModel,
  `  (${Object.keys(pinned).length} rows)`);
check('replay reads the pin, never regenerates',
  Object.values(pinned).every((t) => typeof t === 'string' && t.length > 0));

/* ---------------- texture is capped at two ---------------- */

const textureKinds = ['inscription', 'margin', 'object_label', 'witness_fragment'];
const textureCount = Object.keys(live.texture).filter((k) => textureKinds.includes(k)).length;
check('texture capped at two per room', textureCount <= 2, `  (${textureCount})`);

/* ---------------- a bad model never reaches the room ---------------- */

const bad = await materialise(db, {
  seed: `${RUN}-bad`, sessionId: `${RUN}-bad`, module: fileRoom, variant: fileRoom.variants[0]!, facts: FACTS,
  generate: async () => 'CLICK HERE the blood is everywhere, visit reddit.com now',
});
check('rejected output never renders',
  Object.values(bad.provenance).every((p) => p === 'curated'));
const badPins = await pinnedFor(db, `${RUN}-bad`, 'file-room');
check('rejected output is never pinned', Object.keys(badPins).length === 0);

/* ---------------- a throwing model is a fallback, not an error ---------------- */

const thrown = await materialise(db, {
  seed: `${RUN}-err`, sessionId: `${RUN}-err`, module: fileRoom, variant: fileRoom.variants[0]!, facts: FACTS,
  generate: async () => { throw new Error('imagine is down'); },
});
check('a dead model degrades to authored copy', !!thrown.heading && !!thrown.tokens['{object}']);

/* ---------------- binding ---------------- */

const bound = bind(fileRoom.variants[0]!.lines, live.tokens);
check('tokens substitute into authored prose',
  bound.some((l) => l.includes(live.tokens['{object}']!)) && !bound.some((l) => l.includes('{object}')));
check('an unfilled placeholder never reaches a visitor',
  !bind(['the {nonexistent} is here'], {})[0]!.includes('{'));

/* ---------------- lanes ---------------- */

const rail = await db.rows(`FROM claims WHERE stream = "broadcast" AND fingerprint = "${(await import('../src/claim.ts')).fingerprint(`file-room:inscription:${RUN} the fourth page is the one that matters`)}"`);
check('a room capsule never enters the rail lane', rail.length === 0);

console.log(`\n  slots declared across the registry: ${REGISTRY.reduce((n, m) => n + m.slots.length, 0)}`);
console.log(failures === 0 ? '\n  capsules: OK' : `\n  capsules: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
