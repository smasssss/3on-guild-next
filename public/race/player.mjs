// 정통 경마 재생과 소리. open(상자,{seed,n,...}) 이 경기 한 판을 준비하고, play() 로 틀어 줍니다.
// 중계 목소리: 미리 짠 중계 순서(commentary.mjs)대로, voice/index.json 에 적힌 녹음 조각을 이어 붙여 틉니다.
//   녹음이 아직 없으면(index.json 이 비어 있으면) 기기에 들어 있는 읽어 주는 목소리로 같은 문장을 읽습니다.
// 배경음악: music/race.mp3 를 출발 신호부터 틀고, 말하는 동안은 작게 줄이며, 경기가 끝나면 서서히 끕니다.
import {createShow} from './view.mjs';
import {planCommentary} from './commentary.mjs';
import {PRE,COUNTDOWN} from './timeline.mjs';
const VOICE_VERSION='1',MUSIC_VOLUME=0.2,VOICE_VOLUME=1,url=p=>new URL(p,import.meta.url).href;
let linesP=null,indexP=null;
const lines=()=>linesP||(linesP=fetch(url('voice/lines.json?v='+VOICE_VERSION)).then(r=>r.ok?r.json():{}).catch(()=>({})));
// index.json: 녹음된 조각의 이름과 길이(초). 비어 있으면 녹음이 아직 없는 것으로 보고 기기 목소리로 읽습니다.
const clipIndex=()=>indexP||(indexP=fetch(url('voice/index.json?v='+VOICE_VERSION)).then(r=>r.ok?r.json():null).then(j=>j&&Object.keys(j).length?j:null).catch(()=>null));
const decode=(ctx,p)=>fetch(url(p)).then(r=>r.ok?r.arrayBuffer():Promise.reject(Error(p))).then(b=>new Promise((ok,no)=>ctx.decodeAudioData(b,ok,no)));
/** 경기 한 판을 준비합니다. ctx 는 누르는 순간 만들어 둔 소리 장치(없으면 소리 없이 진행). */
export async function open(box,{seed,n,version,ctx=null,voice=true,music=true,onEnd=null}){
 box.innerHTML='<div class="rg-stage"><canvas class="rg-canvas" aria-label="정통 경마 화면"></canvas><p class="rg-wait" role="status">경기를 준비하는 중입니다…</p></div><div class="rg-bar"><button type="button" class="rg-skip" hidden>결과 바로 보기</button><span class="rg-hint">휴대폰을 옆으로 돌려서 보세요.</span></div>';
 const cv=box.querySelector('canvas'),wait=box.querySelector('.rg-wait'),skipBtn=box.querySelector('.rg-skip');
 const show=await createShow(cv,{seed,n,version,greeting:voice}),race=show.race,text=await lines(),index=ctx&&voice?await clipIndex():null,plan=planCommentary(race,show.tl,text,index),buffers=new Map();
 // 이번 경기에 필요한 목소리 조각만 미리 받아 둠(오래 걸리면 받은 것까지만 쓰고 시작)
 if(index){const jobs=plan.keys.filter(k=>index[k]).map(k=>decode(ctx,'voice/'+k+'.mp3?v='+VOICE_VERSION).then(b=>buffers.set(k,b)).catch(()=>{}));await Promise.race([Promise.all(jobs),new Promise(r=>setTimeout(r,8000))]);}
 let musicBuf=null;if(ctx&&music)decode(ctx,'music/race.mp3?v='+VOICE_VERSION).then(b=>{musicBuf=b;}).catch(()=>{});
 wait.remove();show.render(0);
 const tts=voice&&!index&&typeof speechSynthesis!=='undefined'&&typeof SpeechSynthesisUtterance!=='undefined',stopAt=voice?Math.max(show.total,plan.endAt):show.total; // 목소리를 끄면 순위 읽기 정리 없이 결과판에서 끝남
 let raf=0,t0=null,at=0,sources=[],bgm=null,ended=false,closed=false,duckUntil=-1,ducked=false;
 const musicLevel=v=>{if(bgm&&ctx)try{bgm.g.gain.setTargetAtTime(v,ctx.currentTime,0.08);}catch{/* 음악 없음 */}};
 const hush=()=>{for(const s of sources)try{s.stop();}catch{/* 이미 끝남 */}sources=[];if(tts)try{speechSynthesis.cancel();}catch{/* 지원하지 않음 */}duckUntil=-1;};
 function say(it,t){
  if(!voice)return;
  if(index){if(!it.keys.every(k=>buffers.has(k)))return; // 조각이 하나라도 비면 그 문장은 건너뜀
   let when=ctx.currentTime+0.02;const end=it.cut!=null?when+it.cut:Infinity;
   for(const k of it.keys){if(when>=end)break;const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buffers.get(k);g.gain.value=VOICE_VOLUME;src.connect(g);g.connect(ctx.destination);src.start(when);if(end<when+src.buffer.duration)src.stop(end);when+=src.buffer.duration+0.04;sources.push(src);}
   if(sources.length>24)sources=sources.slice(-12);}
  else if(tts){if(it.cut!=null&&it.cut<1.2)return;const words=plan.textOf(it);if(!words)return;const u=new SpeechSynthesisUtterance(words);u.lang='ko-KR';u.rate=it.level==='c'?1.15:it.level==='e'?1.35:1.5;u.pitch=it.level==='c'?1:it.level==='e'?1.15:1.3;u.volume=1;
   try{if(it.p>=5&&it.kind!=='wrap')speechSynthesis.cancel();speechSynthesis.speak(u);}catch{/* 지원하지 않음 */}}
  else return;
  duckUntil=t+(it.cut!=null?it.cut:it.dur);
 }
 function startMusic(){if(!musicBuf||bgm||!ctx||ended)return;const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=musicBuf;src.loop=true;g.gain.value=MUSIC_VOLUME;src.connect(g);g.connect(ctx.destination);src.start();bgm={src,g};ducked=false;}
 function stopMusic(fade){const m=bgm;bgm=null;if(!m||!ctx)return;try{if(!fade)m.src.stop();else{const t=ctx.currentTime;m.g.gain.cancelScheduledValues(t);m.g.gain.setValueAtTime(m.g.gain.value,t);m.g.gain.linearRampToValueAtTime(0,t+2.5);m.src.stop(t+2.6);}}catch{/* 이미 멈춤 */}}
 function finish(){if(ended)return;ended=true;skipBtn.hidden=true;stopMusic(true);if(onEnd)onEnd(race);}
 function tick(nowMs){if(closed)return;if(t0==null)t0=nowMs;const t=(nowMs-t0)/1000;
  let readRank=0;if(voice)for(const it of plan.items)if(it.rank&&t>=it.t&&t<it.t+it.dur+0.12)readRank=it.rank;
  show.render(t,{readRank});
  if(t>=PRE-COUNTDOWN)startMusic();
  while(at<plan.items.length&&plan.items[at].t<=t){const it=plan.items[at++];if(t-it.t<0.6)say(it,t);}
  const want=t<duckUntil;if(want!==ducked){ducked=want;musicLevel(want?MUSIC_VOLUME*0.3:MUSIC_VOLUME);}
  if(t>=show.endAt+0.6)finish();
  if(t<stopAt)raf=requestAnimationFrame(tick);else raf=0;
 }
 const api={race,show,plan,
  play(){if(closed||raf||t0!=null)return;skipBtn.hidden=false;if(ctx&&ctx.state!=='running')ctx.resume().catch(()=>{});raf=requestAnimationFrame(tick);},
  // 결과 바로 보기: 결과판으로 건너뛰고, 순위를 불러 주는 정리 중계부터 이어 감
  skip(){if(closed||ended)return;hush();const jump=voice?plan.wrapAt-0.3:show.endAt+0.7;t0=performance.now()-jump*1000;at=plan.items.findIndex(it=>it.t>=jump);if(at<0)at=plan.items.length;finish();if(!raf)raf=requestAnimationFrame(tick);},
  close(){closed=true;cancelAnimationFrame(raf);hush();stopMusic(false);box.innerHTML='';},
 };
 skipBtn.onclick=()=>api.skip();
 return api;
}
