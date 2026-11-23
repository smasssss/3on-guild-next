/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-23 user decision: 엉뚱 경주 in the 추첨 게임 tab. Numbered racers (2-10) run; which kind of racer wears which number and
// the finishing order come from the seed. The result is recorded in finishing order. Records are their own document kind 'race'
// (no other document is touched), readable by anyone and written by admins only. A commentary voice and the user's own race
// music play when the sound switch is on; a "결과 바로 보기" button skips to the result.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),route=f.load('app/api/race/route.ts'),store=f.load('lib/store.ts'),lib=f.load('lib/race.ts');
const origin='http://localhost:8790',token='e'.repeat(64);
const post=(body,auth=true)=>route.POST(new Request(origin+'/api/race',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
const TYPES10=['giraffe','elephant','cheetah','turtle','biped','ostrich','panda','horse','cow','costume'];
const race=(over={})=>({id:'d1b2c3d4-0000-4000-8000-000000000001',seed:'00c51d27',version:1,n:10,types:TYPES10,order:[6,1,5,8,3,2,9,7,10,4],...over});
(async()=>{
 // 1) Record rules: 2-10 racers, each kind at most once, the order holds every number exactly once
 const ok=lib.validateRace(race());assert.deepEqual(ok.order,[6,1,5,8,3,2,9,7,10,4],'finishing order is kept');assert.deepEqual(ok.types,TYPES10);assert.equal(ok.at,'');
 assert.equal(lib.validateRace(race({n:2,types:['cow','elephant'],order:[1,2]})).n,2,'two racers are enough');
 const bad=[[{order:[6,1,5,8,3,2,9,7,10]},/순위/],[{order:[6,1,5,8,3,2,9,7,10,10]},/순위/],[{order:[6,1,5,8,3,2,9,7,10,11]},/순위/],[{order:[0,1,5,8,3,2,9,7,10,4]},/순위/],[{order:[6,1,5,8,3,2,9,7,10,4.5]},/순위/],
  [{types:TYPES10.slice(0,9)},/선수 종류/],[{types:[...TYPES10.slice(0,9),'giraffe']},/선수 종류/],[{types:[...TYPES10.slice(0,9),'dragon']},/선수 종류/],
  [{n:1,types:['cow'],order:[1]},/선수 수/],[{n:11},/선수 수/],[{n:2.5},/선수 수/],[{seed:'zz'},/추첨 번호/],[{version:2},/규칙 판/],[{id:'x'},/기록 번호/]];
 for(const [over,why] of bad)assert.throws(()=>lib.validateRace(race(over)),why,JSON.stringify(over));
 assert.equal(lib.addRace(lib.addRace(lib.emptyRaces(),{...ok,at:'t'}),{...ok,at:'t'}).races.length,1,'the same race is not stored twice');
 // 2) Storage: own document kind, admin only, anyone reads, other documents untouched
 const others=()=>JSON.stringify(f.sql.prepare("SELECT * FROM documents WHERE kind<>'race' ORDER BY kind").all()),before=others();
 let r=await post({revision:0,mutation:'a'.repeat(32),race:race()},false);assert.equal(r.status,401,'not an admin');
 f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),Date.now()+86400000);
 r=await post({revision:0,mutation:'a'.repeat(32),race:race()});let body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.races[0].actor,'admin');assert.ok(body.races[0].at);
 r=await post({revision:0,mutation:'b'.repeat(32),race:race({id:'d1b2c3d4-0000-4000-8000-000000000002'})});assert.equal(r.status,409,'another device saved first');
 r=await post({revision:1,mutation:'c'.repeat(32),race:race({order:[1,1,5,8,3,2,9,7,10,4]})});body=await r.json();assert.equal(r.status,400);assert.match(body.error,/순위/);
 r=await route.GET(new Request(origin+'/api/race'));body=await r.json();assert.equal(body.schema,'3on-race-v1');assert.equal(body.revision,1);assert.deepEqual(body.races[0].order,[6,1,5,8,3,2,9,7,10,4],'anyone can read the record');
 assert.equal(others(),before,'no other document is touched');
 // 3) The tab's own checks, and the racer names it shows match the race maths
 const m={exports:{}};new Function('module',fs.readFileSync('public/race-game.js','utf8'))(m);const ui=m.exports;
 assert.equal(ui.check(10),null);assert.equal(ui.check(2),null);assert.match(ui.check(1),/2명부터 10명/);assert.match(ui.check(11),/2명부터 10명/);assert.match(ui.check(NaN),/숫자/);
 assert.equal(ui.MAX_RACERS,lib.MAX_RACERS);assert.equal(ui.MIN_RACERS,lib.MIN_RACERS);assert.deepEqual(Object.keys(ui.NAMES),[...lib.RACER_TYPES]);
 assert.deepEqual(ui.ranking(ok).slice(0,2),[{rank:1,no:6,name:'타조'},{rank:2,no:1,name:'기린'}]);
 assert.ok(ui.sameOrder([1,2,3],[1,2,3]));assert.ok(!ui.sameOrder([1,2,3],[1,3,2]));assert.ok(!ui.sameOrder([1,2],undefined));
 const sim=fs.readFileSync('public/race/sim.mjs','utf8');for(const [k,name] of Object.entries(ui.NAMES))assert.ok(sim.includes(k+":{name:'"+name+"'"),'name of '+k);
 assert.match(sim,/export const RACE_VERSION=1,MIN_RACERS=2;/);assert.equal(ui.VERSION,1);
 // 4) Wiring: the game is added to the 추첨 게임 tab's game switch; the record is saved before the race is shown; a skip button exists
 const html=fs.readFileSync('public/legacy.html','utf8');assert.match(html,/<script src="\/lotto-draw\.js\?v=\d+" defer><\/script><script src="\/race-game\.js\?v=\d+" defer><\/script>/);
 const js=fs.readFileSync('public/race-game.js','utf8');assert.match(js,/root\.gameSwitch\.add\('race','엉뚱 경주'/);assert.match(js,/ensureAdmin/);
 assert.ok(js.indexOf("api('/api/race',{method:'POST'")<js.indexOf('show.play()'),'the record is saved before the race plays');
 const player=fs.readFileSync('public/race/player.mjs','utf8');assert.match(player,/결과 바로 보기/);assert.match(player,/voice\/index\.json/);assert.match(player,/music\/race\.mp3/);
 for(const file of ['sim.mjs','view.mjs','player.mjs','voice/lines.json','music/race.mp3','music/CREDITS.md','assets/track.jpg','assets/panda.png','assets/shell.png','assets/kangaroo.png','assets/ufo.png','assets/mouse.png','assets/cbike.png','assets/cride.png','assets/cfront_0.png','assets/cback_1.png'])assert.ok(fs.existsSync('public/race/'+file),file);
 for(const k of lib.RACER_TYPES)if(k!=='panda')for(let i=0;i<4;i++)assert.ok(fs.existsSync('public/race/assets/'+k+'_'+i+'.png'),k+'_'+i);
 // 5) Voice clips, when present, are listed in voice/index.json and every listed clip exists
 if(fs.existsSync('public/race/voice/index.json')){const idx=JSON.parse(fs.readFileSync('public/race/voice/index.json','utf8'));for(const k of Object.keys(idx))assert.ok(fs.existsSync('public/race/voice/'+k+'.mp3'),'clip '+k);}
 console.log('PASS: 엉뚱 경주 records validated (one racer per kind, full finishing order), own document kind, admin-only save, input checks, wired into the 추첨 게임 tab');
})().catch(e=>{console.error(e);process.exitCode=1;});
