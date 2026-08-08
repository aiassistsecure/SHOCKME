# SHOCKME — where the project stands

**Live:** [thrilling.world](https://thrilling.world) · **Repo:** `aiassistsecure/SHOCKME` · MIT
**As of:** 8 August 2026, commit `eddcbea` · 33 commits, 19 of them today

> *You didn't find the same website they did.*

This is a status report, not a pitch. Every number in it was read out of the
repo or a running server, not remembered.

---

## 1. What it is

A browser-based text experience. You arrive in a waiting room that is politely,
confidently wrong about itself. It counts chairs incorrectly. It has opinions
about how long you hesitated. Strangers murmur in a sidebar and you cannot tell
which of them are real. At the end it hands you a certificate of your visit,
with a serial number, that no other visitor's certificate matches.

**Not horror.** No gore, no threats, no jump scares. The register is *odd,
exhilarating, and slightly unsettling* — closer to a Borges footnote than a
haunted house.

**Business model:** free product, lead generation. The only ask is an email in
the footer, and nothing is gated behind it.

---

## 2. Architecture, grounded

```
packages/engine/     pure logic, no HTTP, no DOM        3,977 lines
packages/bff/        the only thing that speaks to NEDB 3,414 lines
packages/*/test/     14 test files                        800 lines
                                                    ─────────────
                                                        8,191 lines
```

**Three processes on one VPS**, no orchestrator, no containers:

| process | what | port |
|---|---|---|
| `nedbd --dag` | append-only, hash-linked store | 7070 |
| `imagine` | Qwen3.5-0.8B on CPU, llama.cpp | 8081 |
| `bff` | Node 22 type-stripping, zero deps | 3400 |

Cloudflare Flexible SSL in front; nginx on the box terminates :80 only.
No build step. No bundler. `node --experimental-strip-types` runs the
TypeScript directly.

### The BFF boundary

`packages/engine/src/nedb.ts` is the **sole** HTTP client for the datastore.
The browser's entire vocabulary is `sceneId`, `choiceId`, `dwellMs`, a chair
count, a sentence, and an email. **The session seed never crosses the wire** —
every random decision is made server-side from it, which is what makes a visit
replayable and provable.

### Storage — 12 collections

```
visitors  sessions  experiences  scenes  events  encounters
artifacts  broadcasts  experience_versions
subscribers          ← opt-in PII, deliberately not joined to behaviour
sites  pixel_events  ← the pixel
```

Everything is append-only and hash-linked. Nothing is ever updated or deleted.
This is load-bearing for a joke: when the room says *"It has been deleted. It
has also been kept. These are different systems"* — that is literally true of
the storage engine.

**13 event kinds** make up a visit:
`arrived · choice · dwell · counted · press · said · answered · drawn ·
sting · echo · recognised · afterimage · arrival_beat`

---

## 3. The rooms — 13 scenes

```
                      ┌─ seated ─┐
        arrival ──────┼─ notice ─┼────► counting ──► button
                      └─ standing┘                     │
                                                       ▼
                                  ┌──────────── corridor ────────────┐
                                  │              │                   │
                           wing A │              │ wing B            │ ~17%
                                  ▼              ▼                   ▼
                               ledger        inventory            office
                                  │              │                   │
                                  ▼              ▼                   │
                               recital         dark                  │
                                  │              │                   │
                                  └──────► threshold ◄───────────────┘
                                               │  (gate: you must write)
                                               ▼
                                          the artifact
```

**The graph is not a constant.** `floorplan.ts` derives it from the session
seed. Four things vary per visitor:

- **room order** — the wings run either way (~50%)
- **a third door** to the office (~17%)
- **both doors, one destination** — different text, same action (~22%)
- **a room offering only one choice** (~30%)

Consequence: **the best possible single run sees 8 of 12 rooms.** The artifact
names what you missed. That sentence is the entire retention mechanic, and it
required no dark pattern to build — just a graph wider than one visit.

---

## 4. The systems

| file | what it does |
|---|---|
| `rng.ts` | mulberry32, namespaced streams, provable replay-seed derivation |
| `world.ts` | 4s tick clock, seeded bot population, per-observer line divergence |
| `waiting-room.ts` | the original six rooms; **untouched** since the second half landed |
| `second-half.ts` | corridor, ledger, recital, inventory, dark, threshold |
| `floorplan.ts` | per-visitor graph mutation + prune |
| `sting.ts` | 12 behaviour-triggered lines, max 2 per session |
| `consequence.ts` | 11 echoes + the sidebar recognition |
| `answer.ts` | the threshold gate, tone reading, honest acknowledgements |
| `afterimage.ts` | arrival classification + cross-visit memory |
| `pixel.ts` | first-party event collection for other properties |
| `chat.ts` | moderation: unicode folding, leetspeak, rate limits |
| `drawing.ts` | asks a 0.8B model to draw; blank counts as success |
| `imagine.ts` | the room's voices, KeyStone-Lite hardened prompt |

### What makes the copy work

Three mechanisms, deliberately distinct:

**Pools** produce *atmosphere*. Random line from a list. Consistent, pleasant,
slightly wrong hum. Cannot produce tension, because a random pick is by
definition about nobody.

**Stings** produce *tension*. They only fire when something specific and
**measured** is true right now:

> You have been here 14 seconds. You are not reading this.
> You thought about the button for 26 seconds. It thought about you for exactly as long.
> Somebody said "the lamp is listening" in this room. The room is not going to say who.

Hard cap: two per session, ~44% of eligible screens, never repeated.

**Echoes** produce *causality*. A line in a later room that could only exist
because of an earlier choice — *"the button is still warm. nobody has been near
it"* — never shown in the room where the choice was made.

### The rule everything obeys

**Nothing the room asserts is invented.** Every number comes out of the event
log or the line is not shown. One fabricated fact and the whole effect dies on
somebody's second visit. The room is unsettling because it was *paying
attention*, not because it is pretending to be haunted.

---

## 5. Data posture

**Collected:** an opaque visitor id, an opaque session id, the choices you make,
how long you dwell, what you type in the room, and a nine-value arrival class.

**Never collected:** IP, user agent, referrer URL, device fingerprint, location,
any third-party signal.

`classifyReferrer()` reduces a referring URL to one of nine enum values and
**discards the original in the same function** — a full URL can carry a
username, a search query, a private group id; the class cannot. Verified: a
visit from `old.reddit.com/r/InternetIsBeautiful/comments/x` leaves zero
matches for "reddit" anywhere in the admin panel.

**Consent** is a real gate, not a banner. Declining disables arrival
classification, cross-visit memory, and any beat referencing a previous visit.
The visitor still gets every room. *A consent dialog whose "no" changes nothing
is worse than no dialog.*

**Email** is the only PII, opt-in, in its own collection, and deliberately
**not joined to behaviour** — the sessionId is available at capture and is not
stored, because "which rooms did this lead walk through" is exactly the quiet
linkage the rest of the codebase refuses.

### The pixel, and its honest limit

`/pixel.js` + `/bff/px`, properties managed from the admin panel at runtime.
The allowlist **is** the CORS gate, so the two cannot disagree.

**Cross-origin identity stitching is not implemented and cannot be.** Third-party
cookies are blocked or partitioned, and storage is keyed by top-level site. The
only remaining routes are a shared login (none exists) or fingerprinting
(refused). Each property therefore gets its own first-party visitor id.
A "unified identity" would be a fingerprint with better branding.

---

## 6. Tests — 14 files, 800 lines

| file | asserts |
|---|---|
| `floorplan` | 400 seeds: every plan reachable, no dead ends, all paths terminate, no single run sees everything |
| `afterimage` | two concurrent visitors cannot see each other's data, **both directions** |
| `sting` | no horror vocabulary, no grammar slips, cap held, deterministic |
| `pixel` | query strings never survive, metadata bounded, allowlist exact |
| `graph` | reachability, termination, room counts match the artifact |
| `chairs` | the count agrees across DOM, tally, and artifact |
| `latechair` | the reveal path is *reachable*, not just present |
| `animations` | every referenced `@keyframes` exists |
| `answer` `chat` `dedupe` `share` `imagine` | screening, honesty, determinism |
| `run/smoke.sh` | plays three full games over HTTP |

**The smoke test exists because unit tests are blind to delivery.** Three bugs
shipped in one day past a green suite: a chair that existed in the DOM and
could never be seen; the entire second half rendering blank on an undefined
keyframe; a room returning 84 bytes. All three passed every test in the repo.

---

## 7. Not done

- **The Audience** — the Oracle's rare social-origin sequence. Triggers exist.
- **Sidebar leaking the future** — a stranger says *"there was a door on the
  left"* and the next room has one. Recognition, not acknowledgement.
- **Grammar breaks** — a room with no buttons; a choice that appears only after
  waiting; **a room that records an action you never took**.
- **`og:image`** — shares still unfurl as text. Source card exists (`og.html`).
- **Live voices are in-memory** — a restart clears the rail.
- **Nothing supervises the three VPS processes.**
- The Properties form **has never been submitted by a human**, only by `curl`.

**Known live numbers:** ~78% of visitors touch nothing. That is the real
problem and none of today's work addressed it — the first fifteen seconds are
still the weak point.

---

## 8. What we learned building it

Four bugs today shared one shape: **one rule implemented in more than one
place.** The dedupe window, the chair count, the late chair, and two artifact
renderers that drifted apart. The fix is never cleverness — it is one source of
truth with several readers. The sticky footers now share a single CSS variable
for exactly this reason.

Four times we verified **the thing that produces the output instead of the
output**. A prompt instead of the model's reply. Compiled source instead of the
tweet. A 200 response instead of the stored row — that one was a signup form
that looked like it worked and dropped every lead.

The best design decisions came from being told the truth by someone playing it.
*"It drew 5. but we both know it drew 4."* And the single best product change
of the day was a user's, not the builder's: **let the visitor commit their own
chair count before the late chair arrives.** The answer you gave was correct
when you gave it, and the room quietly stops being the room you counted.

The one time the builder pushed back — refusing to make declining consent eject
you to another site — the product got better, and the pushback was accepted in
one message.

---

*made with ♥ by two ghosts and a human · powered by [interchained](https://interchained.org)*
