// 중계 목소리 조각 만들기(개발용, 유료: OpenAI 음성 합성 API 크레딧 필요).
// public/race/voice/lines.json 의 문장과 "N번 선수이름!" 110개를 녹음해 public/race/voice/*.mp3 와 index.json(조각별 길이)을 만듭니다.
// 쓰는 법: node prototypes/race/voice-gen.mjs [이미 있는 조각은 건너뜀]. 열쇠는 환경 설정의 네트워크 비밀로 들어가므로 여기에는 적지 않습니다.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {TYPES} from '../../public/race/sim.mjs';
const dir=new URL('../../public/race/voice/',import.meta.url).pathname,lines=JSON.parse(fs.readFileSync(dir+'lines.json','utf8')),jobs=Object.entries(lines);
for(const [type,T] of Object.entries(TYPES))for(let no=1;no<=10;no++)jobs.push(['n'+no+'_'+type,no+'번 '+T.name+'!']);
// 말투를 '연기'시킬 수 있는 음성 모델을 씁니다(읽어 주기 전용 모델은 중계치고 너무 차분했음, 2026-11-23 사용자 의견).
const MODEL=process.env.VOICE_MODEL||'gpt-audio-1.5',VOICE=process.env.VOICE_NAME||'echo';
const STYLE='You are a voice actor. Speak ONLY the exact Korean line the user gives, word for word, nothing before or after. Performance direction: a frantic Korean horse-racing play-by-play announcer at the climax of the race. He is SHOUTING at the top of his lungs, voice straining and almost cracking with excitement. Pacing: extremely fast and breathless, words tumbling out. Pitch: high and rising, peaking hard on every exclamation. Energy: absolute maximum, like a last-second goal call in a World Cup final. Never calm, never soft, never slow.';
const plain=t=>t.replace(/유에프오/g,'UFO').replace(/[^0-9A-Za-z가-힣]/g,'');
const index={};let made=0,failed=0;
for(const [key,text] of jobs){const out=dir+key+'.mp3',raw='/tmp/voice_raw_'+key+'.mp3';
 if(!fs.existsSync(out)){
  // 이 환경은 정해진 통로(프록시)로만 밖에 나갈 수 있어 curl 로 요청합니다. 받은 소리의 받아쓰기가 문장과 다르면(말을 덧붙였으면) 세 번까지 다시 시킵니다.
  const body=JSON.stringify({model:MODEL,modalities:['text','audio'],audio:{voice:VOICE,format:'mp3'},messages:[{role:'system',content:STYLE},{role:'user',content:text}]});
  let ok=false,why='';for(let k=0;k<3&&!ok;k++){try{const d=JSON.parse(execFileSync('curl',['-s','-m','180','https://api.openai.com/v1/chat/completions','-H','Authorization: Bearer dummy','-H','Content-Type: application/json','-d',body],{maxBuffer:64*1024*1024}).toString());
    if(d.error){why=d.error.code||d.error.message;if(/quota|credit|key/i.test(JSON.stringify(d.error)))break;continue;}
    const a=d.choices[0].message.audio;if(plain(a.transcript||'')!==plain(text)){why='다르게 읽음: '+(a.transcript||'').slice(0,60);continue;}
    fs.writeFileSync(raw,Buffer.from(a.data,'base64'));ok=true;}catch(e){why=String(e.message).slice(0,120);}}
  if(!ok){failed++;console.log('실패',key,why);if(/quota|credit|key/i.test(why))break;continue;}
  // 앞뒤 무음을 잘라 내고 소리 크기를 고르게 맞춘 뒤 작은 파일로 저장
  execFileSync('ffmpeg',['-y','-loglevel','error','-i',raw,'-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5','-ac','1','-ar','24000','-b:a','48k',out]);fs.unlinkSync(raw);made++;}
 index[key]=Math.round(parseFloat(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',out]).toString())*100)/100;}
if(Object.keys(index).length===jobs.length){fs.writeFileSync(dir+'index.json',JSON.stringify(index)+'\n');console.log('끝: 새로 만든 조각',made,'전체',jobs.length);}
else console.log('아직 다 만들지 못했습니다. 만든 조각',Object.keys(index).length,'/',jobs.length,'실패',failed,'(index.json 은 다 만들어진 뒤에만 씁니다)');
