/* eslint-disable @typescript-eslint/no-require-imports -- Existing SQLite/API fixture harness. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),auto=f.load('lib/growth-automation.ts'),growth=f.load('lib/growth.ts'),legacy=f.load('app/api/growth/legacy/route.ts');
const source=JSON.parse(fs.readFileSync('tests/fixtures/lastasylum-50373046.json','utf8'));
const players=source.roster.slice(0,3),ids=players.map((_,i)=>'roster_test_member_'+i);
f.sql.prepare("UPDATE growth_membership_snapshots SET membership_state='archived'").run();
f.sql.prepare('INSERT INTO growth_auto_control VALUES(1,1,?,NULL,NULL,NULL,1)').run('2026-10-17');
for(let i=0;i<3;i++){
 f.sql.prepare("INSERT INTO growth_members VALUES(?,NULL,?,'roster-test','2026-10-17')").run(ids[i],players[i].name);
 f.sql.prepare("INSERT INTO growth_external_ids VALUES(?,?,?,'confirmed','roster-test',NULL,1,1)").run(players[i].id,ids[i],players[i].name);
}
const protectedDocs=JSON.stringify(f.sql.prepare('SELECT * FROM documents ORDER BY kind').all());
function payload(time,rows){return{...source,asOf:Date.parse(time)/1000,members:rows.length,roster:structuredClone(rows)};}
async function collect(time,rows){return auto.fixture(f.db,JSON.stringify(payload(time,rows)),Date.parse(time)+1000);}
async function view(){const response=await legacy.GET(new Request('http://localhost/api/growth/legacy'));assert.equal(response.status,200,await response.clone().text());return(await response.json()).data;}
async function main(){
 await collect('2026-10-17T13:00:00Z',players);await auto.closeDay(f.db,'2026-10-17',Date.parse('2026-10-17T15:10:00Z'));
 assert.equal((await growth.currentMembers()).members.length,3);
 const oldCount=f.sql.prepare('SELECT COUNT(*) n FROM growth_observations').get().n;
 await collect('2026-10-18T13:00:00Z',players.slice(0,2));
 assert.deepEqual((await growth.currentMembers()).members.map(m=>m.member_id).sort(),ids.slice(0,2),'a complete roster omission removes current membership immediately');
 assert.equal((await auto.automaticStatus(f.db)).members.length,2,'the hourly current-member table must also exclude absent players');
 const current=await view();assert.equal(current.guildCount,2);assert(current.archivedMembers.some(m=>m.member_id===ids[2]&&m.history.some(h=>h.power===players[2].power)),'departed member history remains available');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM growth_observations').get().n,oldCount,'current projection does not rewrite old growth data');
 const invalid=payload('2026-10-18T13:10:00Z',players.slice(0,2));invalid.members=3;assert.equal((await auto.fixture(f.db,JSON.stringify(invalid),Date.parse('2026-10-18T13:10:01Z'))).status,'invalid');assert.equal((await view()).guildCount,2);
 const abnormal=structuredClone(players.slice(0,2));abnormal[0].power*=10;await collect('2026-10-18T14:00:00Z',abnormal);assert.equal((await view()).guildCount,2,'power review does not remove a present member');
 await auto.closeDay(f.db,'2026-10-18',Date.parse('2026-10-18T15:10:00Z'));
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM growth_membership_snapshots WHERE batch_id='auto_close_2026-10-18' AND membership_state IN ('observed','unobserved','new','current')").get().n,2);
 assert.equal(f.sql.prepare("SELECT membership_state FROM growth_membership_snapshots WHERE batch_id='auto_close_2026-10-18' AND member_id=?").get(ids[2]).membership_state,'missing');
 assert((await growth.memberHistory(ids[2])).some(o=>o.power===players[2].power));
 // A later complete roster after midnight cannot change the prior day's membership cutoff.
 await collect('2026-10-19T13:00:00Z',players);
 const rejoined=(await growth.currentMembers()).members.find(m=>m.member_id===ids[2]);assert.equal(rejoined.power,players[2].power,'rejoin retains the last confirmed daily value');assert.equal(rejoined.observed_date,'2026-10-17');assert.equal(rejoined.membership_state,'unobserved');assert.equal((await view()).members.find(m=>m.member_id===ids[2]).observedToday,false,'rejoin must not claim a fresh confirmed daily observation');
 await collect('2026-10-19T15:00:00Z',players.slice(0,2));
 await auto.closeDay(f.db,'2026-10-19',Date.parse('2026-10-19T15:10:00Z'));
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM growth_membership_snapshots WHERE batch_id='auto_close_2026-10-19' AND membership_state='observed'").get().n,3,'daily cutoff uses pre-midnight full roster');
 assert.equal((await view()).guildCount,2,'current view uses the later live roster independently of the historic close');
 await collect('2026-10-20T13:00:00Z',players);assert.equal((await view()).guildCount,3,'same game ID rejoins without a duplicate account');
 assert((await growth.memberHistory(ids[2])).length>=2);assert.equal(f.sql.prepare('SELECT departed_at FROM growth_external_ids WHERE game_id=?').get(players[2].id).departed_at,null,'absence does not destroy identity or require manual relinking');
 const newcomer={...players[0],id:'900000000777',name:'완전신규로스터TEST'};await collect('2026-10-20T14:00:00Z',[...players,newcomer]);
 const added=await view();assert.equal(added.guildCount,4);const fresh=added.members.find(m=>m.member_id==='game_50373046_900000000777');assert(fresh);assert.equal(fresh.power,null,'a new current member has no fabricated confirmed daily power');assert.equal(fresh.history.length,0);
 const newest=f.sql.prepare('SELECT snapshot_id FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 1').get().snapshot_id;
 const saved=f.sql.prepare('SELECT * FROM growth_hourly_observations WHERE snapshot_id=? AND game_id=?').get(newest,newcomer.id);f.sql.prepare('DELETE FROM growth_hourly_observations WHERE snapshot_id=? AND game_id=?').run(newest,newcomer.id);
 assert.equal((await legacy.GET(new Request('http://localhost/api/growth/legacy'))).status,503,'a broken stored roster cannot silently prune members');
 f.sql.prepare('INSERT INTO growth_hourly_observations VALUES('+Array(15).fill('?').join(',')+')').run(...Object.values(saved));
 assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM documents ORDER BY kind').all()),protectedDocs,'carriage, VIP and canyon documents preserved');
 console.log('PASS: complete roster3→2→3; legacy/current counts; archived history; invalid-response retention; power review; strict daily cutoff; stable rejoin; operations preserved');
}
main().catch(e=>{console.error(e);process.exitCode=1});
