// node verify.mjs <seed> <인원> → 화면 없이 같은 판을 계산해 결과(자리 주인, 탈락 순서)를 냅니다. 화면에서 나온 결과와 같아야 합니다.
import RAPIER from '../../public/treadmill3d/vendor/rapier.mjs';
import {createRace,dropFor,pickKinds,RACE_V1,MAX_RACE_SECONDS,GAME_VERSION} from '../../public/treadmill3d/sim.mjs';
await RAPIER.init();
export function play(seed,n,version=GAME_VERSION){const d=dropFor(version).create(RAPIER,n,seed);while(!d.finished())d.step();const owner=d.order.slice();d.world.free();
 const kinds=pickKinds(seed,n,RACE_V1.carW),g=createRace(RAPIER,kinds,seed,RACE_V1);while(!g.finished()&&g.t<MAX_RACE_SECONDS)g.step();
 const out={kinds,slots:owner,order:g.result().map(slot=>owner[slot]),restarts:g.restarts,seconds:Math.round(g.t*10)/10,finished:g.finished()};g.world.free();return out;}
if(process.argv[2]){const r=play(process.argv[2],Number(process.argv[3]||15));console.log(JSON.stringify({slots:r.slots.map(i=>'m'+i),order:r.order.map(i=>'m'+i),restarts:r.restarts,seconds:r.seconds}));}
