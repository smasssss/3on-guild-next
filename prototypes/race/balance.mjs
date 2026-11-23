// 열한 종류가 비슷하게 우승하도록 값을 조금씩 고쳐 가며 맞춥니다(개발용).
// 대부분은 속도를, 거북이와 인형탈 말은 '기적이 일어날 확률(luck)'을 고칩니다.
import {runRace,TYPES} from '../../public/race/sim.mjs';
const base=JSON.parse(JSON.stringify(TYPES)),keys=Object.keys(TYPES),LUCK=['turtle','costume'],k=Object.fromEntries(keys.map(x=>[x,1])),speedKeys=['v','burstV','sprintV','rollMax','rollUp','panicV'];
const apply=()=>{for(const t of keys){if(LUCK.includes(t))TYPES[t].luck=Math.max(0.02,Math.min(0.95,base[t].luck*k[t]));else for(const f of speedKeys)if(base[t][f]!=null)TYPES[t][f]=base[t][f]*k[t];}};
const N=+(process.argv[3]||700),IT=+(process.argv[2]||40);let wins,present;
for(let it=0;it<IT;it++){apply();wins=Object.fromEntries(keys.map(x=>[x,0]));present=Object.fromEntries(keys.map(x=>[x,0]));
 for(let s=0;s<N;s++){const g=runRace(((s*40503+0xbeef01+it*7919)>>>0).toString(16).padStart(8,'0'),10);g.types.forEach(t=>present[t]++);wins[g.types[g.order[0]-1]]++;}
 for(const t of keys){const share=Math.max(0.01,wins[t]/present[t]);k[t]*=Math.pow(0.10/share,LUCK.includes(t)?0.12:0.02);}
 const sp=keys.filter(t=>!LUCK.includes(t)),mean=sp.reduce((a,t)=>a+k[t],0)/sp.length;for(const t of sp)k[t]/=mean;
 if(it%8===7||it===IT-1)console.log(it,keys.map(t=>t+' '+(100*wins[t]/present[t]).toFixed(0)+'% ×'+k[t].toFixed(3)).join(', '));}
apply();console.log(JSON.stringify(Object.fromEntries(keys.map(t=>[t,LUCK.includes(t)?{luck:Math.round(TYPES[t].luck*1000)/1000}:Object.fromEntries(speedKeys.filter(f=>base[t][f]!=null).map(f=>[f,Math.round(TYPES[t][f]*100)/100]))]))));
