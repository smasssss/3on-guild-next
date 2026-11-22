// 종류별 속도 배율을 조금씩 고쳐 가며, 여섯 종류가 비슷하게 우승하도록 맞춥니다(개발용)
import {runRace,TYPES} from './sim.mjs';
const base=JSON.parse(JSON.stringify(TYPES)),keys=Object.keys(TYPES),k=Object.fromEntries(keys.map(x=>[x,1])),speedKeys=['v','burstV','sprintV','rollMax','rollUp'];
const apply=()=>{for(const t of keys)for(const f of speedKeys)if(base[t][f]!=null)TYPES[t][f]=base[t][f]*k[t];};
const N=600;let wins;
for(let it=0;it<40;it++){apply();wins=Object.fromEntries(keys.map(x=>[x,0]));for(let s=0;s<N;s++){const g=runRace(((s*40503+0xbeef01+it*7919)>>>0).toString(16).padStart(8,'0'),10);wins[g.types[g.order[0]-1]]++;}
 for(const t of keys){const share=Math.max(0.02,wins[t]/N);k[t]*=Math.pow((1/6)/share,0.025);}const mean=keys.reduce((a,t)=>a+k[t],0)/6;for(const t of keys)k[t]/=mean;
 if(it%8===7||it===39)console.log(it,keys.map(t=>t+' '+wins[t]+' ×'+k[t].toFixed(3)).join(', '));}
apply();console.log(JSON.stringify(Object.fromEntries(keys.map(t=>[t,Object.fromEntries(speedKeys.filter(f=>base[t][f]!=null).map(f=>[f,Math.round(TYPES[t][f]*100)/100]))]))));
