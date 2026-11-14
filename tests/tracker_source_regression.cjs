/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-13 user decision: the hourly roster comes from the Last Asylum Tracker API (key needed); when there is no key or
// the tracker fails, that hour falls back to lastasylum.gg.
// 2026-11-14 user decision: the tracker's alliance list once missed a member, so .gg is read too and fills anyone the
// tracker list lacks (the tracker's values win for members both have). Tracker data is converted to the .gg shape before it is stored.
// No real external call is made here.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),auto=f.load('lib/growth-automation.ts');
const gg=JSON.parse(fs.readFileSync('tests/fixtures/lastasylum-50373046.json','utf8'));
// The same roster as the tracker sends it (uid numbers, nick_name, lv, rank_code 101..105, active, updated_at in seconds).
const tracker=asOf=>({union_id:50373046,sid:295,name:gg.name,abbr:'3ON',power:gg.power,member_count:gg.members,updated_at:asOf+0.25,
 members:gg.roster.map(r=>({uid:Number(r.id),nick_name:r.name,power:r.power,lv:r.castle,rank_code:100+r.rank,rank_label:'R'+r.rank,kills:r.kills,active:r.activity,online:false,joined_at:null,daily_honor:1,daily_tech:2,aid:50373046,kid:295,x:null,y:null}))});
const reply=(status,body)=>({ok:status>=200&&status<300,status,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
(async()=>{
 // Conversion keeps every field the collector used from .gg.
 const c=auto.fromTracker(tracker(gg.asOf));
 assert.equal(c.roster.length,gg.roster.length);assert.equal(c.asOf,gg.asOf);assert.equal(c.tag,'3ON');assert.equal(c.server,295);
 for(const [i,r] of gg.roster.entries())assert.deepEqual({id:c.roster[i].id,name:c.roster[i].name,power:c.roster[i].power,castle:c.roster[i].castle,rank:c.roster[i].rank,activity:c.roster[i].activity,kills:c.roster[i].kills},{id:r.id,name:r.name,power:r.power,castle:r.castle,rank:r.rank,activity:r.activity,kills:r.kills});
 assert.throws(()=>auto.fromTracker({...tracker(gg.asOf),union_id:1}),/WRONG_ALLIANCE/);
 f.sql.prepare('INSERT INTO growth_auto_control VALUES(1,1,?,NULL,NULL,NULL,1)').run('2026-10-17');
 const calls=[];let trackerReply;
 let ggReply=()=>reply(200,{...gg,asOf:Math.floor(at/1000)-60});
 const fetcher=async(url,options)=>{calls.push({url,auth:options.headers.Authorization||null,redirect:options.redirect});return url===auto.TRACKER_URL?trackerReply():ggReply();};
 let at=0;
 const last=()=>f.sql.prepare('SELECT status,raw_json,error FROM growth_auto_runs ORDER BY called_at DESC LIMIT 1').get();
 const hour=h=>(at=Date.UTC(2026,10,13,h,0,0));
 // 1) With a key: the tracker (with the key) and .gg (without it); a member only .gg lists is filled in, and the
 //    tracker's values win for members both list.
 trackerReply=()=>{const t=tracker(Math.floor(hour(1)/1000)-30);t.members=t.members.slice(1);t.member_count=t.members.length;t.members[0].power+=7;return reply(200,t);};
 await auto.collect({DB:f.db,GROWTH_AUTO_MODE:'production',TRACKER_API_KEY:'test-key'},'test',hour(1),fetcher);
 assert.deepEqual(calls,[{url:auto.TRACKER_URL,auth:'Bearer test-key',redirect:'manual'},{url:auto.ALLIANCE_URL,auth:null,redirect:'manual'}]);
 let run=last(),stored=JSON.parse(run.raw_json);assert.equal(stored.source,'lastasylumtracker+gg');assert.deepEqual(stored.filledFromGg,[gg.roster[0].id]);
 assert.equal(stored.roster.length,gg.roster.length);assert.equal(stored.members,gg.roster.length);assert.equal(stored.roster.find(r=>r.id===gg.roster[1].id).power,gg.roster[1].power+7,'tracker values win');
 assert.notEqual(run.status,'failed');assert.equal(run.error??null,null);
 // 1b) .gg down: the tracker alone is used and the reason is kept.
 calls.length=0;trackerReply=()=>reply(200,tracker(Math.floor(hour(2)/1000)-30));ggReply=()=>reply(502,'down');
 await auto.collect({DB:f.db,GROWTH_AUTO_MODE:'production',TRACKER_API_KEY:'test-key'},'test',hour(2),fetcher);
 run=last();assert.equal(JSON.parse(run.raw_json).source,'lastasylumtracker');assert.match(run.error||'',/gg unavailable: HTTP_502/);
 ggReply=()=>reply(200,{...gg,asOf:Math.floor(at/1000)-60});
 // 2) Tracker down: the same hour falls back to .gg (two calls at most), and the reason is kept.
 calls.length=0;trackerReply=()=>reply(503,'busy');
 await auto.collect({DB:f.db,GROWTH_AUTO_MODE:'production',TRACKER_API_KEY:'test-key'},'test',hour(12),fetcher);
 assert.deepEqual(calls.map(c=>c.url),[auto.TRACKER_URL,auto.ALLIANCE_URL]);assert.equal(calls[1].auth,null,'the key is never sent to .gg');
 run=last();assert.equal(JSON.parse(run.raw_json).source,undefined);assert.match(run.error||'',/tracker fallback: TRACKER_HTTP_503/);
 // 3) A tracker reply for another alliance is refused and also falls back.
 calls.length=0;trackerReply=()=>reply(200,{...tracker(Math.floor(hour(13)/1000)-30),union_id:7});
 await auto.collect({DB:f.db,GROWTH_AUTO_MODE:'production',TRACKER_API_KEY:'test-key'},'test',hour(13),fetcher);
 assert.deepEqual(calls.map(c=>c.url),[auto.TRACKER_URL,auto.ALLIANCE_URL]);
 // 4) No key: .gg only, as before.
 calls.length=0;await auto.collect({DB:f.db,GROWTH_AUTO_MODE:'production'},'test',hour(14),fetcher);
 assert.deepEqual(calls.map(c=>c.url),[auto.ALLIANCE_URL]);
 // Still one collection per hour, and fixture mode never calls anything.
 calls.length=0;await auto.collect({DB:f.db,GROWTH_AUTO_MODE:'production',TRACKER_API_KEY:'test-key'},'test',hour(14)+60_000,fetcher);assert.equal(calls.length,0);
 await auto.collect({DB:f.db,GROWTH_AUTO_MODE:'fixture',TRACKER_API_KEY:'test-key'},'test',hour(16),fetcher);assert.equal(calls.length,0);
 console.log('PASS: roster from the tracker API with the key (same shape as .gg), filled from .gg when the tracker list misses someone, either source alone when the other fails, .gg only without a key, one collection per hour');
})().catch(e=>{console.error(e);process.exitCode=1;});
