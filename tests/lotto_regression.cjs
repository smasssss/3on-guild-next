/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-23 user decision: 로또 추첨기 in the 추첨 게임 tab. Numbers only; the range (2-60 balls, numbers 0-999) and how many to
// draw are typed each time; the result is recorded in drawn order (1st, 2nd, ...). Records are their own document kind 'lotto'
// (no other document is touched), readable by anyone and written by admins only.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),route=f.load('app/api/lotto/route.ts'),store=f.load('lib/store.ts'),lib=f.load('lib/lotto.ts');
const origin='http://localhost:8790',token='e'.repeat(64);
const post=(body,auth=true)=>route.POST(new Request(origin+'/api/lotto',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
const draw=(over={})=>({id:'c1b2c3d4-0000-4000-8000-000000000001',seed:'00c51d27',version:1,from:1,to:45,count:6,numbers:[22,17,11,12,28,3],...over});
(async()=>{
 // 1) Record rules: drawn numbers are distinct, inside the range, and exactly `count` of them, kept in drawn order
 const ok=lib.validateLotto(draw());assert.deepEqual(ok.numbers,[22,17,11,12,28,3],'drawn order is kept');assert.equal(ok.at,'');
 assert.equal(lib.validateLotto(draw({from:0,to:9,count:10,numbers:[3,1,4,0,5,9,2,6,8,7]})).count,10,'all balls may be drawn');
 const bad=[[{numbers:[22,17,11,12,28]},/뽑힌 번호/],[{numbers:[22,17,11,12,28,28]},/뽑힌 번호/],[{numbers:[22,17,11,12,28,46]},/뽑힌 번호/],[{numbers:[22,17,11,12,28,2.5]},/뽑힌 번호/],
  [{to:100},/번호 범위/],[{from:45,to:45,count:1,numbers:[45]},/번호 범위/],[{from:-1},/번호 범위/],[{to:1000,from:990},/번호 범위/],[{count:0,numbers:[]},/뽑는 개수/],[{count:46},/뽑는 개수/],
  [{seed:'zz'},/추첨 번호/],[{version:2},/설정 판/],[{id:'x'},/기록 번호/]];
 for(const [over,why] of bad)assert.throws(()=>lib.validateLotto(draw(over)),why,JSON.stringify(over));
 assert.equal(lib.addLotto(lib.addLotto(lib.emptyLotto(),{...ok,at:'t'}),{...ok,at:'t'}).draws.length,1,'the same draw is not stored twice');
 // 2) Storage: own document kind, admin only, anyone reads, other documents untouched
 const others=()=>JSON.stringify(f.sql.prepare("SELECT * FROM documents WHERE kind<>'lotto' ORDER BY kind").all()),before=others();
 let r=await post({revision:0,mutation:'a'.repeat(32),draw:draw()},false);assert.equal(r.status,401,'not an admin');
 f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),Date.now()+86400000);
 r=await post({revision:0,mutation:'a'.repeat(32),draw:draw()});let body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.draws[0].actor,'admin');assert.ok(body.draws[0].at);
 r=await post({revision:0,mutation:'b'.repeat(32),draw:draw({id:'c1b2c3d4-0000-4000-8000-000000000002'})});assert.equal(r.status,409,'another device saved first');
 r=await post({revision:1,mutation:'c'.repeat(32),draw:draw({numbers:[1,1,2,3,4,5]})});body=await r.json();assert.equal(r.status,400);assert.match(body.error,/뽑힌 번호/);
 r=await route.GET(new Request(origin+'/api/lotto'));body=await r.json();assert.equal(body.schema,'3on-lotto-v1');assert.equal(body.revision,1);assert.deepEqual(body.draws[0].numbers,[22,17,11,12,28,3],'anyone can read the record');
 assert.equal(others(),before,'no other document is touched');
 // 3) The tab's own checks
 const m={exports:{}};new Function('module',fs.readFileSync('public/lotto-draw.js','utf8'))(m);const ui=m.exports;
 assert.equal(ui.check(1,45,6),null);assert.equal(ui.check(0,9,10),null);assert.match(ui.check(1,100,6),/60개까지/);assert.match(ui.check(5,5,1),/끝 번호/);assert.match(ui.check(1,45,46),/뽑는 개수/);assert.match(ui.check(1,45,0),/뽑는 개수/);assert.match(ui.check(NaN,45,6),/숫자/);assert.match(ui.check(990,1000,3),/999/);
 assert.equal(ui.MAX_BALLS,lib.MAX_BALLS);assert.equal(ui.MAX_NUMBER,lib.MAX_NUMBER);
 // 4) Wiring: the game is added to the 추첨 게임 tab's game switch
 const html=fs.readFileSync('public/legacy.html','utf8');assert.match(html,/<script src="\/treadmill-race\.js\?v=\d+" defer><\/script><script src="\/lotto-draw\.js\?v=\d+" defer><\/script>/);
 assert.match(fs.readFileSync('public/treadmill-race.js','utf8'),/root\.gameSwitch=\{add\(/);assert.match(fs.readFileSync('public/lotto-draw.js','utf8'),/root\.gameSwitch\.add\('lotto','로또 추첨기'/);
 for(const file of ['play.html','play.mjs','play.css','worker.mjs','sim.mjs'])assert.ok(fs.existsSync('public/lotto3d/'+file),file);
 console.log('PASS: 로또 추첨기 records validated (distinct numbers in range, drawn order kept), own document kind, admin-only save, input checks, wired into the 추첨 게임 tab');
})().catch(e=>{console.error(e);process.exitCode=1;});
