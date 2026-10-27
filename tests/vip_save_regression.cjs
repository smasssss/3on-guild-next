/* eslint-disable @typescript-eslint/no-require-imports -- Node regression harness. */
// Catches history loss when a restricted/unknown-score VIP cannot be reselected for a memo edit.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/legacy.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'('),brace=html.indexOf('{',start);let depth=0,quote='',escape=false;for(let i=brace;i<html.length;i++){const c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if("'\"`".includes(c))quote=c;else if(c==='{')depth++;else if(c==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
const old={id:'old',date:'2026-10-27',weekKey:'2026-10-26',type:'base',leader:'Leader',vip:'Old VIP',vipCanonical:'Stable VIP',vipMemberId:'old-id',vipSnapshot:{level:20,power:123},createdAt:100};
const data={records:[old],pointer:0,vipCarry:{'공 주':1,Other:999},vipExcludedMembers:{'old-id':1}};
const nodes=new Proxy({runDate:{value:'2026-10-27'},leaderSelect:{value:'Leader'},memo:{value:'memo correction'},savePreview:{innerHTML:''}},{get:(o,id)=>o[id]||(o[id]={value:'',addEventListener(){}})});
let saved;const ctx={Date,Math,JSON,state:structuredClone(data),selectedVip:'',selectedVipCanonical:'',mode:'base',leaderSelectionDirty:false,document:{getElementById:id=>nodes[id]},window:{addEventListener(){}},ensureAdmin:()=>true,iso:d=>d.toISOString().slice(0,10),parseISO:s=>new Date(s),weekKey:()=> '2026-10-26',rotationNames:()=>['Leader'],memberByLabel:n=>({member_id:n==='New VIP'?'new-id':'old-id',observedToday:true}),recordForDate:()=>old,askConfirm:async()=>true,canonicalOf:n=>n,snapshot:()=>({level:30,power:999}),pointerFromRecords:()=>0,commitOperations:async x=>{saved=x;return true},renderAll(){},renderPreview(){},nextBase:()=> 'Leader',showNotice(){},closeVipPicker(){}};
vm.createContext(ctx);vm.runInContext(fn('bindProduction'),ctx);ctx.bindProduction();
(async()=>{
 await nodes.saveRun.onclick();assert.equal(saved.records[0].vip,'Old VIP');assert.equal(saved.records[0].vipCanonical,'Stable VIP');assert.equal(saved.records[0].vipMemberId,'old-id');assert.deepEqual(JSON.parse(JSON.stringify(saved.records[0].vipSnapshot)),old.vipSnapshot);assert.deepEqual(JSON.parse(JSON.stringify(saved.vipCarry)),data.vipCarry);assert.equal(saved.records[0].memo,'memo correction');
 ctx.selectedVip=ctx.selectedVipCanonical='New VIP';await nodes.saveRun.onclick();assert.equal(saved.records[0].vip,'New VIP');assert.equal(saved.records[0].vipMemberId,'new-id');
 console.log('PASS: actual save handler preserves historical VIP identity/snapshot/counts for memo edits; explicit new selection replaces VIP');
})().catch(e=>{console.error(e);process.exitCode=1});
