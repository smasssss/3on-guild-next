/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-09 핀볼 추첨: 같은 추첨 번호면 같은 결과, 100명 시간 안에 골인, 기록은 관리자만 저장(백업 포함), 누구나 조회.
const assert=require('node:assert/strict'),fs=require('node:fs');
const m={exports:{}};new Function('module',fs.readFileSync('public/pinball.js','utf8'))(m);const engine=m.exports;
const f=require('./vip-fixture.cjs')(),route=f.load('app/api/pinball/route.ts'),store=f.load('lib/store.ts'),lib=f.load('lib/pinball.ts');
const people=n=>Array.from({length:n},(_,i)=>({memberId:'m'+String(i).padStart(3,'0'),nickname:'길드원'+i,points:40000000+i}));
const origin='http://localhost:8790',token='c'.repeat(64);
const post=(body,auth=true)=>route.POST(new Request(origin+'/api/pinball',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
(async()=>{
 // 계산: 같은 번호·같은 참가자(순서 무관) → 같은 결과, 100명 모두 시간 안에 골인
 const a=engine.run(people(100),'0a1b2c3d','last',5),b=engine.run(people(100).reverse(),'0a1b2c3d','last',5);
 assert.deepEqual(a.order,b.order,'same seed, same result');assert.equal(a.sim.timedOut,false,'100 balls finish in time');assert.equal(new Set(a.order).size,100);
 assert.deepEqual(a.picks,a.order.slice(95));assert.deepEqual(engine.run(people(100),'0a1b2c3d','first',3).picks,a.order.slice(0,3));
 assert.notDeepEqual(engine.run(people(100),'ffff0000','first',3).order,a.order,'another seed gives another order');
 // 기록 검사: 뽑힌 사람이 골인 순서와 다르거나, 기준 미달 참가자가 있으면 거절
 const draw={id:'1234567890abcdef1234',seed:'0a1b2c3d',threshold:40000000,includeFixed:true,mode:'last',count:5,week:'2026-11-09',participants:a.list,order:a.order,picks:a.picks,timedOut:false};
 assert.throws(()=>lib.validateDraw({...draw,picks:a.order.slice(0,5)}),/맞지 않습니다/);
 assert.throws(()=>lib.validateDraw({...draw,threshold:50000000}),/낮은 참가자/);
 // 저장: 관리자만, 백업 포함, 누구나 조회
 assert.equal((await post({revision:0,mutation:'a'.repeat(32),draw},false)).status,401,'not an administrator');
 f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),Date.now()+86400000);
 let r=await post({revision:0,mutation:'a'.repeat(32),draw});let body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.draws.length,1);assert.equal(body.draws[0].actor,'admin');
 assert.equal((await post({revision:0,mutation:'b'.repeat(32),draw:{...draw,id:'abcdefabcdefabcdef12'}})).status,409,'stale revision is refused');
 r=await route.GET(new Request(origin+'/api/pinball'));body=await r.json();assert.equal(body.revision,1);assert.deepEqual(body.draws[0].picks,a.picks,'anyone can read the record');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM backups WHERE kind='pinball'").get().n,1,'state before the save is backed up');
 console.log('PASS: pinball is deterministic, 100 balls finish, records validate, only administrators save (with backup), anyone reads');
})().catch(e=>{console.error(e);process.exitCode=1;});
