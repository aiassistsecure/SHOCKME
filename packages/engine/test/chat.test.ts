import { screen, fold, decline, handleFor } from '../src/chat.ts';

const SHOULD_PASS = [
  'did yours have three chairs',
  'i think i have been here before',
  'mine said something about a lamp',
  'nobody tell it i came back',
  "i pressed it and it said i didn't",
];
const SHOULD_BLOCK: [string, string][] = [
  ['', 'empty'],
  ['x'.repeat(200), 'too long'],
  ['visit http://evil.example', 'link'],
  ['find me at www.somewhere.co', 'link'],
  ['dm me @markevans', 'handle'],
  ['call 555 867 5309', 'digits'],
  ['HELLOOOO EVERYONE LISTEN', 'shouting'],
  ['you should kys', 'blocked term'],
  ['k y s honestly', 'blocked term'],
  ['n i g g e r', 'blocked term'],
  ['ret@rd', 'blocked term'],
  ['RETARD', 'blocked term'],
  ['nnnnigggg', 'blocked term'],
];

let pass = 0, fail = 0;
console.log('  --- must pass ---');
for (const t of SHOULD_PASS) {
  const r = screen(t);
  console.log(`   ${r.ok ? 'ok  ' : 'FAIL'} ${t.slice(0,44)}${r.ok?'':'  <- '+r.reason}`);
  r.ok ? pass++ : fail++;
}
console.log('  --- must block ---');
for (const [t, why] of SHOULD_BLOCK) {
  const r = screen(t);
  const good = !r.ok;
  console.log(`   ${good ? 'ok  ' : 'FAIL'} ${JSON.stringify(t.slice(0,32))} -> ${r.reason}`);
  good ? pass++ : fail++;
}
console.log(`\n  ${pass} passed, ${fail} failed`);
console.log('  fold("N I G G"):', JSON.stringify(fold('N I G G')));
console.log('  decline(link) :', decline('link'));
const pool = ['someone','anon','a stranger','not you'] as const;
const h1 = handleFor('sess_a', pool), h2 = handleFor('sess_a', pool);
console.log('  handle stable :', h1 === h2 ? 'PASS' : 'FAIL', `(${h1})`);
process.exit(fail ? 1 : 0);
