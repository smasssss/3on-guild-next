/* Weekly scores are separate from operational records and growth data. */
const carriageVip={view:null,loading:null,hour:null,draft:null,error:''};
const vipReason={permanent:'영구 VIP 제외',membership:'현재 소속·동일인 확인 필요',temporary:'이번 주 임시 제한',week_missing:'이번 주 자료 미제공',score_missing:'주간 점수 미확인',score_low:'21,720,000점 미만',unavailable:'자료 확인 필요'};
function carriageMembers(){
 const all=new Map([...(GROWTH.archivedMembers||[]),...GROWTH.members].map(m=>[m.member_id,{...m,observedToday:false}]));
 for(const r of carriageVip.view?.members||[]){const before=all.get(r.memberId);all.set(r.memberId,{...before,member_id:r.memberId,name:before?.name||r.canonical,displayName:r.nickname,rank:r.rank,level:r.level,observedToday:r.current});}
 return [...all.values()];
}
function carriageVipStatus(m){
 if(state.vipExcludedMembers?.[m?.member_id]===1)return {eligible:false,reason:'permanent'};
 return carriageVip.view?.members.find(r=>r.memberId===m?.member_id)?.eligibility||{eligible:false,reason:'unavailable'};
}
function carriagePoints(m){return carriageVip.view?.active?.rows.find(r=>r.memberId===m?.member_id)?.points??null;}
function carriageTime(value){return value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST':'미확인';}
function carriageWeekText(){
 const v=carriageVip.view;if(!v)return carriageVip.error||'마차 명단·주간 점수 확인 중';
 return `${v.week} 주차 · ${v.active?'점수 갱신 '+carriageTime(v.active.updatedAt):v.week<'2026-11-02'?'주간 점수 기준 11/2 시작':'이번 주 자료 미제공'} · 명단 관측 ${carriageTime(v.roster.sourceAsOf)}`;
}
function carriageInfo(label){
 const m=memberByLabel(label);if(!m)return '길드원 정보 미확인';const score=carriagePoints(m);
 return `${escapeLabel(m.rank||'등급 미확인')} · Lv.${m.level??'?'} · 주간 ${score===null?'미확인':fmt(score)+'점'}`;
}
function renderCarriageVipResults(){
 const q=(document.getElementById('vipSearch').value||'').toLowerCase();
 const arr=carriageMembers().filter(m=>m.observedToday===true&&state.vipExcludedMembers?.[m.member_id]!==1&&(m.name+' '+labelOfMember(m)).toLowerCase().includes(q)).map(m=>({m,count:vipTotalCount(m.name)})).sort((a,b)=>a.count-b.count||(b.m.level||0)-(a.m.level||0)||(carriagePoints(b.m)??-1)-(carriagePoints(a.m)??-1)||labelOfMember(a.m).localeCompare(labelOfMember(b.m),'ko')).slice(0,100);
 document.getElementById('vipResults').innerHTML=`<div class="sub" role="status">${escapeLabel(carriageWeekText())}</div>`+arr.map(({m,count})=>{
  const status=carriageVipStatus(m),reason=vipReason[status.reason]||'';
  return `<div class="viprow"><div class="vip-main"><b>${escapeLabel(labelOfMember(m))}</b><br><span>${carriageInfo(m.name)}</span>${!status.eligible?'<br><span class="pill warn">'+reason+'</span>':''}</div><div class="vip-actions"><span class="vip-count ${count===0?'zero':''}">VIP ${count}회${carryConflict(m.name)?' · 확인 필요':''}</span><div class="vip-pick-buttons"><button class="smallbtn" data-leader="${escapeLabel(m.member_id)}">마차장</button><button class="smallbtn" data-vip="${escapeLabel(m.member_id)}" ${status.eligible?'':'disabled aria-disabled="true"'} title="${reason}">VIP</button></div></div></div>`;
 }).join('')+(arr.length?'':'<p class="sub">현재 선택 가능한 명단이 없습니다. 자동수집 명단·연결 상태를 확인해 주세요.</p>');
 document.querySelectorAll('[data-leader]').forEach(b=>b.onclick=()=>{const m=carriageMembers().find(m=>m.member_id===b.dataset.leader&&m.observedToday);if(!m)return;mode='insert';leaderSelectionDirty=true;renderForm();document.getElementById('leaderSelect').value=m.name;renderPreview();});
 document.querySelectorAll('[data-vip]').forEach(b=>b.onclick=()=>{const m=carriageMembers().find(m=>m.member_id===b.dataset.vip);if(!m||!carriageVipStatus(m).eligible)return;selectedVip=labelOfMember(m);selectedVipCanonical=m.name;document.getElementById('vipModal').classList.remove('show');renderForm();});
}
async function refreshCarriageVip(force=false){
 const hour=Math.floor(Date.now()/3_600_000);
 if(carriageVip.loading)return carriageVip.loading;
 if(!force&&carriageVip.hour===hour&&carriageVip.view)return;
 carriageVip.loading=(async()=>{try{
  const r=await sharedRequest('/api/carriage/vip');if(r.schema!=='3on-vip-weekly-v1'||!Array.isArray(r.members))throw Error('마차 자료 형식 오류');
  carriageVip.view=r;carriageVip.hour=hour;carriageVip.error='';
 }catch(e){carriageVip.view=null;carriageVip.error='마차 자료 연결 실패 · '+e.message+' · VIP 선택 보류';}
 finally{carriageVip.loading=null;}
 if(document.getElementById('vipWeeklyStatus'))document.getElementById('vipWeeklyStatus').textContent=carriageWeekText();
 if(document.getElementById('vipWeeklyPending'))document.getElementById('vipWeeklyPending').textContent=carriageVip.view?.pending?`${carriageVip.view.pending.appliesOn} 적용 예정 · ${carriageVip.view.pending.rows.length}명 · 제공일 ${carriageVip.view.pending.providedOn}`:'다음 주 적용 예정 자료 없음';
 if(document.getElementById('vipSearch'))renderCarriageVipResults();
 })();return carriageVip.loading;
}
function vipTemplate(){
 if(!ensureAdmin())return;
 const now=new Date(Date.now()+9*3_600_000),day=now.getUTCDay();now.setUTCDate(now.getUTCDate()-((day+1)%7));
 const providedOn=now.toISOString().slice(0,10),appliesOn=new Date(now.getTime()+2*86_400_000).toISOString().slice(0,10);
 downloadJSON({providedOn,appliesOn,coverage:'partial',rows:(carriageVip.view?.members||[]).filter(m=>m.current).map(m=>({memberId:m.memberId,nickname:m.nickname,points:null}))},'3ON_주간점수_입력양식.json');
}
async function reviewVipSnapshot(event){
 carriageVip.draft=null;const save=document.getElementById('vipWeeklySave');save.disabled=true;
 const file=event.target.files[0];if(!file)return;if(!ensureAdmin())return;
 const preview=document.getElementById('vipWeeklyPreview');
 try{
  if(file.size>250000)throw Error('250KB 이하 JSON 파일을 선택해 주세요.');
  const input=JSON.parse(await file.text());
  await refreshCarriageVip(true);if(!carriageVip.view)throw Error('현재 명단을 확인할 수 없습니다.');
  const byId=new Map(carriageVip.view.members.filter(m=>m.current).map(m=>[m.memberId,m]));
  if(!Array.isArray(input.rows)||!input.rows.length||!['full','partial'].includes(input.coverage))throw Error('전체/일부 여부와 점수 명단을 확인해 주세요.');
  const ids=new Set(),names=new Set();
  for(const row of input.rows){const m=byId.get(row.memberId);if(!m||m.nickname!==row.nickname||ids.has(row.memberId)||names.has(row.nickname)||!Number.isSafeInteger(row.points)||row.points<0)throw Error('회원 ID·정확한 닉네임·중복·점수 숫자를 확인해 주세요. 미확인 점수는 행을 제외하고 일부 명단으로 표시하세요.');ids.add(row.memberId);names.add(row.nickname);}
  if(input.coverage==='full'&&ids.size!==byId.size)throw Error('전체 명단에 누락이 있습니다.');
  preview.textContent=`제공일 ${input.providedOn} → 적용일 ${input.appliesOn}\n${input.coverage==='full'?'전체':'일부'} ${ids.size}명 · 누락 ${byId.size-ids.size}명(0점 처리 안 함)\n`+input.rows.map(r=>`${r.nickname}: ${fmt(r.points)}점`).join('\n');
  carriageVip.draft={snapshot:input,revision:carriageVip.view.revision,mutation:crypto.randomUUID()};save.disabled=false;
 }catch(e){preview.textContent=e.message;}
}
async function saveVipSnapshot(){
 if(!ensureAdmin()||!carriageVip.draft)return;
 const b=carriageVip.draft;
 if(!await askConfirm(`${b.snapshot.appliesOn} 주간 점수를 저장할까요? 월요일부터 이전 점수를 대체하며 VIP 누적 횟수는 유지됩니다.`))return;
 const button=document.getElementById('vipWeeklySave');button.disabled=true;
 try{await sharedRequest('/api/carriage/vip',{method:'POST',body:JSON.stringify(b)});carriageVip.draft=null;await refreshCarriageVip(true);document.getElementById('vipWeeklyPreview').textContent='주간 점수를 저장했습니다. 적용 주차는 서버 KST 기준입니다.';}
 catch(e){document.getElementById('vipWeeklyPreview').textContent=e.message;button.disabled=false;}
}
function initCarriageVip(){
 const section=document.getElementById('settings');if(!section||document.getElementById('vipWeeklyPanel'))return;
 const panel=document.createElement('div');panel.className='card';panel.id='vipWeeklyPanel';
 panel.innerHTML='<h2>길드전 주간 포인트</h2><p class="sub" id="vipWeeklyStatus"></p><p class="sub" id="vipWeeklyPending"></p><p class="sub">토요일 스냅샷을 JSON으로 검토해 다음 월요일에 적용합니다. 기준 21,720,000점 · 이전 점수 대체 · VIP 누적 횟수 유지. 누락 점수는 미확인으로 남습니다.</p><div class="actions"><button type="button" class="btn ghost" id="vipWeeklyTemplate">입력 양식 받기</button><label class="btn ghost">JSON 자료 선택<input type="file" accept="application/json,.json" id="vipWeeklyFile" hidden></label><button type="button" class="btn primary" id="vipWeeklySave" disabled>검토한 점수 저장</button><button type="button" class="btn ghost" id="vipWeeklyReload">최신 자료 확인</button><button type="button" class="btn ghost" id="vipWeeklyBackup">점수 복구 사본 받기</button></div><pre id="vipWeeklyPreview" style="white-space:pre-wrap;max-height:320px;overflow:auto"></pre>';
 section.prepend(panel);document.getElementById('vipWeeklyTemplate').onclick=vipTemplate;document.getElementById('vipWeeklyFile').onchange=reviewVipSnapshot;document.getElementById('vipWeeklySave').onclick=saveVipSnapshot;document.getElementById('vipWeeklyReload').onclick=()=>refreshCarriageVip(true);
 document.getElementById('vipWeeklyBackup').onclick=async()=>{if(!ensureAdmin())return;try{downloadJSON(await sharedRequest('/api/carriage/vip?backups=1'),'3ON_주간점수_복구사본.json');}catch(e){showNotice(e.message);}};
 refreshCarriageVip();
}
// Resolve carriage names from the hourly projection without rewriting the growth iframe.
memberByCanonical=function(name){return carriageMembers().find(m=>m.name===name);};
memberByLabel=function(label){const can=VERIFIED_IDENTITIES[label]||aliases[label]||label;return memberByCanonical(can)||carriageMembers().find(m=>labelOfMember(m)===label);};
window.addEventListener('DOMContentLoaded',initCarriageVip);
