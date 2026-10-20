const assert=require('node:assert/strict'),fs=require('node:fs'),{runInNewContext}=require('node:vm');
const controls={};
function element(){return {style:{},hidden:false,value:'',attributes:{},setAttribute(k,v){this.attributes[k]=v},insertAdjacentElement(){},querySelector(s){return controls[s]??=element()},set innerHTML(v){this.html=v;const option=v.match(/<option value="(\d+)"/);if(option)this.value=option[1]},get innerHTML(){return this.html}}}
const date=element();date.value='2026-10-20';let preview=date.value,changes=0;
date.dispatchEvent=e=>{if(e.type==='change'){preview=date.value;changes++}};
const document={getElementById:id=>id==='runDate'?date:null,createElement:()=>element()};
let button,panel;date.insertAdjacentElement=(_,e)=>{button=e;button.insertAdjacentElement=(_,p)=>{panel=p}};
runInNewContext(fs.readFileSync('public/carriage-date.js','utf8'),{document,Event:class{constructor(type){this.type=type}},Intl,Date,fetch(){throw Error('Date selection must not call an API')},localStorage:{setItem(){throw Error('Date selection must not save data')}}});
const y=controls['#runDateYear'],m=controls['#runDateMonth'],d=controls['#runDateDay'],apply=controls['#applyRunDate'],cancel=controls['#cancelRunDate'];
button.onclick();assert(!panel.hidden);assert.equal(y.value,'2026');assert.equal(m.value,'10');assert.equal(d.value,'20');
d.value='19';apply.onclick();assert.equal(date.value,'2026-10-19');assert.equal(preview,date.value);assert(panel.hidden);assert.equal(changes,1);
button.onclick();y.value='2024';m.value='2';m.onchange();assert(m.value==='2'&&d.innerHTML.includes('value="29"'));d.value='29';apply.onclick();assert.equal(date.value,'2024-02-29');
button.onclick();y.value='2026';y.onchange();assert.equal(d.value,'28');assert(!d.innerHTML.includes('value="29"'));apply.onclick();assert.equal(date.value,'2026-02-28');
button.onclick();y.value='2027';m.value='1';m.onchange();d.value='1';apply.onclick();assert.equal(date.value,'2027-01-01');
button.onclick();d.value='2';cancel.onclick();assert.equal(date.value,'2027-01-01');assert(panel.hidden);
button.onclick();y.value='invalid';apply.onclick();assert.equal(date.value,'2027-01-01');assert(!panel.hidden);assert(controls['#runDateError'].textContent);
console.log('PASS: carriage date choice, preview, leap day, month/year boundaries, cancel and no persistence');
