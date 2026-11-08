/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness. */
// Catches blanket blocking, premature removal of the 16-member limit, and writes caused by roster refresh.
const assert=require('node:assert/strict'),f=require('./vip-fixture.cjs')();
const api=f.load('app/api/carriage/vip/route.ts'),state=f.load('app/api/state/route.ts'),store=f.load('lib/store.ts');
const realNow=Date.now;let now=Date.parse('2026-11-07T12:00Z');Date.now=()=>now;
const token='b'.repeat(64),origin='http://localhost:8790';let mutation=0;
f.seedMember('normal','Normal fixture');f.seedMember('temporary','DrBillX',null);f.seedMember('permanent','Permanent fixture');
f.addSnapshot('new');for(const [id,name]of [['normal','Normal fixture'],['temporary','DrBillX'],['permanent','Permanent fixture']])f.observe('new',id,name);
const original={pointer:0,records:[],vipCarry:{'공 주':1,Other:999},vipResolution:{'공 주':1},vipExcludedMembers:{permanent:1}};
f.sql.prepare("UPDATE documents SET payload=?,revision=0 WHERE kind='carriage'").run(JSON.stringify(original));
const request=(route,body)=>route.POST(new Request(origin+'/api/test',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...body,mutation:(++mutation).toString(16).padStart(32,'0')})}));
const ride=(id,vip,vipMemberId)=>({id,date:'2026-11-07',weekKey:'2026-11-02',type:'insert',leader:'Leader',vip,vipCanonical:vip==='DrBillX'?vipMemberId:vip,vipMemberId});
async function run(){
 f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),now+10*86400000);
 const before=f.sql.prepare('SELECT * FROM documents ORDER BY kind').all();
 // 2026-11-05 rules: before any applied score nobody qualifies (score_low); no temporary 16-member list.
 let view=await(await api.GET(new Request(origin+'/api/carriage/vip'))).json();assert.equal(view.awaitingFirstSnapshot,true);
 assert.equal(view.members.find(m=>m.memberId==='normal').eligibility.reason,'score_low');assert.equal(view.members.find(m=>m.memberId==='temporary').eligibility.reason,'score_low');assert.equal(view.members.find(m=>m.memberId==='permanent').eligibility.reason,'permanent');
 assert.deepEqual(f.sql.prepare('SELECT * FROM documents ORDER BY kind').all(),before,'matching current roster must not rewrite VIP records');
 for(const [id,name]of [['normal','Normal fixture'],['temporary','DrBillX'],['permanent','Permanent fixture']])assert.equal((await request(state,{kind:'carriage',revision:0,data:{...original,records:[ride('blocked',name,id)]}})).status,422,name+' refused without an applied score');
 const snapshot={providedOn:'2026-11-07',appliesOn:'2026-11-09',coverage:'full',rows:[{memberId:'normal',nickname:'Normal fixture',points:54999999},{memberId:'temporary',nickname:'DrBillX',points:55000000},{memberId:'permanent',nickname:'Permanent fixture',points:99000000}]};
 assert.equal((await request(api,{revision:0,snapshot})).status,200);
 view=await(await api.GET(new Request(origin+'/api/carriage/vip'))).json();assert.equal(view.awaitingFirstSnapshot,true,'first upload waits for Sunday');assert.equal(view.members.find(m=>m.memberId==='temporary').eligibility.reason,'score_low');
 now=Date.parse('2026-11-09T02:00Z'); // 2026-11-08 rule: Monday 11:00 KST
 view=await(await api.GET(new Request(origin+'/api/carriage/vip'))).json();assert.equal(view.awaitingFirstSnapshot,false);assert.equal(view.threshold,55000000);
 assert.equal(view.members.find(m=>m.memberId==='normal').eligibility.reason,'score_low','54,999,999 is below 55,000,000');assert.equal(view.members.find(m=>m.memberId==='temporary').eligibility.eligible,true,'55,000,000 qualifies');assert.equal(view.members.find(m=>m.memberId==='permanent').eligibility.reason,'permanent');
 let r=await request(state,{kind:'carriage',revision:0,data:{...original,records:[ride('allowed','DrBillX','temporary')]}});assert.equal(r.status,200,await r.clone().text());
 const saved=JSON.parse(f.sql.prepare("SELECT payload FROM documents WHERE kind='carriage'").get().payload);assert.equal(saved.records.length,1);assert.equal(saved.vipCarry['공 주'],1);assert.equal(saved.vipCarry.Other,999);assert.deepEqual(saved.vipExcludedMembers,{permanent:1});
 console.log('PASS: no score means score_low; 54,999,999 refused / 55,000,000 allowed by API; permanent always refused; first snapshot activates on Sunday; documents intact');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Date.now=realNow});
