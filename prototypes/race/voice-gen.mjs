// 중계 목소리 조각 만들기(개발용, 유료: OpenAI 음성 합성 API 크레딧 필요).
// public/race/voice/lines.json 의 문장과 "N번 선수이름!" 110개를 녹음해 public/race/voice/*.mp3 와 index.json(조각별 길이)을 만듭니다.
// 쓰는 법: node prototypes/race/voice-gen.mjs [이미 있는 조각은 건너뜀]. 열쇠는 환경 설정의 네트워크 비밀로 들어가므로 여기에는 적지 않습니다.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {TYPES} from '../../public/race/sim.mjs';
const dir=new URL('../../public/race/voice/',import.meta.url).pathname,lines=JSON.parse(fs.readFileSync(dir+'lines.json','utf8')),jobs=Object.entries(lines);
for(const [type,T] of Object.entries(TYPES))for(let no=1;no<=10;no++)jobs.push(['n'+no+'_'+type,no+'번 '+T.name+'!']);
const MODEL=process.env.VOICE_MODEL||'gpt-4o-mini-tts',VOICE=process.env.VOICE_NAME||'ash';
const STYLE='한국 경마 중계 캐스터. 매우 흥분해서 빠르고 힘차게, 숨 가쁘게 외치듯 말한다. 또박또박 들리게 발음하고, 문장 끝을 힘 있게 올려 친다.';
const index={};let made=0,failed=0;
for(const [key,text] of jobs){const out=dir+key+'.mp3',raw='/tmp/voice_raw_'+key+'.mp3';
 if(!fs.existsSync(out)){
  const res=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer dummy','Content-Type':'application/json'},body:JSON.stringify({model:MODEL,voice:VOICE,input:text,instructions:STYLE,response_format:'mp3'})});
  if(!res.ok){failed++;console.log('실패',key,res.status,(await res.text()).slice(0,160));if(res.status===429||res.status===401)break;continue;}
  fs.writeFileSync(raw,Buffer.from(await res.arrayBuffer()));
  // 앞뒤 무음을 잘라 내고 소리 크기를 고르게 맞춘 뒤 작은 파일로 저장
  execFileSync('ffmpeg',['-y','-loglevel','error','-i',raw,'-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5','-ac','1','-ar','24000','-b:a','48k',out]);fs.unlinkSync(raw);made++;}
 index[key]=Math.round(parseFloat(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',out]).toString())*100)/100;}
if(Object.keys(index).length===jobs.length){fs.writeFileSync(dir+'index.json',JSON.stringify(index)+'\n');console.log('끝: 새로 만든 조각',made,'전체',jobs.length);}
else console.log('아직 다 만들지 못했습니다. 만든 조각',Object.keys(index).length,'/',jobs.length,'실패',failed,'(index.json 은 다 만들어진 뒤에만 씁니다)');
