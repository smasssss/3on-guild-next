/* 로또 추첨기 (2026-11-23 사용자 결정) — '추첨 게임' 탭 안의 게임
   - 숫자 공만 씁니다. 시작 번호~끝 번호(공 2~60개)를 통에 넣고, 원하는 개수만큼 뽑습니다.
   - 뽑힌 순서대로(첫 번째, 두 번째, …) 기록으로 남습니다. 추첨은 관리자만 돌릴 수 있고, 기록은 누구나 보고 다시 볼 수 있습니다.
   - 추첨 화면과 계산은 /lotto3d/ 의 별도 화면이 맡고, 이 파일은 설정·기록 저장·기록 목록을 맡습니다. 같은 추첨 번호면 언제나 같은 결과입니다. */
(function(root){'use strict';
 const MIN_BALLS=2,MAX_BALLS=60,MAX_NUMBER=999,PLAY='/lotto3d/play.html?v=1',VERSION=1;
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const when=at=>new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
 // 입력값 검사: 문제가 있으면 이유(문장)를, 없으면 null 을 돌려줍니다
 function check(from,to,count){
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||!Number.isSafeInteger(count))return '숫자를 적어 주세요.';
  if(from<0||to>MAX_NUMBER)return '번호는 0부터 '+MAX_NUMBER+'까지 쓸 수 있습니다.';
  if(to<=from)return '끝 번호가 시작 번호보다 커야 합니다.';
  if(to-from+1>MAX_BALLS)return '공은 한 번에 '+MAX_BALLS+'개까지 넣을 수 있습니다. (지금 '+(to-from+1)+'개)';
  if(count<1||count>to-from+1)return '뽑는 개수는 1개부터 공의 수('+(to-from+1)+'개)까지입니다.';
  return null;
 }
 // 번호대별 공 색(추첨 화면과 같음)
 const COLORS=['#fbc400','#69c8f2','#ff7272','#aaaaaa','#b0d840','#c39bf5'],colorOf=n=>COLORS[Math.floor((Math.max(1,n)-1)/10)%COLORS.length];
 const engine={check,colorOf,MIN_BALLS,MAX_BALLS,MAX_NUMBER};
 if(typeof module!=='undefined'&&module.exports){module.exports=engine;return;}
 root.lottoDraw=engine;

 // ---------- 화면 ----------
 let records={revision:0,draws:[]},current=null;
 const notice=m=>{if(typeof showNotice==='function')showNotice(m);else alert(m);};
 async function api(path,options){return typeof sharedRequest==='function'?sharedRequest(path,options):(await fetch(path,{cache:'no-store'})).json();}
 const num=id=>{const v=String($(id).value).trim();return /^\d+$/.test(v)?Number(v):NaN;};
 const settings=()=>({from:num('ltFrom'),to:num('ltTo'),count:num('ltCount')});
 const ball=n=>'<span class="lt-ball" style="background:'+colorOf(n)+'">'+n+'</span>';
 function summary(){
  const el=$('ltSummary');if(!el)return;const s=settings(),why=check(s.from,s.to,s.count);
  el.textContent=why||(s.from+'번부터 '+s.to+'번까지 공 '+(s.to-s.from+1)+'개를 넣고 '+s.count+'개를 뽑습니다. 뽑힌 순서대로 기록됩니다.');$('ltStart').disabled=!!why;
 }
 function open(payload){const box=$('ltOverlay');box.hidden=false;document.documentElement.classList.add('tr-open');$('ltFrame').src=PLAY+'#'+encodeURIComponent(JSON.stringify(payload));}
 function close(){const box=$('ltOverlay');if(!box||box.hidden)return;box.hidden=true;$('ltFrame').src='about:blank';document.documentElement.classList.remove('tr-open');current=null;}
 const tell=m=>{try{$('ltFrame').contentWindow.postMessage({source:'lotto-draw',...m},location.origin);}catch{/* 화면이 이미 닫힘 */}};
 async function onMessage(e){
  if(e.origin!==location.origin||!e.data||e.data.source!=='lotto3d')return;const m=e.data;
  if(m.type==='close')return close();
  if(m.type==='result'&&current&&current.mode==='new'&&m.seed===current.seed&&!current.saved){
   current.saved=true;
   const draw={id:crypto.randomUUID(),seed:m.seed,version:VERSION,from:current.from,to:current.to,count:current.count,numbers:m.numbers};
   try{records=await api('/api/lotto',{method:'POST',body:JSON.stringify({revision:records.revision,mutation:crypto.randomUUID(),draw})});renderRecords();tell({type:'go'});}
   catch(err){tell({type:'abort'});close();notice('추첨 기록을 저장하지 못해 추첨을 시작하지 않았습니다. '+err.message);loadRecords();}
  }
 }
 function start(){
  if(typeof ensureAdmin==='function'&&!ensureAdmin())return;
  const s=settings();if(check(s.from,s.to,s.count))return;
  const seed=Array.from(crypto.getRandomValues(new Uint8Array(4)),x=>x.toString(16).padStart(2,'0')).join('');
  current={mode:'new',seed,...s};open({seed,from:s.from,to:s.to,count:s.count,hold:true});
 }
 function replay(d){current={mode:'replay'};open({seed:d.seed,from:d.from,to:d.to,count:d.count,expect:d.numbers});}
 async function loadRecords(){try{records=await api('/api/lotto');}catch(e){records={revision:0,draws:[],error:e.message};}renderRecords();}
 function renderRecords(){
  const el=$('ltRecords');if(!el)return;
  if(records.error){el.innerHTML='<p class="sub">'+esc(records.error)+'</p>';return;}
  if(!records.draws.length){el.innerHTML='<p class="sub">아직 기록이 없습니다.</p>';return;}
  el.innerHTML=records.draws.map(d=>'<details class="pb-record"><summary><b>'+esc(when(d.at))+'</b><span>'+d.from+'~'+d.to+' 중 '+d.count+'개 · 추첨 번호 '+esc(d.seed)+'</span><span class="lt-row">'+d.numbers.map(ball).join('')+'</span></summary>'
   +'<ol class="lt-list">'+d.numbers.map((n,k)=>'<li><i>'+(k+1)+'번째</i>'+ball(n)+'</li>').join('')+'</ol><div class="actions"><button type="button" class="btn ghost" data-lt-replay="'+esc(d.id)+'">다시 보기</button></div></details>').join('');
  el.querySelectorAll('[data-lt-replay]').forEach(btn=>btn.onclick=()=>{const d=records.draws.find(x=>x.id===btn.dataset.ltReplay);if(d)replay(d);});
 }
 function init(){
  if(!root.gameSwitch){setTimeout(init,200);return;} // 게임 고르기(treadmill-race.js)가 만들어진 뒤에 붙입니다
  if($('ltPage'))return;
  const el=document.createElement('div');el.id='ltPage';
  el.innerHTML='<div class="card"><h2>로또 추첨기</h2><p class="sub">번호 공을 둥근 통에 넣고 바람으로 섞다가 하나씩 뽑습니다. 시작 번호와 끝 번호, 뽑을 개수를 적으면 됩니다(공은 한 번에 '+MAX_BALLS+'개까지). 추첨은 관리자만 돌릴 수 있고, 뽑힌 순서대로 기록에 남아 누구나 볼 수 있습니다.</p>'
   +'<div class="formgrid"><div class="field"><label for="ltFrom">시작 번호</label><input id="ltFrom" type="number" min="0" max="'+MAX_NUMBER+'" value="1" inputmode="numeric"></div>'
   +'<div class="field"><label for="ltTo">끝 번호</label><input id="ltTo" type="number" min="1" max="'+MAX_NUMBER+'" value="45" inputmode="numeric"></div>'
   +'<div class="field"><label for="ltCount">뽑을 개수</label><input id="ltCount" type="number" min="1" max="'+MAX_BALLS+'" value="6" inputmode="numeric"></div></div>'
   +'<p class="sub" id="ltSummary" role="status"></p><div class="actions"><button type="button" class="btn primary" id="ltStart">추첨 시작</button></div></div>'
   +'<div class="card"><h2>추첨 기록</h2><div id="ltRecords"><p class="sub">기록을 불러오는 중입니다.</p></div></div>';
  root.gameSwitch.add('lotto','로또 추첨기',el,()=>{summary();});
  const ov=document.createElement('div');ov.id='ltOverlay';ov.className='tr-overlay';ov.hidden=true;ov.innerHTML='<iframe id="ltFrame" title="로또 추첨기 화면"></iframe><button type="button" id="ltClose" aria-label="추첨 화면 닫기">닫기</button>';document.body.appendChild(ov);
  el.querySelectorAll('input').forEach(x=>{x.addEventListener('input',summary);x.addEventListener('change',summary);});
  $('ltStart').onclick=start;$('ltClose').onclick=close;root.addEventListener('message',onMessage);
  loadRecords();summary();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);
