/* Shared rotation configuration; credentials and writes use the existing adapter. */
function rotationMembers(data=state){
  return data.rotationMembers||baseRotation.map(name=>({memberId:memberByLabel(name)?.member_id||'legacy:'+canonicalOf(name),name}));
}
function rotationNames(data=state){
  return data.rotationMembers?data.rotationMembers.map(e=>GROWTH.members.find(m=>m.member_id===e.memberId)?.name||e.name):baseRotation;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called by the existing legacy document
function validateRotation(data){
  const entries=data.rotationMembers;
  if(entries!==undefined){
    if(!Array.isArray(entries)||entries.length<1||entries.length>100)throw Error('기본 마차장은 1명부터 100명까지 지정해 주세요.');
    const ids=new Set(),names=new Set();
    for(const e of entries){if(!e||typeof e!=='object'||typeof e.memberId!=='string'||!e.memberId.trim()||e.memberId.length>200||typeof e.name!=='string'||!e.name.trim()||e.name.length>100||['__proto__','constructor','prototype'].includes(e.memberId)||ids.has(e.memberId)||names.has(e.name))throw Error('기본 마차장 명단의 중복·식별정보를 확인해 주세요.');ids.add(e.memberId);names.add(e.name);}
  }
  const a=data.rotationAnchor;
  if(a!==undefined&&(!entries||!a||typeof a!=='object'||!Array.isArray(a.recordIds)||a.recordIds.length>30000||a.recordIds.some(id=>typeof id!=='string'||id.length>200)||new Set(a.recordIds).size!==a.recordIds.length||!entries.some(e=>e.memberId===a.nextMemberId)))throw Error('로테이션 시작 기준을 확인해 주세요.');
}
function rotationAnchor(data,pointer){return {recordIds:data.records.map(r=>r.id),nextMemberId:data.rotationMembers[pointer].memberId};}
function rotationCandidate(entries){
  const candidate=sharedClone(state),old=rotationMembers(),ids=new Set(entries.map(e=>e.memberId));
  if(!entries.length)throw Error('기본 마차장은 최소 1명이 필요합니다.');
  const next=Array.from({length:old.length},(_,i)=>old[(state.pointer+i)%old.length]).find(e=>ids.has(e.memberId));
  candidate.rotationMembers=sharedClone(entries);
  candidate.pointer=Math.max(0,entries.findIndex(e=>e.memberId===next?.memberId));
  candidate.rotationAnchor=rotationAnchor(candidate,candidate.pointer);
  return validateState(candidate);
}
function beginRotationEdit(){if(!ensureAdmin())return;rotationDraft=sharedClone(rotationMembers());renderRotationEditor();}
function renderRotationEditor(){
  const box=document.getElementById('rotationEditorBody');if(!box)return;
  if(rotationDraft===null){box.innerHTML='<button class="btn ghost" id="beginRotationEdit" type="button">명단 편집</button>';document.getElementById('beginRotationEdit').onclick=beginRotationEdit;return;}
  box.replaceChildren();
  const list=document.createElement('ol');list.className='rotation-edit-list';box.append(list);
  rotationDraft.forEach((entry,index)=>{
    const row=document.createElement('li');row.className='rotation-edit-row';
    const label=document.createElement('strong');label.textContent=currentLabel(GROWTH.members.find(m=>m.member_id===entry.memberId)?.name||entry.name);row.append(label);
    const actions=document.createElement('div');actions.className='rotation-edit-actions';
    for(const [text,delta] of [['위로',-1],['아래로',1],['제외',0]]){
      const b=document.createElement('button');b.type='button';b.className='smallbtn';b.textContent=text;b.setAttribute('aria-label',label.textContent+' '+text);b.disabled=delta?index+delta<0||index+delta>=rotationDraft.length:rotationDraft.length===1;
      b.onclick=()=>{if(delta)[rotationDraft[index],rotationDraft[index+delta]]=[rotationDraft[index+delta],rotationDraft[index]];else rotationDraft.splice(index,1);renderRotationEditor();};actions.append(b);
    }
    row.append(actions);list.append(row);
  });
  const field=document.createElement('div');field.className='field';const label=document.createElement('label');label.htmlFor='rotationAddMember';label.textContent='추가할 길드원';const select=document.createElement('select');select.id='rotationAddMember';
  const existing=new Set(rotationDraft.map(e=>e.memberId));
  const available=(typeof carriageMembers==='function'?carriageMembers():GROWTH.members).filter(m=>m.observedToday!==false&&m.member_id&&!existing.has(m.member_id)).sort((a,b)=>labelOfMember(a).localeCompare(labelOfMember(b),'ko'));
  for(const m of available){const option=document.createElement('option');option.value=m.member_id;option.textContent=labelOfMember(m);select.append(option);}
  field.append(label,select);box.append(field);
  const actions=document.createElement('div');actions.className='actions';box.append(actions);
  for(const [id,text,cls] of [['rotationAdd','명단에 추가','ghost'],['rotationSave','변경사항 저장','primary'],['rotationCancel','편집 취소','ghost']]){const b=document.createElement('button');b.id=id;b.type='button';b.className='btn '+cls;b.textContent=text;actions.append(b);}
  document.getElementById('rotationAdd').disabled=!available.length;
  document.getElementById('rotationAdd').onclick=()=>{const m=available.find(m=>m.member_id===select.value);if(m){rotationDraft.push({memberId:m.member_id,name:m.name});renderRotationEditor();}};
  document.getElementById('rotationCancel').onclick=()=>{rotationDraft=null;renderRotationEditor();};
  document.getElementById('rotationSave').onclick=saveRotation;
}
async function saveRotation(){
  if(!ensureAdmin()||rotationDraft===null)return;
  try{
    const candidate=rotationCandidate(rotationDraft),next=rotationNames(candidate)[candidate.pointer];
    if(!await askConfirm('기본 마차장 '+candidate.rotationMembers.length+'명으로 저장할까요? 다음 차례: '+currentLabel(next)+'. 기존 운행기록과 VIP 횟수는 유지됩니다.'))return;
    if(await commitOperations(rotationCandidate(rotationDraft))){rotationDraft=null;leaderSelectionDirty=false;renderAll();showNotice('기본 마차장 명단과 순서를 저장했습니다.');}
  }catch(e){showNotice(e.message);}
}
