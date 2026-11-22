// 런닝머신 레이스 물리 (Rapier deterministic: 어느 기기에서나 같은 결과).
// 우리가 정하는 것: 실제 물건의 크기·무게·재질(마찰·튕김), 런닝머신의 벨트 속도와 기울기.
// 구르기·미끄러짐·부딪힘·떨어짐은 전부 물리엔진이 계산합니다. 모터는 벨트에만 있습니다.
// 좌표(미터): z=0 본체 덮개(카메라 쪽) → z=LEN 벨트 끝(여기서 떨어짐). 기울기는 덮개 쪽이 낮습니다(중력을 기울여 계산).
export const HZ = 240, DT = 1/HZ;
export const MACHINE = {len:1.4,width:0.9,spinUp:0.6,startDelay:1.6,stuckSeconds:20,hoodR:0.12,carRear:0.12,wheelR:0.014,lengthUnit:0.05,
 // 기울기는 고정(덮개 쪽이 낮음), 벨트는 빠르게 일정한 속도
 tiltDeg:3,tiltEndDeg:null,tiltSeconds:0,speed:1.6,
 // 오목하게 휜 벨트(곡면 런닝머신): tiltFarDeg 가 있으면 덮개 쪽 기울기 tiltDeg 에서 끝쪽 기울기 tiltFarDeg 까지 고르게 변함
 tiltFarDeg:null,
 // 벨트는 통짜가 아니라 세로 띠 여러 장을 이어 붙인 것: 띠 사이 세로 이음매는 지그재그, 가로 이음매는 사선. 턱 높이(m)
 strips:9,zigAmp:0.018,zigPeriods:8,seamLong:0.003,seamLongR:0.025,seamCross:0.012,seamCrossR:0.02,crossCount:2,crossAngleDeg:45,crossReach:0.10,chevGap:0.10,
 // 살짝 튕기는 벨트 바닥·덮개·난간(튕김 정도 0~1)
 beltRest:0.3,hoodRest:0.45,railRest:0.45};

export const KINDS = {
 orange:    {label:'오렌지',shape:'ball',r:0.040,ax:0.93,off:0.06,mass:0.18,friction:0.8,restitution:0.35},
 baseball:  {label:'야구공',shape:'ball',r:0.037,ax:1.08,off:0.03,mass:0.145,friction:0.7,restitution:0.5},
 watermelon:{label:'미니 수박',shape:'ball',r:0.052,ax:1.10,off:0.05,mass:0.75,friction:0.8,restitution:0.2},
 can:       {label:'참치캔',shape:'cyl',r:0.042,ri:0,h:0.036,mass:0.17,friction:0.45,restitution:0.25},
 tissue:    {label:'두루마리 휴지',shape:'cyl',r:0.054,ri:0.021,h:0.10,mass:0.11,friction:0.9,restitution:0.12},
 tape:      {label:'박스테이프',shape:'cyl',r:0.050,ri:0.038,h:0.048,mass:0.12,friction:0.6,restitution:0.3},
 sedan:     {label:'승용차',shape:'car',len:0.105,wid:0.046,hei:0.030,mass:0.11,friction:0.9},
 racer:     {label:'레이싱카',shape:'car',len:0.115,wid:0.050,hei:0.024,mass:0.10,friction:0.9},
 kei:       {label:'경차',shape:'car',len:0.080,wid:0.042,hei:0.034,mass:0.09,friction:0.9},
 doll:      {label:'핵불잙 인형',shape:'doll',r:0.050,mass:0.07,friction:0.95,restitution:0.05},
};
export const POOL = ['orange','baseball','watermelon','can','tissue','tape','sedan','racer','kei','doll'];

// 어느 기기에서 다시 계산해도 결과가 같도록, 삼각함수·지수함수는 사칙연산만으로 계산합니다(제곱근은 모든 기기에서 같은 값).
const TAU=6.283185307179586,HALF_PI=1.5707963267948966;
export function dsin(x){x-=TAU*Math.round(x/TAU);if(x>HALF_PI)x=Math.PI-x;else if(x<-HALF_PI)x=-Math.PI-x;const y=x*x;
 return x*(1+y*(-1/6+y*(1/120+y*(-1/5040+y*(1/362880+y*(-1/39916800+y*(1/6227020800+y*(-1/1307674368000))))))));}
export function dcos(x){return dsin(x+HALF_PI);}
export function dtan(x){return dsin(x)/dcos(x);}
export function dexp(x){if(x>0)return 1/dexp(-x);if(x<-700)return 0;let k=0;while(x<-0.5){x/=2;k++;}
 let r=1+x*(1+x*(1/2+x*(1/6+x*(1/24+x*(1/120+x*(1/720+x*(1/5040+x*(1/40320+x*(1/362880+x/3628800)))))))));for(;k>0;k--)r*=r;return r;}
const len3=(x,y,z)=>Math.sqrt(x*x+y*y+z*z);
export function rng(seedHex){let a=parseInt(seedHex,16)>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
// 슬롯머신: 1번 자리부터 차례로 물건을 정합니다. 인형은 한 판에 최대 1개.
export function pickKinds(seedHex,n,carW=1){const r=rng(seedHex),out=[];let doll=false;
 // carW<1 이면 자동차 세 종류가 그만큼 덜 나옴(1/3 이면 세 종류를 합쳐 한 종류 몫)
 for(let i=0;i<n;i++){let k;do{k=POOL[Math.floor(r()*POOL.length)];}while((k==='doll'&&doll)||(carW<1&&KINDS[k].shape==='car'&&r()>carW));if(k==='doll')doll=true;out.push(k);}return out;}
// 자리: 덮개 앞 왼쪽부터 1~5번, 둘째 줄 6~10번, 셋째 줄 11~15번 (화면 왼쪽 = +x)
export function slotOf(i,m=MACHINE){const row=Math.floor(i/5),col=i%5,pitch=(m.width-0.02)/5;return {x:-(col-2)*pitch,z:(m.rowZ??0.08)+row*(m.rowPitch??0.15)};}

// 이음매 배치(벨트 좌표 z: 0~loop). 그림 그리는 쪽도 같은 배치를 씀
export function seamLayout(m,loop=2*m.len+0.2){
 const out=[];
 if(m.seamLong>0){const P=loop/m.zigPeriods,half=P/2;
  for(let j=1;j<m.strips;j++){const x0=-m.width/2+j*m.width/m.strips,ph=(j%2)*half/2;
   for(let k=-1;k<m.zigPeriods*2+1;k++){const z1=k*half+ph,z2=z1+half,sg=k%2===0?1:-1;if(z2<=0||z1>=loop)continue;
    out.push({x1:x0-sg*m.zigAmp,z1,x2:x0+sg*m.zigAmp,z2,h:m.seamLong,r:m.seamLongR,kind:'long'});}}}
 // 가로 이음매: 한쪽 난간에서 가운데 너머까지 비스듬히(사선) 지나가는 턱. 난간 쪽 끝이 앞서고 가장 높으며,
 // 반대쪽 끝으로 갈수록 낮아져 벨트 속으로 사라짐. 물건을 사선으로 쳐 내고, 낮은 쪽에서는 그냥 넘어감. 번갈아 좌·우에서 나옴
 // 물결 턱(wave): 벨트를 이어 붙인 자리. 폭 전체를 살짝 비스듬히 가로지르고, 높이가 자리마다 다름(높은 봉우리 몇 곳 + 낮은 곳).
 // 한 바퀴에 crossCount 번 지나가므로 일정한 박자로 '턱이 온다'. 봉우리 위치는 턱마다 달라 안전한 줄이 없음
 if(m.wave&&m.seamCross>0){const t=dtan(m.crossAngleDeg*Math.PI/180),W=m.width/2-0.012,lo=m.waveLow??1;
  // wave=2: 대부분 낮고(L), 턱마다 높은 봉우리 1곳(1)과 중간 혹 1곳(M). 봉우리에 맞으면 크게 밀려남
  const L=m.waveBase??0.12,M=m.waveMid??0.6;
  const P=m.wave===2?[[L,L,1,L,L,L,M,L,L],[L,M,L,L,L,1,L,L,L],[L,L,L,M,L,L,L,1,L],[1,L,L,L,M,L,L,L,L]]:[[0.3,1,0.3,0.2,0.45,1,0.35],[1,0.35,0.25,1,0.3,0.2,0.5],[0.25,0.4,1,0.3,0.25,0.35,1],[0.5,0.2,0.3,0.4,1,0.3,0.25]];
  for(let c=0;c<m.crossCount;c++){const zc=m.seamZ0!=null?m.seamZ0+c*m.seamGap:(c+(m.seamPhase??0.6))*loop/m.crossCount,sg=c%2?-1:1,pr=P[c%P.length],n=pr.length-1,hh=f=>m.seamCross*(f>=1?1:f*lo);
   for(let i=0;i<n;i++){const xa=-W+2*W*i/n,xb=-W+2*W*(i+1)/n;out.push({x1:xa,z1:zc+sg*t*xa,x2:xb,z2:zc+sg*t*xb,h:hh(pr[i]),h2:hh(pr[i+1]),r:m.seamCrossR,kind:'cross'});}}}
 else if(m.seamCross>0){const t=dtan(m.crossAngleDeg*Math.PI/180),W=m.width/2-0.012;
  // 종류를 번갈아: 왼쪽 난간에서 시작(가운데로 밀어냄) → 가운데 꺾쇠(양옆으로 밀어냄) → 오른쪽 난간에서 시작 → 가운데 꺾쇠. 안전한 줄이 없게 함
  const bar=(xl,xt,zc)=>{const dzh=t*Math.abs(xl-xt)/2;out.push({x1:xl,z1:zc+dzh,x2:xt,z2:zc-dzh,h:m.seamCross,h2:-0.004,r:m.seamCrossR,kind:'cross'});};
  for(let c=0;c<m.crossCount;c++){const zc=(c+0.6)*loop/m.crossCount,type=c%4;
   if(type===0)bar(W,-m.crossReach,zc);else if(type===2)bar(-W,m.crossReach,zc);
   else{const e=W-m.chevGap,dz=t*e/2;for(const sg of [-1,1])out.push({x1:sg*0.004,z1:zc+dz,x2:sg*e,z2:zc-dz,h:m.seamCross,h2:-0.004,r:m.seamCrossR,kind:'cross'});}}}
 return out;
}
export function createRace(RAPIER,kinds,seedHex,machine=MACHINE){
 const m=machine,rand=rng(seedHex),tilt=(m.tiltFarDeg!=null?0:m.tiltDeg)*Math.PI/180;
 const world=new RAPIER.World({x:0,y:-9.81*dcos(tilt),z:-9.81*dsin(tilt)});world.timestep=DT;if(m.iters)world.numSolverIterations=m.iters;world.lengthUnit=m.lengthUnit??0.05;
 const fixed=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
 // 본체 덮개: 고정된 둥근 플라스틱 덮개. 벨트는 그 아래로 들어감. 벨트가 돌리는 물건이 닿으면 마찰로 덮개를 타고 오르려 함(엔진이 계산)
 world.createCollider(RAPIER.ColliderDesc.cylinder(m.width/2+0.05,m.hoodR).setRotation({x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2}).setTranslation(0,0,-m.hoodR).setFriction(0.5).setRestitution(m.hoodRest),fixed);
 // 난간: 벨트 가장자리에 딱 붙은 얇고 매끈한 벽(걸칠 턱이 없음)
 for(const s of [-1,1])world.createCollider(RAPIER.ColliderDesc.cuboid(0.01,0.2,m.len/2+0.1).setTranslation(s*(m.width/2+0.01),0.2,m.len/2-0.1).setFriction(0.15).setRestitution(m.railRest),fixed);
 // 벨트: 모터가 미는 고무 벨트 한 장. 표면이 +z 로 흐름(매 걸음 제자리로 되돌려 표면 속도만 남김)
 const belt=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,-0.05,m.len/2));
 world.createCollider(RAPIER.ColliderDesc.cuboid(m.width/2,0.05,m.len/2).setFriction(1.0).setRestitution(m.beltRest),belt);
 // 벨트 이음매: 벨트와 함께 흐르는 낮은 턱들. 세로 띠 사이의 지그재그 이음매 + 사선 가로 이음매.
 // 벨트 한 바퀴 무늬를 두 벌 이어서 돌림(한 벌이 끝을 지나면 앞으로 돌아옴)
 const loop=2*m.len+0.2,seams=seamLayout(m,loop),pattern=[];
 // y축 원통을 두 점 사이에 놓는 회전
 const quatTo=(dx,dy,dz)=>{const L=len3(dx,dy,dz),ux=dx/L,uy=dy/L,uz=dz/L,w=1+uy;if(w<1e-9)return {x:1,y:0,z:0,w:0};
  const n=len3(uz,-ux,w);return {x:uz/n,y:0,z:-ux/n,w:w/n};};
 if(seams.length)for(let c=0;c<2;c++){const b=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,0,-c*loop));
  for(const g of seams){const y1=g.h-g.r,y2=(g.h2??g.h)-g.r,dx=g.x2-g.x1,dy=y2-y1,dz=g.z2-g.z1,L=len3(dx,dy,dz);
   world.createCollider(RAPIER.ColliderDesc.cylinder(L/2,g.r).setTranslation((g.x1+g.x2)/2,(y1+y2)/2,(g.z1+g.z2)/2).setRotation(quatTo(dx,dy,dz)).setFriction(g.kind==='cross'?0.4:1.0).setRestitution(g.kind==='cross'?0.4:m.beltRest),b);}
  pattern.push(b);}
 const entries=kinds.map((kind,i)=>({i,kind,body:null,wheels:[],out:false,outAt:null,pose:null}));
 const dyn=()=>RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setCcdEnabled(true);
 const Q={up:{x:0,y:0,z:0,w:1},side:{x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2}};
 for(const e of entries){
  const k=KINDS[e.kind],p=slotOf(e.i,m);
  if(k.shape==='ball'){
   // 완벽한 공이 아닌 살짝 길쭉하거나(수박·야구공: 럭비공처럼) 납작한(오렌지) 매끈한 모양. 놓이는 방향은 추첨 번호로
   const u=rand()*2-1,ph=rand()*Math.PI*2,sq=Math.sqrt(1-u*u),ang=rand()*Math.PI*2,sn=dsin(ang/2);
   const q={x:sq*dcos(ph)*sn,y:sq*dsin(ph)*sn,z:u*sn,w:dcos(ang/2)};
   e.body=world.createRigidBody(dyn().setTranslation(p.x,k.r*Math.max(1,k.ax)+0.002,p.z).setRotation(q));
   world.createCollider((k.ax>=1?RAPIER.ColliderDesc.capsule(k.r*(k.ax-1),k.r):RAPIER.ColliderDesc.roundCylinder(0.0002,k.r*(1-k.ax),k.r*k.ax)).setMass(k.mass*(1-k.off)).setFriction(k.friction).setRestitution(k.restitution),e.body);
   world.createCollider(RAPIER.ColliderDesc.ball(k.r*0.1).setTranslation(k.r*0.5,0,0).setMass(k.mass*k.off).setFriction(k.friction),e.body); // 치우친 무게(씨·꼭지 쪽)
  }else if(k.shape==='cyl'){
   // 캔·휴지·테이프는 항상 구를 수 있게 눕혀(바퀴처럼 세워) 놓음: 축이 좌우
   const lying=true;e.lying=lying;
   e.body=world.createRigidBody(dyn().setTranslation(p.x,(lying?k.r:k.h/2)+0.001,p.z).setRotation(lying?Q.side:Q.up));
   // 속이 빈 원통의 무게 분포(관성)는 실제 공식 그대로 넣음
   const a=k.r*k.r+k.ri*k.ri,Iy=k.mass*a/2,Ix=k.mass*(3*a+k.h*k.h)/12;
   world.createCollider(RAPIER.ColliderDesc.cylinder(k.h/2,k.r).setMassProperties(k.mass,{x:0,y:0,z:0},{x:Ix,y:Iy,z:Ix},Q.up).setFriction(k.friction).setRestitution(k.restitution),e.body);
  }else if(k.shape==='car'){
   const cs=m.carScale??1; // 차체 크기 배율
   // 미니카: 차체 + 자유롭게 도는 바퀴 4개(모터 없음, 축에 아주 작은 마찰). 앞머리가 덮개 쪽
   const wr=m.wheelR??0.014,cy=m.carMid?wr:wr+(k.hei*cs)/2-0.006+(m.carLift??0); // carMid: 차체 한가운데로 축이 지나가 뒤집혀도 바퀴로 달리는 양면 장난감 차
   e.body=world.createRigidBody(dyn().setTranslation(p.x,cy+0.001,p.z));
   world.createCollider(RAPIER.ColliderDesc.cuboid((k.wid*cs)/2-0.006,(k.hei*cs)/2-0.001,(k.len*cs)/2).setTranslation(0,0.001,0).setMass(k.mass*(m.carMass??1)*(0.8-Math.abs(m.carRear??0.12))).setFriction(0.3).setRestitution(0.2),e.body);
   // 무게가 뒤쪽에 조금 더 실린 미니카(뒤가 무거우면 꼬리가 흔들리는 피시테일이 생김)
   world.createCollider(RAPIER.ColliderDesc.ball(0.006).setTranslation(0,0,(k.len*cs)*0.32*Math.sign(m.carRear??0.12)).setMass(k.mass*(m.carMass??1)*Math.abs(m.carRear??0.12)).setFriction(0.3),e.body);
   for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    const wx=dx*((k.wid*cs)/2-0.001+(m.carTrack??0)),wz=dz*((k.len*cs)/2-Math.min(0.02,(k.len*cs)/2-wr-0.002)),wy=wr-cy;
    const w=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setTranslation(p.x+wx,wr+0.001,p.z+wz));
    world.createCollider((m.wheelBall===false?RAPIER.ColliderDesc.cylinder(0.004,wr).setRotation(Q.side):RAPIER.ColliderDesc.ball(wr)).setMass(k.mass*(m.carMass??1)*0.05).setFriction(dz<0?(m.carFrontMu??k.friction):k.friction).setFrictionCombineRule(dz<0&&m.carFrontMu!=null?RAPIER.CoefficientCombineRule.Min:RAPIER.CoefficientCombineRule.Average).setRestitution(m.wheelRest??0.1),w);
    const j=world.createImpulseJoint(RAPIER.JointData.revolute({x:wx,y:wy,z:wz},{x:0,y:0,z:0},{x:1,y:0,z:0}),e.body,w,true);
    j.setContactsEnabled(false);if(m.axle)j.configureMotorVelocity(0,m.axle);
    e.wheels.push({body:w,local:{x:wx,y:wy,z:wz}});
   }
  }else if(k.shape==='doll'){
   // 솜인형: 보이는 모양(키 약 12cm, 폭 약 10cm, 두께 약 7cm의 납작하고 통통한 인형)에 맞춘 몸통 + 볏 + 발.
   // 가볍고 잘 안 미끄러지며 구르지 못해, 서 있다가 쓰러져 벨트에 실려 감
   e.body=world.createRigidBody(dyn().setTranslation(p.x,k.r+0.012,p.z));
   const c=(desc,mass)=>world.createCollider(desc.setMass(mass).setFriction(k.friction).setRestitution(k.restitution),e.body);
   c(RAPIER.ColliderDesc.roundCuboid(0.028,0.030,0.012,0.020).setTranslation(0,-0.006,0),k.mass*0.82); // 몸통
   c(RAPIER.ColliderDesc.ball(0.020).setTranslation(0,0.040,0),k.mass*0.08); // 볏
   c(RAPIER.ColliderDesc.cuboid(0.030,0.005,0.016).setTranslation(0,-0.055,-0.002),k.mass*0.10); // 발
  }
  e.pose={t:e.body.translation(),r:e.body.rotation()};
 }
 let t=0,frame=0,beltPos=0,beltOn=m.startDelay,lastFall=0,restarts=0;const order=[],events=[];
 // 3판(profile:'ramp'): 10초마다 단계가 하나씩 올라갑니다(바뀌는 1초 동안은 매끄럽게 이어짐). 단계마다 벨트가 빨라지고 뒤쪽 경사로가 내려옵니다.
 const stageNow=()=>{if(m.profile!=='ramp'||t<=beltOn)return 0;const u=(t-beltOn)/m.stepSeconds,k=Math.floor(u),f=(u-k)*m.stepSeconds;return Math.min(m.stageMax,k+(k>0&&f<1?f-1:0)+(k>0?0:0));};
 const speedNow=()=>m.profile==='ramp'?Math.min(m.speedMax,m.speed+m.speedStep*stageNow()):m.speed;
 const rampNow=()=>m.profile==='ramp'?Math.max(m.rampMinDeg,m.rampDeg-m.rampStepDeg*stageNow()):0;
 const beltSpeed=()=>t<beltOn?0:speedNow()*(1-dexp(-(t-beltOn)/m.spinUp));
 // 경사 모터: 출발 뒤 일정한 빠르기로 천천히 기울기를 바꿈(런닝머신 경사 조절 기능)
 const tiltNow=()=>m.tiltEndDeg==null?m.tiltDeg:m.tiltDeg+(m.tiltEndDeg-m.tiltDeg)*Math.min(1,Math.max(0,(t-m.startDelay)/m.tiltSeconds));
 const alive=()=>entries.filter(e=>!e.out);
 const zero={x:0,y:0,z:0};
 // 걸려서 오래 아무도 안 떨어지면: 남은 물건만 제자리(자기 번호 자리)에 다시 놓고 벨트를 다시 켬
 function restart(){
  for(const e of alive()){e.body.setTranslation(e.pose.t,true);e.body.setRotation(e.pose.r,true);e.body.setLinvel(zero,true);e.body.setAngvel(zero,true);
   for(const w of e.wheels){w.body.setTranslation({x:e.pose.t.x+w.local.x,y:e.pose.t.y+w.local.y,z:e.pose.t.z+w.local.z},true);w.body.setRotation(Q.up,true);w.body.setLinvel(zero,true);w.body.setAngvel(zero,true);}}
  beltOn=t+m.startDelay;lastFall=t;restarts++;events.push({frame,type:'restart'});closeGate(t);
 }
 // 출발 막대: 벨트가 속도를 올리는 동안 물건 뒤를 막아 주다가 gateOpen 초 뒤에 올라감(턱은 막대 밑으로 지나감)
 let gate=null,gateUntil=0;
 function closeGate(from){if(m.gateZ==null)return;if(gate)world.removeRigidBody(gate);gate=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,0.045+0.08,m.gateZ));
  world.createCollider(RAPIER.ColliderDesc.cuboid(m.width/2,0.08,0.006).setFriction(0.2).setRestitution(0.2),gate);gateUntil=from+m.startDelay+(m.gateOpen??3);}
 closeGate(0);
 function step(){
  if(gate&&t>=gateUntil){world.removeRigidBody(gate);gate=null;lastFall=t;events.push({frame,type:'gate'});}
  const v=beltSpeed();beltPos+=v*DT;
  belt.setTranslation({x:0,y:-0.05,z:m.len/2},true);belt.setNextKinematicTranslation({x:0,y:-0.05,z:m.len/2+v*DT});
  {const z0=(beltPos-v*DT)%loop;pattern.forEach((b,c)=>{const z=z0-c*loop;b.setTranslation({x:0,y:0,z},true);b.setNextKinematicTranslation({x:0,y:0,z:z+v*DT});});}
  if(m.tiltEndDeg!=null){const a=tiltNow()*Math.PI/180;world.gravity={x:0,y:-9.81*dcos(a),z:-9.81*dsin(a)};}
  if(m.profile==='ramp'){const K=Math.PI/180,af=m.frontDeg*K,ar=rampNow()*K,z0=m.rampStart*m.len,bank=m.bankDeg*K,hw=m.width/2;
   for(const e of entries){if(e.out)continue;for(const b of [e.body,...e.wheels.map(w=>w.body)]){const p=b.translation(),u=Math.max(0,Math.min(1,(p.z-z0)/m.rampBlend)),a=af+(ar-af)*u*u*(3-2*u);
     // 양옆 바닥이 가운데 쪽으로 살짝 기울어 있어(가장자리에서 가장 큼) 물건이 천천히 가운데로 모임
     const bx=Math.max(-1,Math.min(1,p.x/hw)),mass=b.mass();
     b.resetForces(true);b.addForce({x:-mass*9.81*dsin(bank*bx),y:0,z:-mass*9.81*dsin(a)},true);}}}
  else if(m.tiltFarDeg!=null)for(const e of entries){if(e.out)continue;for(const b of [e.body,...e.wheels.map(w=>w.body)]){
    const z=Math.max(0,Math.min(m.len,b.translation().z)),a=(m.tiltDeg+(m.tiltFarDeg-m.tiltDeg)*z/m.len)*Math.PI/180;
    b.resetForces(true);b.addForce({x:0,y:0,z:-b.mass()*9.81*dsin(a)},true);}}
  world.step();t+=DT;frame++;
  for(const e of entries){if(e.out)continue;const p=e.body.translation();
   // 벨트 밖으로 나가면 탈락(끝에서 떨어지거나 어디로든 튕겨 나감)
   if(p.y<-0.06||p.z>m.len+0.03||p.z<-m.hoodR-0.01||Math.abs(p.x)>m.width/2+0.1){e.out=true;e.outAt=frame;order.push(e.i);lastFall=t;events.push({frame,type:'fall',i:e.i});}}
  if(m.stuckSeconds>0&&alive().length>1&&t-lastFall>m.stuckSeconds)restart(); // 3판은 재출발 없음(stuckSeconds:0)
 }
 const finished=()=>alive().length<=1;
 // 먼저 떨어진 순 → 마지막이 1등. 시간이 다 되도록 남은 물건이 여럿이면 벨트 끝에 가까운(더 밀려난) 쪽을 먼저 떨어진 것으로 칩니다
 const result=()=>[...order,...alive().map(e=>({i:e.i,z:e.body.translation().z})).sort((a,b)=>b.z-a.z||a.i-b.i).map(x=>x.i)];
 function snapshot(){const s=[];for(const e of entries){const p=e.body.translation(),q=e.body.rotation();s.push(p.x,p.y,p.z,q.x,q.y,q.z,q.w);
   for(const w of e.wheels){const wp=w.body.translation(),wq=w.body.rotation();s.push(wp.x,wp.y,wp.z,wq.x,wq.y,wq.z,wq.w);}}return s;}
 return {world,entries,events,seams,loop,tiltNow,rampNow,speedNow,stageNow,gateClosed:()=>!!gate,step,finished,result,snapshot,beltSpeed,get t(){return t;},get frame(){return frame;},get beltPos(){return beltPos;},get restarts(){return restarts;}};
}

// ───────── 확정 설정 1판 (2026-11-22 사용자 결정). 기록에 판 번호를 남기고, 값을 바꾸면 새 판 번호를 씁니다(옛 기록은 옛 값으로 다시 봄).
export const RACE_V1 = Object.freeze({...MACHINE,wave:2,crossAngleDeg:10,crossCount:4,seamZ0:0.75,seamGap:0.9,startDelay:0.3,rowZ:0.10,rowPitch:0.2,spinUp:2,seamLong:0.0005,
 wheelR:0.026,carLift:0.006,carRear:0.04,stuckSeconds:10,seamCrossR:0.06,tiltDeg:1,len:2.0,speed:3.4,tiltFarDeg:24,seamCross:0.034,waveBase:0.2,carW:0.334,carScale:1.5});
// ───────── 확정 설정 3판 (2026-11-23 사용자 결정): 재출발 없음. 오목한 바닥 대신 평평한 벨트 + 뒤쪽의 높은 경사로,
// 양옆 바닥이 가운데로 살짝 기울어 물건이 모여 부딪힘, 이음매는 낮게, 10초마다 벨트가 조금 빨라지고 경사로가 조금 내려옴.
export const RACE_V3 = Object.freeze({...RACE_V1,profile:'ramp',tiltDeg:0,tiltFarDeg:null,stuckSeconds:0,frontDeg:1.2,rampStart:0.55,rampBlend:0.16,rampDeg:30,rampStepDeg:6,rampMinDeg:2,
 bankDeg:3,stepSeconds:10,stageMax:9,speed:3.4,speedStep:0.25,speedMax:4.4,seamCross:0.012,waveBase:0.25,waveMid:0.6});
export const raceFor=version=>version>=3?RACE_V3:RACE_V1;
export const MAX_RACERS=15,MIN_RACERS=2,MAX_RACE_SECONDS=120;

// ───────── 자리 정하기 핀볼(아주 단순한 판): 섞인 공이 사선(/) 하나를 타고 내려와 구멍 하나로 들어가고, 들어간 순서가 1번 자리부터의 주인.
// 세로로 선 얇은 판 안에서만 움직임(앞뒤로는 못 움직임). 길이 단위 m.
// g: 비스듬히 세운 판이라 공이 천천히 굴러 내려옴. gap: 구멍 폭(공 두 개가 끼어 막히지 않도록 공 지름의 2배 남짓)
export const DROP = Object.freeze({w:0.50,h:0.62,ballR:0.016,barLowY:0.10,barHighY:0.20,gap:0.070,goalY:0.045,g:3.0,friction:0.05,maxSeconds:25});
export function createDrop(RAPIER,n,seedHex,d=DROP){
 const rand=rng(((parseInt(seedHex,16)^0x9e3779b9)>>>0).toString(16).padStart(8,'0'));
 const world=new RAPIER.World({x:0,y:-d.g,z:0});world.timestep=DT;world.lengthUnit=0.02;
 const fixed=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
 const wall=(cx,cy,hx,hy,rot=0)=>{const c=RAPIER.ColliderDesc.cuboid(hx,hy,0.03).setTranslation(cx,cy,0).setFriction(d.friction).setRestitution(0.35);
  if(rot)c.setRotation({x:0,y:0,z:dsin(rot/2),w:dcos(rot/2)});world.createCollider(c,fixed);return {cx,cy,hx,hy,rot};};
 const walls=[];
 walls.push(wall(-d.w/2-0.01,d.h/2,0.01,d.h/2),wall(d.w/2+0.01,d.h/2,0.01,d.h/2)); // 양옆 벽
 // 사선(/): 왼쪽 아래가 낮음. 왼쪽 벽과의 사이에 공 하나 지나갈 틈(구멍)
 const x1=-d.w/2+d.gap,y1=d.barLowY,x2=d.w/2,y2=d.barHighY,L=Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1)),sn=(y2-y1)/L,cs=(x2-x1)/L;
 {const half=L/2,th=0.008,cx=(x1+x2)/2+sn*th,cy=(y1+y2)/2-cs*th; // 윗면이 (x1,y1)-(x2,y2)에 오도록 두께만큼 내림
  const c=RAPIER.ColliderDesc.cuboid(half,th,0.03).setTranslation(cx,cy,0).setRotation({x:0,y:0,z:Math.sqrt((1-cs)/2),w:Math.sqrt((1+cs)/2)}).setFriction(d.friction).setRestitution(0.35);world.createCollider(c,fixed);
  walls.push({cx,cy,hx:half,hy:th,cos:cs,sin:sn,bar:true});}
 // 구멍 아래 통로의 오른쪽 벽
 walls.push(wall(x1+0.006,d.barLowY/2-0.01,0.006,d.barLowY/2-0.004));
 // 공: 위쪽에 섞어서 배치(누가 어느 칸에 놓일지는 추첨 번호로)
 const cols=5,rows=Math.ceil(n/cols),pitch=d.ballR*2.6,slots=[];for(let i=0;i<n;i++)slots.push(i);
 for(let i=n-1;i>0;i--){const j=Math.floor(rand()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
 const balls=[];for(let i=0;i<n;i++){const s=slots[i],r=Math.floor(s/cols),c=s%cols;
  const x=(c-(cols-1)/2)*pitch+0.05+(rand()-0.5)*0.008,y=d.h-0.05-r*pitch+(rand()-0.5)*0.008;
  const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,y,0).setCanSleep(false).setCcdEnabled(true).enabledTranslations(true,true,false).enabledRotations(false,false,true));
  world.createCollider(RAPIER.ColliderDesc.ball(d.ballR).setMass(0.03).setFriction(d.friction).setRestitution(0.45),b);balls.push({i,body:b,done:false});}
 const order=[];let t=0,frame=0;const events=[];
 function step(){world.step();t+=DT;frame++;
  for(const b of balls){if(b.done)continue;const p=b.body.translation();if(p.y<d.goalY&&p.x<x1+0.02){b.done=true;order.push(b.i);events.push({frame,i:b.i});}}
  if(t>=d.maxSeconds&&order.length<n){ // 혹시 걸린 공이 있으면 구멍에 가까운 순서로 마무리
   const rest=balls.filter(b=>!b.done).map(b=>{const p=b.body.translation();return {b,k:(p.x-x1)*(p.x-x1)+(p.y-d.goalY)*(p.y-d.goalY)};}).sort((a,c)=>a.k-c.k||a.b.i-c.b.i);
   for(const r of rest){r.b.done=true;order.push(r.b.i);events.push({frame,i:r.b.i,forced:true});}}}
 const finished=()=>order.length>=n;
 function snapshot(){const s=[];for(const b of balls){const p=b.body.translation(),q=b.body.rotation();s.push(p.x,p.y,q.z,q.w);}return s;}
 return {world,balls,walls,order,events,step,finished,snapshot,bar:{x1,y1,x2,y2},get t(){return t;},get frame(){return frame;}};
}

// ───────── 자리 정하기 핀볼 2판 (2026-11-23 사용자 결정): 위쪽 섞는 통에서 바람으로 공을 마구 날려 섞은 뒤(로또 추첨기처럼),
// 통 바닥 문이 열려 사선으로 떨어집니다. 1판(섞는 통 없음)으로 남긴 기록은 1판 그대로 다시 봅니다.
// 바람: 통 바닥 가운데에서 위로 뿜는 센 바람 + 바닥에서는 가운데로 모이는 흐름 + 매 순간 달라지는 돌풍(추첨 번호로 정해짐).
export const DROP2 = Object.freeze({...DROP,h:0.84,boxX:0.17,boxY0:0.52,boxY1:0.80,mixSeconds:3.2,jet:34,jetWidth:0.065,inflow:9,gust:16,maxSeconds:32});
export function createDrop2(RAPIER,n,seedHex,d=DROP2){
 const rand=rng(((parseInt(seedHex,16)^0x9e3779b9)>>>0).toString(16).padStart(8,'0'));
 const world=new RAPIER.World({x:0,y:-d.g,z:0});world.timestep=DT;world.lengthUnit=0.02;
 const fixed=world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),walls=[];
 const wall=(cx,cy,hx,hy,extra={})=>{const c=RAPIER.ColliderDesc.cuboid(hx,hy,0.03).setTranslation(cx,cy,0).setFriction(d.friction).setRestitution(0.35);const col=world.createCollider(c,fixed);const w={cx,cy,hx,hy,...extra};walls.push(w);return col;};
 wall(-d.w/2-0.01,d.h/2,0.01,d.h/2);wall(d.w/2+0.01,d.h/2,0.01,d.h/2);
 // 사선(/)과 구멍 아래 통로: 1판과 같음
 const x1=-d.w/2+d.gap,y1=d.barLowY,x2=d.w/2,y2=d.barHighY,L=Math.sqrt((x2-x1)*(x2-x1)+(y2-y1)*(y2-y1)),sn=(y2-y1)/L,cs=(x2-x1)/L;
 {const half=L/2,th=0.008,cx=(x1+x2)/2+sn*th,cy=(y1+y2)/2-cs*th;
  world.createCollider(RAPIER.ColliderDesc.cuboid(half,th,0.03).setTranslation(cx,cy,0).setRotation({x:0,y:0,z:Math.sqrt((1-cs)/2),w:Math.sqrt((1+cs)/2)}).setFriction(d.friction).setRestitution(0.35),fixed);
  walls.push({cx,cy,hx:half,hy:th,cos:cs,sin:sn,bar:true});}
 wall(x1+0.006,d.barLowY/2-0.01,0.006,d.barLowY/2-0.004);
 // 섞는 통: 양옆·위 벽 + 바닥 문(섞기가 끝나면 사라짐)
 const bh=(d.boxY1-d.boxY0)/2,bc=(d.boxY1+d.boxY0)/2;
 wall(-d.boxX-0.006,bc,0.006,bh+0.006,{box:true});wall(d.boxX+0.006,bc,0.006,bh+0.006,{box:true});wall(0,d.boxY1+0.006,d.boxX+0.012,0.006,{box:true});
 let gate=wall(0,d.boxY0-0.006,d.boxX+0.012,0.006,{gate:true});
 // 공: 통 바닥에 줄지어 넣음(자리는 추첨 번호로 섞음)
 const cols=8,pitch=d.ballR*2.5,spots=[];for(let i=0;i<16;i++)spots.push({x:(i%cols-(cols-1)/2)*pitch,y:d.boxY0+d.ballR+0.004+Math.floor(i/cols)*pitch});
 for(let i=spots.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[spots[i],spots[j]]=[spots[j],spots[i]];}
 const balls=[];for(let i=0;i<n;i++){const sp=spots[i];
  const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(sp.x+(rand()-0.5)*0.004,sp.y+(rand()-0.5)*0.004,0).setCanSleep(false).setCcdEnabled(true).enabledTranslations(true,true,false).enabledRotations(false,false,true));
  world.createCollider(RAPIER.ColliderDesc.ball(d.ballR).setMass(0.03).setFriction(d.friction).setRestitution(0.6),b);balls.push({i,body:b,done:false});}
 const order=[],events=[];let t=0,frame=0,gateFrame=null,gx=0,gy=0;
 function step(){
  if(gate&&t>=d.mixSeconds){world.removeCollider(gate,true);gate=null;gateFrame=frame;for(const b of balls)b.body.resetForces(true);}
  if(gate){ // 바람(문이 닫혀 있는 동안만)
   if(frame%12===0){gx=(rand()-0.5)*2*d.gust;gy=(rand()-0.5)*d.gust;} // 0.05초마다 바뀌는 돌풍
   for(const b of balls){const p=b.body.translation(),m=0.03,u=p.x/d.jetWidth,up=d.jet/(1+u*u*u*u)*(1-0.9*(p.y-d.boxY0)/(d.boxY1-d.boxY0));
    const low=p.y<d.boxY0+0.07?1:0,ax=gx+(low?-d.inflow*(p.x>0?1:-1):0)+(rand()-0.5)*d.gust,ay=up+gy;
    b.body.resetForces(true);b.body.addForce({x:m*ax,y:m*ay,z:0},true);}}
  world.step();t+=DT;frame++;
  for(const b of balls){if(b.done)continue;const p=b.body.translation();if(p.y<d.goalY&&p.x<x1+0.02){b.done=true;order.push(b.i);events.push({frame,i:b.i});}}
  if(t>=d.maxSeconds&&order.length<n){
   const rest=balls.filter(b=>!b.done).map(b=>{const p=b.body.translation();return {b,k:(p.x-x1)*(p.x-x1)+(p.y-d.goalY)*(p.y-d.goalY)};}).sort((p,q)=>p.k-q.k||p.b.i-q.b.i);
   for(const r of rest){r.b.done=true;order.push(r.b.i);events.push({frame,i:r.b.i,forced:true});}}}
 const finished=()=>order.length>=n;
 function snapshot(){const s=[];for(const b of balls){const p=b.body.translation(),q=b.body.rotation();s.push(p.x,p.y,q.z,q.w);}return s;}
 return {world,balls,walls,order,events,step,finished,snapshot,bar:{x1,y1,x2,y2},get gateFrame(){return gateFrame;},get t(){return t;},get frame(){return frame;}};
}
// 기록의 판 번호에 맞는 자리 정하기 핀볼
export const GAME_VERSION=3; // 3판: 자리 정하기는 2판(바람 섞는 통)과 같고, 경기 설정이 RACE_V3
export const dropFor=version=>version>=2?{create:createDrop2,spec:DROP2}:{create:createDrop,spec:DROP};
