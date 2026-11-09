// Read-only: open the live Production page, wait until shared records are loaded, render the real
// VIP picker list (renderCarriageVipResults) and print its rows in screen order, keeping MIN+ points.
import {chromium} from 'playwright-core';
const origin='https://3on-guild-production.295server.workers.dev',MIN=Number(process.argv[2]||40000000);
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true});
const page=await browser.newPage();
await page.goto(origin+'/legacy.html',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof shared!=='undefined'&&shared.ready&&typeof carriageVip!=='undefined'&&carriageVip.view&&typeof GROWTH!=='undefined'&&GROWTH.members.length&&state.records.length,{timeout:90000});
const out=await page.evaluate(min=>{
 document.getElementById('vipSearch').value='';renderCarriageVipResults();
 const rows=[...document.querySelectorAll('#vipResults .viprow')].map(r=>{
  const name=r.querySelector('.vip-main b').textContent.trim(),info=r.querySelector('.vip-main span').textContent.trim(),pill=r.querySelector('.vip-main .pill:last-of-type').textContent.trim(),top=!!r.querySelector('.pill.good')&&r.querySelector('.vip-main b').nextSibling?.textContent?.includes('오늘')||r.innerHTML.includes('오늘 추천');
  const points=Number((info.match(/길드전 ([\d,]+)점/)||[])[1]?.replace(/,/g,'')||0);return {name,info,pill,points,top};});
 return {records:state.records.length,week:carriageVip.view.active?.appliesOn,threshold:carriageVip.view.threshold,rows:rows.map((r,i)=>({...r,screen:i+1})).filter(r=>r.points>=min)};
},MIN);
console.log('RECORDS '+out.records+' WEEK '+out.week+' THRESHOLD '+out.threshold+' MIN '+MIN);
for(const r of out.rows)console.log('ROW\t'+r.screen+'\t'+r.name+'\t'+r.info+'\t'+r.pill+(r.top?'\t오늘 추천':''));
await browser.close();
