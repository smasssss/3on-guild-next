const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const html=fs.readFileSync('public/legacy.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'('),brace=html.indexOf('{',start);let depth=0,quote='',escape=false;for(let i=brace;i<html.length;i++){const c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if("'\"`".includes(c))quote=c;else if(c==='{')depth++;else if(c==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
const clone=x=>JSON.parse(JSON.stringify(x));
const base=['A','B','C'],members=base.concat(['D','E','F','G','H','I','J']).map((name,i)=>({name,displayName:name,member_id:'id'+i,observedToday:true}));
const record=(id,date,leader,type='base')=>({id,date,weekKey:'2026-10-19',leader,leaderCanonical:leader,type});
const initial={pointer:1,records:[record('old','2026-10-20','A')],vipCarry:{princess:1},vipResolution:{princess:1},vipExcludedMembers:{alt:1}};
let auth=true,confirmation=true,commitOK=true,commits=[];
const controls={};
function el(){return {children:[],value:'',className:'',disabled:false,append(...children){this.children.push(...children);if(this.tag==='select'&&!this.value&&children.length)this.value=children[0].value;},replaceChildren(){this.children=[];},setAttribute(k,v){this[k]=v;},set id(v){this._id=v;controls[v]=this;},get id(){return this._id;},set innerHTML(v){this._html=v;if(v.includes('beginRotationEdit'))controls.beginRotationEdit=el();}};}
controls.rotationEditorBody=el();
const ctx={state:clone(initial),baseRotation:base,GROWTH:{members},rotationDraft:null,sharedClone:clone,memberByLabel:n=>members.find(m=>m.name===n),canonicalOf:n=>n,currentLabel:n=>n,labelOfMember:m=>m.displayName,ensureAdmin:()=>auth,document:{getElementById:id=>controls[id],createElement:tag=>Object.assign(el(),{tag})},askConfirm:async()=>confirmation,commitOperations:async candidate=>{commits.push(clone(candidate));if(commitOK)ctx.state=clone(candidate);return commitOK;},renderAll(){},showNotice(){},leaderSelectionDirty:true,console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/carriage-rotation.js','utf8')+'\n'+fn('validateState')+'\n'+fn('pointerFromRecords')+'\n'+fn('nextBase')+'\n'+fn('nextBaseAfter'),ctx);
assert.equal(ctx.nextBase(),'B');assert.equal(ctx.nextBaseAfter(),'C');
const withoutB=ctx.rotationMembers().filter(e=>e.memberId!=='id1');
const changed=clone(ctx.rotationCandidate(withoutB));assert.equal(changed.pointer,1);assert.equal(changed.rotationMembers[1].name,'C');
for(const key of ['records','vipCarry','vipResolution','vipExcludedMembers'])assert.deepEqual(changed[key],initial[key]);
// Reorder retains the current person, rather than the old numeric index.
const reordered=clone(ctx.rotationCandidate([ctx.rotationMembers()[1],ctx.rotationMembers()[0],ctx.rotationMembers()[2]]));assert.equal(reordered.pointer,0);
ctx.state=changed;assert.equal(ctx.pointerFromRecords(changed.records),1);
const newer=changed.records.concat(record('new','2026-10-25','C'));assert.equal(ctx.pointerFromRecords(newer),0);
assert.equal(ctx.pointerFromRecords(newer.concat(record('manual','2026-10-26','A','insert'))),0);
assert.equal(ctx.pointerFromRecords(changed.records.map(r=>({...r,leader:'C',leaderCanonical:'C'}))),1,'Editing a pre-configuration ride must not reset the next turn');
assert.equal(ctx.pointerFromRecords(changed.records),1,'Deleting the new ride restores the configured turn');
members[2].name='Renamed C';assert.equal(ctx.nextBase(),'Renamed C');members[2].name='C';
assert.throws(()=>ctx.rotationCandidate([]));assert.throws(()=>ctx.rotationCandidate([withoutB[0],withoutB[0]]));
const many={...clone(initial),pointer:9,rotationMembers:members.map(m=>({memberId:m.member_id,name:m.name}))};ctx.validateState(many);
assert.throws(()=>ctx.validateState({...many,pointer:10}));assert.throws(()=>ctx.validateState({...many,rotationMembers:[]}));
const schemaModule={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/validate.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:schemaModule.exports,module:schemaModule});
schemaModule.exports.validate('carriage',many);schemaModule.exports.validate('carriage',clone(initial));
for(const invalid of [{...many,pointer:10},{...many,rotationMembers:[]},{...changed,rotationAnchor:{recordIds:[],nextMemberId:'missing'}},{...many,rotationMembers:[{memberId:'__proto__',name:'bad'}]}])assert.throws(()=>schemaModule.exports.validate('carriage',invalid));
// The actual editor handlers support add, move, exclude, cancel, denial and retry.
auth=false;ctx.beginRotationEdit();assert.equal(ctx.rotationDraft,null);auth=true;ctx.beginRotationEdit();
controls.rotationAddMember.value='id3';controls.rotationAdd.onclick();assert.equal(ctx.rotationDraft.length,3);
const row=controls.rotationEditorBody.children[0].children[2];row.children[1].children[0].onclick();assert.equal(ctx.rotationDraft[1].memberId,'id3');
const moved=controls.rotationEditorBody.children[0].children[1];moved.children[1].children[2].onclick();assert.equal(ctx.rotationDraft.length,2);
controls.rotationCancel.onclick();assert.equal(ctx.rotationDraft,null);assert.deepEqual(ctx.state,changed);
(async()=>{ctx.beginRotationEdit();confirmation=false;await ctx.saveRotation();assert.equal(commits.length,0);confirmation=true;commitOK=false;await ctx.saveRotation();assert(ctx.rotationDraft);assert.deepEqual(ctx.state,changed);commitOK=true;await ctx.saveRotation();assert.equal(ctx.rotationDraft,null);assert.deepEqual(ctx.state.records,initial.records);assert.deepEqual(ctx.state.vipExcludedMembers,initial.vipExcludedMembers);console.log('PASS: stable IDs, removal/reorder turn continuity, old/new rides, rename, 10-member server validation, editor actions, auth, cancel and failed-save retry');})().catch(e=>{console.error(e);process.exitCode=1;});
