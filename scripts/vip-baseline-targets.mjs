// One-time VIP baseline (user decision 2026-11-12), read-only part: open the live Production page,
// wait until shared records are loaded and use the page's own count (vipTotalCount) to list current
// guild members with 0 VIPs, excluding fixed carriage drivers and permanent exclusions.
// Writes the member IDs to the given file; nothing is changed here.
import {chromium} from 'playwright-core';
import {writeFileSync} from 'node:fs';
const origin='https://3on-guild-production.295server.workers.dev',out=process.argv[2];
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true});
const page=await browser.newPage();
await page.goto(origin+'/legacy.html',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof shared!=='undefined'&&shared.ready&&typeof carriageVip!=='undefined'&&carriageVip.view&&typeof GROWTH!=='undefined'&&GROWTH.members.length&&state.records.length,{timeout:90000});
const result=await page.evaluate(()=>{
 const rotation=new Set((state.rotationMembers||[]).map(e=>e.memberId)),excluded=state.vipExcludedMembers||{},saved=state.vipBaseline||{};
 const byId=new Map(carriageMembers().map(m=>[m.member_id,m]));
 const current=carriageVip.view.members.filter(r=>r.current);
 const targets=current.filter(r=>!rotation.has(r.memberId)&&excluded[r.memberId]!==1&&!saved[r.memberId]&&byId.get(r.memberId)&&vipTotalCount(byId.get(r.memberId).name)===0).map(r=>r.memberId);
 return {current:current.length,targets,records:state.records.length};
});
writeFileSync(out,JSON.stringify(result));
console.log('Current members '+result.current+' · 0-VIP targets '+result.targets.length+' · carriage records '+result.records);
await browser.close();
