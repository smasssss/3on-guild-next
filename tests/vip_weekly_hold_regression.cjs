/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-08: put last week's points back in force until Monday 11:00 KST; the uploaded week waits as pending.
const assert=require('node:assert/strict');
const f=require('./vip-fixture.cjs')(),{holdLastWeek}=require('../scripts/vip-weekly-hold.cjs');
const week=(appliesOn,points)=>({providedOn:'x',appliesOn,coverage:'partial',rows:[{memberId:'a',nickname:'A',points}],updatedAt:'t'});
const prev=week('2026-11-02',1),next=week('2026-11-09',2),quiet={now:Date.parse('2026-11-08T09:00:00Z'),log(){}};
f.sql.prepare("INSERT INTO documents VALUES('vip-weekly',2,?,'t','guild-war-import','m2')").run(JSON.stringify({current:next,pending:null}));
f.sql.prepare("INSERT INTO backups(mutation,kind,revision,payload,saved_at,actor) VALUES('m2','vip-weekly',1,?,'t','guild-war-import (user-approved 2026-11-08)')").run(JSON.stringify({current:null,pending:prev}));
(async()=>{
 assert.equal((await holdLastWeek(f.db,quiet)).status,'held');
 const row=f.sql.prepare("SELECT revision,payload FROM documents WHERE kind='vip-weekly'").get();
 assert.equal(row.revision,3);assert.deepEqual(JSON.parse(row.payload),{current:prev,pending:next});
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM backups WHERE kind='vip-weekly' AND revision=2").get().n,1,'state before the hold is backed up');
 const v=f.load('lib/vip-weekly.ts'),data=JSON.parse(row.payload);
 assert.equal(v.weeklyView(data,Date.parse('2026-11-09T01:59:59Z')).active.appliesOn,'2026-11-02','last week until Monday 10:59:59 KST');
 assert.equal(v.weeklyView(data,Date.parse('2026-11-09T02:00:00Z')).active.appliesOn,'2026-11-09','this week from Monday 11:00 KST');
 assert.equal((await holdLastWeek(f.db,quiet)).status,'duplicate','running twice changes nothing');
 console.log('PASS: last week stays in force until Monday 11:00 KST; uploaded week waits; backup kept; idempotent');
})().catch(e=>{console.error(e);process.exitCode=1;});
