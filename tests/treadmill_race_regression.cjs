/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-22 user decision: 런닝머신 레이스 lives in the '추첨 게임' tab (the renamed 핀볼 추첨 tab) as a second game.
// One race = items by slot (slot machine) -> slot owners (simple pinball, entry order = slot 1..N) -> treadmill race
// (fall order = last place first; the last one standing wins). 2-15 racers; the doll at most once.
// Records are their own document kind 'treadmill3d' (pinball records and operation documents are never touched),
// readable by anyone and written by admins only. Racers can be imported from a saved pinball draw: finish order 1..N.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),route=f.load('app/api/treadmill/route.ts'),store=f.load('lib/store.ts'),lib=f.load('lib/treadmill.ts');
const origin='http://localhost:8790',token='d'.repeat(64);
const post=(body,auth=true)=>route.POST(new Request(origin+'/api/treadmill',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
const racers=n=>Array.from({length:n},(_,i)=>({memberId:'m'+i,nickname:'선수'+i}));
const race=(over={})=>{const p=racers(4);return {id:'a1b2c3d4-0000-4000-8000-000000000001',seed:'00c51d27',version:1,source:'manual',participants:p,items:['can','doll','orange','kei'],slots:['m2','m0','m3','m1'],order:['m0','m3','m1','m2'],restarts:1,seconds:29.84,timedOut:false,...over};};
(async()=>{
 // 1) Record rules
 const ok=lib.validateRace(race());assert.equal(ok.seconds,29.8);assert.equal(ok.at,'');assert.deepEqual(ok.order,['m0','m3','m1','m2']);assert.equal(ok.pinballDrawId,undefined);
 assert.equal(lib.validateRace(race({source:'pinball',pinballDrawId:'b1b2c3d4-0000-4000-8000-000000000009'})).pinballDrawId,'b1b2c3d4-0000-4000-8000-000000000009');
 const bad=[[{participants:racers(1),items:['can'],slots:['m0'],order:['m0']},/참가 인원/],[{participants:racers(16)},/참가 인원/],[{seed:'XYZ'},/추첨 번호/],[{version:3},/설정 판/],[{version:0},/설정 판/],
  [{items:['can','doll','doll','kei']},/물건/],[{items:['can','doll','orange']},/물건/],[{items:['can','rock','orange','kei']},/물건/],
  [{slots:['m2','m0','m3','m3']},/자리 주인/],[{order:['m0','m3','m1']},/탈락 순서/],[{order:['m0','m3','m1','zz']},/탈락 순서/],
  [{source:'pinball'},/핀볼 기록/],[{pinballDrawId:'b1b2c3d4-0000-4000-8000-000000000009'},/핀볼 기록/],[{source:'auto'},/고르는 방법/],
  [{seconds:0},/경기 시간/],[{restarts:-1},/재출발/],[{timedOut:'no'},/경기 설정/],[{participants:[...racers(3),{memberId:'m0',nickname:'또'}]},/참가자 정보/]];
 for(const [over,why] of bad)assert.throws(()=>lib.validateRace(race(over)),why,JSON.stringify(over));
 // 2026-11-23 user decision: version 2 mixes the balls in a hopper before the simple pinball; version 1 records stay valid and replay as version 1.
 assert.equal(ok.version,1);assert.equal(lib.validateRace(race({version:2})).version,2);
 const two=lib.addRace(lib.addRace(lib.emptyTreadmill(),{...ok,at:'t'}),{...ok,at:'t'});assert.equal(two.races.length,1,'the same race is not stored twice');
 // 2) Storage: its own document kind; admin only; anyone reads; other documents untouched
 const others=()=>JSON.stringify(f.sql.prepare("SELECT * FROM documents WHERE kind<>'treadmill3d' ORDER BY kind").all()),before=others();
 let r=await post({revision:0,mutation:'a'.repeat(32),race:race()},false);assert.equal(r.status,401,'not an admin');
 f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),Date.now()+86400000);
 r=await post({revision:0,mutation:'a'.repeat(32),race:race()});let body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.races.length,1);assert.equal(body.races[0].actor,'admin');assert.ok(body.races[0].at);
 r=await post({revision:0,mutation:'b'.repeat(32),race:race({id:'a1b2c3d4-0000-4000-8000-000000000002'})});assert.equal(r.status,409,'another device saved first');
 r=await post({revision:1,mutation:'c'.repeat(32),race:race({order:['m0','m0','m1','m2']})});body=await r.json();assert.equal(r.status,400);assert.match(body.error,/탈락 순서/);
 r=await route.GET(new Request(origin+'/api/treadmill'));body=await r.json();assert.equal(body.schema,'3on-treadmill-v1');assert.equal(body.revision,1);assert.deepEqual(body.races[0].order,['m0','m3','m1','m2'],'anyone can read the record');
 assert.equal(others(),before,'no other document is touched');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM backups WHERE kind='treadmill3d'").get().n,1,'the previous record list is backed up before each save');
 // 3) The tab's own arithmetic
 const m={exports:{}};new Function('module',fs.readFileSync('public/treadmill-race.js','utf8'))(m);const ui=m.exports;
 assert.deepEqual(ui.ranking(ok).map(x=>[x.rank,x.memberId,x.slot,x.item]),[[1,'m2',1,'can'],[2,'m1',4,'kei'],[3,'m3',3,'orange'],[4,'m0',2,'doll']],'last one standing is 1st; each racer keeps the item of their slot');
 const draw={participants:racers(6),order:['m4','m1','m5','m0','m3','m2']};
 assert.deepEqual(ui.fromPinball(draw,3).map(x=>x.memberId),['m4','m1','m5'],'pinball import = finish order 1..N');assert.equal(ui.fromPinball(draw,99).length,6);assert.equal(ui.fromPinball({participants:racers(40),order:racers(40).map(x=>x.memberId)},40).length,15,'at most 15 racers');
 assert.deepEqual(Object.keys(ui.ITEM).sort(),[...lib.ITEMS].sort(),'every item has a Korean name');
 // 4) Wiring in the page
 const html=fs.readFileSync('public/legacy.html','utf8');assert.match(html,/<button data-tab="pinball">추첨 게임<\/button>/);assert.match(html,/<script src="\/pinball\.js\?v=\d+" defer><\/script><script src="\/treadmill-race\.js\?v=\d+" defer><\/script>/);
 for(const file of ['play.html','play.mjs','play.css','worker.mjs','sim.mjs','render.mjs','vendor/rapier.mjs','vendor/three/three.module.js','assets/doll.png',...lib.ITEMS.map(k=>'assets/icons/'+k+'.png')])assert.ok(fs.existsSync('public/treadmill3d/'+file),file);
 // 2026-11-23 user decision: the user's own race music starts at the go signal (blue lamps) and fades when the race ends; a sound switch turns it off.
 const page=fs.readFileSync('public/treadmill-race.js','utf8'),game=fs.readFileSync('public/treadmill3d/play.mjs','utf8');
 assert.ok(fs.statSync('public/treadmill3d/assets/music/race01.mp3').size>100000);assert.match(game,/toParent\(\{type:'green'\}\)/);assert.match(game,/toParent\(\{type:'race-end'\}\)/);
 assert.match(page,/if\(m\.type==='green'\)return musicStart\(\);/);assert.match(page,/id="trSound" type="checkbox" checked/);assert.match(game,/s>=3\.0\)res\(\)/,'three seconds of start lamps before the go signal');
 console.log('PASS: 런닝머신 레이스 records validated (2-15 racers, items by slot, owners and fall order are permutations), own document kind, admin-only save with backup, pinball import 1..N, wired into the 추첨 게임 tab');
})().catch(e=>{console.error(e);process.exitCode=1;});
