// 턱 없는 벨트에 승용차 1대: 바퀴가 실제로 도는지(바퀴 회전속도 × 반지름 = 벨트 속도여야 함)
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import {createRace,MACHINE,HZ} from './sim.mjs';
await RAPIER.init();
const over=Object.fromEntries((process.argv[2]||'').split(',').filter(Boolean).map(kv=>{const [k,v]=kv.split('=');return [k,Number(v)];})),m={...MACHINE,...over,stuckSeconds:999};
const g=createRace(RAPIER,['sedan'],'0000a001',m),e=g.entries[0],wr=m.wheelR;
while(g.t<8){g.step();if(g.frame%(HZ*1)===0){const w=e.wheels.map(w=>Math.abs(w.body.angvel().x*wr).toFixed(2)),p=e.body.translation();
 console.log(`t=${g.t.toFixed(0)}s 벨트 ${g.beltSpeed().toFixed(2)}m/s · 바퀴 4개 둘레속도 ${w.join(' ')} · 차 위치 z=${(p.z*100).toFixed(0)}cm 차 속도 ${e.body.linvel().z.toFixed(2)}`);}}
