// 계산 전담 일꾼: 자리 정하기 핀볼과 런닝머신 경기를 미리 계산해 화면 쪽에 넘깁니다(화면이 멈추지 않도록 따로 돕니다).
import RAPIER from './vendor/rapier.mjs';
import {createRace,dropFor,pickKinds,raceFor,HZ,MAX_RACE_SECONDS} from './sim.mjs';
const ready=RAPIER.init();
const EVERY=HZ/60;
self.onmessage=async e=>{
 try{
  const {seed,n,version}=e.data;await ready;
  // 1) 자리 정하기 핀볼
  {const d=dropFor(version).create(RAPIER,n,seed),fr=[],pad=[];let k=0;const rec=()=>{if(k++%EVERY===0){fr.push(...d.snapshot());if(d.padAngle)pad.push(d.padAngle());}};
   while(!d.finished()){d.step();rec();}for(let i=0;i<HZ;i++){d.step();rec();}
   const frames=Float32Array.from(fr);
   self.postMessage({type:'drop',order:d.order.slice(),events:d.events.map(x=>({frame:Math.floor(x.frame/EVERY),i:x.i})),frames,stride:n*4,walls:d.walls,bar:d.bar,pad:pad.length?Float32Array.from(pad):null,gateFrame:d.gateFrame==null?null:Math.floor(d.gateFrame/EVERY)},[frames.buffer]);d.world.free();}
  // 2) 경기
  const R=raceFor(version),kinds=pickKinds(seed,n,R.carW),g=createRace(RAPIER,kinds,seed,R),ramp=[],speed=[];
  const stride=g.snapshot().length,chunks=[],belt=[];let k=0,last=0;
  const rec=()=>{if(k++%EVERY===0){chunks.push(Float32Array.from(g.snapshot()));belt.push(g.beltPos);ramp.push(g.rampNow());speed.push(g.beltSpeed());}};
  while(!g.finished()&&g.t<MAX_RACE_SECONDS){g.step();rec();if(g.t-last>=2){last=g.t;self.postMessage({type:'progress',secs:g.t,left:g.entries.filter(x=>!x.out).length});}}
  const order=g.result(),finished=g.finished(),secs=g.t;
  for(let i=0;i<HZ*2.5;i++){g.step();rec();}
  const frames=new Float32Array(chunks.length*stride);chunks.forEach((c,i)=>frames.set(c,i*stride));const beltPos=Float64Array.from(belt);
  self.postMessage({type:'race',kinds,stride,frames,beltPos,ramp:Float32Array.from(ramp),speed:Float32Array.from(speed),order,finished,secs,restarts:g.restarts,
   desc:{loop:g.loop,seams:g.seams,entries:g.entries.map(x=>({i:x.i,kind:x.kind,wheels:x.wheels.length,outAt:x.outAt==null?null:x.outAt/EVERY}))},
   events:g.events.map(x=>({type:x.type,i:x.i,frame:x.frame/EVERY}))},[frames.buffer,beltPos.buffer]);
  g.world.free();
 }catch(err){self.postMessage({type:'error',message:String(err&&err.message||err)});}
};
