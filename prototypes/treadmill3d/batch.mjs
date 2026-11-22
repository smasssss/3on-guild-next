// node batch.mjs '<json overrides>' races n cap  → 한 줄 요약(길이, 끝남 여부, 드라마 지표)
import RAPIER from '../../public/treadmill3d/vendor/rapier.mjs';
import {createRace,pickKinds,MACHINE,HZ} from '../../public/treadmill3d/sim.mjs';
await RAPIER.init();
const over=Object.fromEntries((process.argv[2]||'').split(',').filter(Boolean).map(kv=>{const [k,v]=kv.split('=');return [k,v==='null'?null:Number(v)];})),count=Number(process.argv[3]??12),n=Number(process.argv[4]??15),cap=Number(process.argv[5]??90);
const m={...MACHINE,...over};
const secs=[],rank={},wins={},fallT=[];let capped=0,restarts=0,comebacks=0,lateral=0,alivesec=0,early=0,cpu=Date.now(),lastTwo=0;
for(let s=0;s<count;s++){
 const seed=((s*2654435761+0x1234567)>>>0).toString(16).padStart(8,'0');
 const kinds=pickKinds(seed,n,m.carW??1),g=createRace(RAPIER,kinds,seed,m);
 const st=g.entries.map(e=>({far:false,x:e.body.translation().x}));
 while(!g.finished()&&g.t<cap){g.step();
  if(g.frame%24===0&&g.t>m.startDelay)for(const e of g.entries){if(e.out)continue;const p=e.body.translation(),q=st[e.i];alivesec+=0.1;lateral+=Math.abs(p.x-q.x);q.x=p.x;
   if(p.z>0.62*m.len)q.far=true;else if(q.far&&p.z<0.3*m.len){q.far=false;comebacks++;}}}
 if(!g.finished())capped++;
 const res=g.result(),falls=g.events.filter(e=>e.type==='fall').map(e=>e.frame/HZ);
 fallT.push(falls);early+=falls.filter(t=>t<m.startDelay+2.5).length;if(falls.length>=2)lastTwo+=falls.at(-1)-falls.at(-2);
 secs.push(g.t);restarts+=g.restarts;res.forEach((i,r)=>{(rank[kinds[i]]??=[]).push(r+1);});wins[kinds[res.at(-1)]]=(wins[kinds[res.at(-1)]]||0)+1;
 g.world.free();
}
secs.sort((a,b)=>a-b);const q=p=>secs[Math.floor((secs.length-1)*p)].toFixed(0),mean=(secs.reduce((a,b)=>a+b,0)/count).toFixed(1);
console.log(JSON.stringify(over)+` | mean ${mean}s med ${q(.5)} p90 ${q(.9)} max ${q(1)} | unfinished ${capped}/${count} restarts ${restarts} | early-out ${(early/count).toFixed(1)} | comebacks/race ${(comebacks/count).toFixed(1)} | t#5/10/13 ${[4,9,12].map(k=>{const v=fallT.map(f=>f[k]??999).sort((a,b)=>a-b);const x=v[Math.floor(v.length/2)];return x>900?'-':x.toFixed(0);}).join('/')} | sideways ${(100*lateral/alivesec).toFixed(1)}cm/s | cpu ${((Date.now()-cpu)/1000).toFixed(0)}s`);
if(process.env.DETAIL)console.log('  rank',Object.entries(rank).map(([k,v])=>k+' '+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1)).join(', '),'\n  wins',JSON.stringify(wins));
