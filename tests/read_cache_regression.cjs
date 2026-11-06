/* eslint-disable @typescript-eslint/no-require-imports -- Existing SQLite fixture harness. */
// D1 read budget: status and growth views are reused until their data changes.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),auto=f.load('lib/growth-automation.ts'),legacy=f.load('app/api/growth/legacy/route.ts');
const source=JSON.parse(fs.readFileSync('tests/fixtures/lastasylum-50373046.json','utf8'));
async function main(){
 f.sql.prepare('INSERT INTO growth_auto_control VALUES(1,1,?,NULL,NULL,NULL,1)').run('2026-11-01');
 let t=Date.parse('2026-11-04T00:00:00Z');for(let h=0;h<4;h++){t+=3_600_000;await auto.fixture(f.db,JSON.stringify({...source,asOf:Math.floor(t/1000)-60}),t);}
 const seen=[];const prepare=f.db.prepare.bind(f.db);f.db.prepare=q=>{seen.push(q);return prepare(q);};
 const heavy=q=>/ROW_NUMBER\(\)|LEFT JOIN growth_daily_sources|WITH RECURSIVE/.test(q);
 const a=await auto.automaticStatus(f.db);const first=seen.filter(heavy).length;assert(first>0);seen.length=0;
 const b=await auto.automaticStatus(f.db);assert.equal(seen.filter(heavy).length,0,'unchanged data: status reused');assert.deepEqual(JSON.parse(JSON.stringify({...b,delayed:0})),JSON.parse(JSON.stringify({...a,delayed:0})));
 const g1=await (await legacy.GET(new Request('http://x/api/growth/legacy'))).json();seen.length=0;
 const g2=await (await legacy.GET(new Request('http://x/api/growth/legacy'))).json();assert.equal(seen.filter(heavy).length,0,'unchanged data: growth view reused');assert.deepEqual(g2,g1);
 // Any change in the inputs refreshes both.
 f.sql.prepare("UPDATE growth_members SET display_name='바뀐이름' WHERE member_id=(SELECT member_id FROM growth_external_ids LIMIT 1)").run();
 f.sql.prepare("UPDATE growth_meta SET value=CAST(value AS INTEGER)+1,updated_at='changed' WHERE key='identity_revision'").run();
 seen.length=0;await auto.automaticStatus(f.db);assert(seen.filter(heavy).length>0,'identity change refreshes status');
 seen.length=0;const g3=await (await legacy.GET(new Request('http://x/api/growth/legacy'))).json();assert(seen.filter(heavy).length>0,'identity change refreshes growth view');assert.equal(g3.identity_revision,g1.identity_revision+1);
 t+=3_600_000;await auto.fixture(f.db,JSON.stringify({...source,asOf:Math.floor(t/1000)-60}),t);
 seen.length=0;await auto.automaticStatus(f.db);assert(seen.filter(heavy).length>0,'a new collection refreshes status');
 f.db.prepare=prepare;
 const ui=fs.readFileSync('public/growth-auto.js','utf8');assert(ui.includes('window.frameElement.offsetParent===null'),'hidden growth screen does not poll');
 console.log('PASS: status and growth views reused while unchanged; identity change and new collection refresh them; hidden screen does not poll');
}
main().catch(e=>{console.error(e);process.exitCode=1});
