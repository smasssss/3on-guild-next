// node kind.mjs 'k=v' secs → 종류별로 같은 물건 5개만 올려 떨어지는 시각을 봄(3판)
import RAPIER from '../../public/treadmill3d/vendor/rapier.mjs';
import {createRace,MACHINE,POOL,HZ} from '../../public/treadmill3d/sim.mjs';
await RAPIER.init();
const over=Object.fromEntries((process.argv[2]||'').split(',').filter(Boolean).map(kv=>{const [k,v]=kv.split('=');return [k,Number(v)];})),m={...MACHINE,...over,stuckSeconds:999},cap=Number(process.argv[3]||25);
for(const k of POOL){const out=[];for(const seed of (process.env.SEEDS||'0000a001,0000b002').split(',')){const g=createRace(RAPIER,[k,k,k,k,k],seed,m);while(!g.finished()&&g.t<cap)g.step();
 out.push(g.events.filter(e=>e.type==='fall').map(e=>(e.frame/HZ).toFixed(0)).join(' ').padEnd(12));g.world.free();}
 console.log(k.padEnd(11),out.join(' | '));}
