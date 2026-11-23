// 정통 경마 중계 순서. 경기가 미리 계산되어 있으므로, 어느 순간 어떤 문장을 어떤 세기로 말할지도 미리 짭니다.
// 흐름(2026-11-23 사용자 결정): 차분한 인사로 시작 → 사건이 생기고 결승선에 가까워질수록 점점 격앙 → 끝나면 다시 차분하게 순위를 불러 주며 정리.
// 세기는 세 단계입니다: c(차분) · e(흥분) · s(고함). 녹음 조각 이름은 '문장이름_세기' 입니다(예: p_stomp_s, n7_giraffe_e).
import {TYPES,TRACK} from './sim.mjs';
import {PRE} from './timeline.mjs';
export const CASTER='핵불잙',LEVELS=['c','e','s'];
export const HELLO='안녕하십니까. 이번 경기 해설을 맡은 '+CASTER+'입니다.',READY='선수들이 출발선에 섰습니다.';
// 사건 하나를 어떤 조각으로 읽을지(이름 조각 n번호_종류, 문장 조각 p_…, 순위 조각 f순위)와 중요도(1~5)
export function voiceOf(e,types,rank){
 const nm=no=>'n'+no+'_'+types[no-1],ta=e.a?types[e.a-1]:'';
 switch(e.kind){
  case 'start':return {keys:['p_start'],p:5};
  case 'lead':return {keys:['p_lead',nm(e.a)],p:1};
  case 'home':return {keys:['p_home',nm(e.a)],p:4};
  case 'end':return {keys:['p_end'],p:4};
  case 'finish':return {keys:[nm(e.a),'f'+rank],p:rank===1?6:rank<=3?5:rank===types.length?3:2}; // 우승 선언은 무엇보다 먼저
  case 'fall':return ta==='costume'&&/두 사람/.test(e.text)?{keys:['p_fall_split'],p:1}:{keys:[nm(e.a),'p_fall'],p:1};
  case 'back':case 'burst':case 'slip':case 'cele':return {keys:[nm(e.a),'p_'+e.kind],p:e.kind==='cele'?5:2};
  case 'eat':return {keys:['p_eat_'+(ta==='panda'?'panda':'cow')],p:1};
  case 'bounce':return {keys:['p_bounce_'+(ta==='panda'?'panda':'cheetah')],p:3};
  case 'pounce':case 'bowl':case 'trample':return {keys:['p_'+e.kind,nm(e.b)],p:3};
  case 'ride':return {keys:['p_ride',nm(e.b)],p:5};
  case 'grab':return {keys:['p_grab',nm(e.b)],p:5};
  case 'throwfwd':return {keys:['p_throwfwd'],p:5};
  case 'throwback':return {keys:['p_throwback'],p:4};
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
// 조각 하나의 글(녹음할 때와, 녹음이 없어 기기 목소리로 읽을 때 씁니다)
export function clipText(full,lines){const k=full.slice(0,-2),lv=full.slice(-1),m=/^n(\d+)_(\w+)$/.exec(k);if(m)return TYPES[m[2]]?m[1]+'번 '+TYPES[m[2]].name+(lv==='c'?'.':'!'):null;return lines[k]||null;}
// 녹음이 없을 때 쓰는 어림 길이(초)
const guess=(full,lines)=>{const t=clipText(full,lines)||'';return 0.25+t.length*(full.endsWith('_c')?0.12:full.endsWith('_e')?0.1:0.09);};
/** 중계 순서를 짭니다. tl: timeline(race), lines: voice/lines.json, index: voice/index.json(조각별 길이, 없으면 null).
    돌려주는 것: [{t(재생 시각, 초),keys(조각 이름들),dur(길이),p(중요도),level,cut?(이만큼만 말하고 끊김),rank?(정리 때 읽는 순위)}], 그리고 정리가 끝나는 시각 */
export function planCommentary(race,tl,lines,index=null){
 const durOf=k=>(index&&index[k])||guess(k,lines),items=[];let busy=0;
 const add=(t,keys,p,level,extra)=>{const dur=keys.reduce((a,k)=>a+durOf(k)+0.04,0);items.push({t,keys,dur,p,level,...extra});busy=t+dur+0.12;return dur;};
 // 인사(차분): 출발 신호 전에 끝나는 만큼만
 add(0.4,['i_hello_c'],9,'c');if(busy+0.15+durOf('i_ready_c')<PRE-0.15)add(busy+0.15,['i_ready_c'],9,'c');
 // 경기 중: 선두가 결승선에 가까워질수록, 큰 사건일수록 세게
 let rank=0;const cands=[];
 race.events.forEach(e=>{const r=e.kind==='finish'?++rank:0,v=voiceOf(e,race.types,r);if(!v)return;const f=Math.min(tl.F-1,e.frame);if(e.kind!=='end'&&e.kind!=='finish'&&tl.speedAt[f]>1)return;
  const prog=Math.min(1,Math.max(...race.frames[f].map(q=>q.x))/TRACK),after=e.frame>tl.firstF;
  // 세기: 결승선에 가까울수록 올라가고(차분→흥분→고함), 큰 사건이면 반 단계 더
  const heat=prog*2+(v.p>=5?0.5:0);let lv=e.kind==='start'?0:heat<0.5?0:heat<1.3?1:2;
  if(e.kind==='finish')lv=r<=3?2:1;else if(after)lv=Math.min(lv,1);if(e.kind==='end')lv=1;
  cands.push({t:e.kind==='start'?PRE:tl.timeOf(e.frame),keys:v.keys.map(k=>k+'_'+LEVELS[lv]),p:v.p,level:LEVELS[lv],kind:e.kind});});
 // 같은 말을 되풀이하지 않게: 캥거루가 두 번째부터 오면 다른 문장으로
 {let stomps=0;for(const c of cands)if(c.kind==='stomp'&&stomps++>0)c.keys=c.keys.map(k=>k.replace('p_stomp_','p_stomp2_'));}
 cands.forEach((c,i)=>{let t=c.t;const dur=c.keys.reduce((a,k)=>a+durOf(k)+0.04,0);
  while(t<busy){const wait=busy-t,cur=items[items.length-1];
   if(c.p>cur.p&&cur.t>=t-0.8&&cur.p<9){items.pop();const prev=items[items.length-1];busy=prev.t+(prev.cut!=null?prev.cut:prev.dur)+0.12;continue;} // 아직 시작 안 했거나 막 시작한 덜 중요한 말은 빼고 다시 봄
   if(c.p>=5&&cur.p<c.p&&cur.p<9){cur.cut=t-cur.t;break;}        // 큰 사건은 하던 말을 끊고 바로
   if((c.p>=3&&wait<=1.5)||(c.p>=5&&wait<=3.5)){t=busy;break;}    // 조금 기다렸다가
   t=-1;break;}
  if(t<0)return;
  // 이 말을 하는 사이에 더 큰 사건이 터질 예정이면, 사소한 말은 하지 않음
  if(c.p<=2&&cands.slice(i+1).some(o=>o.t>t+0.2&&o.t<t+dur-0.3&&o.p>=4))return;
  add(t,c.keys,c.p,c.level,{kind:c.kind});});
 // 조용한 틈이 길면 현재 선두와 꼴찌를 번갈아 알려 줌(선두가 들어오기 전까지)
 {const firstT=tl.timeOf(tl.firstF),base=items.slice(),fill=[];let flip=0;
  for(let k=0;k<base.length;k++){const a=base[k],next=k+1<base.length?base[k+1].t:firstT;let from=a.t+(a.cut!=null?a.cut:a.dur)+1.0;
   while(from>PRE+2.5&&from<firstT-2){const f=tl.frameAt(from),xs=race.frames[Math.min(tl.F-1,f)].map(q=>q.x),prog=Math.min(1,Math.max(...xs)/TRACK);
    const who=xs.indexOf(flip%2===0?Math.max(...xs):Math.min(...xs)),lv=LEVELS[prog*2<0.5?0:prog*2<1.3?1:2],keys=[(flip%2===0?'p_now_':'p_tail_')+lv,'n'+(who+1)+'_'+race.types[who]+'_'+lv],dur=keys.reduce((s,x)=>s+durOf(x)+0.04,0);
    if(from+dur>next-0.4)break;fill.push({t:from,keys,dur,p:0,level:lv,kind:'fill'});flip++;from+=dur+2.2;}}
  items.push(...fill);items.sort((x,y)=>x.t-y.t);busy=Math.max(...items.map(x=>x.t+(x.cut!=null?x.cut:x.dur)))+0.12;}
 // 정리(차분): 결과판을 보며 순위를 차례로 불러 줌
 const wrapAt=Math.max(tl.endAt+0.9,busy+0.4);add(wrapAt,['w_intro_c'],9,'c',{kind:'wrap'});
 race.order.forEach((no,k)=>add(busy+0.1,['r'+(k+1)+'_c','n'+no+'_'+race.types[no-1]+'_c'],9,'c',{kind:'wrap',rank:k+1}));
 add(busy+0.25,['w_outro_c'],9,'c',{kind:'wrap'});
 return {items,wrapAt,endAt:busy+0.6,keys:[...new Set(items.flatMap(x=>x.keys))],textOf:it=>it.keys.map(k=>clipText(k,lines)||'').join(' ')};
}
