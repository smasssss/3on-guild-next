/* eslint-disable @typescript-eslint/no-require-imports -- Existing SQLite and renderer harnesses. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const f=require('./vip-fixture.cjs')(),v=f.load('lib/vip-weekly.ts'),api=f.load('app/api/carriage/vip/route.ts');
const snapshot={providedOn:'2026-11-01',appliesOn:'2026-11-02',coverage:'full',updatedAt:'2026-11-01T02:00:00Z',rows:[{memberId:'low',nickname:'Low',points:0},{memberId:'high',nickname:'High',points:21720000},{memberId:'temp',nickname:'DrBillX',points:25000000},{memberId:'permanent',nickname:'Permanent',points:99000000}]};
for(const [id,name] of [['low','Low'],['high','High'],['temp','DrBillX'],['permanent','Permanent']])f.seedMember(id,name);
f.addSnapshot('new');for(const [id,name] of [['low','Low'],['high','High'],['temp','DrBillX'],['permanent','Permanent']])f.observe('new',id,name);
const carriage={pointer:0,records:[],vipCarry:{'공 주':1,Other:999},vipResolution:{'공 주':1},vipExcludedMembers:{permanent:1}};
f.sql.prepare("UPDATE documents SET payload=? WHERE kind='carriage'").run(JSON.stringify(carriage));
f.sql.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?)').run('vip-weekly',1,JSON.stringify({current:null,pending:snapshot}),'unchanged','admin','original');
const original=f.sql.prepare('SELECT * FROM documents ORDER BY kind').all();
async function main(){
 const realNow=Date.now;
 try{
 for(const [time,active] of [['2026-10-31T14:59:59Z',false],['2026-10-31T15:00:00Z',true],['2026-11-01T14:59:59Z',true],['2026-11-01T15:00:00Z',true]]){
  Date.now=()=>Date.parse(time);const view=await (await api.GET(new Request('http://localhost/api/carriage/vip'))).json();
  assert.equal(!view.awaitingFirstSnapshot,active,time);assert.equal(view.members.find(m=>m.memberId==='low').eligibility.reason,active?'score_low':'eligible',time);
  assert.equal(view.members.find(m=>m.memberId==='temp').eligibility.reason,active?'eligible':'temporary',time);assert.equal(view.members.find(m=>m.memberId==='permanent').eligibility.reason,'permanent');
  if(active){assert.equal(view.effectiveOn,'2026-11-01');assert.equal(view.active.appliesOn,'2026-11-02');}
 }
 assert.deepEqual(f.sql.prepare('SELECT * FROM documents ORDER BY kind').all(),original,'read-time Sunday activation never changes stored rows or operation weeks');
 const roster=await v.readRoster(f.db);assert.throws(()=>v.prepareWeekly(snapshot,roster.members,Date.parse('2026-11-08T02:00:00Z'),'2026-11-09'),'Sunday rejects replacing the active cycle with an unrelated older week');
 const next={...snapshot,appliesOn:'2026-11-09',providedOn:'2026-11-08',rows:[{memberId:'low',nickname:'Low',points:22000000}]},data={current:snapshot,pending:next};
 assert.equal(v.weeklyView(data,Date.parse('2026-11-07T14:59:59Z')).active.rows[0].points,0);
 assert.equal(v.weeklyView(data,Date.parse('2026-11-07T15:00:00Z')).active.rows[0].points,22000000);
 assert.equal(v.weeklyView({current:null,pending:snapshot},Date.parse('2026-11-07T15:00:00Z')).carriedForward,true);
 assert.equal(v.weekOf(Date.parse('2026-11-01T14:59:59Z')),'2026-10-26','operational Monday week stays unchanged');
 console.log('PASS: stored pending scores activate at Sunday KST boundary, permanent/temporary policy and carry-forward preserve all DB documents');
 }finally{Date.now=realNow;}
 const nodes={vipSearch:{value:''},vipResults:{innerHTML:''}};
 const members=[{memberId:'low',canonical:'Low',nickname:'Low',current:true,level:30,eligibility:{eligible:false,reason:'score_low'}},{memberId:'high',canonical:'High',nickname:'High',current:true,level:30,eligibility:{eligible:true,reason:'eligible'}},{memberId:'later',canonical:'Later',nickname:'Later',current:true,level:20,eligibility:{eligible:true,reason:'eligible'}},{memberId:'temp',canonical:'Temp',nickname:'Temp',current:true,level:20,eligibility:{eligible:false,reason:'temporary'}},{memberId:'permanent',canonical:'Permanent',nickname:'Permanent',current:true,eligibility:{eligible:false,reason:'permanent'}}];
 const ctx={console,Date,Number,Set,Map,JSON,Promise,crypto,VERIFIED_IDENTITIES:{},aliases:{},window:{addEventListener(){}},document:{getElementById:id=>nodes[id],querySelectorAll:()=>[]},GROWTH:{members:[],archivedMembers:[]},state:{vipExcludedMembers:{permanent:1}},labelOfMember:m=>m.displayName||m.name,vipTotalCount:n=>({Low:0,High:999,Later:1,Temp:2})[n],carryConflict:()=>false,escapeLabel:s=>String(s),fmt:n=>Number(n).toLocaleString('ko-KR'),memberByCanonical(){},memberByLabel(){}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/carriage-vip.js','utf8'),ctx);ctx.view={week:'2026-10-26',roster:{sourceAsOf:1},members,active:snapshot};vm.runInContext('carriageVip.view=view',ctx);ctx.renderCarriageVipResults();
 const ids=[...nodes.vipResults.innerHTML.matchAll(/data-vip="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(ids,['later','high','low','temp'],'restricted entries follow all eligible entries, preserving old count sorting inside groups');
 nodes.vipSearch.value='low';ctx.renderCarriageVipResults();assert(nodes.vipResults.innerHTML.includes('data-vip="low"'));assert(!nodes.vipResults.innerHTML.includes('data-vip="high"'));
 console.log('PASS: actual VIP renderer sorts restricted people last, preserves group tie-breakers, exclusions and search');
}
main().catch(e=>{console.error(e);process.exitCode=1});
