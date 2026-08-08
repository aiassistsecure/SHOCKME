/**
 * SHOCKME · the pixel
 *
 * Oracle: "Create a lightweight client script... Its only job is to create or
 * recover an anonymous visitor ID, collect approved first-party events, and
 * send append-only events to SHOCKME."
 * M: "make the pixel manageable by admin panel and stats too" /
 *    "second properties are adjusted on the admin panel"
 *
 * THE LIMIT, STATED UP FRONT, BECAUSE THE SPEC ASSUMES OTHERWISE.
 *
 * The brief says the Afterimage "resolves them to an anonymous visitor
 * identity" across participating properties. Across DIFFERENT ORIGINS that is
 * not possible any more, and it is not a thing we are choosing not to build —
 * it is a thing the web removed. Third-party cookies are dead in Safari,
 * Firefox and increasingly Chrome; localStorage is partitioned per origin.
 * The only remaining ways to stitch one human across two domains are:
 *
 *   1. a shared login          — we have none, and asking for one would
 *                                destroy the anonymity the product promises
 *   2. browser fingerprinting  — M ruled this out explicitly, and it is the
 *                                exact surveillance the room's copy denies
 *
 * So the pixel gives each property its OWN first-party visitor id. Events from
 * every property land in one append-only stream with one dashboard, and a
 * visitor's afterimage is per-property. That is genuinely useful and it is
 * honest. A "unified identity" built on fingerprinting would make the room's
 * central claim — that it is strange from its own world model and never from
 * surveillance — a lie.
 *
 * WHAT THE ADMIN CONTROLS. Properties are rows, not config: added, disabled
 * and removed from the back room at runtime. An origin that is not registered
 * and enabled gets its events rejected, which is also the CORS gate.
 */

/** A registered first-party property. Managed from the admin panel. */
export interface Site {
  siteId: string;
  label: string;
  /** Exact origin, e.g. https://interchained.org. The allowlist AND the CORS gate. */
  origin: string;
  enabled: boolean;
  createdTick: number;
}

export const PIXEL_EVENTS = [
  'visit_started', 'page_viewed', 'room_entered', 'choice_made', 'room_found',
  'button_pressed', 'response_given', 'artifact_viewed', 'artifact_shared',
  'visit_completed', 'dwell_checkpoint',
] as const;
export type PixelEventName = (typeof PIXEL_EVENTS)[number];

export interface PixelEvent {
  eventId: string;
  visitorId: string;
  sessionId: string;
  occurredAt: number;
  site: string;
  path: string;
  referrerClass: string;
  campaign?: string;
  roomId?: string;
  choiceId?: string;
  metadata?: Record<string, unknown>;
}

/** Everything an untrusted client can send has to survive this. */
export interface PixelVerdict { ok: boolean; reason?: string; event?: PixelEvent }

const ID = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * Validate one inbound event.
 *
 * This is the trust boundary: the body is attacker-controlled, the origin is
 * spoofable outside a browser, and anything stored here is shown in the back
 * room. So the shape is strict, the strings are capped, and metadata is
 * shallow — an unbounded nested object from the open internet is a memory
 * exhaustion bug waiting to be found by somebody bored.
 */
export function validateEvent(raw: unknown, site: Site, nowMs: number): PixelVerdict {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };
  const e = raw as Record<string, unknown>;

  const name = String(e.type ?? '');
  if (!(PIXEL_EVENTS as readonly string[]).includes(name)) return { ok: false, reason: 'unknown event' };

  const visitorId = String(e.visitorId ?? '');
  const sessionId = String(e.sessionId ?? '');
  if (!ID.test(visitorId) || !ID.test(sessionId)) return { ok: false, reason: 'bad id' };

  /*
   * PATH ONLY, NEVER THE QUERY STRING. A full URL from somebody else's site
   * can carry an email in a reset link, a search term, a session token. We
   * take the path, cap it, and drop everything after ? or #.
   */
  const path = String(e.path ?? '/').split(/[?#]/)[0]!.slice(0, 200);

  // Clocks lie and clients lie more. Anything outside a sane window is stamped
  // server-side rather than trusted.
  const claimed = Number(e.occurredAt ?? 0);
  const occurredAt = Number.isFinite(claimed) && Math.abs(nowMs - claimed) < 86_400_000
    ? claimed : nowMs;

  const meta: Record<string, unknown> = {};
  const rawMeta = e.metadata;
  if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
    let n = 0;
    for (const [k, v] of Object.entries(rawMeta as Record<string, unknown>)) {
      if (n++ >= 8) break;                                   // shallow and small
      if (k.length > 40) continue;
      if (typeof v === 'string') meta[k] = v.slice(0, 200);
      else if (typeof v === 'number' || typeof v === 'boolean') meta[k] = v;
      // objects and arrays are dropped entirely — no nesting, no recursion
    }
  }

  return {
    ok: true,
    event: {
      eventId: `px_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
      visitorId, sessionId, occurredAt,
      site: site.siteId,
      path,
      referrerClass: String(e.referrerClass ?? 'unknown').slice(0, 24),
      campaign: e.campaign ? String(e.campaign).slice(0, 60) : undefined,
      roomId: e.roomId ? String(e.roomId).slice(0, 40) : undefined,
      choiceId: e.choiceId ? String(e.choiceId).slice(0, 40) : undefined,
      metadata: Object.keys(meta).length ? meta : undefined,
    },
  };
}

/** Normalise an origin for comparison. Trailing slashes have cost me an hour. */
export function normOrigin(s: string): string {
  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return '';
  }
}

export function siteForOrigin(sites: Site[], origin: string | undefined): Site | undefined {
  if (!origin) return undefined;
  const o = normOrigin(origin);
  return sites.find((s) => s.enabled && normOrigin(s.origin) === o);
}

/* ------------------------------------------------------------------ */
/* The client script                                                   */
/* ------------------------------------------------------------------ */

/**
 * Served from /pixel.js. Deliberately tiny and deliberately dumb: it holds no
 * opinions, makes no decisions, and cannot see anything the page has not
 * handed it.
 *
 * IT DOES NOT SEND UNTIL CONSENT IS RECORDED. data-consent="granted" in the
 * tag is treated as the SITE saying it has its own consent flow — it is not
 * accepted on its own. The visitor's actual recorded choice lives in
 * first-party storage under shockme.consent, and without it the queue is held
 * and nothing leaves the browser.
 */
export const PIXEL_JS = `(function(){
  var s = document.currentScript;
  if (!s) return;
  var site = s.getAttribute('data-site') || '';
  var endpoint = (s.getAttribute('data-endpoint') || new URL(s.src).origin) + '/bff/px';
  if (!site) return;

  var K = 'shockme.' + site;
  function get(k, d){ try { return localStorage.getItem(K + '.' + k) || d; } catch(e){ return d; } }
  function set(k, v){ try { localStorage.setItem(K + '.' + k, v); } catch(e){} }
  function rid(){ return 'v' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

  // First-party to THIS property. Not shared with any other origin; the web
  // does not allow that any more and we are not going to fake it.
  var visitorId = get('vid', ''); if (!visitorId) { visitorId = rid(); set('vid', visitorId); }
  var sessionId = 's' + Math.random().toString(36).slice(2,10) + Date.now().toString(36);

  function refClass(){
    var r = document.referrer; if (!r) return 'direct';
    try {
      var h = new URL(r).hostname;
      if (h === location.hostname) return 'internal';
      if (/facebook|fb\\./.test(h)) return 'social_facebook';
      if (/instagram/.test(h)) return 'social_instagram';
      if (/reddit|redd\\.it/.test(h)) return 'social_reddit';
      if (/twitter|(^|\\.)x\\.com|t\\.co/.test(h)) return 'social_x';
      if (/tiktok|threads|bsky|mastodon|linkedin|pinterest|tumblr|discord|youtube/.test(h)) return 'social_other';
      if (/google|bing|duckduckgo|ecosia|yahoo|brave/.test(h)) return 'search';
      return 'unknown';
    } catch(e){ return 'unknown'; }
  }

  var queue = [];
  function consented(){ return get('consent','') === 'granted'; }

  function flush(){
    if (!consented() || !queue.length) return;
    var batch = queue.splice(0, 20);
    try {
      var body = JSON.stringify({ site: site, events: batch });
      if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], {type:'application/json'}));
      else fetch(endpoint, { method:'POST', headers:{'content-type':'application/json'}, body: body, keepalive: true });
    } catch(e){}
  }

  function send(type, extra){
    var ev = {
      type: type, visitorId: visitorId, sessionId: sessionId,
      occurredAt: Date.now(), path: location.pathname,
      referrerClass: refClass()
    };
    var q = new URLSearchParams(location.search).get('utm_campaign');
    if (q) ev.campaign = q.slice(0,60);
    if (extra) for (var k in extra) ev[k] = extra[k];
    queue.push(ev);
    if (queue.length >= 5) flush();
  }

  // The public surface. A host page calls shockme('room_entered', {...}).
  window.shockme = function(type, extra){ send(type, extra); };
  window.shockme.consent = function(choice){
    set('consent', choice === 'granted' ? 'granted' : 'denied');
    if (choice === 'granted') flush();
    else queue.length = 0;   // declining discards what was held, unsent
  };
  window.shockme.visitorId = visitorId;

  send('visit_started');
  send('page_viewed');
  addEventListener('visibilitychange', function(){ if (document.hidden) flush(); });
  addEventListener('pagehide', flush);
  setInterval(flush, 15000);
})();`;
