// srcdoc has origin "null" even though its unsandboxed parent is same-origin.
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync('public/growth-auto.js','utf8');
const statement=source.match(/parent\.postMessage\([^\n]+?\)(?=\}catch)/)?.[0];
assert(statement,'Growth refresh message is present');
const origin='https://3on-guild-production.295server.workers.dev';
let sent;
runInNewContext(statement,{location:{origin:'null'},parent:{location:{origin},postMessage:(data,target)=>{sent={data,target}}}});
assert.equal(sent.target,origin);
assert.equal(sent.data.kind,'3on-growth-auto-refresh');
console.log('PASS: srcdoc daily refresh targets the actual parent origin');
// A refresh after focusing the iframe must keep an already expanded roster open.
(async()=>{
 let opened=[],focus;const controls={};
 const box={innerHTML:'',style:{},querySelectorAll:selector=>selector==='details'?opened:[],querySelector:selector=>controls[selector]??={},insertAdjacentHTML:(_,html)=>{box.innerHTML+=html}};
 runInNewContext(source,{
  document:{hidden:false,createElement:()=>box,querySelector:()=>({prepend(){}})},
  fetch:async()=>({ok:true,json:async()=>({members:[],changes:[],mode:'production'})}),
  sessionStorage:{getItem:()=>null},setInterval(){},
  window:{addEventListener:(_,fn)=>{focus=fn}},parent:{location:{origin},postMessage(){}},
 });
 await new Promise(setImmediate);
 opened=[{open:true},{open:true}];await focus();
 assert.equal((box.innerHTML.match(/<details open>/g)||[]).length,2);
 console.log('PASS: automatic refresh preserves expanded roster and change history');
})().catch(error=>{console.error(error);process.exitCode=1});

// Show collection freshness independently of source freshness, including unchanged and failed runs.
(async()=>{
 const called=Date.parse('2026-10-18T02:00:24+09:00'),asOf=Date.parse('2026-10-18T01:22:26+09:00');
 let data={members:[{game_id:'test-1',display_name:'Test',power:100,source_as_of:asOf}],changes:[],mode:'production',control:{enabled:1},last_run:{called_at:called,status:'accepted'},last_good:{source_as_of:asOf,member_count:1}};
 let focus;const controls={};
 const box={innerHTML:'',style:{},querySelectorAll:()=>[],querySelector:s=>controls[s]??={},insertAdjacentHTML:(_,html)=>{box.innerHTML+=html}};
 runInNewContext(source,{document:{hidden:false,createElement:()=>box,querySelector:()=>({prepend(){}})},fetch:async()=>({ok:true,json:async()=>data}),sessionStorage:{getItem:()=>null},setInterval(){},window:{addEventListener:(_,fn)=>{focus=fn}},parent:{location:{origin},postMessage(){}}});
 await new Promise(setImmediate);
 assert.match(box.innerHTML,/자동 수집 정상/);
 assert.match(box.innerHTML,/마지막 수집 2026\. 10\. 18\. 2시 0분 24초/);
 assert.match(box.innerHTML,/제공처 데이터 기준 2026\. 10\. 18\. 1시 22분 26초/);
 assert.doesNotMatch(box.innerHTML,/<th>제공처 데이터 기준시각<\/th>/);
 assert.match(box.innerHTML,/모든 길드원의 제공처 데이터 기준시각은 상단과 같습니다/);
 data={...data,last_run:{...data.last_run,status:'duplicate'}};await focus();
 assert.match(box.innerHTML,/정기 확인 완료 · 제공처 새 자료 없음/);
 assert.match(box.innerHTML,/마지막 수집 2026\. 10\. 18\. 2시 0분 24초/);
 data={...data,last_run:{...data.last_run,status:'failed'}};await focus();
 assert.match(box.innerHTML,/자동 수집 오류 · 확인 필요/);assert.doesNotMatch(box.innerHTML,/자동 수집 정상|제공처 새 자료 없음/);
 data={...data,last_run:{...data.last_run,status:'partial'},members:[...data.members,{game_id:'test-2',display_name:'Other',power:90,source_as_of:asOf-3600000}],delayed:true};await focus();
 assert.match(box.innerHTML,/자동 수집 완료 · 검토 필요/);
 assert.match(box.innerHTML,/<th>제공처 데이터 기준시각<\/th>/);
 assert.match(box.innerHTML,/제공처 데이터 지연/);
 data={...data,control:{enabled:0},last_run:{...data.last_run,status:'accepted'}};await focus();
 assert.match(box.innerHTML,/자동 수집 일시 중지/);assert.doesNotMatch(box.innerHTML,/자동 수집 정상/);
 data={...data,nickname_changes:[{game_id:'test-1',current_name:'현재닉',previous_name:'직전닉'}],changes:[{kind:'nickname',game_id:'test-1',before_json:'{\"name\":\"더오래된닉\"}',after_json:'{\"name\":\"직전닉\"}'}]};await focus();
 assert.match(box.innerHTML,/<th>현재 닉네임<\/th><th>직전 닉네임<\/th>/);
 assert.match(box.innerHTML,/현재닉/);assert.match(box.innerHTML,/직전닉/);assert.doesNotMatch(box.innerHTML,/더오래된닉/);
 console.log('PASS: collection/source times, error states and latest nickname pair are distinct');
})().catch(error=>{console.error(error);process.exitCode=1});
