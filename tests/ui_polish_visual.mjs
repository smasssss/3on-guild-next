import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const base=process.env.UI_VISUAL_BASE||'http://127.0.0.1:8794';
assert.equal(new URL(base).hostname,'127.0.0.1','Only isolated local preview is allowed');
const output=process.env.UI_VISUAL_OUTPUT||'/tmp/3on-ui-visual';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),args:['--no-sandbox']});
const results=[];mkdirSync(output,{recursive:true});
const names=['핵불잙','크림쿜','용팝이','용퍕이','합성검증_긴닉네임_가독성_테스트'];
const members=names.map((n,i)=>({member_id:'synthetic-'+i,display_name:n,canonical:n,power:123456789+i,level:30,rank:'R3'}));
const batch={batch_id:'synthetic-ui',observed_date:'2026-10-22',slot:'test-ui',state:'ready',draft_revision:1,base_growth_revision:1,identity_revision:1,validation:{blocking:[]}};
const review={batch,rows:members.map((m,i)=>({row_id:'row-'+i,row_index:i,raw_name:m.display_name,member_display_name:m.display_name,resolved_member_id:m.member_id,resolution_status:'resolved',review_version:i===0?1:0,rank:m.rank,level:m.level,power:m.power})),summary:{total:5,auto_connections:5,connections:5,new_members:0,nickname_changes:0,failures:0,changed_members:1,user_edits:1}};
try{
 for(const width of [320,375,390,520,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',hasTouch:width<=520});
  const page=await context.newPage();let interceptedWrites=0;
  await page.route('**/api/**',async route=>{
   assert.equal(route.request().method(),'GET','UI-only visual tests must never issue writes');
   const url=new URL(route.request().url());let data;
   if(url.pathname==='/api/session')data={admin:true};
   else if(url.pathname==='/api/growth/current')data={members,revision:1,identity_revision:1,observed_date:'2026-10-22'};
   else if(url.pathname==='/api/growth/batches')data={batches:[batch]};
   else if(url.pathname==='/api/growth/review')data=review;
   else if(url.pathname==='/api/growth/automation')data={mode:'fixture',control:{enabled:true},pending_count:0,events:[],mappings:[{game_id:'synthetic-game',source_name:'합성자료',display_name:'합성검증'}],all_members:[],runs:[],closes:[],external_calls:0};
   else throw Error('Unexpected API route '+url.pathname);
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(base+'/growth-admin');await page.locator('.resultRow').first().waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert(!overflow,'Document overflow at '+width);
  const row=page.locator('.resultRow').first();assert((await row.boundingBox()).height>=44);
  await row.scrollIntoViewIfNeeded();await page.screenshot({path:output+'/list-'+width+'.png'});
  await row.click();await page.getByRole('dialog').waitFor();
  const columns=await page.locator('.editFields').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.equal(columns,width<=340?1:width<=520?2:3,'Responsive field columns at '+width);
  const modalOverflow=await page.locator('.simpleSheet').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert(!modalOverflow,'Modal overflow '+width);
  await page.getByLabel('닫기',{exact:true}).focus();
  await page.keyboard.press('Tab');
  const focus=await page.evaluate(()=>({width:getComputedStyle(document.activeElement).outlineWidth,style:getComputedStyle(document.activeElement).outlineStyle}));
  assert.equal(focus.width,'3px');assert.equal(focus.style,'solid');
  await page.screenshot({path:output+'/editor-'+width+'.png'});
  await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'최종 반영',exact:true}).click();await page.getByRole('alertdialog').waitFor();
  const card=await page.locator('.publishCard').boundingBox();assert(card.x>=0&&card.x+card.width<=width+1);
  await page.screenshot({path:output+'/confirm-'+width+'.png'});
  await page.getByRole('alertdialog').getByRole('button',{name:'취소'}).click();
  results.push({width,status:'PASS',documentOverflow:false,modalOverflow:false,fieldColumns:columns,focusOutline:focus,touchRowMin44:true,writeRequests:interceptedWrites});
  await context.close();
 }
 writeFileSync(output+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
