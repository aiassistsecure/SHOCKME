/**
 * Guards the share text. A literal ${...} reached a real tweet because a
 * scripted edit broke a template literal and nothing inspected the OUTPUT.
 * This asserts the DECODED string, which is the only thing that matters.
 */
import { renderArtifact } from '../../bff/src/render.ts';

const html = renderArtifact({
  token: 'testtoken123',
  title: 'This has been the version with you in it.',
  lines: ['you were told: you came back.', 'the room insisted on 4 chairs. it drew 6.'],
  closing: 'nothing was pressed. nothing ever is.',
  historyIntact: true,
  chainLength: 5,
  origin: 'https://thrilling.world',
  isOwner: false,
});

const href = html.match(/href="(https:\/\/twitter[^"]+)"/)?.[1]
  ?.replace(/&amp;/g, '&') ?? '';
const q = new URL(href).searchParams;
const text = q.get('text') ?? '';
const url = q.get('url') ?? '';

const LEAKS = ['${', '}', 'chairHint', 'undefined', '[object', 'NaN'];
const found = LEAKS.filter((l) => text.includes(l) || url.includes(l));

console.log('  decoded text :', JSON.stringify(text));
console.log('  decoded url  :', url);
console.log('  leaks        :', found.length ? `FAIL ${found}` : 'PASS none');
console.log('  title present:', text.includes('version with you in it') ? 'PASS' : 'FAIL');
console.log('  url absolute :', url.startsWith('https://thrilling.world/a/') ? 'PASS' : 'FAIL');

// every interpolation in the page body resolved
const bodyLeak = /\$\{[a-zA-Z]/.test(html);
console.log('  page has no raw ${}:', bodyLeak ? 'FAIL' : 'PASS');
process.exit(found.length || bodyLeak ? 1 : 0);
