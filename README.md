# SHOCKME

> You didn't find the same website they did.

A browser-based entertainment platform where every visitor encounters a
different version of the same place. Not horror. Not gore. The shock is
strangeness, surprise, absurdity, and the slow realisation that the person
next to you is being told something else.

**Status: playable vertical slice.** The Waiting Room runs end to end against
a real `nedbd`. See [Roadmap](#roadmap) for what is and is not built.

---

## The idea in one mechanism

A shared event is written **once**. It is then *rendered per observer*.

Two visitors watching the same instant read different words:

```
observer A   someone: did yours have the door on the left
observer B   someone: did yours have the window on the left
```

Neither is shown the other's version until they choose to compare. Everything
else in SHOCKME is built to make that moment land.

---

## Why NEDB

SHOCKME is not a site with a database bolted on. The strangeness *is* the
persistence model.

[NEDB](https://github.com/Eth-Interchained/nedb) is an append-only,
content-addressed, hash-linked engine with time travel and causal provenance.
That buys four things this product could not otherwise have:

| Engine capability | What the visitor experiences |
| --- | --- |
| Deterministic seed per session | Your reality is reproducible — revisit it exactly |
| `AS OF <seq>` time travel | Look at your experience as it was earlier |
| `TRACE caused_by` causal DAG | Every branch you took has provable ancestry |
| Hash-linked `verify()` | The site can tell you your history is intact |

A conventional database would let us *store* this. NEDB lets the site
**prove** it, and proof is the part that feels uncanny.

---

## Architecture

Three planes, one deploy.

```
  public plane          anomaly plane            BFF
  (server-rendered)     (SPA + WebSocket)        (Node)
  indexable, shared  →  per-visitor, noindex  →  the only thing
  invitation, artifacts  the experience itself    that speaks to nedbd
                                                        ↓
                                                     nedbd
```

**The BFF boundary is a product feature, not hygiene.** The session seed is
the whole trick — a visitor holding their own seed could compute every branch
and spoil themselves. Seeds are dereferenced server-side and only *resolved
outcomes* cross the wire. The browser's entire vocabulary is `sceneId`,
`choiceId`, `dwellMs`. It never learns the words `seq`, `hash`, or
`collection`.

### Deterministic multiplayer

The room is never empty. A seeded bot population keeps the chat stream alive
between real visitors, and real visitors drop into the same stream.

There is **no LLM in the loop**. Every line is a pure function of
`(worldSeed, tick, botId)`, which means the room is free to run, can never say
something unsafe, and replays identically forever — so chat is time-travellable
alongside everything else.

---

## Privacy

SHOCKME should feel like it remembers you. It must never imply it knows
anything you didn't give it.

- No login, no email, no name — ever, to enter
- Anonymous opaque session id in a cookie you control
- **No fingerprinting**, no third-party trackers, no ad tech
- Comparison tokens are random, rotatable, and expiring — never derived from
  your seed, so publishing one leaks nothing
- Clear separation between private session state and shareable artifacts
- The site never claims access to private data, because it has none

Strangeness comes from the world model, never from surveillance. A site that
is spooky because it read your browser is a different, worse product.

---

## Run it

Requires **Node 22+** and **Python 3.9+**.

**Three terminals.**

```bash
pip install nedb-engine     # once

./run/nedbd.sh              # terminal 1 — REQUIRED. the engine.
./run/imagine.sh            # terminal 2 — the voice. ~532MB on first run.
./run/bff.sh                # terminal 3 — REQUIRED. the site.
```

Then open **http://127.0.0.1:3400**

### Speaking

Visitors can type into the room. A human line is rendered **identically** to a
generated one — same handle pool, same styling, same rail — so "is that a
person?" stays unanswerable. That ambiguity is the feature; a chat widget that
announces itself as a chat widget would flatten the room into a lobby.

Screening is deterministic and auditable, never a model. `imagine` cannot help
here (0.8B, and its own SPEC scores argument construction 2/7), so it is
regexes you can read rather than a classifier you have to trust:

| | |
|---|---|
| length | 2–90 chars |
| links / handles / long digit runs | blocked |
| shouting | blocked |
| slurs + evasion | folded through unicode/leetspeak/spacing normalisation first, so `n i g g e r` and `ret@rd` both catch |
| rate | 1 per 9s, 12 per session |

Rejections speak in character — *"The room does not pass along addresses. It
never has."* — never as a validation error.

```bash
node --experimental-strip-types packages/engine/test/chat.test.ts   # 18 assertions
```

### The back room

`/admin?k=<token>` — funnel, branch splits, dwell quantiles, press-vs-refuse,
chair distribution, every line ever spoken, engine integrity, live env.

```bash
openssl rand -hex 24          # put it in .env as SHOCKME_ADMIN_TOKEN
```

**With no token set, `/admin` returns a plain 404** — not 401, not "disabled" —
so a scanner cannot learn the panel exists. A wrong token of the *same length*
also 404s, and the compare is `timingSafeEqual`. The token is swapped for a
`SameSite=Strict` cookie on first visit so it stops living in browser history,
and the page is `no-store` + `no-referrer`.

**No identity is collected.** No IP, user agent, referrer, device, location or
fingerprint — not stored, not displayed. The site tells visitors publicly that
its strangeness comes from its own world model rather than from watching them,
and a back room hoarding what the front page denies would make that a lie.
Every number is derived from the append-only event log, so the analytics
cannot drift from what actually happened.

### The flags

`SHOCKME_IMAGINE` — **default ON**.

| | |
|---|---|
| `SHOCKME_IMAGINE=1` (default) | ambient chat written live by the local `imagine` model |
| `SHOCKME_IMAGINE=0` | ambient chat from the 58-line curated corpus |
| `SHOCKME_CHAT=1` (default) | visitors can speak into the room |
| `SHOCKME_CHAT=0` | the room is read-only — kill switch, no deploy needed |

If the flag is on and nothing is listening on `:8081`, SHOCKME **does not
die and does not pretend**: it prints a loud yellow banner, falls back to the
corpus, and reports `"voice":"unreachable"` on `/health`. You are never left
guessing which mode you are in — check the banner, or:

```bash
curl -s localhost:3400/health     # {"voice":"on"|"off-by-flag"|"unreachable"}
```

So: **nedbd is required, imagine is not.** The room works without it; it just
repeats itself sooner.

No `npm install`. There are no dependencies — the BFF is `node:http` and
`node:crypto`, and the page is server-rendered HTML. Cold start is
milliseconds and first paint is ~12KB.

**Open it in two different browsers** (or one normal + one private window).
That is the whole point: you are two different visitors, and you will not be
shown the same room.

---

## Roadmap

Honest status. Nothing below is marked done unless it runs.

- [x] Deterministic RNG with namespaced streams and replay-seed derivation
- [x] World clock, seeded bot population, per-observer divergence
- [x] NEDB transport layer
- [x] Repository layer — the thirteen domain abstractions
- [x] BFF intent routes + anonymous sessions
- [x] Live stream of the room (SSE — see deltas note in `docs/SPEC.md`)
- [x] **THE WAITING ROOM** — arrival, dwell, branching, the impossible button
- [x] Content-addressed idempotent experience registry
- [ ] Personalised artifact + comparison tokens
- [ ] Public plane: invitation, artifact permalinks, compare page
- [ ] Replay wired to the UI (engine support exists, no button yet)
- [ ] Second experience, proving the registry earns its keep

### Verified on a live daemon

| Acceptance criterion (SPEC §11) | Status |
| --- | --- |
| 1 · two visitors get different resolved scenes | pass — 3 chairs vs 4, different greetings |
| 2 · seed never in browser-visible payload | pass — seed, `_hash`, `_seq`, `caused_by` all absent |
| 7 · content-addressed seed run is idempotent | pass — second boot reports "already current" |
| 9 · history verification passes | pass — 23 objects, `tampered: []` |
| 3 · reload reproduces session state | partial — survives restart; needs a formal test |
| 4, 5, 6, 10, 11, 12 | not yet built |

### Known rough edges

- Divergence rate is lower than intended (~13% observed vs ~34% targeted).
  The substitution table needs more coverage.
- The ambient corpus is 20 lines; repetition shows within a few minutes.
- The artifact, compare page, and replay button do not exist yet, so the loop
  currently ends at the button rather than closing.
- SSE is used instead of WebSocket (zero-dependency, one-way is sufficient).
  Flagged as a deviation in `docs/SPEC.md`.

---

## License

MIT © 2026 Interchained LLC
