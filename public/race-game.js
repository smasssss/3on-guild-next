/* 엉뚱 경주 (2026-11-23 사용자 결정) — '추첨 게임' 탭 안의 게임
   - 번호를 단 선수 2~10명이 달립니다. 누가 몇 번을 다는지(경주마·치타·거북이 등 열한 종류 중 하나씩)와 순위는 추첨 번호로 정해집니다.
   - 들어온 순서대로 기록으로 남습니다. 경기는 관리자만 돌릴 수 있고, 기록은 누구나 보고 다시 볼 수 있습니다.
   - 경기 계산과 화면은 /race/ 의 파일(sim.mjs, view.mjs, player.mjs)이 맡고, 이 파일은 설정·기록 저장·기록 목록을 맡습니다. 같은 추첨 번호면 언제나 같은 경기입니다. */
(function(root){'use strict';
 const MIN_RACERS=2,MAX_RACERS=10,PLAYER='/race/player.mjs?v=1',VERSION=1;
 // 2026-11-23 사용자 결정: 중계 목소리는 마음에 드는 목소리를 찾을 때까지 끄고, 배경음악만 틉니다(자막 중계는 그대로).
 const VOICE=false;
 const NAMES={horse:'경주마',biped:'두 발 말',cheetah:'치타',panda:'판다',ostrich:'타조',costume:'인형탈 말',giraffe:'기린',elephant:'코끼리',cow:'소',zebra:'얼룩말',turtle:'거북이'};
 const NUMC=['#e53935','#fafafa','#1e5fd0','#f6c915','#2e9e4f','#1b1b1b','#f57c00','#ec6fa7','#27b5c4','#7d4cc2'],NUMT=['#fff','#111','#fff','#111','#fff','#fff','#fff','#111','#111','#fff'];
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const when=at=>new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
 // 입력값 검사: 문제가 있으면 이유(문장)를, 없으면 null 을 돌려줍니다
 function check(n){
  if(!Number.isSafeInteger(n))return '선수 수를 숫자로 적어 주세요.';
  if(n<MIN_RACERS||n>MAX_RACERS)return '선수는 '+MIN_RACERS+'명부터 '+MAX_RACERS+'명까지 달릴 수 있습니다.';
  return null;
 }
 // 기록 한 건을 순위 순서의 [{rank,no,name}] 로 풀어 줍니다
 const ranking=d=>d.order.map((no,k)=>({rank:k+1,no,name:NAMES[d.types[no-1]]||'선수'}));
 const sameOrder=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
 const engine={check,ranking,sameOrder,NAMES,MIN_RACERS,MAX_RACERS,VERSION};
 if(typeof module!=='undefined'&&module.exports){module.exports=engine;return;}
 root.raceGame=engine;

 // ---------- 화면 ----------
 let records={revision:0,races:[]},current=null,ctx=null;
 const notice=m=>{if(typeof showNotice==='function')showNotice(m);else alert(m);};
 async function api(path,options){return typeof sharedRequest==='function'?sharedRequest(path,options):(await fetch(path,{cache:'no-store'})).json();}
 const count=()=>{const v=String($('rgCount').value).trim();return /^\d+$/.test(v)?Number(v):NaN;};
 const soundOn=()=>!!$('rgSound')?.checked;
 const chip=no=>'<span class="rg-chip" style="background:'+NUMC[no-1]+';color:'+NUMT[no-1]+'">'+no+'</span>';
 function summary(){const el=$('rgSummary');if(!el)return;const n=count(),why=check(n);el.textContent=why||('1번부터 '+n+'번까지 '+n+'명이 달립니다. 누가 몇 번을 다는지는 경기마다 무작위로 정해지고, 들어온 순서대로 기록됩니다.');$('rgStart').disabled=!!why;}
 // 소리는 누르는 순간에만 켤 수 있어(특히 휴대폰) 시작·다시 보기 버튼에서 준비합니다. 아이폰 무음 스위치에도 들리도록 재생용으로 요청합니다.
 function audio(){
  if(!soundOn())return null;const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return null;
  try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{/* 지원하지 않는 브라우저 */}
  try{if(!ctx)ctx=new AC();if(ctx.state!=='running')ctx.resume().catch(()=>{});}catch{ctx=null;}
  return ctx;
 }
 function close(){const box=$('rgOverlay');if(!box||box.hidden)return;box.hidden=true;document.documentElement.classList.remove('tr-open');if(current&&current.show)current.show.close();current=null;$('rgBox').innerHTML='';}
 async function run(job){
  const sound=soundOn(),audioCtx=audio(),mine=current={...job,show:null};
  $('rgOverlay').hidden=false;document.documentElement.classList.add('tr-open');$('rgBox').innerHTML='<p class="rg-loading" role="status">경기를 준비하는 중입니다…</p>';
  try{
   const player=await import(PLAYER),show=await player.open($('rgBox'),{seed:job.seed,n:job.n,ctx:audioCtx,voice:VOICE&&sound,music:sound});
   if(current!==mine){show.close();return;}
   mine.show=show;
   if(job.mode==='new'){
    // 기록을 먼저 남기고, 저장된 뒤에만 경기를 보여 줍니다
    const race={id:crypto.randomUUID(),seed:job.seed,version:VERSION,n:job.n,types:show.race.types,order:show.race.order};
    try{records=await api('/api/race',{method:'POST',body:JSON.stringify({revision:records.revision,mutation:crypto.randomUUID(),race})});renderRecords();}
    catch(err){if(current===mine)close();notice('경기 기록을 저장하지 못해 경기를 시작하지 않았습니다. '+err.message);loadRecords();return;}
   }else if(!sameOrder(show.race.order,job.expect)){if(current===mine)close();notice('이 기록은 지금 계산한 순위와 달라 다시 볼 수 없습니다. 기록된 순위는 목록에서 확인해 주세요.');return;}
   if(current===mine)show.play();
  }catch(err){if(current===mine)close();notice('경주 화면을 열지 못했습니다. '+(err&&err.message?err.message:''));}
 }
 function start(){
  if(typeof ensureAdmin==='function'&&!ensureAdmin())return;
  const n=count();if(check(n))return;
  const seed=Array.from(crypto.getRandomValues(new Uint8Array(4)),x=>x.toString(16).padStart(2,'0')).join('');
  run({mode:'new',seed,n});
 }
 const replay=d=>run({mode:'replay',seed:d.seed,n:d.n,expect:d.order});
 async function loadRecords(){try{records=await api('/api/race');}catch(e){records={revision:0,races:[],error:e.message};}renderRecords();}
 function renderRecords(){
  const el=$('rgRecords');if(!el)return;
  if(records.error){el.innerHTML='<p class="sub">'+esc(records.error)+'</p>';return;}
  if(!records.races.length){el.innerHTML='<p class="sub">아직 기록이 없습니다.</p>';return;}
  el.innerHTML=records.races.map(d=>{const rk=ranking(d);return '<details class="pb-record"><summary><b>'+esc(when(d.at))+'</b><span>선수 '+d.n+'명 · 추첨 번호 '+esc(d.seed)+'</span><span class="lt-row">'+rk.slice(0,3).map(x=>'<span class="rg-top">'+x.rank+'위 '+chip(x.no)+' '+esc(x.name)+'</span>').join('')+'</span></summary>'
   +'<ol class="lt-list">'+rk.map(x=>'<li><i>'+x.rank+'위</i>'+chip(x.no)+'<span>'+x.no+'번 '+esc(x.name)+'</span></li>').join('')+'</ol><div class="actions"><button type="button" class="btn ghost" data-rg-replay="'+esc(d.id)+'">다시 보기</button></div></details>';}).join('');
  el.querySelectorAll('[data-rg-replay]').forEach(btn=>btn.onclick=()=>{const d=records.races.find(x=>x.id===btn.dataset.rgReplay);if(d)replay(d);});
 }
 function init(){
  if(!root.gameSwitch){setTimeout(init,200);return;} // 게임 고르기(treadmill-race.js)가 만들어진 뒤에 붙입니다
  if($('rgPage'))return;
  const el=document.createElement('div');el.id='rgPage';
  el.innerHTML='<div class="card"><h2>엉뚱 경주</h2><p class="sub">번호를 단 선수들이 경주합니다. 경주마, 치타, 판다, 기린, 코끼리, 거북이 같은 열한 종류 가운데 누가 몇 번을 다는지는 경기마다 무작위입니다. 넘어지고, 덮치고, 날아가는 온갖 일이 벌어지지만 어느 선수든 1등을 할 수 있습니다. 경기는 관리자만 돌릴 수 있고, 들어온 순서대로 기록에 남아 누구나 볼 수 있습니다.</p>'
   +'<div class="formgrid"><div class="field"><label for="rgCount">선수 수</label><input id="rgCount" type="number" min="'+MIN_RACERS+'" max="'+MAX_RACERS+'" value="'+MAX_RACERS+'" inputmode="numeric"></div>'
   +'<div class="field pb-check"><label><input id="rgSound" type="checkbox" checked> 소리 켜기 (경기 음악)</label></div></div>'
   +'<p class="sub" id="rgSummary" role="status"></p><div class="actions"><button type="button" class="btn primary" id="rgStart">경기 시작</button></div></div>'
   +'<div class="card"><h2>경기 기록</h2><div id="rgRecords"><p class="sub">기록을 불러오는 중입니다.</p></div></div>';
  root.gameSwitch.add('race','엉뚱 경주',el,()=>{summary();});
  const ov=document.createElement('div');ov.id='rgOverlay';ov.className='rg-overlay';ov.hidden=true;ov.innerHTML='<div id="rgBox"></div><button type="button" id="rgClose" aria-label="경주 화면 닫기">닫기</button>';document.body.appendChild(ov);
  const input=$('rgCount');input.addEventListener('input',summary);input.addEventListener('change',summary);
  $('rgStart').onclick=start;$('rgClose').onclick=close;
  loadRecords();summary();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);
