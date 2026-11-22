// 런닝머신 레이스 한 판: 물건 정하기(슬롯머신) → 자리 정하기(핀볼) → 경기 → 결과.
// 주소 뒤 #… 에 {seed, racers:[{id,name}], expect?:[id…]} 를 받아 시작합니다. 같은 seed 면 언제나 같은 판입니다.
import {pickKinds,KINDS,RACE_V1,dropFor,MAX_RACERS,MIN_RACERS} from './sim.mjs';
import {createView} from './render.mjs';
const $=id=>document.getElementById(id),wait=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hueOf=i=>`hsl(${(i*47)%360} 85% 60%)`;
let input;try{input=JSON.parse(decodeURIComponent(location.hash.slice(1)));}catch{input=null;}
if(!input||!/^[0-9a-f]{8}$/.test(input.seed||'')||!Array.isArray(input.racers)||input.racers.length<MIN_RACERS||input.racers.length>MAX_RACERS){$('wait').hidden=false;$('waitText').textContent='경기 정보를 읽지 못했습니다.';throw new Error('bad input');}
const {seed,racers}=input,n=racers.length,fast=!!input.fast,q=new URLSearchParams(location.search),version=input.version===1?1:2; // 판 번호가 없는 주문은 최신(2판)
const kinds=pickKinds(seed,n,RACE_V1.carW);
const say=(t,s='')=>{$('title').textContent=t;$('sub').textContent=s;};
const toParent=m=>{try{if(parent!==window)parent.postMessage({source:'treadmill3d',...m},location.origin);}catch{}};

// 계산은 처음부터 뒤에서 돌립니다
const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
let dropData=null,raceData=null,progress=null,failed=null;const waiters=[];
const settle=()=>{for(const w of waiters.splice(0))w();};
worker.onmessage=e=>{const m=e.data;if(m.type==='drop')dropData=m;else if(m.type==='race')raceData=m;else if(m.type==='progress')progress=m;else if(m.type==='error')failed=m.message;settle();};
worker.onerror=e=>{failed=e.message||'계산 오류';settle();};
worker.postMessage({seed,n,version});
const until=async(test,label)=>{while(!test()){if(failed)throw new Error(failed);$('wait').hidden=false;$('waitText').textContent=label();await new Promise(r=>{waiters.push(r);setTimeout(r,500);});}$('wait').hidden=true;};

// 1) 물건 정하기: 1번 자리부터 차례로 멈춥니다
async function slotStage(){
 say('물건 정하기','1번 자리부터 차례로 정해집니다');$('slot').hidden=false;
 const grid=$('slotGrid'),pool=Object.keys(KINDS);grid.innerHTML=kinds.map((k,i)=>`<div class="cell rolling" data-i="${i}"><span class="no">${i+1}</span><img alt="" src="assets/icons/${pool[i%pool.length]}.png"><span class="kind">&nbsp;</span></div>`).join('');
 const cells=[...grid.children];let tick=0;const timer=setInterval(()=>{tick++;for(const c of cells)if(c.classList.contains("rolling"))c.querySelector('img').src=`assets/icons/${pool[(tick+Number(c.dataset.i)*3)%pool.length]}.png`;},70);
 await wait(fast?200:900);
 for(let i=0;i<n;i++){const c=cells[i];c.classList.remove("rolling");c.classList.add("done");if(kinds[i]==='doll')c.classList.add('doll');c.querySelector('img').src=`assets/icons/${kinds[i]}.png`;c.querySelector('.kind').textContent=KINDS[kinds[i]].label;await wait(fast?40:300);}
 clearInterval(timer);await wait(fast?200:1400);$('slot').hidden=true;
}

// 2) 자리 정하기 핀볼: 구멍에 들어간 순서대로 1번 자리부터 주인이 됩니다
async function dropStage(){
 say(version>=2?'섞는 중…':'자리 정하기',version>=2?'바람으로 섞은 뒤 문이 열립니다':'구멍에 들어간 순서대로 1번 자리부터');await until(()=>dropData,()=>'핀볼 준비 중…');
 $('drop').hidden=false;const list=$('dropList');list.innerHTML=kinds.map((k,i)=>`<li><b>${i+1}</b><img alt="" src="assets/icons/${k}.png"><span>—</span></li>`).join('');
 const cv=$('dropCanvas'),g=cv.getContext('2d'),dpr=Math.min(2,devicePixelRatio||1);const W=cv.clientWidth,H=cv.clientHeight;cv.width=W*dpr;cv.height=H*dpr;g.scale(dpr,dpr);
 const d=dropFor(version).spec,pad=14,sc=Math.min((W-pad*2)/(d.w+0.04),(H-pad*2)/(d.h+0.06)),ox=W/2,oy=H-pad-0.02*sc,X=x=>ox+x*sc,Y=y=>oy-y*sc;
 const {frames,stride,walls,events}=dropData,total=frames.length/stride,gateFrame=dropData.gateFrame;
 const draw=f=>{g.clearRect(0,0,W,H);g.fillStyle='#596273';
  for(const w of walls){if(w.gate&&gateFrame!=null&&f>=gateFrame)continue;g.fillStyle=w.gate?'#ffc400':w.box?'#7b8798':'#596273';g.save();g.translate(X(w.cx),Y(w.cy));if(w.bar)g.rotate(-Math.atan2(w.sin,w.cos));else if(w.rot)g.rotate(-w.rot);g.fillRect(-w.hx*sc,-w.hy*sc,w.hx*2*sc,w.hy*2*sc);g.restore();}
  if(gateFrame==null||f<gateFrame){if(d.boxY0!=null){ // 바람: 통 바닥 가운데에서 위로 솟는 줄무늬
    g.save();g.strokeStyle='#9fd8ff';g.lineCap='round';for(let k=0;k<9;k++){const u=((f*0.045+k/9)%1),x=(k%3-1)*d.jetWidth*0.55+Math.sin(f*0.2+k)*0.006,y=d.boxY0+0.012+u*(d.boxY1-d.boxY0-0.04);g.globalAlpha=0.55*(1-u);g.lineWidth=2;g.beginPath();g.moveTo(X(x),Y(y));g.lineTo(X(x),Y(y+0.022));g.stroke();}g.restore();}}
  const o=f*stride,r=d.ballR*sc;g.textAlign='center';
  for(let i=0;i<n;i++){const x=X(frames[o+i*4]),y=Y(frames[o+i*4+1]);if(y>H+r)continue;g.beginPath();g.arc(x,y,r,0,7);g.fillStyle=hueOf(i);g.fill();g.lineWidth=1.5;g.strokeStyle='#0008';g.stroke();}
  g.font=`bold ${Math.max(10,Math.min(13,r*0.95))}px system-ui`;g.lineWidth=3;g.strokeStyle='#000c';g.fillStyle='#fff';
  for(let i=0;i<n;i++){const x=X(frames[o+i*4]),y=Y(frames[o+i*4+1]);if(y>H+r)continue;g.strokeText(racers[i].name,x,y-r-3);g.fillText(racers[i].name,x,y-r-3);}};
 const slow=fast?4:0.4,mixRate=fast?4:1; // 섞는 동안은 제 속도, 문이 열린 뒤에는 천천히
 const frameAt=ms=>{const sec=ms/1000;if(gateFrame==null)return sec*60*slow;const tMix=gateFrame/(60*mixRate);return sec<tMix?sec*60*mixRate:gateFrame+(sec-tMix)*60*slow;};let done=0;const t0=performance.now();
 await new Promise(res=>{const loop=()=>{const f=Math.min(total-1,Math.floor(frameAt(performance.now()-t0)));draw(f);
   if(gateFrame!=null&&f>=gateFrame&&$('title').textContent!=='자리 정하기')say('자리 정하기','구멍에 들어간 순서대로 1번 자리부터');
   while(done<events.length&&events[done].frame<=f){const li=list.children[done];li.classList.add('on');li.querySelector('span').textContent=racers[events[done].i].name;li.querySelector('span').style.color=hueOf(events[done].i);done++;}
   if(f>=total-1)res();else requestAnimationFrame(loop);};loop();});
 await wait(fast?200:1600);$('drop').hidden=true;
}

// 3) 경기
let view=null;
async function raceStage(){
 say('런닝머신 레이스','마지막까지 버티면 1등');await until(()=>raceData,()=>progress?`경기 준비 중… (${Math.round(progress.secs)}초 지점, ${progress.left}명 남음)`:'경기 준비 중…');
 const R=raceData,owner=dropData.order,names=owner.map(i=>racers[i].name); // names[자리] = 그 자리 주인
 if(!view){$('wait').hidden=false;$('waitText').textContent='그림 불러오는 중…';
  const desc={...R.desc,entries:R.desc.entries.map(e=>({...e,wheels:Array.from({length:e.wheels},()=>0)}))};
  view=await createView($('stage'),desc,names,{machine:RACE_V1,highlight:-1,low:q.has('low')});addEventListener('resize',()=>view.resize());$('wait').hidden=true;}
 const total=R.frames.length/R.stride,restarts=R.events.filter(e=>e.type==='restart').map(e=>e.frame),ents=R.desc.entries;
 $('status').hidden=false;const speed=fast?6:1,t0=performance.now();
 await new Promise(res=>{const loop=()=>{const f=Math.min(total-1,Math.floor((performance.now()-t0)/1000*60*speed));
   view.update(R.frames.subarray(f*R.stride,(f+1)*R.stride),R.beltPos[f]);
   const out=ents.filter(e=>e.outAt!=null&&e.outAt<=f).sort((a,b)=>b.outAt-a.outAt),left=n-out.length;
   $('status').textContent=`남은 ${left}명`+(out.length?` · 방금 탈락: ${out.slice(0,3).map(e=>names[e.i]).join(', ')}`:'');
   const rr=restarts.find(x=>f>=x-20&&f<x+110);$('banner').hidden=rr==null;if(rr!=null)$('banner').textContent='10초간 탈락 없음 · 남은 선수 재출발!';
   if(f>=total-1)res();else requestAnimationFrame(loop);};loop();});
 $('status').hidden=true;$('banner').hidden=true;
}

// 4) 결과: 마지막까지 남은 사람이 1등
function ranking(){const owner=dropData.order;return raceData.order.slice().reverse().map((slot,r)=>({rank:r+1,slot,racer:racers[owner[slot]],kind:kinds[slot]}));}
function resultStage(){
 say('결과',raceData.finished?'':'시간이 다 되어 벨트 끝에 가까운 순으로 정했습니다');
 $('resultList').innerHTML=ranking().map(x=>`<li><span class="rk">${x.rank}등</span><img alt="" src="assets/icons/${x.kind}.png"><span>${esc(x.racer.name)}</span></li>`).join('');$('result').hidden=false;
}
$('again').onclick=async()=>{$('result').hidden=true;await raceStage();resultStage();};
$('close').onclick=()=>toParent({type:'close'});

try{
 toParent({type:'started',seed});
 await slotStage();await dropStage();
 await until(()=>raceData,()=>progress?`경기 준비 중… (${Math.round(progress.secs)}초 지점, ${progress.left}명 남음)`:'경기 준비 중…');
 // 결과(탈락 순서)를 먼저 바깥 화면에 알립니다: 기록 저장은 바깥 화면이 합니다
 const res={type:'result',seed,kinds,slots:dropData.order.map(i=>racers[i].id),order:raceData.order.map(slot=>racers[dropData.order[slot]].id),restarts:raceData.restarts,seconds:Math.round(raceData.secs*10)/10,finished:raceData.finished};
 window.__result=res;toParent(res);
 // 새 경기는 바깥 화면이 기록을 저장한 뒤에만 경기를 보여 줍니다(저장 실패면 시작하지 않음)
 if(input.hold){$('wait').hidden=false;$('waitText').textContent='기록 저장 중…';
  const ok=await new Promise(r=>{const h=e=>{if(e.origin!==location.origin||!e.data||e.data.source!=='treadmill-race')return;if(e.data.type==='go'||e.data.type==='abort'){removeEventListener('message',h);r(e.data.type==='go');}};addEventListener('message',h);});
  $('wait').hidden=true;if(!ok)throw new Error('기록을 저장하지 못해 경기를 시작하지 않았습니다.');}
 if(input.expect&&JSON.stringify(input.expect)!==JSON.stringify(res.order)){$('banner').hidden=false;$('banner').textContent='이 기기의 계산이 기록과 다릅니다';await wait(2500);$('banner').hidden=true;}
 await raceStage();resultStage();window.__done=true;toParent({type:'finished'});
}catch(err){console.error(err.stack||err);$('wait').hidden=false;document.querySelector('.spin').style.display='none';$('waitText').textContent='문제가 생겼습니다: '+(err.message||err);toParent({type:'error',message:String(err.message||err)});}
