/* eslint-disable @typescript-eslint/no-require-imports -- Existing real SQLite and VM regression harness. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=require('./vip-fixture.cjs');
const failures=[];
async function check(name,run){try{await run();console.log('PASS: '+name)}catch(e){failures.push(name);console.error('FAIL: '+name+' — '+e.message)}}
function setup(){const f=fixture();f.seedMember('a','Alice');f.seedMember('h','Historical');f.addSnapshot('old');f.observe('old','a','Alice');f.observe('old','h','Historical');f.addSnapshot('new');f.observe('new','a','Alice');return f;}
const sunday=Date.parse('2026-11-01T02:00:00Z'),saturday=Date.parse('2026-10-31T02:00:00Z');
const snapshot=(providedOn='2026-11-01')=>({providedOn,appliesOn:'2026-11-02',coverage:'full',rows:[{memberId:'a',nickname:'Alice',points:21720000,participation:'participated',evidence:'user_screenshot'},{memberId:'h',nickname:'Historical',points:0,participation:'not_participated',evidence:'user_confirmation'}]});
async function request(f,input,revision=0,mut='1'.repeat(32)){
 const store=f.load('lib/store.ts'),api=f.load('app/api/carriage/vip/route.ts'),token='a'.repeat(64);
 f.sql.prepare('INSERT OR IGNORE INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),sunday+30*86400000);
 return api.POST(new Request('http://localhost/api/carriage/vip',{method:'POST',headers:{Origin:'http://localhost',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({snapshot:input,revision,mutation:mut})}));
}
async function main(){const originalNow=Date.now;Date.now=()=>sunday;
await check('Sunday provision keeps its real date and maps only to the next Monday',async()=>{
 const f=setup(),v=f.load('lib/vip-weekly.ts'),r=await v.readRoster(f.db),input=snapshot();input.rows.pop();
 const result=v.prepareWeekly(input,r.members,sunday);assert.equal(result.providedOn,'2026-11-01');assert.equal(result.appliesOn,'2026-11-02');
 for(const providedOn of ['2026-10-30','2026-11-02','2026-11-08'])assert.throws(()=>v.prepareWeekly({...input,providedOn},r.members,sunday));
 assert.throws(()=>v.prepareWeekly({...input,appliesOn:'2026-11-09'},r.members,sunday));
 assert.throws(()=>v.prepareWeekly(input,r.members,saturday));
});
await check('Participation evidence uses strict scalar enum values',async()=>{
 const f=setup(),v=f.load('lib/vip-weekly.ts'),r=await v.readRoster(f.db);
 for(const patch of [{participation:['not_participated'],evidence:['user_confirmation']},{participation:'participated',evidence:['user_screenshot']}]){
  const input=snapshot();input.rows.pop();Object.assign(input.rows[0],patch);assert.throws(()=>v.prepareWeekly(input,r.members,sunday));
 }
});
await check('Known unobserved member accepts only explicit confirmed nonparticipation without rejoining',async()=>{
 const f=setup(),before=f.sql.prepare('SELECT kind,revision,payload FROM documents ORDER BY kind').all();
 let response=await request(f,snapshot('2026-10-31'));assert.equal(response.status,200,await response.clone().text());
 const savedData=(await response.json()).data;const saved=savedData.current||savedData.pending;assert.equal(saved.rows.length,2);assert.equal(saved.rows.find(r=>r.memberId==='h').evidence,'user_confirmation');
 const api=f.load('app/api/carriage/vip/route.ts'),view=await (await api.GET(new Request('http://localhost/api/carriage/vip'))).json();
 assert(!view.members.some(m=>m.memberId==='h'),'reference must not enter the actual observed roster');
 assert.equal(view.scoreMembers.find(m=>m.memberId==='h').current,false);
 assert.deepEqual(f.sql.prepare("SELECT kind,revision,payload FROM documents WHERE kind<>'vip-weekly' ORDER BY kind").all(),before);
 assert.equal((await request(f,snapshot('2026-10-31'),1,'2'.repeat(32))).status,200);
 assert.equal(f.sql.prepare("SELECT revision FROM documents WHERE kind='vip-weekly'").get().revision,1,'semantic duplicate must be a no-op');
 for(const patch of [{points:1},{participation:'participated'},{evidence:'user_screenshot'},{evidence:undefined},{memberId:'unknown'},{nickname:'HISTORICAL'}]){
  const input=snapshot('2026-10-31');Object.assign(input.rows[1],patch);assert.equal((await request(f,input,1,crypto.randomUUID())).status,400,JSON.stringify(patch));
 }
 const changed=snapshot('2026-10-31');changed.rows[0].points=22000000;
 const race=crypto.randomUUID();f.db.beforeBatch=()=>f.sql.prepare("UPDATE growth_external_ids SET departed_at=1 WHERE member_id='h'").run();
 assert.equal((await request(f,changed,1,race)).status,409);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM backups WHERE mutation=?').get(race).n,0);
 assert.equal(f.sql.prepare("SELECT revision FROM documents WHERE kind='vip-weekly'").get().revision,1);
 f.sql.prepare("UPDATE growth_external_ids SET departed_at=NULL WHERE member_id='h'").run();
 const renamed=crypto.randomUUID();f.db.beforeBatch=()=>f.sql.prepare("UPDATE growth_members SET display_name='Changed' WHERE member_id='h'").run();
 assert.equal((await request(f,changed,1,renamed)).status,409);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM backups WHERE mutation=?').get(renamed).n,0);
 const m=f.load('lib/vip-weekly.ts');assert.equal(m.eligibility({memberId:'h',current:false}, {},saved,Date.parse('2026-11-02T00:00Z')).reason,'membership');
});
await check('Real upload preview accepts references and identifies administrator-confirmed nonparticipation',async()=>{
 const nodes={vipWeeklySave:{disabled:true},vipWeeklyPreview:{textContent:''}},view={schema:'3on-vip-weekly-v1',revision:0,week:'2026-10-26',roster:{sourceAsOf:1},members:[{memberId:'a',nickname:'Alice',current:true}],scoreMembers:[{memberId:'a',nickname:'Alice',current:true},{memberId:'h',nickname:'Historical',current:false}],active:null,pending:null};
 const ctx={console,Date,Number,Set,Map,JSON,Promise,crypto,window:{addEventListener(){}},document:{getElementById:id=>nodes[id],querySelectorAll:()=>[]},GROWTH:{members:[],archivedMembers:[]},state:{vipExcludedMembers:{}},memberByCanonical(){},memberByLabel(){},ensureAdmin:()=>true,sharedRequest:async()=>view,fmt:n=>Number(n).toLocaleString('ko-KR'),escapeLabel:s=>String(s),labelOfMember:m=>m.displayName||m.name};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/carriage-vip.js','utf8'),ctx);
 await ctx.reviewVipSnapshot({target:{files:[{size:1000,text:async()=>JSON.stringify(snapshot())}]}});
 assert.equal(nodes.vipWeeklySave.disabled,false,nodes.vipWeeklyPreview.textContent);assert(nodes.vipWeeklyPreview.textContent.includes('미참여'));
});
Date.now=originalNow;if(failures.length)throw Error(failures.length+' weekly input regressions failed');}
main().catch(e=>{console.error(e.message);process.exitCode=1});
