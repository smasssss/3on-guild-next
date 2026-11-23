// 2026-11-23 user decision: a saved 정통 경마 record is replayed by recomputing the race from its seed (추첨 번호),
// so the same seed must always give the same racers and the same finishing order. These races were computed when rules
// version 1 (RACE_VERSION) was fixed; if any of them changes, saved records would no longer replay — add a new version instead.
// User rules checked here: each kind of racer appears at most once per race (only one cheetah), every racer reaches the
// finish line (nobody is cut off; the turtle may walk all the way), and any kind of racer can win.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runRace,lineup,TYPES,TRACK,HZ,MAX_RACERS,MIN_RACERS,MAX_SECONDS,RACE_VERSION} from '../public/race/sim.mjs';
import {voiceOf,planCommentary,clipText,LEVELS} from '../public/race/commentary.mjs';
import {timeline,PRE} from '../public/race/timeline.mjs';
assert.equal(RACE_VERSION,1);assert.equal(MAX_RACERS,10);assert.equal(MIN_RACERS,2);assert.equal(Object.keys(TYPES).length,11);
const GOLD=[
 ['00c51d27',10,['giraffe','elephant','cheetah','turtle','biped','ostrich','panda','horse','cow','costume'],[6,1,5,8,3,2,9,7,10,4],81.3],
 ['e1bfedc3',10,['cow','elephant','zebra','turtle','ostrich','cheetah','giraffe','panda','biped','costume'],[10,4,2,1,5,7,3,9,6,8],50],
 ['1a2b3c4d',4,['cow','ostrich','panda','turtle'],[1,3,2,4],84],
 ['deadbeef',2,['cow','elephant'],[1,2],45.5],
 ['24234430',10,['panda','giraffe','zebra','cow','ostrich','cheetah','turtle','elephant','costume','biped'],[10,2,3,8,5,1,6,4,9,7],195.4],
];
const lines=JSON.parse(fs.readFileSync(new URL('../public/race/voice/lines.json',import.meta.url),'utf8')),kinds=new Set();
const idx=JSON.parse(fs.readFileSync(new URL('../public/race/voice/index.json',import.meta.url),'utf8')),voiceIndex=Object.keys(idx).length?idx:null;
function checkRace(g,n){
 assert.equal(g.types.length,n);assert.equal(new Set(g.types).size,n,'each kind of racer appears at most once');
 assert.deepEqual(g.order.slice().sort((a,b)=>a-b),Array.from({length:n},(_,i)=>i+1),'the order holds every number once');
 assert.equal(g.finished,n,'every racer reaches the finish line');assert.ok(g.seconds<MAX_SECONDS);
 const fin=g.events.filter(e=>e.kind==='finish');assert.deepEqual(fin.map(e=>e.a),g.order,'the order is the order of crossing the line');
 assert.ok(Math.abs(g.frames.length-g.seconds*HZ)<=6,'one frame per 1/60 second');for(const q of g.frames[g.frames.length-1])assert.equal(q.x,TRACK);
 // 중계: 사건마다 읽을 문장이 있고, 필요한 문장 조각이 모두 준비되어 있음
 let rank=0;for(const e of g.events){kinds.add(e.kind);assert.ok(e.text&&e.frame>=0);const v=voiceOf(e,g.types,e.kind==='finish'?++rank:0);assert.ok(v,'voice for '+e.kind);for(const k of v.keys)for(const lv of LEVELS)assert.ok(clipText(k+'_'+lv,lines),'voice line '+k);}
 // 중계 순서: 차분한 인사로 시작하고, 말이 서로 겹치지 않으며, 끝에는 순위를 1위부터 차례로 불러 줌
 const tl=timeline(g),plan=planCommentary(g,tl,lines,voiceIndex);assert.ok(tl.endAt<=PRE+g.seconds+0.2,'fast-forward never makes the race longer');
 assert.deepEqual(plan.items[0].keys,['i_hello_c']);assert.ok(plan.items.find(x=>x.keys[0]==='p_start_c').t===PRE,'the start call comes at the start signal');
 for(let k=1;k<plan.items.length;k++){const a=plan.items[k-1],b=plan.items[k];assert.ok(b.t>=a.t+(a.cut!=null?a.cut:a.dur)-1e-6,'commentary lines never overlap');}
 for(const k of plan.keys)assert.ok(clipText(k,lines),'text for '+k);
 const wrap=plan.items.filter(x=>x.rank);assert.deepEqual(wrap.map(x=>x.rank),g.order.map((_,k)=>k+1));assert.deepEqual(wrap.map(x=>x.keys[1]),g.order.map(no=>'n'+no+'_'+g.types[no-1]+'_c'),'the wrap-up reads the finishers in order');
 assert.ok(wrap[0].t>=tl.endAt&&plan.items[plan.items.length-1].keys[0]==='w_outro_c');assert.ok(plan.items.every(x=>x.kind==='wrap'||x.t<plan.wrapAt));
 const live=plan.items.filter(x=>x.kind&&x.kind!=='wrap'&&x.kind!=='start');if(n===10&&live.length>6){const lv=x=>LEVELS.indexOf(x.level),third=Math.ceil(live.length/3),avg=a=>a.reduce((s,x)=>s+lv(x),0)/a.length;assert.ok(avg(live.slice(0,third))<avg(live.slice(-third))+0.8,'excitement does not start high');}
}
for(const [seed,n,types,order,seconds] of GOLD){const g=runRace(seed,n);assert.deepEqual(g.types,types,'seed '+seed+' racers');assert.deepEqual(g.order,order,'seed '+seed+' must replay exactly');assert.equal(g.seconds,seconds);assert.deepEqual(lineup(seed,n),types);checkRace(g,n);}
assert.deepEqual(runRace('00c51d27',10).order,GOLD[0][3],'computing the same race twice gives the same order');
// 어느 선수든 1등을 할 수 있음: 160경기에서 열한 종류가 모두 여러 번 우승하고, 한 종류가 독차지하지 않음. 거북이는 대개 꼴찌.
const wins={},last={},N=160;for(let s=0;s<N;s++){const g=runRace(((s*40503+0xbeef01)>>>0).toString(16).padStart(8,'0'),10);checkRace(g,10);const w=g.types[g.order[0]-1],l=g.types[g.order[9]-1];wins[w]=(wins[w]||0)+1;last[l]=(last[l]||0)+1;}
for(const t of Object.keys(TYPES))assert.ok(wins[t]>=6&&wins[t]<=28,t+' wins '+wins[t]+' of '+N);
assert.ok(last.turtle>=100,'the turtle is usually last: '+last.turtle);assert.ok(wins.turtle>=6,'but it sometimes wins');
for(const n of [2,3,5,7,9])for(let s=0;s<6;s++)checkRace(runRace(((s*7919+n*104729)>>>0).toString(16).padStart(8,'0'),n),n);
for(const k of ['start','lead','fall','finish','end','stomp','shellhit','split','ufo','ufodrop','tornado','pounce','bowl','panic','wait','bonk','dig','eat','nap','slip','home'])assert.ok(kinds.has(k),'event seen: '+k);
assert.ok(!/Math\.(sin|cos|tan|exp|pow|hypot|acos|asin|atan|atan2|log|random|cbrt|sqrt)\b/.test(fs.readFileSync(new URL('../public/race/sim.mjs',import.meta.url),'utf8')),'the race maths uses no device-dependent functions');
console.log('PASS: 정통 경마 replays exactly from its seed (5 saved races), one racer per kind, everyone finishes, every kind wins sometimes, every event has a voice line');
