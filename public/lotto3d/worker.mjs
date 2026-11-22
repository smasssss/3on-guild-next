// 로또 추첨기 계산 전담 일꾼: 추첨 전체를 미리 계산해 화면 쪽에 넘깁니다.
import RAPIER from '../treadmill3d/vendor/rapier.mjs';
import {createLotto,rangeOf,HZ} from './sim.mjs';
const ready=RAPIER.init(),EVERY=HZ/60;
self.onmessage=async e=>{
 try{const {seed,from,to,count}=e.data;await ready;
  const g=createLotto(RAPIER,rangeOf(from,to),count,seed),chunks=[];let k=0,last=0;const rec=()=>{if(k++%EVERY===0)chunks.push(g.snapshot());};
  while(!g.finished()&&g.t<600){g.step();rec();if(g.t-last>=2){last=g.t;self.postMessage({type:'progress',drawn:g.drawn.length});}}
  for(let i=0;i<HZ*1.5;i++){g.step();rec();}
  const stride=chunks[0].length,frames=new Float32Array(chunks.length*stride);chunks.forEach((c,i)=>frames.set(c,i*stride));
  self.postMessage({type:'done',numbers:g.drawn.slice(),events:g.events.map(x=>({frame:Math.floor(x.frame/EVERY),i:x.i,number:x.number})),frames,stride,port:g.port},[frames.buffer]);g.world.free();
 }catch(err){self.postMessage({type:'error',message:String(err&&err.message||err)});}
};
