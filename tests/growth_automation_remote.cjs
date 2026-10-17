// Real Staging D1 integration via the already-authorized Cloudflare management
// API. This does not submit or bypass the website's blocked login endpoint.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,key=process.env.CLOUDFLARE_API_TOKEN,database=process.env.STAGING_D1_ID;
assert(account&&key&&database&&process.env.STAGING_RUNTIME_FIXTURE,'Existing Staging management credentials required');
const runtime=JSON.parse(fs.readFileSync(process.env.STAGING_RUNTIME_FIXTURE,'utf8'));
assert.equal(runtime.worker,'3on-guild-staging');
async function query(body){const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await res.json();if(!res.ok||!value.success)throw Error('D1 management query failed: '+JSON.stringify(value.errors));return value.result;}
let injectFailure=false;
const db={prepare(sql){let params=[];const s={sql,get params(){return params},bind(...p){params=p;return s},async all(){return {results:(await query({sql,params}))[0].results}},async first(){return (await s.all()).results[0]||null},async run(){return(await query({sql,params}))[0]}};return s},async batch(statements){const batch=statements.map(s=>({sql:s.sql,params:s.params}));if(injectFailure)batch.push({sql:'INSERT INTO growth_tx_guards(guard_id,ok,created_at) VALUES(?,NULL,?)',params:['injected-remote-failure','test']});return query({batch})}};
const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('lib/growth-automation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,mod,mod.exports);const auto=mod.exports;
const ms=s=>Date.parse(s),count=async t=>(await db.prepare('SELECT COUNT(*) n FROM '+t).first()).n;
(async()=>{
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM growth_external_ids').first()).n,0,'Staging integration requires a clean mapping baseline');
 await db.batch([db.prepare(`INSERT INTO growth_external_ids SELECT json_extract(value,'$.game_id'),json_extract(value,'$.member_id'),json_extract(value,'$.source_name'),'confirmed','synthetic Staging test',NULL,1,1 FROM json_each(?)`).bind(JSON.stringify(runtime.links)),db.prepare('UPDATE growth_auto_control SET enabled=1 WHERE id=1')]);
 const baseline=await count('growth_observations'),checks=[];
 let data=structuredClone(runtime.data);data.asOf=ms('2026-10-18T14:00:00Z')/1000;data.roster=data.roster.slice(0,88);data.members=88;
 await auto.fixture(db,JSON.stringify(data),ms('2026-10-18T14:01:00Z'));assert.equal(await count('growth_hourly_observations'),88);
 const duplicate=await auto.fixture(db,JSON.stringify(data),ms('2026-10-18T14:02:00Z'));assert.equal(duplicate.status,'duplicate');assert.equal(await count('growth_hourly_observations'),88);checks.push('real D1 duplicate prevention');
 data=structuredClone(runtime.data);data.asOf=ms('2026-10-18T14:50:00Z')/1000;data.roster[0].name='STAGING_닉변시험';data.roster[0].rank=3;
 await auto.fixture(db,JSON.stringify(data),ms('2026-10-18T14:51:00Z'));assert.equal(await count('growth_hourly_observations'),177);assert.equal(await count('growth_observations'),baseline);
 assert((await db.prepare("SELECT COUNT(*) n FROM growth_auto_events WHERE kind='nickname'").first()).n>0);assert((await db.prepare("SELECT COUNT(*) n FROM growth_auto_events WHERE kind='rank'").first()).n>0);checks.push('88 to 89 roster, nickname/rank, hourly/daily separation');
 const names=(await auto.automaticStatus(db)).nickname_changes;
 assert.equal(names.filter(n=>n.game_id===data.roster[0].id).length,1);
 assert.equal(names.find(n=>n.game_id===data.roster[0].id).current_name,'STAGING_닉변시험');
 assert.equal(names.find(n=>n.game_id===data.roster[0].id).previous_name,runtime.data.roster[0].name);
 checks.push('real D1 current and immediately previous nickname summary');
 const expected=data.roster[0].power;data.asOf=ms('2026-10-18T15:00:00Z')/1000;data.roster[0].power+=1234;await auto.fixture(db,JSON.stringify(data),ms('2026-10-18T15:00:01Z'));
 injectFailure=true;await assert.rejects(auto.closeDay(db,'2026-10-18',ms('2026-10-18T15:10:00Z')));injectFailure=false;assert.equal(await count('growth_daily_closes'),0);assert.equal(await count('growth_observations'),baseline);checks.push('real D1 rollback after injected final-statement failure');
 const result=await auto.closeDay(db,'2026-10-18',ms('2026-10-18T15:10:00Z'));assert.equal(result.members,89);
 const selected=await db.prepare('SELECT * FROM growth_daily_sources WHERE game_id=?').bind(data.roster[0].id).first();assert.equal(selected.power,expected);assert(selected.source_as_of<ms('2026-10-18T15:00:00Z'));assert(selected.received_at<ms('2026-10-18T15:00:00Z'));
 assert((await auto.closeDay(db,'2026-10-18',ms('2026-10-18T15:11:00Z'))).duplicate);assert.equal(await count('growth_observations'),baseline+89);checks.push('KST midnight exclusion, 00:10 close and idempotent replay');
 const status=await auto.automaticStatus(db);assert.equal(status.external_calls,0);assert.equal(status.ai_calls,0);assert.equal((await auto.collect({DB:db,GROWTH_AUTO_MODE:'fixture'})).status,'fixture_only');checks.push('no external or AI calls during Staging collection and close');
 fs.writeFileSync('automation-evidence/staging/staging-tests.json',JSON.stringify({status:'PASS',real_d1:true,management_api:true,website_login:'CI blocked by Cloudflare 1010; browser verification required',external_calls:0,checks,first_member_id:selected.member_id,expected_power:expected},null,2));
 console.log(JSON.stringify({status:'REAL_STAGING_D1_PASS',checks,external_calls:0}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
