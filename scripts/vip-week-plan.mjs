// Read-only (user request 2026-11-16): the next 7 days of carriage VIP picks, in the site's own order.
// Opens the live Production page, waits for shared records, then (in memory only, nothing is saved):
// uses the uploaded week (pending) as the active week when it has not started yet, re-checks each
// member's score eligibility against that week with the same rule as lib/vip-weekly.ts eligibility(),
// and repeatedly takes the first eligible member as the site's carriageVipOrder sorts them, adding an
// in-memory ride for that day so the next day sees the queue move.
import {chromium} from 'playwright-core';
const origin='https://3on-guild-production.295server.workers.dev',start=process.argv[2],days=Number(process.argv[3]||7),rides=process.argv.slice(4).map(a=>{const i=a.lastIndexOf('=');return {name:a.slice(0,i),date:a.slice(i+1)};});
// Extra arguments name=YYYY-MM-DD add rides the user reported that are not in the site records yet (in memory only).
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true});
const page=await browser.newPage();
await page.goto(origin+'/legacy.html',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof shared!=='undefined'&&shared.ready&&typeof carriageVip!=='undefined'&&carriageVip.view&&typeof GROWTH!=='undefined'&&GROWTH.members.length&&state.records.length,{timeout:90000});
const out=await page.evaluate(({start,days,rides})=>{
 const v=carriageVip.view,week=v.pending&&(!v.active||v.pending.appliesOn>v.active.appliesOn)?v.pending:v.active;
 v.active=week;
 for(const r of v.members)if(r.eligibility&&['eligible','score_low'].includes(r.eligibility.reason)){
  const p=week?.rows.find(x=>x.memberId===r.memberId)?.points??0;r.eligibility=p>=v.threshold?{eligible:true,reason:'eligible'}:{eligible:false,reason:'score_low'};}
 const added=[];
 for(const r of rides){const m=carriageMembers().find(x=>labelOfMember(x)===r.name||x.name===r.name||x.displayName===r.name);if(!m)throw Error('NOT_FOUND '+r.name);state.records.push({id:'told-'+r.name,date:r.date,vip:m.name,vipCanonical:m.name});added.push(r.name+' '+r.date);}
 const plan=[],base=new Date(start+'T00:00:00Z');
 for(let i=0;i<days;i++){
  const day=new Date(base.getTime()+i*86400000).toISOString().slice(0,10);
  const all=carriageMembers().filter(m=>m.observedToday===true).map(m=>{const status=carriageVipStatus(m);return {m,...carriageVipHistory(m,status),status};}).filter(x=>x.status.eligible).sort(carriageVipOrder);
  const top=all[0];if(!top)break;
  plan.push({day,name:labelOfMember(top.m),points:carriagePoints(top.m),count:top.count,last:top.last,eligible:all.length});
  state.records.push({id:'plan-'+i,date:day,vip:top.m.name,vipCanonical:top.m.name});
 }
 return {week:week?.appliesOn,threshold:v.threshold,records:state.records.length-plan.length-added.length,added,plan};
},{start,days,rides});
console.log('WEEK '+out.week+' THRESHOLD '+out.threshold+' RECORDS '+out.records+' ADDED '+out.added.join(', '));
for(const p of out.plan)console.log('PLAN\t'+p.day+'\t'+p.name+'\t'+p.points+'\t누적 '+p.count+'\t마지막 '+p.last+'\t대상 '+p.eligible+'명');
await browser.close();
