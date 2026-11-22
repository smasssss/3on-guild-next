// 엉뚱 경주 계산(시안). 같은 추첨 번호(seed)면 언제나 같은 경기입니다. 사칙연산만 씁니다.
export const HZ=60,TRACK=1000,MAX_RACERS=10,MAX_SECONDS=70;
export function rng(seedHex){let a=parseInt(seedHex,16)>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
// 선수 종류와 버릇. v: 기본 속도, trip: 1초에 넘어질 확률, down: 넘어져 있는 시간(초)
export const TYPES={
 horse:{name:'경주마',v:29.2,trip:0.010,down:1.5},
 biped:{name:'두 발 말',v:24.87,trip:0.014,down:1.3,burstAt:0.55,burstV:40.41},
 cheetah:{name:'치타',v:16.41,trip:0.004,down:1.2,sprintV:43.44,sprint:2.4,rest:2.3},
 panda:{name:'판다',v:17.28,trip:0,down:0,rollMax:33.64,rollUp:0.86},
 ostrich:{name:'타조',v:30.19,trip:0.006,down:1.2,gawk:0.045},
 costume:{name:'인형탈 말',v:29.69,trip:0.030,down:1.3,secondWind:9},
};
const ORDER=['horse','biped','cheetah','panda','ostrich','costume'];
// 번호 1~n 에 어떤 선수가 들어갈지는 추첨 번호로 정함(종류가 고르게 섞이도록 한 벌씩 섞어서 나눔)
export function lineup(seedHex,n){const r=rng(seedHex),out=[];while(out.length<n){const d=ORDER.slice();for(let i=d.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[d[i],d[j]]=[d[j],d[i]];}out.push(...d);}return out.slice(0,n);}
export function runRace(seedHex,n){
 const types=lineup(seedHex,n),r=rng(((parseInt(seedHex,16)^0x5bd1e995)>>>0).toString(16).padStart(8,'0')),DT=1/HZ;
 const R=types.map((type,i)=>({no:i+1,type,form:0.90+0.20*r(),x:0,v:0,mood:1,down:0,gawk:0,hit:[],phase:r()*TYPES.cheetah.rest,sprinting:false,roll:0,burst:false,done:null,state:'run',cool:0}));
 const frames=[],events=[],finish=[];let t=0,lead=-1,leadSince=0;
 const say=(text,kind,a,b)=>events.push({t,frame:frames.length,text,kind,a,b});
 const name=q=>q.no+'번 '+TYPES[q.type].name;
 const obj=q=>{const s=name(q),c=s.charCodeAt(s.length-1);return s+((c-0xAC00)%28?'을':'를');};
 say('출발했습니다!','start');
 while(finish.length<n&&t<MAX_SECONDS){
  const live=R.filter(q=>q.done==null),lastX=Math.min(...live.map(q=>q.x));
  for(const q of live){const T=TYPES[q.type];
   q.mood+=(r()-0.5)*0.9*DT;q.mood=Math.max(0.86,Math.min(1.14,q.mood+ (1-q.mood)*0.4*DT));if(q.cool>0)q.cool-=DT;
   if(q.down>0){q.down-=DT;q.v*=0.90;q.state='down';if(q.down<=0)q.state='run';}
   else if(q.gawk>0){q.gawk-=DT;q.v*=0.86;q.state='gawk';if(q.gawk<=0)q.state='run';}
   else{let target=T.v;
    if(q.type==='biped'&&q.x>TRACK*T.burstAt){target=T.burstV;if(!q.burst){q.burst=true;say(name(q)+', 막판 질주를 시작합니다!','burst',q.no);}}
    if(q.type==='cheetah'){q.phase+=DT;const cyc=T.sprint+T.rest,ph=q.phase%cyc;q.sprinting=ph<T.sprint;target=q.sprinting?T.sprintV:T.v;}
    if(q.type==='panda'){q.roll=Math.min(T.rollMax,q.roll+T.rollUp*DT+0);target=T.v+ (q.roll-T.v>0?q.roll-T.v:0);q.roll=Math.max(q.roll,T.v);}
    if(q.type==='costume'&&q.x<=lastX+1&&t>6)target+=T.secondWind;
    q.v+=(target*q.mood*q.form-q.v)*2.2*DT;q.state=q.type==='panda'?'roll':q.sprinting?'sprint':'run';
    if(t>1.5&&r()<T.trip*DT){q.down=T.down;q.state='down';say(name(q)+(q.type==='costume'?', 제 발에 걸려 넘어집니다!':q.type==='biped'?', 두 발이 꼬였습니다!':', 넘어졌습니다!'),'fall',q.no);}
    else if(q.type==='ostrich'&&t>2&&r()<T.gawk*DT){q.gawk=0.9;q.state='gawk';say(name(q)+', 갑자기 멈춰 서서 두리번거립니다!','gawk',q.no);}
   }
   q.x+=q.v*DT;
  }
  // 치타: 전력질주 중 바로 앞 선수를 따라잡으면 덮침(둘 다 주저앉음). 판다: 굴러가며 앞 선수를 치고 지나감
  for(const q of live){if(q.down>0||q.cool>0)continue;
   if(q.type==='cheetah'&&q.sprinting){const v=live.find(o=>o!==q&&o.down<=0&&o.type!=='cheetah'&&!q.hit.includes(o.no)&&o.x>q.x&&o.x-q.x<9&&Math.abs(o.no-q.no)<=3);
    if(v&&r()<1.6*DT){q.hit.push(v.no);q.down=1.5;v.down=2.1;q.state=v.state='down';q.cool=4;say(name(q)+', 앞서가던 '+obj(v)+' 덮칩니다! 둘 다 주저앉았어요!','pounce',q.no,v.no);}}
   if(q.type==='panda'&&q.v>26){const v=live.find(o=>o!==q&&o.down<=0&&o.type!=='panda'&&!q.hit.includes(o.no)&&o.x>q.x&&o.x-q.x<6&&Math.abs(o.no-q.no)<=1);
    if(v&&r()<2.2*DT){q.hit.push(v.no);v.down=1.1;v.state='down';q.cool=2.5;say(name(q)+', 굴러가며 '+obj(v)+' 치고 지나갑니다!','bowl',q.no,v.no);}}
  }
  for(const q of live){if(q.x>=TRACK){q.done=t;q.x=TRACK;finish.push(q.no);say(name(q)+', 결승선 통과! '+finish.length+'위!','finish',q.no);}}
  // 선두가 바뀌면 알림(2초 이상 지킨 뒤에만)
  const front=R.filter(q=>q.done==null).sort((a,b)=>b.x-a.x)[0];
  if(front&&finish.length===0){if(front.no!==lead){if(t-leadSince>2&&t>3)say('선두가 바뀝니다! '+name(front)+'!','lead',front.no);lead=front.no;leadSince=t;}}
  t+=DT;frames.push(R.map(q=>({x:q.x,state:q.state,v:q.v})));
 }
 const order=[...finish,...R.filter(q=>q.done==null).sort((a,b)=>b.x-a.x).map(q=>q.no)];
 return {types,frames,events,order,seconds:Math.round(t*10)/10,timedOut:finish.length<n};
}
