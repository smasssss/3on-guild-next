// node scan3.mjs 'k=v,…' from to → 3판 설정(RACE_V3)에 값을 덮어써 여러 판을 돌려 봅니다(개발용)
import RAPIER from '../../public/treadmill3d/vendor/rapier.mjs';
import {createRace,pickKinds,RACE_V3,HZ,MAX_RACE_SECONDS} from '../../public/treadmill3d/sim.mjs';
await RAPIER.init();
const over=Object.fromEntries((process.argv[2]||'').split(',').filter(Boolean).map(kv=>{const [k,v]=kv.split('=');return [k,Number(v)];})),m={...RACE_V3,...over};
const a=Number(process.argv[3]||0),b=Number(process.argv[4]||6);const T=[];let un=0,cbs=0;
for(let s=a;s<b;s++){const seed=((s*40503+0xbeef01)>>>0).toString(16).padStart(8,'0'),kinds=pickKinds(seed,15,m.carW),g=createRace(RAPIER,kinds,seed,m);
 const st=g.entries.map(()=>({far:false}));let cb=0;
 while(!g.finished()&&g.t<MAX_RACE_SECONDS){g.step();if(g.frame%24===0)for(const e of g.entries){if(e.out)continue;const p=e.body.translation(),q=st[e.i];if(p.z>0.6*m.len)q.far=true;else if(q.far&&p.z<0.35*m.len){q.far=false;cb++;}}}
 const f=g.events.filter(e=>e.type==='fall').map(e=>e.frame/HZ);if(!g.finished())un++;T.push(g.t);cbs+=cb;
 console.log(seed,g.finished()?'ok ':'CAP',g.t.toFixed(0).padStart(3),'cb',String(cb).padStart(2),'win',kinds[g.result().at(-1)].padEnd(10),'falls',f.map(t=>t.toFixed(0)).join(' '));g.world.free();}
T.sort((x,y)=>x-y);console.log('→ 중간',T[Math.floor(T.length/2)].toFixed(0)+'초','최대',T.at(-1).toFixed(0)+'초','못 끝남',un,'되살아남/판',(cbs/(b-a)).toFixed(1));
