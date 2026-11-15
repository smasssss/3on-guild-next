/* 배틀로얄 밀어내기 추첨 (2026-11-15 사용자 결정)
   - 이름이 적힌 공들이 둥근 경기장에서 서로 부딪히고, 경기장 밖으로 밀려나면 탈락합니다.
   - 경기장은 점점 줄어들고, 가운데 회전 막대·튕김 범퍼·충격파가 공을 밀어냅니다.
   - 탈락 순서가 결과입니다. '마지막까지 남은 N명'(늦게) 또는 '먼저 떨어진 N명'(먼저)을 뽑습니다.
   - 핀볼과 같이 추첨 번호로 미리 계산하고 화면은 그대로 재생합니다. 같은 번호·같은 참가자면 언제나 같은 결과입니다.
   - 누가 어느 자리에서 시작할지는 추첨 번호로 무작위로 섞습니다. */
(function(root){'use strict';
 const W=360,R=8,FPS=60,SUB=2,VERSION=1,CX=180,CY=180,END_R=R*2.2;
 function rng(seedHex){let a=parseInt(seedHex,16)>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
 // 경기장: 인원에 맞춘 크기로 시작해 3초 뒤부터 줄어듭니다. 마지막에는 공 하나만 설 수 있는 크기까지 줄어든 뒤 사라집니다.
 function arena(n){const r0=Math.max(64,Math.min(170,R*Math.sqrt(n/.2)));return {W,R,cx:CX,cy:CY,r0,hold:3,shrink:18+n*.3,end:5,n};}
 function radiusAt(a,t){
  if(t<=a.hold)return a.r0;const u=(t-a.hold)/a.shrink;if(u<1)return a.r0-(a.r0-END_R)*u;
  return Math.max(0,END_R*(1-(t-a.hold-a.shrink)/a.end));
 }
 // 가운데 회전 막대(경기장이 넓을 때만), 경기장을 따라 도는 범퍼 3개
 const spinnerLen=rad=>rad>46?rad*.4:0;
 const bumpersAt=(a,rad,t,b0)=>rad>72?[0,1,2].map(k=>{const ang=b0+k*2.0944+t*.35;return [a.cx+Math.cos(ang)*rad*.6,a.cy+Math.sin(ang)*rad*.6,10];}):[];
 // 기기(아이폰·안드로이드·컴퓨터)마다 삼각함수 계산이 끝자리에서 달라질 수 있어, 계산에는 더하기·곱하기·제곱근만으로 만든
 // 함수만 씁니다. 그래야 어느 기기에서 다시 보아도 기록과 똑같은 결과가 나옵니다.
 const TAU=6.283185307179586,PI=3.141592653589793;
 function sinD(v){v-=TAU*Math.floor(v/TAU+.5);if(v>PI/2)v=PI-v;else if(v<-PI/2)v=-PI-v;const q=v*v;return v*(1-q/6*(1-q/20*(1-q/42*(1-q/72*(1-q/110*(1-q/156))))));}
 const cosD=v=>sinD(v+PI/2),dist=(p,q)=>Math.sqrt(p*p+q*q);
 function simulate(count,seedHex){
  const n=count,a=arena(n),rand=rng(seedHex),dt=1/(FPS*SUB);
  const x=new Float64Array(n),y=new Float64Array(n),vx=new Float64Array(n),vy=new Float64Array(n),head=new Float64Array(n);
  const finish=new Array(n).fill(Infinity),order=[],frames=[],events=[];
  // 시작 자리: 해바라기 씨처럼 고르게 편 자리(공 번호는 run()에서 이미 무작위로 섞였습니다)
  for(let i=0;i<n;i++){const rr=(a.r0-R-6)*Math.sqrt((i+.5)/n),th=i*2.39996323+rand()*.3;x[i]=a.cx+cosD(th)*rr;y[i]=a.cy+sinD(th)*rr;head[i]=rand()*6.2832;}
  const spin0=rand()*6.2832,spinW=(rand()<.5?-1:1)*1.7,b0=rand()*6.2832;
  let nextWave=a.hold+3+rand()*3,alive=n,frame=0,tail=0;const cell=2*R,grid=new Map(),maxFrames=Math.ceil((a.hold+a.shrink+a.end)*FPS)+2;
  const out=i=>{finish[i]=frame;order.push(i);alive--;};
  while(frame<maxFrames){
   const t=frame/FPS,rad=radiusAt(a,t);
   if(alive<=1){if(++tail>45)break;}
   // 충격파: 경기장 안 한 곳에서 터져 가까운 공을 바깥으로 밀어냅니다.
   if(alive>1&&t>=nextWave&&rad>52){
    const ang=rand()*6.2832,d=rand()*rad*.45,wx=a.cx+cosD(ang)*d,wy=a.cy+sinD(ang)*d,range=Math.min(120,rad*.8);events.push({frame,x:wx,y:wy,range});
    for(let i=0;i<n;i++){if(finish[i]<=frame)continue;const dx=x[i]-wx,dy=y[i]-wy,dd=dist(dx,dy);if(dd<range){const p=330*(1-dd/range),k=dd>1e-6?1/dd:0;vx[i]+=(k?dx*k:cosD(ang))*p;vy[i]+=(k?dy*k:sinD(ang))*p;}}
    nextWave=t+4.5+rand()*3.5;
   }
   for(let i=0;i<n;i++){if(finish[i]<=frame)continue;head[i]+=(rand()-.5)*.9;}
   const len=spinnerLen(rad),bumps=bumpersAt(a,rad,t,b0);
   for(let s=0;s<SUB;s++){
    const ts=t+s*dt,ang=spin0+spinW*ts;
    for(let i=0;i<n;i++){if(finish[i]<=frame)continue;
     const dx=x[i]-a.cx,dy=y[i]-a.cy,d=dist(dx,dy)||1e-6;
     // 제멋대로 돌아다니다가, 가장자리에 가까워지면 안쪽으로 버팁니다.
     let ax=cosD(head[i])*150,ay=sinD(head[i])*150;
     if(rad>0){const edge=d/rad;if(edge>.62){const pull=300*Math.min(1,(edge-.62)/.38);ax-=dx/d*pull;ay-=dy/d*pull;}}
     vx[i]+=ax*dt;vy[i]+=ay*dt;vx[i]*=1-1.6*dt;vy[i]*=1-1.6*dt;
     x[i]+=vx[i]*dt;y[i]+=vy[i]*dt;
     // 회전 막대(두 팔): 닿으면 막대가 도는 방향으로 밀려납니다.
     if(len>0)for(let k=0;k<2;k++){const ca=cosD(ang+k*Math.PI),sa=sinD(ang+k*Math.PI);let u=((x[i]-a.cx)*ca+(y[i]-a.cy)*sa)/len;u=u<0?0:u>1?1:u;
      const px=a.cx+ca*len*u,py=a.cy+sa*len*u,ex=x[i]-px,ey=y[i]-py,e2=ex*ex+ey*ey,m=R+2.5;
      if(e2<m*m&&e2>1e-9){const e=Math.sqrt(e2),nx=ex/e,ny=ey/e;x[i]=px+nx*m;y[i]=py+ny*m;const sx=-spinW*(py-a.cy),sy=spinW*(px-a.cx),vn=(vx[i]-sx)*nx+(vy[i]-sy)*ny;if(vn<0){vx[i]-=1.6*vn*nx;vy[i]-=1.6*vn*ny;}}}
     for(const b of bumps){const ex=x[i]-b[0],ey=y[i]-b[1],e2=ex*ex+ey*ey,m=R+b[2];if(e2<m*m&&e2>1e-9){const e=Math.sqrt(e2),nx=ex/e,ny=ey/e;x[i]=b[0]+nx*m;y[i]=b[1]+ny*m;const vn=vx[i]*nx+vy[i]*ny;if(vn<0){vx[i]-=2.3*vn*nx;vy[i]-=2.3*vn*ny;}}}
    }
    // 공끼리 부딪힘: 서로 튕겨 냅니다.
    grid.clear();for(let i=0;i<n;i++){if(finish[i]<=frame)continue;const key=Math.floor(x[i]/cell)*100000+Math.floor(y[i]/cell);const l=grid.get(key);if(l)l.push(i);else grid.set(key,[i]);}
    for(let i=0;i<n;i++){if(finish[i]<=frame)continue;const gx=Math.floor(x[i]/cell),gy=Math.floor(y[i]/cell);
     for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){const l=grid.get((gx+ox)*100000+gy+oy);if(!l)continue;for(const j of l){if(j<=i)continue;const dx=x[j]-x[i],dy=y[j]-y[i],d2=dx*dx+dy*dy,m=2*R;
      if(d2<m*m&&d2>1e-9){const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,push=(m-d)/2;x[i]-=nx*push;y[i]-=ny*push;x[j]+=nx*push;y[j]+=ny*push;const rv=(vx[j]-vx[i])*nx+(vy[j]-vy[i])*ny;if(rv<0){const imp=-1.05*rv;vx[i]-=imp*nx;vy[i]-=imp*ny;vx[j]+=imp*nx;vy[j]+=imp*ny;}}}}}
    // 경기장 밖으로 나가면 탈락(중심에서 먼 공부터)
    if(alive>1){const gone=[];for(let i=0;i<n;i++){if(finish[i]<=frame)continue;const d=dist(x[i]-a.cx,y[i]-a.cy);if(d>rad+2)gone.push([d,i]);}
     gone.sort((p,q)=>q[0]-p[0]||p[1]-q[1]);for(const g of gone){if(alive<=1)break;out(g[1]);}}
   }
   const f=new Float32Array(n*2);for(let i=0;i<n;i++){f[2*i]=x[i];f[2*i+1]=y[i];}frames.push(f);frame++;
  }
  // 마지막까지 남은 공이 맨 끝 순서입니다.
  const rest=[];for(let i=0;i<n;i++)if(finish[i]===Infinity)rest.push([dist(x[i]-a.cx,y[i]-a.cy),i]);
  rest.sort((p,q)=>q[0]-p[0]||p[1]-q[1]);for(const g of rest)order.push(g[1]);
  return {arena:a,order,finish,frames,events,spin0,spinW,b0,timedOut:false};
 }
 // 참가자 순서를 추첨 번호로 섞어, 시작 자리와 계산 순서가 매번 달라지게 합니다.
 function run(participants,seed,mode,count){
  const list=participants.slice().sort((p,q)=>p.memberId.localeCompare(q.memberId));
  const mix=rng(((parseInt(seed,16)^0x2f6b3a91)>>>0).toString(16));for(let k=list.length-1;k>0;k--){const j=Math.floor(mix()*(k+1));[list[k],list[j]]=[list[j],list[k]];}
  const sim=simulate(list.length,seed),order=sim.order.map(i=>list[i].memberId);
  const picks=mode==='first'?order.slice(0,count):order.slice(order.length-count);
  return {list,sim,order,picks,game:'arena'};
 }
 // ---------- 그리기(계산과 무관) ----------
 const palette=['#f59ab8','#6cc58e','#f2b84b','#7fb3ec','#b994ee','#f39168','#58cfc6','#e58ed2','#a5cc5a','#ef9f7b'];
 function draw(ctx,res,f,viewH,scale,highlight){
  const sim=res.sim,a=sim.arena,list=res.list,n=list.length,fi=Math.min(Math.floor(f),sim.frames.length-1),pos=sim.frames[fi],t=fi/FPS,rad=radiusAt(a,t);
  ctx.setTransform(scale,0,0,scale,0,0);ctx.fillStyle='#1b1f3a';ctx.fillRect(0,0,W,viewH);
  // 경기장이 줄어들수록 화면을 당겨 보여 줍니다.
  const half=Math.min(W,viewH)/2-8,z=Math.min(3,half/Math.max(rad+16,44));
  ctx.translate(W/2,viewH/2);ctx.scale(z,z);ctx.translate(-a.cx,-a.cy);
  if(rad>0){
   ctx.fillStyle='#fff7e8';ctx.beginPath();ctx.arc(a.cx,a.cy,rad,0,7);ctx.fill();
   ctx.strokeStyle='rgba(230,72,77,.18)';ctx.lineWidth=Math.min(rad,rad*.38);ctx.beginPath();ctx.arc(a.cx,a.cy,rad-Math.min(rad,rad*.38)/2,0,7);ctx.stroke();
   ctx.strokeStyle='#e5484d';ctx.lineWidth=3/z;ctx.beginPath();ctx.arc(a.cx,a.cy,rad,0,7);ctx.stroke();
  }
  const len=spinnerLen(rad);
  if(len>0){const ang=sim.spin0+sim.spinW*t;ctx.strokeStyle='#8f7bd6';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a.cx-Math.cos(ang)*len,a.cy-Math.sin(ang)*len);ctx.lineTo(a.cx+Math.cos(ang)*len,a.cy+Math.sin(ang)*len);ctx.stroke();ctx.fillStyle='#5b4bb0';ctx.beginPath();ctx.arc(a.cx,a.cy,5,0,7);ctx.fill();}
  for(const b of bumpersAt(a,rad,t,sim.b0)){ctx.fillStyle='#ff9f8a';ctx.strokeStyle='#e05a47';ctx.lineWidth=2;ctx.beginPath();ctx.arc(b[0],b[1],b[2],0,7);ctx.fill();ctx.stroke();}
  for(const e of sim.events){const age=fi-e.frame;if(age<0||age>30)continue;ctx.strokeStyle='rgba(242,184,75,'+(1-age/30).toFixed(2)+')';ctx.lineWidth=6*(1-age/30)+1;ctx.beginPath();ctx.arc(e.x,e.y,e.range*(age/30),0,7);ctx.stroke();}
  const font=Math.max(5,8/Math.sqrt(z));ctx.font='bold '+font+'px sans-serif';ctx.textBaseline='middle';
  for(let i=0;i<n;i++){
   const fin=sim.finish[i],gone=fin<=fi,age=gone?fi-fin:0;if(gone&&age>24)continue;
   let px=pos[2*i],py=pos[2*i+1],r=R;
   // 탈락한 공은 바깥으로 떨어지며 작아집니다.
   if(gone){const dx=px-a.cx,dy=py-a.cy,d=Math.hypot(dx,dy)||1;px+=dx/d*age*1.6;py+=dy/d*age*1.6;r=R*(1-age/24);ctx.globalAlpha=1-age/24;}
   ctx.fillStyle=palette[i%palette.length];ctx.beginPath();ctx.arc(px,py,r,0,7);ctx.fill();
   if(i===highlight&&!gone){ctx.strokeStyle='#000';ctx.lineWidth=2/z+1;ctx.stroke();}
   if(!gone){ctx.fillStyle='#000';ctx.textAlign='left';ctx.fillText(list[i].nickname.slice(0,8),px+R+1.5,py);}
   ctx.globalAlpha=1;
  }
  // 화면 고정 안내: 남은 인원, 준비 숫자
  ctx.setTransform(scale,0,0,scale,0,0);let alive=0;for(let i=0;i<n;i++)if(sim.finish[i]>fi)alive++;
  ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(6,6,96,22);ctx.fillStyle='#b03a6a';ctx.font='bold 12px sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('남은 인원 '+alive+'명',12,17);
  if(t<a.hold){ctx.fillStyle='rgba(255,255,255,.9)';ctx.font='bold 40px sans-serif';ctx.textAlign='center';ctx.fillText(String(Math.ceil(a.hold-t)),W/2,viewH-36);ctx.font='bold 12px sans-serif';ctx.fillText('곧 경기장이 줄어듭니다',W/2,viewH-12);}
  return {alive,radius:rad};
 }
 const engine={simulate,run,arena,radiusAt,draw,VERSION,FPS,W};
 if(typeof module!=='undefined'&&module.exports){module.exports=engine;return;}
 root.arenaEngine=engine;
})(typeof window!=='undefined'?window:globalThis);
