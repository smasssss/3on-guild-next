// Catches weekly carry-over/addition, early activation, unsafe identity linking and lost exclusions.
const assert=require('node:assert/strict'),fs=require('node:fs');
assert(fs.existsSync('lib/vip-weekly.ts'),'weekly policy service is not implemented');
const f=require('./vip-fixture.cjs')(),v=f.load('lib/vip-weekly.ts');
const at=s=>Date.parse(s),now=at('2026-10-31T13:00:00Z');
f.sql.prepare("UPDATE growth_members SET legacy_canonical=NULL WHERE legacy_canonical='언데드킬러'").run();
f.seedMember('eligible','Eligible');f.seedMember('blocked','언데드킬러');f.seedMember('left','Left');
f.addSnapshot('old');for(const id of ['eligible','blocked','left'])f.observe('old',id,id==='blocked'?'언데드킬러':id==='left'?'Left':'Eligible');
f.addSnapshot('new');f.observe('new','eligible','Eligible');f.observe('new','blocked','언데드킬러');
const carriage={pointer:3,records:[{id:'old',vip:'공 주'}],vipCarry:{'공 주':1,Other:999},vipResolution:{'공 주':1},vipExcludedMembers:{eligible:1}};
const original=JSON.stringify(carriage);
async function run(){
 assert.equal(v.weekOf(at('2026-11-01T14:59:59Z')),'2026-10-26');assert.equal(v.weekOf(at('2026-11-01T15:00:00Z')),'2026-11-02');
 let roster=await v.readRoster(f.db);assert.equal(roster.members.length,2);assert(!roster.members.some(m=>m.memberId==='left'));
 const eligible=roster.members.find(m=>m.memberId==='eligible'),blocked=roster.members.find(m=>m.memberId==='blocked');
 assert.equal(eligible.rank,'R4');assert.equal(eligible.level,30);
 assert.equal(v.eligibility(blocked,{},null,now).reason,'temporary');assert.equal(v.eligibility(eligible,carriage,null,now).reason,'permanent');
 assert.equal(v.eligibility(eligible,{},null,now).eligible,true);
 const input={providedOn:'2026-10-31',appliesOn:'2026-11-02',coverage:'partial',rows:[{memberId:'eligible',nickname:'Eligible',points:21720000}]};
 const weekly=v.prepareWeekly(input,roster.members,now);assert.equal(weekly.rows[0].points,21720000);
 const doc={current:null,pending:weekly};assert.equal(v.weeklyView(doc,now).active,null);
 let view=v.weeklyView(doc,at('2026-11-01T15:00:00Z'));assert.equal(view.active.appliesOn,'2026-11-02');
 assert.equal(v.eligibility(eligible,{},view.active,at('2026-11-01T15:00:00Z')).eligible,true);
 assert.equal(v.eligibility(eligible,carriage,view.active,at('2026-11-01T15:00:00Z')).reason,'permanent');
 assert.equal(v.eligibility(blocked,{},view.active,at('2026-11-01T15:00:00Z')).reason,'score_missing');
 assert.equal(v.weeklyView(doc,at('2026-11-08T15:00:00Z')).active,null,'previous week cannot roll over');
 for(const points of [21719999,15000000]){const w={...weekly,rows:[{...weekly.rows[0],points}]};assert.equal(v.eligibility(eligible,{},w,at('2026-11-02T01:00Z')).reason,'score_low');}
 const second=v.prepareWeekly({...input,providedOn:'2026-11-07',appliesOn:'2026-11-09',rows:[{...input.rows[0],points:15000000}]},roster.members,at('2026-11-07T13:00Z'));
 const replaced=v.replaceWeekly(doc,second,at('2026-11-07T13:00Z'));assert.equal(v.weeklyView(replaced,at('2026-11-08T15:00Z')).active.rows[0].points,15000000);
 const third=v.prepareWeekly({...input,providedOn:'2026-11-14',appliesOn:'2026-11-16',rows:[{...input.rows[0],points:23000000}]},roster.members,at('2026-11-14T13:00Z'));
 assert.equal(v.weeklyView(v.replaceWeekly(replaced,third,at('2026-11-14T13:00Z')),at('2026-11-15T15:00Z')).active.rows[0].points,23000000);
 for(const change of [{appliesOn:'2026-11-03'},{providedOn:'2026-10-30'},{coverage:'full'},{rows:[input.rows[0],input.rows[0]]},{rows:[{...input.rows[0],nickname:'eligible'}]},{rows:[{...input.rows[0],points:-1}]},{rows:[{...input.rows[0],points:'21,720,000'}]},{rows:[{...input.rows[0],memberId:'left'}]}])assert.throws(()=>v.prepareWeekly({...input,...change},roster.members,now));
 // Confirmed alias/canonical survives a rename without a fuzzy nickname match.
 f.sql.prepare("UPDATE growth_members SET display_name='New name' WHERE member_id='blocked'").run();
 f.sql.prepare("UPDATE growth_external_ids SET source_name='New name' WHERE member_id='blocked'").run();
 f.sql.prepare("UPDATE growth_hourly_observations SET source_name='New name' WHERE snapshot_id='new' AND member_id='blocked'").run();
 roster=await v.readRoster(f.db);assert.equal(v.eligibility(roster.members.find(m=>m.memberId==='blocked'),{},null,now).reason,'temporary');
 f.sql.prepare("UPDATE growth_external_ids SET departed_at=1 WHERE member_id='blocked'").run();
 assert.equal((await v.readRoster(f.db)).members.find(m=>m.memberId==='blocked').current,false);
 f.sql.prepare("UPDATE growth_external_ids SET departed_at=NULL WHERE member_id='blocked'").run();
 assert.equal((await v.readRoster(f.db)).members.find(m=>m.memberId==='blocked').memberId,'blocked');
 assert.equal(JSON.stringify(carriage),original);
 console.log('PASS: KST boundaries, threshold, replace-only, missing week/member, temporary/permanent, exact identity, latest roster, rename/rejoin and preserved VIP data');
}
run().catch(e=>{console.error(e);process.exitCode=1});
