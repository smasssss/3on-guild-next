// 정통 경마 재생 시간표. 경기 계산(sim.mjs)의 장면 번호를 화면에 트는 시각(초)으로 바꿉니다. 그림·소리가 같은 시간표를 씁니다.
import {HZ} from './sim.mjs';
export const PRE=7,COUNTDOWN=3,POST=5.5; // 출발 전 인사 시간(마지막 3초는 3·2·1), 경기 뒤 결과판을 보여 주는 최소 시간
export function timeline(race){
 const F=race.frames.length,n=race.types.length,doneF=new Array(n).fill(null);for(const e of race.events)if(e.kind==='finish')doneF[e.a-1]=Math.min(F-1,e.frame);
 const firstF=race.events.find(e=>e.kind==='finish')?.frame??F;
 // 빨리 감기: 선두가 들어온 뒤, 느린 선수(기어가는 거북이·갈라진 인형탈)만 남고 별일이 없는 구간은 6배로 돌림
 const speedAt=new Float32Array(F).fill(1),tOf=new Float64Array(F+1),busy=new Uint8Array(F);
 for(const e of race.events){if(e.kind==='fall'||e.kind==='end')continue;for(let f=Math.max(0,e.frame-Math.round(2.5*HZ));f<Math.min(F,e.frame+HZ);f++)busy[f]=1;}
 for(let f=firstF+1;f<F;f++){if(busy[f])continue;let slow=true;for(let i=0;i<n&&slow;i++){if(doneF[i]!=null&&f>doneF[i])continue;const d=race.frames[f][i];slow=(race.types[i]==='turtle'&&d.s==='crawl')||(d.sp&&(d.s==='split'||d.s==='down'));}if(slow)speedAt[f]=6;}
 for(let f=0;f<F;f++)tOf[f+1]=tOf[f]+1/(HZ*speedAt[f]);
 const frameAt=ts=>{const u=ts-PRE;if(u<0)return Math.floor(u*HZ);if(u>=tOf[F])return F+Math.floor((u-tOf[F])*HZ);let a=0,b=F;while(b-a>1){const m=(a+b)>>1;if(tOf[m]<=u)a=m;else b=m;}return a;};
 return {F,n,doneF,firstF,speedAt,tOf,frameAt,timeOf:f=>PRE+tOf[Math.max(0,Math.min(F,f))],endAt:PRE+tOf[F],total:PRE+tOf[F]+POST};
}
