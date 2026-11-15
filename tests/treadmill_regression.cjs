/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-15 러닝머신 경주 추첨(사용자 결정): 벨트에서 떨어진 순서가 결과, 인원이 많으면 조별 예선 뒤 결승(토너먼트).
// 같은 추첨 번호면 같은 결과, 인원과 상관없이 끝남, 특정 회원이 유리하지 않음, 기록은 game:'treadmill'.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const m={exports:{}};new Function('module',fs.readFileSync('public/treadmill.js','utf8'))(m);const tm=m.exports;
const f=require('./vip-fixture.cjs')(),lib=f.load('lib/pinball.ts');
const people=n=>Array.from({length:n},(_,i)=>({memberId:'m'+String(i).padStart(3,'0'),nickname:'길드원'+i,points:1}));
// 같은 번호·같은 참가자(순서 무관) → 같은 결과
const a=tm.run(people(98),'0a1b2c3d','last',5),b=tm.run(people(98).reverse(),'0a1b2c3d','last',5);
assert.deepEqual(a.order,b.order);assert.equal(new Set(a.order).size,98);assert.deepEqual(a.picks,a.order.slice(93),'last = those who stayed longest');
assert.deepEqual(tm.run(people(98),'0a1b2c3d','first',3).picks,a.order.slice(0,3));assert.notDeepEqual(tm.run(people(98),'ffff0000','last',5).order,a.order);
// 조 편성: 12명까지는 한 번의 경주, 98명은 예선 10조(조마다 1명 진출) + 결승, 150명은 3라운드
assert.equal(tm.plan(12),null);assert.deepEqual(tm.plan(98),{heats:10,advance:1});assert.deepEqual(tm.plan(52),{heats:6,advance:2});assert.deepEqual(tm.plan(150),{heats:15,advance:2});
assert.equal(a.races.length,11);assert.ok(a.races.slice(0,10).every(r=>!r.final&&r.stay.length===1&&r.members.length>=9&&r.members.length<=10));assert.ok(a.races[10].final&&a.races[10].members.length===10);
// 결승에 오른 사람은 예선 탈락자보다 뒤 순서(더 좋은 순위)이고, 우승자는 결승에서 끝까지 남은 물건
{const finalists=new Set(a.races[10].members.map(i=>a.list[i].memberId));assert.ok(a.order.slice(88).every(id=>finalists.has(id)));
 assert.equal(a.order[97],a.list[a.races[10].members[a.races[10].stay[0]]].memberId);}
// 인원별로 끝까지 진행하고 시간 안에 끝남, 물건은 여섯 종류가 고르게 배정됨
for(const n of [1,2,7,12,13,30,98,150]){const r=tm.run(people(n),'5eed00'+String(n%100).padStart(2,'0'),'last',1);assert.equal(new Set(r.order).size,n);
 for(const rc of r.races){assert.ok(rc.frames.length<45*60,n+'명: 경주가 시간 안에 끝남');assert.equal(rc.out.length+rc.stay.length,rc.members.length);}
 const kinds={};for(const o of r.objs)kinds[o.type]=(kinds[o.type]||0)+1;const v=Object.values(kinds);if(n>=12)assert.ok(Math.max(...v)-Math.min(...v)<=1&&v.length===6,'물건 종류가 고르게');}
// 공정성: 같은 20명으로 150번 돌려 마지막까지 남은 3명에 든 횟수가 고르게 퍼져야 함(카이제곱 45 미만)
{const ps=people(20),cnt=new Map(ps.map(p=>[p.memberId,0]));for(let k=0;k<150;k++){const seed=((k*2654435761+8642)>>>0).toString(16).padStart(8,'0');for(const id of tm.run(ps,seed,'last',3).picks)cnt.set(id,cnt.get(id)+1);}
 const exp=150*3/20,chi=[...cnt.values()].reduce((s,x)=>s+(x-exp)**2/exp,0);assert.ok(chi<45,'spread fairly (chi-square '+chi.toFixed(1)+')');}
// 중계 문장: 경주마다 출발과 끝 문장이 있고, 결승은 우승자를 부름
{const lines=tm.commentary(a,'0a1b2c3d');assert.equal(lines.length,11);assert.match(lines[0][0].text,/1라운드 1조 출발/);assert.match(lines[0][lines[0].length-1].text,/진출!$/);
 const winner=a.list.find(p=>p.memberId===a.order[97]).nickname;assert.equal(lines[10][lines[10].length-1].text,'우승은 '+winner+'!');assert.deepEqual(tm.commentary(a,'0a1b2c3d'),lines,'same draw, same commentary');}
// 기록 검사
const draw={id:'1234567890abcdef1234',seed:'0a1b2c3d',source:'manual',threshold:0,includeFixed:true,mode:'last',count:5,course:1,game:'treadmill',week:null,participants:a.list,order:a.order,picks:a.picks,timedOut:false};
assert.equal(lib.validateDraw(draw).game,'treadmill');assert.throws(()=>lib.validateDraw({...draw,picks:a.order.slice(0,5)}),/맞지 않습니다/);
// 1판 계산 지문: 이미 남긴 러닝머신 기록의 다시 보기가 기록과 일치하도록 고정
const v=[];for(const n of [8,30,98]){const r=tm.run(people(n),'1a2b3c4d','last',3);v.push(r.order.join(',')+'|'+r.races.map(x=>x.frames.length).join('.'));}
assert.equal(tm.VERSION,1);assert.equal(crypto.createHash('sha256').update(v.join('/')).digest('hex'),'3f57034c8b8f02d24cc17009a7e8e9c627e97409b38cf86f4d717988cb949e1d','treadmill version 1 replays exactly');
console.log('PASS: 러닝머신 경주 is deterministic, runs heats then a final, always finishes, fair across members, recorded as game treadmill, and replays exactly');
