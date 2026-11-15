/* 러닝머신 경주 추첨 (2026-11-15 사용자 결정)
   - 러닝머신 벨트 위에 이름표가 붙은 물건(자동차·테이프·공·캔·휴지·수박)을 올려 두고, 벨트 끝으로 떨어지면 탈락합니다.
   - 인원이 많으면 10명 안팎의 조로 나눠 예선을 치르고, 조마다 끝까지 버틴 물건이 다음 라운드(결승)로 올라갑니다.
   - 전체 탈락 순서가 결과입니다. '마지막까지 남은 N명'(늦게)이 기본이고 '먼저 떨어진 N명'(먼저)도 뽑을 수 있습니다.
   - 누가 어떤 물건을 받고 어느 조·어느 자리에 서는지는 추첨 번호로 무작위로 정합니다. 같은 번호면 언제나 같은 결과입니다.
   - 계산에는 더하기·곱하기·제곱근만 써서 어느 기기에서 다시 보아도 기록과 같습니다. */
(function(root){'use strict';
 const FPS=60,SUB=2,VERSION=1,BW=200,BL=420,HEAT=10,MAX_SECONDS=45;
 function rng(seedHex){let a=parseInt(seedHex,16)>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
 // 물건 종류: 자동차는 스스로 달리지만 벨트가 빨라지면 밀려나고 가끔 미끄러집니다. 구르는 물건은 벨트에 덜 끌려가고 가끔 앞으로 튀어 오릅니다.
 const TYPES={
  car:{name:'자동차',r:13,mass:1.5,drive:true,top:[242,362],slip:.24,c:1.6,e:.35},
  tape:{name:'테이프',r:13,mass:1.2,c:.30,kick:[1.6,3.0],power:[70,165],e:.6},
  can:{name:'캔',r:10,mass:.9,c:.34,kick:[1.2,2.4],power:[60,150],e:.65},
  ball:{name:'공',r:11,mass:.6,c:.26,kick:[1.0,2.2],power:[35,105],e:.85},
  tissue:{name:'휴지',r:12,mass:.7,c:.32,kick:[1.4,2.8],power:[65,165],e:.5},
  melon:{name:'수박',r:14,mass:1.8,c:.28,kick:[1.9,3.5],power:[75,180],e:.45},
 };
 const TYPE_KEYS=Object.keys(TYPES);
 // 벨트 속도: 예선은 빨리, 결승은 조금 천천히 빨라집니다.
 const V0=[115,100],RAMP=[28,16],beltSpeed=(t,final)=>V0[final?1:0]+RAMP[final?1:0]*t;
 // 조 편성: 한 번에 HEAT명 안팎. 조마다 올라가는 인원은 다음 라운드가 결승(12명 이하)이 되도록 정합니다.
 function plan(m){if(m<=HEAT+2)return null;const heats=Math.ceil(m/HEAT);return {heats,advance:heats>HEAT?2:Math.max(1,Math.round(HEAT/heats))};}
 function race(members,objs,seedHex,final,advance){
  const n=members.length,rand=rng(seedHex),dt=1/(FPS*SUB);
  const x=new Float64Array(n),y=new Float64Array(n),vx=new Float64Array(n),vy=new Float64Array(n),u=new Float64Array(n),slipT=new Float64Array(n),nextKick=new Float64Array(n),hold=new Float64Array(n);
  const finish=new Array(n).fill(Infinity),out=[],frames=[],kicks=[];
  const cols=Math.min(n,4),spots=[];for(let k=0;k<n;k++)spots.push(k);for(let k=n-1;k>0;k--){const j=Math.floor(rand()*(k+1));[spots[k],spots[j]]=[spots[j],spots[k]];}
  for(let i=0;i<n;i++){const s=spots[i],row=Math.floor(s/cols),col=s%cols,o=objs[i],T=TYPES[o.type];x[i]=BW*(col+.5)/cols+(rand()-.5)*10;y[i]=95+row*72+(rand()-.5)*14;vy[i]=0;hold[i]=60+rand()*150;
   nextKick[i]=T.drive?0:.6+rand()*T.kick[1];}
  let alive=n,frame=0,tail=0;const stopAt=final?1:advance,maxFrames=MAX_SECONDS*FPS;
  while(frame<maxFrames){
   const t=frame/FPS,vb=beltSpeed(t,final);
   if(alive<=stopAt){if(++tail>40)break;}
   for(let i=0;i<n;i++){if(finish[i]<=frame)continue;const o=objs[i],T=TYPES[o.type];
    if(T.drive){
     // 자동차: 제자리를 지키려고 달립니다. 가끔 미끄러져(1초쯤) 힘을 잃고, 좌우로 흔들립니다.
     if(slipT[i]>0)slipT[i]-=1/FPS;else if(rand()<T.slip/FPS){slipT[i]=.7+rand()*.6;kicks.push({frame,i,kind:'slip'});}
     const want=Math.max(0,Math.min(o.top,vb+(y[i]-hold[i])*1.6)),grip=slipT[i]>0?.25:1;u[i]+=(want*grip-u[i])*Math.min(1,4/FPS);
     vx[i]+=(rand()-.5)*(slipT[i]>0?260:70)/FPS*6;
    }else if(t>=nextKick[i]){
     // 구르는 물건: 가끔 앞으로 튀어 오릅니다(뒤쪽에 있을수록 조금 더 세게).
     const p=(T.power[0]+rand()*(T.power[1]-T.power[0]))*o.pep*(1+.3*y[i]/BL);vy[i]-=p;vx[i]+=(rand()-.5)*150;nextKick[i]=t+T.kick[0]+rand()*(T.kick[1]-T.kick[0]);if(p>120)kicks.push({frame,i,kind:'hop'});
    }
   }
   for(let s=0;s<SUB;s++){
    for(let i=0;i<n;i++){if(finish[i]<=frame)continue;const o=objs[i],T=TYPES[o.type],c=T.c*o.grip;
     if(T.drive){vy[i]+=((vb-u[i])-vy[i])*Math.min(1,c*6*dt);vx[i]*=1-2.2*dt;}
     else{vy[i]+=c*(vb-vy[i])*dt;vx[i]*=1-(.5+c)*dt;}
     x[i]+=vx[i]*dt;y[i]+=vy[i]*dt;
     if(x[i]<T.r){x[i]=T.r;vx[i]=Math.abs(vx[i])*.7;}else if(x[i]>BW-T.r){x[i]=BW-T.r;vx[i]=-Math.abs(vx[i])*.7;}
     if(y[i]<T.r){y[i]=T.r;if(vy[i]<0)vy[i]=-vy[i]*.4;}
    }
    for(let i=0;i<n;i++){if(finish[i]<=frame)continue;const Ti=TYPES[objs[i].type];
     for(let j=i+1;j<n;j++){if(finish[j]<=frame)continue;const Tj=TYPES[objs[j].type],dx=x[j]-x[i],dy=y[j]-y[i],d2=dx*dx+dy*dy,m=Ti.r+Tj.r;
      if(d2<m*m&&d2>1e-9){const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,mi=Ti.mass,mj=Tj.mass,push=m-d;x[i]-=nx*push*mj/(mi+mj);y[i]-=ny*push*mj/(mi+mj);x[j]+=nx*push*mi/(mi+mj);y[j]+=ny*push*mi/(mi+mj);
       const rv=(vx[j]-vx[i])*nx+(vy[j]-vy[i])*ny;if(rv<0){const imp=-(1+(Ti.e+Tj.e)/2)*rv/(1/mi+1/mj);vx[i]-=imp/mi*nx;vy[i]-=imp/mi*ny;vx[j]+=imp/mj*nx;vy[j]+=imp/mj*ny;}}}}
    // 벨트 끝을 넘어가면 탈락(더 많이 넘어간 물건부터)
    if(alive>stopAt){const gone=[];for(let i=0;i<n;i++){if(finish[i]<=frame)continue;if(y[i]>BL+TYPES[objs[i].type].r*.3)gone.push([y[i],i]);}
     gone.sort((p,q)=>q[0]-p[0]||p[1]-q[1]);for(const g of gone){if(alive<=stopAt)break;finish[g[1]]=frame;out.push(g[1]);alive--;}}
   }
   const f=new Float32Array(n*2);for(let i=0;i<n;i++){f[2*i]=x[i];f[2*i+1]=y[i];}frames.push(f);frame++;
  }
  // 시간 안에 안 끝나면(거의 없음) 벨트 끝에 가까운 물건부터 탈락으로 칩니다.
  if(alive>stopAt){const rest=[];for(let i=0;i<n;i++)if(finish[i]===Infinity)rest.push([y[i],i]);rest.sort((p,q)=>q[0]-p[0]||p[1]-q[1]);while(alive>stopAt){const g=rest.shift();finish[g[1]]=frame;out.push(g[1]);alive--;}}
  const stay=[];for(let i=0;i<n;i++)if(finish[i]===Infinity)stay.push(i);
  return {members,final,advance:stopAt,frames,finish,out,stay,kicks};
 }
 function run(participants,seed,mode,count){
  const list=participants.slice().sort((p,q)=>p.memberId.localeCompare(q.memberId)),rand=rng(((parseInt(seed,16)^0x51a7c3e9)>>>0).toString(16));
  const shuffle=a=>{for(let k=a.length-1;k>0;k--){const j=Math.floor(rand()*(k+1));[a[k],a[j]]=[a[j],a[k]];}return a;};
  shuffle(list);
  // 물건 배정: 종류가 고르게 나오도록 돌려 가며 섞고, 물건마다 조금씩 다른 성질을 줍니다(대회 내내 같은 물건).
  const kinds=shuffle(list.map((_,k)=>TYPE_KEYS[k%TYPE_KEYS.length]));
  const objs=list.map((_,k)=>{const T=TYPES[kinds[k]];return {type:kinds[k],grip:.8+rand()*.45,pep:.75+rand()*.5,top:T.drive?T.top[0]+rand()*(T.top[1]-T.top[0]):0,hue:Math.floor(rand()*360)};});
  const races=[],order=[];let current=list.map((_,k)=>k),round=1,serial=0;
  for(;;){
   const p=plan(current.length),sub=k=>((parseInt(seed,16)+0x9e3779b9*(++serial+k))>>>0).toString(16).padStart(8,'0');
   if(!p){const r=race(current,current.map(i=>objs[i]),sub(0),true,1);r.round=round;r.heat=1;r.heats=1;races.push(r);for(const i of r.out)order.push(current[i]);for(const i of r.stay)order.push(current[i]);break;}
   shuffle(current);const next=[],losers=[];
   for(let h=0;h<p.heats;h++){const members=current.filter((_,k)=>k%p.heats===h),r=race(members,members.map(i=>objs[i]),sub(h),false,Math.min(p.advance,members.length-1));
    r.round=round;r.heat=h+1;r.heats=p.heats;races.push(r);for(const i of r.out)losers.push([r.finish[i],h,members[i]]);for(const i of r.stay)next.push(members[i]);}
   // 같은 라운드 탈락자끼리는 더 오래 버틴 쪽이 뒤 순서입니다.
   losers.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);for(const l of losers)order.push(l[2]);
   current=next;round++;
  }
  const ids=order.map(i=>list[i].memberId),picks=mode==='first'?ids.slice(0,count):ids.slice(ids.length-count);
  return {list,objs,races,rounds:round,order:ids,picks,game:'treadmill',sim:{timedOut:false}};
 }
 // ---------- 중계 문장(계산 결과에서 만들며 결과에는 영향 없음) ----------
 // 경주마다 [프레임, 자막, 읽어 줄 말, 중요도] 목록을 만듭니다. 같은 추첨이면 같은 문장이 나옵니다.
 function commentary(res,seed){
  const rand=rng(((parseInt(seed,16)^0x7c15a3d1)>>>0).toString(16)),pick=a=>a[Math.floor(rand()*a.length)],nick=i=>res.list[i].nickname,kind=i=>TYPES[res.objs[i].type].name;
  const total=res.races.length;
  return res.races.map(rc=>{
   const lines=[],who=i=>rc.members[i],n=rc.members.length;let last=-999;
   const add=(frame,text,say,major)=>{if(!major&&frame-last<130)return;lines.push({frame,text,say:say||text,major:!!major});last=frame;};
   add(0,rc.final?(total>1?'결승전! 끝까지 버티면 우승!':'출발! 끝까지 버티면 우승!'):rc.round+'라운드 '+rc.heat+'조 출발!',rc.final?'결승전입니다. 끝까지 버티면 우승!':rc.round+'라운드 '+rc.heat+'조, 출발!',true);
   const events=[...rc.out.map((i,pos)=>({frame:rc.finish[i],i,kind:'out',left:n-pos-1})),...rc.kicks.map(e=>({...e}))].sort((a,b)=>a.frame-b.frame||(a.kind==='out'?-1:1));
   for(const e of events){const name=nick(who(e.i));
    if(e.kind==='out'){
     const text=pick([name+' 탈락!',name+', 떨어집니다!','아! '+name+' 밀려났어요!',kind(who(e.i))+' '+name+' 아웃!']);
     if(rc.final&&e.left===2)add(e.frame,text+' TOP 2만 남았네요!',name+' 탈락! 이제 둘만 남았습니다!',true);
     else if(rc.final&&e.left===3)add(e.frame,text+' 이제 TOP 3!',name+' 탈락! 톱 쓰리!',true);
     else add(e.frame,text,name+' 탈락!',e.left<=Math.max(2,rc.advance+1));
    }else if(e.kind==='hop')add(e.frame,pick([name+' 튀어 오릅니다!',name+', 앞으로 점프!',kind(who(e.i))+' '+name+' 살아납니다!']),name+' 튀어 오릅니다!',false);
    else add(e.frame,pick([name+' 미끄러집니다!',name+', 휘청!',name+' 위험해요!']),name+' 미끄러집니다!',false);
   }
   const stay=rc.stay.map(i=>nick(who(i))),end=rc.frames.length-1;
   if(rc.final)lines.push({frame:end,text:'우승은 '+stay[0]+'!',say:'우승은 '+stay[0]+'!',major:true});
   else lines.push({frame:end,text:stay.join(', ')+' 진출!',say:stay.slice(0,3).join(', ')+' 진출!',major:true});
   return lines;});
 }
 // ---------- 그리기(계산과 무관): 벨트 끝에서 앞쪽을 내려다보는 화면 ----------
 const W=360,F=560,NEAR=158;
 function drawObject(ctx,type,R,hue,spin){
  if(type==='car'){
   ctx.fillStyle='#16181d';ctx.fillRect(-R*1.05,R*.25,R*.32,R*.6);ctx.fillRect(R*.73,R*.25,R*.32,R*.6);
   ctx.fillStyle='hsl('+hue+',72%,54%)';ctx.beginPath();ctx.roundRect(-R*.95,-R*.35,R*1.9,R*1.05,R*.25);ctx.fill();
   ctx.fillStyle='hsl('+hue+',72%,40%)';ctx.beginPath();ctx.roundRect(-R*.68,-R*.85,R*1.36,R*.7,R*.22);ctx.fill();
   ctx.fillStyle='#bfe3ff';ctx.beginPath();ctx.roundRect(-R*.52,-R*.72,R*1.04,R*.4,R*.1);ctx.fill();
   ctx.fillStyle='#ff4d4d';ctx.fillRect(-R*.85,R*.05,R*.3,R*.2);ctx.fillRect(R*.55,R*.05,R*.3,R*.2);return;
  }
  ctx.rotate(spin);
  if(type==='tape'){ctx.fillStyle='#f2c230';ctx.beginPath();ctx.arc(0,0,R,0,7);ctx.fill();ctx.fillStyle='#1c1c1c';for(let k=0;k<6;k++){ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,R,k*1.0472,k*1.0472+.5);ctx.closePath();ctx.fill();}ctx.fillStyle='#3a3f4b';ctx.beginPath();ctx.arc(0,0,R*.48,0,7);ctx.fill();}
  else if(type==='can'){ctx.fillStyle='#d9dde3';ctx.beginPath();ctx.arc(0,0,R,0,7);ctx.fill();ctx.fillStyle='#e23b3b';ctx.beginPath();ctx.arc(0,0,R*.8,0,7);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=R*.2;ctx.beginPath();ctx.arc(0,R*.5,R*.6,3.6,5.8);ctx.stroke();}
  else if(type==='ball'){const cols=['#ffffff','hsl('+hue+',80%,60%)','#ffd54a'];for(let k=0;k<6;k++){ctx.fillStyle=cols[k%3];ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,R,k*1.0472,(k+1)*1.0472+.02);ctx.closePath();ctx.fill();}ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,R*.2,0,7);ctx.fill();}
  else if(type==='tissue'){ctx.fillStyle='#fdfdfd';ctx.beginPath();ctx.arc(0,0,R,0,7);ctx.fill();ctx.strokeStyle='#d5d9e0';ctx.lineWidth=1;for(const q of [.8,.62]){ctx.beginPath();ctx.arc(0,0,R*q,0,7);ctx.stroke();}ctx.fillStyle='#b98d63';ctx.beginPath();ctx.arc(0,0,R*.38,0,7);ctx.fill();ctx.fillStyle='#fdfdfd';ctx.fillRect(R*.55,-R*.1,R*.6,R*.3);}
  else{ctx.fillStyle='#3fa34d';ctx.beginPath();ctx.arc(0,0,R,0,7);ctx.fill();ctx.strokeStyle='#1f6b2c';ctx.lineWidth=R*.2;for(const q of [-.55,0,.55]){ctx.beginPath();ctx.ellipse(q*R,0,R*.16,R*.92,0,0,7);ctx.stroke();}}
 }
 function draw(ctx,res,k,f,viewH,scale,caption){
  const rc=res.races[k],fi=Math.min(Math.floor(f),rc.frames.length-1),pos=rc.frames[fi],t=fi/FPS,n=rc.members.length;
  const yb=viewH-34,yFar=viewH*.3,sFar=F/(F+BL),hor=(yFar-yb*sFar)/(1-sFar),sc=y=>F/(F+BL-y),px=(x,y)=>W/2+(x-BW/2)*(NEAR*2/BW)*sc(y),py=y=>hor+(yb-hor)*sc(y);
  ctx.setTransform(scale,0,0,scale,0,0);const g=ctx.createLinearGradient(0,0,0,viewH);g.addColorStop(0,'#10121c');g.addColorStop(1,'#1d2233');ctx.fillStyle=g;ctx.fillRect(0,0,W,viewH);
  // 러닝머신 앞쪽 계기판
  ctx.fillStyle='#2a3046';ctx.beginPath();ctx.roundRect(W/2-78,yFar-46,156,40,8);ctx.fill();ctx.fillStyle='#58cfc6';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('속도 '+(beltSpeed(t,rc.final)/20).toFixed(1),W/2,yFar-26);
  // 벨트와 흐르는 줄무늬
  ctx.fillStyle='#262a35';ctx.beginPath();ctx.moveTo(px(0,0),py(0));ctx.lineTo(px(BW,0),py(0));ctx.lineTo(px(BW,BL),py(BL));ctx.lineTo(px(0,BL),py(BL));ctx.closePath();ctx.fill();
  const travel=V0[rc.final?1:0]*t+RAMP[rc.final?1:0]*t*t/2;ctx.strokeStyle='rgba(255,255,255,.09)';
  for(let q=0;q<11;q++){const y=(q*42+travel)%(BL+42)-21;if(y<0||y>BL)continue;ctx.lineWidth=3*sc(y);ctx.beginPath();ctx.moveTo(px(0,y),py(y));ctx.lineTo(px(BW,y),py(y));ctx.stroke();}
  // 무지개 네온 난간
  for(let q=0;q<24;q++){const y0=q*BL/24,y1=(q+1)*BL/24;ctx.strokeStyle='hsl('+((q*15+t*60)%360)+',95%,60%)';ctx.lineWidth=7*sc(y1);ctx.lineCap='round';for(const x of [-6,BW+6]){ctx.beginPath();ctx.moveTo(px(x,y0),py(y0));ctx.lineTo(px(x,y1),py(y1));ctx.stroke();}}
  ctx.strokeStyle='#e5484d';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(px(0,BL),py(BL));ctx.lineTo(px(BW,BL),py(BL));ctx.stroke();
  // 물건: 먼 것부터 그립니다. 떨어진 물건은 아래로 떨어지며 사라집니다.
  const idx=[];for(let i=0;i<n;i++)idx.push(i);idx.sort((a,b)=>pos[2*a+1]-pos[2*b+1]);let alive=0;
  for(const i of idx){const fin=rc.finish[i],gone=fin<=fi,age=gone?fi-fin:0;if(gone&&age>26)continue;if(!gone)alive++;
   const o=res.objs[rc.members[i]],T=TYPES[o.type],x=pos[2*i],y=Math.min(pos[2*i+1],BL+T.r),s=sc(y)*(NEAR*2/BW),R=T.r*s,sx=px(x,y),sy=py(y)-R*.9+(gone?age*age*.5:0);
   ctx.globalAlpha=gone?Math.max(0,1-age/26):1;
   if(!gone){ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(sx,py(y)+R*.1,R*1.05,R*.35,0,0,7);ctx.fill();}
   ctx.save();ctx.translate(sx,sy);drawObject(ctx,o.type,R,o.hue,T.drive?0:(travel-y)/T.r*.35+i+(gone?age*.3:0));ctx.restore();
   const label=res.list[rc.members[i]].nickname.slice(0,9);ctx.font='bold '+Math.max(8,Math.round(7+5*sc(y)))+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.75)';ctx.strokeText(label,sx,sy-R-2);ctx.fillStyle='#fff';ctx.fillText(label,sx,sy-R-2);
   ctx.globalAlpha=1;}
  // 화면 고정: 라운드 표시, 큰 자막
  const total=res.races.length,title=(rc.final?(total>1?'결승':'경주'):rc.round+'라운드 '+rc.heat+'조')+(total>1?' · '+(k+1)+'/'+total:'')+' · 남은 '+alive;
  ctx.fillStyle='rgba(255,255,255,.92)';ctx.font='bold 11px sans-serif';const tw=ctx.measureText(title).width+16;ctx.beginPath();ctx.roundRect(W/2-tw/2,8,tw,20,6);ctx.fill();ctx.fillStyle='#1d2233';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(title,W/2,18);
  if(caption){ctx.font='bold 19px sans-serif';let text=caption;while(ctx.measureText(text).width>W-36&&text.length>4)text=text.slice(0,-2);const cw=ctx.measureText(text).width+22;ctx.fillStyle='rgba(255,255,255,.96)';ctx.beginPath();ctx.roundRect(W/2-cw/2,36,cw,32,9);ctx.fill();ctx.fillStyle='#111';ctx.fillText(text,W/2,53);}
  return {alive};
 }
 const engine={run,race,plan,beltSpeed,commentary,draw,TYPES,TYPE_KEYS,VERSION,FPS,BW,BL,W};
 if(typeof module!=='undefined'&&module.exports){module.exports=engine;return;}
 root.treadmillEngine=engine;
})(typeof window!=='undefined'?window:globalThis);
