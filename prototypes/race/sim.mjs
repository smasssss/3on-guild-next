// 엉뚱 경주 계산(시안 2). 같은 추첨 번호(seed)면 언제나 같은 경기입니다. 사칙연산만 씁니다.
export const HZ=60,TRACK=1600,MAX_RACERS=10,MAX_SECONDS=130,AFTER_FIRST=14;
export function rng(seedHex){let a=parseInt(seedHex,16)>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const hex=v=>(v>>>0).toString(16).padStart(8,'0');
// 선수 종류와 버릇. v: 기본 속도, trip: 1초에 넘어질 확률, down: 넘어져 있는 시간(초), luck: 기적이 일어날 확률
export const TYPES={
 horse:{name:'경주마',v:40.28,trip:0.010,down:1.5,back:0.012},
 biped:{name:'두 발 말',v:30.61,trip:0.014,down:1.3,burstAt:0.55,burstV:49.51},
 cheetah:{name:'치타',v:23.36,trip:0.004,down:1.2,sprintV:61.94,sprint:2.4,rest:2.3,nap:0.10},
 panda:{name:'판다',v:27.79,rollMax:54.41,rollUp:1.39},
 ostrich:{name:'타조',v:41.42,trip:0.006,down:1.2,dig:0.045},
 costume:{name:'인형탈 말',v:41,trip:0.02,down:1.3,splitV:19,bikeV:78,luck:0.224},
 giraffe:{name:'기린',v:41.41,trip:0.006,down:1.5,bonk:0.2},
 elephant:{name:'코끼리',v:33.13,panic:0.04,panicV:66.26},
 cow:{name:'소',v:41.36,trip:0.006,down:1.4,graze:0.035},
 zebra:{name:'얼룩말',v:44.02,trip:0.008,down:1.4},
 turtle:{name:'거북이',v:8,shellV:120,stomp:0.65,luck:0.259},
};
const ORDER=Object.keys(TYPES);
// 번호 1~n 에 어떤 선수가 들어갈지는 추첨 번호로 정함(열한 종류를 섞어 앞에서부터 n 명)
export function lineup(seedHex,n){const r=rng(seedHex),d=ORDER.slice();for(let i=d.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d.slice(0,n);}
const HITTABLE=['run','dig','nap','eat','wait','cele','back'];
export function runRace(seedHex,n){
 const types=lineup(seedHex,n),sn=parseInt(seedHex,16)>>>0,r=rng(hex(sn^0x5bd1e995)),c=rng(hex(sn^0x2545f491)),DT=1/HZ;
 // 경기장 꾸밈(횡단보도, 대나무, 진흙탕)과 돌발 사건 예정
 const cv=Array.from({length:12},()=>c());
 const course={cross:[TRACK*(0.24+0.14*cv[0]),TRACK*(0.58+0.2*cv[1])],bamboo:[TRACK*(0.3+0.12*cv[2]),TRACK*(0.62+0.16*cv[3])],puddle:{x:TRACK*(0.2+0.6*cv[4]),lane:Math.floor(cv[5]*Math.max(1,n-2))},
  ufo:cv[6]<0.6?TRACK*(0.3+0.45*cv[7]):-1,tornado:cv[8]<0.45?TRACK*(0.5+0.33*cv[9]):-1,cele:cv[10]<0.5};
 const R=types.map((type,i)=>{const T=TYPES[type],q={no:i+1,lane:i,type,form:0.93+0.14*r(),x:0,px:0,v:0,mood:1,st:'run',mode:'run',tm:0,cool:0,hit:[],done:null,phase:r()*T.rest||0,roll:0,burst:false,panic:0,seen:[false,false],ate:[false,false],sign:0,wet:false,host:0};
  if(type==='costume'){q.splitAt=TRACK*(0.2+0.3*r());q.split=false;const u=r(),w=r();q.plan=u<T.luck?(w<0.5?'bike':'ride'):'none';q.bikeIn=3+5*r();q.fuel=500+1100*r();q.rideCool=0;}
  if(type==='turtle'){const u=r(),w=r();q.stompAt=u<T.stomp?TRACK*(0.3+0.45*r()):-1;q.through=w<T.luck;q.dir=1;q.shellTo=0;}
  return q;});
 const frames=[],events=[],finish=[];let t=0,lead=-1,leadSince=0,lastLeadSay=-9,firstDone=null,lastDone=0,ufoDone=false,tornadoDone=false,celeDone=false,homeSaid=false;
 const say=(text,kind,a,b,extra)=>events.push({t,frame:frames.length,text,kind,a,b,...extra});
 const name=q=>q.no+'번 '+TYPES[q.type].name,jong=s=>(s.charCodeAt(s.length-1)-0xAC00)%28!==0;
 const obj=q=>{const s=name(q);return s+(jong(s)?'을':'를');},sub=q=>{const s=name(q);return s+(jong(s)?'이':'가');};
 const hittable=o=>o.done==null&&o.type!=='elephant'&&HITTABLE.includes(o.st)&&!(o.type==='turtle'&&o.st!=='run');
 const knock=(o,st,tm)=>{o.st=st;o.tm=tm;o.roll=0;o.panic=0;};
 say('출발했습니다!','start');
 while(finish.length<n&&t<MAX_SECONDS&&(firstDone==null||t<firstDone+AFTER_FIRST)){
  const live=R.filter(q=>q.done==null);
  // 남은 선수가 시간 안에 못 들어올 게 뻔하면(기어가는 거북이, 갈라진 인형탈) 오래 기다리지 않음
  if(firstDone!=null&&t>lastDone+2.5&&live.every(q=>{const top=q.type==='turtle'&&q.st==='run'&&q.stompAt<0?10:q.type==='costume'&&q.split&&q.plan==='none'&&(q.st==='run'||q.st==='down')?24:0;return top>0&&(TRACK-q.x)/top>firstDone+AFTER_FIRST-t;}))break;
  const leadX=Math.max(...R.map(q=>q.done!=null?TRACK:q.x));
  for(const q of live){const T=TYPES[q.type];q.px=q.x;
   q.mood+=(r()-0.5)*0.9*DT;q.mood=Math.max(0.86,Math.min(1.14,q.mood+(1-q.mood)*0.4*DT));if(q.cool>0)q.cool-=DT;if(q.rideCool>0)q.rideCool-=DT;
   if(q.st==='run'){let target=T.v,mode='run',tripRate=T.trip||0;
    if(q.type==='horse'&&t>4&&q.x<TRACK*0.9&&r()<T.back*DT){q.st='back';q.tm=1.5;say(sub(q)+' 갑자기 거꾸로 달립니다! 어디 가세요?!','back',q.no);}
    if(q.type==='biped'&&q.x>TRACK*T.burstAt){target=T.burstV;mode='burst';if(!q.burst){q.burst=true;say(name(q)+', 막판 질주를 시작합니다!','burst',q.no);}}
    if(q.type==='cheetah'){const cyc=T.sprint+T.rest,before=q.phase%cyc<T.sprint;q.phase+=DT;const now=q.phase%cyc<T.sprint;target=now?T.sprintV:T.v;mode=now?'sprint':'run';
     if(before&&!now&&t>6&&r()<T.nap){q.st='nap';q.tm=2.6;say(name(q)+', 지쳤는지 트랙 한가운데서 낮잠을 잡니다!','nap',q.no);}}
    if(q.type==='panda'){q.roll=Math.max(T.v,Math.min(T.rollMax,q.roll+T.rollUp*DT));target=q.roll;mode='roll';
     for(let k=0;k<2;k++)if(!q.ate[k]&&q.x>=course.bamboo[k]){q.ate[k]=true;if(r()<0.7){q.st='eat';q.tm=2.2;q.roll=0;say(name(q)+', 대나무를 발견했습니다! 식사 시간입니다.','eat',q.no,undefined,{k});}}}
    if(q.type==='ostrich'&&t>2&&r()<T.dig*DT){q.st='dig';q.tm=1.2;say(sub(q)+' 갑자기 머리를 땅에 박습니다! 무서운 걸 봤나요?','dig',q.no);}
    if(q.type==='giraffe'){const s=Math.floor(q.x/200);if(s>q.sign&&s<TRACK/200){q.sign=s;if(r()<T.bonk){q.st='down';q.tm=T.down;say(sub(q)+' 거리 표지판에 머리를 부딪혔습니다! 키가 너무 커요!','bonk',q.no);}}}
    if(q.type==='elephant'){if(q.panic>0){q.panic-=DT;target=T.panicV;mode='panic';}else if(t>3&&r()<T.panic*DT){q.panic=3;say(sub(q)+' 생쥐를 보고 깜짝! 폭주합니다!','panic',q.no,undefined,{x:q.x+16});}}
    if(q.type==='cow'&&t>3&&r()<T.graze*DT){q.st='eat';q.tm=1.4;say(sub(q)+' 풀을 뜯습니다. 맛있어 보였나 봅니다.','eat',q.no);}
    if(q.type==='zebra')for(let k=0;k<2;k++)if(!q.seen[k]&&q.x>=course.cross[k]-6){q.seen[k]=true;if(r()<0.85){q.st='wait';q.tm=1.6+1.2*r();say(sub(q)+' 횡단보도 앞에 멈춰 섭니다. 빨간불이거든요!','wait',q.no,undefined,{k});}}
    if(q.type==='turtle'){mode='crawl';if(q.stompAt>0&&leadX>=q.stompAt&&q.x<leadX){q.stompAt=-1;q.st='shell';q.dir=1;q.shellTo=q.through?TRACK+40:Math.max(q.x+120,leadX-90+220*r());
      say('캥거루가 난입했습니다! '+obj(q)+' 밟고 지나갑니다! 등껍질이 총알처럼 날아갑니다!','stomp',q.no);}}
    if(q.type==='costume'){
     if(!q.split&&q.x>=q.splitAt){q.split=true;say(name(q)+', 인형탈이 찢어졌습니다! 두 사람으로 갈라졌어요!','split',q.no);}
     if(q.split){target=T.splitV;mode='split';tripRate=0.05;
      if(q.plan==='bike'){q.bikeIn-=DT;if(q.bikeIn<=0){q.st='bike';say(name(q)+' 두 사람, 어디서 났는지 오토바이를 타고 돌아왔습니다!','bike',q.no);}}}}
    if(q.st==='run'){
     if(mode!=='crawl'&&mode!=='split')target*=1+0.10*Math.min(1,(leadX-q.x)/280);
     q.v+=(target*q.mood*q.form-q.v)*2.2*DT;
     if(t>1.5&&tripRate>0&&r()<tripRate*DT){q.st='down';q.tm=T.down;say(name(q)+(mode==='split'?' 두 사람, 서로 발이 엉켜 넘어집니다!':q.type==='costume'?', 제 발에 걸려 넘어집니다!':q.type==='biped'?', 두 발이 꼬였습니다!':', 넘어졌습니다!'),'fall',q.no);}}
    q.mode=mode;}
   else{const host=q.host?R[q.host-1]:null;
    switch(q.st){
     case 'down':case 'fly':q.v*=0.90;break;
     case 'dig':case 'nap':case 'eat':case 'wait':case 'cele':q.v*=0.86;break;
     case 'back':q.v+=(-22-q.v)*3*DT;break;
     case 'lift':case 'drop':q.v=0;break;
     case 'gone':q.v=q.carry;break;
     case 'blown':q.v=-55;break;
     case 'shell':q.v=q.dir*T.shellV;if((q.dir>0&&q.x>=q.shellTo)||(q.dir<0&&q.x<=q.shellTo)){q.st='run';say(sub(q)+' 등껍질에서 나왔습니다. 다시 엉금엉금.','unshell',q.no);if(r()<0.15&&leadX<TRACK-300)q.stompAt=leadX+100+200*r();}break;
     case 'bike':q.v+=(T.bikeV-q.v)*2*DT;q.fuel-=q.v*DT;if(q.fuel<=0){q.st='run';q.plan='none';say(name(q)+', 오토바이 기름이 떨어졌습니다! 다시 두 발로 뜁니다.','nofuel',q.no);}break;
     case 'ride':if(host.done!=null||host.st!=='run'){q.st='down';q.tm=1.4;q.rideCool=3;say(name(q)+' 두 사람, '+name(host)+' 등에서 굴러떨어집니다!','rideoff',q.no,host.no);}
      else{q.v=host.v;if(host.x>=TRACK-110){q.st='leap';q.tm=1.3;q.leapV=host.v+55;say(name(q)+' 두 사람, 등에서 뛰어내려 결승선으로 몸을 날립니다!','leap',q.no,host.no);}}break;
     case 'leap':q.v=q.leapV;break;
    }
    if(q.tm>0){q.tm-=DT;if(q.tm<=0){
     if(q.st==='lift'){const front=Math.max(...R.filter(o=>o!==q).map(o=>o.done!=null?TRACK:o.x)),back=r()<0.2,to=back?Math.max(0,q.x-180):Math.max(q.x+40,Math.min(TRACK-70,front-70+150*r()));q.st='gone';q.tm=1;q.carry=(to-q.x)/1;q.dropBack=back;}
     else if(q.st==='gone'){const front=Math.max(...R.filter(o=>o!==q).map(o=>o.done!=null?TRACK:o.x));q.st='drop';q.tm=0.7;say('UFO가 '+obj(q)+(q.dropBack?' 한참 뒤쪽에 내려놓았습니다! 이런!':q.x>front?' 선두 앞에 내려놓았습니다! 이게 무슨 일입니까!':' 앞쪽에 내려놓았습니다!'),'ufodrop',q.no);}
     else if(q.st==='drop'){q.st='down';q.tm=0.7;}
     else if(q.st==='blown'){q.st='down';q.tm=0.9;}
     else q.st='run';}}
   }
   if(q.st!=='ride')q.x+=q.v*DT;if(q.x<0)q.x=0;
  }
  for(const q of live)if(q.st==='ride')q.x=R[q.host-1].x-3;
  // 선수끼리 부딪침
  for(const q of live){const T=TYPES[q.type],near=(o,d,l)=>o!==q&&o.done==null&&!q.hit.includes(o.no)&&o.x>q.x&&o.x-q.x<d&&Math.abs(o.lane-q.lane)<=l;
   if(q.type==='cheetah'&&q.st==='run'&&q.mode==='sprint'&&q.cool<=0){const v=live.find(o=>near(o,9,3)&&o.type!=='cheetah'&&(hittable(o)||(o.type==='elephant'&&o.st==='run')));
    if(v&&r()<1.6*DT){q.hit.push(v.no);q.cool=4;if(v.type==='elephant'){knock(q,'fly',1.6);say(sub(q)+' '+obj(v)+' 덮치려다 튕겨 나갑니다!','bounce',q.no,v.no);}
     else{knock(q,'down',1.5);knock(v,'down',2.1);say(sub(q)+' 앞서가던 '+obj(v)+' 덮칩니다! 둘 다 주저앉았어요!','pounce',q.no,v.no);}}}
   if(q.type==='panda'&&q.st==='run'&&q.v>32&&q.cool<=0){const v=live.find(o=>near(o,6,1)&&o.type!=='panda'&&(hittable(o)||(o.type==='elephant'&&o.st==='run')));
    if(v&&r()<2.2*DT){q.hit.push(v.no);q.cool=2.5;if(v.type==='elephant'){knock(q,'down',0.9);say(sub(q)+' '+name(v)+'에 부딪혀 멈춰 섭니다. 벽인 줄 알았어요.','bounce',q.no,v.no);}
     else{knock(v,'fly',1.2);say(sub(q)+' 굴러가며 '+obj(v)+' 치고 지나갑니다!','bowl',q.no,v.no);}}}
   if(q.type==='elephant'&&q.st==='run'&&q.mode==='panic'){const v=live.find(o=>near(o,10,1)&&hittable(o));
    if(v){q.hit.push(v.no);knock(v,'fly',1.5);say('폭주하는 '+sub(q)+' '+obj(v)+' 들이받습니다!','trample',q.no,v.no);}}
   if(q.type==='turtle'&&q.st==='shell')for(const o of live){if(o===q||Math.abs(o.lane-q.lane)>2||q.hit.includes(o.no))continue;const lo=Math.min(q.px,q.x),hi=Math.max(q.px,q.x);if(o.x<lo||o.x>hi)continue;
    if(o.type==='elephant'&&q.dir>0){q.hit.push(o.no);q.dir=-1;q.shellTo=Math.max(0,q.x-120-200*r());say('등껍질이 '+name(o)+'에 맞고 되돌아갑니다! 거북이 어디 가나요!','ricochet',q.no,o.no);break;}
    if(hittable(o)&&r()<0.8){q.hit.push(o.no);knock(o,'fly',1.5);say(sub(o)+' 거북이 등껍질에 맞고 날아갑니다!','shellhit',q.no,o.no);}}
   if(q.type==='costume'&&q.st==='run'&&q.split&&q.plan==='ride'&&q.rideCool<=0){const h=live.find(o=>o!==q&&o.st==='run'&&o.mode!=='crawl'&&!['panda','turtle','cheetah','costume'].includes(o.type)&&Math.abs(o.lane-q.lane)<=3&&Math.abs(o.x-q.x)<7&&o.v>q.v+5&&o.x<TRACK-140);
    if(h){q.st='ride';q.host=h.no;say(name(q)+' 두 사람, 지나가던 '+name(h)+' 등에 올라탔습니다!','ride',q.no,h.no);}}
   // 진흙탕
   if(q.st==='run'&&!q.wet&&q.type!=='elephant'&&q.type!=='panda'&&q.type!=='turtle'&&q.lane>=course.puddle.lane&&q.lane<=course.puddle.lane+2&&q.px<course.puddle.x&&q.x>=course.puddle.x){q.wet=true;if(r()<0.6){knock(q,'down',1.3);say(sub(q)+' 진흙탕에 미끄러졌습니다!','slip',q.no);}}
  }
  // 돌발 사건: UFO, 회오리바람, 이른 세리머니
  const rank=live.slice().sort((a,b)=>b.x-a.x);
  if(!ufoDone&&course.ufo>0&&leadX>=course.ufo){ufoDone=true;const cand=rank.slice(Math.min(2,rank.length-1)).filter(o=>o.st==='run'&&o.x<TRACK-150);
   if(cand.length){let w=cand.map(o=>o.type==='cow'?4:1),pick=r()*w.reduce((a,b)=>a+b,0),k=0;while(k<cand.length-1&&pick>=w[k]){pick-=w[k];k++;}const v=cand[k];
    if(v.type==='elephant'){v.st='wait';v.tm=1.5;say('UFO가 나타났습니다! '+obj(v)+' 끌어올리려다… 너무 무겁습니다. 포기합니다!','ufofail',v.no);}
    else{v.st='lift';v.tm=1.3;v.panic=0;v.roll=0;say('UFO가 나타났습니다! '+obj(v)+' 끌어올립니다!','ufo',v.no);}}}
  if(!tornadoDone&&course.tornado>0&&leadX>=course.tornado&&leadX<TRACK-120){tornadoDone=true;const hitList=rank.slice(0,3).filter(hittable);
   if(hitList.length){for(const o of hitList){knock(o,'blown',1.4);}say('회오리바람입니다! 선두권이 통째로 휩쓸려 날아갑니다!','tornado',hitList[0].no,undefined,{list:hitList.map(o=>o.no),x:leadX});}}
  if(!celeDone&&course.cele&&rank.length>1&&finish.length===0){const f=rank[0];if(f.x>TRACK-95&&f.x<TRACK-60){celeDone=true;if(f.st==='run'&&f.mode!=='crawl'&&f.mode!=='split'&&f.x-rank[1].x>30){f.st='cele';f.tm=2.1;say(sub(f)+' 벌써 우승 세리머니를 합니다! 아직 결승선 전인데요?!','cele',f.no);}}}
  for(const q of live){if(q.x>=TRACK){q.done=t;q.x=TRACK;finish.push(q.no);if(firstDone==null)firstDone=t;lastDone=t;say(name(q)+', 결승선 통과! '+finish.length+'위!','finish',q.no);}}
  // 선두가 바뀌면 알림(2초 이상 지킨 뒤에만), 결승선이 가까워지면 알림
  const front=R.filter(q=>q.done==null).sort((a,b)=>b.x-a.x)[0];
  if(front&&finish.length===0){if(front.no!==lead){if(t-leadSince>2&&t>3&&t-lastLeadSay>3){say('선두가 바뀝니다! '+name(front)+'!','lead',front.no);lastLeadSay=t;}lead=front.no;leadSince=t;}
   if(!homeSaid&&front.x>TRACK-220){homeSaid=true;say('결승선이 눈앞입니다! 선두는 '+name(front)+'!','home',front.no);}}
  t+=DT;frames.push(R.map(q=>({x:q.x,v:q.v,s:q.st==='run'?q.mode:q.st,h:q.st==='ride'||q.st==='leap'?q.host:0,sp:q.type==='costume'&&q.split?1:0})));
 }
 const rest=R.filter(q=>q.done==null).sort((a,b)=>b.x-a.x);
 if(rest.length)say(rest.map(name).join(', ')+', 아직도 오는 중입니다… 여기서 경기를 마칩니다!','timeup',rest[0].no);
 const order=[...finish,...rest.map(q=>q.no)];
 return {types,course,frames,events,order,finished:finish.length,seconds:Math.round(t*10)/10};
}
