/* 핀볼 추첨 (2026-11-09 사용자 결정)
   - 대상: 이번 길드전 점수 기준 이상인 현재 길드원(영구 제외는 항상 빠짐, 고정 마차장은 선택).
   - 뽑기: 먼저 들어온 N명 또는 늦게 들어온 N명. 결과는 추첨 번호로 미리 계산하고 화면은 그대로 재생합니다.
     같은 추첨 번호·같은 참가자면 언제 다시 돌려도 같은 결과가 나옵니다.
   - 카메라: 뽑히는 사람 중 아직 골인하지 않은 가장 앞선 공을 따라갑니다.
   - 관리자만 추첨을 돌려 기록을 남기고, 기록은 누구나 볼 수 있습니다. */
(function(root){'use strict';
 // ---------- 계산(화면과 무관, 같은 입력이면 같은 결과) ----------
 const W=360,R=7,PEG_R=3.5,GAP=34,ROW=34,ROWS=34,TOP=170,FPS=60,SUB=3,G=980,MAX_SECONDS=150;
 function rng(seedHex){let a=parseInt(seedHex,16)>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
 function board(){
  const pegs=[];for(let r=0;r<ROWS;r++){const y=TOP+r*ROW,off=r%2?ROW/2:0;for(let x=ROW/2+off;x<=W-ROW/4;x+=ROW)pegs.push([x,y]);}
  const funnelTop=TOP+ROWS*ROW+10,funnelH=150,goalY=funnelTop+funnelH;
  const walls=[[0,funnelTop,W/2-GAP/2,goalY],[W,funnelTop,W/2+GAP/2,goalY]];
  return {W,R,PEG_R,pegs,walls,goalY,height:goalY+60,top:TOP};
 }
 function simulate(count,seedHex){
  const b=board(),rand=rng(seedHex),dt=1/(FPS*SUB),maxFrames=FPS*MAX_SECONDS;
  const n=count,x=new Float64Array(n),y=new Float64Array(n),vx=new Float64Array(n),vy=new Float64Array(n),done=new Int32Array(n).fill(-1);
  // 시작 위치: 위쪽 칸에 무작위로 배치(추첨 번호로 섞음)
  const cols=Math.floor((W-2*R)/(2*R+4)),slots=[];for(let i=0;i<n;i++)slots.push(i);
  for(let i=n-1;i>0;i--){const j=Math.floor(rand()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
  for(let i=0;i<n;i++){const s=slots[i],c=s%cols,r=Math.floor(s/cols);x[i]=R+2+c*(2*R+4)+(r%2?R:0)+rand()*2;y[i]=TOP-20-r*(2*R+3);vx[i]=(rand()-.5)*40;vy[i]=0;}
  const frames=[],order=[];let frame=0;
  const pegRows=new Map();for(const p of b.pegs){const k=Math.round((p[1]-TOP)/ROW);if(!pegRows.has(k))pegRows.set(k,[]);pegRows.get(k).push(p);}
  const cell=2*R,grid=new Map();
  while(order.length<n&&frame<maxFrames){
   for(let s=0;s<SUB;s++){
    for(let i=0;i<n;i++){if(done[i]>=0)continue;
     vy[i]+=G*dt;x[i]+=vx[i]*dt;y[i]+=vy[i]*dt;
     if(x[i]<R){x[i]=R;vx[i]=Math.abs(vx[i])*.5;} if(x[i]>W-R){x[i]=W-R;vx[i]=-Math.abs(vx[i])*.5;}
     const k=Math.round((y[i]-TOP)/ROW);
     for(let kk=k-1;kk<=k+1;kk++){const row=pegRows.get(kk);if(!row)continue;for(const p of row){const dx=x[i]-p[0],dy=y[i]-p[1],d2=dx*dx+dy*dy,m=R+PEG_R;if(d2<m*m&&d2>1e-9){const d=Math.sqrt(d2),nx=dx/d,ny=dy/d;x[i]=p[0]+nx*m;y[i]=p[1]+ny*m;const vn=vx[i]*nx+vy[i]*ny;if(vn<0){vx[i]-=1.55*vn*nx;vy[i]-=1.55*vn*ny;vx[i]+=(rand()-.5)*30;}}}}
     for(const w of b.walls){const ax=w[0],ay=w[1],bx=w[2],by=w[3],ex=bx-ax,ey=by-ay,l2=ex*ex+ey*ey;let t=((x[i]-ax)*ex+(y[i]-ay)*ey)/l2;t=t<0?0:t>1?1:t;const px=ax+ex*t,py=ay+ey*t,dx=x[i]-px,dy=y[i]-py,d2=dx*dx+dy*dy;if(d2<R*R&&d2>1e-9){const d=Math.sqrt(d2),nx=dx/d,ny=dy/d;x[i]=px+nx*R;y[i]=py+ny*R;const vn=vx[i]*nx+vy[i]*ny;if(vn<0){vx[i]-=1.3*vn*nx;vy[i]-=1.3*vn*ny;}}}
     const sp=Math.hypot(vx[i],vy[i]);if(sp>900){vx[i]*=900/sp;vy[i]*=900/sp;}
     if(y[i]>b.goalY+R){done[i]=frame;order.push(i);}
    }
    // 공끼리 부딪힘(가까운 칸만 확인)
    grid.clear();for(let i=0;i<n;i++){if(done[i]>=0)continue;const key=Math.floor(x[i]/cell)+','+Math.floor(y[i]/cell);const list=grid.get(key);if(list)list.push(i);else grid.set(key,[i]);}
    for(let i=0;i<n;i++){if(done[i]>=0)continue;const cx=Math.floor(x[i]/cell),cy=Math.floor(y[i]/cell);
     for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){const list=grid.get((cx+ox)+','+(cy+oy));if(!list)continue;for(const j of list){if(j<=i)continue;const dx=x[j]-x[i],dy=y[j]-y[i],d2=dx*dx+dy*dy,m=2*R;if(d2<m*m&&d2>1e-9){const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,push=(m-d)/2;x[i]-=nx*push;y[i]-=ny*push;x[j]+=nx*push;y[j]+=ny*push;const rv=(vx[j]-vx[i])*nx+(vy[j]-vy[i])*ny;if(rv<0){const imp=-.6*rv;vx[i]-=imp*nx;vy[i]-=imp*ny;vx[j]+=imp*nx;vy[j]+=imp*ny;}}}}}
   }
   const f=new Float32Array(n*2);for(let i=0;i<n;i++){f[2*i]=x[i];f[2*i+1]=done[i]>=0?b.goalY+40:y[i];}frames.push(f);frame++;
  }
  const timedOut=order.length<n;
  if(timedOut){const rest=[];for(let i=0;i<n;i++)if(done[i]<0)rest.push(i);rest.sort((a,c)=>y[c]-y[a]||a-c);for(const i of rest){done[i]=frame;order.push(i);}}
  return {board:b,order,finish:Array.from(done),frames,timedOut};
 }
 // 참가자는 회원 번호 순으로 고정해 같은 추첨 번호면 같은 결과가 나오게 합니다.
 function run(participants,seed,mode,count){
  const list=participants.slice().sort((a,b)=>a.memberId.localeCompare(b.memberId));
  const sim=simulate(list.length,seed),order=sim.order.map(i=>list[i].memberId);
  const picks=mode==='first'?order.slice(0,count):order.slice(order.length-count);
  return {list,sim,order,picks};
 }
 const engine={simulate,run,board};
 if(typeof module!=='undefined'&&module.exports){module.exports=engine;return;}
 root.pinballEngine=engine;

 // ---------- 화면 ----------
 const $=id=>document.getElementById(id);
 const fmtN=n=>Number(n).toLocaleString('ko-KR');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const palette=['#f59ab8','#8fd3a8','#f7c86b','#9cc4f2','#c7a6f0','#f6a07a','#7fd6d0','#e8a3d8','#b8d77a','#f2b38a'];
 let records={revision:0,draws:[]},playing=null;
 function settings(){return {threshold:Number(String($('pbThreshold').value).replace(/[^0-9]/g,''))||0,includeFixed:$('pbFixed').checked,mode:$('pbMode').value,count:Math.max(1,Number($('pbCount').value)||1)};}
 function candidates(){
  const v=typeof carriageVip!=='undefined'?carriageVip.view:null;if(!v)return null;
  const s=settings(),points=new Map((v.active?.rows||[]).map(r=>[r.memberId,r.points]));
  const fixed=new Set((state.rotationMembers||[]).map(e=>e.memberId));
  return v.members.filter(m=>m.current&&state.vipExcludedMembers?.[m.memberId]!==1&&(s.includeFixed||!fixed.has(m.memberId))&&(points.get(m.memberId)??0)>=s.threshold)
   .map(m=>({memberId:m.memberId,nickname:m.nickname,points:points.get(m.memberId)??0})).sort((a,b)=>b.points-a.points);
 }
 function summary(){
  const el=$('pbSummary');if(!el)return;const list=candidates(),s=settings();
  if(!list){el.textContent='길드전 점수를 불러오는 중입니다.';return;}
  const week=carriageVip.view.active?.appliesOn;
  el.textContent=(week?week+' 주차 길드전 기록 · ':'적용 중인 길드전 기록 없음 · ')+fmtN(s.threshold)+'점 이상 '+list.length+'명 · '+(s.mode==='first'?'먼저':'늦게')+' 들어온 '+Math.min(s.count,list.length)+'명을 뽑습니다.';
  $('pbStart').disabled=!list.length;
 }
 function draw(ctx,b,pos,n,camY,viewH,scale,finish,f,target,label){
  ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,b.W,viewH);ctx.fillStyle='#fffaf0';ctx.fillRect(0,0,b.W,viewH);
  ctx.translate(0,-camY);
  ctx.fillStyle='#e7a9bf';for(const p of b.pegs){if(p[1]<camY-10||p[1]>camY+viewH+10)continue;ctx.beginPath();ctx.arc(p[0],p[1],b.PEG_R,0,7);ctx.fill();}
  ctx.strokeStyle='#d6578a';ctx.lineWidth=3;for(const w of b.walls){ctx.beginPath();ctx.moveTo(w[0],w[1]);ctx.lineTo(w[2],w[3]);ctx.stroke();}
  ctx.fillStyle='#ffe0ea';ctx.fillRect(b.W/2-GAP/2,b.goalY,GAP,30);ctx.fillStyle='#000';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText('골',b.W/2,b.goalY+20);
  ctx.textBaseline='middle';ctx.font='bold 7px sans-serif';
  for(let i=0;i<n;i++){if(finish[i]<=f)continue;const x=pos[2*i],y=pos[2*i+1];if(y<camY-10||y>camY+viewH+10)continue;ctx.fillStyle=palette[i%palette.length];ctx.beginPath();ctx.arc(x,y,b.R,0,7);ctx.fill();if(i===target){ctx.strokeStyle='#000';ctx.lineWidth=1.5;ctx.stroke();}ctx.fillStyle='#000';ctx.fillText(String(i+1),x,y+.5);}
  if(target!==undefined&&finish[target]>f){const x=pos[2*target],y=pos[2*target+1];ctx.font='bold 10px sans-serif';const w=ctx.measureText(label).width+10,lx=Math.max(w/2+2,Math.min(b.W-w/2-2,x));ctx.fillStyle='rgba(0,0,0,.78)';ctx.beginPath();if(ctx.roundRect)ctx.roundRect(lx-w/2,y-b.R-20,w,15,6);else ctx.rect(lx-w/2,y-b.R-20,w,15);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(label,lx,y-b.R-12.5);}
 }
 function play(result,meta){
  if(playing)playing.stop=true;
  const box=$('pbStage'),canvas=$('pbCanvas'),ctx=canvas.getContext('2d'),b=result.sim.board,list=result.list,n=list.length;
  box.hidden=false;box.scrollIntoView({behavior:'smooth',block:'start'});
  const pickIdx=result.picks.map(id=>list.findIndex(p=>p.memberId===id)),hit=new Set(pickIdx),finish=result.sim.finish;
  const order=result.sim.order;
  $('pbBoard').innerHTML='';$('pbResult').hidden=true;box.hidden=false;
  const st={stop:false,speed:1};playing=st;
  const width=Math.round(canvas.parentElement.getBoundingClientRect().width)||340,scale=width/b.W,viewH=Math.round(Math.min(window.innerHeight*0.62,620)/scale);
  canvas.width=Math.round(b.W*scale*devicePixelRatio);canvas.height=Math.round(viewH*scale*devicePixelRatio);canvas.style.width=width+'px';canvas.style.height=Math.round(viewH*scale)+'px';
  const s=scale*devicePixelRatio;let f=0,cam=0,shown=0;
  $('pbFast').onclick=()=>{st.speed=st.speed===1?3:1;$('pbFast').textContent=st.speed===1?'3배 빠르게':'보통 속도';};
  $('pbSkip').onclick=()=>{f=result.sim.frames.length-1;};
  function tick(){
   if(st.stop)return;
   const frames=result.sim.frames,pos=frames[Math.min(f,frames.length-1)];
   const target=pickIdx.filter(i=>finish[i]>f).sort((a,c)=>finish[a]-finish[c])[0];
   const ty=target===undefined?b.goalY-viewH*.6:pos[2*target+1]-viewH*.45;cam+=((Math.max(0,Math.min(b.height-viewH,ty)))-cam)*.12;
   draw(ctx,b,pos,n,cam,viewH,s,finish,f,target,target===undefined?'':list[target].nickname);
   while(shown<order.length&&finish[order[shown]]<=f){const i=order[shown],p=list[i];const li=document.createElement('li');li.className=hit.has(i)?'pick':'';li.innerHTML='<span>'+(shown+1)+'</span><b>'+esc(p.nickname)+'</b><em>'+(i+1)+'번 공</em>'+(hit.has(i)?'<i>당첨</i>':'');$('pbBoard').prepend(li);shown++;}
   if(f>=frames.length-1&&shown>=order.length){draw(ctx,b,frames[frames.length-1],n,Math.max(0,b.height-viewH),viewH,s,finish,frames.length,undefined,'');finishPlay(result,meta);return;}
   f+=st.speed;requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
 }
 function finishPlay(result,meta){
  const names=result.picks.map(id=>result.list.find(p=>p.memberId===id).nickname);
  $('pbResult').hidden=false;
  $('pbResultTitle').textContent=(meta.mode==='first'?'먼저':'늦게')+' 들어온 '+result.picks.length+'명 · 추첨 번호 '+meta.seed+(result.sim.timedOut?' · 시간 초과로 남은 공은 골에 가까운 순서':'');
  $('pbResultText').value=names.join('\n');
 }
 async function api(path,options){return typeof sharedRequest==='function'?sharedRequest(path,options):(await fetch(path,{cache:'no-store'})).json();}
 async function loadRecords(){try{records=await api('/api/pinball');}catch(e){records={revision:0,draws:[],error:e.message};}renderRecords();}
 function renderRecords(){
  const el=$('pbRecords');if(!el)return;
  if(records.error){el.innerHTML='<p class="sub">'+esc(records.error)+'</p>';return;}
  if(!records.draws.length){el.innerHTML='<p class="sub">아직 기록이 없습니다.</p>';return;}
  el.innerHTML=records.draws.map(d=>{const names=d.picks.map(id=>d.participants.find(p=>p.memberId===id)?.nickname||id);return '<details class="pb-record"><summary><b>'+esc(new Date(d.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+'</b><span>'+(d.mode==='first'?'먼저':'늦게')+' 들어온 '+d.count+'명 · '+fmtN(d.threshold)+'점 이상 '+d.participants.length+'명 · 추첨 번호 '+esc(d.seed)+'</span></summary><ol>'+names.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ol><div class="actions"><button type="button" class="btn ghost" data-replay="'+esc(d.id)+'">다시 보기</button></div></details>';}).join('');
  el.querySelectorAll('[data-replay]').forEach(btn=>btn.onclick=()=>{const d=records.draws.find(x=>x.id===btn.dataset.replay);if(!d)return;const result=run(d.participants,d.seed,d.mode,d.count);
   if(JSON.stringify(result.order)!==JSON.stringify(d.order)){showNoticeSafe('다시 계산한 결과가 기록과 다릅니다. 기록된 순서를 그대로 보여 드립니다.');}
   play(result,d);window.scrollTo({top:$('pbStage').offsetTop-80,behavior:'smooth'});});
 }
 function showNoticeSafe(m){if(typeof showNotice==='function')showNotice(m);else alert(m);}
 async function start(){
  if(typeof ensureAdmin==='function'&&!ensureAdmin())return;
  const list=candidates(),s=settings();if(!list||!list.length)return;
  const count=Math.min(s.count,list.length),seed=Array.from(crypto.getRandomValues(new Uint8Array(4)),x=>x.toString(16).padStart(2,'0')).join('');
  const result=run(list,seed,s.mode,count);
  const drawRec={id:crypto.randomUUID(),seed,threshold:s.threshold,includeFixed:s.includeFixed,mode:s.mode,count,week:carriageVip.view.active?.appliesOn||null,participants:result.list,order:result.order,picks:result.picks,timedOut:result.sim.timedOut};
  $('pbStart').disabled=true;
  try{records=await api('/api/pinball',{method:'POST',body:JSON.stringify({revision:records.revision,mutation:crypto.randomUUID(),draw:drawRec})});renderRecords();}
  catch(e){showNoticeSafe('추첨 기록을 저장하지 못해 추첨을 시작하지 않았습니다. '+e.message);$('pbStart').disabled=false;return;}
  $('pbStart').disabled=false;play(result,drawRec);
 }
 function init(){
  const page=$('pinball');if(!page||page.dataset.ready)return;page.dataset.ready='1';
  page.innerHTML='<div class="card"><h2>핀볼 추첨</h2><p class="sub">길드전 점수 기준 이상인 길드원으로 핀볼을 돌려, 먼저 또는 늦게 골에 들어온 순서대로 뽑습니다. 영구 제외는 항상 빠집니다. 추첨은 관리자만 돌릴 수 있고, 결과는 기록으로 남아 누구나 볼 수 있습니다.</p>'
   +'<div class="formgrid"><div class="field"><label for="pbThreshold">길드전 점수 기준(이상)</label><input id="pbThreshold" inputmode="numeric" value="40,000,000"></div>'
   +'<div class="field"><label for="pbMode">뽑는 방식</label><select id="pbMode"><option value="first">먼저 들어온 사람</option><option value="last">늦게 들어온 사람</option></select></div>'
   +'<div class="field"><label for="pbCount">뽑는 인원</label><input id="pbCount" type="number" min="1" max="150" value="5" inputmode="numeric"></div>'
   +'<div class="field pb-check"><label><input id="pbFixed" type="checkbox" checked> 고정 마차장 포함</label></div></div>'
   +'<p class="sub" id="pbSummary" role="status"></p><div class="actions"><button type="button" class="btn primary" id="pbStart">추첨 시작</button></div></div>'
   +'<div class="card" id="pbStage" hidden><div class="pb-controls"><button type="button" class="smallbtn" id="pbFast">3배 빠르게</button><button type="button" class="smallbtn" id="pbSkip">결과 바로 보기</button></div><div class="pb-stage-grid"><div class="pb-canvas-wrap"><canvas id="pbCanvas" aria-label="핀볼 추첨 화면"></canvas></div><div>'
   +'<div id="pbResult" hidden><h3 id="pbResultTitle"></h3><textarea id="pbResultText" rows="6" readonly></textarea><div class="actions"><button type="button" class="btn ghost" id="pbCopy">결과 복사</button></div></div>'
   +'<h3>골인 순서</h3><ol class="pb-board" id="pbBoard"></ol></div></div></div>'
   +'<div class="card"><h2>추첨 기록</h2><div id="pbRecords"><p class="sub">기록을 불러오는 중입니다.</p></div></div>';
  for(const id of ['pbThreshold','pbMode','pbCount','pbFixed']){$(id).addEventListener('input',summary);$(id).addEventListener('change',summary);}
  $('pbThreshold').addEventListener('blur',()=>{$('pbThreshold').value=fmtN(settings().threshold);summary();});
  $('pbStart').onclick=start;
  $('pbCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('pbResultText').value);showNoticeSafe('결과를 복사했습니다.');}catch{$('pbResultText').select();}};
  summary();loadRecords();
  if(typeof refreshCarriageVip==='function'&&!carriageVip.view)refreshCarriageVip().then(summary,summary);
  const timer=setInterval(()=>{if(carriageVip?.view){summary();clearInterval(timer);}},1000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);
