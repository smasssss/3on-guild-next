// 로또 추첨기 계산 (2026-11-23 사용자 결정). 물리엔진 Rapier(결정적 판)로 계산하고, 같은 추첨 번호(seed)면 언제나 같은 결과입니다.
// - 둥근 유리통 안의 번호 공을 바람으로 날려 섞다가, 통 꼭대기 출구로 빨려 올라간 공을 하나씩 뽑습니다. 뽑힌 순서가 결과입니다.
// - 기기마다 값이 달라질 수 있는 수학 함수는 쓰지 않습니다(사칙연산과 제곱근만).
export const HZ=240,DT=1/HZ;
export const MIN_BALLS=2,MAX_BALLS=60,MAX_NUMBER=999;
export function rng(seedHex){let a=parseInt(seedHex,16)>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
// 설정 1판. 값을 바꾸면 새 판 번호를 씁니다(옛 기록은 옛 값으로 다시 봄).
export const LOTTO_V1=Object.freeze({R:0.17,cy:0.20,ballR:0.019,mass:0.0027,mixSeconds:3.0,gapSeconds:1.5,gapFast:1.0,waitSeconds:4.0,capR:0.05,jet:62,jetWidth:0.05,inflow:26,gust:22,rest:0.72,friction:0.2});
export const gapOf=(count,m=LOTTO_V1)=>count<=8?m.gapSeconds:m.gapFast;
// 둥근 통: 정이십면체를 두 번 잘게 나눈 면(안쪽 면에 공이 부딪힘)
function icosphere(R,cy,level){
 const t=(1+Math.sqrt(5))/2,V=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
 let F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
 const norm=v=>{const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return [v[0]/l,v[1]/l,v[2]/l];};
 let P=V.map(norm);
 for(let s=0;s<level;s++){const mid=new Map(),G=[];const m=(a,b)=>{const k=a<b?a+'_'+b:b+'_'+a;if(!mid.has(k)){P.push(norm([(P[a][0]+P[b][0])/2,(P[a][1]+P[b][1])/2,(P[a][2]+P[b][2])/2]));mid.set(k,P.length-1);}return mid.get(k);};
  for(const [a,b,c] of F){const ab=m(a,b),bc=m(b,c),ca=m(c,a);G.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}F=G;}
 const verts=new Float32Array(P.length*3);P.forEach((p,i)=>{verts[i*3]=p[0]*R;verts[i*3+1]=p[1]*R+cy;verts[i*3+2]=p[2]*R;});
 const idx=new Uint32Array(F.length*3);F.forEach((f,i)=>{idx[i*3]=f[0];idx[i*3+1]=f[1];idx[i*3+2]=f[2];});return {verts,idx};
}
// numbers: 공에 적힌 숫자 목록(예: 1~45). count: 뽑을 개수
export function createLotto(RAPIER,numbers,count,seedHex,m=LOTTO_V1){
 const n=numbers.length,rand=rng(seedHex);
 const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=DT;world.lengthUnit=0.02;
 const fixed=world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),shell=icosphere(m.R+0.004,m.cy,2);
 world.createCollider(RAPIER.ColliderDesc.trimesh(shell.verts,shell.idx).setFriction(m.friction).setRestitution(m.rest),fixed);
 // 공을 통 아래쪽에 층층이 놓음(어느 공이 어느 자리인지는 추첨 번호로 섞음)
 const spots=[],pitch=m.ballR*2.25;for(let layer=0;spots.length<MAX_BALLS+12;layer++){const y=m.cy-m.R*0.62+layer*pitch,rr=m.R*m.R-(y-m.cy)*(y-m.cy),lim=Math.sqrt(Math.max(0,rr))-m.ballR*1.6;
  for(let ix=-6;ix<=6;ix++)for(let iz=-6;iz<=6;iz++){const x=ix*pitch+(layer%2)*pitch/2,z=iz*pitch+(layer%2)*pitch/2;if(x*x+z*z<=lim*lim)spots.push({x,y,z});}}
 const use=spots.slice(0,n);for(let i=n-1;i>0;i--){const j=Math.floor(rand()*(i+1));[use[i],use[j]]=[use[j],use[i]];}
 const balls=numbers.map((number,i)=>{const s=use[i];
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(s.x+(rand()-0.5)*0.002,s.y,s.z+(rand()-0.5)*0.002).setCanSleep(false).setCcdEnabled(true).setAngularDamping(0.5));
  world.createCollider(RAPIER.ColliderDesc.ball(m.ballR).setMass(m.mass).setFriction(m.friction).setRestitution(m.rest),body);return {i,number,body,out:false,last:null};});
 const drawn=[],events=[],gap=gapOf(count,m),port={x:0,y:m.cy+m.R,z:0};let t=0,frame=0,openAt=m.mixSeconds,gx=0,gy=0,gz=0;
 const take=b=>{const p=b.body.translation(),q=b.body.rotation();b.last=[p.x,p.y,p.z,q.x,q.y,q.z,q.w];b.out=true;world.removeRigidBody(b.body);drawn.push(b.number);events.push({frame,i:b.i,number:b.number});openAt=t+gap;};
 function step(){
  if(frame%12===0){gx=(rand()-0.5)*2*m.gust;gy=(rand()-0.5)*m.gust;gz=(rand()-0.5)*2*m.gust;}
  for(const b of balls){if(b.out)continue;const p=b.body.translation(),x=p.x,z=p.z,rho=Math.sqrt(x*x+z*z),u=rho/m.jetWidth,h=(p.y-m.cy+m.R)/(2*m.R);
   const up=m.jet/(1+u*u*u*u)*(1-0.6*h),low=h<0.32&&rho>1e-6?m.inflow:0;
   b.body.resetForces(true);b.body.addForce({x:m.mass*(gx-low*x/rho+(rand()-0.5)*m.gust),y:m.mass*(up+gy),z:m.mass*(gz-low*z/rho+(rand()-0.5)*m.gust)},true);}
  world.step();t+=DT;frame++;
  if(drawn.length<count&&t>=openAt){ // 출구가 열려 있음: 가장 먼저 출구에 닿은 공을 뽑음
   let best=null,bd=1e9;for(const b of balls){if(b.out)continue;const p=b.body.translation(),dx=p.x-port.x,dy=p.y-port.y,dz=p.z-port.z,d2=dx*dx+dy*dy+dz*dz;if(d2<bd){bd=d2;best=b;}}
   if(best&&(bd<m.capR*m.capR||t>=openAt+m.waitSeconds))take(best); // 한참 안 닿으면 출구에 가장 가까운 공
  }}
 const finished=()=>drawn.length>=count;
 function snapshot(){const s=new Float32Array(n*7);balls.forEach((b,k)=>{if(b.out){s.set(b.last,k*7);return;}const p=b.body.translation(),q=b.body.rotation();s[k*7]=p.x;s[k*7+1]=p.y;s[k*7+2]=p.z;s[k*7+3]=q.x;s[k*7+4]=q.y;s[k*7+5]=q.z;s[k*7+6]=q.w;});return s;}
 return {world,balls,drawn,events,step,finished,snapshot,port,get t(){return t;},get frame(){return frame;}};
}
export const rangeOf=(from,to)=>Array.from({length:to-from+1},(_,i)=>from+i);
