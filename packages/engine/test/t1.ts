import { chatAt, observeWindow, inhabitantsAt, populationAt, currentTick } from '../src/world.ts';

const T = 500000;
const a = JSON.stringify(chatAt(T)), b = JSON.stringify(chatAt(T));
console.log('1. same tick reproducible :', a === b ? 'PASS' : 'FAIL');

const s1='seed_alpha', s2='seed_bravo';
const o1 = observeWindow(T, T+40, s1, {lastChoice:'the blue one'});
const o2 = observeWindow(T, T+40, s2, {lastChoice:'the blue one'});
console.log('2. same observer stable   :',
  JSON.stringify(o1)===JSON.stringify(observeWindow(T,T+40,s1,{lastChoice:'the blue one'}))?'PASS':'FAIL');

const diffs = o1.filter((l,i)=> l.text !== o2[i]!.text);
console.log(`3. observers diverge      : ${diffs.length}/${o1.length} lines differ ->`, diffs.length>0?'PASS':'FAIL');
console.log('4. population curve       :', [0,30,60,90,120,150].map(d=>populationAt(T+d)).join(','));
console.log('5. line volume            :', o1.length, 'lines over 40 ticks (~2.7 min)');
console.log('\n--- observer A ---');
o1.slice(0,6).forEach(l=>console.log(`  ${l.handle}: ${l.text}${l.diverged?'   [diverged]':''}`));
console.log('--- observer B, same instants ---');
o2.slice(0,6).forEach(l=>console.log(`  ${l.handle}: ${l.text}${l.diverged?'   [diverged]':''}`));
