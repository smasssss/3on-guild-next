const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const ts=require('typescript'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const dbPath=process.env.TEST_DB_PATH||path.join(root,'growth-test.sqlite');
if(fs.existsSync(dbPath))fs.unlinkSync(dbPath);
const sqlite=new DatabaseSync(dbPath);
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8').replaceAll('--> statement-breakpoint',''));
const adapter={prepare(sql){let values=[];const stmt={bind(...args){values=args;return stmt},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},execute(){sqlite.prepare(sql).run(...values)}};return stmt},async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)s.execute();sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const store={db:()=>adapter,hash:async x=>crypto.createHash('sha256').update(x).digest('hex'),actor:async()=> 'regression-admin',validOrigin:()=>true,response:(req,data,status=200)=>Response.json(data,{status})};
const modules={};
function load(file){const filename=path.resolve(root,file);if(modules[filename])return modules[filename].exports;const module={exports:{}};modules[filename]=module;const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const requireMock=name=>name.endsWith('/store')||name==='./store'?store:load(path.relative(root,path.resolve(path.dirname(filename),name))+'.ts');new Function('require','module','exports',compiled)(requireMock,module,module.exports);return module.exports;}
const growth=load('lib/growth.ts'),upload=load('app/api/growth/upload/route.ts'),review=load('app/api/growth/review/route.ts'),publish=load('app/api/growth/publish/route.ts'),withdraw=load('app/api/growth/withdraw/route.ts'),legacy=load('app/api/growth/legacy/route.ts');
const mutation=()=>crypto.randomUUID();
async function call(route,body,status=200){const req=new Request('https://regression.invalid/api/growth',{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});const res=await route[body?'POST':'GET'](req);const data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;}
function state(){return sqlite.prepare('SELECT key,value FROM growth_meta ORDER BY key').all()}
async function run(){
 const packagePath=process.env.PACKAGE_PATH||path.join(root,'../3ON_growth_2026-10-09.json');
 const seed=JSON.parse(fs.readFileSync(path.join(root,'legacy/growth_2026-10-08.json'),'utf8'));
 const pkg=fs.existsSync(packagePath)?JSON.parse(fs.readFileSync(packagePath,'utf8')):{schema:'3on-growth-package-v1',observed_date:'2026-10-09',slot:'day',expected_member_count:87,source_hashes:[crypto.createHash('sha256').update('explicit-local-regression-fixture').digest('hex')],rows:seed.members.map(m=>({raw_name:m.displayName||m.name,normalized_candidate:m.displayName||m.name,power:m.name==='lucky~'?51263986:m.name==='lucky--'?3823636:m.power,level:m.level,rank:m.rank}))};
 const baselineCount=sqlite.prepare('SELECT COUNT(*) n FROM growth_observations').get().n;
 let result=await call(upload,pkg,201),batch=result.batch;
 assert.equal(batch.state,'ready');assert.equal(result.review_count,0);
 let rr=sqlite.prepare('SELECT * FROM growth_batch_rows WHERE batch_id=?').all(batch.batch_id);
 assert.equal(rr.filter(r=>r.resolution_status==='new').length,0);
 for(const name of ['lucky~','lucky--']){const r=rr.find(r=>r.raw_name===name);const member=sqlite.prepare('SELECT * FROM growth_members WHERE member_id=?').get(r.resolved_member_id);assert.equal(member.legacy_canonical,name);}
 const luck=rr.find(r=>r.raw_name==='lucky~');
 await call(review,{batch_id:batch.batch_id,draft_revision:1,mutation:mutation(),row_id:luck.row_id,action:'direct_new',display_name:'lucky~',power:luck.power,level:luck.level,rank:luck.rank},409);
 let meta=await growth.meta();
 await call(publish,{batch_id:batch.batch_id,growth_revision:meta.growthRevision,identity_revision:meta.identityRevision,draft_revision:1,mutation:mutation()});
 let current=await growth.currentMembers();assert.equal(current.members.length,87);assert.equal(current.observed_date,'2026-10-09');
 let payload=await call(legacy);assert.equal(payload.data.guildCount,87);assert.equal(payload.data.date,'2026-10-09');
 for(const member of payload.data.members){const baseline=seed.members.find(m=>m.name===member.name);assert(baseline);assert.equal(member.prevLevel,baseline.level,member.name);assert.equal(member.prevRank,baseline.rank,member.name);}
 const history=payload.data.members.find(m=>m.name==='lucky~').history;assert.equal(history.at(-1).power,51263986);assert(history.length>1);
 let cancelled=await call(withdraw,{batch_id:batch.batch_id,growth_revision:current.revision,identity_revision:current.identity_revision,mutation:mutation()});
 current=await growth.currentMembers();assert.equal(current.members.length,87);assert.equal(current.observed_date,'2026-10-08');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM growth_observations').get().n,baselineCount+87);
 result=await call(upload,pkg,201);assert.notEqual(result.batch.batch_id,batch.batch_id);assert.equal(result.batch.state,'ready');batch=result.batch;
 current=await growth.currentMembers();await call(withdraw,{batch_id:batch.batch_id,growth_revision:current.revision,identity_revision:current.identity_revision,draft_revision:1,mutation:mutation()});
 assert.equal((await growth.currentMembers()).revision,current.revision);
 result=await call(upload,pkg,201);assert.equal(result.batch.state,'ready');batch=result.batch;
 current=await growth.currentMembers();await call(publish,{batch_id:batch.batch_id,growth_revision:current.revision,identity_revision:current.identity_revision,draft_revision:1,mutation:mutation()});
 payload=await call(legacy);assert.equal(payload.data.guildCount,87);assert.equal(payload.data.members.find(m=>m.name==='lucky~').history.length,history.length);
 const ui=fs.readFileSync(path.join(root,'public/legacy.html'),'utf8');const frame=Buffer.from(ui.match(/id="growthPayload">([\s\S]*?)<\/script>/)[1],'base64').toString();
 assert(frame.includes("sessionStorage.getItem('3on_growth_iframe_data')"));assert(!frame.includes('3on_growth_iframe_data_staging'));assert(frame.includes('displayDate(previousDate)'));
 const react=fs.readFileSync(path.join(root,'app/growth-admin/page.tsx'),'utf8');assert(react.includes('/api/growth/withdraw'));assert(react.includes('반영 취소'));assert(react.includes('자료 취소'));assert(react.includes("['needs_review','ready'].includes(review.batch.state)"));
 console.log(JSON.stringify({status:'PASS',checks:['87 existing members auto-connect','lucky punctuation remains distinct','duplicate new member blocked','publish preserves complete legacy histories','published withdrawal restores 8 October','withdrawal preserves stored observations','same JSON can be reuploaded after withdrawal','draft cancellation does not change public revision','same JSON can be reuploaded after draft cancellation','repeated publication does not duplicate active history','Production iframe storage key matches outer document','cancel controls and read-only published editor'],baselineObservations:baselineCount,batch_id:batch.batch_id,dbPath}));
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>sqlite.close());
