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
