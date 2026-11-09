// Read-only: open the live Production page and list the VIP queue exactly as the VIP picker orders it
// (carriage-vip.js carriageVipOrder), for members whose weekly guild-war points are at least MIN.
import {chromium} from 'playwright-core';
const origin='https://3on-guild-production.295server.workers.dev',MIN=Number(process.argv[2]||40000000);
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true});
const page=await browser.newPage();
await page.goto(origin+'/legacy.html',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof carriageVip!=='undefined'&&carriageVip.view&&typeof GROWTH!=='undefined'&&GROWTH.members.length,{timeout:60000});
const out=await page.evaluate(min=>{
 const rows=carriageMembers().filter(m=>m.observedToday===true).map(m=>({m,...carriageVipHistory(m),status:carriageVipStatus(m),points:carriagePoints(m)})).filter(x=>(x.points??0)>=min);
 const blocked=x=>['permanent','rotation','membership','unavailable'].includes(x.status.reason);
 const list=[...rows.filter(x=>!blocked(x)).sort(carriageVipOrder),...rows.filter(blocked).sort(carriageVipOrder)];
 const v=carriageVip.view;
 return {week:v.active?.appliesOn,threshold:v.threshold,lines:list.map((x,i)=>[i+1,labelOfMember(x.m),x.points,x.count,x.last||'',blocked(x)?vipReason[x.status.reason]:(x.status.eligible?'':'기준 미달')].join('\t'))};
},MIN);
console.log('WEEK '+out.week+' THRESHOLD '+out.threshold+' MIN '+MIN);
for(const l of out.lines)console.log('ROW\t'+l);
await browser.close();
