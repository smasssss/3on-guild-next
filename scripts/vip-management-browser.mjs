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
 let phase='PAGE_LOAD';
 try{
 const require=(condition,label)=>{if(!condition)throw Error(label);};
 const origin=input.origin;
 await page.goto(origin+'/legacy.html',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>typeof shared!=='undefined'&&shared.ready&&typeof carriageVip!=='undefined'&&carriageVip.view,{timeout:60000});
 const baseline=await page.evaluate(()=>({total:JSON.stringify(state),princess:vipTotalCount('공 주'),rotation:rotationMembers().length}));
 const countPreservation=await page.evaluate(old=>Object.entries(old.totals).every(([name,total])=>vipTotalCount(name)===total)&&JSON.stringify(rotationMembers().map(m=>m.memberId))===JSON.stringify(old.rotation),input.old);
 require(countPreservation,'All existing VIP totals and rotation identities match pre-deploy browser');
 phase='VIP_PICKER';
 await page.locator('.tabs [data-tab="carriage"]').click();
 await page.locator('#pickVipBtn').click();
 await page.locator('#vipModal.show').waitFor();
 await page.waitForFunction(()=>carriageVip.view&&document.querySelectorAll('[data-vip]').length>0,{timeout:60000});
 const picker=await page.evaluate(()=>({rows:document.querySelectorAll('[data-vip]').length,temporary:carriageVip.view.members.filter(m=>m.current&&m.temporary),initial:carriageVip.view.awaitingFirstSnapshot,hasPoints:document.getElementById('vipResults').textContent.includes('주간'),buttons:[...document.querySelectorAll('[data-vip]')].map(b=>({id:b.dataset.vip,disabled:b.disabled}))}));
 require(picker.initial&&picker.hasPoints,'Initial weekly mode and weekly points display');
 for(const member of picker.temporary){const button=picker.buttons.find(b=>b.id===member.memberId);if(member.eligibility.reason!=='permanent')require(button?.disabled,'Temporary VIP button');}
 if(input.target==='staging'){
  require(picker.temporary.length===16,'All 16 restricted fixture members');
  const ordinary=input.fixture.at(-1);
  require(picker.buttons.some(b=>b.id===ordinary.memberId&&!b.disabled),'Ordinary pre-score VIP remains enabled');
 }
 await page.locator('#closeVip').click();
 phase='DATE_SELECTOR';
 await page.locator('#chooseRunDate').click();
 await page.locator('#runDateYear').fill('2026');
 await page.locator('#runDateMonth').selectOption('11');
 await page.locator('#runDateDay').selectOption('2');
 await page.locator('#applyRunDate').click();
 require(await page.locator('#runDate').inputValue()==='2026-11-02','Run date selection');
 phase='EXISTING_MENUS';
 for(const name of ['growth','canyon','carriage','history']){
  await page.locator('.tabs [data-tab="'+name+'"]').click();
  require(await page.locator('#'+name).evaluate(e=>e.classList.contains('active')),'Existing menu '+name);
 }
 if(input.target==='staging'){
  phase='ADMIN_LOGIN';
  await page.locator('.tabs [data-tab="settings"]').click();
  await page.locator('#loginGate:not(.hide)').waitFor();
  await page.locator('#pw').fill(password);
  await page.locator('#loginBtn').click();
  await page.waitForFunction(()=>adminOK(),{timeout:30000});
  await page.locator('#vipWeeklyPanel').waitFor();
  phase='SERVER_POLICY';
  const result=await page.evaluate(async(input)=>{
   const call=async(path,body)=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+sharedToken()},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
   const document=(await (await fetch('/api/state')).json()).documents.find(d=>d.kind==='carriage');
   const old=JSON.stringify(document);
   const first=input.fixture[0];
   const candidate=structuredClone(document.data);
   candidate.records.push({id:'vip-release-denial-'+crypto.randomUUID(),date:'2026-10-28',weekKey:'2026-10-26',type:'insert',leader:first.canonical,leaderCanonical:first.canonical,vip:first.nickname,vipCanonical:first.canonical,vipMemberId:first.memberId,memo:'Staging-only rejection check'});
   const rejected=await call('/api/state',{kind:'carriage',revision:document.revision,mutation:crypto.randomUUID(),data:candidate});
   const view=await (await fetch('/api/carriage/vip')).json();
   // At least seven days ahead, so retries or a midnight crossing can never
   // turn this negative test into an accepted score upload.
   const futureSaturday=new Date(new Date(Date.parse(view.serverTime)+9*3600000).toISOString().slice(0,10)+'T00:00:00Z');
   futureSaturday.setUTCDate(futureSaturday.getUTCDate()+((6-futureSaturday.getUTCDay()+7)%7)+7);
   const providedOn=futureSaturday.toISOString().slice(0,10),appliesOn=new Date(futureSaturday.getTime()+2*86400000).toISOString().slice(0,10);
   const future=await call('/api/carriage/vip',{revision:view.revision,mutation:crypto.randomUUID(),snapshot:{providedOn,appliesOn,coverage:'partial',rows:[{memberId:first.memberId,nickname:first.nickname,points:25000000}]}});
   const after=(await (await fetch('/api/state')).json()).documents.find(d=>d.kind==='carriage');
   const weekly=await (await fetch('/api/carriage/vip')).json();
   return {denied:rejected.status===422,futureDenied:future.status===400,documentPreserved:JSON.stringify(after)===old,weeklyPreserved:weekly.revision===view.revision&&weekly.awaitingFirstSnapshot};
  },input);
  require(result.denied,'Server rejects direct restricted VIP assignment');
  require(result.futureDenied&&result.weeklyPreserved,'Future weekly file is not applied');
  require(result.documentPreserved,'Existing VIP counts and records preserved');
  const editor=await page.locator('#rotationEditor').count();require(editor===1,'Rotation editor retained');
  await page.evaluate(()=>sharedLogout());
  await page.waitForFunction(()=>!adminOK());
 }
 phase='MOBILE_DATE';
 await page.setViewportSize({width:390,height:844});
 await page.locator('.tabs [data-tab="carriage"]').click();
 await page.locator('#chooseRunDate').click();
 require(await page.locator('#runDateChoice').isVisible(),'Mobile date selection');
 await page.locator('#cancelRunDate').click();
 const preserved=await page.evaluate(()=>({total:JSON.stringify(state),princess:vipTotalCount('공 주'),rotation:rotationMembers().length}));
 phase='RECORD_PRESERVATION';
 require(preserved.total===baseline.total&&preserved.princess===baseline.princess&&preserved.rotation===baseline.rotation,'Read-only browser interactions preserve operational state');
 return {verified:true,target:input.target,checks:['initial-mode','weekly-points','temporary-buttons','date','menus','mobile-date','historical-totals','rotation',...(input.target==='staging'?['admin-login','server-422','future-400','weekly-unchanged','logout']:[])]};
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
