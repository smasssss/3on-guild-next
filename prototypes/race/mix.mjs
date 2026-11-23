// 경기 영상(소리 없음)에 중계 목소리와 음악을 사이트와 같은 순서로 입힙니다(개발용, 들어 보기 위한 것).
// 쓰는 법: node prototypes/race/mix.mjs 추첨번호 선수수 소리없는영상.mp4 결과.mp4
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {runRace} from '../../public/race/sim.mjs';import {timeline,PRE,COUNTDOWN} from '../../public/race/timeline.mjs';import {planCommentary} from '../../public/race/commentary.mjs';
const [seed,n,video,out]=process.argv.slice(2),dir=new URL('../../public/race/',import.meta.url).pathname;
const lines=JSON.parse(fs.readFileSync(dir+'voice/lines.json','utf8')),index=JSON.parse(fs.readFileSync(dir+'voice/index.json','utf8'));
const race=runRace(seed,+n),tl=timeline(race),plan=planCommentary(race,tl,lines,index),args=['-y','-loglevel','error','-i',video,'-stream_loop','-1','-i',dir+'music/race.mp3'],parts=[],names=[];let k=2;
for(const it of plan.items){let at=it.t;const end=it.cut!=null?it.t+it.cut:Infinity;
 for(const key of it.keys){if(at>=end)break;const d=index[key];args.push('-i',dir+'voice/'+key+'.mp3');const keep=Math.min(d,end-at);
  parts.push('['+k+':a]atrim=0:'+keep.toFixed(3)+',adelay='+Math.round(at*1000)+':all=1[c'+k+']');names.push('[c'+k+']');k++;at+=d+0.04;}}
const musicAt=PRE-COUNTDOWN,musicEnd=tl.endAt+0.6;
const filter=parts.join(';')+';'+names.join('')+'amix=inputs='+names.length+':normalize=0:dropout_transition=0,asplit[v1][v2];'
 +'[1:a]atrim=0:'+(musicEnd-musicAt+2.6).toFixed(2)+',volume=0.2,afade=t=out:st='+(musicEnd-musicAt).toFixed(2)+':d=2.5,adelay='+Math.round(musicAt*1000)+':all=1[m];'
 +'[m][v1]sidechaincompress=threshold=0.015:ratio=10:attack=40:release=400[md];[md][v2]amix=inputs=2:normalize=0:dropout_transition=0[a]';
execFileSync('ffmpeg',[...args,'-filter_complex',filter,'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','128k','-t',plan.endAt.toFixed(2),out],{stdio:'inherit'});
console.log('중계 문장',plan.items.length,'개, 길이',plan.endAt.toFixed(1)+'초');
for(const it of plan.items)console.log(it.t.toFixed(1).padStart(6),it.level,it.cut!=null?'(끊김)':'',plan.textOf(it));
