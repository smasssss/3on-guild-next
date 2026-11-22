/* 런닝머신 레이스 (2026-11-22 사용자 결정) — '추첨 게임' 탭 안의 두 번째 게임
   - 참가자: 직접 선택하거나, 저장된 핀볼 추첨 기록의 골인 순서 1등부터 N명을 가져옵니다(2~15명).
   - 한 판: 물건 정하기(1번 자리부터) → 자리 정하기(단순 핀볼) → 런닝머신 경기 → 순위. 떨어진 순서대로 최하위부터, 마지막까지 버틴 사람이 1등.
   - 경기 화면과 계산은 /treadmill3d/ 의 별도 화면이 맡고, 이 파일은 참가자 고르기·기록 저장·기록 목록을 맡습니다.
   - 경기는 관리자만 돌릴 수 있고, 기록은 누구나 보고 다시 볼 수 있습니다. 같은 추첨 번호면 언제나 같은 경기입니다. */
(function(root){'use strict';
 const MIN=2,MAX=15,PLAY='/treadmill3d/play.html?v=4',MUSIC='/treadmill3d/assets/music/race01.mp3?v=1',VERSION=3; // 3판(2026-11-23): 재출발 없음, 뒤쪽 경사로와 양옆 경사, 10초마다 빨라지고 경사로가 내려옴. 1·2판 기록은 그 판 그대로 다시 봄
 const ITEM={orange:'오렌지',baseball:'야구공',watermelon:'미니 수박',can:'참치캔',tissue:'두루마리 휴지',tape:'박스테이프',sedan:'승용차',racer:'레이싱카',kei:'경차',doll:'핵불잙 인형'};
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const when=at=>new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
 // 순위: 탈락 순서의 맨 뒤가 1등. 각자 받은 물건은 자리 번호로 찾습니다.
 function ranking(d){const name=new Map(d.participants.map(p=>[p.memberId,p.nickname]));return d.order.slice().reverse().map((id,k)=>{const slot=d.slots.indexOf(id);return {rank:k+1,memberId:id,nickname:name.get(id)||id,slot:slot+1,item:d.items[slot]};});}
 // 핀볼 기록에서 가져오기: 골인 순서 1등부터 n명(핀볼 기록만. 옛 배틀로얄·러닝머신 기록은 쓰지 않음)
 function fromPinball(draw,n){const by=new Map(draw.participants.map(p=>[p.memberId,p.nickname]));return draw.order.slice(0,Math.max(0,Math.min(n,draw.order.length,MAX))).map(id=>({memberId:id,nickname:by.get(id)||id}));}
 const engine={ranking,fromPinball,MIN,MAX,ITEM};
 if(typeof module!=='undefined'&&module.exports){module.exports=engine;return;}
 root.treadmillRace=engine;

 // ---------- 화면 ----------
 let records={revision:0,races:[]},pinball=[],manual=new Set(),current=null;
 const view=()=>typeof carriageVip!=='undefined'?carriageVip.view:null;
 const notice=m=>{if(typeof showNotice==='function')showNotice(m);else alert(m);};
 async function api(path,options){return typeof sharedRequest==='function'?sharedRequest(path,options):(await fetch(path,{cache:'no-store'})).json();}
 function roster(){const v=view();if(!v)return null;return v.members.filter(m=>m.current).map(m=>({memberId:m.memberId,nickname:m.nickname})).sort((a,b)=>a.nickname.localeCompare(b.nickname));}
 const source=()=>document.querySelector('input[name="trSource"]:checked')?.value||'manual';
 const pickCount=()=>Math.max(MIN,Math.min(MAX,Math.floor(Number($('trCount').value))||MIN));
 const pickedDraw=()=>pinball.find(d=>d.id===$('trDraw').value)||null;
 function chosen(){
  if(source()==='pinball'){const d=pickedDraw();return d?fromPinball(d,pickCount()):[];}
  const all=roster();return all?all.filter(m=>manual.has(m.memberId)):null;
 }
 function renderManual(){
  const all=roster();if(!all)return;const q=($('trSearch').value||'').trim().toLowerCase(),full=manual.size>=MAX;
  $('trManualList').innerHTML=all.filter(m=>!q||m.nickname.toLowerCase().includes(q)).map(m=>'<label class="pb-person"><input type="checkbox" value="'+esc(m.memberId)+'"'+(manual.has(m.memberId)?' checked':full?' disabled':'')+'><b>'+esc(m.nickname)+'</b></label>').join('');
  $('trManualList').querySelectorAll('input').forEach(c=>c.onchange=()=>{if(c.checked){if(manual.size>=MAX){c.checked=false;return;}manual.add(c.value);}else manual.delete(c.value);renderManual();summary();});
 }
 function renderDraws(){
  const sel=$('trDraw'),keep=sel.value;
  sel.innerHTML=pinball.length?pinball.map(d=>'<option value="'+esc(d.id)+'">'+esc(when(d.at))+' · '+d.participants.length+'명 · '+d.course+'번 코스</option>').join(''):'<option value="">저장된 핀볼 기록이 없습니다</option>';
  if(pinball.some(d=>d.id===keep))sel.value=keep;
 }
 function summary(){
  const el=$('trSummary');if(!el)return;const s=source();$('trManual').hidden=s!=='manual';$('trPinball').hidden=s!=='pinball';
  const list=chosen();
  if(!list){el.textContent='길드원 명단을 불러오는 중입니다.';$('trStart').disabled=true;return;}
  if(s==='pinball'){const d=pickedDraw();$('trPreview').textContent=d?'골인 순서: '+list.map((m,k)=>(k+1)+'. '+m.nickname).join(', '):'';if(d&&d.order.length<pickCount())$('trPreview').textContent+=' (이 기록은 '+d.order.length+'명뿐입니다)';}
  el.textContent=(s==='manual'?'직접 선택':'핀볼 기록에서 가져오기')+' · 참가 '+list.length+'명'+(list.length<MIN?' · '+MIN+'명 이상 골라 주세요.':list.length>MAX?' · 한 판에 '+MAX+'명까지입니다.':' · 마지막까지 버틴 사람이 1등입니다.');
  $('trStart').disabled=list.length<MIN||list.length>MAX;
 }
 // 경기 음악(2026-11-23 사용자 결정): 사용자가 직접 만든 곡을 파란불에 맞춰 틀고, 경기가 끝나면 서서히 줄입니다.
 // 휴대폰은 누르는 순간에만 소리를 낼 수 있어, 경기 시작·다시 보기 버튼을 누를 때 소리를 준비합니다(핀볼과 같은 방식).
 const sound={ctx:null,buf:null,src:null,gain:null,token:0};
 const soundOn=()=>!!$('trSound')?.checked;
 function audioPrepare(){
  if(!soundOn())return;const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return;
  if(!sound.ctx){try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{/* 지원하지 않는 브라우저 */}sound.ctx=new AC();}
  if(sound.ctx.state!=='running')sound.ctx.resume().catch(()=>{});
  if(!sound.buf){const c=sound.ctx;sound.buf=fetch(MUSIC).then(r=>{if(!r.ok)throw Error('music');return r.arrayBuffer();}).then(b=>new Promise((ok,no)=>c.decodeAudioData(b,ok,no)));sound.buf.catch(()=>{sound.buf=null;});}
 }
 function musicStop(now){
  sound.token++;const s=sound.src,g=sound.gain,c=sound.ctx;if(!s||!c)return;sound.src=null;
  try{if(now)s.stop();else{const t=c.currentTime;g.gain.setValueAtTime(g.gain.value,t);g.gain.linearRampToValueAtTime(0,t+2.2);s.stop(t+2.3);}}catch{/* 이미 멈춤 */}
 }
 function musicStart(){
  musicStop(true);if(!soundOn()||!sound.ctx||!sound.buf)return;const token=++sound.token,c=sound.ctx;
  sound.buf.then(buf=>{if(token!==sound.token||!soundOn())return;const src=c.createBufferSource(),g=c.createGain();src.buffer=buf;src.loop=true;g.gain.value=0.6;src.connect(g);g.connect(c.destination);src.start();sound.src=src;sound.gain=g;root.__trMusic=(root.__trMusic||0)+1;}).catch(()=>{});
 }
 // 경기 화면(별도 화면)을 화면 전체에 띄웁니다
 function open(payload){
  const box=$('trOverlay');box.hidden=false;document.documentElement.classList.add('tr-open');
  $('trFrame').src=PLAY+'#'+encodeURIComponent(JSON.stringify(payload));
 }
 function close(){musicStop(true);const box=$('trOverlay');if(!box||box.hidden)return;box.hidden=true;$('trFrame').src='about:blank';document.documentElement.classList.remove('tr-open');current=null;}
 const tell=m=>{try{$('trFrame').contentWindow.postMessage({source:'treadmill-race',...m},location.origin);}catch{/* 화면이 이미 닫힘 */}};
 async function onMessage(e){
  if(e.origin!==location.origin||!e.data||e.data.source!=='treadmill3d')return;const m=e.data;
  if(m.type==='close')return close();
  if(m.type==='green')return musicStart();
  if(m.type==='race-end'||m.type==='error')return musicStop(m.type==='error');
  if(m.type==='result'&&current&&current.mode==='new'&&m.seed===current.seed&&!current.saved){
   current.saved=true;
   const race={id:crypto.randomUUID(),seed:m.seed,version:VERSION,source:current.source,...(current.source==='pinball'?{pinballDrawId:current.pinballDrawId}:{}),participants:current.participants,items:m.kinds,slots:m.slots,order:m.order,restarts:m.restarts,seconds:m.seconds,timedOut:!m.finished};
   try{records=await api('/api/treadmill',{method:'POST',body:JSON.stringify({revision:records.revision,mutation:crypto.randomUUID(),race})});renderRecords();tell({type:'go'});}
   catch(err){tell({type:'abort'});close();notice('경기 기록을 저장하지 못해 경기를 시작하지 않았습니다. '+err.message);loadRecords();}
  }
 }
 async function start(){
  if(typeof ensureAdmin==='function'&&!ensureAdmin())return;
  const list=chosen();if(!list||list.length<MIN||list.length>MAX)return;
  audioPrepare();
  const seed=Array.from(crypto.getRandomValues(new Uint8Array(4)),x=>x.toString(16).padStart(2,'0')).join('');
  const s=source();current={mode:'new',seed,source:s,pinballDrawId:s==='pinball'?pickedDraw().id:undefined,participants:list.map(m=>({memberId:m.memberId,nickname:m.nickname}))};
  open({seed,version:VERSION,hold:true,racers:list.map(m=>({id:m.memberId,name:m.nickname}))});
 }
 function replay(d){audioPrepare();current={mode:'replay'};open({seed:d.seed,version:d.version,expect:d.order,racers:d.participants.map(p=>({id:p.memberId,name:p.nickname}))});}
 async function loadRecords(){try{records=await api('/api/treadmill');}catch(e){records={revision:0,races:[],error:e.message};}renderRecords();}
 async function loadPinball(){try{const r=await api('/api/pinball');pinball=(r.draws||[]).filter(d=>!d.game);}catch{pinball=[];}renderDraws();summary();}
 function renderRecords(){
  const el=$('trRecords');if(!el)return;
  if(records.error){el.innerHTML='<p class="sub">'+esc(records.error)+'</p>';return;}
  if(!records.races.length){el.innerHTML='<p class="sub">아직 기록이 없습니다.</p>';return;}
  el.innerHTML=records.races.map(d=>{const rows=ranking(d);return '<details class="pb-record"><summary><b>'+esc(when(d.at))+'</b><span>'+(d.source==='pinball'?'핀볼 기록에서':'직접 선택')+' '+d.participants.length+'명 · 1등 '+esc(rows[0].nickname)+' · '+d.seconds+'초'+(d.restarts?' · 재출발 '+d.restarts+'번':'')+(d.timedOut?' · 시간 초과':'')+' · 추첨 번호 '+esc(d.seed)+'</span></summary>'
   +'<ol class="tr-rank">'+rows.map(r=>'<li><img alt="" loading="lazy" src="/treadmill3d/assets/icons/'+esc(r.item)+'.png"><b>'+esc(r.nickname)+'</b><span>'+r.slot+'번 자리 · '+esc(ITEM[r.item]||r.item)+'</span></li>').join('')+'</ol>'
   +'<div class="actions"><button type="button" class="btn ghost" data-tr-replay="'+esc(d.id)+'">다시 보기</button></div></details>';}).join('');
  el.querySelectorAll('[data-tr-replay]').forEach(btn=>btn.onclick=()=>{const d=records.races.find(x=>x.id===btn.dataset.trReplay);if(d)replay(d);});
 }
 // 게임 고르기: 다른 게임 파일(로또 추첨기 등)도 gameSwitch.add 로 자기 화면을 붙입니다
 const pages={},shows={};
 function show(game){
  for(const k of Object.keys(pages))pages[k].hidden=k!==game;
  document.querySelectorAll('#trSwitch button').forEach(b=>{const on=b.dataset.game===game;b.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');});
  if(shows[game])shows[game]();
 }
 function init(){
  const page=$('pinball');if(!page||page.dataset.trReady)return;
  if(!page.dataset.ready){setTimeout(init,200);return;} // 핀볼 화면이 먼저 만들어진 뒤에 붙입니다
  page.dataset.trReady='1';
  const pb=document.createElement('div');pb.id='pbPage';while(page.firstChild)pb.appendChild(page.firstChild);
  const sw=document.createElement('div');sw.id='trSwitch';sw.className='tr-switch';sw.setAttribute('role','tablist');sw.setAttribute('aria-label','게임 고르기');
  sw.innerHTML='<button type="button" role="tab" data-game="pinball" class="on" aria-selected="true">핀볼 추첨</button><button type="button" role="tab" data-game="treadmill" aria-selected="false">런닝머신 레이스</button>';
  const tr=document.createElement('div');tr.id='trPage';tr.hidden=true;
  tr.innerHTML='<div class="card"><h2>런닝머신 레이스</h2><p class="sub">돌아가는 런닝머신 위에서 물건들이 버티는 경기입니다. 1번 자리부터 물건이 정해지고, 간단한 핀볼로 누가 어느 자리의 주인인지 정한 뒤 경기를 합니다. 10초마다 런닝머신이 조금씩 빨라지고 뒤쪽 경사로가 내려옵니다. 떨어진 순서대로 최하위부터 정해지고 마지막까지 버틴 사람이 1등입니다. 한 판에 '+MIN+'~'+MAX+'명. 경기는 관리자만 돌릴 수 있고, 결과는 기록으로 남아 누구나 볼 수 있습니다.</p>'
   +'<div class="pb-source" role="radiogroup" aria-label="참가자 고르는 방법"><label><input type="radio" name="trSource" value="manual" checked> 직접 선택</label><label><input type="radio" name="trSource" value="pinball"> 핀볼 기록에서 가져오기</label></div>'
   +'<div id="trManual"><div class="field"><label for="trSearch">이름 검색</label><input id="trSearch" placeholder="닉네임"></div><div class="actions"><button type="button" class="smallbtn" id="trSelNone">모두 해제</button></div><div class="pb-manual-list" id="trManualList"></div></div>'
   +'<div id="trPinball" hidden><div class="formgrid"><div class="field"><label for="trDraw">핀볼 추첨 기록</label><select id="trDraw"></select></div><div class="field"><label for="trCount">1등부터 몇 명 (2~15)</label><input id="trCount" type="number" min="'+MIN+'" max="'+MAX+'" value="10" inputmode="numeric"></div></div><p class="sub" id="trPreview"></p></div>'
   +'<div class="field pb-check"><label><input id="trSound" type="checkbox" checked> 소리 켜기 (경기 음악)</label></div>'
   +'<p class="sub" id="trSummary" role="status"></p><div class="actions"><button type="button" class="btn primary" id="trStart">경기 시작</button></div></div>'
   +'<div class="card"><h2>경기 기록</h2><div id="trRecords"><p class="sub">기록을 불러오는 중입니다.</p></div></div>';
  page.append(sw,pb,tr);pages.pinball=pb;pages.treadmill=tr;shows.treadmill=()=>{renderManual();loadPinball();summary();};
  root.gameSwitch={add(key,label,el,onShow){if(pages[key])return;const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.dataset.game=key;b.setAttribute('aria-selected','false');b.textContent=label;b.onclick=()=>show(key);sw.appendChild(b);el.hidden=true;page.appendChild(el);pages[key]=el;if(onShow)shows[key]=onShow;}};
  const ov=document.createElement('div');ov.id='trOverlay';ov.hidden=true;ov.innerHTML='<iframe id="trFrame" title="런닝머신 레이스 경기 화면" allow="autoplay"></iframe><button type="button" id="trClose" aria-label="경기 화면 닫기">닫기</button>';document.body.appendChild(ov);
  sw.querySelectorAll('button').forEach(b=>b.onclick=()=>show(b.dataset.game));
  tr.querySelectorAll('input,select').forEach(el=>{el.addEventListener('input',summary);el.addEventListener('change',summary);});
  $('trSearch').addEventListener('input',renderManual);
  $('trSelNone').onclick=()=>{manual=new Set();renderManual();summary();};
  $('trStart').onclick=start;$('trClose').onclick=close;$('trSound').addEventListener('change',()=>{if(!soundOn())musicStop(true);});
  root.addEventListener('message',onMessage);
  loadRecords();summary();
  if(typeof refreshCarriageVip==='function'&&!view())refreshCarriageVip().then(()=>{renderManual();summary();},summary);
  const timer=setInterval(()=>{if(view()){renderManual();summary();clearInterval(timer);}},1000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);
