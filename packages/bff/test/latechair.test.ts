/**
 * THE LATE CHAIR MUST BE ABLE TO BECOME VISIBLE.
 *
 * M: "It says 4 chairs I say 4 chairs there are 4 chairs and it says
 * difference 1. There must be a hidden chair."
 *
 * There was. The element carried style="opacity:0;animation:none", and:
 *   - .chair sets opacity:0 and relies on its animation to reveal it, so
 *     clearing the inline opacity fell back to 0 rather than 1;
 *   - inline `animation:none` outranks .chair.late, so `arrive` never played.
 * The chair sat in the DOM permanently invisible while every number about it
 * was correct — the worst possible failure, because the maths all checked out
 * and only the eye disagreed.
 *
 * The previous chair tests all passed throughout, because they counted DOM
 * nodes. A node that exists and can never be seen counts exactly the same. So
 * this asserts the thing those could not: that the reveal path is reachable.
 */

import { renderRoom } from '../src/render.ts';
import { resolveRoom } from '../../engine/src/experiences/waiting-room.ts';
import { resolveSecondHalf } from '../../engine/src/experiences/second-half.ts';
import { planFor } from '../../engine/src/experiences/floorplan.ts';
import { SCENES } from '../../engine/src/experiences/waiting-room.ts';

let fail = 0;
const bad = (m: string) => { fail++; if (fail < 6) console.log('  ' + m); };

for (let i = 0; i < 60; i++) {
  const seed = `late_${i}`;
  const resolved = resolveRoom(seed, 0);
  const html = renderRoom({
    sceneId: 'counting', renderer: 'counting', greeting: 'x', body: '',
    choices: [{ id: 'agree', label: 'Agree with the room' }],
    resolved, lines: [], visitCount: 0, origin: 'http://x', nudges: [],
    lateChairAfterMs: resolved.lateChairAfterMs,
    secondHalf: resolveSecondHalf(seed), variant: planFor(seed, SCENES).variant,
  } as Parameters<typeof renderRoom>[0]);

  const tag = /<div class="[^"]*"[^>]*id="latechair"[^>]*>/.exec(html)?.[0];
  if (!tag) { bad(`${seed}: no late chair rendered`); continue; }

  // 1. NO inline style. Inline beats every class rule, which is the whole bug.
  if (/style\s*=/.test(tag)) bad(`${seed}: late chair has inline style: ${tag}`);
  // 2. it must start held back by the class that the reveal removes
  if (!/\bpending\b/.test(tag)) bad(`${seed}: late chair is not .pending`);
  // 3. the reveal must remove exactly that class and add .late
  if (!html.includes("classList.remove('pending')")) bad(`${seed}: nothing removes .pending`);
  if (!html.includes("classList.add('late')")) bad(`${seed}: nothing adds .late`);
  // 4. and the stylesheet must define both halves of that handoff
  if (!/\.chair\.pending\{[^}]*opacity:0/.test(html)) bad(`${seed}: .chair.pending does not hide it`);
  const lateRule = /\.chair\.late\{([^}]*)\}/.exec(html)?.[1] ?? '';
  if (!/animation:arrive/.test(lateRule)) bad(`${seed}: .chair.late does not animate it in`);
  // and it must be visible even if that animation never runs at all
  if (!/opacity:1/.test(lateRule)) bad(`${seed}: .chair.late has no opacity floor`);
  // 5. total drawn still equals the count every other surface quotes
  const drawn = (html.match(/class="chair/g) ?? []).length;
  if (drawn !== resolved.chairCount) bad(`${seed}: drew ${drawn}, chairCount ${resolved.chairCount}`);
}

console.log(`  60 seeds — ${fail ? `FAIL ${fail}` : 'PASS the late chair can arrive'}`);
if (fail) process.exit(1);
