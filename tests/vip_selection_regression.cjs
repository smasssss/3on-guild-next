/* eslint-disable @typescript-eslint/no-require-imports -- Existing VM harness style. */
// VIP queue (2026-11-05): eligibility from the server, order from carriage history.
// 2026-11-12 rule change (user decision): a 0-VIP member no longer goes straight to the front. They count as
// one VIP on the day they joined (joinedOn from the API; the active week's Monday when unknown), or on the stored
// baseline date (state.vipBaseline), and queue by that date like everyone else. Expected orders below changed accordingly.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function picker(members,records,points,carry={},baseline){
 const nodes={vipSearch:{value:''},vipResults:{innerHTML:''}};
 const ctx={console,Date,Number,Set,Map,JSON,Promise,crypto,VERIFIED_IDENTITIES:{},aliases:{},window:{addEventListener(){}},document:{getElementById:id=>nodes[id],querySelectorAll:()=>[]},GROWTH:{members:[],archivedMembers:[]},state:{vipExcludedMembers:{},records,...(baseline?{vipBaseline:baseline}:{})},vipRecordCanonical:r=>r.vipCanonical,labelOfMember:m=>m.displayName||m.name,vipTotalCount:n=>(carry[n]||0)+records.filter(r=>r.vipCanonical===n).length,carryConflict:()=>false,escapeLabel:s=>String(s),fmt:n=>Number(n).toLocaleString('ko-KR'),memberByCanonical(){},memberByLabel(){}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/carriage-vip.js','utf8'),ctx);
 ctx.view={week:'2026-11-02',roster:{sourceAsOf:1},active:{appliesOn:'2026-11-02',rows:Object.entries(points).map(([memberId,p])=>({memberId,points:p}))},members:members.map(([id,ok,reason,joinedOn,rejoinedOn])=>({memberId:id,canonical:id,nickname:id,current:true,joinedOn:joinedOn||null,rejoinedOn:rejoinedOn||null,eligibility:{eligible:ok,reason:reason||'eligible'}}))};
 vm.runInContext('carriageVip.view=view',ctx);ctx.renderCarriageVipResults();
 const html=nodes.vipResults.innerHTML;return {ids:[...html.matchAll(/data-vip="([^"]+)"/g)].map(m=>m[1]),html,ctx};
}
const ride=(who,date)=>({id:who+date,date,vipCanonical:who});
const E=55000000;
// Oldest last VIP first; count-only history (no date) counts as oldest; 0-VIP members count as one VIP on
// the active week's Monday (2026-11-02 here), ordered among themselves by points then memberId.
let r=picker([['zero-low',true],['zero-high',true],['zero-tie-b',true],['zero-tie-a',true],['old',true],['recent',true],['carry',true]],[ride('old','2026-10-01'),ride('recent','2026-11-04')],{'zero-low':E,'zero-high':E+9,'zero-tie-a':E+1,'zero-tie-b':E+1,old:E,recent:E,carry:E},{carry:2});
assert.deepEqual(r.ids,['carry','old','zero-high','zero-tie-a','zero-tie-b','zero-low','recent']);
assert(r.html.indexOf('오늘 추천')<r.html.indexOf('data-vip="carry"')&&r.html.split('오늘 추천').length===2,'only the first eligible is the recommendation');
assert(r.html.includes('누적 1회')&&r.html.includes('(기준)'),'a 0-VIP member is shown as one baseline VIP');
// Stored baseline (one-time 2026-11-12 adjustment): counts as one VIP on that date; later rides add to it.
r=picker([['based',true],['older',true],['later',true]],[ride('older','2026-11-10'),ride('later','2026-11-13')],{based:E,older:E,later:E},{},{based:'2026-11-12'});
assert.deepEqual(r.ids,['older','based','later']);assert(r.html.includes('누적 1회'));
r=picker([['based',true],['x',true]],[ride('based','2026-11-20'),ride('x','2026-11-15')],{based:E,x:E},{},{based:'2026-11-12'});
assert.deepEqual(r.ids,['x','based']);assert(r.html.includes('누적 2회'),'baseline plus one ride');
// Saving a carriage record stores the missing baseline date for eligible 0-VIP members only.
{const p=picker([['new',true],['zero',true],['has',true],['low',false,'score_low']],[ride('has','2026-10-01')],{new:E,zero:E,has:E,low:1});
 p.ctx.carriageMembers=()=>[{member_id:'new',name:'new',observedToday:true,joinedOn:'2026-11-05'},{member_id:'zero',name:'zero',observedToday:true},{member_id:'has',name:'has',observedToday:true},{member_id:'low',name:'low',observedToday:true}];
 p.ctx.carriageVipFillBaseline();assert.equal(JSON.stringify(p.ctx.state.vipBaseline),'{"new":"2026-11-05","zero":"2026-11-02"}','join day stored; unknown join day uses the active week');
 vm.runInContext("carriageVip.view.active.appliesOn='2026-11-09'",p.ctx);p.ctx.carriageVipFillBaseline();assert.equal(JSON.stringify(p.ctx.state.vipBaseline),'{"new":"2026-11-05","zero":"2026-11-02"}','a stored baseline never moves');}
// Same last date: fewer VIPs first; then points; then memberId.
r=picker([['three',true],['one',true]],[ride('one','2026-11-01'),ride('three','2026-10-01'),ride('three','2026-10-15'),ride('three','2026-11-01')],{one:E,three:E});
assert.deepEqual(r.ids,['one','three']);
// First VIP: the 0-count leader is confirmed today and moves behind everyone with an older last VIP.
const recs=[ride('a','2026-10-20'),ride('b','2026-10-25')];
r=picker([['new',true],['a',true],['b',true]],recs,{new:E,a:E,b:E});assert.deepEqual(r.ids,['a','b','new'],'join day unknown: queues from this week, behind those waiting longer');
r=picker([['new',true,'eligible','2026-10-22'],['a',true],['b',true]],recs,{new:E,a:E,b:E});assert.deepEqual(r.ids,['a','new','b'],'a new member counts as one VIP on the day they joined');
r=picker([['new',true],['a',true],['b',true]],[...recs,ride('new','2026-11-05')],{new:E,a:E,b:E});assert.deepEqual(r.ids,['a','b','new'],'next day the previous VIP is last in the queue');
// Below the threshold this week: excluded, but count and last VIP are kept and shown.
r=picker([['low',false,'score_low'],['ok',true]],[ride('low','2026-10-01'),ride('low','2026-10-02')],{low:E-1,ok:E});
assert.deepEqual(r.ids,['ok','low']);assert(r.html.includes('누적 2회')&&r.html.includes('점수 미달'));
// Returning member: history keyed by the same identity (memberId/canonical) is linked again.
r=picker([['back',true],['fresh',true]],[ride('back','2026-09-01'),ride('back','2026-09-20')],{back:E,fresh:E});
assert(r.html.includes('누적 2회'));assert.deepEqual(r.ids,['back','fresh'],'a brand-new member no longer jumps ahead of a long wait');
// Returning member (2026-11-12 user decision): the VIP count carries on, but the last VIP counts from the day they came back.
r=picker([['back',true,'eligible','2026-11-03','2026-11-03'],['waiting',true]],[ride('back','2026-09-01'),ride('back','2026-09-20'),ride('waiting','2026-10-15')],{back:E,waiting:E});
assert.deepEqual(r.ids,['waiting','back']);assert(r.html.includes('누적 2회')&&r.html.includes('(재가입)'));
r=picker([['back',true,'eligible','2026-11-03','2026-11-03'],['later',true]],[ride('back','2026-09-01'),ride('back','2026-11-06'),ride('later','2026-11-05')],{back:E,later:E});
assert.deepEqual(r.ids,['later','back'],'a VIP after coming back counts from that ride');assert(!r.html.includes('(재가입)'));
// Fixed drivers and permanent exclusions are listed last with their reason, never recommended.
r=picker([['rot',false,'rotation'],['perm',false,'permanent'],['ok',true]],[],{rot:E*2,perm:E*2,ok:E});
assert.equal(r.ids[0],'ok');assert(r.html.includes('고정 마차장')&&r.html.includes('영구 제외'));
// Same data always gives the same order.
const a=picker([['x',true],['y',true],['z',true]],[ride('x','2026-10-01')],{x:E,y:E,z:E}).ids,b=picker([['z',true],['y',true],['x',true]],[ride('x','2026-10-01')],{x:E,y:E,z:E}).ids;
assert.deepEqual(a,b);
console.log('PASS: VIP queue — 0 VIPs count as one VIP on their join day (or this week when unknown) or stored baseline, returning members keep their count and queue from the return day, oldest last VIP first (dateless count oldest), fewer VIPs, points, memberId; recommendation; exclusions last with reasons; history kept; deterministic');
