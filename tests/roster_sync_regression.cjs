/* eslint-disable @typescript-eslint/no-require-imports -- Existing SQLite/API fixture harness. */
// Roster sync (2026-11-04): count tolerance, raw/receipt time separation, 3 hourly collections,
// VIP = growth current roster, Sunday snapshot participants, permanent exclusions, score/power separation.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),auto=f.load('lib/growth-automation.ts'),v=f.load('lib/vip-weekly.ts');
const growth=f.load('lib/growth.ts'),api=f.load('app/api/carriage/vip/route.ts'),state=f.load('app/api/state/route.ts'),store=f.load('lib/store.ts');
const source=JSON.parse(fs.readFileSync('tests/fixtures/lastasylum-50373046.json','utf8'));
// Real Production permanent exclusions (member ID, game ID, nickname), incl. the two sub-accounts added on 2026-11-04.
const EXCLUDED=[['e657d189-5bb1-5cee-91df-30a0efbfa222','428378136871','lucky--'],['new_03bba50f1acf000f07fb9ab53f63fd34','319248417063','멍멍멍이'],['c3223fbf-7d83-5a49-a339-2199d55dd0ae','426286293287','죠⃢팝'],['game_50373046_431139021095','431139021095','쿠르クール'],['d83a8d66-2e06-5e0b-a7ef-b03b5ce4ea0f','426813366567','tenledyny'],['new_88c3b21534cd9d84b5f7e83ba48677e1','430269243687','42테스'],['be2ef4be-33b2-5938-87c9-84ea9e96518c','353221288231','또때려줘'],['game_50373046_457104507175','457104507175','가⃢라'],['game_50373046_453094088999','453094088999','부르잙쿠'],['game_50373046_481129718055','481129718055','꧁두리꧂'],['game_50373046_480502743335','480502743335','꿀보맘']];
const template=source.roster[0];
// Seeded real accounts keep their last confirmed power/level so no power-review flag is raised.
const seeded=id=>f.sql.prepare("SELECT power,level FROM growth_observations WHERE member_id=? AND status='active' ORDER BY observed_date DESC,original_order DESC LIMIT 1").get(id);
const excludedRows=EXCLUDED.map(([memberId,id,name],i)=>({...template,id,name,power:seeded(memberId)?.power??3_000_000+i,castle:Math.max(12,seeded(memberId)?.level??0),rank:1}));
const normal=source.roster.slice(1,8),X=normal[0],lucky=excludedRows[0];
const base=[...normal,...excludedRows.slice(1)]; // lucky-- starts outside the guild
const member=r=>EXCLUDED.find(e=>e[1]===r.id)?.[0]||'game_50373046_'+r.id;
let clock=Date.parse('2026-11-03T05:00:00Z');const realNow=Date.now;Date.now=()=>clock;
const payload=(rows,extra={})=>({...structuredClone(source),asOf:Math.floor(clock/1000)-60,members:rows.length,roster:structuredClone(rows),...extra});
async function ingest(rows,extra,step=3_600_000){clock+=step;return auto.fixture(f.db,JSON.stringify(payload(rows,extra)),clock);}
const lastRun=()=>f.sql.prepare('SELECT * FROM growth_auto_runs ORDER BY called_at DESC,rowid DESC LIMIT 1').get();
const count=t=>f.sql.prepare('SELECT COUNT(*) n FROM '+t).get().n;
const growthIds=async()=>(await growth.currentMembers()).members.map(m=>m.member_id).sort();
const vipIds=async()=>(await v.readRoster(f.db)).members.filter(m=>m.current).map(m=>m.memberId).sort();
const pendingOf=async id=>(await v.readRoster(f.db)).pending.find(p=>p.game_id===id);
async function main(){
 for(const [memberId,gameId,name] of EXCLUDED){f.sql.prepare("INSERT OR IGNORE INTO growth_members VALUES(?,NULL,?,'fixture','2026-10-28')").run(memberId,name);f.sql.prepare("INSERT OR IGNORE INTO growth_external_ids VALUES(?,?,?,'confirmed','fixture',NULL,1,1)").run(gameId,memberId,name);
  assert.equal(f.sql.prepare("SELECT member_id FROM growth_external_ids WHERE game_id=? AND status='confirmed' AND departed_at IS NULL").get(gameId)?.member_id,memberId);}
 const canonicalOf=id=>f.sql.prepare('SELECT COALESCE(legacy_canonical,member_id) c FROM growth_members WHERE member_id=?').get(id).c;
 const carriage={pointer:0,records:[{id:'old',date:'2026-10-27',weekKey:'2026-10-26',type:'base',leader:'Leader',vip:'공 주'}],vipCarry:{'공 주':1},vipResolution:{'공 주':1},vipExcludedMembers:Object.fromEntries(EXCLUDED.map(e=>[e[0],1]))};
 f.sql.prepare("UPDATE documents SET payload=?,revision=10 WHERE kind='carriage'").run(JSON.stringify(carriage));
 f.sql.prepare('INSERT INTO growth_auto_control VALUES(1,1,?,NULL,NULL,NULL,1)').run('2026-11-03');
 f.sql.prepare("UPDATE growth_membership_snapshots SET membership_state='archived'").run();
 // 1) Count tolerance: up to 2 either way accepted; above 2 or any other defect still rejected.
 assert.equal((await ingest(base)).status,'accepted');
 await auto.closeDay(f.db,'2026-11-03',Date.parse('2026-11-03T15:10:00Z'));
 assert.equal((await ingest(base,{members:base.length+1})).status,'accepted','92 reported / 91 listed is accepted');
 assert.equal(JSON.parse(lastRun().validation_json).count_gap,-1,'the gap is recorded in the collection log');
 assert.equal(f.sql.prepare('SELECT member_count FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 1').get().member_count,base.length);
 assert.equal((await ingest(base,{members:base.length-2})).status,'accepted');assert.equal((await ingest(base,{members:base.length+2})).status,'accepted');
 for(const extra of [{members:base.length+3},{members:base.length-3},{tag:'XXX'},{server:1},{asOf:Math.floor(Date.parse('2027-01-01')/1000)}])assert.equal((await ingest(base,extra)).status,'invalid',JSON.stringify(extra));
 const dup=structuredClone(base);dup[1].id=dup[0].id;assert.equal((await ingest(dup)).status,'invalid');assert.equal(lastRun().error,'DUPLICATE_OR_INVALID_ID');
 const badPlayer=structuredClone(base);badPlayer[0].rank=9;assert.equal((await ingest(badPlayer)).status,'invalid','player validation remains strict');
 // 2) Source time vs our time. A whole-day asOf keeps the raw value; receipt time is used only as the collection time.
 const day=Math.floor(Date.parse('2026-11-04T00:00:00Z')/1000);clock=Date.parse('2026-11-04T01:00:00Z');
 assert.equal((await ingest(base,{asOf:day})).status,'accepted');
 let run=lastRun(),t=JSON.parse(run.validation_json);
 assert.deepEqual([t.source_as_of_raw,t.source_time_basis,t.called_at,t.received_at,t.content],[day,'received_at',run.called_at,run.received_at,'changed']);
 const status=await auto.automaticStatus(f.db);assert.equal(status.last_good.source_time_basis,'received_at','UI can label it as our collection time, not a measurement time');assert.equal(status.last_good.source_as_of_raw,day);
 const rows=count('growth_hourly_observations');
 assert.equal((await ingest(base,{asOf:day})).status,'duplicate','same whole-day asOf, unchanged content: duplicate collection');
 assert.equal(count('growth_hourly_observations'),rows,'unchanged data never adds hourly rows');assert.equal(JSON.parse(lastRun().validation_json).content,'unchanged');
 const moved=structuredClone(base);moved[1].power+=1000;assert.equal((await ingest(moved,{asOf:day})).status,'accepted','same whole-day asOf, changed content: new collection');
 assert.equal(count('growth_hourly_observations'),rows+base.length);
 assert.equal((await ingest(moved,{asOf:day-86_400})).status,'stale','an older whole-day asOf is older data');assert.equal(lastRun().error,'SOURCE_TIME_REGRESSED');
 assert.equal((await ingest(moved,{asOf:Math.floor(clock/1000)-7200})).status,'stale','a real older asOf is still rejected');
 const daily=count('growth_observations');
 // Midnight: a response received after 00:00 KST never enters the previous day's close.
 clock=Date.parse('2026-11-05T13:00:00Z');for(let i=0;i<2;i++)await ingest(moved,{asOf:day+86_400});
 const afterMidnight=structuredClone(moved);afterMidnight[2].power+=777_000;clock=Date.parse('2026-11-05T15:30:00Z');
 assert.equal((await auto.fixture(f.db,JSON.stringify(payload(afterMidnight,{asOf:day+86_400})),clock)).status,'accepted');
 await auto.closeDay(f.db,'2026-11-05',Date.parse('2026-11-05T15:40:00Z'));
 assert.equal(f.sql.prepare("SELECT power FROM growth_daily_sources WHERE date='2026-11-05' AND game_id=?").get(moved[2].id).power,moved[2].power,'00:30 KST data is not in the 11/5 close');
 assert(f.sql.prepare("SELECT MAX(received_at) t FROM growth_daily_sources WHERE date='2026-11-05'").get().t<Date.parse('2026-11-05T15:00:00Z'));
 assert.equal(count('growth_observations'),daily+base.length,'one daily growth row per member, not one per hourly collection');
 // 3) Leave: 3 distinct normal hourly collections; a reappearance resets; same-hour repeats and reprocessing do not count.
 const cur=afterMidnight,without=cur.filter(r=>r.id!==X.id);clock=Date.parse('2026-11-06T01:00:00Z');
 await ingest(without);await ingest(without);assert.equal((await pendingOf(X.id)).confirmations,2);
 await ingest(cur);assert.equal(await pendingOf(X.id),undefined,'reappearing during leave confirmation resets the count');
 await ingest(without);const firstRun=lastRun().run_id;
 assert.equal((await ingest(cur,{members:cur.length+6})).status,'invalid');assert.equal((await pendingOf(X.id)).confirmations,1,'rejected responses neither count nor reset');
 await auto.ingestStored(f.db,firstRun);assert.equal((await pendingOf(X.id)).confirmations,1,'reprocessing the same run adds nothing');
 const sameHour=payload(without);clock+=3_600_000;await auto.fixture(f.db,JSON.stringify(sameHour),clock);clock+=600_000;await auto.fixture(f.db,JSON.stringify(sameHour),clock);
 assert.equal(lastRun().status,'duplicate');assert.equal((await pendingOf(X.id)).confirmations,2,'two collections in one hour count once');
 assert((await growthIds()).includes(member(X)),'2 confirmations: still a member');
 await ingest(without);assert(!(await growthIds()).includes(member(X)),'3rd hourly confirmation: removed');assert.deepEqual(await vipIds(),await growthIds(),'VIP = growth roster');
 const leave=f.sql.prepare("SELECT * FROM growth_auto_events WHERE kind='roster_leave' AND game_id=?").get(X.id);assert(leave,'evidence event recorded');
 const proof=JSON.parse(leave.after_json).collections;assert.equal(proof.length,3);assert.equal(new Set(proof.map(p=>p.run_id)).size,3);assert.equal(new Set(proof.map(p=>Math.floor(p.called_at/3_600_000))).size,3,'3 different hours');
 assert(f.sql.prepare('SELECT COUNT(*) n FROM growth_hourly_observations WHERE game_id=?').get(X.id).n>0,'history kept');
 // Join: lucky-- returns, joins after 3, keeps identity, stays permanently excluded (as every excluded account).
 const back=[...without,lucky];await ingest(back);await ingest(back);assert(!(await growthIds()).includes(member(lucky)));
 await ingest(without);await ingest(back);assert.equal((await pendingOf(lucky.id)).confirmations,1,'disappearing during join confirmation resets the count');
 await ingest(back);await ingest(back);assert((await growthIds()).includes(member(lucky)),'joined after 3');assert.equal(f.sql.prepare('SELECT member_id FROM growth_external_ids WHERE game_id=?').get(lucky.id).member_id,EXCLUDED[0][0],'same identity');
 assert.equal(f.sql.prepare("SELECT kind FROM growth_auto_events WHERE kind='roster_join' AND game_id=?").get(lucky.id).kind,'roster_join');
 const view=async()=>(await (await api.GET(new Request('http://localhost/api/carriage/vip'))).json());
 let vipView=await view();
 for(const [memberId,,name] of EXCLUDED){const m=vipView.members.find(x=>x.memberId===memberId);assert(m&&m.current,name+' is a current member');assert.equal(m.eligibility.reason,'permanent',name+' stays permanently excluded');}
 const token='b'.repeat(64);f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),clock+30*86400000);
 const post=(route,body)=>route.POST(new Request('http://localhost/api/test',{method:'POST',headers:{Origin:'http://localhost',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 let k=0;const key=()=>(++k).toString(16).padStart(32,'0');
 for(const [memberId,,name] of [EXCLUDED[0],EXCLUDED[9],EXCLUDED[10]]){
  const r=await post(state,{kind:'carriage',revision:10,mutation:key(),data:{...carriage,records:[...carriage.records,{id:'try-'+memberId,date:'2026-11-06',weekKey:'2026-11-02',type:'insert',leader:'Leader',vip:canonicalOf(memberId),vipCanonical:canonicalOf(memberId),vipMemberId:memberId}]}});
  assert.equal(r.status,422,name+' VIP assignment is refused by the server');
 }
 const ok=await post(state,{kind:'carriage',revision:10,mutation:key(),data:{...carriage,records:[...carriage.records,{id:'normal',date:'2026-11-06',weekKey:'2026-11-02',type:'insert',leader:'Leader',vip:'game_50373046_'+normal[1].id,vipCanonical:'game_50373046_'+normal[1].id,vipMemberId:'game_50373046_'+normal[1].id}]}});
 assert.equal(ok.status,422,'2026-11-05 rules: a normal member without an applied score is below the threshold');
 // 4) Sunday snapshot: participants join the current roster and VIP at once; absence never removes; limits still apply.
 clock=Date.parse('2026-11-08T02:00:00Z');
 const powers=JSON.stringify(f.sql.prepare('SELECT member_id,power FROM growth_observations ORDER BY observation_id').all()),hourly=count('growth_hourly_observations');
 const nick=r=>f.sql.prepare('SELECT display_name FROM growth_members WHERE member_id=?').get(member(r)).display_name;
 const snapshot={providedOn:'2026-11-08',appliesOn:'2026-11-09',coverage:'partial',rows:[{memberId:member(X),nickname:nick(X),points:30000000,participation:'participated',evidence:'user_screenshot'},{memberId:member(lucky),nickname:nick(lucky),points:99000000},{memberId:member(normal[1]),nickname:nick(normal[1]),points:1000}]};
 const saved=await post(api,{revision:0,mutation:key(),snapshot});assert.equal(saved.status,200,await saved.clone().text());
 vipView=await view();
 assert((await growthIds()).includes(member(X)),'snapshot participant is in the current (growth) roster at once');
 assert.equal(vipView.members.find(m=>m.memberId===member(X)).current,true,'and in the VIP roster at once');assert.deepEqual(vipView.snapshotAdded,[member(X)]);
 assert.deepEqual(await vipIds(),await growthIds(),'VIP = growth roster');
 assert.equal((await growthIds()).length,back.length+1,'people missing from the smaller snapshot stay');
 assert.equal(vipView.members.find(m=>m.memberId===member(lucky)).eligibility.reason,'permanent','permanent exclusion beats a high score');
 assert.equal(vipView.members.find(m=>m.memberId===member(normal[1])).eligibility.reason,'score_low','weekly score limit still applies');
 assert.equal(JSON.stringify(f.sql.prepare('SELECT member_id,power FROM growth_observations ORDER BY observation_id').all()),powers,'guild-war points never enter growth records');
 assert.equal(count('growth_hourly_observations'),hourly);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM growth_hourly_observations WHERE power IN (30000000,99000000)').get().n,0);
 for(let i=0;i<2;i++){await ingest(back);assert((await growthIds()).includes(member(X)),'kept until 3 absences after the snapshot');}
 assert.equal((await pendingOf(X.id)).confirmations,2);
 await ingest(back);assert(!(await growthIds()).includes(member(X)),'removed after 3 hourly absences following the snapshot');assert.deepEqual(await vipIds(),await growthIds());
 console.log('PASS: count gap ≤2 accepted/>2 and other defects rejected; raw asOf/call/receipt kept apart; unchanged whole-day data is a duplicate (no hourly rows); changed same-day accepted; older day stale; post-midnight excluded from close; 3 distinct hourly collections with reset, same-hour/reprocess/rejected not counted, evidence recorded; rejoin keeps identity; 11 permanent exclusions incl. lucky--/꧁두리꧂/꿀보맘 refused; Sunday participants join growth+VIP at once, absence never removes, limits apply; points never touch growth data');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Date.now=realNow});
