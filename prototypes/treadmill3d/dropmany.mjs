import RAPIER from '../../public/treadmill3d/vendor/rapier.mjs';
import {createDrop,HZ} from '../../public/treadmill3d/sim.mjs';
await RAPIER.init();let forced=0,tmax=0,first=new Array(15).fill(0);const T=[];
for(let s=0;s<300;s++){const seed=((s*40503+0xbeef01)>>>0).toString(16).padStart(8,'0'),g=createDrop(RAPIER,15,seed);while(!g.finished())g.step();
 forced+=g.events.filter(e=>e.forced).length;T.push(g.t);first[g.order[0]]++;g.world.free();}
T.sort((a,b)=>a-b);console.log('300판: 억지 마무리',forced,'· 걸린 시간 중간',T[150].toFixed(1),'최대',T[299].toFixed(1),'· 1등으로 들어간 횟수(참가자 번호별)',first.join(' '));
