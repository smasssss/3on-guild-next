/* eslint-disable @typescript-eslint/no-require-imports -- Existing SQLite fixture harness. */
// 2026-11-06: absence candidates follow the 3-collection roster rule. A member absent from 3 consecutive
// collections leaves the roster; its open "탈퇴 후보 · 미확정" entries are closed as departures and no new
// ones are added every hour. History stays; departed_at stays empty so a return still rejoins after 3 collections.
const assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./vip-fixture.cjs')(),auto=f.load('lib/growth-automation.ts');
const source=JSON.parse(fs.readFileSync('tests/fixtures/lastasylum-50373046.json','utf8'));
const gone=source.roster[5].id;
const pending=()=>f.sql.prepare("SELECT COUNT(*) n FROM growth_auto_events WHERE kind='departure_candidate' AND status='pending' AND game_id=?").get(gone).n;
const resolved=()=>f.sql.prepare("SELECT COUNT(*) n FROM growth_auto_events WHERE kind='departure_candidate' AND status='resolved' AND game_id=? AND json_extract(after_json,'$.decision')='roster_leave'").get(gone).n;
async function main(){
 let t=Date.parse('2026-11-06T00:00:00Z');
 const send=async(absent)=>{t+=3_600_000;const p={...structuredClone(source),asOf:Math.floor(t/1000)-60};if(absent){p.roster=p.roster.filter(r=>r.id!==gone);p.members=p.roster.length;}return auto.fixture(f.db,JSON.stringify(p),t);};
 for(let i=0;i<3;i++)assert.equal((await send(false)).status,'accepted');
 await send(true);await send(true);
 assert.equal(pending(),2,'absent twice: still on the roster, two open candidates');
 await send(true);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM growth_auto_events WHERE kind='roster_leave' AND game_id=?").get(gone).n,1,'third absence: roster leave recorded');
 assert.equal(pending(),0,'open candidates closed as departures');assert.equal(resolved(),3);
 await send(true);await send(true);
 assert.equal(pending(),0,'no new hourly candidates once off the roster');
 assert.equal(f.sql.prepare('SELECT departed_at FROM growth_external_ids WHERE game_id=?').get(gone).departed_at,null,'rejoin path unchanged');
 assert(f.sql.prepare('SELECT COUNT(*) n FROM growth_hourly_observations WHERE game_id=?').get(gone).n>=3,'history kept');
 console.log('PASS: absence candidates close after 3 consecutive missing collections and are not re-added hourly');
}
main().catch(e=>{console.error(e);process.exitCode=1});
