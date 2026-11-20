// 국가원정 탭 (2026-11-20 사용자 결정): 295서버 길드의 국가원정 전투력 손실, 처치 수, 두 자료를 묶은 통계.
// 자료는 매시간 수집이 lastasylum.gg에서 자동으로 남깁니다(/api/kvk, 읽기 전용).
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=n=>Number(n||0).toLocaleString('ko-KR');
 const big=n=>{const a=Math.abs(n),s=n<0?'-':'';return a>=1e9?s+(a/1e9).toFixed(2)+'B':a>=1e6?s+(a/1e6).toFixed(1)+'M':s+num(a);};
 const when=ms=>ms?new Date(ms).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'-';
 const dayText=d=>{const [,m,dd]=d.split('-').map(Number);return m+'월 '+dd+'일(토)';};
 const fallKst=t=>{if(!t)return '';const [h,m]=t.split(':').map(Number);const k=(h+9)%24;return (h+9>=24?'일 ':'토 ')+String(k).padStart(2,'0')+':'+String(m).padStart(2,'0');};
 const RESULT={taken:'함락(점령)',held:'방어됨(점령 실패)',none:'미참가'};
 let data=null,view='loss',week=null;

 function name(id){
  const r=data.alliances[id];if(!r)return esc(id);
  const old=r.history.slice(0,-1).map(h=>'['+h.tag+'] '+h.name);
  return '<b>['+esc(r.tag)+']</b> '+esc(r.name)+(old.length?' <span class="kvk-old" title="이전 이름">('+esc(old.join(', '))+')</span>':'');
 }
 const isUs=id=>id==='50373046';
 function table(head,rows){return '<div class="kvk-scroll"><table class="kvk-table"><thead><tr>'+head.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}
 const tr=(id,cells)=>'<tr'+(isUs(id)?' class="kvk-us"':'')+'>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';

 function weekGain(w){
  if(!w?.killsBefore||!w?.killsAfter)return null;
  const before=new Map(w.killsBefore.rows.map(r=>[r.id,r.kills]));
  return w.killsAfter.rows.filter(r=>before.has(r.id)).map(r=>({id:r.id,gain:r.kills-before.get(r.id)}));
 }
 // 한 주의 길드별 몫: 처치 기여도·손실 기여도(295서버 전체 대비 %)와 그 평균(기여 점수)
 function shares(w){
  const gain=weekGain(w),loss=w?.loss?.rows||[];
  const g=new Map((gain||[]).filter(r=>r.gain>0).map(r=>[r.id,r.gain])),l=new Map(loss.filter(r=>r.loss<0).map(r=>[r.id,r]));
  const gTotal=[...g.values()].reduce((s,v)=>s+v,0),lTotal=[...l.values()].reduce((s,r)=>s-r.loss,0);
  return [...new Set([...g.keys(),...l.keys()])].map(id=>{
   const k=gain?(g.get(id)??0):null,x=l.get(id)||null;
   const kShare=gain&&gTotal?100*(k||0)/gTotal:null,lShare=loss.length&&lTotal?100*(x?-x.loss:0)/lTotal:null;
   const parts=[kShare,lShare].filter(v=>v!=null);
   return {id,k,x,kShare,lShare,score:parts.length?parts.reduce((s,v)=>s+v,0)/parts.length:0,eff:k&&x?k/(-x.loss/1e6):null};
  }).sort((a,b)=>b.score-a.score);
 }
 function summary(w){
  if(!w)return '<p class="sub">이 주 기록이 없습니다.</p>';
  const parts=[RESULT[w.result]||'결과 확인 전'];
  if(w.target)parts.push('#295 → #'+w.target);if(w.fallUtc)parts.push('함락 '+fallKst(w.fallUtc));
  if(w.stale)parts.push('⚠ 일요일 낮 12시까지 자료가 다 올라오지 않았습니다');
  return '<p class="kvk-result">'+parts.map(esc).join(' · ')+'</p>';
 }

 function renderLoss(w){
  if(!w?.loss)return summary(w)+'<p class="sub">'+(w?.result==='none'?'미참가한 주라 손실 기록이 없습니다.':w?.lossMissing?'이 주 손실표는 사이트에서 더 이상 볼 수 없어 기록하지 못했습니다.':'손실 기록이 아직 없습니다.')+'</p>';
  const rows=w.loss.rows.slice().sort((a,b)=>a.loss-b.loss),total=rows.reduce((s,r)=>s+r.loss,0);
  return summary(w)+'<p class="sub">전투 시작(토 23시) 전과 끝난 뒤 첫 갱신 때의 길드 전투력 차이입니다. 그 사이 일반 성장도 섞여 실제 손실은 조금 더 큽니다. 숫자는 사이트에 반올림되어 나온 값입니다. 기록 '+when(w.loss.at)+'</p>'
   +table(['#','길드','전투력 손실','손실률','이전','이후'],rows.map((r,i)=>tr(r.id,[i+1,name(r.id),big(r.loss),r.pct.toFixed(1)+'%',big(r.before),big(r.after)])))
   +'<p class="kvk-total">295서버 합계 손실 <b>'+big(total)+'</b> · 길드 '+rows.length+'개</p>';
 }
 function renderKills(w){
  let html='';
  const gain=weekGain(w);
  html+='<h3>이번 국가원정 처치 증가</h3>'+summary(w);
  if(gain)html+='<p class="sub">토요일 22시('+when(w.killsBefore.at)+')와 국가원정 뒤('+when(w.killsAfter.at)+') 누적 처치 수의 차이입니다.</p>'+table(['#','길드','처치 증가'],gain.sort((a,b)=>b.gain-a.gain).map((r,i)=>tr(r.id,[i+1,name(r.id),num(r.gain)])));
  else html+='<p class="sub">'+(w?.result==='none'?'미참가한 주입니다.':'국가원정 전(토 22시)과 뒤의 처치 수가 모두 있어야 계산됩니다. 처치 수 기록은 2026년 11월 21일(토)부터 쌓입니다.')+'</p>';
  const latest=data.killsLatest;
  html+='<h3>누적 처치 수 (가장 최근 기록)</h3>';
  html+=latest?'<p class="sub">기록 '+when(latest.at)+'</p>'+table(['#','길드','누적 처치'],latest.rows.map((r,i)=>tr(r.id,[i+1,name(r.id),num(r.kills)]))):'<p class="sub">아직 기록이 없습니다.</p>';
  return html;
 }
 function renderStats(w){
  let html='<h3>길드별 국가원정 성적</h3>'+summary(w);
  const gain=weekGain(w),loss=w?.loss?.rows||[];
  if(!gain&&!loss.length)html+='<p class="sub">이 주는 손실·처치 기록이 없어 통계를 낼 수 없습니다.</p>';
  else{
   const rows=shares(w);
   html+='<p class="sub"><b>기여 점수</b> = (처치 기여도 + 손실 기여도) ÷ 2. 처치 기여도는 295서버 전체 처치 증가 중 그 길드 몫, 손실 기여도는 295서버 전체 전투력 손실 중 그 길드 몫입니다. 많이 잡은 길드와 많이 희생한 길드를 똑같이 쳐 줍니다. 한쪽 자료만 있는 주는 있는 쪽만으로 계산합니다. 효율 = 잃은 전투력 100만당 처치 수(참고용).'+(gain?'':' 이 주는 처치 증가 기록이 없어 손실 기여도만 반영됩니다.')+'</p>'
    +table(['#','길드','기여 점수','처치 증가','처치 기여도','전투력 손실','손실률','손실 기여도','효율'],rows.map((r,i)=>tr(r.id,[i+1,name(r.id),'<b>'+r.score.toFixed(1)+'</b>',r.k==null?'-':num(r.k),r.kShare==null?'-':r.kShare.toFixed(1)+'%',r.x?big(r.x.loss):'-',r.x?r.x.pct.toFixed(1)+'%':'-',r.lShare==null?'-':r.lShare.toFixed(1)+'%',r.eff==null?'-':num(Math.round(r.eff))])));
  }
  // 누적 기여: 기록이 있는 모든 국가원정 주
  const fought=Object.keys(data.weeks).filter(k=>{const x=data.weeks[k];return (x.result==='taken'||x.result==='held')&&(x.loss||weekGain(x));}).sort();
  if(fought.length){
   const acc=new Map();
   for(const k of fought)for(const r of shares(data.weeks[k])){const a=acc.get(r.id)||{id:r.id,weeks:0,score:0,k:0,kSeen:false,loss:0};a.weeks++;a.score+=r.score;if(r.k!=null){a.k+=r.k;a.kSeen=true;}if(r.x)a.loss+=r.x.loss;acc.set(r.id,a);}
   const list=[...acc.values()].map(a=>({...a,avg:a.score/fought.length})).sort((a,b)=>b.avg-a.avg);
   html+='<h3>누적 기여 (국가원정 '+fought.length+'회: '+fought.map(dayText).join(', ')+')</h3><p class="sub">평균 기여 점수 = 주마다의 기여 점수 합 ÷ 국가원정 횟수. 참여하지 않은 주는 0점으로 칩니다. 도시 배분처럼 길드 사이 비교에 쓰기 좋은 기준입니다.</p>'
    +table(['#','길드','평균 기여 점수','기록된 주','누적 처치 증가','누적 전투력 손실'],list.map((a,i)=>tr(a.id,[i+1,name(a.id),'<b>'+a.avg.toFixed(1)+'</b>',a.weeks+'/'+fought.length,a.kSeen?num(a.k):'-',a.loss?big(a.loss):'-'])));
  }
  // 주차별 추이: 서버 합계와 3ON
  const weeks=Object.keys(data.weeks).filter(k=>data.weeks[k].result).sort().reverse();
  html+='<h3>주차별 추이</h3>'+table(['주차','결과','295 전체 손실','3ON 손실','3ON 손실률','3ON 처치 증가','3ON 효율'],weeks.map(k=>{
   const x=data.weeks[k],us=x.loss?.rows.find(r=>isUs(r.id)),gk=weekGain(x)?.find(r=>isUs(r.id))?.gain;
   const total=x.loss?x.loss.rows.reduce((s,r)=>s+r.loss,0):null;
   return '<tr><td>'+dayText(k)+'</td><td>'+esc(RESULT[x.result]||'-')+(x.fallUtc?' '+fallKst(x.fallUtc):'')+'</td><td>'+(total==null?'-':big(total))+'</td><td>'+(us?big(us.loss):'-')+'</td><td>'+(us?us.pct.toFixed(1)+'%':'-')+'</td><td>'+(gk==null?'-':num(gk))+'</td><td>'+(gk!=null&&us&&us.loss<0?num(Math.round(gk/(-us.loss/1e6))):'-')+'</td></tr>';
  }));
  // 길드 변동: 새 길드, 이름 변경, 목록에서 사라진 길드
  // '새로 보임'은 처치 순위를 처음 기록한 뒤에 처음 나타난 길드만(지난 손실표에서 처음 본 길드는 새 길드가 아님)
  const latestAt=data.killsLatest?.at||0,changes=[],firstKills=Math.min(...Object.values(data.weeks).flatMap(x=>[x.killsBefore?.at,x.killsAfter?.at]).filter(Boolean),latestAt||Infinity);
  for(const [id,r] of Object.entries(data.alliances)){
   if(r.history.length>1)changes.push(name(id)+' · 이름 변경 '+when(r.history[r.history.length-1].at));
   if(latestAt&&r.lastSeen<latestAt)changes.push(name(id)+' · 처치 순위 목록에서 사라짐(마지막 확인 '+when(r.lastSeen)+')');
   if(Number.isFinite(firstKills)&&r.firstSeen>firstKills)changes.push(name(id)+' · 새로 보임 '+when(r.firstSeen));
  }
  html+='<h3>길드 변동</h3>'+(changes.length?'<ul class="kvk-changes">'+changes.map(c=>'<li>'+c+'</li>').join('')+'</ul>':'<p class="sub">아직 바뀐 길드가 없습니다.</p>');
  return html;
 }
 function render(){
  const page=$('kvk');if(!page)return;
  if(!data){page.innerHTML='<div class="card"><h2>국가원정</h2><p class="sub">기록을 불러오는 중입니다.</p></div>';return;}
  if(data.error){page.innerHTML='<div class="card"><h2>국가원정</h2><p class="sub">'+esc(data.error)+'</p></div>';return;}
  const weeks=Object.keys(data.weeks).sort().reverse();if(!week||!data.weeks[week])week=weeks.find(k=>data.weeks[k].loss)||weeks[0]||null;
  const w=week?data.weeks[week]:null;
  page.innerHTML='<div class="card"><h2>국가원정 (295서버)</h2><p class="sub">매주 토요일 23시~일요일 새벽. 295서버 길드만 기록합니다. 자료: lastasylum.gg, 매시간 자동 기록.'+(data.lastError?' ⚠ 마지막 수집 실패 '+when(data.lastError.at):'')+'</p>'
   +'<div class="kvk-bar"><label for="kvkWeek">주차</label><select id="kvkWeek">'+(weeks.length?weeks.map(k=>'<option value="'+k+'"'+(k===week?' selected':'')+'>'+dayText(k)+' · '+esc(RESULT[data.weeks[k].result]||'결과 확인 전')+'</option>').join(''):'<option>기록 없음</option>')+'</select></div>'
   +'<div class="kvk-tabs" role="tablist">'+[['loss','전투력 손실'],['kills','처치 수'],['stats','통계']].map(([k,t])=>'<button type="button" role="tab" data-kvk="'+k+'" class="'+(view===k?'active':'')+'" aria-selected="'+(view===k)+'">'+t+'</button>').join('')+'</div>'
   +'<div id="kvkBody">'+(view==='loss'?renderLoss(w):view==='kills'?renderKills(w):renderStats(w))+'</div></div>';
  $('kvkWeek').onchange=e=>{week=e.target.value;render();};
  page.querySelectorAll('[data-kvk]').forEach(b=>b.onclick=()=>{view=b.dataset.kvk;render();});
 }
 async function load(){try{const r=await fetch('/api/kvk',{cache:'no-store'});data=await r.json();if(!r.ok&&!data.error)data={error:'국가원정 기록을 읽지 못했습니다.'};}catch{data={error:'국가원정 기록을 읽지 못했습니다.'};}render();}
 function init(){const page=$('kvk');if(!page||page.dataset.ready)return;page.dataset.ready='1';render();load();}
 if(typeof module!=='undefined'&&module.exports){module.exports={weekGain,shares,big,fallKst};return;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
