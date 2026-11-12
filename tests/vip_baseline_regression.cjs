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
console.log('PASS: VIP baseline is validated, kept on every save and only ever added');
