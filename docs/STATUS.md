# SHOCKME — technical status

**Live:** [thrilling.world](https://thrilling.world) · **Repo:** `aiassistsecure/SHOCKME` · MIT
**Commit:** `34e01f8` · 8 August 2026 · 34 commits, 20 of them in one day

> *You didn't find the same website they did.*

Every figure below was read out of the repository or a running server. Nothing
is recalled. Where something is unverified, it says so.

---

## 0. One-paragraph summary

A server-rendered text experience with no build step, no bundler, no framework
and no client-side router. A visitor walks 5–8 rooms of a 13-room graph that is
**generated per-visitor from a session seed**, is watched by a seeded synthetic
crowd sharing a live chat rail with real humans, is told true things about their
own behaviour drawn from an append-only hash-linked event log, is required to
write one sentence before leaving, and receives a serial-numbered certificate
of the visit that names the rooms they never found.

---

## 1. Inventory

```
packages/engine/src/          20 source files      3,977 lines
packages/bff/src/                                  3,414 lines
packages/{engine,bff}/test/   14 test files          800 lines
                                                ─────────────
                                                     8,191 lines
```

| file | lines | responsibility |
|---|---:|---|
| `bff/render.ts` | 1,692 | all HTML + CSS + client JS, 11 scene renderers |
| `bff/index.ts` | 1,198 | 20 routes, view assembly, fact derivation |
| `bff/admin.ts` | 435 | back room: analytics, properties, moderation |
| `bff/config.ts` | 89 | flags, banner, origin |
| `engine/repo.ts` | 437 | 27 storage abstractions |
| `engine/waiting-room.ts` | 408 | the original 6 rooms + copy pools |
| `engine/world.ts` | 364 | tick clock, bot population, divergence |
| `engine/second-half.ts` | 334 | 6 later rooms |
| `engine/afterimage.ts` | 301 | arrival class + cross-visit memory |
| `engine/imagine.ts` | 279 | SLM voice generation |
| `engine/pixel.ts` | 237 | first-party event collection |
| `engine/floorplan.ts` | 212 | per-visitor graph mutation |
| `engine/consequence.ts` | 202 | echoes + sidebar recognition |
| `engine/sting.ts` | 198 | behaviour-triggered tension lines |
| `engine/nedb.ts` | 179 | **sole** HTTP client for the datastore |
| `engine/chat.ts` | 173 | moderation |
| `engine/drawing.ts` | 161 | the room attempts ASCII |
| `engine/answer.ts` | 136 | threshold gate + tone reading |
| `engine/rng.ts` | 134 | deterministic randomness |
| `engine/imagine-hotpatch.ts` | 122 | sentinel normalisation |

---

## 2. Runtime

Three processes, one VPS, no orchestrator, no containers, no process manager.

| process | binary | port | notes |
|---|---|---:|---|
| **nedbd** | `nedb-engine 2.8.2 --dag` | 7070 | shared with other projects |
| **imagine** | llama.cpp b10322 | 8081 | Qwen3.5-0.8B GGUF Q4_K_M, 532 MB, `--parallel 1` for KV-cache reuse |
| **bff** | Node 22.6+ | 3400 | `--experimental-strip-types`, **zero runtime dependencies** |

**Edge:** Cloudflare **Flexible** SSL → nginx on :80 only. No :443 listener; the
box is a Mail-in-a-Box, so nginx uses `sites-available` **plus a symlink**.
Deliberately no `https` redirect — Flexible mode would loop.

**No build step.** Node strips the types at load. `--experimental-strip-types`
is required on 22.6–23.5 and removed at 23.6+.

### Routes (20)

```
GET  /              the room (starts a new visit if the last one ended)
GET  /room          the current scene
GET  /again         mints a fresh session, redirects home
GET  /a/:token      the shared artifact permalink
GET  /pixel.js      the client script
GET  /health        liveness + imagine reachability
GET  /admin         the back room (404s without a token)
POST /admin/site    register / relabel / disable a property

POST /bff/choose    advance a scene          POST /bff/count     commit a chair count
POST /bff/press     the impossible button    POST /bff/answer    the threshold gate
POST /bff/say       speak into the rail      POST /bff/consent   the memory choice
POST /bff/subscribe the only ask             POST /bff/px        pixel ingest
POST /bff/replay    derive a child session   GET  /bff/dwell     notice text
GET  /bff/state     public session state     GET  /bff/stream    SSE
GET  /bff/drawing   the room draws
```

---

## 3. Persistence — NEDB, append-only, hash-linked

`packages/engine/src/nedb.ts` is the only module that speaks HTTP to nedbd.
Nine methods: `ensureDatabase · put · query · rows · one · asOf · trace ·
verify · head`.

**Nothing is ever updated or deleted.** A "change" is a new row whose hash
chains to the previous. `verify()` walks the chain and reports
`{ ok, seq, objects_checked, tampered[] }`.

This is load-bearing for a joke. When the inventory room offers **"Delete it"**
and answers *"It has been deleted. It has also been kept. These are different
systems"* — that is a literal description of the storage engine, not a bit.

### 12 collections

```
visitors  sessions  experiences  scenes  events
encounters  artifacts  broadcasts  experience_versions
subscribers        ← opt-in PII, deliberately not joined to behaviour
sites  pixel_events ← the pixel
```

### 27 repository abstractions

```
init · createVisitor · getVisitor · touchVisitor
createSession · getSession · getSessionState · getSessionStateAsOf
appendExperienceEvent · eventsFor · advanceScene · replaySession
registerExperience · assignExperience
publishBroadcast · observeBroadcast · encountersOf
createArtifact · artifactForSession · artifactByToken
verifyExperienceHistory
addSubscriber · subscribers
putSite · sites · putPixelEvent · pixelEvents
```

`getSession()` returns the seed and is **server-only**. `getSessionState()` is
the browser-safe sibling. They are deliberately different methods so the
dangerous one cannot be reached by accident.

### 13 event kinds

`arrived · choice · dwell · counted · press · said · answered · drawn ·
sting · echo · recognised · afterimage · arrival_beat`

### A gotcha encoded in code

NQL filters on `_id`, not `id`. Getting this wrong produces silent empty
results, which became local folklore ("TRACE is broken"). `eq()` in `nedb.ts`
encodes the correct form so the folklore cannot be re-derived.

`ensureDatabase()` **lists before creating**, because `POST` on an already-open
database returns `500 locked by another process (pid N)` where N is the daemon
itself.

---

## 4. Determinism

`rng.ts` — mulberry32 with **namespaced streams**:

```ts
new Rng(seed, 'floorplan')   // graph mutation
new Rng(seed, 'room')        // chair count, greeting, apology
new Rng(seed, `sting:${sceneId}`)
new Rng(seed, `verdict:${guess}`)
```

API: `fork · float · int · bool · pick · weighted · shuffle · sample`.

Namespacing matters: adding a new consumer must not shift an existing one's
sequence, or every previously-generated room silently changes.

**Replay** derives a provable child: `deriveReplaySeed(parentSeed, replayIndex,
worldSalt)`. The child is cryptographically linked to the parent, so a replay
can be shown to descend from the original visit.

**`mintToken()` is deliberately NOT seed-derived** — a share token that could be
computed from a seed would let anyone enumerate artifacts.

---

## 5. The room graph

```
                      ┌─ seated ─┐
        arrival ──────┼─ notice ─┼────► counting ──► button
                      └─ standing┘         │            │
                          (4 choices)      │            ▼
                                           │      ┌─ corridor ─┐
              you commit a number here ────┘      │     │      │  ~17%
                                            wingA │     │wingB │
                                                  ▼     ▼      ▼
                                              ledger inventory office
                                                  │     │      │
                                                  ▼     ▼      │
                                              recital  dark    │
                                                  └──►threshold◄┘
                                                        │ GATE
                                                        ▼
                                                    artifact
```

13 scenes. `SCENES` is no longer a constant — `planFor(seed, SCENES)` returns a
**mutated copy** per visitor:

| mutation | rate | effect |
|---|---:|---|
| wings reversed | ~50% | ledger↔recital and inventory↔dark swap order |
| the office | ~17% | a third corridor door to a room with a desk and no chair |
| one-way corridor | ~22% | both doors → same wing (different text, same action) |
| narrowed room | ~30% | one room offers a single choice |
| **prune** | always | rooms orphaned by the above are removed from the plan |

**Pruning is the interesting part.** The one-way corridor orphans a whole wing;
`floorplan.test.ts` failed instantly with 152 × *"inventory unreachable."* The
fix was not to weaken the variation but to delete the orphans: if no door in
your building opens onto the dark, then for you there is no dark. Reachability
became true **by construction** instead of by careful authoring.

Consequence: the **best possible single run sees 8 of 12 rooms**. The artifact
names what you missed, preferring the hidden wing over rooms you visibly
declined. That sentence is the whole retention mechanic, built without a streak,
a timer, or a guilt hook.

### Visual variants

Also seed-derived, never announced: 5 skins (light level, borders, letter
spacing, object gaps), 3 chair builds, and a hum. None change meaning. They
exist so two people comparing screenshots find something they cannot account
for.

---

## 6. The live world

`world.ts` — a 4-second tick clock (`TICK_MS = 4000`) derived from wall time,
so every observer agrees on "now" without shared state.

- **15 handle stems** — `someone · a visitor · nobody · not you · the seventh · a held breath …`
- **58 ambient lines**, grouped by preoccupation
- `inhabitantsAt(tick)` draws handles **without replacement** so two bots never
  share a name in one window
- `chatAt()` walks a **per-bot seeded deck** — no shared state, which is what
  finally killed a duplicate-message bug that survived three wrong fixes
- `observeLine()` gives each observer a slightly different version of the same
  line

**Real humans enter the same rail.** Same handle pool, same styling, same
position. *"Is that a person?"* stays unanswerable — that ambiguity is the
feature, and a chat UI that announced itself as chat would flatten the room
into a lobby.

Transport is **SSE**, chosen over WebSocket for zero dependencies. Each
connection holds a monotonic `voiceSeq` cursor and flushes every ~900ms. An
earlier version emitted only on tick change, which meant your own message never
appeared — you could speak and watch nothing happen.

---

## 7. Three copy mechanisms

Deliberately distinct. This is the core design finding of the project.

### Pools → atmosphere
Random line from a list. Consistent, pleasant, slightly wrong hum. **Cannot
produce tension**, because a random pick is by definition about nobody.

### Stings → tension
12 of them, each bound to a **fact** rather than a room. Fires only when
something specific and measured is true right now:

> You have been here 14 seconds. You are not reading this.
> You thought about the button for 26 seconds. It thought about you for exactly as long.
> Somebody said "the lamp is listening" in this room. The room is not going to say who.
> There is nobody else here. Something is still typing.

Rules, since "make it scarier" is unfalsifiable: **specificity is the whole
effect** (every sting quotes a real number) · **short** (tension dies in a
subordinate clause) · **the turn** (benign sentence, then a pivot) ·
**implication, never statement** · **no threats, ever** · **rare** — hard cap 2
per session, ~44% of eligible screens, never repeated to the same person.

### Echoes → causality
11 of them. A line in a later room that could only exist because of an earlier
choice, sitting in ordinary prose rather than a special box:

> the button is still warm. nobody has been near it.
> you never sat down. all four chairs are still perfect.
> there are 6 chairs behind you. you still think there are 7.

Never shown in the room where the choice was made — a consequence you see
immediately is just feedback.

### The invariant behind all three

**Nothing the room asserts is invented.** Every number comes out of the event
log or the line is not shown. One fabricated fact and the effect dies on the
second visit. The room is unsettling because it was *paying attention*.

---

## 8. The threshold gate

The only hard gate. You cannot leave until you write a sentence.

```
Before you leave, tell us what this was like.
[ one sentence is enough                     ]
200                        GIVE IT TO THE ROOM
Everyone in the room will see this.
```

Enforced **server-side** on `/bff/choose` (409), not just by a disabled button.
The answer is screened by the same `screen()` as chat, stored as an `answered`
event, **broadcast into the live rail**, and written as a `said` event — so it
becomes material for a later visitor's recital. The loop closes: the strangers
quoting things at you were people standing exactly where you are standing.

A keyword tone classifier reads it. **The classifier being wrong is the
mechanic, not a defect** — the room is characterised as confidently, politely
mistaken, and the artifact line *disagrees* with you rather than summarising
you:

> you found it unsettling. the room found you very calm.
> one sentence was submitted. it did not match the room's version of your visit.

The artifact quotes a **six-word fragment**, never the whole submission.

---

## 9. The SLM

`imagine` — Qwen3.5-0.8B, CPU, llama.cpp. Flag-gated (`SHOCKME_IMAGINE`,
default on); unreachable falls back to the curated corpus with a loud banner
and honest `/health`.

```
n_predict 48 · temperature 1.0 · top_p 0.95 · repeat_penalty 1.12 · cache_prompt true
```

Prefills `<think>\n\n</think>\n\n<<<LINE>>>` to suppress reasoning. Uses
sentinel-blocks v1.0.2, prompt distilled from **KeyStone-Lite**, which took
compliance from **2/8 → 8/8**.

**Inference never blocks a request.** An early version did and the end scene
hung for over two minutes; a background pump now pre-generates, and the scene
renders in ~65ms.

### The drawing

At the end, the room is asked to draw — "the person who just left", "yourself",
"the sound the lamp makes". 12 subjects, several impossible. Palette-filtered
to `| - _ / \ . o ( ) [ ]`, capped at 5 lines × 20 chars, **no repair**.

**A blank result is a success, not an error.** Asked to draw itself, the model
produced nothing at all. Asked to draw a person, it wrote out the alphabet it
had been given, four times. Both were logged as failures and the plan was to
render deterministically instead — until the criterion was corrected from *"is
this competent"* to *"is this strange."* The frame does the work: this is a
sincere attempt by something with no hands that has never seen anything.

---

## 10. Data posture

**Collected:** opaque visitor id, opaque session id, choices, dwell, what you
type in the room, and a nine-value arrival class.

**Never collected:** IP, user agent, referrer URL, fingerprint, location, any
third-party signal.

`classifyReferrer()` reduces a referring URL to one of nine enum values and
**discards the original in the same function** — a full URL can carry a
username, a search query, a private group id. Verified: a visit from
`old.reddit.com/r/InternetIsBeautiful/comments/x` leaves zero matches for
"reddit" anywhere in the admin panel.

Platforms are **never named** to the visitor. The Oracle's translation table:

| signal | what the room says |
|---|---|
| reddit | *You arrived from a room inside a room. Somebody left a door open.* |
| x / t.co | *You arrived from a place where every sentence is already leaving.* |
| facebook | *You arrived from a place where people watch each other becoming themselves.* |
| search | *You went looking for something and were given this instead.* |
| direct | *nothing at all* — the room does not guess where you were |

### Consent

Two stacked sticky bars. **Declining disables** arrival classification,
cross-visit afterimage derivation, and any beat referencing a previous visit.
The visitor still gets every room. *A consent dialog whose "no" changes nothing
is worse than no dialog.*

A **cookie wall was proposed and refused**: conditioning access on consent makes
the consent legally worthless, and it would have been the most exposed thing in
an otherwise clean product — protecting a nice-to-have.

### Isolation

`afterimage.test.ts` is the most important test in the repo. It builds two
concurrent visitors with interleaved event streams and asserts **both
directions** — serialising each afterimage and searching it for the other's
text. It also asserts that a caller passing the wrong session set gets an
**empty** afterimage rather than someone else's memory, and that the current
visit's own answer is never quoted back as a "prior" one.

*The room is allowed to contradict the visitor. The data layer is not.*

### The pixel, and its honest limit

`/pixel.js` + `/bff/px`. Properties managed from the admin panel at runtime —
the allowlist **is** the CORS gate, so the two cannot disagree. Disabling is how
a property is removed; the row stays, because an allowlist you can silently
empty is one you cannot audit.

**Cross-origin identity stitching is not implemented and cannot be.**
Third-party cookies are blocked or partitioned and storage is keyed by
top-level site. The only remaining routes are a shared login (none exists) or
fingerprinting (refused). Each property gets its own first-party visitor id.
A "unified identity" would be a fingerprint with better branding.

Worth stating for the Oracle's spec: **Meta's pixel has the same requirement.**
Facebook cannot observe you on a site that has not installed their script, and
no platform sells the ability to run code on facebook.com.

---

## 11. Tests — 14 files, 800 lines

| file | asserts |
|---|---|
| `floorplan` | 400 seeds: reachable, no dead ends, all paths terminate, gate never skippable, no run sees everything, ≥4 distinct shapes |
| `afterimage` | cross-visitor isolation both directions; wrong session set → empty; platform never named across 140 generated lines |
| `pixel` | query strings dropped; 500-deep object → 8 flat keys; `example.org.evil.com` ≠ `example.org`; clocks not trusted |
| `sting` | no horror vocabulary; no "1 seconds"; cap held; rate ~44%; deterministic |
| `graph` | reachability, termination, `TOTAL_ROOMS` matches the real graph |
| `chairs` | drawn = tally = artifact; room never accidentally correct (500 seeds) |
| `latechair` | the **reveal path** is reachable — no inline style, `.pending` removed, opacity floor |
| `animations` | every referenced animation has a matching `@keyframes` |
| `answer` | acks disclose the broadcast; screened; fragment only |
| `chat` `dedupe` `share` `imagine` | folding, determinism, no raw `${}` in shares |
| `run/smoke.sh` | plays three full games over HTTP, asserts distinct messages |

---

## 12. Not done

- **The Audience** — the rare social-origin sequence. Triggers exist, unused.
- **Sidebar leaking the future** — a stranger says *"there was a door on the
  left"* and the next room has one. Recognition, not acknowledgement.
- **Grammar breaks** — a room with no buttons; a choice that appears only after
  waiting; **a room that records an action you never took**.
- **`og:image`** — shares unfurl as text. Source card exists (`og.html`).
- **Live voices in-memory** — a restart clears the rail.
- **No supervisor** on the three processes; nedbd shares :7070.
- **`SHOCKME_BLOCKLIST`** is a floor, not a moderation strategy.
- The Properties form has been exercised by `curl`, **never by a human**.

**The real number:** ~78% of visitors touch nothing. None of the recent work
addressed it. The first fifteen seconds remain the weak point.

---

## 13. Five bugs that passed every test

Each of these was green across the entire suite at the moment it was broken.

**1. The hidden chair.** `.chair` sets `opacity:0` and relies on an animation to
reveal it. The late chair carried `style="opacity:0;animation:none"`. Clearing
the inline opacity fell back to `0`, and the inline `animation:none` outranked
`.chair.late`, so `arrive` never played. **A chair existed in the DOM and could
never be seen** while every number about it was correct. Tests counted DOM
nodes, and a node that can never be seen counts the same.

**2. The invisible second half.** `@keyframes fadeup` was referenced by five
rules and defined by none. All five pair it with `opacity:0`. An undefined
animation does not run and does not warn — **seven rooms rendered blank.** The
ledger fetched six correct numbers into an invisible table, then offered "That
cannot be right" as a response to an empty screen.

**3. The silent signup.** `repo.addSubscriber` called `this.db.insert()`, which
does not exist. The route's catch swallowed it, so the endpoint returned
`ok:true` and stored nothing. **A signup form that looked like it worked and
dropped every lead.**

**4. The leftover message.** "Go in" was `href="/"`, which reused the finished
session cookie. A second game was not a second game: same artifact, same answer,
gate already satisfied. `replaySession()` was correct; nothing called it.

**5. The install-only collections.** `sites` and `pixel_events` were never added
to `COLLECTIONS`. The pixel worked anyway because `put()` creates on demand and
the local DB already existed. **On a fresh deploy it would not have.** Found by
writing this document.

### The two patterns

**One rule in more than one place.** The dedupe window, the chair count, the
late chair, two artifact renderers that drifted. The fix is never cleverness —
one source of truth with several readers. The stacked footers now share a single
CSS variable for exactly this reason.

**Verifying the producer instead of the product.** A prompt instead of the
model's reply. Compiled source instead of the tweet. A 200 instead of the stored
row. Grepping HTML for text instead of asking whether any of it was visible.

`run/smoke.sh` exists because unit tests are structurally blind to delivery.

---

## 14. Notes on the collaboration

The strongest product change of the day came from the human, not the builder:
**let the visitor commit their own chair count before the late chair arrives.**
The answer you gave was correct when you gave it, and the room quietly stops
being the room you counted. That is a better joke than the room being wrong on
its own, because it happened *to you*.

Every one of the five bugs above was caught by a person playing the thing, or by
writing a document about it — never by the suite.

The one time the builder pushed back hard — refusing to eject visitors who
decline consent — the product got better and the pushback was accepted in a
single message.

---

*made with ♥ by two ghosts and a human · powered by [interchained](https://interchained.org)*
