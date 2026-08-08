/**
 * EVERY ANIMATION A RULE REFERENCES MUST EXIST.
 *
 * `fadeup` was referenced by five rules and defined by none. Because each of
 * those rules pairs it with opacity:0, and an undefined animation silently
 * does not run, the whole second half rendered blank — correct numbers drawn
 * into invisible tables, with choices offered in response to nothing.
 *
 * CSS fails silently here: no console error, no exception, no failing render.
 * The only way to catch it is to check the stylesheet against itself.
 */
import { renderRoom } from '../src/render.ts';
import { resolveRoom } from '../../engine/src/experiences/waiting-room.ts';
import { resolveSecondHalf } from '../../engine/src/experiences/second-half.ts';
import { planFor } from '../../engine/src/experiences/floorplan.ts';
import { SCENES } from '../../engine/src/experiences/waiting-room.ts';

const resolved = resolveRoom('anim', 0);
const html = renderRoom({
  sceneId: 'counting', renderer: 'counting', greeting: 'x', body: '',
  choices: [], resolved, lines: [], visitCount: 0, origin: 'http://x', nudges: [],
  lateChairAfterMs: resolved.lateChairAfterMs, secondHalf: resolveSecondHalf('anim'), variant: planFor('anim', SCENES).variant,
} as Parameters<typeof renderRoom>[0]);

// Strip CSS/JS comments first — prose inside them mentions "animation:" and
// would otherwise be parsed as declarations.
const css = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!));
const used = new Set(
  [...css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)]
    .flatMap((m) => m[1]!.trim().split(/\s+/))
    .filter((t) => /^[a-z][\w-]*$/i.test(t))
    .filter((t) => !/^(none|inherit|initial|unset|forwards|backwards|both|infinite|alternate|reverse|linear|ease|ease-in|ease-out|ease-in-out|normal|running|paused|step-start|step-end|cubic-bezier|steps)$/i.test(t)),
);

const missing = [...used].filter((n) => !defined.has(n));
const unused = [...defined].filter((n) => !used.has(n));

console.log(`  ${defined.size} keyframes defined, ${used.size} referenced`);
if (missing.length) console.log('  MISSING @keyframes:', missing.join(', '));
if (unused.length) console.log('  (unused, harmless):', unused.join(', '));
console.log(`  animations — ${missing.length ? 'FAIL' : 'PASS every referenced animation exists'}`);
if (missing.length) process.exit(1);
