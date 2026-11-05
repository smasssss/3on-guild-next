/* eslint-disable @typescript-eslint/no-require-imports -- Existing VM harness style. */
// VIP queue (2026-11-05): eligibility from the server, order from carriage history.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function picker(members,records,points,carry={}){
 const nodes={vipSearch:{value:''},vipResults:{innerHTML:''}};
 const ctx={console,Date,Number,Set,Map,JSON,Promise,crypto,VERIFIED_IDENTITIES:{},aliases:{},window:{addEventListener(){}},document:{getElementById:id=>nodes[id],querySelectorAll:()=>[]},GROWTH:{members:[],archivedMembers:[]},state:{vipExcludedMembers:{},records},vipRecordCanonical:r=>r.vipCanonical,labelOfMember:m=>m.displayName||m.name,vipTotalCount:n=>(carry[n]||0)+records.filter(r=>r.vipCanonical===n).length,carryConflict:()=>false,escapeLabel:s=>String(s),fmt:n=>Number(n).toLocaleString('ko-KR'),memberByCanonical(){},memberByLabel(){}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/carriage-vip.js','utf8'),ctx);
 ctx.view={week:'2026-11-02',roster:{sourceAsOf:1},active:{appliesOn:'2026-11-02',rows:Object.entries(points).map(([memberId,p])=>({memberId,points:p}))},members:members.map(([id,ok,reason])=>({memberId:id,canonical:id,nickname:id,current:true,eligibility:{eligible:ok,reason:reason||'eligible'}}))};
 vm.runInContext('carriageVip.view=view',ctx);ctx.renderCarriageVipResults();
 const html=nodes.vipResults.innerHTML;return {ids:[...html.matchAll(/data-vip="([^"]+)"/g)].map(m=>m[1]),html};
}
const ride=(who,date)=>({id:who+date,date,vipCanonical:who});
const E=55000000;
// 0 VIPs first, by points then memberId; then oldest last VIP; count-only history (no date) counts as oldest.
let r=picker([['zero-low',true],['zero-high',true],['zero-tie-b',true],['zero-tie-a',true],['old',true],['recent',true],['carry',true]],[ride('old','2026-10-01'),ride('recent','2026-11-04')],{'zero-low':E,'zero-high':E+9,'zero-tie-a':E+1,'zero-tie-b':E+1,old:E,recent:E,carry:E},{carry:2});
assert.deepEqual(r.ids,['zero-high','zero-tie-a','zero-tie-b','zero-low','carry','old','recent']);
assert(r.html.indexOf('오늘 추천')<r.html.indexOf('data-vip="zero-high"')&&r.html.split('오늘 추천').length===2,'only the first eligible is the recommendation');
// Same last date: fewer VIPs first; then points; then memberId.
r=picker([['three',true],['one',true]],[ride('one','2026-11-01'),ride('three','2026-10-01'),ride('three','2026-10-15'),ride('three','2026-11-01')],{one:E,three:E});
assert.deepEqual(r.ids,['one','three']);
// First VIP: the 0-count leader is confirmed today and moves behind everyone with an older last VIP.
const recs=[ride('a','2026-10-20'),ride('b','2026-10-25')];
r=picker([['new',true],['a',true],['b',true]],recs,{new:E,a:E,b:E});assert.deepEqual(r.ids,['new','a','b']);
r=picker([['new',true],['a',true],['b',true]],[...recs,ride('new','2026-11-05')],{new:E,a:E,b:E});assert.deepEqual(r.ids,['a','b','new'],'next day the previous VIP is last in the queue');
// Below the threshold this week: excluded, but count and last VIP are kept and shown.
r=picker([['low',false,'score_low'],['ok',true]],[ride('low','2026-10-01'),ride('low','2026-10-02')],{low:E-1,ok:E});
assert.deepEqual(r.ids,['ok','low']);assert(r.html.includes('누적 2회')&&r.html.includes('점수 미달'));
// Returning member: history keyed by the same identity (memberId/canonical) is linked again.
r=picker([['back',true],['fresh',true]],[ride('back','2026-09-01'),ride('back','2026-09-20')],{back:E,fresh:E});
assert(r.html.includes('누적 2회'));assert.deepEqual(r.ids,['fresh','back'],'a brand-new member with enough points goes first');
// Fixed drivers and permanent exclusions are listed last with their reason, never recommended.
r=picker([['rot',false,'rotation'],['perm',false,'permanent'],['ok',true]],[],{rot:E*2,perm:E*2,ok:E});
assert.equal(r.ids[0],'ok');assert(r.html.includes('고정 마차장')&&r.html.includes('영구 제외'));
// Same data always gives the same order.
const a=picker([['x',true],['y',true],['z',true]],[ride('x','2026-10-01')],{x:E,y:E,z:E}).ids,b=picker([['z',true],['y',true],['x',true]],[ride('x','2026-10-01')],{x:E,y:E,z:E}).ids;
assert.deepEqual(a,b);
console.log('PASS: VIP queue — 0 VIPs by points/memberId first, then oldest last VIP (dateless count oldest), fewer VIPs, points, memberId; recommendation; exclusions last with reasons; history kept; deterministic');
