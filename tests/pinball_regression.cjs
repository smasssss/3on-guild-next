/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-09 핀볼 추첨(경주형 코스 10개): 같은 추첨 번호면 같은 결과, 코스마다 100명 시간 안에 골인, 기록은 관리자만 저장(백업 포함), 누구나 조회.
// 2026-11-10 코스 2판: 새 추첨은 2판 코스, 판 번호 없는 옛 기록은 1판 코스로 처음과 똑같이 다시 계산되어야 합니다.
// 2026-11-10 코스 3판(사용자 요청 '빨리 오면 빨리 들어간다는 공식을 깨 줘'): 반전 장치를 더하고, 2판 기록도 2판 그대로 다시 계산되어야 합니다.
// 2026-11-10 코스 4판(사용자 요청): 지름길 없음, 길목 되돌이(5명 보내면 2초 쉼)와 옆길, 반발 장치 추가, 코스 약 2배. 3판 기록은 3판 그대로.
// 2026-11-10 5판(사용자 요청 '같은 명단이면 뽑히는 사람이 자주 겹친다'): 출발 자리·번호 순서를 매번 무작위로 섞어 특정 회원이 유리하지 않게. 4판 기록은 4판 그대로.
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
 const v2=[];for(let c=1;c<=10;c++){const r=engine.run(plain(40),'1a2b3c4d','first',3,c,2);v2.push(r.order.join(',')+'|'+r.sim.frames.length);}
 assert.equal(crypto.createHash('sha256').update(v2.join('/')).digest('hex'),'8e54c0f66268ae0712dbf78af0732dec1ffd390de2b4de053c1e85c72e9c2d86','layout 2 replays exactly as deployed in Release 16');
 const v3=[];for(let c=1;c<=10;c++){const r=engine.run(plain(40),'1a2b3c4d','first',3,c,3);v3.push(r.order.join(',')+'|'+r.sim.frames.length);}
 assert.equal(crypto.createHash('sha256').update(v3.join('/')).digest('hex'),'7a6a6b7143a589b39346a06125d25563993dac452d03ee203a4df9e588c1eebe','layout 3 replays exactly as deployed in Release 17');
 assert.notDeepEqual(engine.run(plain(40),'1a2b3c4d','first',3,1,3).order,engine.run(plain(40),'1a2b3c4d','first',3,1,2).order,'layout 3 differs from layout 2');
 const v4=[];for(let c=1;c<=10;c++){const r=engine.run(plain(40),'1a2b3c4d','first',3,c,4);v4.push(r.order.join(',')+'|'+r.sim.frames.length);}
 assert.equal(crypto.createHash('sha256').update(v4.join('/')).digest('hex'),'5ca7e01f3ac484798f18784668c90b699d87494b1f89d0ea6423a691d54bc12d','layout 4 replays exactly as deployed in Release 18');
 assert.equal(engine.LAYOUT,5,'new draws use layout 5');
 // 5판 공정성: 같은 20명으로 2번 코스를 150번 돌려 먼저 들어온 3명에 뽑힌 횟수가 고르게 퍼져야 합니다(카이제곱 45 미만; 4판은 회원 번호 0이 유리했음).
 {const ps=plain(20),cnt=new Map(ps.map(p=>[p.memberId,0]));for(let k=0;k<150;k++){const seed=((k*2654435761+12345)>>>0).toString(16).padStart(8,'0');for(const id of engine.run(ps,seed,'first',3,2).picks)cnt.set(id,cnt.get(id)+1);}
  const exp=150*3/20,chi=[...cnt.values()].reduce((a,x)=>a+(x-exp)**2/exp,0);assert.ok(chi<45,'picks spread fairly (chi-square '+chi.toFixed(1)+')');}
 // 5판 섞기: 출발 통 회오리 바람 2초(4판까지는 2.5초), 출발 직전에는 처음 자리와 거의 상관없이 섞여 있어야 합니다.
 assert.equal(engine.board(7).mixFrames,120,'mixing lasts 2 seconds');assert.equal(engine.board(7,4).mixFrames,150,'layout 4 keeps 2.5 seconds');
 {const r=engine.run(plain(100),'0badc0de','first',3,7),f0=r.sim.frames[0],f1=r.sim.frames[119],key=(f,i)=>f[2*i+1]*1000+f[2*i];
  const rank=f=>new Map([...Array(100).keys()].sort((a,c)=>key(f,a)-key(f,c)).map((i,k)=>[i,k]));const a=rank(f0),c=rank(f1);let d=0;for(let i=0;i<100;i++)d+=(a.get(i)-c.get(i))**2;
  assert.ok(Math.abs(1-6*d/(100*9999))<.3,'balls are well mixed before the start');}
 {const a=engine.run(plain(20),'0000abcd','first',3,2),b=engine.run(plain(20),'0000abce','first',3,2);assert.notDeepEqual(a.list.map(p=>p.memberId),b.list.map(p=>p.memberId),'member order is shuffled per draw');}
 // 4판: 지름길 없음, 되돌이는 길목 하나(5명마다 2초 쉼, 옆길로 보냄), 코스 길이 약 2배
 for(let c=1;c<=10;c++){const b=engine.board(c),b2=engine.board(c,2);assert.ok(b.portals.every(q=>q.kind==='back'),'course '+c+' has no shortcut');assert.equal(b.portals.length,1);
  assert.equal(b.portals[0].limit,5);assert.equal(b.portals[0].off,2);assert.ok(b.portals[0].tx>b.W-38,'sent to the side lane');assert.ok(b.height>=1.8*b2.height,'course '+c+' about twice as long');}
 {const r=engine.run(people(100),'0a1b2c3d','first',3,7),log=r.sim.portalLog[0];assert.ok(log.hits.length>=5&&log.off.length>=1,'the send-back gate rests after 5');
  for(const [a,z] of log.off){assert.equal(z-a,120,'rests 2 seconds');assert.ok(!log.hits.some(h=>h>a&&h<z),'no send-back while resting (the 5th ball itself starts the rest)');}
  for(let k=0;k<log.off.length;k++)assert.equal(log.hits.filter(h=>h<=log.off[k][0]).length,5*(k+1),'rests after every 5th ball');}
 // 3판 반전 장치: 모든 코스에 대기 문·골 앞 미끄럼 막대·골 회전 막대, 워프 문, 경사로/계단 코스에는 여닫이 바닥
 for(const L of [3,4])for(let c=1;c<=10;c++){const b=engine.board(c,L);assert.ok(b.obstacles.some(o=>o.hold)&&b.obstacles.some(o=>o.t==='slide')&&b.obstacles.some(o=>o.guard),'course '+c+' goal obstacles');assert.ok(b.portals.length>=1,'course '+c+' warp');}
 for(const L of [3,4])for(const c of [2,3,4,10])assert.ok(engine.board(c,L).obstacles.some(o=>o.gate&&!o.hold),'course '+c+' trapdoors');
 for(let c=1;c<=10;c++)assert.ok(engine.board(c,4).obstacles.filter(o=>o.e>=1.25).length>engine.board(c,3).obstacles.filter(o=>o.e>=1.25).length,'course '+c+' has more bouncy obstacles');
 assert.equal(engine.board(1,2).portals.length+engine.board(1,2).obstacles.filter(o=>o.gate||o.t==='slide').length,0,'layout 2 has none of them');
 // 2판 코스는 코스마다 대표 장애물이 달라야 합니다(바람 띠, 시계추·플리퍼, 굽은 통로).
 const kinds=(c,L)=>{const b=engine.board(c,L);return [b.zones.length>0,b.obstacles.some(o=>o.swing),b.obstacles.filter(o=>o.t==='s').length,b.obstacles.filter(o=>o.gate).length,b.portals.length].join('/');};
 assert.equal(new Set([1,2,3,4,5,6,7,8,9,10].map(c=>engine.board(c).theme.bg)).size,10,'each course has its own colours');
 assert.ok(engine.board(9).zones.length>0&&engine.board(4).zones.length>0,'wind bands');assert.ok(engine.board(7).obstacles.some(o=>o.swing)&&engine.board(8).obstacles.some(o=>o.swing),'flippers and pendulums');
 for(const L of [2,3,4])assert.equal(new Set([1,2,3,4,5,6,7,8,9,10].map(c=>kinds(c,L))).size,10,'no two courses are built alike (layout '+L+')');
 assert.notDeepEqual(engine.run(people(100),'ffff0000','first',3,3).order,a.order,'another seed gives another order');
 // 기록 검사: 뽑힌 사람이 골인 순서와 다르거나, 기준 미달 참가자가 있으면 거절
 const draw={id:'1234567890abcdef1234',seed:'0a1b2c3d',source:'auto',threshold:40000000,includeFixed:true,mode:'last',count:5,course:3,week:'2026-11-09',participants:a.list,order:a.order,picks:a.picks,timedOut:false};
 assert.throws(()=>lib.validateDraw({...draw,picks:a.order.slice(0,5)}),/맞지 않습니다/);
 assert.throws(()=>lib.validateDraw({...draw,threshold:50000000}),/낮은 참가자/);
 assert.throws(()=>lib.validateDraw({...draw,course:11}),/코스/);assert.throws(()=>lib.validateDraw({...draw,source:'manual'}),/쓰지 않습니다/);
 assert.equal(lib.validateDraw({...draw,source:'manual',threshold:0}).source,'manual','direct selection is recorded as such');
 assert.equal(lib.validateDraw({...draw,layout:2}).layout,2,'layout 2 is recorded');assert.equal(lib.validateDraw({...draw,layout:3}).layout,3,'layout 3 is recorded');assert.equal('layout' in lib.validateDraw(draw),false,'old records stay layout 1');
 assert.equal(lib.validateDraw({...draw,layout:4}).layout,4,'layout 4 is recorded');assert.equal(lib.validateDraw({...draw,layout:5}).layout,5,'layout 5 is recorded');assert.throws(()=>lib.validateDraw({...draw,layout:6}),/코스 판/);
 // 저장: 관리자만, 백업 포함, 누구나 조회
 assert.equal((await post({revision:0,mutation:'a'.repeat(32),draw},false)).status,401,'not an administrator');
 f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),Date.now()+86400000);
 let r=await post({revision:0,mutation:'a'.repeat(32),draw});let body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.draws.length,1);assert.equal(body.draws[0].actor,'admin');
 assert.equal((await post({revision:0,mutation:'b'.repeat(32),draw:{...draw,id:'abcdefabcdefabcdef12'}})).status,409,'stale revision is refused');
 r=await route.GET(new Request(origin+'/api/pinball'));body=await r.json();assert.equal(body.revision,1);assert.deepEqual(body.draws[0].picks,a.picks,'anyone can read the record');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM backups WHERE kind='pinball'").get().n,1,'state before the save is backed up');
 console.log('PASS: pinball is deterministic, 100 balls finish, records validate, only administrators save (with backup), anyone reads');
})().catch(e=>{console.error(e);process.exitCode=1;});
