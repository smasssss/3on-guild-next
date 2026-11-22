// 2026-11-22 user decision: a saved 런닝머신 레이스 record is replayed by recomputing it from its seed (추첨 번호),
// so the same seed must always give the same race. These races were computed when settings version 1 (RACE_V1) was fixed;
// if any of them changes, saved records would no longer replay — add a new settings version instead of changing version 1.
// Rules checked: items are chosen slot by slot (the doll at most once, the three cars together count as one kind),
// slot owners come from the simple pinball (entry order = slot 1..N), fall order = last place first.
import assert from 'node:assert/strict';
import RAPIER from '../public/treadmill3d/vendor/rapier.mjs';
import {createRace,createDrop,pickKinds,RACE_V1,KINDS,MAX_RACE_SECONDS,dsin,dcos,dexp} from '../public/treadmill3d/sim.mjs';
await RAPIER.init();
function play(seed,n){const d=createDrop(RAPIER,n,seed);while(!d.finished())d.step();const owner=d.order.slice();d.world.free();
 const kinds=pickKinds(seed,n,RACE_V1.carW),g=createRace(RAPIER,kinds,seed,RACE_V1);while(!g.finished()&&g.t<MAX_RACE_SECONDS)g.step();
 const out={kinds,slots:owner,order:g.result().map(s=>owner[s]),restarts:g.restarts,seconds:Math.round(g.t*10)/10,finished:g.finished()};g.world.free();return out;}
const GOLD=[
 ['00c51d27',15,{kinds:['kei','tissue','can','tape','orange','baseball','doll','baseball','can','tissue','orange','kei','tape','baseball','watermelon'],slots:[13,6,8,2,11,7,5,3,4,1,9,10,0,14,12],order:[10,5,13,6,1,8,7,2,12,9,0,14,3,11,4],restarts:0,seconds:30.9,finished:true}],
 ['1a2b3c4d',4,{kinds:['watermelon','tape','baseball','orange'],slots:[2,3,1,0],order:[3,0,1,2],restarts:0,seconds:9.8,finished:true}],
 ['deadbeef',2,{kinds:['doll','watermelon'],slots:[1,0],order:[1,0],restarts:0,seconds:2.1,finished:true}],
];
for(const [seed,n,want] of GOLD){const got=play(seed,n);assert.deepEqual(got,want,'seed '+seed+' must replay exactly');
 assert.deepEqual([...got.slots].sort((a,b)=>a-b),Array.from({length:n},(_,i)=>i),'every racer owns exactly one slot');assert.deepEqual([...got.order].sort((a,b)=>a-b),Array.from({length:n},(_,i)=>i));}
assert.deepEqual(play('1a2b3c4d',4),GOLD[1][2],'computing the same race twice gives the same result');
// Items: the doll at most once per race; the three cars together appear about as often as one other kind.
let dolls=0,cars=0,total=0;for(let s=0;s<400;s++){const k=pickKinds((s*2654435761>>>0).toString(16).padStart(8,'0'),15,RACE_V1.carW);assert.ok(k.filter(x=>x==='doll').length<=1);dolls+=k.includes('doll')?1:0;for(const x of k){total++;if(KINDS[x].shape==='car')cars++;}}
assert.ok(dolls>100&&dolls<400,'the doll shows up in some races, not all');assert.ok(cars/total>0.07&&cars/total<0.2,'cars about one kind\'s share: '+(cars/total).toFixed(3));
// The simple pinball never jams and has no favourite starting ball.
const first=new Array(15).fill(0);for(let s=0;s<60;s++){const d=createDrop(RAPIER,15,((s*40503+0xbeef01)>>>0).toString(16).padStart(8,'0'));while(!d.finished())d.step();assert.ok(d.events.every(e=>!e.forced),'no forced finish');assert.ok(d.t<10);first[d.order[0]]++;d.world.free();}
assert.ok(Math.max(...first)<=12,'no ball wins the pinball too often: '+first.join(' '));
// Device-independent maths: only + - * / and sqrt are used, and they agree with the built-in functions.
for(let x=-9;x<9;x+=0.37){assert.ok(Math.abs(dsin(x)-Math.sin(x))<1e-9);assert.ok(Math.abs(dcos(x)-Math.cos(x))<1e-9);}for(let x=-12;x<=0;x+=0.41)assert.ok(Math.abs(dexp(x)-Math.exp(x))<1e-9);
const src=(await import('node:fs')).readFileSync(new URL('../public/treadmill3d/sim.mjs',import.meta.url),'utf8');
assert.ok(!/Math\.(sin|cos|tan|exp|pow|hypot|acos|asin|atan|atan2|log|random|cbrt)\b/.test(src),'the race maths uses no device-dependent functions');
console.log('PASS: 런닝머신 레이스 replays exactly from its seed (3 saved races), items and slot owners follow the rules, the simple pinball never jams, device-independent maths');
