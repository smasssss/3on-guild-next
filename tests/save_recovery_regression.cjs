/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-08: a carriage save showed "저장을 완료하지 못했습니다" although D1 had committed it (the reply
// failed while D1 was busy). The server now reports a committed save as saved, and only that.
const assert=require('node:assert/strict');
const f=require('./vip-fixture.cjs')(),state=f.load('app/api/state/route.ts'),store=f.load('lib/store.ts');
const origin='http://localhost:8790',token='b'.repeat(64);
const post=body=>state.POST(new Request(origin+'/api/state',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}));
const doc=()=>f.sql.prepare("SELECT revision,payload,last_mutation FROM documents WHERE kind='carriage'").get();
const realBatch=f.db.batch.bind(f.db);
(async()=>{
 f.sql.prepare('INSERT INTO credentials VALUES(?,?,?,?,?)').run(await store.hash(token),'password-session-v1','admin',await store.hash(f.env.ADMIN_PASSWORD_HASH),Date.now()+86400000);
 const start=doc(),data=JSON.parse(start.payload);
 // Committed, then the reply fails: reported as saved.
 f.db.batch=async list=>{await realBatch(list);throw Error('D1 DB is overloaded');};
 let r=await post({kind:'carriage',revision:start.revision,mutation:'1'.repeat(32),data:{...data,pointer:1}});
 let body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.recovered,true);
 assert.equal(doc().revision,start.revision+1);assert.equal(JSON.parse(doc().payload).pointer,1);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM backups WHERE mutation=?").get('1'.repeat(32)).n,1,'backup kept');
 // Not committed: still an error, nothing changed.
 const before=doc();f.db.batch=async()=>{throw Error('D1 DB is overloaded');};
 r=await post({kind:'carriage',revision:before.revision,mutation:'2'.repeat(32),data:{...data,pointer:2}});
 body=await r.json();assert.equal(r.status,400);assert.match(body.error,/저장을 완료하지 못했습니다/);assert.deepEqual(doc(),before);
 f.db.batch=realBatch;
 console.log('PASS: a save D1 committed is reported as saved even if the reply failed; an uncommitted one stays an error');
})().catch(e=>{console.error(e);process.exitCode=1;});
