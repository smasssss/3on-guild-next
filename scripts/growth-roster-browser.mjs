// Run the real deployed page through the pinned Playwright CLI. Keep private UI,
// credentials and request details in encrypted evidence, never public CI logs.
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const target=process.argv[2];
const mode=process.argv[3]||'verify';
if(!['staging','production'].includes(target))throw Error('Unknown target');
const temp=process.env.RUNNER_TEMP;
const root=join(temp,'3on-vip-release-'+target);
const before=JSON.parse(readFileSync(join(root,'before.json'),'utf8'));
const input=target==='staging'&&mode==='verify'?JSON.parse(readFileSync(join(root,'browser-input.json'),'utf8')):{origin:before.origin,target};
if(target==='staging'&&mode==='verify'&&!process.env.STAGING_ADMIN_PASSWORD)throw Error('Existing Staging administrator credential is unavailable');
const password=target==='staging'&&mode==='verify'?process.env.STAGING_ADMIN_PASSWORD:null;
if(mode==='verify')input.old=JSON.parse(readFileSync(join(root,'browser-baseline.json'),'utf8'));
const cli=join(temp,'3on-pw/node_modules/.bin/playwright-cli');
const config=join(root,'browser-config.json');
writeFileSync(config,JSON.stringify({browser:{browserName:'chromium',isolated:true,launchOptions:{executablePath:process.env.CHROME_BIN,headless:true},contextOptions:{viewport:{width:1280,height:900}}}}),{mode:0o600});
const run=(args)=>execFileSync(cli,['-s=3on-vip-'+target+'-'+mode,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000});
// The CLI VM has no process.env. Its protected input file is outside the
// encrypted evidence directory and is removed after the CLI finishes.
const code=join(temp,'3on-vip-browser-actions-'+target+'-'+mode+'.js');
const captureBaseline=async(page,input)=>{
 await page.goto(input.origin+'/legacy.html',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>typeof shared!=='undefined'&&shared.ready,{timeout:60000});
 return await page.evaluate(()=>{
  const names=[...new Set([...GROWTH.members,...(GROWTH.archivedMembers||[])].map(m=>m.name).concat(Object.keys(VIP_IMPORT.baseline||{}),Object.keys(state.vipCarry||{}),Object.keys(state.vipResolution||{}),state.records.map(vipRecordCanonical)))].filter(n=>typeof n==='string'&&n);
  return {verified:true,totals:Object.fromEntries(names.map(n=>[n,vipTotalCount(n)])),rotation:rotationMembers().map(m=>m.memberId)};
 });
};
const actions=async(page,input,password)=>{
 let phase='LOAD';
 try{
 const require=(ok,label)=>{if(!ok)throw Error(label);};
 await page.goto(input.origin+'/legacy.html',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>typeof shared!=='undefined'&&shared.ready&&typeof carriageVip!=='undefined'&&carriageVip.view,{timeout:60000});
 phase='PRESERVATION';
 require(await page.evaluate(old=>Object.entries(old.totals).every(([name,n])=>vipTotalCount(name)===n)&&JSON.stringify(rotationMembers().map(m=>m.memberId))===JSON.stringify(old.rotation),input.old),'VIP totals and rotation unchanged');
 const original=await page.evaluate(()=>JSON.stringify(state));
 phase='ROSTER';
 const result=await page.evaluate(async()=>{const a=await(await fetch('/api/growth/current')).json(),b=await(await fetch('/api/growth/legacy')).json(),c=await(await fetch('/api/growth/automation')).json();return {current:a,legacy:b,auto:c,dataCount:GROWTH.members.length};});
 require(result.dataCount===result.legacy.data.guildCount&&result.current.members.length===result.dataCount,'API/current/page count agreement');
 require(result.auto.members.length===result.dataCount,'Hourly current table count');
 const kpi=await page.frameLocator('#growthFrame').locator('#kpis').innerText();require(kpi.includes(result.dataCount+'명'),'Actual iframe guild count');
 if(input.target==='staging'){
  require(result.dataCount===input.expectedCount,'Complete fixture membership');
  const c=result.legacy.data.members.find(m=>m.member_id===input.missing.memberId),a=result.legacy.data.archivedMembers.find(m=>m.member_id===input.missing.memberId);
  require(input.expectedCount===2?(!c&&a?.history.some(h=>h.power===input.missing.power)):!!c,'Absent member archive / stable rejoin');
  const history=await page.evaluate(async id=>await(await fetch('/api/growth/member?member_id='+encodeURIComponent(id))).json(),input.missing.memberId);require(history.observations.some(o=>o.power===input.missing.power),'Individual history preserved');
 }
 phase='MENUS';
 for(const tab of ['growth','canyon','carriage','history']){await page.locator('.tabs [data-tab="'+tab+'"]').click();require(await page.locator('#'+tab).evaluate(e=>e.classList.contains('active')),'Existing tab');}
 await page.locator('.tabs [data-tab="carriage"]').click();await page.locator('#runDate ~ .ops-pick').click();
 for(let i=0;i<240;i++){const [y,m]=(await page.locator('.ops-cal-nav b').innerText()).match(/\d+/g).map(Number);if(y===2026&&m===11)break;await page.locator('.ops-cal-nav button[aria-label="'+(y*12+m>2026*12+11?'이전 달':'다음 달')+'"]').click();}
 await page.locator('.ops-cal-grid button[aria-label="2026-11-03"]').click();require(await page.locator('#runDate').inputValue()==='2026-11-03','Existing run date selector');
 phase='VIP_PICKER';await page.locator('#pickVipBtn').click();await page.locator('#vipModal.show').waitFor();
 const buttons=await page.locator('[data-vip]').evaluateAll(rows=>rows.map(b=>b.disabled));require(buttons.every((d,i)=>!i||d||!buttons[i-1]),'Restricted-last ordering preserved');await page.locator('#closeVip').click();
 if(input.target==='staging'){
  phase='AUTH';await page.locator('.tabs [data-tab="settings"]').click();await page.locator('#pw').fill(password);await page.locator('#loginBtn').click();await page.waitForFunction(()=>adminOK(),{timeout:30000});require(await page.locator('#rotationEditor').count()===1,'Existing rotation settings');
  // The hourly collection table now lives in 관리설정 (after admin login) and loads only while it is shown.
  await page.locator('#growthAutomatic [data-game]').first().waitFor({state:'attached',timeout:30000});
  require(await page.locator('#growthAutomatic [data-game]').count()===result.dataCount,'Actual hourly table count');
 await page.evaluate(()=>sharedLogout());
 }
 phase='MOBILE';await page.setViewportSize({width:390,height:844});await page.locator('.tabs [data-tab="carriage"]').click();await page.locator('#runDate ~ .ops-pick').click();require(await page.locator('.ops-cal-grid').isVisible(),'Mobile date selector');await page.locator('.ops-pick-modal .ops-pick-head button').click();
 require(await page.evaluate(old=>JSON.stringify(state)===old,original),'All operation values unchanged');
 return {verified:true,target:input.target,current:result.dataCount,checks:['current-roster','actual-iframe','archived-history','VIP-totals','rotation','restricted-last','date','menus','mobile',...(input.target==='staging'?['login','logout','stable-rejoin']:[])]};
 }catch{throw Error('VIP_CHECK_'+phase);}
};
writeFileSync(code,'async (page) => ('+(mode==='baseline'?captureBaseline:actions).toString()+')(page,'+JSON.stringify(input)+','+JSON.stringify(password)+')',{mode:0o600});
let good=false;
try{
 run(['open','about:blank','--config',config]);
 run(['snapshot']);
 const output=run(['run-code','--filename',code,'--raw']);
 const result=JSON.parse(output);good=result.verified===true;
 writeFileSync(join(root,'browser-result.json'),JSON.stringify(result),{mode:0o600});
 if(good&&mode==='baseline')writeFileSync(join(root,'browser-baseline.json'),JSON.stringify(result),{mode:0o600});
}catch(error){const details=String(error.stdout||'')+'\n'+String(error.stderr||'');const phase=details.match(/VIP_CHECK_([A-Z_]+)/)?.[1]||'BROWSER_CLIENT';writeFileSync(join(root,'browser-error.json'),JSON.stringify({failed:true,phase}),{mode:0o600});console.log('Playwright check '+phase+': FAIL');}
finally{try{run(['close']);}catch{}try{unlinkSync(code);}catch{} }
console.log('Playwright '+target+' '+mode+' checks: '+(good?'PASS':'FAIL'));
process.exitCode=good?0:1;
