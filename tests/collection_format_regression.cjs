/* eslint-disable @typescript-eslint/no-require-imports -- Existing SQLite fixture harness. */
// Source format changes seen 2026-11-05/06: joined=-1 (unknown) and a missing rank must not reject the roster.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),auto=f.load('lib/growth-automation.ts');
const source=JSON.parse(fs.readFileSync('tests/fixtures/lastasylum-50373046.json','utf8'));
async function main(){
 let t=Date.parse('2026-11-06T00:00:00Z');const send=async(mut)=>{t+=3_600_000;const p={...structuredClone(source),asOf:Math.floor(t/1000)-60};mut(p.roster);return auto.fixture(f.db,JSON.stringify(p),t);};
 assert.equal((await send(()=>{})).status,'accepted');
 let r=await send(roster=>{roster[0].joined=-1;roster[1].joined=-1;});assert.equal(r.status,'accepted','joined=-1 is an unknown join time');
 assert.equal(f.sql.prepare('SELECT joined_at FROM growth_hourly_observations WHERE snapshot_id=? AND game_id=?').get(r.snapshot_id,source.roster[0].id).joined_at,null);
 r=await send(roster=>{delete roster[2].rank;roster[3].rank=null;});assert.equal(r.status,'partial','missing rank: roster accepted, that player held for review');assert.equal(r.review,2);
 const row=f.sql.prepare('SELECT status,reason,rank FROM growth_hourly_observations WHERE snapshot_id=? AND game_id=?').get(r.snapshot_id,source.roster[2].id);
 assert.deepEqual([row.status,row.reason,row.rank],['review','등급 누락 · 원본 검토 필요','R'+source.roster[2].rank],'previous rank kept for display');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM growth_hourly_observations WHERE snapshot_id=?').get(r.snapshot_id).n,source.roster.length,'every member still stored');
 for(const [mut,err] of [[x=>{x[0].rank=9;},'INVALID_PLAYER'],[x=>{x[0].joined=-5;},'INVALID_JOINED'],[x=>{x[0].joined=Date.parse('2027-01-01');},'INVALID_JOINED'],[x=>{x[0].power='x';},'INVALID_PLAYER']]){
  assert.equal((await send(mut)).status,'invalid');assert.equal(f.sql.prepare('SELECT error FROM growth_auto_runs ORDER BY called_at DESC LIMIT 1').get().error,err);
 }
 console.log('PASS: joined=-1 treated as unknown; missing rank holds only that player for review; other player checks still reject');
}
main().catch(e=>{console.error(e);process.exitCode=1});
