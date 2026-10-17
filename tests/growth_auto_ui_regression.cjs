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
