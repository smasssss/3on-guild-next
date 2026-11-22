// node scan.mjs 'k=v,..' from to cap → 판마다 한 줄: 씨앗, 길이, 다시시작, 초반 탈락, 되살아남, 마지막 3명 접전 시간, 떨어진 시각
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import {createRace,pickKinds,MACHINE,HZ} from './sim.mjs';
await RAPIER.init();
const over=Object.fromEntries((process.argv[2]||'').split(',').filter(Boolean).map(kv=>{const [k,v]=kv.split('=');return [k,v==='null'?null:Number(v)];}));
const a=Number(process.argv[3]),b=Number(process.argv[4]),cap=Number(process.argv[5]||70),m={...MACHINE,...over};
for(let s=a;s<b;s++){const seed=((s*40503+0xbeef01)>>>0).toString(16).padStart(8,'0'),kinds=pickKinds(seed,15,m.carW??1),g=createRace(RAPIER,kinds,seed,m);
 const st=g.entries.map(()=>({far:false}));let cb=0,near=0;
 while(!g.finished()&&g.t<cap){g.step();if(g.frame%24===0&&g.t>m.startDelay)for(const e of g.entries){if(e.out)continue;const p=e.body.translation(),q=st[e.i];
  if(p.z>0.62*m.len){q.far=true;if(p.z>0.88*m.len)near++;}else if(q.far&&p.z<0.3*m.len){q.far=false;cb++;}}}
 const f=g.events.filter(e=>e.type==='fall').map(e=>e.frame/HZ),res=g.result();
 console.log(seed,g.finished()?'ok':'CAP',g.t.toFixed(1),'re',g.restarts,'early',f.filter(t=>t<m.startDelay+2.5).length,'cb',cb,'edge',(near/10).toFixed(0),'win',kinds[res.at(-1)],'falls',f.map(t=>t.toFixed(0)).join(' '));g.world.free();}
