// 균형 확인(개발용): 종류별 우승·꼴찌 횟수, 경기 시간, 사건 종류별 횟수
import {runRace,TYPES} from './sim.mjs';
const keys=Object.keys(TYPES),z=()=>Object.fromEntries(keys.map(x=>[x,0])),wins=z(),top3=z(),last=z(),present=z(),kinds={};let secs=[],first=[],ev=[],unfinished=0;const N=+(process.argv[2]||1500);
for(let s=0;s<N;s++){const g=runRace(((s*2654435761+0x1234567)>>>0).toString(16).padStart(8,'0'),10);g.types.forEach(t=>present[t]++);wins[g.types[g.order[0]-1]]++;for(let k=0;k<3;k++)top3[g.types[g.order[k]-1]]++;last[g.types[g.order[9]-1]]++;secs.push(g.seconds);first.push(g.events.find(e=>e.kind==='finish')?.t||g.seconds);ev.push(g.events.length);if(g.finished<10)unfinished++;for(const e of g.events)kinds[e.kind]=(kinds[e.kind]||0)+1;}
secs.sort((a,b)=>a-b);first.sort((a,b)=>a-b);const avg=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1);
console.log('종류   우승%  3위안%  꼴찌%  (나온 경기 기준)');for(const k of keys)console.log(k.padEnd(9),(100*wins[k]/present[k]).toFixed(1).padStart(5),(100*top3[k]/present[k]).toFixed(1).padStart(6),(100*last[k]/present[k]).toFixed(1).padStart(6));
console.log('1위 도착 최소/중간/최대',first[0].toFixed(1),first[N>>1].toFixed(1),first[N-1].toFixed(1),'| 경기 끝 최소/중간/최대',secs[0],secs[N>>1],secs[N-1],'| 사건 평균',avg(ev),'| 다 못 들어온 경기',unfinished);
console.log(Object.entries(kinds).map(([k,v])=>k+' '+(v/N).toFixed(2)).join(', '));
