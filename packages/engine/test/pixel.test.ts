/**
 * The pixel's ingest is the only endpoint on this product that accepts data
 * from OTHER people's websites. Everything here is the trust boundary.
 */
import { validateEvent, normOrigin, siteForOrigin, PIXEL_EVENTS, PIXEL_JS, type Site } from '../src/pixel.ts';

let fail = 0;
const bad = (m: string) => { fail++; if (fail < 8) console.log('  ' + m); };
const site: Site = { siteId: 's1', label: 'S', origin: 'https://example.org', enabled: true, createdTick: 0 };
const now = Date.now();

// 1. THE QUERY STRING MUST NEVER SURVIVE. A URL from somebody else's site can
//    carry a reset token, an email, a search term.
const v = validateEvent({ type: 'page_viewed', visitorId: 'vabcd123', sessionId: 'sabcd123',
  path: '/reset?token=SECRET&email=a@b.c#frag' }, site, now);
if (!v.ok) bad('valid event rejected');
if (/[?#]/.test(v.event!.path)) bad(`path kept the query: ${v.event!.path}`);
if (/SECRET|a@b\.c/.test(JSON.stringify(v.event))) bad('SECRET SURVIVED VALIDATION');

// 2. unknown event names and malformed ids are refused
if (validateEvent({ type: 'exfiltrate', visitorId: 'vabcd123', sessionId: 'sabcd123' }, site, now).ok) bad('unknown event accepted');
if (validateEvent({ type: 'page_viewed', visitorId: '../../etc', sessionId: 'sabcd123' }, site, now).ok) bad('path-traversal id accepted');
if (validateEvent({ type: 'page_viewed', visitorId: 'x', sessionId: 'sabcd123' }, site, now).ok) bad('short id accepted');
if (validateEvent(null, site, now).ok) bad('null accepted');
if (validateEvent('a string', site, now).ok) bad('string accepted');

// 3. metadata is shallow and bounded — an unbounded nested object from the open
//    internet is a memory exhaustion bug waiting to be found
let deep: Record<string, unknown> = { end: 1 };
for (let i = 0; i < 500; i++) deep = { nest: deep };
const big: Record<string, unknown> = { nested: deep, long: 'x'.repeat(5000) };
for (let i = 0; i < 50; i++) big[`k${i}`] = i;
const m = validateEvent({ type: 'choice_made', visitorId: 'vabcd123', sessionId: 'sabcd123', metadata: big }, site, now);
if (!m.ok) bad('event with fat metadata rejected outright');
const meta = m.event!.metadata ?? {};
if (Object.keys(meta).length > 8) bad(`metadata kept ${Object.keys(meta).length} keys`);
if ('nested' in meta) bad('nested object survived — recursion risk');
if (String(meta.long ?? '').length > 200) bad('string not capped');

// 4. a lying clock is replaced, not trusted
const future = validateEvent({ type: 'page_viewed', visitorId: 'vabcd123', sessionId: 'sabcd123',
  occurredAt: now + 900 * 86_400_000 }, site, now);
if (Math.abs(future.event!.occurredAt - now) > 86_400_000) bad('accepted an absurd timestamp');

// 5. the allowlist is exact, and disabled means disabled
const sites = [site, { ...site, siteId: 's2', origin: 'https://off.example', enabled: false }];
if (!siteForOrigin(sites, 'https://example.org')) bad('registered origin not matched');
if (siteForOrigin(sites, 'https://off.example')) bad('DISABLED property still accepted');
if (siteForOrigin(sites, 'https://evil.example')) bad('unregistered origin accepted');
if (siteForOrigin(sites, 'https://example.org.evil.com')) bad('suffix attack accepted');
if (siteForOrigin(sites, undefined)) bad('missing origin accepted');
if (normOrigin('example.org/') !== 'https://example.org') bad(`normOrigin: ${normOrigin('example.org/')}`);

// 6. the script does not phone home before consent is recorded
if (!/consented\(\)/.test(PIXEL_JS)) bad('client has no consent gate');
if (!/get\('consent',''\) === 'granted'/.test(PIXEL_JS)) bad('consent gate is not checking stored choice');
if (/data-consent/.test(PIXEL_JS)) bad('client trusts a data-consent attribute');

console.log(`  ${PIXEL_EVENTS.length} event types, allowlist exact, metadata bounded`);
console.log(`  pixel — ${fail ? `FAIL ${fail}` : 'PASS query strings dropped, consent gated, origin enforced'}`);
if (fail) process.exit(1);
