# SHOCKME

> You didn't find the same website they did.

A browser-based entertainment platform where every visitor encounters a
different version of the same place. Not horror. Not gore. The shock is
strangeness, surprise, absurdity, and the slow realisation that the person
next to you is being told something else.

**Status: early. The engine core runs; the web app does not exist yet.**
See [Roadmap](#roadmap) for what is real today.

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

```bash
# 1. the engine
pip install nedb-engine
nedbd --dag --data ./data --port 7070

# 2. prove the world is deterministic and observers diverge
node --experimental-strip-types packages/engine/test/t1.ts
```

Expected:

```
1. same tick reproducible : PASS
2. same observer stable   : PASS
3. observers diverge      : 2/15 lines differ -> PASS
```

If `3.` reports `0/15`, divergence is broken — that is the one number that
matters most in this repo.

---

## Roadmap

Honest status. Nothing below is marked done unless it runs.

- [x] Deterministic RNG with namespaced streams and replay-seed derivation
- [x] World clock, seeded bot population, per-observer divergence
- [x] NEDB transport layer
- [ ] Repository layer — the thirteen domain abstractions
- [ ] BFF intent routes + anonymous sessions
- [ ] WebSocket live stream
- [ ] The first experience: **THE WAITING ROOM**
- [ ] Personalised artifact + comparison tokens
- [ ] Public plane: invitation, artifact permalinks, compare page
- [ ] Replay as a provable branch
- [ ] Experience registry for experiences two and beyond

### Known rough edges

- Divergence rate is lower than intended (~13% observed vs ~34% targeted).
  The substitution table needs more coverage.
- The ambient corpus is small; repetition will show within a few minutes.

---

## License

MIT © 2026 Interchained LLC
