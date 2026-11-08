/* Weekly scores are separate from operational records and growth data. */
const carriageVip={view:null,loading:null,hour:null,draft:null,error:''};
const vipReason={permanent:'영구 제외',rotation:'고정 마차장',membership:'현재 소속·동일인 확인 필요',score_low:'점수 미달',unavailable:'자료 확인 필요'};
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
function carriageEffectiveDate(w){return new Date(Date.parse(w.appliesOn)-86_400_000).toISOString().slice(0,10);}
function carriageWeekText(){
 const v=carriageVip.view;if(!v)return carriageVip.error||'마차 명단·주간 점수 확인 중';
 return `${v.scoreWeek||v.week} 주차 · ${v.active?`${v.active.appliesOn} 점수 기준 · VIP 제한 ${v.effectiveOn||carriageEffectiveDate(v.active)}부터${v.carriedForward?' · 새 자료 없음, 이전 점수·자격 유지':''} · 점수 갱신 ${carriageTime(v.active.updatedAt)}`:'첫 점수 적용 전 · 점수 없으면 점수 미달'} · 명단 관측 ${carriageTime(v.roster.sourceAsOf)}`;
}
function carriageInfo(label){
 const m=memberByLabel(label);if(!m)return '길드원 정보 미확인';const score=carriagePoints(m);
 return `${escapeLabel(m.rank||'등급 미확인')} · Lv.${m.level??'?'} · 주간 ${score===null?'미확인':fmt(score)+'점'}`;
}
// VIP queue (2026-11-05): 0 VIPs first (higher points first); then oldest last VIP first
// (count-only history without dates counts as oldest), fewer VIPs, higher points; memberId breaks ties.
function carriageVipHistory(m){
 const dates=state.records.filter(r=>vipRecordCanonical(r)===m.name).map(r=>r.date).sort();
 return {count:vipTotalCount(m.name),last:dates.length?dates[dates.length-1]:null};
}
function carriageVipOrder(a,b){
 const pa=carriagePoints(a.m)??0,pb=carriagePoints(b.m)??0,byId=String(a.m.member_id).localeCompare(String(b.m.member_id));
 if((a.count===0)!==(b.count===0))return a.count===0?-1:1;
 if(a.count===0)return pb-pa||byId;
 return String(a.last||'').localeCompare(String(b.last||''))||a.count-b.count||pb-pa||byId;
}
function carriageDaysAgo(d){if(!d)return '기록 날짜 없음';const today=new Date(Date.now()+9*3_600_000).toISOString().slice(0,10);const n=Math.round((Date.parse(today)-Date.parse(d))/86_400_000);return n<=0?'오늘':n+'일 전';}
function renderCarriageVipResults(){
 const q=(document.getElementById('vipSearch').value||'').toLowerCase();
 const all=carriageMembers().filter(m=>m.observedToday===true&&(m.name+' '+labelOfMember(m)).toLowerCase().includes(q)).map(m=>({m,...carriageVipHistory(m),status:carriageVipStatus(m)}));
 const arr=[...all.filter(x=>x.status.eligible).sort(carriageVipOrder),...all.filter(x=>!x.status.eligible).sort(carriageVipOrder)].slice(0,100);
 const top=arr.find(x=>x.status.eligible);
 // The picker shows only the member list; week/score/roster details are not shown (user request 2026-11-05).
 document.getElementById('vipResults').innerHTML=arr.map(x=>{
  const {m,count,last,status}=x,reason=vipReason[status.reason]||'',points=carriagePoints(m);
  return `<div class="viprow"><div class="vip-main"><b>${escapeLabel(labelOfMember(m))}</b>${x===top?' <span class="pill good">오늘 추천</span>':''}<br><span>길드전 ${points===null?'미확인':fmt(points)+'점'} · 누적 ${count}회 · 마지막 VIP ${count?carriageDaysAgo(last):'없음'}</span><br><span class="pill ${status.eligible?'good':'warn'}">${status.eligible?'대상':reason}</span></div><div class="vip-actions"><span class="vip-count ${count===0?'zero':''}">VIP ${count}회${carryConflict(m.name)?' · 확인 필요':''}</span><div class="vip-pick-buttons"><button class="smallbtn" data-leader="${escapeLabel(m.member_id)}">마차장</button><button class="smallbtn" data-vip="${escapeLabel(m.member_id)}" ${status.eligible?'':'disabled aria-disabled="true"'} title="${reason}">VIP</button></div></div></div>`;
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
 if(document.getElementById('vipWeeklyResults'))document.getElementById('vipWeeklyResults').textContent=weeklyResultsText(carriageVip.view);
 if(document.getElementById('vipWeeklyPending'))document.getElementById('vipWeeklyPending').textContent=carriageVip.view?.pending?`${carriageVip.view.pendingEffectiveOn||carriageEffectiveDate(carriageVip.view.pending)} VIP 적용 예정 · ${carriageVip.view.pending.rows.length}명 · 제공일 ${carriageVip.view.pending.providedOn}`:'다음 주 적용 예정 자료 없음';
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
  const current=carriageVip.view.members.filter(m=>m.current);
  const byId=new Map((carriageVip.view.scoreMembers||current).map(m=>[m.memberId,m]));
  if(!Array.isArray(input.rows)||!input.rows.length||!['full','partial'].includes(input.coverage))throw Error('전체/일부 여부와 점수 명단을 확인해 주세요.');
  const ids=new Set(),names=new Set();
  for(const row of input.rows){const m=byId.get(row.memberId);if(!m||m.nickname!==row.nickname||ids.has(row.memberId)||names.has(row.nickname)||!Number.isSafeInteger(row.points)||row.points<0||(!m.current&&(row.points!==0||row.participation!=='not_participated'||row.evidence!=='user_confirmation')))throw Error('회원 ID·정확한 닉네임·중복·점수 숫자를 확인해 주세요. 미확인 점수는 행을 제외하고 일부 명단으로 표시하세요.');ids.add(row.memberId);names.add(row.nickname);}
  if(input.coverage==='full'&&current.some(m=>!ids.has(m.memberId)))throw Error('전체 명단에 누락이 있습니다.');
  preview.textContent=`제공일 ${input.providedOn} → VIP 적용일 ${carriageEffectiveDate(input)} · 주차 ${input.appliesOn}\n${input.coverage==='full'?'전체':'일부'} ${ids.size}명 · 누락 ${current.filter(m=>!ids.has(m.memberId)).length}명(0점 처리 안 함)\n`+input.rows.map(r=>`${r.nickname}: ${fmt(r.points)}점${r.participation==='not_participated'?' · 미참여(관리자 확인)':''}`).join('\n');
  carriageVip.draft={snapshot:input,revision:carriageVip.view.revision,mutation:crypto.randomUUID()};save.disabled=false;
 }catch(e){preview.textContent=e.message;}
}
async function saveVipSnapshot(){
 if(!ensureAdmin()||!carriageVip.draft)return;
 const b=carriageVip.draft;
 if(!await askConfirm(`${carriageEffectiveDate(b.snapshot)}부터 적용할 주간 점수를 저장할까요? 일요일부터 이전 점수를 대체하며 VIP 누적 횟수는 유지됩니다.`))return;
 const button=document.getElementById('vipWeeklySave');button.disabled=true;
 try{await sharedRequest('/api/carriage/vip',{method:'POST',body:JSON.stringify(b)});carriageVip.draft=null;await refreshCarriageVip(true);document.getElementById('vipWeeklyPreview').textContent='주간 점수를 저장했습니다. 적용 주차는 서버 KST 기준입니다.';}
 catch(e){document.getElementById('vipWeeklyPreview').textContent=e.message;button.disabled=false;}
}
function weeklyResultsText(view){
 if(!view)return '주간 결과 확인 중';
 return [view.active,view.pending].filter(Boolean).map(w=>`제공일 ${w.providedOn} · VIP 적용 ${carriageEffectiveDate(w)} · 주차 ${w.appliesOn} · ${w.rows.length}명 · 미참여 ${w.rows.filter(r=>r.participation==='not_participated').length}명\n`+w.rows.slice().sort((a,b)=>b.points-a.points||a.nickname.localeCompare(b.nickname,'ko')).map(r=>`${r.nickname}: ${fmt(r.points)}점${r.participation==='not_participated'?' · 미참여(관리자 확인)':''}`).join('\n')).join('\n\n')||'저장된 주간 결과 없음';
}
function initCarriageVip(){
 const section=document.getElementById('settings');if(!section||document.getElementById('vipWeeklyPanel'))return;
 const panel=document.createElement('div');panel.className='card';panel.id='vipWeeklyPanel';
 panel.innerHTML='<h2>길드전 주간 포인트</h2><p class="sub" id="vipWeeklyStatus"></p><p class="sub" id="vipWeeklyPending"></p><details><summary>저장된 주간 결과 보기</summary><pre id="vipWeeklyResults" style="white-space:pre-wrap;max-height:360px;overflow:auto"></pre></details><p class="sub">토·일요일에 제공한 주간 자료는 해당 일요일부터 VIP 자격에 적용합니다. 주차 기준일은 기존 월요일을 유지합니다. 미관측 회원의 미참여는 관리자 확인 0점으로 별도 보존합니다. 새 자료가 없는 주에는 이전 점수와 자격을 유지합니다. 기준 21,720,000점 · 새 자료로 대체 · VIP 누적 횟수 유지. 새 자료에서 누락된 개인 점수는 미확인으로 남습니다.</p><div class="actions"><button type="button" class="btn ghost" id="vipWeeklyTemplate">입력 양식 받기</button><label class="btn ghost">JSON 자료 선택<input type="file" accept="application/json,.json" id="vipWeeklyFile" hidden></label><button type="button" class="btn primary" id="vipWeeklySave" disabled>검토한 점수 저장</button><button type="button" class="btn ghost" id="vipWeeklyReload">최신 자료 확인</button><button type="button" class="btn ghost" id="vipWeeklyBackup">점수 복구 사본 받기</button></div><pre id="vipWeeklyPreview" style="white-space:pre-wrap;max-height:320px;overflow:auto"></pre>';
 section.prepend(panel);document.getElementById('vipWeeklyTemplate').onclick=vipTemplate;document.getElementById('vipWeeklyFile').onchange=reviewVipSnapshot;document.getElementById('vipWeeklySave').onclick=saveVipSnapshot;document.getElementById('vipWeeklyReload').onclick=()=>refreshCarriageVip(true);
 document.getElementById('vipWeeklyBackup').onclick=async()=>{if(!ensureAdmin())return;try{downloadJSON(await sharedRequest('/api/carriage/vip?backups=1'),'3ON_주간점수_복구사본.json');}catch(e){showNotice(e.message);}};
 refreshCarriageVip();
}
// Resolve carriage names from the hourly projection without rewriting the growth iframe.
memberByCanonical=function(name){return carriageMembers().find(m=>m.name===name);};
memberByLabel=function(label){const can=VERIFIED_IDENTITIES[label]||aliases[label]||label;return memberByCanonical(can)||carriageMembers().find(m=>labelOfMember(m)===label);};
window.addEventListener('DOMContentLoaded',initCarriageVip);
/* Admin Settings: weekly guild-war points needed for VIP (carriage.vipThreshold; default 55,000,000). */
function renderVipThresholdSetting(){
 const page=document.getElementById('settings');if(!page)return;
 let card=document.getElementById('vipThresholdCard');
 if(!card){
  card=document.createElement('div');card.className='card';card.id='vipThresholdCard';
  card.innerHTML='<h2>VIP 기준 점수</h2><p class="sub">이번 주 길드전 포인트가 이 점수 이상이면 VIP 대상입니다.</p><div class="field"><label for="vipThresholdInput">기준 점수</label><input id="vipThresholdInput" inputmode="numeric" autocomplete="off"></div><div class="actions"><button class="btn primary" id="vipThresholdSave" type="button">기준 점수 저장</button></div>';
  page.appendChild(card);
  document.getElementById('vipThresholdSave').onclick=async()=>{
   if(!adminOK())return showNotice('관리자 인증 후 저장할 수 있습니다.');
   const n=Number(String(document.getElementById('vipThresholdInput').value).replace(/[^0-9]/g,''));
   if(!Number.isSafeInteger(n)||n<1)return showNotice('1 이상의 정수 점수를 입력해 주세요.');
   if(!await askConfirm('VIP 기준 점수를 '+fmt(n)+'점으로 저장할까요? 변경 전 자료는 자동 백업합니다.'))return;
   state.vipThreshold=n;await saveState();await refreshCarriageVip(true);renderVipThresholdSetting();showNotice('VIP 기준 점수를 '+fmt(n)+'점으로 저장했습니다.');
  };
 }
 const input=document.getElementById('vipThresholdInput');
 if(input&&document.activeElement!==input)input.value=fmt(state.vipThreshold||55000000);
}
window.addEventListener('DOMContentLoaded',()=>{renderVipThresholdSetting();document.querySelectorAll('[data-tab="settings"]').forEach(b=>b.addEventListener('click',renderVipThresholdSetting));});
