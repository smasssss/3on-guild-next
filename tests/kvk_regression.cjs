/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-20 user decision: a 국가원정 tab for server 295 from lastasylum.gg public pages (saved copies here, no network).
// Only 295 alliances are kept, keyed by the page's alliance number (renames/new/missing alliances are history).
// Calls happen only Saturday 22:00 KST (kills before) and Sunday 01:00-12:00 KST until that week's result, loss table
// and changed kills are in; past loss tables are read once, one week per hour; a failure never stops growth collection.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),k=f.load('lib/kvk.ts');
const KILLS=fs.readFileSync('tests/fixtures/lastasylum-295-alliance-kills.html','utf8');
const KVK=fs.readFileSync('tests/fixtures/lastasylum-kvk-295.html','utf8');
const KVK1031=fs.readFileSync('tests/fixtures/lastasylum-kvk-295-2026-10-31.html','utf8');
const KVKOLD=fs.readFileSync('tests/fixtures/lastasylum-kvk-295-2026-10-10.html','utf8'); // asks for 10-10, shows 11-07
const kst=s=>Date.parse(s+'+09:00');
(async()=>{
 // Parsing the real pages
 const kills=k.parseKills(KILLS);assert.equal(kills.length,53);assert.deepEqual(kills[0],{id:'50373046',tag:'3ON',name:'교권보호국',kills:160994529});
 const results=k.parseResults(KVK);assert.equal(results.length,8);
 assert.deepEqual(results.slice(0,3).map(r=>[r.month,r.day,r.result,r.fallUtc,r.target]),[[11,14,'none',null,null],[11,7,'taken','15:03',293],[10,31,'held',null,290]]);
 const loss=k.parseLosses(KVK);assert.equal(loss.week,'2026-11-07');assert.equal(loss.rows.length,34,'only server 295 alliances');
 assert.deepEqual(loss.rows.find(r=>r.id==='50373046'),{id:'50373046',tag:'3ON',name:'교권보호국',loss:-250600000,pct:-4.9,before:5100000000,after:4800000000});
 assert.equal(k.parseLosses(KVK1031).week,'2026-10-31');assert.equal(k.parseLosses(KVKOLD).week,'2026-11-07','an old week falls back to the latest table');
 assert.equal(k.amount('977.5M'),977500000);assert.equal(k.dateOf(11,7,kst('2026-11-20T15:00:00')),'2026-11-07');assert.equal(k.dateOf(12,26,kst('2027-01-03T02:00:00')),'2026-12-26');
 assert.throws(()=>k.parseKills('<html>changed layout</html>'),/KVK_NO_KILLS_TABLE/);

 // A fake site: records every call; pages can be swapped per URL.
 const calls=[];let pages={};
 const fetcher=async url=>{calls.push(url);const body=pages[url];return body===undefined?{ok:false,status:503,text:async()=>'busy'}:{ok:true,status:200,text:async()=>body};};
 const data=k.emptyKvk();
 // 1) First run (a Friday, not a collection hour): record what the KvK page shows now, then one past week per hour.
 pages[k.kvkUrl()]=KVK;pages[k.kvkUrl('2026-10-31')]=KVK1031;pages[k.kvkUrl('2026-10-24')]=KVKOLD;pages[k.kvkUrl('2026-10-10')]=KVKOLD;pages[k.kvkUrl('2026-09-12')]=KVKOLD;pages[k.kvkUrl('2026-09-05')]=KVKOLD;
 let r=await k.kvkTick(data,kst('2026-11-20T16:00:00'),fetcher);assert.equal(r.calls,1);
 assert.equal(data.weeks['2026-11-07'].result,'taken');assert.equal(data.weeks['2026-11-14'].result,'none');assert.equal(data.weeks['2026-11-07'].loss.rows.length,34);
 for(let h=17;h<23;h++)await k.kvkTick(data,kst(`2026-11-20T${h}:00:00`),fetcher);
 assert.deepEqual(calls.slice(1),[k.kvkUrl('2026-10-31'),k.kvkUrl('2026-10-24'),k.kvkUrl('2026-10-10'),k.kvkUrl('2026-09-12'),k.kvkUrl('2026-09-05')],'one past week per hour, newest first');
 assert.equal(data.weeks['2026-10-31'].loss.rows.length,30);assert.equal(data.weeks['2026-10-24'].lossMissing,true,'a table for another week is not stored');
 assert.equal(data.backfill.done,true);calls.length=0;
 assert.equal((await k.kvkTick(data,kst('2026-11-21T10:00:00'),fetcher)).calls,0,'no calls outside the KvK hours');
 // 2) Saturday 22:00 KST: kills before the battle, once.
 pages[k.KILLS_URL]=KILLS;
 await k.kvkTick(data,kst('2026-11-21T22:00:00'),fetcher);await k.kvkTick(data,kst('2026-11-21T22:00:00'),fetcher);
 assert.deepEqual(calls,[k.KILLS_URL]);assert.equal(data.weeks['2026-11-21'].killsBefore.rows.length,53);calls.length=0;
 // 3) Sunday 01:00: the site still shows last week -> nothing stored for this week; kills unchanged -> not "after" yet.
 pages[k.kvkUrl('2026-11-21')]=KVK;
 await k.kvkTick(data,kst('2026-11-22T01:00:00'),fetcher);
 assert.deepEqual(calls,[k.kvkUrl('2026-11-21'),k.KILLS_URL]);assert.equal(data.weeks['2026-11-21'].result,undefined);assert.equal(data.weeks['2026-11-21'].killsAfter,undefined);calls.length=0;
 // 4) Sunday 02:00: this week's row and loss table are up and kills moved -> stored; 03:00 makes no call.
 const updated=KVK.replace('11월 7일</td>','11월 21일</td>').replace('길드 전투력 손실 2026년 11월 7일','길드 전투력 손실 2026년 11월 21일');
 pages[k.kvkUrl('2026-11-21')]=updated;pages[k.KILLS_URL]=KILLS.replace('160,994,529','161,500,000').replace('[<!-- -->UDT<!-- -->]','[<!-- -->UDX<!-- -->]');
 await k.kvkTick(data,kst('2026-11-22T02:00:00'),fetcher);
 const w=data.weeks['2026-11-21'];assert.equal(w.result,'taken');assert.equal(w.fallUtc,'15:03');assert.equal(w.loss.rows.length,34);
 assert.equal(w.killsAfter.rows.find(x=>x.id==='50373046').kills-w.killsBefore.rows.find(x=>x.id==='50373046').kills,505471);
 assert.deepEqual(data.alliances['50373284'].history.map(h=>h.tag),['UDT','UDX'],'a renamed tag is kept as history under the same alliance number');
 calls.length=0;await k.kvkTick(data,kst('2026-11-22T03:00:00'),fetcher);assert.equal(calls.length,0,'complete week: no more calls');
 // 5) A week that never updates is marked at Sunday 12:00 and the site is not called afterwards.
 const lazy=k.emptyKvk();lazy.backfill.done=true;pages[k.kvkUrl('2026-11-28')]=KVK;
 await k.kvkTick(lazy,kst('2026-11-29T12:00:00'),fetcher);assert.equal(lazy.weeks['2026-11-28'].stale,true);
 calls.length=0;await k.kvkTick(lazy,kst('2026-11-29T13:00:00'),fetcher);assert.equal(calls.length,0);
 // 6) Stored as its own document kind; a site failure only records the reason and never throws.
 const others=()=>JSON.stringify(f.sql.prepare("SELECT * FROM documents WHERE kind<>'kvk' ORDER BY kind").all()),before=others();
 pages={};await k.collectKvk(f.db,kst('2026-11-20T16:00:00'),fetcher);
 let doc=await k.readKvk(f.db);assert.equal(doc.revision,1);assert.match(doc.data.lastError.message,/KVK_HTTP_503/);
 pages[k.kvkUrl()]=KVK;await k.collectKvk(f.db,kst('2026-11-20T17:00:00'),fetcher);
 doc=await k.readKvk(f.db);assert.equal(doc.revision,2);assert.equal(doc.data.lastError,null);assert.equal(doc.data.weeks['2026-11-07'].loss.rows.length,34);
 assert.equal(others(),before,'no other document is touched');
 const route=f.load('app/api/kvk/route.ts');const body=await (await route.GET(new Request('https://x/api/kvk'))).json();
 assert.equal(body.server,295);assert.equal(body.weeks['2026-11-07'].result,'taken');
 // 7) The hourly job runs the KvK record after the growth collection and survives its failure.
 const worker=fs.readFileSync('build/sites-worker.ts','utf8');assert.match(worker,/try \{ return await scheduledAutomation\(controller, env\); \}\s*finally \{ await scheduledKvk\(controller, env\); \}/);
 let hit=0;const realFetch=globalThis.fetch;globalThis.fetch=async()=>{hit++;throw Error('down');};
 await k.scheduledKvk({scheduledTime:kst('2026-11-21T22:10:00')},{DB:f.db,GROWTH_AUTO_MODE:'production'});
 await k.scheduledKvk({scheduledTime:kst('2026-11-21T22:00:00')},{DB:f.db,GROWTH_AUTO_MODE:'fixture'});assert.equal(hit,0,'only on the hour, only in production');
 await k.scheduledKvk({scheduledTime:kst('2026-11-21T22:00:00')},{DB:f.db,GROWTH_AUTO_MODE:'production'});assert.equal(hit,1,'a site failure does not throw');globalThis.fetch=realFetch;
 // 8) The tab's own arithmetic
 const m={exports:{}};new Function('module',fs.readFileSync('public/kvk.js','utf8'))(m);const ui=m.exports;
 assert.deepEqual(ui.weekGain({killsBefore:{rows:[{id:'a',kills:5},{id:'b',kills:9}]},killsAfter:{rows:[{id:'a',kills:8},{id:'c',kills:1}]}}),[{id:'a',gain:3}]);
 // Contribution score = (share of the server's kill gain + share of the server's power loss) / 2; one side alone when only one exists.
 const sh=ui.shares({killsBefore:{rows:[{id:'a',kills:0},{id:'b',kills:0}]},killsAfter:{rows:[{id:'a',kills:30},{id:'b',kills:10}]},loss:{rows:[{id:'a',loss:-100,pct:-1,before:1,after:1},{id:'b',loss:-300,pct:-1,before:1,after:1}]}});
 assert.deepEqual(sh.map(r=>[r.id,r.kShare,r.lShare,r.score]),[['a',75,25,50],['b',25,75,50]]);
 assert.deepEqual(ui.shares({loss:{rows:[{id:'a',loss:-100,pct:-1,before:1,after:1},{id:'b',loss:-300,pct:-1,before:1,after:1}]}}).map(r=>[r.id,r.score]),[['b',75],['a',25]],'loss only');
 assert.equal(ui.fallKst('15:03'),'일 00:03');assert.equal(ui.big(-250600000),'-250.6M');
 console.log('PASS: 국가원정 pages parsed (295 only, by alliance number), calls only on Saturday 22:00 / Sunday 01-12 KST until complete, past weeks once one per hour, own document, failures recorded without stopping collection');
})().catch(e=>{console.error(e);process.exitCode=1;});
