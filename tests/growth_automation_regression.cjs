const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',f),'utf8').replaceAll('--> statement-breakpoint',''));
let failBatch=false;
const db={prepare(query){let args=[];const s={bind(...v){args=v;return s},async first(){return sql.prepare(query).get(...args)||null},async all(){return{results:sql.prepare(query).all(...args)}},async run(){return{meta:sql.prepare(query).run(...args)}},execute(){sql.prepare(query).run(...args)}};return s},async batch(statements){sql.exec('BEGIN');try{for(let i=0;i<statements.length;i++){statements[i].execute();if(failBatch&&i===3)throw Error('injected D1 failure')}sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
const moduleAuto={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,'lib/growth-automation.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,moduleAuto,moduleAuto.exports);const auto=moduleAuto.exports;
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/lastasylum-50373046.json'),'utf8'));
const mappings=fixture.roster.map((r,i)=>({game_id:r.id,member_id:'synthetic_test_member_'+i,source_name:r.name,display_name:r.name,evidence:'synthetic test fixture'}));
for(const m of mappings){sql.prepare("INSERT OR IGNORE INTO growth_members VALUES(?,NULL,?,'test-only','2026-10-17')").run(m.member_id,m.display_name);sql.prepare("INSERT INTO growth_external_ids VALUES(?,?,?,'confirmed',?,NULL,1,1)").run(m.game_id,m.member_id,m.source_name,m.evidence)}
sql.prepare('INSERT INTO growth_auto_control VALUES(1,1,?,NULL,NULL,NULL,1)').run('2026-10-17');
const count=table=>sql.prepare('SELECT COUNT(*) n FROM '+table).get().n;
const digest=()=>JSON.stringify(sql.prepare('SELECT * FROM documents ORDER BY kind').all());
async function run(){
 const preserved=digest(),oldObs=count('growth_observations');
 assert.equal(auto.kstDate(Date.parse('2026-10-17T14:59:59Z')),'2026-10-17');assert.equal(auto.kstDate(Date.parse('2026-10-17T15:00:00Z')),'2026-10-18');
 assert.equal(auto.cutoffFor('2026-10-17'),Date.parse('2026-10-17T15:00:00Z'));
 const snap=(iso)=>({...structuredClone(fixture),asOf:Date.parse(iso)/1000});
 let a=snap('2026-10-17T13:00:00Z');a.roster=a.roster.slice(0,88);a.members=88;
 await auto.fixture(db,JSON.stringify(a),Date.parse('2026-10-17T13:01:00Z'));
 assert.equal(count('growth_hourly_observations'),88);assert.equal(count('growth_observations'),oldObs,'hourly ingest must not create daily history');
 await auto.fixture(db,JSON.stringify(a),Date.parse('2026-10-17T13:02:00Z'));assert.equal(count('growth_hourly_observations'),88);
 let b=snap('2026-10-17T14:00:00Z');b.roster[0].name='이름변경테스트';b.roster[0].rank=b.roster[0].rank===4?3:4;b.roster[0].power+=100;
 await auto.fixture(db,JSON.stringify(b),Date.parse('2026-10-17T14:01:00Z'));assert.equal(count('growth_hourly_observations'),177);
 assert.equal(sql.prepare('SELECT display_name FROM growth_members WHERE member_id=?').get(mappings.find(m=>m.game_id===b.roster[0].id).member_id).display_name,'이름변경테스트');
 assert(count('growth_auto_events')>=2);assert.equal(sql.prepare("SELECT COUNT(*) n FROM growth_auto_events WHERE kind='departure_candidate' AND status='pending'").get().n,0);
 const before=count('growth_auto_snapshots');let bad=snap('2026-10-17T14:20:00Z');bad.roster.pop();await auto.fixture(db,JSON.stringify(bad),Date.parse('2026-10-17T14:21:00Z'));assert.equal(count('growth_auto_snapshots'),before);
 bad=snap('2026-10-17T14:30:00Z');bad.roster[0].power*=10;await auto.fixture(db,JSON.stringify(bad),Date.parse('2026-10-17T14:31:00Z'));assert.equal(sql.prepare("SELECT status FROM growth_hourly_observations WHERE game_id=? ORDER BY source_as_of DESC LIMIT 1").get(b.roster[0].id).status,'review');
 const c=snap('2026-10-17T15:00:00Z');c.roster[0].power+=500;await auto.fixture(db,JSON.stringify(c),Date.parse('2026-10-17T15:00:01Z'));
 // A pre-midnight source received after midnight must not enter the prior day.
 const late=snap('2026-10-17T14:59:59Z');await auto.fixture(db,JSON.stringify(late),Date.parse('2026-10-17T15:01:00Z'));assert.equal(sql.prepare('SELECT status FROM growth_auto_runs ORDER BY called_at DESC LIMIT 1').get().status,'stale');
 failBatch=true;await assert.rejects(auto.closeDay(db,'2026-10-17',Date.parse('2026-10-17T15:10:00Z')));failBatch=false;
 assert.equal(count('growth_daily_closes'),0);assert.equal(count('growth_observations'),oldObs,'transaction rollback');
 const result=await auto.closeDay(db,'2026-10-17',Date.parse('2026-10-17T15:10:00Z'));assert.equal(result.members,89);
 const selected=sql.prepare('SELECT * FROM growth_daily_sources WHERE game_id=?').get(b.roster[0].id);assert.equal(selected.power,b.roster[0].power);assert(selected.source_as_of<Date.parse('2026-10-17T15:00:00Z'));assert(selected.received_at<Date.parse('2026-10-17T15:00:00Z'));
 assert.equal((await auto.closeDay(db,'2026-10-17',Date.parse('2026-10-17T15:11:00Z'))).duplicate,true);assert.equal(count('growth_observations'),oldObs+89);
 let fetches=0;const fetcher=async()=>{fetches++;throw Error('simulated outage')};
 await auto.collect({DB:db,GROWTH_AUTO_MODE:'fixture'},'test',Date.now(),fetcher);assert.equal(fetches,0);
 const clock=Date.now();await assert.rejects(auto.collect({DB:db,GROWTH_AUTO_MODE:'production'},'test',clock,fetcher));assert.equal(fetches,1);
 await auto.collect({DB:db,GROWTH_AUTO_MODE:'production'},'test',clock+1000,fetcher);assert.equal(fetches,1);
 const actualNow=Date.now;Date.now=()=>Date.parse('2026-10-17T15:10:00Z');
 await auto.scheduledAutomation({cron:auto.CLOSE_CRON,scheduledTime:Date.parse('2026-10-17T15:10:00Z')},{DB:db,GROWTH_AUTO_MODE:'production'});Date.now=actualNow;assert.equal(fetches,1,'close never fetches');
 assert.equal(digest(),preserved,'carriage VIP canyon memos preserved');assert.equal(count('growth_observations'),oldObs+89);
 // The second close has a real previous-day baseline; new IDs stay distinct.
 const next=snap('2026-10-18T14:00:00Z');next.roster[0].power=b.roster[0].power-100;
 next.roster.push({...next.roster[1],id:'900000000998',name:'별도신규테스트'});next.members=90;
 next.roster.push({...next.roster[2],id:'900000000999',name:next.roster[2].name});next.members=91;
 await auto.fixture(db,JSON.stringify(next),Date.parse('2026-10-18T14:01:00Z'));
 assert.equal(sql.prepare('SELECT status FROM growth_external_ids WHERE game_id=?').get('900000000999').status,'review','same nickname cannot merge IDs');
 await auto.closeDay(db,'2026-10-18',Date.parse('2026-10-18T15:10:00Z'));
 assert.equal(sql.prepare('SELECT delta FROM growth_daily_sources WHERE date=? AND game_id=?').get('2026-10-18',b.roster[0].id).delta,-100,'negative daily growth stays unadjusted');
 assert.equal(sql.prepare('SELECT delta FROM growth_daily_sources WHERE date=? AND game_id=?').get('2026-10-18','900000000998').delta,null,'new member has no invented previous-day power');
 const status=await auto.automaticStatus(db,true);assert(status.members.length===91);assert.equal(status.ai_calls,0);
 const code=fs.readFileSync(path.join(root,'lib/growth-automation.ts'),'utf8');assert(!/api\.openai|anthropic|gemini|CONNECTORS/.test(code));
 console.log(JSON.stringify({status:'PASS',checks:['Asia/Seoul midnight','88→89 complete roster','same JSON deduplication','hourly/daily separation','ID-preserving nickname','rank event','missing member candidate only','malformed incomplete response quarantined','abnormal power excluded','postmidnight excluded','atomic D1 failure rollback and retry','daily idempotence','Staging zero external calls','hourly failure no immediate retry','closing zero fetches','operational documents and old histories preserved','no AI calls'],daily:result}));
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>sql.close());
