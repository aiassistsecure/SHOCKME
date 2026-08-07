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
:root{
  --ink:#f4f2ec; --void:#0a0a0b; --void2:#111113;
  --acid:#c8ff2f; --dim:#6b6b70; --line:#232327;
  --serif:"Instrument Serif",Georgia,serif;
  --sans:"Inter",system-ui,-apple-system,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  background:var(--void); color:var(--ink); font-family:var(--sans);
  font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
/* grain — one repeating svg, no image request, composited away from layout */
body::after{
  content:""; position:fixed; inset:-50%; pointer-events:none; z-index:99;
  opacity:.16; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
  animation:grain 6s steps(6) infinite;
}
@keyframes grain{
  0%{transform:translate(0,0)} 20%{transform:translate(-3%,2%)}
  40%{transform:translate(2%,-3%)} 60%{transform:translate(-2%,-2%)}
  80%{transform:translate(3%,1%)} 100%{transform:translate(0,0)}
}
.wrap{max-width:1080px;margin:0 auto;padding:0 7vw;position:relative;z-index:2}
.room{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:12vh 0}

/* ---- entrance choreography: staggered, transform+opacity only ---- */
.r{opacity:0;transform:translateY(14px);animation:rise .9s cubic-bezier(.16,1,.3,1) forwards}
@keyframes rise{to{opacity:1;transform:none}}
.d1{animation-delay:.05s}.d2{animation-delay:.22s}.d3{animation-delay:.42s}
.d4{animation-delay:.62s}.d5{animation-delay:.86s}.d6{animation-delay:1.1s}

.eyebrow{
  font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:var(--dim);
  display:flex;gap:14px;align-items:center;margin-bottom:2.6rem
}
.eyebrow b{color:var(--acid);font-weight:500}
.dot{width:5px;height:5px;border-radius:50%;background:var(--acid);
  animation:pulse 2.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.25;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}

h1{
  font-family:var(--serif); font-weight:400;
  font-size:clamp(2.6rem,7.5vw,5.6rem); line-height:.98;
  letter-spacing:-.02em; margin-bottom:1.8rem; max-width:16ch;
}
h1 em{font-style:italic;color:var(--acid)}
.lede{font-size:clamp(1rem,1.9vw,1.3rem);color:#b9b7b1;max-width:46ch;margin-bottom:3.2rem}

/* ---- the room objects ---- */
.objects{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:3rem}
.chair{
  width:34px;height:44px;border:1px solid var(--line);border-bottom-width:3px;
  border-radius:3px 3px 0 0;position:relative;opacity:0;
  animation:rise .7s cubic-bezier(.16,1,.3,1) forwards;
  transition:transform .45s cubic-bezier(.16,1,.3,1),border-color .45s
}
.chair::after{content:"";position:absolute;left:6px;right:6px;top:12px;height:1px;background:var(--line)}
.chair:hover{transform:translateY(-6px) rotate(-3deg);border-color:var(--acid)}

/* ---- choices ---- */
.choices{display:flex;flex-direction:column;gap:2px;max-width:520px}
.choice{
  appearance:none;background:transparent;border:0;border-top:1px solid var(--line);
  color:var(--ink);font-family:var(--sans);font-size:1.05rem;text-align:left;
  padding:1.15rem .25rem;cursor:pointer;position:relative;
  display:flex;justify-content:space-between;align-items:center;gap:1rem;
  transition:color .3s,padding-left .45s cubic-bezier(.16,1,.3,1)
}
.choice:last-child{border-bottom:1px solid var(--line)}
.choice .arrow{color:var(--dim);transform:translateX(-6px);opacity:0;
  transition:transform .45s cubic-bezier(.16,1,.3,1),opacity .3s}
.choice:hover,.choice:focus-visible{color:var(--acid);padding-left:1.1rem;outline:none}
.choice:hover .arrow,.choice:focus-visible .arrow{transform:none;opacity:1;color:var(--acid)}
.choice::before{
  content:"";position:absolute;left:0;top:-1px;height:1px;width:0;background:var(--acid);
  transition:width .5s cubic-bezier(.16,1,.3,1)
}
.choice:hover::before,.choice:focus-visible::before{width:100%}

/* ---- the notice ---- */
.notice{
  border:1px solid var(--line);padding:clamp(1.6rem,4vw,3rem);margin-bottom:3rem;
  font-family:var(--sans);letter-spacing:.16em;font-size:clamp(.8rem,1.5vw,1rem);
  line-height:2;background:var(--void2);position:relative;overflow:hidden
}
.notice::before{
  content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,transparent,rgba(200,255,47,.045),transparent);
  transform:translateY(-100%);animation:scan 7s linear infinite
}
@keyframes scan{to{transform:translateY(100%)}}

/* ---- the button that apologises ---- */
.apology{color:var(--dim);font-style:italic;font-family:var(--serif);
  font-size:1.15rem;height:1.6em;margin-bottom:.7rem;
  opacity:0;transform:translateY(6px);transition:opacity .5s,transform .5s}
.apology.show{opacity:1;transform:none}
.bigbtn{
  appearance:none;background:transparent;border:1px solid var(--acid);color:var(--acid);
  font-family:var(--sans);font-size:.82rem;letter-spacing:.28em;text-transform:uppercase;
  padding:1.4rem 3rem;cursor:pointer;position:relative;overflow:hidden;
  transition:color .4s,transform .3s cubic-bezier(.16,1,.3,1)
}
.bigbtn span{position:relative;z-index:2}
.bigbtn::before{
  content:"";position:absolute;inset:0;background:var(--acid);
  transform:scaleX(0);transform-origin:left;transition:transform .5s cubic-bezier(.16,1,.3,1)
}
.bigbtn:hover{color:var(--void)}
.bigbtn:hover::before{transform:scaleX(1)}
.bigbtn:active{transform:scale(.98)}
.counter{color:var(--dim);font-size:.85rem;margin-top:1.1rem;font-variant-numeric:tabular-nums}
.counter b{color:var(--ink)}

/* ---- the chat rail ---- */
.rail{
  position:fixed;right:0;top:0;bottom:0;width:min(300px,26vw);
  border-left:1px solid var(--line);background:rgba(10,10,11,.72);
  backdrop-filter:blur(14px);padding:1.5rem 1.2rem;overflow:hidden;z-index:5;
  display:flex;flex-direction:column;gap:.9rem
}
.rail h2{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--dim);font-weight:500}
.lines{display:flex;flex-direction:column;gap:.85rem;overflow:hidden;flex:1}
.line{opacity:0;transform:translateY(8px);animation:rise .6s cubic-bezier(.16,1,.3,1) forwards}
.line .who{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.line .txt{font-size:.86rem;color:#cfcdc7;line-height:1.5}
.line.div .txt{color:var(--acid)}
@media(max-width:860px){
  .rail{position:static;width:auto;border-left:0;border-top:1px solid var(--line);
    background:transparent;backdrop-filter:none;max-height:none}
  .wrap{padding:0 6vw}
}
@media(min-width:861px){.wrap{padding-right:calc(7vw + min(300px,26vw))}}

@media(prefers-reduced-motion:reduce){
  *{animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.01ms!important}
  body::after{animation:none}
}
`;

/* ------------------------------------------------------------------ */

export interface RoomView {
  sceneId: string;
  renderer: string;
  greeting: string;
  body: string;
  choices: { id: string; label: string }[];
  resolved: Resolved;
  lines: ObservedLine[];
  visitCount: number;
  noticeText?: string;
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
  </aside>`;
}

export function renderRoom(v: RoomView): string {
  const chairs = Array.from({ length: v.resolved.chairCount }, (_, i) =>
    `<div class="chair" style="animation-delay:${0.5 + i * 0.09}s"></div>`).join('');

  let main = '';

  if (v.renderer === 'notice') {
    main = `
      <div class="notice r d3" id="notice">${esc(v.noticeText ?? 'PLEASE WAIT.')}</div>`;
  } else if (v.renderer === 'counting') {
    main = `
      <div class="objects r d3">${chairs}</div>
      <p class="lede r d4">The room says there are
        <b style="color:var(--acid)">${v.resolved.claimedChairCount}</b> chairs.
        You have counted <b style="color:var(--acid)">${v.resolved.chairCount}</b>.
        The room is not going to change its mind.</p>`;
  } else if (v.renderer === 'button') {
    main = `
      <div class="r d3">
        <div class="apology" id="apology">${esc(v.resolved.apology)}</div>
        <button class="bigbtn" id="thebutton"><span>Do not press this</span></button>
        <div class="counter"><b id="npc">${v.resolved.notPressedCount.toLocaleString()}</b>
          people have not pressed it.</div>
      </div>`;
  } else {
    main = `<div class="objects r d3">${chairs}</div>`;
  }

  const choices = v.choices.length ? `
    <div class="choices r d5">
      ${v.choices.map((c) => `<button class="choice" data-choice="${esc(c.id)}">
        <span>${esc(c.label)}</span><span class="arrow">&rarr;</span></button>`).join('')}
    </div>` : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>SHOCKME</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500&display=swap" rel="stylesheet">
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
  ${main}
  ${choices}
</main></div>
${chatRail(v.lines)}
<script type="module">
const post = (p, b) => fetch(p, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});

document.querySelectorAll('[data-choice]').forEach(el => {
  el.addEventListener('click', async () => {
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
