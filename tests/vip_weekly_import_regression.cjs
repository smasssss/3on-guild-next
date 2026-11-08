/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-08: screenshot points are imported by game ID with the site's own weekly rules.
// Check mode writes nothing; apply mode keeps the backup and revision guard; unknown game IDs stop it.
const assert=require('node:assert/strict');
const f=require('./vip-fixture.cjs')(),{importWeekly}=require('../scripts/vip-weekly-import.cjs');
f.seedMember('alice','Al⃢ice');f.seedMember('bob','Bob');f.seedMember('carol','Carol');f.addSnapshot('new');for(const m of ['alice','bob','carol'])f.observe('new',m,m==='alice'?'Al⃢ice':m[0].toUpperCase()+m.slice(1));
const now=Date.parse('2026-11-08T05:00:00Z'),quiet={now,log(){}};
const rev=()=>f.sql.prepare("SELECT revision FROM documents WHERE kind='vip-weekly'").get()?.revision??null;
const base={providedOn:'2026-11-08',appliesOn:'2026-11-09',rows:[{gameId:'game-alice',points:60000000,name:'Alice'},{gameId:'game-bob',points:1000,name:'Bob'}]};
(async()=>{
 const before=rev();
 assert.equal((await importWeekly(f.db,{...base,apply:false},quiet)).status,'checked');assert.equal(rev(),before,'check mode writes nothing');
 await assert.rejects(importWeekly(f.db,{...base,rows:[...base.rows,{gameId:'game-nobody',points:5,name:'Nobody'}],apply:true},quiet),/찾지 못했습니다/);assert.equal(rev(),before);
 assert.equal((await importWeekly(f.db,{...base,apply:true},quiet)).status,'saved');
 const saved=JSON.parse(f.sql.prepare("SELECT payload FROM documents WHERE kind='vip-weekly'").get().payload);
 const week=saved.current||saved.pending;
 assert.deepEqual(week.rows.map(r=>[r.memberId,r.nickname,r.points]),[['alice','Al⃢ice',60000000],['bob','Bob',1000]],'exact database nicknames, carol left unscored (partial)');
 assert.equal(week.coverage,'partial');assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM backups WHERE kind='vip-weekly'").get().n,1,'previous version backed up');
 assert.equal((await importWeekly(f.db,{...base,apply:true},quiet)).status,'duplicate','same data twice is not saved again');
 console.log('PASS: weekly import checks first, saves with backup by game ID, and refuses unknown players');
})().catch(e=>{console.error(e);process.exitCode=1;});
