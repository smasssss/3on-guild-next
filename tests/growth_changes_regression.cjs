const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8').replaceAll('--> statement-breakpoint',''));
const adapter={prepare(sql){let args=[];return {bind(...a){args=a;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}}}}};
function load(file){const module={exports:{}};const compiled=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',compiled)(name=>name.endsWith('/store')?{db:()=>adapter,response:(req,data,status=200)=>Response.json(data,{status})}:name.endsWith('/growth')?{GROWTH_API:'test',GROWTH_SCHEMA:'test',meta:async()=>({growthRevision:10,identityRevision:6})}:name.endsWith('/growth-changes')?load('lib/growth-changes.ts'):null,module,module.exports);return module.exports;}
const legacy=load('app/api/growth/legacy/route.ts');
const id=name=>sqlite.prepare('SELECT member_id FROM growth_members WHERE legacy_canonical=?').get(name).member_id;
const seed=sqlite.prepare("SELECT batch_id FROM growth_batches WHERE state='published'").get().batch_id;
const exec=(sql,...args)=>sqlite.prepare(sql).run(...args);
for(let day=9;day<=13;day++){
 const batch='fixture-'+day,date='2026-10-'+String(day).padStart(2,'0');
 exec("INSERT INTO growth_batches SELECT ?,?,?,NULL,?,'day',87,'[]',?,6,1,1,'{}',?,? ,?,?",batch,batch,batch,date,day===13?'published':'superseded',day===9?seed:'fixture-'+(day-1),date,date,day);
 exec('INSERT INTO growth_membership_snapshots SELECT ?,member_id,membership_state,row_order FROM growth_membership_snapshots WHERE batch_id=?',batch,day===9?seed:'fixture-'+(day-1));
 for(const [name,rank,level] of [['1위',day===13?'R4':'R3',27],['백구김구',day===13?'R3':'R4',27],['제시맘','R3',28]]){
  const mid=id(name);exec("INSERT INTO growth_observations(observation_id,member_id,batch_id,observed_date,slot,power,level,rank,label,source_type,original_order,status,created_at) VALUES(?,?,?,?,'day',1000000,?,?,?,'package',?,'active',?)",batch+mid,mid,batch,date,level,rank,date,day*1000,date);
 }
 if(day===11||day===12){exec("INSERT INTO growth_batch_rows(row_id,batch_id,row_index,raw_name,resolution_status,resolved_member_id,proposed_display_name,confirm_alias,membership_state) VALUES(?,?,0,?,'resolved',?,?,1,'observed')",'rename-'+day,batch,day===11?'홍시':'제시맘',id('제시맘'),day===11?'홍시':'제시맘');}
 const departures=day===11?['볼트트','야생야옹씨']:day===12?['여우여우']:day===13?['용퍕이','별땜임']:[];
 if(departures.length){const result={batch_id:batch,observed_date:date,departed:departures.map(n=>({member_id:id(n),display_name:sqlite.prepare('SELECT display_name FROM growth_members WHERE member_id=?').get(id(n)).display_name,after:'missing'}))};exec("INSERT INTO growth_mutations VALUES(?,'membership_correction',?,?)",'depart-'+day,JSON.stringify(result),date);for(const n of departures)exec("UPDATE growth_membership_snapshots SET membership_state='missing' WHERE batch_id=? AND member_id=?",batch,id(n));}
}
exec("INSERT INTO growth_members VALUES('new-archived',NULL,'신규후탈퇴','test','2026-10-10')");
exec("INSERT INTO growth_observations(observation_id,member_id,batch_id,observed_date,slot,power,level,rank,label,source_type,original_order,status,created_at) VALUES('new-observation','new-archived','fixture-10','2026-10-10','day',123,18,'R1','10/10','package',10000,'active','test')");
exec("INSERT INTO growth_membership_snapshots VALUES('fixture-13','new-archived','missing',1000)");
async function get(){const res=await legacy.GET(new Request('https://test.invalid'));assert.equal(res.status,200);return (await res.json()).data;}
async function run(){
 const before=JSON.stringify(sqlite.prepare('SELECT * FROM growth_observations ORDER BY observation_id').all());
 let data=await get();assert.equal(data.changeHistory.filter(e=>e.kind==='departure').length,5);
 assert(!data.changeHistory.some(e=>e.kind==='rejoin'),'A screenshot alone cannot confirm a returning identity');
 const returning=id('공 주');
 exec("UPDATE growth_membership_snapshots SET membership_state='observed' WHERE batch_id='fixture-13' AND member_id=?",returning);
 exec("INSERT INTO growth_mutations VALUES('confirmed-return','membership_correction',?,'2026-10-13')",JSON.stringify({batch_id:'fixture-13',observed_date:'2026-10-13',returned:[{member_id:returning,display_name:'공 주',before:'missing',after:'observed'}]}));
 data=await get();assert.equal(data.changeHistory.filter(e=>e.kind==='rejoin'&&e.member_id===returning).length,1);
 assert(data.missing.filter(m=>m.confirmedDeparture).every(m=>m.status.includes('탈퇴 확인')));
 assert(data.changeHistory.some(e=>e.kind==='nickname'&&e.date==='2026-10-11'&&e.from==='제시맘'&&e.to==='홍시'));
 assert(data.changeHistory.some(e=>e.kind==='nickname'&&e.date==='2026-10-12'&&e.from==='홍시'&&e.to==='제시맘'));
 assert(data.nicknameChanges.some(e=>e.to==='홍시'));
 assert(data.archivedMembers.some(m=>m.member_id==='new-archived'));
 assert(data.changeHistory.some(e=>e.kind==='new'&&e.displayName==='신규후탈퇴'));
 assert(data.changeHistory.some(e=>e.kind==='rank'&&e.date==='2026-10-13'&&e.displayName==='1위'&&e.from==='R3'&&e.to==='R4'));
 assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM growth_observations ORDER BY observation_id').all()),before,'API remains read-only');
 const html=fs.readFileSync(path.join(root,'public/legacy.html'),'utf8'),frame=Buffer.from(html.match(/id="growthPayload">([\s\S]*?)<\/script>/)[1],'base64').toString();
 const code=frame.slice(frame.indexOf('function renderChangeHistory(){'),frame.indexOf('\nfunction renderFilters()'));
 const elements=new Map(),el=k=>{if(!elements.has(k))elements.set(k,{innerHTML:''});return elements.get(k)};
 const sandbox={DATA:data,$:el,esc:x=>String(x).replaceAll('<','&lt;').replaceAll('>','&gt;'),todayDelta:()=>null,levelChange:()=>0,card:()=>''};vm.createContext(sandbox);vm.runInContext(code+';renderChanges()',sandbox);
 assert(el('#changeHistory').innerHTML.includes('2026-10-13'));
 assert(el('#changeHistory').innerHTML.includes('용퍕이'));
 assert(el('#changeHistory').innerHTML.includes('재가입 확인'));
 assert(el('#changeHistory').innerHTML.includes('공 주'));
 assert(el('#changeSummary').innerHTML.includes('탈퇴 확인'));
 assert(el('#changeHistory').innerHTML.indexOf('2026-10-13')<el('#changeHistory').innerHTML.indexOf('2026-10-11'));
 // Withdrawing the newest publication must hide its departure and rank events.
 exec("UPDATE growth_batches SET state='withdrawn' WHERE batch_id='fixture-13'");exec("UPDATE growth_batches SET state='published' WHERE batch_id='fixture-12'");
 data=await get();assert(!data.changeHistory.some(e=>e.date==='2026-10-13'));assert.equal(data.missing.filter(m=>m.confirmedDeparture).length,3);
 console.log('Approved-lineage departure/nickname/rank/new history, archived new members, dated UI, withdrawal and read-only API: PASS');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>sqlite.close());
