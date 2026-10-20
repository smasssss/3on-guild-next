// Read the deployed public assets/API and execute the display code in an isolated VM.
// This is a programmatic render check, not a browser screenshot or visual inspection.
const fs=require('node:fs'),assert=require('node:assert/strict'),{runInNewContext}=require('node:vm'),{createHash}=require('node:crypto');
(async()=>{
 const target=process.argv[2];assert(['staging','production'].includes(target));
 const origin='https://3on-guild-'+target+'.295server.workers.dev';
 const [scriptResponse,stateResponse,pageResponse]=await Promise.all(['/growth-auto.js','/api/growth/automation','/legacy'].map(p=>fetch(origin+p,{cache:'no-store'})));
 assert(scriptResponse.ok&&stateResponse.ok&&pageResponse.ok,'Deployed public resources must be available');
 const script=await scriptResponse.text(),state=await stateResponse.json(),page=await pageResponse.text();
 const hash=s=>createHash('sha256').update(s).digest('hex');assert.equal(hash(script),hash(fs.readFileSync('public/growth-auto.js')),'Deployed UI must match exact validated source');
 assert(page.includes('/growth-auto.js'),'Existing growth iframe loads the new display');
 const carriage=await fetch(origin+'/carriage-date.js',{cache:'no-store'});assert(carriage.ok);
 assert.equal(hash(await carriage.text()),hash(fs.readFileSync('public/carriage-date.js')),'Deployed carriage date selector matches validated source');
 assert(page.includes('/carriage-date.js'),'Existing carriage page loads the scoped date selector');

 assert(Array.isArray(state.nickname_changes));
 assert.equal(new Set(state.nickname_changes.map(n=>n.game_id)).size,state.nickname_changes.length);
 for(const n of state.nickname_changes){const m=state.members.find(m=>m.game_id===n.game_id);assert(m);assert.equal(n.current_name,m.display_name||m.source_name);}
 let opened=[];const controls={},box={innerHTML:'',style:{},querySelectorAll:s=>s==='details'?opened:[],querySelector:s=>controls[s]??={},insertAdjacentHTML:(_,html)=>{box.innerHTML+=html}};
 runInNewContext(script,{document:{hidden:false,createElement:()=>box,querySelector:()=>({prepend(){}})},fetch:async()=>({ok:true,json:async()=>state}),sessionStorage:{getItem:()=>null},setInterval(){},window:{addEventListener(){}},parent:{location:{origin},postMessage(){}}});
 await new Promise(setImmediate);
 assert.match(box.innerHTML,/제공처 데이터 기준/);assert.match(box.innerHTML,/마지막 수집/);
 if(state.last_run?.status==='accepted'&&state.control.enabled)assert.match(box.innerHTML,/자동 수집 정상/);
 if(state.last_run?.status==='duplicate'&&state.control.enabled)assert.match(box.innerHTML,/정기 확인 완료 · 제공처 새 자료 없음/);
 if(state.nickname_changes.length)assert.match(box.innerHTML,/<th>현재 닉네임<\/th><th>직전 닉네임<\/th>/);
 if(state.members.length&&state.members.every(m=>m.source_as_of&&m.source_as_of===state.last_good?.source_as_of))assert(!box.innerHTML.includes('<th>제공처 데이터 기준시각</th>'));
 const proof={status:'DEPLOYED_UI_RENDER_PASS',target,ui_hash:hash(script),members:state.members.length,nickname_pairs:state.nickname_changes.length,called_at:state.last_run?.called_at,source_as_of:state.last_good?.source_as_of,last_status:state.last_run?.status,external_calls:state.external_calls,ai_calls:state.ai_calls,visual_browser_check:false};
 fs.writeFileSync('automation-evidence/'+target+'/ui-render.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
})().catch(e=>{console.error(e);process.exitCode=1});
