/* eslint-disable @typescript-eslint/no-require-imports -- Existing SQLite fixture harness. */
// D1 free tier allows 5,000,000 rows read per day; the site polls every 5 minutes.
// Guards: repeated roster reads use the cache, and every roster query uses an index.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),auto=f.load('lib/growth-automation.ts'),roster=f.load('lib/growth-roster.ts');
const source=JSON.parse(fs.readFileSync('tests/fixtures/lastasylum-50373046.json','utf8'));
async function main(){
 let t=Date.parse('2026-11-04T00:00:00Z');
 for(let h=0;h<30;h++){t+=3_600_000;const p={...structuredClone(source),asOf:Math.floor(t/1000)-60};p.roster.forEach((r,i)=>r.power+=h*10+i);await auto.fixture(f.db,JSON.stringify(p),t);}
 const seen=[];const prepare=f.db.prepare.bind(f.db);f.db.prepare=q=>{seen.push(q);return prepare(q);};
 const scan=/SELECT snapshot_id,game_id FROM growth_hourly_observations WHERE snapshot_id IN/;
 const first=await roster.completeRoster(f.db);assert.equal(first.members.length,source.roster.length);
 assert(!seen.some(q=>scan.test(q)),'reads after a collection reuse the presence it already computed');seen.length=0;
 for(let i=0;i<5;i++)await roster.completeRoster(f.db);
 assert(!seen.some(q=>scan.test(q)),'five page polls with no new collection never rescan the window');
 assert(seen.length<=15,'at most 3 small queries per poll');seen.length=0;
 f.sql.prepare("INSERT INTO growth_auto_runs(run_id,trigger_kind,called_at,status) VALUES('new-hour','cron',?,'invalid')").run(t+3_600_000);
 await roster.completeRoster(f.db);assert.equal(seen.filter(q=>scan.test(q)).length,1,'a new collection run refreshes presence once');seen.length=0;
 await roster.completeRoster(f.db);assert(!seen.some(q=>scan.test(q)));
 f.db.prepare=prepare;
 // Index use: no full scan of the hourly observations or the runs table.
 const plan=q=>f.sql.prepare('EXPLAIN QUERY PLAN '+q).all().map(r=>r.detail).join(' | ');
 const ids=JSON.stringify(f.sql.prepare('SELECT snapshot_id FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 12').all().map(r=>r.snapshot_id));
 for(const [q,args] of [
  ['SELECT snapshot_id,game_id FROM growth_hourly_observations WHERE snapshot_id IN(SELECT value FROM json_each(?))',[ids]],
  ["SELECT run_id,snapshot_id,called_at FROM growth_auto_runs WHERE called_at>=? AND status='duplicate' AND snapshot_id IN(SELECT value FROM json_each(?))",[0,ids]],
  ["SELECT o.game_id FROM json_each(?) j JOIN growth_hourly_observations o ON o.snapshot_id=json_extract(j.value,'$[0]') AND o.game_id=json_extract(j.value,'$[1]')",['[]']],
 ]){const p=plan(q,args);assert(!/SCAN (o|growth_hourly_observations|growth_auto_runs)\b(?! USING)/.test(p),q+' → '+p);}
 console.log('PASS: roster reads use the presence cache on repeat and indexed lookups only (D1 read budget)');
}
main().catch(e=>{console.error(e);process.exitCode=1});
