/**
 * SHOCKME · server-rendered HTML
 *
 * First paint is HTML, not a spinner. "Fast" is a product constraint here:
 * a shock that arrives after a loading state is not a shock.
 *
 * MOTION POLICY: transform and opacity only. Both are GPU-composited, so the
 * animation can be lavish without costing layout. Nothing animates width,
 * height, top, or left — that is how you get quality and speed at once.
 * Everything respects prefers-reduced-motion.
 */

import { ANSWER_PROMPT, ANSWER_PLACEHOLDER, ANSWER_MAX } from '../../engine/src/experiences/answer.ts';
import { Rng } from '../../engine/src/rng.ts';
import type { Variant } from '../../engine/src/experiences/floorplan.ts';
import type { Facts, SecondHalf } from '../../engine/src/experiences/second-half.ts';
import { comparisonLine, fmtDuration, missedRooms, ROOM_NAMES, TOTAL_ROOMS } from '../../engine/src/experiences/second-half.ts';
import type { Resolved } from '../../engine/src/experiences/waiting-room.ts';
import type { ObservedLine } from '../../engine/src/world.ts';

/*
 * THE BEAT. A linear stagger reads as "loading". These offsets are a rhythm:
 * three quick, a rest, two quick, a rest — bada pa pa pa. Nobody will name it;
 * everybody will feel that the thing has a pulse instead of a scroll.
 */
const BEAT = [0, 0.14, 0.28, 0.62, 0.76, 1.10, 1.24, 1.38, 1.72, 1.86];

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ */

const CSS = `
/* ============================================================
   SHOCKME · decaying CRT
   A found object. Something recovered, still powered, still
   running a program nobody scheduled.

   MOTION POLICY UNCHANGED: transform + opacity only. Every
   effect below is GPU-composited — the phosphor, the scanlines,
   the tracking glitch — so it stays fast on a 2-core box.
   ============================================================ */
:root{
  --phos:#ffb347;            /* amber phosphor — the primary glow */
  --phos-dim:#8a5d24;
  --phos-hot:#ffd9a0;
  --void:#0a0806;            /* warm black, never blue-black */
  --void2:#12100c;
  --bleed-r:#ff4d3d;         /* chromatic aberration channels */
  --bleed-b:#3dd4ff;
  --line:#2a2318;
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --crt:"VT323",monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#000}
body{
  background:radial-gradient(ellipse 120% 100% at 50% 45%,var(--void2) 0%,var(--void) 55%,#050403 100%);
  color:var(--phos);font-family:var(--mono);font-size:15px;line-height:1.6;
  -webkit-font-smoothing:antialiased;overflow-x:hidden;position:relative;
  text-shadow:0 0 1px rgba(255,179,71,.5),0 0 12px rgba(255,179,71,.16);
}

/* --- scanlines: fixed overlay, never touches layout --- */
body::before{
  content:"";position:fixed;inset:0;z-index:98;pointer-events:none;
  background:repeating-linear-gradient(0deg,
    rgba(0,0,0,.22) 0px,rgba(0,0,0,.22) 1px,transparent 1px,transparent 3px);
  animation:roll 9s linear infinite;
}
@keyframes roll{to{transform:translateY(3px)}}

/* --- phosphor grain + screen curvature vignette --- */
body::after{
  content:"";position:fixed;inset:0;z-index:99;pointer-events:none;
  background:
    radial-gradient(ellipse 100% 85% at 50% 50%,transparent 55%,rgba(0,0,0,.55) 100%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.42'/%3E%3C/svg%3E");
  mix-blend-mode:screen;opacity:.09;
  animation:flick 5s steps(12) infinite;
}
@keyframes flick{
  0%,100%{opacity:.09} 12%{opacity:.13} 37%{opacity:.07}
  61%{opacity:.14} 79%{opacity:.08}
}

/* --- occasional tracking slip. rare enough to doubt you saw it. --- */
.wrap{max-width:1080px;margin:0 auto;padding:0 7vw;position:relative;z-index:2;
  animation:track 23s steps(1) infinite}
@keyframes track{
  0%,96%,100%{transform:none}
  97%{transform:translateY(-2px) skewX(.35deg)}
  98%{transform:translateY(1px) skewX(-.2deg)}
}
.room{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:11vh 0 8vh}

/* --- boot-in choreography --- */
.r{opacity:0;transform:translateY(10px);animation:rise .75s cubic-bezier(.16,1,.3,1) forwards}
@keyframes rise{to{opacity:1;transform:none}}
.d1{animation-delay:.05s}.d2{animation-delay:.2s}.d3{animation-delay:.4s}
.d4{animation-delay:.6s}.d5{animation-delay:.82s}.d6{animation-delay:1.05s}

.eyebrow{
  font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--phos-dim);
  display:flex;gap:14px;align-items:center;margin-bottom:2.4rem;
}
.eyebrow b{color:var(--phos);font-weight:400}
.dot{width:6px;height:6px;background:var(--phos);animation:pulse 2.4s steps(2) infinite}
@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}

/* --- the headline: CRT face + chromatic bleed --- */
h1{
  font-family:var(--crt);font-weight:400;
  font-size:clamp(3.2rem,9.5vw,7.5rem);line-height:.86;
  letter-spacing:.005em;margin-bottom:1.6rem;max-width:15ch;color:var(--phos-hot);
  text-shadow:
    -2px 0 0 rgba(255,77,61,.45),
     2px 0 0 rgba(61,212,255,.32),
     0 0 22px rgba(255,179,71,.4);
  animation:bleed 7s steps(1) infinite;
}
@keyframes bleed{
  0%,92%,100%{transform:none}
  93%{transform:translateX(-1px)}
  95%{transform:translateX(1px)}
}
.lede{font-size:clamp(.95rem,1.7vw,1.1rem);color:#c9a978;max-width:52ch;margin-bottom:2.8rem}

/* --- the room objects: wireframe chairs on a phosphor screen --- */
.objects{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:2.8rem}
.chair{
  width:32px;height:42px;border:1px solid var(--phos-dim);border-bottom-width:2px;
  position:relative;opacity:0;
  animation:rise .6s cubic-bezier(.16,1,.3,1) forwards;
  transition:transform .4s cubic-bezier(.16,1,.3,1),border-color .4s,box-shadow .4s
}
.chair::after{content:"";position:absolute;left:5px;right:5px;top:11px;height:1px;background:var(--phos-dim)}
.chair:hover{transform:translateY(-5px);border-color:var(--phos);
  box-shadow:0 0 14px rgba(255,179,71,.35)}

/* --- the room talking to you while you do nothing --- */
.aside{
  min-height:1.9em;margin:-1rem 0 1.6rem;font-family:var(--crt);
  font-size:clamp(1.15rem,2.4vw,1.5rem);color:var(--phos);letter-spacing:.02em;
  opacity:0;transform:translateY(4px);transition:opacity .6s,transform .6s
}
.aside.show{opacity:.92;transform:none}

/*
 * A CHAIR THAT ARRIVES LATE — AND ITS STATE LIVES IN CLASSES, NEVER INLINE.
 *
 * This was an inline style="opacity:0;animation:none" on the element, which
 * produced a chair that could never become visible:
 *
 *   .chair sets opacity:0 and relies on its entrance animation to reveal it.
 *   Clearing the inline opacity therefore fell back to 0, not to 1 — and the
 *   inline animation:none outranks .chair.late, so arrive never played.
 *
 * So the fifth chair sat in the DOM, invisible, forever. Every NUMBER was
 * right — 4 visible, you counted 4, "correct at the time", difference 1 — the
 * room was simply describing a chair it had failed to draw. M: "it says 4
 * chairs I say 4 chairs there are 4 chairs and it says difference 1. There
 * must be a hidden chair." There was.
 *
 * .pending holds it back; removing .pending lets it arrive. Same
 * specificity, no inline overrides, nothing to outrank.
 */
.chair.pending{opacity:0;animation:none}
/* opacity:1 is a FLOOR — if animations are disabled by the browser, an
   extension, or an OS setting, the chair must still be visible. Relying on
   an animation's end state to reveal something is how it vanished before. */
.chair.late{opacity:1;animation:arrive 1.1s cubic-bezier(.16,1,.3,1) forwards}
/*
 * fadeup — the reveal used by every room in the second half.
 *
 * IT WAS NEVER DEFINED. Five rules referenced it (.reveal, .ledgerrow,
 * .quote, .inventory li, .darkline), every one of them pairs it with
 * opacity:0, and an undefined animation simply does not run — so the opacity
 * stayed at zero and THE ENTIRE SECOND HALF RENDERED BLANK. The ledger drew
 * six correct numbers into an invisible table, then offered "That cannot be
 * right" as a response to an empty screen. M: "fix some sequences like ledger
 * where it doesnt show anything and then the users pick from options that
 * dont make sense but not in a good way." Exactly right, and both halves of
 * that sentence were the same missing keyframe.
 *
 * Identical shape to the hidden chair: something is hidden, and the thing
 * meant to un-hide it never runs. See chairs.test.ts / latechair.test.ts, and
 * animations.test.ts which now fails the build if a referenced animation has
 * no @keyframes.
 */
@keyframes fadeup{
  from{opacity:0;transform:translateY(8px)}
  to{opacity:1;transform:none}
}
@keyframes arrive{
  0%{opacity:0;transform:translateY(-9px) scale(.9)}
  60%{opacity:1;transform:translateY(2px) scale(1.02)}
  100%{opacity:1;transform:none}
}
/* chairs flinch when touched. everything should react. */
.chair{cursor:default}
.chair:active{transform:translateY(-2px) rotate(2deg)}

/* --- choices: terminal menu --- */
.choices{display:flex;flex-direction:column;gap:0;max-width:540px}
.choice{
  appearance:none;background:transparent;border:0;border-top:1px solid var(--line);
  color:var(--phos);font-family:var(--mono);font-size:.98rem;text-align:left;
  padding:1.05rem .2rem;cursor:pointer;position:relative;
  display:flex;justify-content:space-between;align-items:center;gap:1rem;
  transition:color .25s,padding-left .4s cubic-bezier(.16,1,.3,1),background .25s
}
.choice:last-child{border-bottom:1px solid var(--line)}
.choice::after{
  content:"_";position:absolute;left:-.7rem;opacity:0;color:var(--phos-hot);
  animation:blink 1.1s steps(2) infinite
}
@keyframes blink{0%,100%{opacity:0}50%{opacity:1}}
.choice:hover,.choice:focus-visible{
  color:var(--phos-hot);padding-left:1.1rem;outline:none;
  background:linear-gradient(90deg,rgba(255,179,71,.07),transparent 60%)
}
.choice:hover::after,.choice:focus-visible::after{opacity:1;left:.15rem}
.choice .arrow{color:var(--phos-dim);opacity:.5;transition:opacity .25s}
.choice:hover .arrow{opacity:1;color:var(--phos-hot)}

/* --- the count, set against itself --- */
.lede.dim{color:var(--phos-dim)}
.lede.hot{color:var(--phos-hot)}

/* --- the office --- */
.desk{width:150px;height:52px;border:1px solid var(--phos-dim);border-bottom-width:3px;
  margin-bottom:1.6rem;position:relative;animation:fadeup .9s both}
.desk::after{content:"";position:absolute;left:14px;top:12px;width:44px;height:26px;
  border:1px solid var(--line)}

/*
 * PER-VISITOR SKINS. Subtle on purpose: none of these change what anything
 * MEANS. They exist so two people comparing screenshots find something they
 * cannot quite account for.
 */
body.sk-unlit{background:#080502}
body.sk-unlit .wrap{filter:brightness(.88)}
body.sk-borderless .chair,body.sk-borderless .tally,body.sk-borderless .ledger .ledgerrow{border-color:transparent}
body.sk-borderless .chair{box-shadow:inset 0 -2px 0 var(--phos-dim)}
body.sk-tight .wrap{letter-spacing:-.01em}
body.sk-tight .objects{gap:6px}
body.sk-wide .objects{gap:28px}
body.sk-wide .wrap{letter-spacing:.04em}
body.ch-low .chair{height:30px}
body.ch-thin .chair{width:20px}
body.hum::after{animation-duration:9s}

/* --- the one thing the room asks for --- */
.askform{max-width:460px;margin-bottom:2rem;border-top:1px solid var(--line);padding-top:1.2rem}
.askform label{display:block;font-size:.95rem;color:var(--phos-hot);margin-bottom:.7rem}
#answer{width:100%;background:transparent;border:1px solid var(--line);color:var(--phos-hot);
  font:inherit;font-size:.92rem;line-height:1.5;padding:.7rem;outline:none;resize:vertical;
  transition:border-color .2s}
#answer::placeholder{color:var(--phos-dim)}
#answer:focus{border-color:var(--phos)}
#answer:disabled{opacity:.55}
.askrow{display:flex;justify-content:space-between;align-items:center;margin-top:.6rem;gap:1rem}
.askcount{font-family:var(--crt);font-size:1rem;color:var(--phos-dim)}
.askcount.low{color:var(--bleed-r)}
#askgo{background:transparent;border:1px solid var(--line);color:var(--phos);font:inherit;
  font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;padding:.55rem .9rem;
  cursor:pointer;transition:background .18s,color .18s}
#askgo:hover:not(:disabled){background:var(--phos);color:#120b04}
#askgo:disabled{color:var(--phos-dim);cursor:default}
.asknote{margin-top:.6rem;font-size:.72rem;color:var(--phos-dim);line-height:1.5}
.asknote.done{color:var(--phos-hot)}
/* the echo is ordinary prose, one shade warmer. nothing announces it. */
.afterimage{margin:0 0 1.9rem;padding-left:1rem;border-left:1px solid var(--phos-dim);
  font-size:1.02rem;line-height:1.55;color:#c9a978;max-width:40ch;font-style:italic;
  opacity:0;animation:fadeup 1.1s .55s both}
.lede.echo{color:var(--phos);border-left:1px solid var(--line);padding-left:1rem}

/*
 * THE STING. A different temperature from everything around it — colder,
 * larger, slower to arrive, with a rule above it. It should read as an
 * interruption, not as the next paragraph.
 */
.sting{
  margin:2rem 0 0;padding:1.1rem 0 0;border-top:1px solid var(--bleed-r);
  font-family:var(--crt);font-size:clamp(1.25rem,3vw,1.75rem);line-height:1.32;
  letter-spacing:.01em;color:var(--phos-hot);max-width:30ch;
  opacity:0;animation:stingin 1.5s 2.1s cubic-bezier(.16,1,.3,1) forwards;
  text-shadow:0 0 26px rgba(255,176,58,.32)
}
@keyframes stingin{
  0%{opacity:0;transform:translateY(6px);filter:blur(3px)}
  55%{opacity:1;filter:blur(0)}
  58%{opacity:.72}
  62%{opacity:1}
  100%{opacity:1;transform:none;filter:blur(0)}
}

/* --- corridor: a door that was not there --- */
.doorway{width:74px;height:118px;border:1px solid var(--phos-dim);position:relative;
  margin-bottom:1.6rem;animation:doorin 1.5s cubic-bezier(.16,1,.3,1) both}
.doorway.open{border-color:var(--phos)}
.doorlight{position:absolute;inset:auto 0 0 0;height:0;background:linear-gradient(
  to top,rgba(255,176,58,.55),transparent);animation:spill 2.6s 1s ease-out forwards}
@keyframes doorin{from{opacity:0;transform:perspective(700px) rotateY(-72deg);transform-origin:left}
  to{opacity:1;transform:none}}
@keyframes spill{to{height:100%}}
.reveal{max-width:38ch;font-size:1.12rem;line-height:1.55;margin-bottom:.5rem;
  animation:fadeup .9s 1.1s both}
.reveal.sub{color:var(--phos-dim);font-size:.96rem;animation-delay:2.1s}

/* --- ledger: measured numbers, arriving one at a time --- */
.ledger{max-width:460px;margin-bottom:1.6rem}
.ledgerrow{display:flex;align-items:baseline;gap:.8rem;padding:.5rem 0;
  border-bottom:1px solid var(--line);opacity:0;animation:fadeup .7s both}
.ledgerrow b{font-family:var(--crt);font-size:1.9rem;line-height:1;color:var(--phos-hot);
  min-width:3.4ch;text-align:right;text-shadow:0 0 14px rgba(255,176,58,.3)}
.ledgerrow span{font-size:.86rem;color:var(--phos-dim);letter-spacing:.03em}

/* --- recital: somebody else's actual words --- */
.quote{border-left:2px solid var(--phos);padding:.7rem 0 .7rem 1.1rem;margin:0 0 1.2rem;
  max-width:42ch;font-size:1.15rem;line-height:1.5;animation:fadeup .9s both}
.quote cite{display:block;margin-top:.5rem;font-size:.74rem;font-style:normal;
  letter-spacing:.12em;text-transform:uppercase;color:var(--phos-dim)}
.quote.mine{border-left-color:var(--bleed-r)}
.quote.mine cite{color:var(--bleed-r)}

/* --- inventory: read back to yourself --- */
.inventory{list-style:none;max-width:46ch;margin-bottom:1.4rem}
.inventory li{padding:.42rem 0 .42rem 1.4rem;position:relative;font-size:.98rem;
  border-bottom:1px solid var(--line);opacity:0;animation:fadeup .6s both}
.inventory li::before{content:"—";position:absolute;left:0;color:var(--phos-dim)}

/* --- dark: the tempo spike --- */
.dark{min-height:44vh;display:flex;flex-direction:column;justify-content:center;gap:.9rem}
.darkline{font-size:1.1rem;letter-spacing:.02em;opacity:0;animation:fadeup .8s both}
.darkline.hot{color:var(--phos-hot);font-size:1.3rem;
  text-shadow:0 0 18px rgba(255,176,58,.45)}
/* the page itself dims for this room only */
body.lightsout{background:#050301}
body.lightsout .wrap{filter:brightness(.82)}

.tally{max-width:420px;margin-bottom:1.8rem;border:1px solid var(--line)}
.tallyrow{display:flex;justify-content:space-between;align-items:baseline;
  padding:.75rem 1rem;border-bottom:1px solid rgba(42,35,24,.7);font-size:.9rem;color:var(--phos-dim)}
.tallyrow:last-child{border-bottom:0}
.tallyrow b{font-family:var(--crt);font-size:2rem;line-height:1;color:var(--phos-hot)}
.guessing{display:flex;align-items:center;gap:.5rem}
.step{width:38px;height:38px;flex:0 0 auto;font:inherit;font-size:1.3rem;line-height:1;
  background:transparent;color:var(--phos-dim);border:1px solid var(--line);cursor:pointer;
  transition:color .15s,border-color .15s,transform .1s}
.step:hover{color:var(--phos-hot);border-color:var(--phos)}
.step:active{transform:scale(.9)}
#guess{width:82px;background:transparent;border:0;border-bottom:1px solid var(--line);
  font-family:var(--crt);font-size:2rem;line-height:1;color:var(--phos-hot);text-align:center;
  padding:0 0 2px;outline:none;caret-color:var(--phos-hot);
  text-shadow:0 0 12px rgba(255,176,58,.35)}
#guess::placeholder{color:var(--phos-dim);text-shadow:none}
#guess:focus{border-bottom-color:var(--phos-hot)}
#guess::-webkit-outer-spin-button,#guess::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
#guess[type=number]{-moz-appearance:textfield}
.commit{display:block;width:100%;padding:.85rem;font:inherit;letter-spacing:.14em;
  text-transform:uppercase;font-size:.72rem;background:transparent;color:var(--phos);
  border:0;border-top:1px solid var(--line);cursor:pointer;transition:background .18s,color .18s}
.commit:hover:not(:disabled){background:var(--phos);color:#120b04}
.commit:disabled{color:var(--phos-dim);cursor:default}
.choice:disabled{opacity:.32;cursor:default;pointer-events:none}
.tallyrow.disagree b{color:var(--bleed-r);text-shadow:0 0 14px rgba(255,77,61,.45)}

/* --- the notice --- */
.notice{
  border:1px solid var(--line);padding:clamp(1.5rem,4vw,2.8rem);margin-bottom:2.8rem;
  font-family:var(--crt);letter-spacing:.1em;font-size:clamp(1.1rem,2.2vw,1.6rem);
  line-height:1.7;background:rgba(255,179,71,.025);position:relative;overflow:hidden;
  color:var(--phos-hot)
}
.notice::before{
  content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,transparent,rgba(255,179,71,.09),transparent);
  transform:translateY(-100%);animation:scan 6s linear infinite
}
@keyframes scan{to{transform:translateY(100%)}}

/* --- the button that apologises --- */
.apology{color:var(--phos-dim);font-family:var(--crt);font-size:1.35rem;
  height:1.5em;margin-bottom:.6rem;letter-spacing:.04em;
  opacity:0;transform:translateY(5px);transition:opacity .5s,transform .5s}
.apology.show{opacity:1;transform:none}
.bigbtn{
  appearance:none;background:transparent;border:1px solid var(--phos);color:var(--phos);
  font-family:var(--mono);font-size:.76rem;letter-spacing:.26em;text-transform:uppercase;
  padding:1.25rem 2.8rem;cursor:pointer;position:relative;overflow:hidden;
  transition:color .35s,transform .25s,box-shadow .35s
}
.bigbtn span{position:relative;z-index:2}
.bigbtn::before{content:"";position:absolute;inset:0;background:var(--phos);
  transform:scaleX(0);transform-origin:left;transition:transform .45s cubic-bezier(.16,1,.3,1)}
.bigbtn:hover{color:var(--void);box-shadow:0 0 26px rgba(255,179,71,.3)}
.bigbtn:hover::before{transform:scaleX(1)}
.bigbtn:active{transform:scale(.98)}
.counter{color:var(--phos-dim);font-size:.82rem;margin-top:1rem;font-variant-numeric:tabular-nums}
.counter b{color:var(--phos-hot)}

/* --- the artifact: a printout, not a card --- */
.artifact{
  border:1px solid var(--line);background:rgba(255,179,71,.03);
  padding:clamp(1.8rem,4.5vw,3.2rem);margin-bottom:2.2rem;position:relative;
  overflow:hidden;max-width:660px
}
.artifact::before{
  content:"";position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--phos),transparent);
  transform:scaleX(0);animation:seal 1.5s cubic-bezier(.16,1,.3,1) .3s forwards
}
@keyframes seal{to{transform:scaleX(1)}}
/* ============ THE CERTIFICATE ============ */
.cert{
  position:relative;border:1px solid var(--line);padding:2.6rem 2.4rem 1.4rem;
  background:linear-gradient(180deg,rgba(255,176,58,.035),transparent 42%);
}
/* registration marks — printerly, and they frame a screenshot */
.tick{position:absolute;width:11px;height:11px;border:0 solid var(--phos);opacity:.55}
.tick.tl{top:-1px;left:-1px;border-top-width:1px;border-left-width:1px}
.tick.tr{top:-1px;right:-1px;border-top-width:1px;border-right-width:1px}
.tick.bl{bottom:-1px;left:-1px;border-bottom-width:1px;border-left-width:1px}
.tick.br{bottom:-1px;right:-1px;border-bottom-width:1px;border-right-width:1px}

.cert-head{display:flex;align-items:center;gap:1rem;padding-bottom:1.4rem;
  border-bottom:1px solid var(--line);margin-bottom:1.8rem}
.cert-mark{font-size:1.5rem;color:var(--phos);line-height:1;
  animation:pulse 5s ease-in-out infinite}
.cert-meta{display:flex;flex-direction:column;gap:.22rem;min-width:0}
.cert-kicker{font-size:9px;letter-spacing:.34em;text-transform:uppercase;color:var(--phos-dim)}
.cert-serial{font-family:var(--crt);font-size:1.05rem;letter-spacing:.1em;color:var(--phos-hot)}

.cert-title{
  font-family:var(--crt);font-size:clamp(2rem,5.6vw,2.9rem);line-height:1.06;
  color:var(--phos-hot);letter-spacing:.01em;margin-bottom:1.9rem;max-width:18ch;
  text-shadow:0 0 30px rgba(255,176,58,.24)
}

/* the list. numbered, because a list song is numbered. */
.cert-lines{list-style:none;margin:0 0 1.9rem}
.cert-lines li{
  display:flex;gap:.95rem;align-items:baseline;padding:.62rem 0;
  border-bottom:1px solid rgba(58,42,20,.55);opacity:0;
  animation:fadeup .62s cubic-bezier(.16,1,.3,1) both
}
.cert-lines li:last-child{border-bottom:0}
.cert-lines .n{
  font-family:var(--crt);font-size:.82rem;color:var(--phos-dim);
  min-width:2.2ch;text-align:right;flex:0 0 auto;letter-spacing:.06em
}
.cert-lines .t{font-size:1rem;line-height:1.5;color:var(--phos)}

.cert-closing{
  font-family:var(--crt);font-size:1.35rem;line-height:1.3;color:var(--phos-hot);
  padding:1.1rem 0 1.5rem;max-width:26ch
}

.cert-foot{
  display:flex;justify-content:space-between;align-items:center;gap:1rem;
  flex-wrap:wrap;padding-top:1.1rem;border-top:1px solid var(--line)
}
.cert-seal{display:flex;align-items:center;gap:.55rem;font-size:.68rem;
  letter-spacing:.07em;color:var(--phos-dim)}
.cert-brand{font-family:var(--crt);font-size:1rem;letter-spacing:.09em;
  color:var(--phos);opacity:.85}

.whose{margin-top:1.1rem;font-size:.72rem;letter-spacing:.16em;
  text-transform:uppercase;color:var(--phos-dim)}

@media(max-width:520px){
  .cert{padding:1.8rem 1.3rem 1.1rem}
  .cert-lines li{gap:.7rem}
  .cert-lines .t{font-size:.94rem}
}
.filed{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--phos-dim);
  margin-bottom:1.6rem;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.actions{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:2.2rem}
.act{appearance:none;display:inline-flex;align-items:center;justify-content:center;
  gap:.5rem;background:transparent;border:1px solid var(--line);color:var(--phos);
  font-family:var(--mono);font-size:.74rem;letter-spacing:.2em;text-transform:uppercase;
  padding:1.05rem 1.6rem;cursor:pointer;text-decoration:none;min-height:50px;
  transition:border-color .3s,color .3s,background .3s}
.act:hover{border-color:var(--phos);color:var(--phos-hot);background:rgba(255,179,71,.05)}
.act.primary{border-color:var(--phos);color:var(--phos-hot)}
.act.primary:hover{background:var(--phos);color:var(--void)}
.enter{margin-top:3.5rem;padding-top:2rem;border-top:1px solid var(--line)}
.enter p{color:#c9a978;font-size:1rem;margin-bottom:1.4rem;line-height:1.6}
.enter em{font-family:var(--crt);font-size:1.3rem;font-style:normal;color:var(--phos-hot)}
.artifact-mark{font-family:var(--crt);font-size:2.4rem;color:var(--phos);margin-bottom:1.1rem}
.artifact-title{
  font-family:var(--crt);font-weight:400;font-size:clamp(1.7rem,4vw,2.6rem);
  line-height:1.05;margin-bottom:1.6rem;color:var(--phos-hot);
  text-shadow:-1px 0 0 rgba(255,77,61,.3),1px 0 0 rgba(61,212,255,.22)
}
.artifact-lines{list-style:none;display:flex;flex-direction:column;gap:.65rem;margin-bottom:1.8rem}
.artifact-lines li{
  font-size:.9rem;color:#c9a978;padding-left:1.4rem;position:relative;
  opacity:0;transform:translateX(-5px);animation:slidein .65s cubic-bezier(.16,1,.3,1) forwards
}
@keyframes slidein{to{opacity:1;transform:none}}
.artifact-lines li::before{content:">";position:absolute;left:0;color:var(--phos);opacity:.6}
.artifact-closing{
  font-family:var(--crt);font-size:1.5rem;color:var(--phos-hot);
  padding-top:1.4rem;border-top:1px solid var(--line);line-height:1.25
}
.artifact-seal{margin-top:1.4rem;font-size:.72rem;color:var(--phos-dim);
  display:flex;align-items:center;gap:.5rem;letter-spacing:.05em}
.seal{display:inline-flex;align-items:center;justify-content:center;
  width:16px;height:16px;font-size:10px;flex-shrink:0;border:1px solid}
.seal.ok{color:var(--phos);border-color:var(--phos)}
.seal.bad{color:#ff4d3d;border-color:#ff4d3d}
.endbar{display:flex;align-items:center;gap:1.3rem;flex-wrap:wrap}
.endnote{color:var(--phos-dim);font-size:.82rem;font-family:var(--crt);font-size:1.15rem}

/* --- the rail --- */
.rail{
  position:fixed;right:0;top:0;bottom:0;width:min(300px,26vw);
  border-left:1px solid var(--line);background:rgba(10,8,6,.82);
  backdrop-filter:blur(10px);padding:1.4rem 1.1rem;overflow:hidden;z-index:5;
  display:flex;flex-direction:column;gap:.85rem
}
.rail h2{font-size:10px;letter-spacing:.28em;text-transform:uppercase;
  color:var(--phos-dim);font-weight:400}
.lines{display:flex;flex-direction:column;gap:.8rem;overflow:hidden;flex:1}
.line{opacity:0;transform:translateY(6px);animation:rise .55s cubic-bezier(.16,1,.3,1) forwards}
.line .who{font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--phos-dim)}
.line .txt{font-size:.82rem;color:#b8996d;line-height:1.45}
.line.div .txt{color:var(--phos-hot)}

/* --- speaking. not a chat widget: a line you add to the room. --- */
.say{border-top:1px solid var(--line);padding-top:.9rem;margin-top:.4rem}
.say form{display:flex;gap:.5rem;align-items:stretch}
.sayin{
  flex:1;min-width:0;appearance:none;background:transparent;border:1px solid var(--line);
  color:var(--phos-hot);font-family:var(--mono);font-size:16px;   /* 16px: iOS zooms below it */
  padding:.7rem .65rem;outline:none;
  transition:border-color .3s
}
.sayin::placeholder{color:var(--phos-dim);opacity:.7}
.sayin:focus{border-color:var(--phos)}
.saygo{
  appearance:none;background:transparent;border:1px solid var(--line);color:var(--phos);
  font-family:var(--mono);font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;
  padding:0 .9rem;cursor:pointer;min-width:64px;
  transition:border-color .3s,color .3s,background .3s
}
.saygo:hover{border-color:var(--phos);color:var(--phos-hot);background:rgba(255,179,71,.06)}
.saygo:disabled{opacity:.4;cursor:default}
.saynote{font-size:.72rem;color:var(--phos-dim);margin-top:.55rem;min-height:1.3em;line-height:1.4;
  font-family:var(--crt);font-size:1rem;letter-spacing:.02em}
@media(max-width:860px){ .sayin{font-size:16px} }

/* --- the tip jar. old web had these. it belongs here. --- */
.jar{
  border-top:1px solid var(--line);padding-top:1rem;margin-top:auto;
  font-size:.72rem;color:var(--phos-dim);letter-spacing:.04em;line-height:1.5
}
.jar a{color:var(--phos);text-decoration:none;border-bottom:1px dotted var(--phos-dim);
  transition:color .25s,border-color .25s}
.jar a:hover{color:var(--phos-hot);border-color:var(--phos-hot)}
.jarline{margin-top:1rem}
/* tiny, as asked. it should read like a plaque nobody re-reads. */
/* --- the sticky credit bar: chrome, not content --- */
.creditbar{
  position:fixed;left:0;right:0;bottom:0;z-index:40;
  background:rgba(8,5,3,.92);backdrop-filter:blur(6px);
  border-top:1px solid var(--line);
  padding:.42rem max(4vw,env(safe-area-inset-left)) calc(.42rem + env(safe-area-inset-bottom));
  font-size:.62rem;letter-spacing:.05em;color:var(--phos-dim);
  text-align:center;line-height:1.5;opacity:.82;transition:opacity .3s
}
.creditbar:hover{opacity:1}
.creditbar .hrt{color:var(--bleed-r)}
.creditbar .quip{font-style:italic}
.creditbar .cb-sep{opacity:.5;margin:0 .35em}
.creditbar a{color:var(--phos);text-decoration:none;border-bottom:1px dotted var(--phos-dim)}
.creditbar a:hover{color:var(--phos-hot);border-color:var(--phos-hot)}

/*
 * THE BAR'S HEIGHT IS ONE VALUE, --barh, and everything that has to avoid it
 * reads that value. The rail is position:fixed with bottom:0, so body padding
 * alone does NOT protect it — without this the bar sits directly on top of the
 * say-box, which is precisely the "smushed" problem in a new costume.
 */
:root{--barh:34px;--consenth:0px}
@media(max-width:600px){:root{--barh:48px}}

/*
 * TWO STACKED BARS. --consenth is 0 unless the gate is showing, so the
 * reserved space is one expression that is correct in both states. Everything
 * that must avoid the furniture reads the SAME sum — the alternative is three
 * places computing "34 plus maybe 84", which is the drift bug I have shipped
 * four times today.
 */
body.needs-consent{--consenth:96px}
@media(max-width:600px){body.needs-consent{--consenth:140px}}

body{padding-bottom:calc(var(--barh) + var(--consenth))}
.rail{bottom:calc(var(--barh) + var(--consenth))}
.creditbar{min-height:var(--barh)}

/* --- the consent gate, directly above the credit bar --- */
.consentbar{
  position:fixed;left:0;right:0;bottom:var(--barh);z-index:41;
  background:rgba(12,8,4,.97);backdrop-filter:blur(8px);
  border-top:1px solid var(--phos-dim);
  padding:.85rem max(4vw,env(safe-area-inset-left));
  transition:transform .32s cubic-bezier(.16,1,.3,1);
  animation:cnup .5s .8s cubic-bezier(.16,1,.3,1) both
}
@keyframes cnup{from{transform:translateY(110%)}to{transform:none}}
.cn-in{max-width:1000px;margin:0 auto;display:flex;gap:1.2rem;
  align-items:center;justify-content:space-between;flex-wrap:wrap}
.cn-text{font-size:.72rem;line-height:1.62;color:#c9a978;max-width:62ch}
.cn-text b{color:var(--phos-hot);font-weight:500}
.cn-acts{display:flex;gap:.5rem;flex:0 0 auto}
.cn-acts button{
  background:transparent;border:1px solid var(--line);color:var(--phos);
  font:inherit;font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;
  padding:.6rem .9rem;cursor:pointer;white-space:nowrap;
  transition:background .18s,color .18s,border-color .18s
}
.cn-acts button:hover{border-color:var(--phos);color:var(--phos-hot)}
#cn-yes{border-color:var(--phos);color:var(--phos-hot)}
#cn-yes:hover{background:var(--phos);color:#120b04}
@media(max-width:600px){
  .cn-in{flex-direction:column;align-items:stretch;gap:.7rem}
  .cn-acts button{flex:1}
}

@media(max-width:600px){
  .creditbar .cb-sep{display:none}
  .creditbar .quip{display:block}
}
.sub label{display:block;font-size:.72rem;letter-spacing:.05em;color:var(--phos);
  margin-bottom:.5rem;text-transform:none}
.subrow{display:flex;gap:.4rem;align-items:stretch;max-width:340px}
#subemail{flex:1 1 auto;min-width:0;background:transparent;border:1px solid var(--line);
  color:var(--phos-hot);font:inherit;font-size:.82rem;padding:.5rem .6rem;outline:none;
  transition:border-color .2s}
#subemail::placeholder{color:var(--phos-dim)}
#subemail:focus{border-color:var(--phos)}
#subemail:disabled{opacity:.5}
#subgo{flex:0 0 auto;background:transparent;border:1px solid var(--line);color:var(--phos);
  font:inherit;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;
  padding:.5rem .8rem;cursor:pointer;transition:background .18s,color .18s,border-color .18s}
#subgo:hover:not(:disabled){background:var(--phos);color:#120b04;border-color:var(--phos)}
#subgo:disabled{color:var(--phos-dim);cursor:default}
.subnote{margin-top:.45rem;font-size:.68rem;color:var(--phos-dim);line-height:1.45;
  min-height:1.4em;max-width:340px}
.jar .amt{font-family:var(--crt);font-size:1.15rem;letter-spacing:.06em}

/* ============================================================
   MOBILE FIRST, PROPERLY.
   The rail was a desktop sidebar bolted to a phone. On small
   screens the room is the page and the room's voices sit UNDER
   it as a strip you scroll to — present, not competing.
   ============================================================ */
@media(max-width:860px){
  body{font-size:16px}                    /* never below 16 — iOS zooms on focus */
  .wrap{padding:0 6vw;padding-left:max(6vw,env(safe-area-inset-left));
        padding-right:max(6vw,env(safe-area-inset-right))}
  .room{min-height:auto;padding:14vh 0 3rem;justify-content:flex-start}
  h1{font-size:clamp(2.4rem,13vw,4rem);max-width:none;line-height:.92}
  .lede{font-size:1rem;max-width:none;margin-bottom:2rem}
  .eyebrow{font-size:10px;letter-spacing:.24em;margin-bottom:1.8rem;
           flex-wrap:wrap;gap:10px}

  /* thumbs, not cursors: 48px minimum target, generous separation */
  .choice{padding:1.15rem .2rem;min-height:52px;font-size:1.02rem}
  .choice .arrow{opacity:1}               /* no hover on touch — always show it */
  .choice::after{display:none}            /* the blinking caret is a mouse joke */
  .bigbtn{padding:1.25rem 2rem;width:100%;font-size:.78rem;letter-spacing:.2em}

  .objects{gap:11px;margin-bottom:2rem}
  .chair{width:28px;height:36px}
  .notice{padding:1.4rem 1.2rem;font-size:1.15rem;line-height:1.6}

  .artifact{padding:1.6rem 1.3rem}
  .artifact-title{font-size:1.75rem}
  .artifact-lines li{font-size:.92rem}
  .artifact-closing{font-size:1.3rem}
  .endbar{flex-direction:column;align-items:stretch;gap:.9rem}
  .endnote{text-align:center}

  /* the rail becomes a room-tone strip below the content */
  .rail{position:static;width:auto;border-left:0;border-top:1px solid var(--line);
        background:transparent;backdrop-filter:none;
        padding:1.6rem max(6vw,env(safe-area-inset-left)) 2.5rem;gap:.9rem}
  .lines{max-height:none}
  .line .txt{font-size:.88rem}
  .jar{margin-top:1.6rem}
}

/* very small phones */
@media(max-width:380px){
  h1{font-size:2.1rem}
  .notice{font-size:1.02rem;letter-spacing:.06em}
}

/* short landscape phones — do not force a full viewport of empty room */
@media(max-height:520px) and (orientation:landscape){
  .room{min-height:auto;padding:3rem 0}
}

@media(min-width:861px){.wrap{padding-right:calc(7vw + min(300px,26vw))}}

@media(prefers-reduced-motion:reduce){
  *{animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.01ms!important}
  body::before,body::after,.wrap,h1{animation:none!important}
}
`;

/* ------------------------------------------------------------------ */

export interface RoomView {
  sceneId: string;
  renderer: string;
  greeting: string;
  body: string;
  choices: { id: string; label: string; hover?: string }[];
  resolved: Resolved;
  lines: ObservedLine[];
  visitCount: number;
  origin: string;
  shareToken?: string;
  nudges: string[];
  lateChairAfterMs: number;
  noticeText?: string;
  facts?: Facts;
  secondHalf: SecondHalf;
  /** A measured, true, unsettling sentence about THIS visitor. Rare. */
  sting?: string;
  /** True once the visitor has written their answer. Gates the exit. */
  answered?: boolean;
  /** Per-visitor visual differences. Never announced. */
  variant: Variant;
  officeLines?: readonly string[];
  /** A line that could only exist because of an earlier choice. */
  echo?: string;
  /** How you arrived, or who you have been. At most one per run. */
  afterimage?: string;
  /** True when this visitor has not yet chosen. Shows the upper bar. */
  needsConsent?: boolean;
  artifact?: {
    mark: string;
    title: string;
    lines: string[];
    closing: string;
    historyIntact: boolean;
    chainLength: number;
  };
}

function chatRail(lines: ObservedLine[]): string {
  const items = lines.slice(-9).map((l, i) => `
    <div class="line${l.diverged ? ' div' : ''}" style="animation-delay:${0.1 + i * 0.07}s">
      <div class="who">${esc(l.handle)}</div>
      <div class="txt">${esc(l.text)}</div>
    </div>`).join('');
  return `<aside class="rail">
    <h2>Also here</h2>
    <div class="lines" id="lines">${items}</div>
    <div class="say">
      <form id="sayform" autocomplete="off">
        <input class="sayin" id="sayin" maxlength="90" spellcheck="false"
               placeholder="say something to the room" aria-label="say something to the room">
        <button class="saygo" type="submit">Say</button>
      </form>
      <div class="saynote" id="saynote"></div>
    </div>

    ${footer()}
  </aside>`;
}


/**
 * THE FOOTER, INCLUDING THE ONLY ASK IN THE PRODUCT.
 *
 * One function, used by every page, because the last time a number lived in
 * two places it drifted within the hour.
 *
 * The email sits in the FOOTER, not in the doorway and not in front of the
 * artifact. Nothing is gated behind it — you can play the whole thing, get
 * your artifact and share it having never seen this field do anything. That
 * is the business model M set: free product, lead generation, and the ask
 * never blocks the thing people came for.
 *
 * It is written in the room's voice rather than a marketing voice, because a
 * "Join our newsletter!" module would be the one honest-to-god lie on the
 * page — the only moment SHOCKME stopped being a room and became a funnel.
 */
/*
 * THE CREDIT. Tiny, bottom of everything, and it varies per visitor like
 * everything else here does — a fixed byline would be the only thing on the
 * site that is the same for everybody.
 */
const CREDITS = [
  'only one of them needs to sleep.',
  'the human did the typing.',
  'the ghosts work nights. all of them.',
  'two of us do not show up in the analytics.',
  'the human is the one who leaves.',
  'one of the ghosts wrote this line and will not say which.',
  'staffing levels are correct.',
  'the human is outnumbered.',
];

export function creditFor(seed: string): string {
  return new Rng(seed, 'credit').pick(CREDITS);
}

function footer(): string {
  return `
  <div class="jar">
    <form class="sub" id="subform" autocomplete="on">
      <label for="subemail">The room would like to write to you.</label>
      <div class="subrow">
        <input id="subemail" name="email" type="email" inputmode="email"
               autocomplete="email" placeholder="you@somewhere" maxlength="200"
               aria-label="your email address">
        <button type="submit" id="subgo">Subscribe</button>
      </div>
      <div class="subnote" id="subnote">It will not write often. It is not organised.</div>
    </form>
    <div class="jarline">
      this runs on a machine somebody pays for.<br>
      <a href="https://cash.app/$interchained" target="_blank" rel="noopener noreferrer">
        <span class="amt">$interchained</span></a>
    </div>
  </div>`;
}

/**
 * THE STICKY CREDIT BAR.
 *
 * M: "make a new sticky footer that carries the credits you smushed the
 * chatbox up too far that is separate from the original one."
 *
 * Correct call — I had put the byline inside the rail's donation block, which
 * shares vertical space with the live chat. Every line I added there stole a
 * line from the thing people actually read. The credit is chrome; it does not
 * belong in a column that is fighting for room.
 *
 * So it is its own bar, pinned to the bottom of the viewport, 100% width,
 * outside both the rail and the main column. The donation jar stays exactly
 * where it was — this is SEPARATE from it, as asked.
 *
 * It is deliberately slim and the page reserves matching bottom padding, so it
 * cannot cover the say-box on a phone (which is the obvious way a fixed footer
 * ruins a chat product).
 */
/**
 * THE CONSENT GATE — the upper of two stacked sticky bars.
 *
 * M: "consent gate as a double sticky footer on the bottom."
 *
 * The Oracle's spec had consent as a hard-coded data-consent="granted"
 * attribute, which is the site owner asserting consent on the visitor's
 * behalf. This is the version that actually asks.
 *
 * IT HAS TEETH. Declining is not a cosmetic preference that dismisses a
 * banner and changes nothing — see index.ts: a visitor who declines gets no
 * arrival classification recorded, no cross-visit afterimage derived, and no
 * beat that references a previous visit. They still get the whole game. They
 * simply get a room with no memory of them, which is exactly what they asked
 * for. A consent dialog whose "no" does nothing is worse than no dialog.
 *
 * Written plainly. The room is strange; the disclosure is not the place for
 * that, and a cryptic privacy notice is just a dishonest one.
 */
function consentBar(): string {
  return `
  <div class="consentbar" id="consentbar" role="region" aria-label="Memory preference">
    <div class="cn-in">
      <span class="cn-text">
        <b>This room can remember you.</b>
        It keeps how you arrived and what you did here, on this site only, so
        a second visit is not identical to the first. No advertising, no third
        parties, nothing about where else you have been.
      </span>
      <span class="cn-acts">
        <button type="button" id="cn-yes">Let it remember</button>
        <button type="button" id="cn-no">Keep me a stranger</button>
      </span>
    </div>
  </div>`;
}

const CONSENT_JS = `
const cbar = document.getElementById('consentbar');
if (cbar) {
  const decide = async (choice) => {
    /*
     * Declining is acknowledged IN FICTION rather than punished. The room
     * gets the last word, the visitor keeps the entire game, and nothing
     * about the experience is withheld — only the memory of them.
     */
    if (choice === 'denied' && typeof say === 'function') {
      say('The room will not remember you. It has already forgotten agreeing to that.');
    }
    cbar.style.transform = 'translateY(110%)';
    document.body.classList.remove('needs-consent');
    setTimeout(() => cbar.remove(), 320);
    try {
      await fetch('/bff/consent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ choice }),
      });
    } catch (_) { /* the choice is still applied locally for this page */ }
  };
  document.getElementById('cn-yes').addEventListener('click', () => decide('granted'));
  document.getElementById('cn-no').addEventListener('click', () => decide('denied'));
}
`;

function stickyCredit(credit: string): string {
  return `
  <div class="creditbar">
    <span class="cb-in">
      made with <span class="hrt">&hearts;</span> by two ghosts and a human
      <span class="cb-sep">&middot;</span>
      <span class="quip">${esc(credit)}</span>
      <span class="cb-sep">&middot;</span>
      powered by <a href="https://interchained.org" target="_blank" rel="noopener noreferrer">interchained</a>
    </span>
  </div>`;
}

/** Wired once, works on every page that includes footer(). */
const FOOTER_JS = `
const sub = document.getElementById('subform');
if (sub) sub.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('subemail');
  const note = document.getElementById('subnote');
  const btn = document.getElementById('subgo');
  const email = (input.value || '').trim();
  if (!email) return;
  btn.disabled = true;
  try {
    const r = await fetch('/bff/subscribe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const d = await r.json();
    note.textContent = d.message || 'Thank you.';
    if (d.ok) { input.value = ''; input.disabled = true; btn.textContent = 'Noted'; }
    else btn.disabled = false;
  } catch (_) {
    note.textContent = 'That did not reach the room. It may have reached something else.';
    btn.disabled = false;
  }
});
`;

export function renderRoom(v: RoomView): string {
  /*
   * THE COUNT HAS EXACTLY ONE SOURCE OF TRUTH.
   *
   * chairCount is the number of chairs that WILL be on screen once the late
   * one lands. The last chair is held back so the count visibly changes while
   * the visitor watches, but it is one OF that total, never an extra.
   *
   * The bug this replaces: the tally printed chairCount immediately (while
   * only chairCount-1 were visible), and then the client did
   * `count = Number(text) + 1`, landing on chairCount+1. So the room drew 4,
   * claimed 4, then announced 5 — and the artifact said something different
   * again. Three copies of one number, none of them agreeing. M caught it:
   * "it drew 5. but we both know it drew 4."
   *
   * Now the server sends both exact values and the client only ever ASSIGNS
   * them. No arithmetic in the browser means no third opinion.
   */
  const finalChairs = v.resolved.chairCount;
  const chairsBefore = Math.max(1, finalChairs - 1);   // one is held back
  const chairs = Array.from({ length: finalChairs }, (_, i) =>
    i === finalChairs - 1
      ? `<div class="chair pending" id="latechair"></div>`
      : `<div class="chair" style="animation-delay:${0.5 + i * 0.09}s"></div>`,
  ).join('');

  /*
   * THE STING ARRIVES AFTER YOU HAVE SETTLED.
   *
   * It is deliberately NOT part of the scene's first paint. It lands a couple
   * of seconds later, in its own visual register, so it reads as the room
   * saying something rather than the page loading something.
   */
  const stingHtml = v.sting
    ? `<p class="sting" id="sting">${esc(v.sting)}</p>`
    : '';

  /*
   * The echo sits INSIDE the room's own prose, not above it in a special box.
   * A consequence that announces itself as a consequence is a mechanic; one
   * that reads as just another thing the room said is a memory.
   */
  const echoHtml = v.echo
    ? `<p class="lede echo r d4">${esc(v.echo)}</p>`
    : '';

  /*
   * The afterimage is quieter than a sting on purpose. A sting is about what
   * you are doing right now; this is about who you have been, and that only
   * works if it is almost inaudible.
   */
  const afterHtml = v.afterimage
    ? `<p class="afterimage r d3">${esc(v.afterimage)}</p>`
    : '';

  let main = '';

  if (v.renderer === 'notice') {
    main = `
      <div class="notice r d3" id="notice">${esc(v.noticeText ?? 'PLEASE WAIT.')}</div>`;
  } else if (v.renderer === 'counting') {
    /*
     * YOU COUNT. NOT THE ROOM.
     *
     * The tally no longer fills itself in. You type a number, you commit to
     * it, and only then does the last chair arrive — so the answer you gave
     * was correct when you gave it. "Agree / disagree" stays disabled until
     * you have a position to agree from.
     */
    main = `
      <div class="objects r d3">${chairs}</div>
      <form class="tally r d4" id="countform" autocomplete="off">
        <div class="tallyrow"><span>the room says</span><b>${v.resolved.claimedChairCount}</b></div>
        <div class="tallyrow"><span>you count</span>
          <span class="guessing">
            <button type="button" class="step" id="stepdown" aria-label="fewer">&minus;</button>
            <input id="guess" name="guess" type="number" inputmode="numeric"
                   min="0" max="99" step="1" placeholder="?" aria-label="how many chairs you count">
            <button type="button" class="step" id="stepup" aria-label="more">+</button>
          </span>
        </div>
        <div class="tallyrow disagree" id="diffrow" hidden><span>difference</span><b id="chairdiff">0</b></div>
        <button class="commit" id="commit" type="submit">That is my count</button>
      </form>
      <p class="lede r d4" id="verdict">Count them yourself. The room has already made up its mind.</p>`;
  } else if (v.renderer === 'corridor') {
    /* The reveal. Two lines, staggered, then the fork. */
    main = `
      <div class="corridor r d3" id="corridor">
        <div class="doorway"><span class="doorlight"></span></div>
        <p class="reveal">${esc(v.secondHalf.corridorOpener)}</p>
        <p class="reveal sub">${esc(v.secondHalf.corridorSub)}</p>
      </div>`;
  } else if (v.renderer === 'ledger') {
    /* EVERY NUMBER HERE IS MEASURED. Nothing on this screen is invented. */
    const f = v.facts!;
    main = `
      <div class="ledger r d3">
        ${[
          ['people have been in this room', f.totalVisitors.toLocaleString()],
          ['of them reached the end', f.finished.toLocaleString()],
          ['you are visitor number', f.visitorNumber.toLocaleString()],
          ['you have been here', fmtDuration(f.yourMs)],
          ['most people last', fmtDuration(f.medianMs)],
          ['are in here with you right now', String(f.population)],
        ].map(([label, val], i) => `
          <div class="ledgerrow" style="animation-delay:${0.35 + i * 0.22}s">
            <b>${esc(val)}</b><span>${esc(label)}</span>
          </div>`).join('')}
      </div>
      <p class="lede r d5">${esc(comparisonLine(f.yourMs, f.medianMs))}</p>
      <p class="lede dim r d5">${esc(v.secondHalf.ledgerCloser)}</p>`;
  } else if (v.renderer === 'recital') {
    /* A real stranger's real words. Or your own, handed back unattributed. */
    const f = v.facts!;
    const q = f.quote?.text
      ? `<blockquote class="quote r d3">${esc(f.quote.text)}
           <cite>${esc(f.quote.handle)} &middot; ${f.quote.agoMin === 0 ? 'just now' : `${f.quote.agoMin} minutes ago`}</cite>
         </blockquote>
         <p class="lede r d4">${esc(v.secondHalf.recitalFrame)}</p>`
      : `<p class="lede r d3">Nobody has said anything in here yet. You are early.</p>`;
    const mine = f.yourQuote
      ? `<blockquote class="quote mine r d5">${esc(f.yourQuote)}
           <cite>and this one is yours</cite></blockquote>`
      : `<p class="lede dim r d5">${esc(v.secondHalf.recitalSilence)}</p>`;
    main = q + mine;
  } else if (v.renderer === 'inventory') {
    /* Being read back to yourself, using only what you handed over. */
    const f = v.facts!;
    const items = [
      `you arrived ${fmtDuration(f.yourMs)} ago`,
      ...(f.path.length ? [`you chose: ${f.path.join(', ').toLowerCase()}`] : []),
      // When the guess happens to match the drawing the line goes flat, so the
      // room's own stubborn claim is kept in frame. It never concedes.
      ...(f.guess !== undefined ? [f.guess === f.chairsDrawn
        ? `you said there were ${f.guess} chairs. there were ${f.chairsDrawn}. the room still says 4.`
        : `you said there were ${f.guess} chairs. there were ${f.chairsDrawn}.`] : []),
      f.pressed ? 'you pressed the button' : 'you left the button alone',
      `you have been in ${f.roomsSeen.length} of ${TOTAL_ROOMS} rooms`,
      ...(f.yourQuote ? [`you said: \u201C${f.yourQuote}\u201D`] : ['you did not speak']),
    ];
    main = `
      <p class="lede r d3">${esc(v.secondHalf.inventoryFrame)}</p>
      <ul class="inventory r d3">
        ${items.map((t, i) => `<li style="animation-delay:${0.4 + i * 0.19}s">${esc(t)}</li>`).join('')}
      </ul>`;
  } else if (v.renderer === 'dark') {
    /* Tempo spike. Lines land fast, one after another, then the choices. */
    main = `
      <div class="dark r d3" id="darkroom">
        ${v.secondHalf.darkLines.map((t, i) =>
          `<p class="darkline" style="animation-delay:${0.5 + i * 0.9}s">${esc(t)}</p>`).join('')}
        <p class="darkline hot" style="animation-delay:${0.5 + v.secondHalf.darkLines.length * 0.9}s">
          There are ${v.facts!.population} of us in here.</p>
      </div>`;
  } else if (v.renderer === 'office') {
    /* The room most visitors never reach. Its job is to be missing from
       somebody else's artifact. */
    const f = v.facts!;
    main = `
      <div class="office r d3">
        <div class="desk"></div>
        ${(v.officeLines ?? []).map((t, i) =>
          `<p class="lede" style="animation-delay:${0.4 + i * 0.5}s">${esc(t)}</p>`).join('')}
        <p class="lede hot">The form says: visitor ${f.visitorNumber}. Present. Counted.</p>
      </div>`;
  } else if (v.renderer === 'threshold') {
    /*
     * THE ONE PLACE THE ROOM ASKS YOU FOR SOMETHING.
     *
     * Every other interaction is selecting from options somebody else wrote.
     * Here the visitor contributes language, and the room decides what it
     * meant. The exit stays shut until they do — the only gate in the piece.
     *
     * It is at the threshold because by now they HAVE an impression to give;
     * asking on arrival would be asking about nothing.
     */
    const f = v.facts!;
    const missed = missedRooms(f.roomsSeen);
    main = `
      <div class="r d3">
        <div class="doorway open"><span class="doorlight"></span></div>
        <p class="lede">${esc(v.secondHalf.thresholdLine)}</p>
        ${missed.length ? `<p class="lede dim">You did not find ${esc(missed.slice(0, 2).join(' or '))}.
          They were here the whole time.</p>` : ''}
      </div>
      <form class="askform r d4" id="askform" autocomplete="off">
        <label for="answer">${esc(ANSWER_PROMPT)}</label>
        <textarea id="answer" name="answer" rows="2" maxlength="${ANSWER_MAX}"
                  placeholder="${esc(ANSWER_PLACEHOLDER)}" aria-label="${esc(ANSWER_PROMPT)}"></textarea>
        <div class="askrow">
          <span class="askcount" id="askcount">${ANSWER_MAX}</span>
          <button type="submit" id="askgo">Give it to the room</button>
        </div>
        <div class="asknote" id="asknote">Everyone in the room will see this.</div>
      </form>`;
  } else if (v.renderer === 'button') {
    main = `
      <div class="r d3">
        <div class="apology" id="apology">${esc(v.resolved.apology)}</div>
        <button class="bigbtn" id="thebutton"><span>Do not press this</span></button>
        <div class="counter"><b id="npc">${v.resolved.notPressedCount.toLocaleString()}</b>
          people have not pressed it.</div>
      </div>`;
  } else if (v.renderer === 'artifact' && v.artifact) {
    const a = v.artifact;
    /*
     * THE SAME CERTIFICATE AS THE PERMALINK.
     *
     * There are two places an artifact is drawn — the end of a run, and
     * /a/:token when somebody opens a shared link. Redesigning only the
     * permalink left the ending on the OLD layout, so the thing you saw and
     * the thing your friend saw were different objects. Exactly the "one rule,
     * two implementations" shape that has bitten this codebase all day, so
     * both now emit identical markup and share every .cert rule.
     */
    main = `
      <div class="cert r d3">
        <span class="tick tl"></span><span class="tick tr"></span>
        <span class="tick bl"></span><span class="tick br"></span>
        <header class="cert-head">
          <div class="cert-mark">${esc(a.mark)}</div>
          <div class="cert-meta">
            <div class="cert-kicker">Record of one visit</div>
            <div class="cert-serial">${v.shareToken ? `No. ${esc(v.shareToken)}` : 'unfiled'}</div>
          </div>
        </header>
        <h2 class="cert-title">${esc(a.title)}</h2>
        <ol class="cert-lines">
          ${a.lines.map((l, i) => `
            <li style="animation-delay:${(0.7 + BEAT[i % BEAT.length]).toFixed(2)}s">
              <span class="n">${String(i + 1).padStart(2, '0')}</span>
              <span class="t">${esc(l)}</span>
            </li>`).join('')}
        </ol>
        <p class="cert-closing">${esc(a.closing)}</p>
        <footer class="cert-foot">
          <div class="cert-seal">
            ${a.historyIntact
              ? `<span class="seal ok">&#10003;</span><span>${a.chainLength} moments, hash-linked, unaltered</span>`
              : `<span class="seal bad">!</span><span>this history could not be verified</span>`}
          </div>
          <div class="cert-brand">thrilling.world</div>
        </footer>
      </div>
      <div class="drawbox r d4" id="drawbox">
        <div class="drawlbl">the room would like to draw you something</div>
        <div class="drawart" id="drawart"><span class="drawing-wait">it is trying</span></div>
        <div class="drawcap" id="drawcap"></div>
      </div>

      <div class="endbar r d5">
        <button class="bigbtn" id="again"><span>Again</span></button>
        ${v.shareToken ? `<a class="bigbtn" href="/a/${esc(v.shareToken)}" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center"><span>Keep this</span></a>` : ''}
        <span class="endnote">it will not be the same room.</span>
      </div>`;
  } else {
    main = `<div class="objects r d3">${chairs}</div>`;
  }

  main = afterHtml + main + echoHtml + stingHtml;

  const choices = v.choices.length ? `
    <div class="choices r d5">
      ${v.choices.map((c) => `<button class="choice" data-choice="${esc(c.id)}"${v.renderer === 'counting' || (v.renderer === 'threshold' && !v.answered) ? ' disabled' : ''}${c.hover ? ` data-hover="${esc(c.hover)}"` : ''}>
        <span>${esc(c.label)}</span><span class="arrow">&rarr;</span></button>`).join('')}
    </div>` : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>SHOCKME</title>
<!--
  The room is noindex — it is per-visitor and there is nothing stable to
  index. But the URL still gets FORWARDED, so it must unfurl. og:url and
  og:image are absolute from SHOCKME_ORIGIN: a relative og:image unfurls
  nowhere, and behind Cloudflare the request host is not trustworthy.
-->
<meta property="og:type" content="website">
<meta property="og:site_name" content="SHOCKME">
<meta property="og:url" content="${esc(v.origin)}/">
<meta property="og:title" content="You didn't find the same website they did.">
<meta property="og:description" content="Somebody else is in this room right now. They are not being told what you are being told.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="You didn't find the same website they did.">
<meta name="twitter:description" content="Somebody else is in this room right now. They are not being told what you are being told.">
<meta name="theme-color" content="#0a0806">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head><body>
<div class="wrap"><main class="room">
  <div class="eyebrow r d1">
    <span class="dot"></span>
    <span>The Waiting Room</span>
    <b>${v.visitCount > 0 ? `visit ${v.visitCount + 1}` : 'first visit'}</b>
  </div>
  <h1 class="r d2">${esc(v.greeting)}</h1>
  ${v.body ? `<p class="lede r d2">${esc(v.body)}</p>` : ''}
  <div class="aside" id="aside"></div>
  ${main}
  ${choices}
</main></div>
${chatRail(v.lines)}
${v.needsConsent ? consentBar() : ''}
${stickyCredit(creditFor(v.resolved.greeting + String(v.visitCount)))}
<script type="module">
${FOOTER_JS}
${CONSENT_JS}
const NUDGES = ${JSON.stringify(v.nudges)};
document.body.classList.add('sk-' + ${JSON.stringify(v.variant.skin)}, 'ch-' + ${JSON.stringify(v.variant.chairs)});
if (${v.variant.hum ? 'true' : 'false'}) document.body.classList.add('hum');
if (document.getElementById('consentbar')) document.body.classList.add('needs-consent');
if (document.getElementById('darkroom')) document.body.classList.add('lightsout');
const NUDGE_LATE_CHAIR = ${v.lateChairAfterMs};
const CHAIRS_FINAL = ${finalChairs};
const CHAIRS_DIFF = ${Math.abs(finalChairs - v.resolved.claimedChairCount)};
const post = (p, b) => fetch(p, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});

document.querySelectorAll('[data-choice]').forEach(el => {
  el.addEventListener('click', async () => {
    acted = true;
    document.body.style.transition = 'opacity .34s'; document.body.style.opacity = '0';
    await post('/bff/choose', { choiceId: el.dataset.choice });
    location.href = '/room';
  });
});

// the apology appears before you touch it, not after
const btn = document.getElementById('thebutton'), ap = document.getElementById('apology');
if (btn) {
  const reveal = () => ap && ap.classList.add('show');
  btn.addEventListener('mouseenter', reveal);
  btn.addEventListener('focus', reveal);
  setTimeout(reveal, 2600);
  btn.addEventListener('click', async () => {
    const r = await (await post('/bff/press', {})).json();
    const npc = document.getElementById('npc');
    if (npc) npc.textContent = r.notPressedCount.toLocaleString();
    btn.querySelector('span').textContent = r.message;
    if (ap) ap.textContent = 'Thank you for not pressing it.';
  });
}

// the room draws. this takes seconds and that is the point — you watch it
// struggle. the page never waits on it; the attempt arrives when it arrives.
const dbox = document.getElementById('drawart');
if (dbox) (async () => {
  try {
    const d = await (await fetch('/bff/drawing')).json();
    dbox.innerHTML = '';
    if (d.blank || !d.lines || !d.lines.length) {
      dbox.textContent = '';
    } else {
      d.lines.forEach((l, i) => {
        const el = document.createElement('div');
        el.className = 'ln'; el.style.animationDelay = (0.12 * i) + 's';
        el.textContent = l;
        dbox.appendChild(el);
      });
    }
    const cap = document.getElementById('drawcap');
    if (cap) cap.textContent = d.caption || '';
    const lbl = document.querySelector('.drawlbl');
    if (lbl && d.subject) lbl.textContent = 'it was asked to draw ' + d.subject;
  } catch {
    dbox.textContent = '';
    const cap = document.getElementById('drawcap');
    if (cap) cap.textContent = 'It stopped part way through.';
  }
})();

// again -> a genuinely different branch, chained to this one
const again = document.getElementById('again');
if (again) again.addEventListener('click', async () => {
  document.body.style.transition='opacity .4s'; document.body.style.opacity='0';
  await post('/bff/replay', {});
  location.href = '/room';
});

// dwell — the notice rewards attention
let dwell = 0;
const notice = document.getElementById('notice');
if (notice) setInterval(async () => {
  dwell += 1500;
  const r = await (await post('/bff/dwell', { dwellMs: dwell })).json();
  if (r.text && r.text !== notice.textContent) {
    notice.style.transition='opacity .4s'; notice.style.opacity='0';
    setTimeout(()=>{notice.textContent=r.text;notice.style.opacity='1';}, 400);
  }
}, 1500);

/*
 * THE ROOM REACTS. This is the difference between odd and fun.
 *
 * Measured before this existed: 78% of arrivals left without a single click.
 * Nothing on the page responded to anything until you committed to a choice,
 * so there was no reason to believe anything would.
 */
const aside = document.getElementById('aside');
let acted = false;
const say = (t) => {
  if (!aside) return;
  aside.classList.remove('show');
  setTimeout(() => { aside.textContent = t; aside.classList.add('show'); }, 260);
};

// 1. hovering a choice gets an opinion BEFORE you commit to it
document.querySelectorAll('[data-hover]').forEach((el) => {
  const line = el.getAttribute('data-hover');
  const show = () => { if (line) say(line); };
  el.addEventListener('mouseenter', show);
  el.addEventListener('focus', show);
  el.addEventListener('touchstart', show, { passive: true });
});

// 2. THE LATE CHAIR WAITS FOR YOU TO COMMIT.
//
// It used to arrive on a timer whether or not you were paying attention, which
// made it wallpaper. Now it arrives ~1.4s AFTER you write your number down, so
// the count you gave was true when you gave it. The room does not tell you you
// are wrong; it just quietly stops being the room you counted.
const late = document.getElementById('latechair');
const cf = document.getElementById('countform');

function landLateChair(guess) {
  if (late) {
    late.classList.remove('pending');   // never touch .style — see .chair.pending
    late.classList.add('late');
  }
  const df = document.getElementById('chairdiff');
  const row = document.getElementById('diffrow');
  if (df && row) {
    row.hidden = false;
    // Difference is against YOUR number now, not the room's running tally.
    df.textContent = String(Math.abs(guess - CHAIRS_FINAL));
  }
}

if (cf) {
  const gi = document.getElementById('guess');
  const commit = document.getElementById('commit');
  const step = (d) => {
    const n = Math.max(0, Math.min(99, (parseInt(gi.value, 10) || 0) + d));
    gi.value = String(n);
    gi.dispatchEvent(new Event('input'));
  };
  document.getElementById('stepup').addEventListener('click', () => step(1));
  document.getElementById('stepdown').addEventListener('click', () => step(-1));
  gi.addEventListener('input', () => { commit.disabled = gi.value === ''; });
  commit.disabled = true;
  setTimeout(() => gi.focus({ preventScroll: true }), 900);

  cf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const guess = parseInt(gi.value, 10);
    if (!Number.isInteger(guess)) return;

    gi.readOnly = true;
    commit.disabled = true;
    commit.textContent = 'Written down';
    document.getElementById('stepup').disabled = true;
    document.getElementById('stepdown').disabled = true;

    let line = '';
    try {
      const r = await fetch('/bff/count', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ guess }),
      });
      line = (await r.json()).line || '';
    } catch (_) { /* the room keeps its opinion to itself */ }

    // beat one: the room acknowledges the number you gave
    setTimeout(() => { if (line) say(line); }, 500);
    // beat two: and then a chair walks in
    setTimeout(() => {
      landLateChair(guess);
      const v = document.getElementById('verdict');
      if (v) v.textContent = line || 'The room is not going to change its mind.';
      // only now do you have something to agree or disagree WITH
      document.querySelectorAll('[data-choice]').forEach((b) => { b.disabled = false; });
    }, 1400);
  });
} else if (late) {
  // any other scene showing chairs keeps the original timed arrival
  setTimeout(() => { late.classList.remove('pending'); late.classList.add('late'); }, NUDGE_LATE_CHAIR);
}

// the threshold asks you for something, and will not open until you answer
const ask = document.getElementById('askform');
if (ask) {
  const ta = document.getElementById('answer');
  const go = document.getElementById('askgo');
  const note = document.getElementById('asknote');
  const count = document.getElementById('askcount');
  const MAXA = ${ANSWER_MAX};
  go.disabled = true;
  ta.addEventListener('input', () => {
    const left = MAXA - ta.value.length;
    count.textContent = String(left);
    count.classList.toggle('low', left < 30);
    go.disabled = ta.value.trim().length < 2;
  });
  ask.addEventListener('submit', async (e) => {
    e.preventDefault();
    go.disabled = true;
    try {
      const r = await fetch('/bff/answer', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: ta.value }),
      });
      const d = await r.json();
      note.textContent = d.message;
      note.classList.add('done');
      if (d.ok) {
        ta.disabled = true;
        go.textContent = 'Given';
        // the way out opens
        document.querySelectorAll('[data-choice]').forEach((b) => { b.disabled = false; });
      } else { go.disabled = false; }
    } catch (_) {
      note.textContent = 'It did not reach the room. Try once more.';
      go.disabled = false;
    }
  });
}

// 3. the room notices you doing nothing, and escalates gently
let nudgeAt = 0;
const nudgeTimer = setInterval(() => {
  if (acted || document.hidden) return;
  if (nudgeAt >= NUDGES.length) { clearInterval(nudgeTimer); return; }
  say(NUDGES[nudgeAt++]);
}, 7400);
setTimeout(() => { if (!acted && NUDGES.length) say(NUDGES[nudgeAt++]); }, 6200);

// speaking into the room
const sf = document.getElementById('sayform');
if (sf) sf.addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = document.getElementById('sayin');
  const note = document.getElementById('saynote');
  const text = (inp.value || '').trim();
  if (!text) return;
  const btn = sf.querySelector('button'); btn.disabled = true;
  try {
    const r = await (await post('/bff/say', { text })).json();
    if (r.ok) {
      inp.value = '';
      // Deliberately does NOT confirm 'sent'. The room acknowledges; it does
      // not report success like a form. Your line arrives in the rail the
      // same way everyone else's does, with no marker saying it was yours.
      note.textContent = 'It is in the room now.';
    } else {
      note.textContent = r.message || 'That did not make it into the room.';
    }
  } catch { note.textContent = 'The room did not hear that.'; }
  setTimeout(() => { btn.disabled = false; note.textContent = ''; }, 4000);
});

// the room keeps talking
const lines = document.getElementById('lines');
if (lines) new EventSource('/bff/stream').onmessage = (e) => {
  const l = JSON.parse(e.data);
  const el = document.createElement('div');
  el.className = 'line' + (l.diverged ? ' div' : '');
  el.innerHTML = '<div class="who"></div><div class="txt"></div>';
  el.querySelector('.who').textContent = l.handle;
  el.querySelector('.txt').textContent = l.text;
  lines.appendChild(el);
  while (lines.children.length > 9) lines.removeChild(lines.firstChild);
};
</script>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/* The artifact permalink — the public plane                           */
/* ------------------------------------------------------------------ */

export interface ArtifactView {
  token: string;
  title: string;
  lines: string[];
  closing: string;
  historyIntact: boolean;
  chainLength: number;
  origin: string;
  /** True when the viewer is the person it happened to. */
  isOwner: boolean;
}

/**
 * A stranger with no cookie must be able to read this and want one.
 *
 * Unlike the room, this page IS indexable and IS cacheable — it is the same
 * for everyone who opens it, because it describes something that already
 * happened. That is exactly why it can carry OG tags and be forwarded, and
 * why the room itself cannot.
 */
export function renderArtifact(v: ArtifactView): string {
  const url = `${v.origin}/a/${v.token}`;
  /*
   * Shipped a literal `${v.chairHint}` into a real tweet because a scripted
   * edit produced a broken template literal and nothing checked the OUTPUT
   * string. Any change to this line must be verified by reading the decoded
   * text, not by reading the source.
   */
  const shareText = `"${v.title}"\n\nit gave me a different room than it gave you.`;
  const tweet =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}` +
    `&url=${encodeURIComponent(url)}`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(v.title)} — SHOCKME</title>
<meta name="description" content="${esc(v.lines[0] ?? '')} A record of one visit to a room that gives everyone a different version.">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="SHOCKME">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(v.title)}">
<meta property="og:description" content="${esc(v.lines[1] ?? v.lines[0] ?? '')} — one visit, kept. Yours will not say this.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(v.title)}">
<meta name="twitter:description" content="${esc(v.lines[1] ?? v.lines[0] ?? '')} — yours will not say this.">
<meta name="theme-color" content="#0a0806">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}
.paper{max-width:660px;margin:0 auto;padding:9vh 0 5rem}


@media(max-width:860px){
  .paper{padding:6vh 0 3rem}
  .actions{flex-direction:column}
  .act{width:100%}
}
</style>
</head><body>
<div class="wrap"><main class="paper">
  <!--
    THE CERTIFICATE.

    M: "improve the wireframe of the artifact, more elegant and shareable,
    classy yet mambo #5? bada pa pa pa"

    Two instructions that pull opposite ways, which is what makes it a brief.
    CLASSY is the frame: registration marks at the corners, a serial number, a
    verification seal, generous margins, nothing shouting. MAMBO is the
    RHYTHM — Mambo No. 5 is a list song, and so is this. The lines are
    numbered and they land on a beat rather than a linear fade, so reading it
    has a pulse instead of a scroll.

    Built to be screenshotted: a hard-edged card with its own boundary, the
    domain set into the bottom rule, and type large enough to survive being
    cropped and re-posted at half size.
  -->
  <div class="cert r d1">
    <span class="tick tl"></span><span class="tick tr"></span>
    <span class="tick bl"></span><span class="tick br"></span>

    <header class="cert-head">
      <div class="cert-mark">&#9672;</div>
      <div class="cert-meta">
        <div class="cert-kicker">Record of one visit</div>
        <div class="cert-serial">No. ${esc(v.token)}</div>
      </div>
    </header>

    <h2 class="cert-title">${esc(v.title)}</h2>

    <ol class="cert-lines">
      ${v.lines.map((l, i) => `
        <li style="animation-delay:${(0.55 + BEAT[i % BEAT.length]).toFixed(2)}s">
          <span class="n">${String(i + 1).padStart(2, '0')}</span>
          <span class="t">${esc(l)}</span>
        </li>`).join('')}
    </ol>

    <p class="cert-closing">${esc(v.closing)}</p>

    <footer class="cert-foot">
      <div class="cert-seal">
        ${v.historyIntact
          ? `<span class="seal ok">&#10003;</span><span>${v.chainLength} moments, hash-linked, unaltered since</span>`
          : `<span class="seal bad">!</span><span>this record could not be verified</span>`}
      </div>
      <div class="cert-brand">thrilling.world</div>
    </footer>
  </div>

  <div class="whose r d3">${v.isOwner
    ? 'This happened to you.'
    : 'This happened to someone else. It will not happen to you.'}</div>

  <div class="actions r d4">
    <a class="act" href="${esc(tweet)}" target="_blank" rel="noopener noreferrer">Show someone</a>
    <button class="act" id="copy">Copy the link</button>
  </div>

  <div class="enter r d5">
    <p><em>This is not a preview.</em> It already happened to somebody, once, and
       the room has no way to run it again. Yours will be a different room with
       a different number of chairs, and it will end with a different sentence.</p>
    <a class="act primary" href="/again">Go in</a>
  </div>

  ${footer()}
</main></div>
${stickyCredit(creditFor(v.token))}
<script type="module">
${FOOTER_JS}
${CONSENT_JS}
const c = document.getElementById('copy');
c?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(${JSON.stringify(url)});
        c.textContent = 'The link has been copied. It was already copied.';
        setTimeout(() => { c.textContent = 'Copy the link'; }, 3200);
  } catch { c.textContent = 'It would not let me.'; }
});
</script>
</body></html>`;
}
