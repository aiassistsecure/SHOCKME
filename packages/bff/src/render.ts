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

import type { Resolved } from '../../engine/src/experiences/waiting-room.ts';
import type { ObservedLine } from '../../engine/src/world.ts';

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

/* a chair that arrives late, while you are looking at it */
.chair.late{animation:arrive 1.1s cubic-bezier(.16,1,.3,1) forwards}
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
.tally{max-width:420px;margin-bottom:1.8rem;border:1px solid var(--line)}
.tallyrow{display:flex;justify-content:space-between;align-items:baseline;
  padding:.75rem 1rem;border-bottom:1px solid rgba(42,35,24,.7);font-size:.9rem;color:var(--phos-dim)}
.tallyrow:last-child{border-bottom:0}
.tallyrow b{font-family:var(--crt);font-size:2rem;line-height:1;color:var(--phos-hot)}
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

    <div class="jar">
      this runs on a machine somebody pays for.<br>
      <a href="https://cash.app/$interchained" target="_blank" rel="noopener noreferrer">
        <span class="amt">$interchained</span></a>
    </div>
  </aside>`;
}

export function renderRoom(v: RoomView): string {
  /*
   * The last chair is held back. It is rendered with the others but hidden,
   * and arrives a few seconds later under its own animation — so the count
   * changes WHILE the visitor is looking, before they have clicked anything.
   */
  const chairs = Array.from({ length: v.resolved.chairCount }, (_, i) => {
    const isLate = i === v.resolved.chairCount - 1;
    return isLate
      ? `<div class="chair" id="latechair" style="opacity:0;animation:none"></div>`
      : `<div class="chair" style="animation-delay:${0.5 + i * 0.09}s"></div>`;
  }).join('');

  let main = '';

  if (v.renderer === 'notice') {
    main = `
      <div class="notice r d3" id="notice">${esc(v.noticeText ?? 'PLEASE WAIT.')}</div>`;
  } else if (v.renderer === 'counting') {
    main = `
      <div class="objects r d3">${chairs}</div>
      <div class="tally r d4">
        <div class="tallyrow"><span>the room says</span><b>${v.resolved.claimedChairCount}</b></div>
        <div class="tallyrow"><span>you have counted</span><b id="chaircount">${v.resolved.chairCount}</b></div>
        <div class="tallyrow disagree"><span>difference</span><b>${Math.abs(v.resolved.chairCount - v.resolved.claimedChairCount)}</b></div>
      </div>
      <p class="lede r d4">The room is not going to change its mind.</p>`;
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
    main = `
      <div class="artifact r d3">
        <div class="artifact-mark">${esc(a.mark)}</div>
        <h2 class="artifact-title">${esc(a.title)}</h2>
        <ul class="artifact-lines">
          ${a.lines.map((l, i) => `<li style="animation-delay:${0.7 + i * 0.13}s">${esc(l)}</li>`).join('')}
        </ul>
        <p class="artifact-closing">${esc(a.closing)}</p>
        <div class="artifact-seal">
          ${a.historyIntact
            ? `<span class="seal ok">&#10003;</span> your history is intact. ${a.chainLength} moments, hash-linked, unaltered.`
            : `<span class="seal bad">!</span> this history could not be verified.`}
        </div>
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

  const choices = v.choices.length ? `
    <div class="choices r d5">
      ${v.choices.map((c) => `<button class="choice" data-choice="${esc(c.id)}"${c.hover ? ` data-hover="${esc(c.hover)}"` : ''}>
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
<script type="module">
const NUDGES = ${JSON.stringify(v.nudges)};
const NUDGE_LATE_CHAIR = ${v.lateChairAfterMs};
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

// 2. one more chair arrives while you are looking at the room
const late = document.getElementById('latechair');
if (late) setTimeout(() => {
  late.style.opacity = '';
  late.classList.add('late');
  const c = document.getElementById('chaircount');
  if (c) { c.textContent = String(Number(c.textContent || '0') + 1); c.style.color = 'var(--phos-hot)'; }
}, NUDGE_LATE_CHAIR);

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
@media(max-width:860px){
  .paper{padding:6vh 0 3rem}
  .actions{flex-direction:column}
  .act{width:100%}
}
</style>
</head><body>
<div class="wrap"><main class="paper">
  <div class="filed r d1">
    <span class="dot"></span>
    <span>Record ${esc(v.token)}</span>
    <span>·</span>
    <span>${v.isOwner ? 'this happened to you' : 'this happened to someone else'}</span>
  </div>

  <div class="artifact r d2">
    <div class="artifact-mark">&#9672;</div>
    <h2 class="artifact-title">${esc(v.title)}</h2>
    <ul class="artifact-lines">
      ${v.lines.map((l, i) => `<li style="animation-delay:${0.5 + i * 0.12}s">${esc(l)}</li>`).join('')}
    </ul>
    <p class="artifact-closing">${esc(v.closing)}</p>
    <div class="artifact-seal">
      ${v.historyIntact
        ? `<span class="seal ok">&#10003;</span> ${v.chainLength} moments, hash-linked, unaltered since.`
        : `<span class="seal bad">!</span> this record could not be verified.`}
    </div>
  </div>

  <div class="actions r d4">
    <a class="act" href="${esc(tweet)}" target="_blank" rel="noopener noreferrer">Show someone</a>
    <button class="act" id="copy">Copy the link</button>
  </div>

  <div class="enter r d5">
    <p><em>This is not a preview.</em> It already happened to somebody, once, and
       the room has no way to run it again. Yours will be a different room with
       a different number of chairs, and it will end with a different sentence.</p>
    <a class="act primary" href="/">Go in</a>
  </div>

  <div class="jar r d6" style="margin-top:3rem;border-top:1px solid var(--line);padding-top:1.2rem">
    this runs on a machine somebody pays for.<br>
    <a href="https://cash.app/$interchained" target="_blank" rel="noopener noreferrer">
      <span class="amt">$interchained</span></a>
  </div>
</main></div>
<script type="module">
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
