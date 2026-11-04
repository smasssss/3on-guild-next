/* eslint-disable @typescript-eslint/no-require-imports -- Existing SQLite/API fixture harness. */
// Roster sync (2026-11-04): count tolerance, day-aligned source time, 3-collection membership,
// VIP = growth current roster, Sunday snapshot participants, and score/power separation.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),auto=f.load('lib/growth-automation.ts'),v=f.load('lib/vip-weekly.ts');
const growth=f.load('lib/growth.ts'),legacy=f.load('app/api/growth/legacy/route.ts'),api=f.load('app/api/carriage/vip/route.ts'),store=f.load('lib/store.ts');
const source=JSON.parse(fs.readFileSync('tests/fixtures/lastasylum-50373046.json','utf8'));
const all=source.roster.slice(0,12),gone=all.slice(9),stay=all.slice(0,9),joiner={...all[0],id:'900000000555',name:'신규확인대원'};
const member=id=>'game_50373046_'+id;
let clock=Date.parse('2026-11-03T05:00:00Z');const realNow=Date.now;Date.now=()=>clock;
const payload=(rows,extra={})=>({...structuredClone(source),asOf:Math.floor(clock/1000)-60,members:rows.length,roster:structuredClone(rows),...extra});
async function ingest(rows,extra){clock+=3_600_000;return auto.fixture(f.db,JSON.stringify(payload(rows,extra)),clock);}
const lastRun=()=>f.sql.prepare('SELECT * FROM growth_auto_runs ORDER BY called_at DESC,rowid DESC LIMIT 1').get();
const growthIds=async()=>(await growth.currentMembers()).members.map(m=>m.member_id).sort();
const vipIds=async()=>(await v.readRoster(f.db)).members.filter(m=>m.current).map(m=>m.memberId).sort();
const ids=rows=>rows.map(r=>member(r.id)).sort();
async function main(){
 f.sql.prepare('INSERT INTO growth_auto_control VALUES(1,1,?,NULL,NULL,NULL,1)').run('2026-11-03');
 f.sql.prepare("UPDATE growth_membership_snapshots SET membership_state='archived'").run();
 // 1) Count tolerance: up to 2 either way is accepted; above 2 or any other defect is still rejected.
 assert.equal((await ingest(all)).status,'accepted');
 await auto.closeDay(f.db,'2026-11-03',Date.parse('2026-11-03T15:10:00Z'));
 assert.equal((await ingest(all,{members:all.length+1})).status,'accepted','92 reported / 91 listed is accepted');
 assert.deepEqual(JSON.parse(lastRun().validation_json).count_gap,-1,'the gap is recorded in the collection log');
 assert.equal(f.sql.prepare('SELECT member_count FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 1').get().member_count,all.length,'stored count is the stored roster length');
 assert.equal((await ingest(all,{members:all.length-2})).status,'accepted','roster longer by 2 is accepted');
 assert.equal((await ingest(all,{members:all.length+2})).status,'accepted');
 for(const extra of [{members:all.length+3},{members:all.length-3},{tag:'XXX'},{server:1},{asOf:Math.floor(Date.parse('2027-01-01')/1000)}]){
  const r=await ingest(all,extra);assert.equal(r.status,'invalid',JSON.stringify(extra));
 }
 const dup=structuredClone(all);dup[1].id=dup[0].id;assert.equal((await ingest(dup)).status,'invalid','duplicate IDs remain rejected');assert.equal(lastRun().error,'DUPLICATE_OR_INVALID_ID');
 const badPlayer=structuredClone(all);badPlayer[0].rank=9;assert.equal((await ingest(badPlayer)).status,'invalid','player validation remains strict');
 // 2) Day-aligned asOf: receipt time is used; identical hourly responses are separate collections.
 const dayStart=Math.floor(Date.parse('2026-11-04T00:00:00Z')/1000);clock=Date.parse('2026-11-04T01:00:00Z');
 let r=await ingest(all,{asOf:dayStart,members:all.length+1});assert.equal(r.status,'accepted');
 const run=lastRun(),evidence=JSON.parse(run.validation_json);assert.equal(run.source_as_of,run.received_at);assert.equal(evidence.source_as_of_raw,dayStart);assert.equal(evidence.source_time_basis,'received_at');
 assert.equal((await ingest(all,{asOf:dayStart,members:all.length+1})).status,'accepted','same day-aligned asOf an hour later is a new collection');
 assert.equal((await ingest(all,{asOf:dayStart-86_400})).status,'accepted','an older day-aligned asOf is not treated as time regression');
 assert.equal((await ingest(all,{asOf:Math.floor(clock/1000)-7200})).status,'stale','a real (non-aligned) older asOf is still rejected as regression');
 // 3) Departures: 3 consecutive absences, rejected responses neither count nor reset.
 assert.deepEqual(await growthIds(),ids(all));
 const power=JSON.stringify(f.sql.prepare('SELECT member_id,power FROM growth_observations ORDER BY observation_id').all());
 await ingest(stay);assert.deepEqual(await growthIds(),ids(all),'1 absence: unchanged');
 let pending=(await v.readRoster(f.db)).pending;assert.deepEqual(pending.map(p=>[p.game_id,p.change,p.confirmations]).sort(),gone.map(g=>[g.id,'leave',1]).sort());
 assert.equal((await ingest(stay,{members:stay.length+5})).status,'invalid');assert.deepEqual(await growthIds(),ids(all),'rejected response neither counts nor removes');
 await ingest(stay);assert.deepEqual(await growthIds(),ids(all),'2 absences: unchanged');assert.deepEqual(await vipIds(),ids(all),'VIP follows the same roster');
 await ingest(stay);assert.deepEqual(await growthIds(),ids(stay),'3 absences: removed');assert.deepEqual(await vipIds(),ids(stay),'VIP removes the same 3 people');
 assert.deepEqual((await v.readRoster(f.db)).pending,[]);
 const archived=(await (await legacy.GET(new Request('http://localhost/api/growth/legacy'))).json()).data.archivedMembers;
 for(const g of gone)assert(archived.some(m=>m.member_id===member(g.id)),'removed members keep their history');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM growth_external_ids WHERE departed_at IS NOT NULL').get().n,0,'removal is not a departure write');
 // 4) Joins and rejoin: same 3-collection rule, identity reused.
 const back=[...stay,gone[0],joiner];
 await ingest(back);await ingest(back);assert.deepEqual(await growthIds(),ids(stay),'2 appearances: not yet added');
 // A duplicate collection of unchanged source data is a further confirmation.
 clock+=3_600_000;const raw=JSON.stringify(payload(back));await auto.fixture(f.db,raw,clock);
 assert.equal(lastRun().status,'accepted');clock+=60_000;await auto.fixture(f.db,raw,clock);assert.equal(lastRun().status,'duplicate');
 assert.deepEqual(await growthIds(),ids(back),'added after 3 confirmations (including a duplicate collection)');assert.deepEqual(await vipIds(),ids(back));
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM growth_external_ids WHERE game_id=?').get(gone[0].id).n,1);assert.equal(f.sql.prepare('SELECT member_id FROM growth_external_ids WHERE game_id=?').get(gone[0].id).member_id,member(gone[0].id),'rejoin links to the existing identity');
 // 5) Sunday snapshot: participants join VIP at once; absence from the snapshot never removes anyone.
 const token='b'.repeat(64);f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),clock+30*86400000);
 clock=Date.parse('2026-11-08T02:00:00Z');
 const nick=g=>f.sql.prepare('SELECT display_name FROM growth_members WHERE member_id=?').get(member(g.id)).display_name;
 const snapshot={providedOn:'2026-11-08',appliesOn:'2026-11-09',coverage:'partial',rows:[{memberId:member(gone[1].id),nickname:nick(gone[1]),points:30000000,participation:'participated',evidence:'user_screenshot'},{memberId:member(stay[0].id),nickname:nick(stay[0]),points:25000000}]};
 const post=await api.POST(new Request('http://localhost/api/carriage/vip',{method:'POST',headers:{Origin:'http://localhost',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({revision:0,mutation:'c'.repeat(32),snapshot})}));
 assert.equal(post.status,200,await post.clone().text());
 const view=await (await api.GET(new Request('http://localhost/api/carriage/vip'))).json();
 assert.equal(view.members.find(m=>m.memberId===member(gone[1].id)).current,true,'snapshot participant is in the VIP roster immediately');
 assert.deepEqual(view.snapshotAdded,[member(gone[1].id)]);
 assert.equal(view.members.filter(m=>m.current).length,back.length+1,'people missing from the smaller snapshot stay in the VIP roster');
 assert.deepEqual(await growthIds(),ids(back),'growth current roster is unchanged by the snapshot');
 assert.equal(JSON.stringify(f.sql.prepare('SELECT member_id,power FROM growth_observations ORDER BY observation_id').all()),power,'guild-war points never enter growth observations');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM growth_hourly_observations WHERE power IN (30000000,25000000)").get().n,0);
 // Still absent from the API after the snapshot: removed after 3 collections.
 for(let i=0;i<2;i++){await ingest(back);assert(( await vipIds()).includes(member(gone[1].id)),'kept until 3 absences after the snapshot');}
 await ingest(back);assert(!(await vipIds()).includes(member(gone[1].id)),'removed after 3 absences following the snapshot');
 assert.deepEqual(await vipIds(),ids(back));
 console.log('PASS: count gap ≤2 accepted/>2 and all other defects rejected; day-aligned asOf uses receipt time; 3-collection join/leave incl. duplicate, rejected runs ignored; VIP = growth roster; rejoin keeps identity; Sunday participants join VIP at once and leave after 3 absences; points never touch growth data');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Date.now=realNow});
