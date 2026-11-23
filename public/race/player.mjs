// 엉뚱 경주 재생과 소리. open(상자,{seed,n,...}) 이 경기 한 판을 준비하고, play() 로 틀어 줍니다.
// 중계 목소리: voice/index.json 에 적힌 녹음 조각이 있으면 그것을 이어 붙여 틀고, 없으면 기기에 들어 있는 읽어 주는 목소리로 같은 문장을 읽습니다.
// 배경음악: music/race.mp3 가 있으면 출발 신호부터 틀고 경기가 끝나면 줄입니다(없으면 음악 없이 진행).
import {createShow,PRE} from './view.mjs';
import {TYPES} from './sim.mjs';
const VOICE_VERSION='1',MUSIC_VOLUME=0.2,VOICE_VOLUME=0.95,url=p=>new URL(p,import.meta.url).href;
let linesP=null,indexP=null;
const lines=()=>linesP||(linesP=fetch(url('voice/lines.json?v='+VOICE_VERSION)).then(r=>r.ok?r.json():{}).catch(()=>({})));
// index.json: 녹음된 조각의 이름과 길이(초). 비어 있으면 녹음이 아직 없는 것으로 보고 기기 목소리로 읽습니다.
const clipIndex=()=>indexP||(indexP=fetch(url('voice/index.json?v='+VOICE_VERSION)).then(r=>r.ok?r.json():null).then(j=>j&&Object.keys(j).length?j:null).catch(()=>null));
// 사건 하나를 어떤 조각으로 읽을지(이름 조각 n번호_종류, 문장 조각 p_…, 순위 조각 f순위)와 중요도
export function voiceOf(e,types,rank){
 const nm=no=>'n'+no+'_'+types[no-1],ta=e.a?types[e.a-1]:'';
 switch(e.kind){
  case 'start':return {keys:['p_start'],p:5};
  case 'lead':return {keys:['p_lead',nm(e.a)],p:1};
  case 'home':return {keys:['p_home',nm(e.a)],p:4};
  case 'end':return {keys:['p_end'],p:4};
  case 'finish':return {keys:[nm(e.a),'f'+rank],p:rank<=3?4:rank===types.length?3:1};
  case 'fall':return ta==='costume'&&/두 사람/.test(e.text)?{keys:['p_fall_split'],p:1}:{keys:[nm(e.a),'p_fall'],p:1};
  case 'back':case 'burst':case 'slip':case 'cele':return {keys:[nm(e.a),'p_'+e.kind],p:e.kind==='cele'?5:2};
  case 'eat':return {keys:['p_eat_'+(ta==='panda'?'panda':'cow')],p:1};
  case 'bounce':return {keys:['p_bounce_'+(ta==='panda'?'panda':'cheetah')],p:3};
  case 'pounce':case 'bowl':case 'trample':return {keys:['p_'+e.kind,nm(e.b)],p:3};
  case 'ride':return {keys:['p_ride',nm(e.b)],p:5};
  case 'ufo':return {keys:['p_ufo',nm(e.a)],p:5};
  case 'shellhit':return {keys:[nm(e.b),'p_shellhit'],p:2};
  case 'ufodrop':return {keys:['p_ufodrop'+(/뒤쪽/.test(e.text)?'_back':/선두 앞/.test(e.text)?'_front':'')],p:4};
  case 'nap':case 'dig':case 'bonk':case 'wait':case 'unshell':return {keys:['p_'+e.kind],p:2};
  case 'panic':case 'rideoff':case 'ricochet':case 'nofuel':return {keys:['p_'+e.kind],p:3};
  case 'split':return {keys:['p_split'],p:4};
  case 'stomp':case 'bike':case 'leap':case 'tornado':case 'ufofail':return {keys:['p_'+e.kind],p:5};
  default:return null;
 }
}
export const nameText=key=>{const m=/^n(\d+)_(\w+)$/.exec(key);return m&&TYPES[m[2]]?m[1]+'번 '+TYPES[m[2]].name+'!':null;};
/** 경기 한 판을 준비합니다. ctx 는 누르는 순간 만들어 둔 소리 장치(없으면 소리 없이 진행). */
export async function open(box,{seed,n,ctx=null,voice=true,music=true,onEnd=null}){
 box.innerHTML='<div class="rg-stage"><canvas class="rg-canvas" aria-label="엉뚱 경주 화면"></canvas><p class="rg-wait" role="status">경기를 준비하는 중입니다…</p></div><div class="rg-bar"><button type="button" class="rg-skip" hidden>결과 바로 보기</button><span class="rg-hint">휴대폰을 가로로 돌리면 더 크게 보입니다.</span></div>';
 const cv=box.querySelector('canvas'),wait=box.querySelector('.rg-wait'),skipBtn=box.querySelector('.rg-skip');
 const show=await createShow(cv,{seed,n}),race=show.race,ranks=new Map();{let k=0;for(const e of race.events)if(e.kind==='finish')ranks.set(e,++k);}
 // 이번 경기에 필요한 목소리 조각만 미리 받아 둠
 const text=await lines(),index=ctx&&voice?await clipIndex():null,buffers=new Map(),plan=race.events.map(e=>voiceOf(e,race.types,ranks.get(e)));
 const sayText=keys=>keys.map(k=>nameText(k)||text[k]||'').join(' ');
 if(index){const need=new Set(['p_ready','p_last']);for(const v of plan)if(v)v.keys.forEach(k=>need.add(k));
  const jobs=[...need].filter(k=>index[k]).map(k=>fetch(url('voice/'+k+'.mp3?v='+VOICE_VERSION)).then(r=>r.ok?r.arrayBuffer():Promise.reject()).then(b=>new Promise((ok,no)=>ctx.decodeAudioData(b,ok,no))).then(buf=>buffers.set(k,buf)).catch(()=>{}));
  await Promise.race([Promise.all(jobs),new Promise(r=>setTimeout(r,5000))]);}
 let musicBuf=null;if(ctx&&music)fetch(url('music/race.mp3?v='+VOICE_VERSION)).then(r=>r.ok?r.arrayBuffer():Promise.reject()).then(b=>new Promise((ok,no)=>ctx.decodeAudioData(b,ok,no))).then(b=>{musicBuf=b;}).catch(()=>{});
 wait.remove();show.render(0);
 const tts=voice&&typeof speechSynthesis!=='undefined'&&typeof SpeechSynthesisUtterance!=='undefined';
 let raf=0,t0=null,evAt=0,busyUntil=0,curP=0,pending=null,sources=[],bgm=null,ended=false,closed=false,lastShot=null;
 const hush=()=>{for(const s of sources)try{s.stop();}catch{/* 이미 끝남 */}sources=[];if(tts)try{speechSynthesis.cancel();}catch{/* 지원하지 않음 */}busyUntil=0;pending=null;duck(MUSIC_VOLUME);};
 const duck=v=>{if(bgm&&ctx)try{bgm.g.gain.setTargetAtTime(v,ctx.currentTime,0.08);}catch{/* 음악 없음 */}};
 function speak(keys,p,now){
  if(!voice)return;curP=p;
  if(index&&keys.every(k=>buffers.has(k))){let at=ctx.currentTime+0.02;for(const k of keys){const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buffers.get(k);g.gain.value=VOICE_VOLUME;src.connect(g);g.connect(ctx.destination);src.start(at);at+=src.buffer.duration+0.03;sources.push(src);}
   const dur=at-ctx.currentTime;busyUntil=now+dur+0.12;duck(MUSIC_VOLUME*0.35);setTimeout(()=>{if(performance.now()/1000>=busyUntil-0.05)duck(MUSIC_VOLUME);},dur*1000+150);return;}
  if(index||!tts)return; // 녹음이 있는 경기에서 조각 하나가 비면 그 문장은 건너뜀(목소리가 섞이지 않게)
  const t=sayText(keys);if(!t)return;const u=new SpeechSynthesisUtterance(t);u.lang='ko-KR';u.rate=1.4;u.pitch=1.1;u.volume=1;busyUntil=now+Math.max(1,t.length*0.1);u.onend=u.onerror=()=>{busyUntil=Math.min(busyUntil,performance.now()/1000+0.1);duck(MUSIC_VOLUME);};duck(MUSIC_VOLUME*0.35);
  try{speechSynthesis.speak(u);}catch{/* 지원하지 않음 */}
 }
 function consider(v,now){if(!v)return;
  if(now<busyUntil){if(v.p>=5&&v.p>curP){hush();speak(v.keys,v.p,now);}else if(v.p>=3&&(!pending||v.p>=pending.p))pending={...v,until:now+1.6};return;}
  speak(v.keys,v.p,now);}
 function startMusic(){if(!musicBuf||bgm||!ctx)return;const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=musicBuf;src.loop=true;g.gain.value=MUSIC_VOLUME;src.connect(g);g.connect(ctx.destination);src.start();bgm={src,g};}
 function stopMusic(fade){const m=bgm;bgm=null;if(!m||!ctx)return;try{if(!fade)m.src.stop();else{const t=ctx.currentTime;m.g.gain.cancelScheduledValues(t);m.g.gain.setValueAtTime(m.g.gain.value,t);m.g.gain.linearRampToValueAtTime(0,t+1.6);m.src.stop(t+1.7);}}catch{/* 이미 멈춤 */}}
 function finish(){if(ended)return;ended=true;skipBtn.hidden=true;stopMusic(true);if(onEnd)onEnd(race);}
 function tick(nowMs){if(closed)return;if(t0==null)t0=nowMs;const now=nowMs/1000,t=(nowMs-t0)/1000,f=show.frameAt(t),fast=f>=0&&f<show.F&&show.speedAt[f]>1;
  show.render(t);
  if(f>=0)startMusic();
  while(evAt<race.events.length&&race.events[evAt].frame<=f){const v=plan[evAt++];if(!fast&&t<show.endAt+0.5)consider(v,now);}
  if(pending&&now>=busyUntil){if(now<=pending.until&&!fast)speak(pending.keys,pending.p,now);pending=null;}
  const shot=show.shots.find(s=>f>=s.f0&&f<s.f1);if(shot!==lastShot){lastShot=shot;if(shot&&shot.kind==='last'&&now>=busyUntil)speak(['p_last'],1,now);}
  if(fast&&now<busyUntil)hush();
  if(t>=show.endAt+0.6)finish();
  if(t<show.total)raf=requestAnimationFrame(tick);
 }
 const api={race,show,
  play(){if(closed||raf)return;skipBtn.hidden=false;if(ctx&&ctx.state!=='running')ctx.resume().catch(()=>{});consider({keys:['p_ready'],p:5},performance.now()/1000);raf=requestAnimationFrame(tick);},
  skip(){if(closed)return;hush();evAt=race.events.length;const jump=show.endAt+0.7;t0=performance.now()-jump*1000;show.render(jump);finish();if(!raf)raf=requestAnimationFrame(tick);},
  close(){closed=true;cancelAnimationFrame(raf);hush();stopMusic(false);box.innerHTML='';},
 };
 skipBtn.onclick=()=>api.skip();
 return api;
}
export {PRE};
