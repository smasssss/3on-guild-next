"""Exercise the actual built VIP picker with synthetic persistent exclusions."""
from pathlib import Path
import importlib.util,json,subprocess
spec=importlib.util.spec_from_file_location('ops',Path(__file__).with_name('operations_regression.py'));ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
source=ops.function(Path('dist/client/legacy.html').read_text(),'renderVipResults')
harness="""
const assert=require('node:assert/strict');
const rows={innerHTML:''},search={value:''};
const document={getElementById:id=>id==='vipSearch'?search:rows,querySelectorAll:()=>[]};
const members=[{member_id:'excluded-test-id',name:'Old name',displayName:'Old name',power:100,level:20,rank:'R1'},{member_id:'eligible-test-id',name:'Eligible',displayName:'Eligible',power:90,level:21,rank:'R2'}];
const GROWTH={members},state={records:[{vip:'Old name'}],pointer:3,vipCarry:{Eligible:2},vipExcludedMembers:{'excluded-test-id':1}};
const vipTotalCount=n=>n==='Eligible'?2:1,carryConflict=()=>false,labelOfMember=m=>m.displayName,escapeLabel=n=>n,fmt=String;
const before=JSON.stringify(state);
"""+source+"""
renderVipResults();assert(!rows.innerHTML.includes('Old name'));assert(rows.innerHTML.includes('Eligible'));assert(rows.innerHTML.includes('VIP 2회'));
members[0].name=members[0].displayName='New name';renderVipResults();assert(!rows.innerHTML.includes('New name'));
search.value='New';renderVipResults();assert(!rows.innerHTML.includes('New name'));
search.value='';state.vipExcludedMembers=JSON.parse(JSON.stringify(state.vipExcludedMembers));renderVipResults();assert(!rows.innerHTML.includes('New name'));
assert.equal(JSON.stringify(state),before);assert.equal(GROWTH.members.length,2);
console.log('PASS: persisted member-ID exclusion survives rename/reload/search; growth roster and ride/VIP data unchanged');
"""
subprocess.run(['node','-e',harness],check=True)
