const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/legacy.html'),'utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert(start>=0);let p=html.indexOf('{',start),depth=1;for(let i=p+1;i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'&&!--depth)return html.slice(start,i+1);}throw Error('Missing function end: '+name);}
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',disabled:false,hidden:false,textContent:''});return elements.get(id);}
const sandbox={document:{getElementById:el,querySelectorAll:()=>[]},window:{scrollTo(){}},setTimeout:()=>{},history:{pushState(){}},escapeLabel:x=>x,sharedClone:x=>JSON.parse(JSON.stringify(x)),GROWTH:{members:[]},VERIFIED_IDENTITIES:{},CANYON_POWER_SEED:{weeks:[{date:'2026-10-08',members:[]}]}};
vm.createContext(sandbox);
const declarations="let canyonSelectedDate='',canyonDateManuallySelected=false,currentTab='growth'; const validTabs=['growth','canyon','carriage','history','settings']; const canyonStores={power:{data:{version:1,weeks:[]},error:''},memos:{data:{version:1,members:{}},error:''}}; const shared={docs:{}};";
vm.runInContext(declarations+['canyonValidDate','canyonValidate','canyonMemo','canyonDisplay','renderCanyon','sharedViewPower','sharedApply','activateTab'].map(fn).join('\n'),sandbox);
const member=(id,power)=>({id:'guild:'+id,nickname:id,displayName:id,power,rank:1});
function apply(weeks){sandbox.incoming={kind:'power',revision:1,data:{version:1,weeks}};vm.runInContext('sharedApply(incoming);renderCanyon()',sandbox);}
function selected(){return el('canyonWeek').value;}
const old={date:'2026-10-08',members:[member('old',100)]},latest={date:'2026-10-13',members:[member('latest',200)]},newest={date:'2026-10-14',members:[member('newest',300)]};
apply([old]);assert.equal(selected(),old.date);
apply([old,latest]);assert.equal(selected(),latest.date,'cold seed must advance when live data arrives');
vm.runInContext("canyonSelectedDate='2026-10-08';canyonDateManuallySelected=true;renderCanyon()",sandbox);
apply([latest,old,newest]);assert.equal(selected(),old.date,'manual history selection survives refresh');
vm.runInContext("activateTab('carriage');activateTab('canyon')",sandbox);assert.equal(selected(),newest.date,'opening canyon selects newest');
apply([old,latest]);assert.equal(selected(),latest.date,'default follows changed latest data');
vm.runInContext("canyonSelectedDate='2026-10-07';canyonDateManuallySelected=true;renderCanyon()",sandbox);assert.equal(selected(),latest.date,'removed selection falls back to newest');
vm.runInContext("canyonStores.power.data.weeks=[];renderCanyon()",sandbox);assert.equal(selected(),'');assert.equal(el('canyonWeek').disabled,true);
assert(html.includes('canyonDateManuallySelected=true;renderCanyon();'));
console.log('Canyon initial seed/cache, DB latest, manual history, re-entry and empty data: PASS');
