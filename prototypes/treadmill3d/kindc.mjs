import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import {createRace,MACHINE,HZ} from './sim.mjs';
await RAPIER.init();
const over=Object.fromEntries((process.argv[2]||'').split(',').filter(Boolean).map(kv=>{const [k,v]=kv.split('=');return [k,Number(v)];})),m={...MACHINE,...over,stuckSeconds:999},cap=Number(process.argv[3]||25);
const out=[];for(const k of (process.argv[4]||'sedan,racer,kei').split(',')){const g=createRace(RAPIER,[k,k,k,k,k],'0000a001',m);while(!g.finished()&&g.t<cap)g.step();
 out.push(k+': '+g.events.filter(e=>e.type==='fall').map(e=>(e.frame/HZ).toFixed(0)).join(' '));g.world.free();}
console.log(process.argv[5]||'',out.join(' | '));
