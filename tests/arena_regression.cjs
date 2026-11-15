/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-15 배틀로얄 추첨(사용자 결정): 탈락 순서가 결과. 같은 추첨 번호면 같은 결과, 인원과 상관없이 끝까지 진행,
// 특정 회원이 유리하지 않음, 기록은 game:'arena'로 저장(순서와 뽑힌 사람의 관계는 핀볼과 같음).
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const m={exports:{}};new Function('module',fs.readFileSync('public/arena.js','utf8'))(m);const arena=m.exports;
const f=require('./vip-fixture.cjs')(),lib=f.load('lib/pinball.ts');
const people=n=>Array.from({length:n},(_,i)=>({memberId:'m'+String(i).padStart(3,'0'),nickname:'길드원'+i,points:1}));
// 같은 번호·같은 참가자(순서 무관) → 같은 결과
const a=arena.run(people(100),'0a1b2c3d','last',5),b=arena.run(people(100).reverse(),'0a1b2c3d','last',5);
assert.deepEqual(a.order,b.order);assert.equal(new Set(a.order).size,100);assert.deepEqual(a.picks,a.order.slice(95),'last = the survivors (end of the elimination order)');
assert.deepEqual(arena.run(people(100),'0a1b2c3d','first',3).picks,a.order.slice(0,3),'first = the first ones out');
assert.notDeepEqual(arena.run(people(100),'ffff0000','last',5).order,a.order);
// 인원별로 끝까지 진행하고, 한 판 길이가 알맞음(1명도 가능)
for(const n of [1,2,10,52,100,150]){const r=arena.run(people(n),'5eed00'+String(n%100).padStart(2,'0'),'last',1),sec=r.sim.frames.length/60;
 assert.equal(new Set(r.order).size,n);assert.ok(sec<=arena.arena(n).hold+arena.arena(n).shrink+arena.arena(n).end+1&&(n<2||sec>=6),n+'명 '+sec.toFixed(1)+'초');
 // 탈락 순서는 탈락한 시각 순서와 같고, 마지막 사람은 끝까지 남음
 const idx=r.order.map(id=>r.list.findIndex(p=>p.memberId===id));for(let k=1;k<idx.length;k++)assert.ok(r.sim.finish[idx[k-1]]<=r.sim.finish[idx[k]]);
 if(n>1)assert.ok(r.sim.finish[idx[0]]>=1,'no one is out before the start');}
// 경기장은 3초 뒤부터 줄어들어 0이 됨
const ar=arena.arena(100);assert.equal(arena.radiusAt(ar,0),ar.r0);assert.equal(arena.radiusAt(ar,ar.hold),ar.r0);assert.ok(arena.radiusAt(ar,ar.hold+ar.shrink/2)<ar.r0);assert.equal(arena.radiusAt(ar,ar.hold+ar.shrink+ar.end),0);
// 공정성: 같은 20명으로 200번 돌려 마지막까지 남은 3명에 든 횟수가 고르게 퍼져야 함(카이제곱 45 미만)
{const ps=people(20),cnt=new Map(ps.map(p=>[p.memberId,0]));for(let k=0;k<200;k++){const seed=((k*2654435761+4321)>>>0).toString(16).padStart(8,'0');for(const id of arena.run(ps,seed,'last',3).picks)cnt.set(id,cnt.get(id)+1);}
 const exp=200*3/20,chi=[...cnt.values()].reduce((s,x)=>s+(x-exp)**2/exp,0);assert.ok(chi<45,'survivors spread fairly (chi-square '+chi.toFixed(1)+')');}
// 기록 검사: 배틀로얄 기록은 game:'arena', 모르는 게임 종류는 거절
const draw={id:'1234567890abcdef1234',seed:'0a1b2c3d',source:'manual',threshold:0,includeFixed:true,mode:'last',count:5,course:1,game:'arena',week:null,participants:a.list,order:a.order,picks:a.picks,timedOut:false};
assert.equal(lib.validateDraw(draw).game,'arena');assert.equal('game' in lib.validateDraw({...draw,game:undefined}),false,'pinball records carry no game');
assert.throws(()=>lib.validateDraw({...draw,game:'chess'}),/게임 종류/);assert.throws(()=>lib.validateDraw({...draw,picks:a.order.slice(0,5)}),/맞지 않습니다/);
// 1판 계산 지문: 이미 남긴 배틀로얄 기록의 다시 보기가 기록과 일치하도록 고정
const v=[];for(const n of [10,40,100]){const r=arena.run(people(n),'1a2b3c4d','last',3);v.push(r.order.join(',')+'|'+r.sim.frames.length);}
assert.equal(arena.VERSION,1);assert.equal(crypto.createHash('sha256').update(v.join('/')).digest('hex'),'1d4c5c4dc62399d44282ac017939d849ab1b7da9f26b032474e18ab04b67e445','arena version 1 replays exactly');
console.log('PASS: 배틀로얄 is deterministic, always finishes, fair across members, recorded as game arena, and replays exactly');
