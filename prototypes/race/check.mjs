// 균형 확인(개발용): 종류별 우승 횟수, 경기 시간, 사건 수
import {runRace,TYPES} from './sim.mjs';
const keys=Object.keys(TYPES),wins=Object.fromEntries(keys.map(x=>[x,0])),last=Object.fromEntries(keys.map(x=>[x,0]));let secs=[],ev=[],to=0,leads=[];const N=1500;
for(let s=0;s<N;s++){const g=runRace(((s*2654435761+0x1234567)>>>0).toString(16).padStart(8,'0'),10);wins[g.types[g.order[0]-1]]++;last[g.types[g.order[9]-1]]++;secs.push(g.seconds);ev.push(g.events.length);leads.push(g.events.filter(e=>e.kind==='lead').length);if(g.timedOut)to++;}
secs.sort((a,b)=>a-b);const avg=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1);
console.log('우승',wins);console.log('꼴찌',last);console.log('시간 최소/중간/최대',secs[0],secs[N>>1],secs[N-1],'사건 평균',avg(ev),'선두교체 평균',avg(leads),'시간초과',to);
