// 2026-11-23 user decision: a saved 로또 추첨기 record is replayed by recomputing it from its seed (추첨 번호),
// so the same seed must always give the same numbers in the same order. These draws were computed when settings version 1
// (LOTTO_V1) was fixed; if any of them changes, saved records would no longer replay — add a new settings version instead.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import RAPIER from '../public/treadmill3d/vendor/rapier.mjs';
import {createLotto,rangeOf,LOTTO_V1,gapOf,HZ} from '../public/lotto3d/sim.mjs';
await RAPIER.init();
const draw=(seed,from,to,count)=>{const g=createLotto(RAPIER,rangeOf(from,to),count,seed);while(!g.finished())g.step();const out={numbers:g.drawn.slice(),times:g.events.map(e=>e.frame/HZ)};g.world.free();return out;};
const GOLD=[['00c51d27',1,45,6,[22,17,11,12,28,3]],['1a2b3c4d',1,10,10,[10,3,4,5,1,7,6,2,9,8]],['deadbeef',1,60,5,[48,13,9,39,3]]];
for(const [seed,from,to,count,want] of GOLD){const got=draw(seed,from,to,count);assert.deepEqual(got.numbers,want,'seed '+seed+' must replay exactly');
 assert.equal(new Set(got.numbers).size,count,'no number is drawn twice');assert.ok(got.numbers.every(x=>x>=from&&x<=to));
 assert.ok(got.times[0]>=LOTTO_V1.mixSeconds-1e-9,'nothing is drawn before the mixing time');
 for(let i=1;i<count;i++)assert.ok(got.times[i]-got.times[i-1]>=gapOf(count)-1e-9,'the outlet rests between two balls');}
assert.deepEqual(draw('00c51d27',1,45,6).numbers,GOLD[0][4],'computing the same draw twice gives the same numbers');
// No favourite ball: over many seeds the first ball out is spread over the range, and a ball reaches the outlet without the fallback.
const first=new Map();let waited=0;for(let s=0;s<60;s++){const got=draw(((s*40503+0xbeef01)>>>0).toString(16).padStart(8,'0'),1,45,1);first.set(got.numbers[0],(first.get(got.numbers[0])||0)+1);if(got.times[0]>LOTTO_V1.mixSeconds+LOTTO_V1.waitSeconds-0.01)waited++;}
assert.ok(first.size>=25,'first balls are spread: '+first.size+' different numbers in 60 draws');assert.ok(Math.max(...first.values())<=6,'no number comes first too often');assert.ok(waited<=2,'a ball reaches the outlet by itself');
assert.ok(!/Math\.(sin|cos|tan|exp|pow|hypot|acos|asin|atan|atan2|log|random|cbrt)\b/.test(fs.readFileSync(new URL('../public/lotto3d/sim.mjs',import.meta.url),'utf8')),'the draw maths uses no device-dependent functions');
console.log('PASS: 로또 추첨기 replays exactly from its seed (3 saved draws), numbers are distinct and in range, the outlet rests between balls, no favourite ball');
