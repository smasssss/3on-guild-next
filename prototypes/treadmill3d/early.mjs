// 초반(6초 안) 탈락의 원인 분류: 떨어지기 0.3초 전 상태(벨트와 같은 속도로 실려 감? 방향 틀어짐? 뒤집힘?)
import RAPIER from '../../public/treadmill3d/vendor/rapier.mjs';
import {createRace,pickKinds,MACHINE,KINDS,HZ} from '../../public/treadmill3d/sim.mjs';
await RAPIER.init();
const over=Object.fromEntries((process.argv[2]||'').split(',').filter(Boolean).map(kv=>{const [k,v]=kv.split('=');return [k,Number(v)];})),m={...MACHINE,...over};
const tally={},N=Number(process.argv[3]||10);let total=0;
for(let s=0;s<N;s++){const seed=((s*40503+0xbeef01)>>>0).toString(16).padStart(8,'0'),kinds=pickKinds(seed,15,m.carW??1),g=createRace(RAPIER,kinds,seed,m);
 const hist=g.entries.map(()=>[]);const done=new Set();
 while(g.t<(m.gateOpen??0)+6.5){g.step();if(g.frame%12===0)for(const e of g.entries){if(e.out){if(!done.has(e.i)){done.add(e.i);const h=hist[e.i],a=h[Math.max(0,h.length-8)]||h[0];if(!a)continue;
    const k=KINDS[kinds[e.i]];let why;const carried=a.vz>0.8*a.belt;
    if(k.shape==='doll')why='인형(못 구름)';else if(k.shape==='car')why=a.up<0.3?'자동차 뒤집힘':Math.abs(a.yaw)>25?'자동차 옆으로 돎':carried?'자동차 실려 감(똑바로)':'자동차 튕겨 나감';
    else if(k.shape==='cyl')why=a.ax>25?'원통 틀어져 실려 감':carried?'원통 실려 감(똑바로)':'원통 튕겨 나감';else why=carried?'공 실려 감':'공 튕겨 나감';
    tally[why]=(tally[why]||0)+1;total++;}continue;}
   const p=e.body.translation(),q=e.body.rotation(),v=e.body.linvel();
   const yaw=Math.atan2(2*(q.x*q.z+q.w*q.y),1-2*(q.x*q.x+q.y*q.y))*180/Math.PI,up=1-2*(q.x*q.x+q.z*q.z);
   // 원통 축(로컬 y)이 x축에서 벗어난 각
   const axx=2*(q.x*q.y-q.w*q.z),axy=1-2*(q.x*q.x+q.z*q.z),axz=2*(q.y*q.z+q.w*q.x);const ax=Math.acos(Math.min(1,Math.abs(axx)/Math.hypot(axx,axy,axz)))*180/Math.PI;
   hist[e.i].push({vz:v.z,belt:g.beltSpeed(),yaw,up,ax,z:p.z});}}
 g.world.free();}
console.log('6.5초 안 탈락 평균',(total/N).toFixed(1),'명/판');for(const [k,v] of Object.entries(tally).sort((a,b)=>b[1]-a[1]))console.log(' ',k,(v/N).toFixed(1));
