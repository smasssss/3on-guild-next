/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-09 핀볼 추첨(경주형 코스 10개): 같은 추첨 번호면 같은 결과, 코스마다 100명 시간 안에 골인, 기록은 관리자만 저장(백업 포함), 누구나 조회.
// 2026-11-10 코스 2판: 새 추첨은 2판 코스, 판 번호 없는 옛 기록은 1판 코스로 처음과 똑같이 다시 계산되어야 합니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const m={exports:{}};new Function('module',fs.readFileSync('public/pinball.js','utf8'))(m);const engine=m.exports;
const f=require('./vip-fixture.cjs')(),route=f.load('app/api/pinball/route.ts'),store=f.load('lib/store.ts'),lib=f.load('lib/pinball.ts');
const people=n=>Array.from({length:n},(_,i)=>({memberId:'m'+String(i).padStart(3,'0'),nickname:'길드원'+i,points:40000000+i}));
const origin='http://localhost:8790',token='c'.repeat(64);
const post=(body,auth=true)=>route.POST(new Request(origin+'/api/pinball',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
(async()=>{
 // 계산: 같은 번호·같은 참가자(순서 무관) → 같은 결과, 100명 모두 시간 안에 골인
 const a=engine.run(people(100),'0a1b2c3d','last',5,3),b=engine.run(people(100).reverse(),'0a1b2c3d','last',5,3);
 assert.deepEqual(a.order,b.order,'same seed, same result');assert.equal(a.sim.timedOut,false,'100 balls finish in time');assert.equal(new Set(a.order).size,100);
 assert.deepEqual(a.picks,a.order.slice(95));assert.deepEqual(engine.run(people(100),'0a1b2c3d','first',3,3).picks,a.order.slice(0,3));
 for(let c=1;c<=10;c++)assert.equal(engine.run(people(100),'5eed'+String(c).padStart(4,'0'),'first',1,c).sim.timedOut,false,'course '+c+' finishes with 100 marbles');
 // 1판 코스: 처음 배포한 계산 결과(40명, 추첨 번호 1a2b3c4d, 코스 1~10)의 지문과 같아야 옛 기록 다시 보기가 기록과 일치합니다.
 const plain=n=>Array.from({length:n},(_,i)=>({memberId:'m'+String(i).padStart(3,'0'),nickname:'n'+i,points:1}));
 const v1=[];for(let c=1;c<=10;c++){const r=engine.run(plain(40),'1a2b3c4d','first',3,c,1);v1.push(r.order.join(',')+'|'+r.sim.frames.length);}
 assert.equal(crypto.createHash('sha256').update(v1.join('/')).digest('hex'),'683dd1a19cc7257834efa73e12a9ffa5b178a3b1d13b08fec61c57da8086aaa5','layout 1 replays exactly as first deployed');
 assert.equal(engine.LAYOUT,2,'new draws use layout 2');assert.notDeepEqual(engine.run(plain(40),'1a2b3c4d','first',3,1).order,engine.run(plain(40),'1a2b3c4d','first',3,1,1).order,'layout 2 is a different course');
 // 2판 코스는 코스마다 대표 장애물이 달라야 합니다(바람 띠, 시계추·플리퍼, 굽은 통로).
 const kinds=c=>{const b=engine.board(c);return [b.zones.length>0,b.obstacles.some(o=>o.swing),b.obstacles.filter(o=>o.t==='s').length].join('/');};
 assert.equal(new Set([1,2,3,4,5,6,7,8,9,10].map(c=>engine.board(c).theme.bg)).size,10,'each course has its own colours');
 assert.ok(engine.board(9).zones.length>0&&engine.board(4).zones.length>0,'wind bands');assert.ok(engine.board(7).obstacles.some(o=>o.swing)&&engine.board(8).obstacles.some(o=>o.swing),'flippers and pendulums');
 assert.equal(new Set([1,2,3,4,5,6,7,8,9,10].map(kinds)).size,10,'no two courses are built alike');
 assert.notDeepEqual(engine.run(people(100),'ffff0000','first',3,3).order,a.order,'another seed gives another order');
 // 기록 검사: 뽑힌 사람이 골인 순서와 다르거나, 기준 미달 참가자가 있으면 거절
 const draw={id:'1234567890abcdef1234',seed:'0a1b2c3d',source:'auto',threshold:40000000,includeFixed:true,mode:'last',count:5,course:3,week:'2026-11-09',participants:a.list,order:a.order,picks:a.picks,timedOut:false};
 assert.throws(()=>lib.validateDraw({...draw,picks:a.order.slice(0,5)}),/맞지 않습니다/);
 assert.throws(()=>lib.validateDraw({...draw,threshold:50000000}),/낮은 참가자/);
 assert.throws(()=>lib.validateDraw({...draw,course:11}),/코스/);assert.throws(()=>lib.validateDraw({...draw,source:'manual'}),/쓰지 않습니다/);
 assert.equal(lib.validateDraw({...draw,source:'manual',threshold:0}).source,'manual','direct selection is recorded as such');
 assert.equal(lib.validateDraw({...draw,layout:2}).layout,2,'layout 2 is recorded');assert.equal('layout' in lib.validateDraw(draw),false,'old records stay layout 1');
 assert.throws(()=>lib.validateDraw({...draw,layout:3}),/코스 판/);
 // 저장: 관리자만, 백업 포함, 누구나 조회
 assert.equal((await post({revision:0,mutation:'a'.repeat(32),draw},false)).status,401,'not an administrator');
 f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),Date.now()+86400000);
 let r=await post({revision:0,mutation:'a'.repeat(32),draw});let body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.draws.length,1);assert.equal(body.draws[0].actor,'admin');
 assert.equal((await post({revision:0,mutation:'b'.repeat(32),draw:{...draw,id:'abcdefabcdefabcdef12'}})).status,409,'stale revision is refused');
 r=await route.GET(new Request(origin+'/api/pinball'));body=await r.json();assert.equal(body.revision,1);assert.deepEqual(body.draws[0].picks,a.picks,'anyone can read the record');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM backups WHERE kind='pinball'").get().n,1,'state before the save is backed up');
 console.log('PASS: pinball is deterministic, 100 balls finish, records validate, only administrators save (with backup), anyone reads');
})().catch(e=>{console.error(e);process.exitCode=1;});
