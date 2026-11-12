/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-12 VIP baseline (user decision): the carriage document accepts vipBaseline {memberId: date};
// a screen save can add entries but never removes or moves a stored one.
const assert=require('node:assert/strict');
const f=require('./vip-fixture.cjs')(),v=f.load('lib/validate.ts'),w=f.load('lib/vip-weekly.ts');
const doc=extra=>({pointer:0,records:[],...extra});
const ok=d=>{v.validate('carriage',d);return true;};
assert.ok(ok(doc({vipBaseline:{'game_1':'2026-11-12'}})));
for(const bad of [{vipBaseline:[]},{vipBaseline:{a:'2026-13-01'}},{vipBaseline:{a:20261112}},{vipBaseline:{'':'2026-11-12'}}])assert.throws(()=>v.validate('carriage',doc(bad)),undefined,JSON.stringify(bad));
const next=doc({vipBaseline:{b:'2026-11-16',a:'2026-11-20'}});w.protectExclusions(doc({vipBaseline:{a:'2026-11-12'}}),next);
assert.equal(JSON.stringify(next.vipBaseline),JSON.stringify({b:'2026-11-16',a:'2026-11-12'}),'stored baseline kept, new one added');
const dropped=doc({});w.protectExclusions(doc({vipBaseline:{a:'2026-11-12'}}),dropped);assert.equal(dropped.vipBaseline.a,'2026-11-12','an older screen that omits the field cannot erase it');
(async()=>{
 // The VIP list reports each member's join day (first registration, KST) so a new member starts the queue from that day.
 f.seedMember('alice','Alice');f.addSnapshot('new');f.observe('new','alice','Alice');
 const route=f.load('app/api/carriage/vip/route.ts'),body=await (await route.GET(new Request('http://localhost:8790/api/carriage/vip'))).json();
 assert.ok(body.members.length>0,JSON.stringify(body).slice(0,200));
 for(const m of body.members)assert.ok(m.joinedOn===null||/^\d{4}-\d{2}-\d{2}$/.test(m.joinedOn),m.memberId);
 assert.ok(body.members.some(m=>m.joinedOn),'join days are reported');
 console.log('PASS: VIP baseline is validated, kept on every save and only ever added; the VIP list reports join days');
})().catch(e=>{console.error(e);process.exitCode=1;});
