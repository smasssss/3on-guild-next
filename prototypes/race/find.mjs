// 보고 싶은 사건이 들어 있는 추첨 번호 찾기(개발용): node find.mjs [사건,사건,...]
import {runRace} from './sim.mjs';
const want=(process.argv[2]||'').split(',').filter(Boolean),seen={},best=[];
for(let s=1;s<=1500;s++){const seed=((s*2246822519+0x9e3779b9)>>>0).toString(16).padStart(8,'0'),g=runRace(seed,10),kinds=[...new Set(g.events.map(e=>e.kind))];
 for(const k of kinds)if(!seen[k])seen[k]=seed;
 if(want.length&&want.every(k=>kinds.includes(k)))best.push({seed,n:kinds.length,win:g.types[g.order[0]-1],top:g.order.slice(0,3).map(no=>g.types[no-1]).join('/'),sec:g.seconds});}
if(want.length){best.sort((a,b)=>b.n-a.n);console.log(best.slice(0,8));}else console.log(seen);
