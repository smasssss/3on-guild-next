import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import {createDrop,HZ} from './sim.mjs';
await RAPIER.init();
for(const n of [2,7,15])for(const seed of ['00c51d27','1a2b3c4d','deadbeef','00000001']){const g=createDrop(RAPIER,n,seed);while(!g.finished())g.step();
 console.log(n,seed,g.t.toFixed(1)+'s','순서',g.order.join(' '),'들어간 시각',g.events.map(e=>(e.frame/HZ).toFixed(1)+(e.forced?'!':'')).join(' '));g.world.free();}
