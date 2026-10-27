/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// Catches authentication bypass, duplicate writes, document overwrite and forged VIP assignment.
const assert=require('node:assert/strict'),fs=require('node:fs');
assert(fs.existsSync('app/api/carriage/vip/route.ts'),'weekly VIP API is not implemented');
const f=require('./vip-fixture.cjs')(),api=f.load('app/api/carriage/vip/route.ts'),state=f.load('app/api/state/route.ts'),store=f.load('lib/store.ts');
const origin='http://localhost:8790',token='a'.repeat(64);let clock=Date.parse('2026-10-31T13:00Z');const realNow=Date.now;Date.now=()=>clock;
f.seedMember('alice','Alice');f.seedMember('bob','Bob');f.addSnapshot('new');f.observe('new','alice','Alice');f.observe('new','bob','Bob');
const original={pointer:3,records:[{id:'old',date:'2026-10-27',weekKey:'2026-10-26',type:'base',leader:'Leader',vip:'공 주'}],vipCarry:{'공 주':1,Other:999},vipResolution:{'공 주':1},vipExcludedMembers:{bob:1}};
f.sql.prepare("UPDATE documents SET payload=?,revision=43 WHERE kind='carriage'").run(JSON.stringify(original));
const snapshot={providedOn:'2026-10-31',appliesOn:'2026-11-02',coverage:'full',rows:[{memberId:'alice',nickname:'Alice',points:21720000},{memberId:'bob',nickname:'Bob',points:99000000}]};
const post=(route,body,auth=true,requestOrigin=origin)=>route.POST(new Request(origin+'/api/test',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
let mutation=0;const key=()=> (++mutation).toString(16).padStart(32,'0');
const saved=()=>JSON.parse(f.sql.prepare("SELECT payload FROM documents WHERE kind='carriage'").get().payload);
const assign=(id,vip='Alice',member='alice')=>({...original,records:[...original.records,{id,date:'2026-11-02',weekKey:'2026-11-02',type:'insert',leader:'Leader',vip,vipCanonical:vip,vipMemberId:member}]});
async function run(){
 f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),clock+30*86400000);
 let body={revision:0,mutation:key(),snapshot};
 assert.equal((await post(api,body,false)).status,401);assert.equal((await post(api,body,true,'https://other.example')).status,403);
 let r=await post(api,body);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).revision,1);
 const count=()=>f.sql.prepare("SELECT COUNT(*) n FROM backups WHERE kind='vip-weekly'").get().n;
 assert.equal(count(),1);assert.equal((await post(api,body)).status,200);assert.equal(count(),1,'same mutation must not create another backup');
 assert.equal((await post(api,{...body,revision:1,mutation:key()})).status,200);assert.equal(count(),1,'same snapshot is a semantic no-op');
 const correction=structuredClone(snapshot);correction.rows[0].points=15000000;
 assert.equal((await post(api,{revision:0,mutation:key(),snapshot:correction})).status,409);
 assert.equal((await post(api,{revision:1,mutation:key(),snapshot:correction})).status,200);
 assert.equal((await post(api,{revision:2,mutation:key(),snapshot})).status,200);
 assert.deepEqual(saved(),original,'score uploads never modify carriage or VIP counts');
 clock=Date.parse('2026-11-02T00:00Z');
 const get=async()=>{const r=await api.GET(new Request(origin+'/api/carriage/vip'));assert.equal(r.status,200);return r.json()};
 let view=await get();assert.equal(view.week,'2026-11-02');assert.equal(view.members.find(m=>m.memberId==='bob').eligibility.reason,'permanent');
 let forged=assign('forged','Bob','bob');delete forged.vipExcludedMembers;
 r=await post(state,{kind:'carriage',revision:43,mutation:key(),data:forged});assert.equal(r.status,422,await r.clone().text());assert.deepEqual(saved(),original);
 const valid=assign('valid');r=await post(state,{kind:'carriage',revision:43,mutation:key(),data:valid});assert.equal(r.status,200,await r.clone().text());
 assert.equal(saved().records.length,2);assert.equal(saved().vipCarry.Other,999);assert.equal(saved().vipResolution['공 주'],1);
 const omitted=structuredClone(saved());delete omitted.vipExcludedMembers;delete omitted.records[1].vipMemberId;omitted.records[1].vip='Renamed Alice';omitted.records[1].memo='memo edit';
 clock=Date.parse('2026-11-09T00:00Z');r=await post(state,{kind:'carriage',revision:44,mutation:key(),data:omitted});assert.equal(r.status,200,await r.clone().text());assert.equal(saved().vipExcludedMembers.bob,1,'old clients/restores cannot drop permanent exclusions');assert.equal(saved().records[1].vipMemberId,'alice','old clients cannot drop a stored stable ID');
 view=await get();assert(view.active,'API must retain last applied scores');assert.equal(view.active.appliesOn,'2026-11-02');assert.equal(view.carriedForward,true);assert.equal(view.members.find(m=>m.memberId==='alice').eligibility.eligible,true);
 assert.equal(view.revision,3,'missing-week fallback must not write a new weekly revision');assert.equal(view.active.updatedAt,'2026-10-31T13:00:00.000Z','fallback retains the real upload time');
 assert.equal(view.members.find(m=>m.memberId==='bob').eligibility.reason,'permanent');
 r=await post(state,{kind:'carriage',revision:45,mutation:key(),data:{...saved(),records:[...saved().records,{...valid.records[1],id:'retained-week'}]}});assert.equal(r.status,200,'API allows last applied qualifying score when this week has no snapshot');
 const backup=f.sql.prepare("SELECT payload FROM backups WHERE kind='carriage' AND revision=43").get();assert.deepEqual(JSON.parse(backup.payload),original,'pre-write backup is recoverable');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM backups WHERE kind='vip-weekly'").get().n,2,'only minimal weekly recovery copies retained');
 // A roster change between validation and commit must roll back the backup as well.
 clock=Date.parse('2026-11-07T13:00Z');const raceKey=key();
 const nextSnapshot={...snapshot,providedOn:'2026-11-07',appliesOn:'2026-11-09'};
 f.db.beforeBatch=()=>f.sql.prepare("UPDATE growth_auto_snapshots SET snapshot_id='changed' WHERE snapshot_id='new'").run();
 r=await post(api,{revision:3,mutation:raceKey,snapshot:nextSnapshot});assert.equal(r.status,409);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM backups WHERE mutation=?').get(raceKey).n,0,'failed write must not reserve mutation or report duplicate success');
 f.sql.prepare("UPDATE growth_auto_snapshots SET snapshot_id='new' WHERE snapshot_id='changed'").run();
 // A retained snapshot remains correctable under its original week; score edits never touch ride counts.
 clock=Date.parse('2026-11-09T00:00Z');const beforeCorrection=JSON.stringify(saved());
 r=await post(api,{revision:3,mutation:key(),snapshot:correction});assert.equal(r.status,200,'currently retained source week can be corrected');
 view=await get();assert.equal(view.active.rows.find(r=>r.memberId==='alice').points,15000000);assert.equal(view.members.find(m=>m.memberId==='alice').eligibility.reason,'score_low');assert.equal(JSON.stringify(saved()),beforeCorrection);
 assert.equal((await post(api,{revision:4,mutation:key(),snapshot})).status,200);
 // Current identity and the stored canonical must agree; member ID cannot disguise a different VIP.
 clock=Date.parse('2026-10-31T13:00Z');
 r=await post(state,{kind:'carriage',revision:46,mutation:key(),data:{...saved(),records:[...saved().records,{...valid.records[1],id:'mismatch',vipCanonical:'Bob',vipMemberId:'alice'}]}});assert.equal(r.status,422);
 // A departure approval does not bump the growth identity revision.
 const departureKey=key();f.db.beforeBatch=()=>f.sql.prepare("UPDATE growth_external_ids SET departed_at=1 WHERE member_id='alice'").run();
 r=await post(state,{kind:'carriage',revision:46,mutation:departureKey,data:{...saved(),records:[...saved().records,{...valid.records[1],id:'departure-race'}]}});assert.equal(r.status,409,'commit must recheck actual current membership');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM backups WHERE mutation=?').get(departureKey).n,0);
 console.log('PASS: actual routes + SQLite auth/origin/CAS/idempotence/backups/replacement/permanent protection/new VIP enforcement/unchanged historical ride');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Date.now=realNow});
