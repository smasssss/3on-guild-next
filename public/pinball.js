/* 핀볼 추첨 (2026-11-09 사용자 결정)
   - 대상: 이번 길드전 점수 기준 이상인 현재 길드원(영구 제외는 항상 빠짐, 고정 마차장은 선택).
   - 뽑기: 먼저 들어온 N명 또는 늦게 들어온 N명. 결과는 추첨 번호로 미리 계산하고 화면은 그대로 재생합니다.
     같은 추첨 번호·같은 참가자면 언제 다시 돌려도 같은 결과가 나옵니다.
   - 카메라: 뽑히는 사람 중 아직 골인하지 않은 가장 앞선 공을 따라갑니다.
   - 관리자만 추첨을 돌려 기록을 남기고, 기록은 누구나 볼 수 있습니다. */
(function(root){'use strict';

 // ---------- 계산(화면과 무관, 같은 입력이면 같은 결과) ----------
 // 경주형 코스: 출발 통에서 섞은 뒤 문이 열리고, 회전 막대·바람개비·범퍼·경사·핀 구간을 지나 골로 들어갑니다.
 const W=360,R=8,FPS=60,SUB=3,G=900,MAX_SECONDS=180,MIX_FRAMES=150,CHAMBER=150,BUCKET=120;
 function rng(seedHex){let a=parseInt(seedHex,16)>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
 const COURSES=['벚꽃 계곡','회오리 탑','별빛 계단','바람개비 언덕','솜사탕 미로','폭포 협곡','풍선 정원','시계탑 골목','무지개 다리','마차 대로'];
 // 구간 만들기: 각 함수는 y0부터 구간을 만들고 구간 높이를 돌려줍니다.
 const S={
  pegs(o,y0,r){const rows=6+Math.floor(r()*4),gap=36,sp=34+Math.floor(r()*6);for(let k=0;k<rows;k++){const off=k%2?sp/2:0;for(let x=sp/2+off;x<W-6;x+=sp)o.push({t:'c',x,y:y0+30+k*gap,r:4,e:.55});}return 30+rows*gap+20;},
  zigzag(o,y0,r){const n=3+Math.floor(r()*2),h=110;for(let k=0;k<n;k++){const y=y0+30+k*h;if(k%2)o.push({t:'s',x1:W,y1:y,x2:70,y2:y+55});else o.push({t:'s',x1:0,y1:y,x2:W-70,y2:y+55});}return 40+n*h;},
  rotors(o,y0,r){const n=2+Math.floor(r()*2),len=W/n/2-10;for(let k=0;k<n;k++)o.push({t:'rot',cx:(k+.5)*W/n,cy:y0+80,len,w:(k%2?-1:1)*(1.6+r()*1.4),a0:r()*6.28,arms:2});for(let k=0;k<=n;k++)o.push({t:'c',x:k*W/n,y:y0+150,r:6,e:.6});return 190;},
  windmill(o,y0,r){o.push({t:'rot',cx:W/2,cy:y0+130,len:110,w:(r()<.5?-1:1)*(1.1+r()*.8),a0:r()*6.28,arms:4});o.push({t:'c',x:30,y:y0+60,r:10,e:1.1},{t:'c',x:W-30,y:y0+60,r:10,e:1.1},{t:'c',x:30,y:y0+210,r:10,e:1.1},{t:'c',x:W-30,y:y0+210,r:10,e:1.1});return 280;},
  bumpers(o,y0,r){const n=5+Math.floor(r()*4);for(let k=0;k<n;k++)o.push({t:'c',x:40+r()*(W-80),y:y0+40+k*45,r:12+r()*8,e:1.15});return 60+n*45;},
  funnel(o,y0,r){const gap=60+Math.floor(r()*30),h=120;o.push({t:'s',x1:0,y1:y0+20,x2:W/2-gap/2,y2:y0+h},{t:'s',x1:W,y1:y0+20,x2:W/2+gap/2,y2:y0+h});o.push({t:'rot',cx:W/2,cy:y0+h+40,len:gap/2+14,w:(r()<.5?-1:1)*3,a0:0,arms:2});return h+90;},
  slalom(o,y0){const n=4;for(let k=0;k<n;k++){const y=y0+40+k*70,left=k%2===0;o.push({t:'s',x1:left?0:W,y1:y,x2:left?W*.45:W*.55,y2:y+28});o.push({t:'c',x:left?W*.75:W*.25,y:y+20,r:9,e:1});}return 60+n*70;},
  stairs(o,y0,r){const n=5;for(let k=0;k<n;k++){const y=y0+30+k*60,x=(k%2?W*.35:W*.05)+r()*20;o.push({t:'s',x1:x,y1:y,x2:x+W*.55,y2:y+22});}return 50+n*60;},
  spinners(o,y0,r){const rows=3;for(let k=0;k<rows;k++)for(let c=0;c<3;c++)o.push({t:'rot',cx:W*(c+.5)/3+(k%2?20:-20),cy:y0+60+k*90,len:32,w:(c%2?-1:1)*(2.5+r()*1.5),a0:r()*6.28,arms:3});return 60+rows*90;},
  chimney(o,y0){const h=260,gap=110;o.push({t:'s',x1:0,y1:y0+10,x2:W/2-gap/2,y2:y0+60},{t:'s',x1:W,y1:y0+10,x2:W/2+gap/2,y2:y0+60},{t:'s',x1:W/2-gap/2,y1:y0+60,x2:W/2-gap/2,y2:y0+h-40},{t:'s',x1:W/2+gap/2,y1:y0+60,x2:W/2+gap/2,y2:y0+h-40});for(let k=0;k<4;k++)o.push({t:'c',x:W/2+(k%2?18:-18),y:y0+90+k*40,r:7,e:1.05});return h;},
 };
 const RECIPES=[
  ['pegs','rotors','zigzag','bumpers','windmill','pegs','funnel'],
  ['windmill','spinners','slalom','rotors','pegs','chimney','funnel'],
  ['stairs','pegs','rotors','stairs','bumpers','spinners','funnel'],
  ['windmill','zigzag','windmill','pegs','rotors','windmill','funnel'],
  ['slalom','spinners','pegs','slalom','bumpers','zigzag','funnel'],
  ['zigzag','chimney','rotors','zigzag','pegs','chimney','funnel'],
  ['bumpers','pegs','bumpers','windmill','bumpers','rotors','funnel'],
  ['rotors','stairs','spinners','rotors','slalom','pegs','funnel'],
  ['pegs','windmill','spinners','bumpers','zigzag','rotors','funnel'],
  ['zigzag','rotors','pegs','chimney','spinners','windmill','bumpers','funnel'],
 ];
 const boards=new Map();
 function board(course=1){
  if(boards.has(course))return boards.get(course);
  const r=rng((0x9E3779B1*course>>>0).toString(16)),o=[];let y=CHAMBER+20;
  for(const name of RECIPES[(course-1)%RECIPES.length])y+=S[name](o,y,r);
  // 벽과 원형 장애물 사이에 구슬보다 좁은 틈이 생기지 않게 합니다(끼임 방지).
  for(const ob of o)if(ob.t==='c'){if(ob.x-ob.r>0&&ob.x-ob.r<2*R+4)ob.x=0;if(W-ob.x-ob.r>0&&W-ob.x-ob.r<2*R+4)ob.x=W;}
  const goalTop=y+20,goalY=goalTop+170,gap=36;
  o.push({t:'s',x1:0,y1:goalTop,x2:W/2-gap/2,y2:goalY},{t:'s',x1:W,y1:goalTop,x2:W/2+gap/2,y2:goalY});
  // 무거운 계산을 줄이려고 장애물을 높이 구간별로 나눠 둡니다.
  const buckets=new Map();for(const ob of o){const ext=ob.t==='c'?ob.r+R:ob.t==='rot'?ob.len+R:R;const ys=ob.t==='s'?[Math.min(ob.y1,ob.y2)-ext,Math.max(ob.y1,ob.y2)+ext]:[(ob.y??ob.cy)-ext,(ob.y??ob.cy)+ext];for(let k=Math.floor(ys[0]/BUCKET);k<=Math.floor(ys[1]/BUCKET);k++){if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(ob);}}
  const b={W,R,course,name:COURSES[(course-1)%COURSES.length],obstacles:o,buckets,goalY,goalGap:gap,height:goalY+60,chamber:CHAMBER,mixFrames:MIX_FRAMES};
  boards.set(course,b);return b;
 }
 function armsAt(ob,t){const a=ob.a0+ob.w*t,out=[];for(let k=0;k<ob.arms;k++){const ang=a+k*Math.PI*2/ob.arms;out.push([ob.cx,ob.cy,ob.cx+Math.cos(ang)*ob.len,ob.cy+Math.sin(ang)*ob.len]);}return out;}
 function hitSegment(st,i,x1,y1,x2,y2,e,vxs,vys){
  const {x,y,vx,vy}=st,ex=x2-x1,ey=y2-y1,l2=ex*ex+ey*ey||1;let t=((x[i]-x1)*ex+(y[i]-y1)*ey)/l2;t=t<0?0:t>1?1:t;
  const px=x1+ex*t,py=y1+ey*t,dx=x[i]-px,dy=y[i]-py,d2=dx*dx+dy*dy,m=R+1.5;
  if(d2>=m*m||d2<1e-9)return;const d=Math.sqrt(d2),nx=dx/d,ny=dy/d;x[i]=px+nx*m;y[i]=py+ny*m;
  const sx=vxs?vxs(px,py):0,sy=vys?vys(px,py):0,rvx=vx[i]-sx,rvy=vy[i]-sy,vn=rvx*nx+rvy*ny;
  if(vn<0){vx[i]-=(1+e)*vn*nx;vy[i]-=(1+e)*vn*ny;}
 }
 function simulate(count,seedHex,course=1){
  const b=board(course),rand=rng(seedHex),dt=1/(FPS*SUB),maxFrames=FPS*MAX_SECONDS,n=count;
  const st={x:new Float64Array(n),y:new Float64Array(n),vx:new Float64Array(n),vy:new Float64Array(n)},{x,y,vx,vy}=st;
  const done=new Int32Array(n).fill(-1),slow=new Int32Array(n);
  // 출발 통 안에 무작위 배치(추첨 번호로 섞음)
  const cols=Math.floor((W-2*R)/(2*R+3));for(let i=0;i<n;i++){x[i]=R+2+(i%cols)*(2*R+3)+rand()*2;y[i]=CHAMBER-R-2-Math.floor(i/cols)*(2*R+3);vx[i]=(rand()-.5)*60;vy[i]=0;}
  const frames=[],order=[];let frame=0;const cell=2*R,grid=new Map();
  while(order.length<n&&frame<maxFrames){
   const mixing=frame<MIX_FRAMES;
   for(let s=0;s<SUB;s++){
    const t=(frame*SUB+s)*dt;
    for(let i=0;i<n;i++){if(done[i]>=0)continue;
     if(mixing){vx[i]+=(rand()-.5)*2600*dt;vy[i]+=((rand()-.5)*2600-G*.2)*dt;}else vy[i]+=G*dt;
     x[i]+=vx[i]*dt;y[i]+=vy[i]*dt;
     if(x[i]<R){x[i]=R;vx[i]=Math.abs(vx[i])*.6;}if(x[i]>W-R){x[i]=W-R;vx[i]=-Math.abs(vx[i])*.6;}
     if(y[i]<R){y[i]=R;vy[i]=Math.abs(vy[i])*.6;}
     if(mixing&&y[i]>CHAMBER-R){y[i]=CHAMBER-R;vy[i]=-Math.abs(vy[i])*.6;}
     const list=b.buckets.get(Math.floor(y[i]/BUCKET));
     if(list)for(const ob of list){
      if(ob.t==='c'){const dx=x[i]-ob.x,dy=y[i]-ob.y,d2=dx*dx+dy*dy,m=R+ob.r;if(d2<m*m&&d2>1e-9){const d=Math.sqrt(d2),nx=dx/d,ny=dy/d;x[i]=ob.x+nx*m;y[i]=ob.y+ny*m;const vn=vx[i]*nx+vy[i]*ny;if(vn<0){vx[i]-=(1+ob.e)*vn*nx;vy[i]-=(1+ob.e)*vn*ny;vx[i]+=(rand()-.5)*20;}}}
      else if(ob.t==='s')hitSegment(st,i,ob.x1,ob.y1,ob.x2,ob.y2,.35);
      else for(const a of armsAt(ob,t))hitSegment(st,i,a[0],a[1],a[2],a[3],.45,(px,py)=>-ob.w*(py-ob.cy),(px)=>ob.w*(px-ob.cx));
     }
     const sp=Math.hypot(vx[i],vy[i]);if(sp>950){vx[i]*=950/sp;vy[i]*=950/sp;}
     if(!mixing&&y[i]>b.goalY+R){done[i]=frame;order.push(i);}
    }
    grid.clear();for(let i=0;i<n;i++){if(done[i]>=0)continue;const key=Math.floor(x[i]/cell)*100000+Math.floor(y[i]/cell);const l=grid.get(key);if(l)l.push(i);else grid.set(key,[i]);}
    for(let i=0;i<n;i++){if(done[i]>=0)continue;const cx=Math.floor(x[i]/cell),cy=Math.floor(y[i]/cell);
     for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){const l=grid.get((cx+ox)*100000+cy+oy);if(!l)continue;for(const j of l){if(j<=i)continue;const dx=x[j]-x[i],dy=y[j]-y[i],d2=dx*dx+dy*dy,m=2*R;if(d2<m*m&&d2>1e-9){const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,push=(m-d)/2;x[i]-=nx*push;y[i]-=ny*push;x[j]+=nx*push;y[j]+=ny*push;const rv=(vx[j]-vx[i])*nx+(vy[j]-vy[i])*ny;if(rv<0){const imp=-.55*rv;vx[i]-=imp*nx;vy[i]-=imp*ny;vx[j]+=imp*nx;vy[j]+=imp*ny;}}}}}
   }
   // 오래 멈춘 구슬은 살짝 튕겨 줍니다(추첨 번호로 정해진 방향).
   if(!mixing)for(let i=0;i<n;i++){if(done[i]>=0)continue;if(Math.abs(vx[i])+Math.abs(vy[i])<25){if(++slow[i]>90){vx[i]+=(rand()-.5)*300+(x[i]<W/2?160:-160);vy[i]-=150+rand()*150;slow[i]=0;}}else slow[i]=0;}
   const f=new Float32Array(n*2);for(let i=0;i<n;i++){f[2*i]=x[i];f[2*i+1]=done[i]>=0?b.goalY+40:y[i];}frames.push(f);frame++;
  }
  const timedOut=order.length<n;
  if(timedOut){const rest=[];for(let i=0;i<n;i++)if(done[i]<0)rest.push(i);rest.sort((a,c)=>y[c]-y[a]||a-c);for(const i of rest){done[i]=frame;order.push(i);}}
  return {board:b,order,finish:Array.from(done),frames,timedOut};
 }
 // 참가자는 회원 번호 순으로 고정해 같은 추첨 번호면 같은 결과가 나오게 합니다.
 function run(participants,seed,mode,count,course=1){
  const list=participants.slice().sort((a,b)=>a.memberId.localeCompare(b.memberId));
  const sim=simulate(list.length,seed,course),order=sim.order.map(i=>list[i].memberId);
  const picks=mode==='first'?order.slice(0,count):order.slice(order.length-count);
  return {list,sim,order,picks};
 }
 const engine={simulate,run,board,armsAt,COURSES};
 if(typeof module!=='undefined'&&module.exports){module.exports=engine;return;}
 root.pinballEngine=engine;


 // ---------- 화면 ----------
 const $=id=>document.getElementById(id);
 const fmtN=n=>Number(n).toLocaleString('ko-KR');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const palette=['#f59ab8','#6cc58e','#f2b84b','#7fb3ec','#b994ee','#f39168','#58cfc6','#e58ed2','#a5cc5a','#ef9f7b'];
 let records={revision:0,draws:[]},playing=null,manual=new Set(),manualTouched=false,tracks=[];
 // 소리(모두 CC0 공개 저작물, 출처는 /pinball-music/CREDITS.md). 휴대폰은 누르는 순간에만 소리를 낼 수 있어 시작 버튼에서 켭니다.
 const sound={bgm:null,fade:null};
 function soundOn(){return !!$('pbSound')?.checked;}
 function startMusic(seed){
  stopMusic(true);if(!soundOn())return;const pick=$('pbTrack').value,music=tracks.filter(t=>t.kind==='music');
  const n=pick==='auto'?(music.length?1+parseInt(seed,16)%music.length:1):Number(pick);
  const a=new Audio('/pinball-music/bgm'+String(n).padStart(2,'0')+'.mp3?v=2');a.loop=true;a.volume=.55;a.play().catch(()=>{});sound.bgm=a;
 }
 function stopMusic(now){const a=sound.bgm;if(!a)return;clearInterval(sound.fade);if(now){a.pause();sound.bgm=null;return;}sound.fade=setInterval(()=>{a.volume=Math.max(0,a.volume-.05);if(a.volume<=0){a.pause();clearInterval(sound.fade);if(sound.bgm===a)sound.bgm=null;}},120);}
 function effect(name){if(!soundOn())return;const a=new Audio('/pinball-music/'+name+'.mp3?v=2');a.volume=.8;a.play().catch(()=>{});}
 async function loadTracks(){try{tracks=await (await fetch('/pinball-music/tracks.json?v=2')).json();}catch{tracks=[];}const sel=$('pbTrack');if(sel)sel.innerHTML='<option value="auto">추첨마다 자동</option>'+tracks.filter(t=>t.kind==='music').map((t,k)=>'<option value="'+(k+1)+'">'+(k+1)+'. '+esc(t.label||t.title)+'</option>').join('');}
 const view=()=>typeof carriageVip!=='undefined'?carriageVip.view:null;
 function settings(){return {source:document.querySelector('input[name="pbSource"]:checked')?.value||'auto',threshold:Number(String($('pbThreshold').value).replace(/[^0-9]/g,''))||0,includeFixed:$('pbFixed').checked,mode:$('pbMode').value,count:Math.max(1,Number($('pbCount').value)||1),course:$('pbCourse').value,slow:$('pbSlow').checked,speed:Number($('pbSpeed').value)||1};}
 function roster(){
  const v=view();if(!v)return null;const points=new Map((v.active?.rows||[]).map(r=>[r.memberId,r.points]));const fixed=new Set((state.rotationMembers||[]).map(e=>e.memberId));
  return v.members.filter(m=>m.current).map(m=>({memberId:m.memberId,nickname:m.nickname,points:points.get(m.memberId)??0,fixed:fixed.has(m.memberId),excluded:state.vipExcludedMembers?.[m.memberId]===1})).sort((a,b)=>b.points-a.points||a.nickname.localeCompare(b.nickname));
 }
 const autoPick=(all,s)=>all.filter(m=>!m.excluded&&(s.includeFixed||!m.fixed)&&m.points>=s.threshold);
 function candidates(){const all=roster();if(!all)return null;const s=settings();return s.source==='auto'?autoPick(all,s):all.filter(m=>manual.has(m.memberId));}
 function renderManual(){
  const box=$('pbManual'),all=roster();if(!box||!all)return;const q=($('pbSearch').value||'').trim().toLowerCase();
  if(!manualTouched){manual=new Set(autoPick(all,settings()).map(m=>m.memberId));}
  $('pbManualList').innerHTML=all.filter(m=>!q||m.nickname.toLowerCase().includes(q)).map(m=>'<label class="pb-person"><input type="checkbox" value="'+esc(m.memberId)+'"'+(manual.has(m.memberId)?' checked':'')+'><b>'+esc(m.nickname)+'</b><span>'+fmtN(m.points)+'점'+(m.fixed?' · 고정 마차장':'')+(m.excluded?' · 영구 제외':'')+'</span></label>').join('');
  $('pbManualList').querySelectorAll('input').forEach(c=>c.onchange=()=>{manualTouched=true;if(c.checked)manual.add(c.value);else manual.delete(c.value);summary();});
 }
 function summary(){
  const el=$('pbSummary');if(!el)return;const s=settings(),list=candidates();
  $('pbAuto').hidden=s.source!=='auto';$('pbManual').hidden=s.source!=='manual';
  if(!list){el.textContent='길드원 명단과 길드전 점수를 불러오는 중입니다.';$('pbStart').disabled=true;return;}
  const week=view().active?.appliesOn,count=Math.min(s.count,list.length);
  el.textContent=(s.source==='auto'?(week?week+' 주차 길드전 '+fmtN(s.threshold)+'점 이상':'적용 중인 길드전 기록 없음'):'직접 선택')+' · 참가 '+list.length+'명 · '+(s.mode==='first'?'먼저':'늦게')+' 들어온 '+count+'명을 뽑습니다.';
  $('pbStart').disabled=!list.length;
 }
 function drawFrame(ctx,b,res,f,camY,viewH,scale,targetIdx){
  const list=res.list,n=list.length,pos=res.sim.frames[Math.min(Math.floor(f),res.sim.frames.length-1)],finish=res.sim.finish,t=Math.floor(f)/FPS;
  ctx.setTransform(scale,0,0,scale,0,0);ctx.fillStyle='#fffaf0';ctx.fillRect(0,0,b.W,viewH);ctx.translate(0,-camY);
  const top=camY-40,bottom=camY+viewH+40;
  for(const ob of b.obstacles){
   if(ob.t==='c'){if(ob.y<top||ob.y>bottom)continue;ctx.fillStyle=ob.e>1?'#f7b6cb':'#e7a9bf';ctx.beginPath();ctx.arc(ob.x,ob.y,ob.r,0,7);ctx.fill();if(ob.e>1){ctx.strokeStyle='#d6578a';ctx.lineWidth=2;ctx.stroke();}}
   else if(ob.t==='s'){if(Math.max(ob.y1,ob.y2)<top||Math.min(ob.y1,ob.y2)>bottom)continue;ctx.strokeStyle='#c98aa6';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(ob.x1,ob.y1);ctx.lineTo(ob.x2,ob.y2);ctx.stroke();}
   else{if(ob.cy+ob.len<top||ob.cy-ob.len>bottom)continue;ctx.strokeStyle='#8f7bd6';ctx.lineWidth=5;ctx.lineCap='round';for(const a of armsAt(ob,t)){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(a[2],a[3]);ctx.stroke();}ctx.fillStyle='#5b4bb0';ctx.beginPath();ctx.arc(ob.cx,ob.cy,4,0,7);ctx.fill();}
  }
  if(Math.floor(f)<b.mixFrames){ctx.strokeStyle='#d6578a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,b.chamber);ctx.lineTo(b.W,b.chamber);ctx.stroke();}
  ctx.fillStyle='#ffe0ea';ctx.fillRect(b.W/2-b.goalGap/2,b.goalY,b.goalGap,28);ctx.fillStyle='#000';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('골',b.W/2,b.goalY+14);
  ctx.font='bold 8px sans-serif';
  for(let i=0;i<n;i++){if(finish[i]<=f)continue;const x=pos[2*i],y=pos[2*i+1];if(y<top||y>bottom)continue;ctx.fillStyle=palette[i%palette.length];ctx.beginPath();ctx.arc(x,y,b.R,0,7);ctx.fill();if(i===targetIdx){ctx.strokeStyle='#000';ctx.lineWidth=2;ctx.stroke();}ctx.fillStyle='#000';ctx.textAlign=x>b.W-60?'right':'left';ctx.fillText(list[i].nickname.slice(0,8),x>b.W-60?x-b.R-2:x+b.R+2,y);}
  if(targetIdx!==undefined&&finish[targetIdx]>f){const x=pos[2*targetIdx],y=pos[2*targetIdx+1],label=list[targetIdx].nickname;ctx.font='bold 11px sans-serif';const w=ctx.measureText(label).width+12,lx=Math.max(w/2+2,Math.min(b.W-w/2-2,x));ctx.fillStyle='rgba(0,0,0,.8)';ctx.beginPath();if(ctx.roundRect)ctx.roundRect(lx-w/2,y-b.R-22,w,16,6);else ctx.rect(lx-w/2,y-b.R-22,w,16);ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(label,lx,y-b.R-14);}
  // 왼쪽 위 실시간 순위(골인한 순서, 그다음 골에 가까운 순서)
  ctx.setTransform(scale,0,0,scale,0,0);const live=[];for(let k=0;k<res.sim.order.length&&live.length<10;k++){const i=res.sim.order[k];if(finish[i]<=f)live.push(i);}
  if(live.length<10){const rest=[];for(let i=0;i<n;i++)if(finish[i]>f)rest.push(i);rest.sort((a,c)=>pos[2*c+1]-pos[2*a+1]||a-c);for(const i of rest){if(live.length>=10)break;live.push(i);}}
  ctx.fillStyle='rgba(255,255,255,.88)';ctx.fillRect(4,4,118,14+live.length*12);ctx.textAlign='left';ctx.font='bold 9px sans-serif';
  live.forEach((i,k)=>{ctx.fillStyle=finish[i]<=f?'#b03a6a':'#000';ctx.fillText((k+1)+'. '+list[i].nickname.slice(0,10),10,14+k*12);});
  if(Math.floor(f)<b.mixFrames){ctx.fillStyle='rgba(0,0,0,.75)';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillText('섞는 중…',b.W/2,viewH-20);}
 }
 function confetti(){const c=$('pbConfetti'),ctx=c.getContext('2d'),w=c.width=c.clientWidth*devicePixelRatio,h=c.height=c.clientHeight*devicePixelRatio,bits=Array.from({length:120},()=>({x:Math.random()*w,y:-Math.random()*h,v:2+Math.random()*4,s:4+Math.random()*6,c:palette[Math.floor(Math.random()*palette.length)],a:Math.random()*6}));let k=0;(function tick(){ctx.clearRect(0,0,w,h);for(const b of bits){b.y+=b.v*devicePixelRatio;b.a+=.1;ctx.fillStyle=b.c;ctx.fillRect(b.x+Math.sin(b.a)*8,b.y,b.s,b.s*.6);}if(++k<240&&!$('pbPopup').hidden)requestAnimationFrame(tick);else ctx.clearRect(0,0,w,h);})();}
 function play(result,meta){
  if(playing)playing.stop=true;
  if(!sound.bgm)startMusic(meta.seed);
  const box=$('pbStage'),canvas=$('pbCanvas'),ctx=canvas.getContext('2d'),b=result.sim.board,list=result.list;
  box.hidden=false;box.scrollIntoView({behavior:'smooth',block:'start'});
  const pickIdx=result.picks.map(id=>list.findIndex(p=>p.memberId===id)),hit=new Set(pickIdx),finish=result.sim.finish,order=result.sim.order,frames=result.sim.frames;
  $('pbBoard').innerHTML='';$('pbResult').hidden=true;$('pbPopup').hidden=true;$('pbCourseName').textContent=b.course+'번 코스 · '+b.name+' · 추첨 번호 '+meta.seed;
  const st={stop:false};playing=st;
  const width=Math.round(canvas.parentElement.getBoundingClientRect().width)||340,scale=width/b.W,viewH=Math.round(Math.min(window.innerHeight*0.66,640)/scale);
  canvas.width=Math.round(b.W*scale*devicePixelRatio);canvas.height=Math.round(viewH*scale*devicePixelRatio);canvas.style.height=Math.round(viewH*scale)+'px';
  const s=scale*devicePixelRatio;let f=0,cam=0,shown=0;
  $('pbSkip').onclick=()=>{f=frames.length-1;};
  function tick(){
   if(st.stop)return;const fi=Math.min(Math.floor(f),frames.length-1),pos=frames[fi];
   const target=pickIdx.filter(i=>finish[i]>fi).sort((a,c)=>finish[a]-finish[c])[0];
   const ty=fi<b.mixFrames?0:target===undefined?b.height-viewH:pos[2*target+1]-viewH*.45;cam+=(Math.max(0,Math.min(b.height-viewH,ty))-cam)*.12;
   drawFrame(ctx,b,result,fi,cam,viewH,s,target);
   while(shown<order.length&&finish[order[shown]]<=fi){const i=order[shown],p=list[i];const li=document.createElement('li');li.className=hit.has(i)?'pick':'';li.innerHTML='<span>'+(shown+1)+'</span><b>'+esc(p.nickname)+'</b>'+(hit.has(i)?'<i>당첨</i>':'');$('pbBoard').prepend(li);shown++;if(hit.has(i)&&f<frames.length-1)effect('goal');}
   if(fi>=frames.length-1&&shown>=order.length){finishPlay(result,meta);return;}
   const opt=settings(),near=target!==undefined&&pos[2*target+1]>b.goalY-240&&fi>=b.mixFrames;
   f+=opt.speed*(opt.slow&&near?.3:1);requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
 }
 function finishPlay(result,meta){
  const names=result.picks.map(id=>result.list.find(p=>p.memberId===id).nickname),title=(meta.mode==='first'?'먼저':'늦게')+' 들어온 '+result.picks.length+'명';
  $('pbResult').hidden=false;$('pbResultTitle').textContent=title+' · 추첨 번호 '+meta.seed+(result.sim.timedOut?' · 시간 초과로 남은 구슬은 골에 가까운 순서':'');$('pbResultText').value=names.join('\n');
  $('pbPopupNames').innerHTML=names.map(n=>'<li>'+esc(n)+'</li>').join('');$('pbPopupTitle').textContent=title;$('pbPopup').hidden=false;confetti();stopMusic(false);effect('win');
 }
 async function api(path,options){return typeof sharedRequest==='function'?sharedRequest(path,options):(await fetch(path,{cache:'no-store'})).json();}
 async function loadRecords(){try{records=await api('/api/pinball');}catch(e){records={revision:0,draws:[],error:e.message};}renderRecords();}
 function renderRecords(){
  const el=$('pbRecords');if(!el)return;
  if(records.error){el.innerHTML='<p class="sub">'+esc(records.error)+'</p>';return;}
  if(!records.draws.length){el.innerHTML='<p class="sub">아직 기록이 없습니다.</p>';return;}
  el.innerHTML=records.draws.map(d=>{const names=d.picks.map(id=>d.participants.find(p=>p.memberId===id)?.nickname||id);return '<details class="pb-record"><summary><b>'+esc(new Date(d.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+'</b><span>'+(d.source==='manual'?'직접 선택':fmtN(d.threshold)+'점 이상')+' '+d.participants.length+'명 · '+(d.mode==='first'?'먼저':'늦게')+' 들어온 '+d.count+'명 · '+d.course+'번 코스 · 추첨 번호 '+esc(d.seed)+'</span></summary><ol>'+names.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ol><div class="actions"><button type="button" class="btn ghost" data-replay="'+esc(d.id)+'">다시 보기</button></div></details>';}).join('');
  el.querySelectorAll('[data-replay]').forEach(btn=>btn.onclick=()=>{const d=records.draws.find(x=>x.id===btn.dataset.replay);if(!d)return;const result=run(d.participants,d.seed,d.mode,d.count,d.course);
   if(JSON.stringify(result.order)!==JSON.stringify(d.order))showNoticeSafe('다시 계산한 결과가 기록과 다릅니다. 관리자에게 알려 주세요.');startMusic(d.seed);play(result,d);});
 }
 function showNoticeSafe(m){if(typeof showNotice==='function')showNotice(m);else alert(m);}
 async function start(){
  if(typeof ensureAdmin==='function'&&!ensureAdmin())return;
  const list=candidates(),s=settings();if(!list||!list.length)return;
  const count=Math.min(s.count,list.length),seed=Array.from(crypto.getRandomValues(new Uint8Array(4)),x=>x.toString(16).padStart(2,'0')).join('');
  startMusic(seed);
  const course=s.course==='random'?1+parseInt(seed,16)%COURSES.length:Number(s.course);
  const participants=list.map(m=>({memberId:m.memberId,nickname:m.nickname,points:m.points}));
  const result=run(participants,seed,s.mode,count,course);
  const drawRec={id:crypto.randomUUID(),seed,source:s.source,threshold:s.source==='auto'?s.threshold:0,includeFixed:s.includeFixed,mode:s.mode,count,course,week:view().active?.appliesOn||null,participants:result.list,order:result.order,picks:result.picks,timedOut:result.sim.timedOut};
  $('pbStart').disabled=true;
  try{records=await api('/api/pinball',{method:'POST',body:JSON.stringify({revision:records.revision,mutation:crypto.randomUUID(),draw:drawRec})});renderRecords();}
  catch(e){stopMusic(true);showNoticeSafe('추첨 기록을 저장하지 못해 추첨을 시작하지 않았습니다. '+e.message);$('pbStart').disabled=false;return;}
  $('pbStart').disabled=false;play(result,drawRec);
 }
 function init(){
  const page=$('pinball');if(!page||page.dataset.ready)return;page.dataset.ready='1';
  page.innerHTML='<div class="card"><h2>핀볼 추첨</h2><p class="sub">이름이 적힌 구슬들이 코스를 내려와 골에 먼저(또는 늦게) 들어온 순서대로 뽑힙니다. 추첨은 관리자만 돌릴 수 있고, 결과는 기록으로 남아 누구나 볼 수 있습니다.</p>'
   +'<div class="pb-source" role="radiogroup" aria-label="참가자 고르는 방법"><label><input type="radio" name="pbSource" value="auto" checked> 길드전 점수 기준</label><label><input type="radio" name="pbSource" value="manual"> 직접 선택</label></div>'
   +'<div id="pbAuto" class="formgrid"><div class="field"><label for="pbThreshold">길드전 점수 기준(이상)</label><input id="pbThreshold" inputmode="numeric" value="40,000,000"></div><div class="field pb-check"><label><input id="pbFixed" type="checkbox" checked> 고정 마차장 포함 (영구 제외는 항상 빠짐)</label></div></div>'
   +'<div id="pbManual" hidden><div class="field"><label for="pbSearch">이름 검색</label><input id="pbSearch" placeholder="닉네임"></div><div class="actions"><button type="button" class="smallbtn" id="pbSelAuto">점수 기준으로 다시 고르기</button><button type="button" class="smallbtn" id="pbSelAll">모두 선택</button><button type="button" class="smallbtn" id="pbSelNone">모두 해제</button></div><div class="pb-manual-list" id="pbManualList"></div></div>'
   +'<div class="formgrid"><div class="field"><label for="pbCourse">코스</label><select id="pbCourse"><option value="random">무작위 코스</option>'+COURSES.map((n,k)=>'<option value="'+(k+1)+'">'+(k+1)+'. '+n+'</option>').join('')+'</select></div>'
   +'<div class="field"><label for="pbMode">뽑는 방식</label><select id="pbMode"><option value="first">먼저 들어온 사람</option><option value="last">늦게 들어온 사람</option></select></div>'
   +'<div class="field"><label for="pbCount">뽑는 인원</label><input id="pbCount" type="number" min="1" max="150" value="5" inputmode="numeric"></div>'
   +'<div class="field"><label for="pbSpeed">배속</label><select id="pbSpeed"><option value="0.5">0.5배</option><option value="1" selected>1배</option><option value="2">2배</option><option value="3">3배</option></select></div>'
   +'<div class="field pb-check"><label><input id="pbSlow" type="checkbox" checked> 끝나기 전 느린 화면</label></div>'
   +'<div class="field"><label for="pbTrack">배경음악</label><select id="pbTrack"><option value="auto">추첨마다 자동</option></select></div>'
   +'<div class="field pb-check"><label><input id="pbSound" type="checkbox" checked> 소리 켜기</label></div></div>'
   +'<p class="sub" id="pbSummary" role="status"></p><div class="actions"><button type="button" class="btn primary" id="pbStart">추첨 시작</button></div></div>'
   +'<div class="card" id="pbStage" hidden><p class="sub" id="pbCourseName"></p><div class="pb-controls"><button type="button" class="smallbtn" id="pbSkip">결과 바로 보기</button><span class="sub">배속과 느린 화면은 위 설정을 바꾸면 바로 적용됩니다.</span></div>'
   +'<div class="pb-stage-grid"><div class="pb-canvas-wrap"><canvas id="pbCanvas" aria-label="핀볼 추첨 화면"></canvas><div class="pb-popup" id="pbPopup" hidden><canvas id="pbConfetti"></canvas><div class="pb-popup-card"><p>당첨 결과</p><h3 id="pbPopupTitle"></h3><ol id="pbPopupNames"></ol><button type="button" class="btn primary" id="pbPopupClose">확인</button></div></div></div><div>'
   +'<div id="pbResult" hidden><h3 id="pbResultTitle"></h3><textarea id="pbResultText" rows="6" readonly></textarea><div class="actions"><button type="button" class="btn ghost" id="pbCopy">결과 복사</button></div></div>'
   +'<h3>골인 순서</h3><ol class="pb-board" id="pbBoard"></ol></div></div></div>'
   +'<div class="card"><h2>추첨 기록</h2><div id="pbRecords"><p class="sub">기록을 불러오는 중입니다.</p></div></div>';
  page.querySelectorAll('input,select').forEach(el=>{el.addEventListener('input',summary);el.addEventListener('change',summary);});
  page.querySelectorAll('input[name="pbSource"]').forEach(r=>r.addEventListener('change',()=>{renderManual();summary();}));
  $('pbThreshold').addEventListener('blur',()=>{$('pbThreshold').value=fmtN(settings().threshold);if(!manualTouched)renderManual();summary();});
  $('pbSearch').addEventListener('input',renderManual);
  $('pbSelAuto').onclick=()=>{manualTouched=false;renderManual();summary();};
  $('pbSelAll').onclick=()=>{manualTouched=true;manual=new Set((roster()||[]).map(m=>m.memberId));renderManual();summary();};
  $('pbSelNone').onclick=()=>{manualTouched=true;manual=new Set();renderManual();summary();};
  $('pbStart').onclick=start;$('pbPopupClose').onclick=()=>{$('pbPopup').hidden=true;};
  $('pbCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('pbResultText').value);showNoticeSafe('결과를 복사했습니다.');}catch{$('pbResultText').select();}};
  summary();loadRecords();loadTracks();
  $('pbSound').addEventListener('change',()=>{if(!soundOn())stopMusic(true);});
  $('pbPopupClose').addEventListener('click',()=>stopMusic(true));
  if(typeof refreshCarriageVip==='function'&&!view())refreshCarriageVip().then(()=>{renderManual();summary();},summary);
  const timer=setInterval(()=>{if(view()){renderManual();summary();clearInterval(timer);}},1000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);
