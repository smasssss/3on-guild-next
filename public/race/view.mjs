// 정통 경마 화면(시안 2). sim.mjs 가 미리 계산한 경기를 그대로 다시 보여 줍니다.
// createShow(캔버스,{seed,n}) 가 경기 한 판을 준비해, 원하는 순간을 그리는 render(초) 를 돌려줍니다. 재생과 소리는 player.mjs 가 맡습니다.
import {runRace,TYPES,TRACK,HZ,RACE_VERSION} from './sim.mjs';
import {timeline,PRE,COUNTDOWN,POST} from './timeline.mjs';
import {HELLO,READY} from './commentary.mjs';
export const W=1280,H=720;
const PPU=11,HOR=392,ASSET_VERSION='1';
const LOOK={horse:{h:135,stride:16},biped:{h:158,stride:11},cheetah:{h:90,stride:20},panda:{h:112,stride:0},ostrich:{h:165,stride:10},costume:{h:150,stride:9},giraffe:{h:185,stride:18},elephant:{h:178,stride:13},cow:{h:132,stride:15},zebra:{h:138,stride:16},turtle:{h:66,stride:4}};
const EXTRA={shell:60,kangaroo:200,cfront_0:150,cfront_1:150,cback_0:150,cback_1:150,cbike:170,cride:165,mouse:36,ufo:100};
const NUMC=['#e53935','#fafafa','#1e5fd0','#f6c915','#2e9e4f','#1b1b1b','#f57c00','#ec6fa7','#27b5c4','#7d4cc2'],NUMT=['#fff','#111','#fff','#111','#fff','#fff','#fff','#111','#111','#fff'];
const loaded=new Map(),load=name=>{if(!loaded.has(name))loaded.set(name,new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>{loaded.delete(name);rej(Error('그림을 불러오지 못했습니다: '+name));};im.src=new URL('assets/'+name+'?v='+ASSET_VERSION,import.meta.url).href;}));return loaded.get(name);};
function crop(im){const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;
 let x0=c.width,y0=c.height,x1=0,y1=0;for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++)if(d[(y*c.width+i)*4+3]>40){if(i<x0)x0=i;if(i>x1)x1=i;if(y<y0)y0=y;if(y>y1)y1=y;}
 const o=document.createElement('canvas');o.width=x1-x0+1;o.height=y1-y0+1;o.getContext('2d').drawImage(c,-x0,-y0);return o;}
function tileOf(img,sy,sh,flip){const c=document.createElement('canvas');c.width=img.width*2;c.height=sh;const x=c.getContext('2d');if(flip){x.translate(0,sh);x.scale(1,-1);}x.drawImage(img,0,sy,img.width,sh,0,0,img.width,sh);x.translate(c.width,0);x.scale(-1,1);x.drawImage(img,0,sy,img.width,sh,0,0,img.width,sh);return c;}
export async function createShow(cv,{seed,n,version=RACE_VERSION,greeting=false}){
const main=cv.getContext('2d'),off=document.createElement('canvas');cv.width=W;cv.height=H;off.width=W;off.height=H;const offg=off.getContext('2d');
const race=runRace(seed,n,version),F=race.frames.length,names=[...new Set(race.types)],SP={},EX={};
{const jobs=[load('track.jpg')];for(const k of names)if(k==='panda')jobs.push(load('panda.png'));else for(let i=0;i<4;i++)jobs.push(load(k+'_'+i+'.png'));
 const ex=Object.keys(EXTRA);for(const k of ex)jobs.push(load(k+'.png'));const got=await Promise.all(jobs);let p=1;var track=got[0];
 for(const k of names){const f=k==='panda'?[crop(got[p++])]:[got[p++],got[p++],got[p++],got[p++]],hs=f.map(i=>i.height).sort((a,b)=>a-b),ws=f.map(i=>i.width).sort((a,b)=>a-b);SP[k]={f,k:LOOK[k].h/hs[hs.length>>1],w:ws[ws.length>>1],h0:hs[hs.length>>1],...LOOK[k]};}
 for(const k of ex){const im=got[p++];EX[k]={im,k:EXTRA[k]/im.height};}}
const FAR=tileOf(track,230,330),FENCE=tileOf(track,560,215),GRASS=tileOf(track,790,234),GRASS2=tileOf(track,790,234,true);
const SKY=(()=>{const d=FAR.getContext('2d').getImageData(10,2,1,1).data;return 'rgb('+d[0]+','+d[1]+','+d[2]+')';})();
// ---- 경기 자료 정리 ----
const F0=-PRE*HZ,F1=F+Math.round(POST*HZ),clampF=f=>Math.max(0,Math.min(F-1,f));
const tl=timeline(race),{doneF,firstF,speedAt,frameAt,total}=tl;
const fr=(i,f)=>race.frames[clampF(f)][i];
const dispX=(i,f)=>{if(f<0)return 0;const d=doneF[i];if(d!=null&&f>d)return TRACK+Math.max(12,fr(i,d).v)*0.8*(f-d)/HZ;return fr(i,f).x;};
const MOVING=['run','sprint','burst','panic','prop','crawl','split','roll','bike','shell'];
const stateOf=(i,f)=>{if(f<0)return 'ready';const d=doneF[i];if(d!=null&&f>d){const s=fr(i,d).s;return s==='leap'?'split':MOVING.includes(s)?s:fr(i,d).sp?'split':race.types[i]==='panda'?'roll':'run';}return fr(i,f).s;};
const segs=Array.from({length:n},()=>[]);for(let i=0;i<n;i++){let cur=null;for(let f=0;f<F;f++){const s=race.frames[f][i].s;if(!cur||cur.s!==s){if(cur)cur.f1=f;cur={s,f0:f,f1:F};segs[i].push(cur);}}}
const segAt=(i,f)=>{const a=segs[i];for(let k=a.length-1;k>=0;k--)if(f>=a[k].f0)return a[k];return a[0];};
const splitF=new Array(n).fill(null);for(const e of race.events)if(e.kind==='split')splitF[e.a-1]=e.frame;
const laneF=i=>(i+0.5+(10-n)/2)/10,laneY=lf=>20+lf*236;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);},clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// ---- 카메라: 평소엔 선두 무리, 웃긴 장면은 가까이, 화면 밖 사건은 '뒤쪽 카메라'로 넘어감 ----
const NF=F1-F0,lead={cx:new Float32Array(NF),z:new Float32Array(NF)};{let c=null,z=1,pt=null;
 for(let f=F0;f<F1;f++){const xs=[];for(let i=0;i<n;i++)xs.push(Math.min(dispX(i,f),TRACK+22));xs.sort((a,b)=>b-a);const L=xs[0],k=xs[Math.min(n-1,3)];
  const ahead=80-62*smooth(L/200),zt=clamp(W/((L-k+ahead+22)*PPU),0.9,1);z+=(zt-z)*1.4/HZ;const ct=L+ahead-W/(2*PPU*z);c=c==null?ct:c+(ct-c)*3/HZ+clamp(ct-pt,-2.2,2.2);pt=ct;lead.cx[f-F0]=c;lead.z[f-F0]=z;}}
const inLead=(x,f,m=14)=>{const c=lead.cx[f-F0],hw=W/(2*PPU*lead.z[f-F0]);return x>c-hw+m&&x<c+hw+6;};
const SHOT={pounce:{o:'b',pre:.5,post:1.7,z:1.45,p:3},bowl:{o:'b',pre:.4,post:1.5,z:1.4,p:3},trample:{o:'b',pre:.5,post:1.5,z:1.3,p:3},shellhit:{o:'b',pre:.3,post:1.2,z:1.3,p:2},bounce:{o:'a',pre:.4,post:1.6,z:1.4,p:3},
 bonk:{o:'a',pre:.4,post:1.5,z:1.35,p:2},back:{o:'a',pre:.1,post:1.7,z:1.35,p:2},nap:{o:'a',pre:.2,post:1.9,z:1.5,p:2},dig:{o:'a',pre:.2,post:1.3,z:1.5,p:1},eat:{o:'a',pre:.2,post:1.7,z:1.5,p:1},wait:{o:'a',pre:.3,post:1.9,z:1.4,p:2},
 split:{o:'a',pre:.6,post:2.3,z:1.4,p:4},bike:{o:'a',pre:.2,post:2.5,z:1.25,p:5},ride:{o:'a',pre:.4,post:2.3,z:1.3,p:5},rideoff:{o:'a',pre:.2,post:1.5,z:1.4,p:3},leap:{o:'a',pre:.3,post:1.6,z:1,p:6,flat:1},
 stomp:{o:'a',pre:1.5,post:2.2,z:1.2,p:5},ricochet:{o:'a',pre:.3,post:1.7,z:1.2,p:4},unshell:{o:'a',pre:.2,post:1.4,z:1.45,p:2},ufo:{o:'a',pre:1,post:3.4,z:1.05,p:5},ufofail:{o:'a',pre:1,post:2.3,z:1.1,p:4},
 panic:{o:'a',pre:.3,post:2,z:1.25,p:3},cele:{o:'a',pre:.2,post:2.3,z:1.4,p:5},tornado:{o:'a',pre:.4,post:2.3,z:1,p:5},grab:{o:'a',pre:.4,post:3,z:1.2,p:5},throwfwd:{o:'a',pre:.1,post:2.1,z:1,p:5},throwback:{o:'b',pre:.1,post:1.9,z:1.1,p:4},slip:{o:'a',pre:.3,post:1.3,z:1.4,p:1}};
const shots=[];{let lastCutEnd=-1e9;
 for(const e of race.events){const S=SHOT[e.kind];if(!S)continue;const who=(S.o==='b'&&e.b?e.b:e.a)-1,f0=Math.max(0,Math.round(e.frame-S.pre*HZ)),f1=Math.min(F-1,Math.round(e.frame+S.post*HZ));if(f1-f0<40)continue;
  const cut=!inLead(dispX(who,e.frame),e.frame),last=shots[shots.length-1];
  if(cut){if(S.p<5&&f0<firstF+1.2*HZ&&f1>firstF-4.5*HZ)continue;if(S.p<4&&f0<lastCutEnd+2.2*HZ)continue;}
  if(S.p===1&&last&&f0<last.f1+2.5*HZ)continue;
  if(last&&f0<last.f1){if(S.p<last.p||(S.p===last.p&&f0-last.f0<1.6*HZ))continue;if(f0-last.f0>=1.0*HZ)last.f1=f0;else shots.pop();}
  shots.push({f0,f1,who,z:S.z,p:S.p,flat:S.flat,cut,label:cut?(dispX(who,e.frame)>lead.cx[e.frame-F0]?'앞쪽 카메라':'뒤쪽 카메라'):null,kind:e.kind});if(cut)lastCutEnd=f1;}
 // 한동안 뒤쪽을 안 비췄으면 꼴찌를 한 번 보여 줌
 const free=(a,b)=>!shots.some(s=>s.f0<b&&s.f1>a);let lastCut=0;const add=[];
 for(let f=Math.round(7*HZ);f<firstF-5*HZ;f+=30){const prev=shots.filter(s=>s.cut&&s.f1<=f).pop();const since=f-Math.max(prev?prev.f1:0,lastCut);if(since<9*HZ)continue;const a=f,b=f+Math.round(2.4*HZ);if(!free(a-HZ,b+HZ))continue;
  let who=0;for(let i=1;i<n;i++)if(dispX(i,f)<dispX(who,f))who=i;if(inLead(dispX(who,f),f))continue;add.push({f0:a,f1:b,who,z:1.25,p:0,cut:true,label:'꼴찌는 지금…',kind:'last'});lastCut=b;}
 // 선두가 들어온 뒤 한참 아무도 안 들어오면, 아직 달리는 선수를 비춤
 const fins=race.events.filter(e=>e.kind==='finish').map(e=>e.frame);fins.push(F+HZ);
 for(let k=0;k<fins.length-1;k++){const a=fins[k]+Math.round(1.1*HZ),b=Math.min(F-20,fins[k+1]-Math.round(1.4*HZ));if(b-a<2*HZ||!free(a,b))continue;let who=-1;for(let i=0;i<n;i++)if((doneF[i]==null||doneF[i]>a)&&(who<0||dispX(i,a)>dispX(who,a)))who=i;if(who<0||inLead(dispX(who,a),a,40))continue;
  add.push({f0:a,f1:b,who,z:1.2,p:0,cut:true,label:'아직 달리는 중',kind:'late'});}
 shots.push(...add);shots.sort((a,b)=>a.f0-b.f0);}
const shotAt=new Array(NF).fill(null);for(const s of shots)for(let f=s.f0;f<s.f1;f++)shotAt[f-F0]=s;
const camX=new Float32Array(NF),camZ=new Float32Array(NF),camH=new Float32Array(NF),snaps=[];{let c=lead.cx[0],z=lead.z[0],h=HOR,prev=null;
 for(let f=F0;f<F1;f++){const s=shotAt[f-F0];let tc=lead.cx[f-F0],tz=lead.z[f-F0],th=HOR,rate=6;
  if(s){const lf=laneF(s.who);tz=s.z;tc=dispX(s.who,f)-7+(s.kind==='stomp'||s.kind==='bike'?10:0);th=s.flat?HOR+40:clamp(505-laneY(lf)*tz,HOR-230,HOR+70);rate=4.5;}
  const snap=(s!==prev)&&((s&&s.cut)||(prev&&prev.cut));if(snap){c=tc;z=tz;h=th;snaps.push(f);}else{c+=(tc-c)*rate/HZ;z+=(tz-z)*rate/HZ;h+=(th-h)*rate/HZ;}
  camX[f-F0]=c;camZ[f-F0]=z;camH[f-F0]=h;prev=s;}}
// ---- 그리기 도구 ----
let g=main;
function strip(tile,dy,dh,scroll){const s=dh/tile.height,tw=tile.width*s;let x=-(((scroll%tw)+tw)%tw);for(;x<W;x+=tw-1)g.drawImage(tile,x,dy,tw,dh);}
function rr(x,y,w,h,r){g.beginPath();g.roundRect(x,y,w,h,r);}
function put(img,cx,cy,sc,ang=0,fx=1,sy=1){const w=img.width*sc,h=img.height*sc;g.save();g.translate(cx,cy);if(ang)g.rotate(ang);if(fx!==1||sy!==1)g.scale(fx,sy);g.drawImage(img,-w/2,-h/2,w,h);g.restore();}
function chip(x,y,r,no){g.beginPath();g.arc(x,y,r,0,7);g.fillStyle=NUMC[no-1];g.fill();g.lineWidth=Math.max(1.5,r*0.14);g.strokeStyle='rgba(0,0,0,.55)';g.stroke();g.fillStyle=NUMT[no-1];g.font='800 '+Math.round(r*1.25)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(no,x,y+r*0.06);}
function star(x,y,r,rot,col){g.beginPath();for(let i=0;i<10;i++){const a=rot+i*Math.PI/5,d=i%2?r*0.45:r;g.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d);}g.closePath();g.fillStyle=col;g.fill();}
function burst(x,y,r,text){g.beginPath();for(let i=0;i<24;i++){const a=i*Math.PI/12,d=i%2?r*0.62:r;g.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d*0.8);}g.closePath();g.fillStyle='#ffe14d';g.fill();g.lineWidth=4;g.strokeStyle='#d6341f';g.stroke();
 g.fillStyle='#d6341f';g.font='900 '+Math.round(r*0.62)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,x,y);}
function word(t,x,y,size,col='#fff'){g.font='900 '+Math.round(size)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=Math.max(3,size*0.16);g.strokeStyle='rgba(0,0,0,.75)';g.strokeText(t,x,y);g.fillStyle=col;g.fillText(t,x,y);}
function puff(x,y,r,a,col='235,228,205'){if(a<=0)return;g.beginPath();g.arc(x,y,r,0,7);g.fillStyle='rgba('+col+','+a+')';g.fill();}
const fract=v=>v-Math.floor(v);
// ---- 경기장과 선수 ----
function world(f,ts,C){const {L,z,hy}=C,X=x=>(x-L)*PPU*z,Yof=lf=>hy+laneY(lf)*z,zf=1+(z-1)*0.5,fenceTop=hy-128*z;
 g.fillStyle=SKY;g.fillRect(0,0,W,Math.max(0,fenceTop-264*zf)+2);strip(FAR,fenceTop-264*zf,264*zf,L*PPU*0.2*zf);strip(FENCE,fenceTop,128*z+1,L*PPU*z*0.9);
 for(let y=hy,k=0;y<H;y+=164*z-1,k++)strip(k&1?GRASS2:GRASS,y,164*z,L*PPU*z);
 const right=L+W/(PPU*z);
 g.fillStyle='rgba(0,40,0,.085)';for(let k=Math.floor(L/50)-1;k*50<right+50;k++)if(k&1)g.fillRect(X(k*50),hy,50*PPU*z,H-hy);
 // 달리는 느낌을 주는 바닥 줄
 {const sp=f>F0?Math.abs(camX[f-F0]-camX[f-F0-1])*HZ:0;if(sp>12){g.strokeStyle='rgba(255,255,255,'+Math.min(0.22,sp/260)+')';g.lineWidth=2*z;for(let k=Math.floor(L/37)-1;k*37<right+40;k++){const row=((k*7919)%9+9)%9,y=hy+(18+row*30)*z,x=X(k*37+(row*11)%23);g.beginPath();g.moveTo(x,y);g.lineTo(x+sp*0.9*z,y);g.stroke();}}}
 // 진흙탕, 횡단보도, 출발선·결승선, 거리 표지판, 대나무
 {const p=race.course.puddle,x=X(p.x),lf0=laneF(Math.min(n-1,p.lane)),lf1=laneF(Math.min(n-1,p.lane+2));if(x>-200&&x<W+200){g.beginPath();g.ellipse(x,(Yof(lf0)+Yof(lf1))/2,70*z,(Yof(lf1)-Yof(lf0))/2+16*z,0,0,7);g.fillStyle='rgba(92,62,34,.82)';g.fill();g.beginPath();g.ellipse(x-12*z,(Yof(lf0)+Yof(lf1))/2-4*z,40*z,(Yof(lf1)-Yof(lf0))/4+5*z,0,0,7);g.fillStyle='rgba(140,104,64,.55)';g.fill();}}
 for(const cx of race.course.cross){const x=X(cx);if(x<-400||x>W+100)continue;g.fillStyle='rgba(255,255,255,.88)';for(let k=0;k<8;k++)g.fillRect(x,hy+(10+k*32)*z,30*PPU*z,17*z);
  g.fillStyle='#444';g.fillRect(x-5*z,hy-150*z,6*z,150*z);rr(x-18*z,hy-214*z,32*z,66*z,6*z);g.fillStyle='#222';g.fill();g.beginPath();g.arc(x-2*z,hy-197*z,10*z,0,7);g.fillStyle='#ff3b2f';g.fill();g.beginPath();g.arc(x-2*z,hy-166*z,10*z,0,7);g.fillStyle='#1d3b22';g.fill();}
 for(const [x,col] of [[0,'rgba(255,255,255,.75)'],[TRACK,'#fff']]){g.fillStyle=col;g.fillRect(X(x)-3,hy,6,H-hy);}
 for(let m=200;m<TRACK;m+=200){const x=X(m);if(x<-90||x>W+90)continue;g.fillStyle='#e9e9e9';g.fillRect(x-3*z,hy-150*z,6*z,150*z);rr(x-42*z,hy-196*z,84*z,48*z,7*z);g.fillStyle='#fff';g.fill();g.strokeStyle='#333';g.lineWidth=2.5*z;g.stroke();g.fillStyle='#111';g.font='800 '+Math.round(25*z)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('남은 '+(TRACK-m),x,hy-171*z);}
 {const x=X(TRACK);if(x>-120&&x<W+120){g.fillStyle='#d8d8d8';g.fillRect(x-4,hy-170*z,8,170*z);g.beginPath();g.arc(x,hy-170*z,28*z,0,7);g.fillStyle='#d6341f';g.fill();g.lineWidth=5*z;g.strokeStyle='#fff';g.stroke();g.fillStyle='#fff';g.font='900 '+Math.round(20*z)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('결승',x,hy-169*z);
   for(let r=0;r<Math.ceil((H-hy)/14);r++)for(let k=0;k<2;k++){g.fillStyle=(r+k)&1?'#111':'#fff';g.fillRect(x-14+k*14,hy+r*14,14,14);}}}
 const pandaI=race.types.indexOf('panda');if(pandaI>=0)race.course.bamboo.forEach((bx,k)=>{const x=X(bx+3),y=Yof(laneF(pandaI));if(x<-80||x>W+80)return;const e=race.events.find(e=>e.kind==='eat'&&e.a===pandaI+1&&e.k===k),eaten=e&&f>e.frame+2*HZ,hh=(eaten?22:120)*z;
  for(let s=0;s<4;s++){const sx=x+(s*13-10)*z;g.strokeStyle=s&1?'#5d9a3a':'#77b548';g.lineWidth=6*z;g.beginPath();g.moveTo(sx,y);g.lineTo(sx+(s-1.5)*4*z,y-hh*(0.8+0.07*s));g.stroke();if(!eaten)for(let l=0;l<3;l++){g.beginPath();g.ellipse(sx+(s-1.5)*4*z+(l-1)*13*z,y-hh*(0.55+0.14*l),14*z,4*z,(l-1)*0.6,0,7);g.fillStyle='#4f9a33';g.fill();}}});
 const fx=[];
 const drawOne=i=>{const type=race.types[i],S=SP[type],s=stateOf(i,f),x=dispX(i,f),v=f<0?0:fr(i,f).v,seg=f>=0&&(doneF[i]==null||f<=doneF[i])?segAt(i,f):{s,f0:0,f1:1e9},tau=(f-seg.f0)/HZ,rem=(seg.f1-f)/HZ,p=clamp((f-seg.f0)/Math.max(1,seg.f1-seg.f0),0,1);
  let lf=laneF(i);const rideHost=(s==='ride'||s==='leap')?fr(i,f).h-1:-1;if(s==='leap')lf=laneF(rideHost)+(lf-laneF(rideHost))*p;if(s==='ride'||s==='spun')return;
  const per=z*(0.8+0.2*lf),sc=per*S.k,Xn=X(x),Y=Yof(lf),bw=S.w*sc,bh=S.h0*sc,cx=Xn-bw/2;if(Xn<-260*z||cx-bw>W+260*z)return;
  const ph=S.stride?x/S.stride:0,idx=Math.floor(fract(ph)*4)%4,sw=Math.sin(ph*2*Math.PI);
  let img=S.f[Math.min(idx,S.f.length-1)],ang=0,dy=0,fxp=1,sy=1,mark=null,shadow=0.26,drawn=false,topY=Y-bh;
  const tumble=()=>{ang=tau<0.3?smooth(tau/0.3)*Math.PI:rem<0.3?Math.PI*(2-smooth(rem/0.3)):Math.PI+Math.sin(tau*16)*0.08;dy=-Math.sin(Math.PI*Math.min(1,tau/0.3))*34*per;mark='*';};
  const gallop=(amp=1)=>{dy=-Math.abs(Math.sin(ph*2*Math.PI))*7*per*amp;ang=sw*0.035*amp+Math.min(0.07,Math.abs(v)/900);sy=1+0.025*Math.sin(ph*4*Math.PI);};
  const lines=()=>{g.strokeStyle='rgba(255,255,255,.75)';g.lineWidth=3*per;for(let k=0;k<5;k++){const yy=Y-bh*(0.15+0.18*k),o=((f*7+k*13+i*5)%20)*2.4*per;g.beginPath();g.moveTo(Xn-bw-6*per-o,yy);g.lineTo(Xn-bw-(64+k*10)*per-o,yy);g.stroke();}};
  const dust=(gap,size)=>{if(Math.abs(v)<8)return;const k0=Math.floor(x/gap);for(let j=0;j<5;j++){const xk=(k0-j)*gap,age=(x-xk)/Math.abs(v);if(age<0.55)puff(X(xk)-bw*0.8,Y-4-age*22*per,(5+age*38)*per*size,0.36*(1-age/0.55));}};
  if(type==='costume'&&(fr(i,f).sp||s==='split')&&f>=0&&!['bike','lift','gone','drop','blown','leap'].includes(s)){
   // 둘로 갈라진 인형탈: 앞사람과 뒷사람을 따로 그림
   const since=splitF[i]!=null?(f-splitF[i])/HZ:9,gap=Math.min(15,since*10)+Math.sin(ts*2.3)*2.5,i2=Math.floor(fract(x/5)*2),A=EX['cfront_'+i2],B=EX['cback_'+(1-i2)],down=s==='down'||s==='fly';
   let a1=0,a2=0,d1=-Math.abs(Math.sin(x*0.63))*8*per,d2=-Math.abs(Math.sin(x*0.63+1.4))*8*per;if(down){tumble();a1=ang;a2=-ang*0.9;d1=d2=dy;}else if(s==='split')dust(6,0.7);
   if(since<0.5)fx.push({x:cx,y:Y-bh*0.6,r:(50+since*60)*per,text:'찌익!'});
   const hb=B.im.height*B.k*per,ha=A.im.height*A.k*per,xb=Xn-gap*PPU*z-A.im.width*A.k*per*0.5-B.im.width*B.k*per*0.5;
   g.beginPath();g.ellipse(xb,Y+2*z,40*per,6*z,0,0,7);g.ellipse(Xn-A.im.width*A.k*per/2,Y+2*z,40*per,6*z,0,0,7);g.fillStyle='rgba(0,0,0,.24)';g.fill();
   put(B.im,xb,Y-hb/2+d2,B.k*per,a2);put(A.im,Xn-A.im.width*A.k*per/2,Y-ha/2+d1,A.k*per,a1);topY=Y-ha+Math.min(d1,0);drawn=true;
   if(mark==='*')for(let k=0;k<3;k++){const a=ts*6+k*2.094;star(cx+Math.cos(a)*26*per,topY-24*per+Math.sin(a)*8*per,9*per,a,'#ffd92e');}mark=null;
  }
  else if(s==='ready'){dy=Math.sin(ts*5+i)*1.5;img=S.f[type==='panda'?0:1];}
  else if(s==='down'){tumble();if(tau<0.5)for(let k=0;k<5;k++)puff(Xn-bw*(0.1+k*0.2),Y-4-tau*30*(k%2+1),(8+tau*40)*per,0.5*(1-tau/0.5));}
  else if(s==='fly'){dy=-Math.sin(p*Math.PI)*150*per;ang=p*Math.PI*4;shadow=0.12;}
  else if(s==='thrown'){dy=-Math.sin(p*Math.PI)*190*per;ang=p*Math.PI*5*(v<0?-1:1);shadow=0.1;}
  else if(s==='oops'){img=S.f[3];fx.push({say:'아차!',x:cx+bw*0.1,y:Y-bh-52*per,per});mark='!';}
  else if(s==='blown'){dy=-Math.sin(p*Math.PI)*210*per-20*per;ang=tau*13;shadow=0.1;}
  else if(s==='lift'){dy=-smooth(p)*Math.min(290*z,Y-120);ang=Math.sin(tau*5)*0.25;shadow=0.1;}
  else if(s==='gone'){return;}
  else if(s==='drop'){dy=-(1-p*p)*Math.min(290*z,Y-120);ang=(1-p)*1.2;shadow=0.1;}
  else if(s==='dig'){img=S.f[0];drawn=true;const w=img.width*sc,h=img.height*sc;g.save();g.beginPath();g.rect(cx-w,Y-h*2,w*2,h*2+2*z);g.clip();put(img,cx+w*0.12,Y-h*0.36,sc,1.15);g.restore();for(let k=0;k<4;k++)puff(cx+w*0.42+(k-1.5)*14*per,Y-6*per-fract(tau*1.7+k*0.25)*26*per,(7+k*2)*per,0.5*(1-fract(tau*1.7+k*0.25)),'150,110,70');mark='?';}
  else if(s==='nap'){img=S.f[2];dy=6*per;sy=0.82;fx.push({zzz:1,x:cx+bw*0.3,y:Y-bh-10*per,t:tau,per});}
  else if(s==='eat'){img=S.f[type==='panda'?0:3];if(type!=='panda'){ang=0.3;dy=8*per;}fx.push({say:'냠냠',x:cx+bw*0.45,y:Y-bh-14*per-Math.abs(Math.sin(tau*9))*6,per});}
  else if(s==='wait'){img=S.f[3];fx.push({say:type==='zebra'?'빨간불…':'?!',x:cx+bw*0.2,y:Y-bh-52*per,per});}
  else if(s==='cele'){img=S.f[1];dy=-Math.abs(Math.sin(tau*9))*26*per;fxp=Math.floor(tau/0.35)%2?-1:1;fx.push({say:'만세!',x:cx,y:Y-bh-34*per+dy,per});for(let k=0;k<10;k++){const a=k*0.63+i,t2=fract(tau*0.9+k*0.1);g.fillStyle=['#ff5d5d','#ffd92e','#5dc8ff','#7be07b'][k%4];g.fillRect(cx+Math.cos(a)*t2*120*per,Y-bh-40*per-Math.sin(t2*Math.PI)*90*per+k*3,6*per,9*per);}}
  else if(s==='back'){fxp=-1;gallop();fx.push({say:'?!',x:cx,y:Y-bh-18*per,per});dust(8,1);}
  else if(s==='shell'){const E=EX.shell;drawn=true;const w=E.im.width*E.k*per,h=E.im.height*E.k*per,wob=Math.cos(ts*38);lines();for(let k=0;k<6;k++){const t2=fract(ts*3+k/6);g.fillStyle='rgba(255,230,120,'+(1-t2)+')';g.fillRect(Xn-w*0.5-t2*70*per*(v<0?-1:1),Y-6*per-((k*37)%30)*per,5*per,3*per);}
   g.beginPath();g.ellipse(Xn-w/2,Y+2*z,w*0.45,6*z,0,0,7);g.fillStyle='rgba(0,0,0,.26)';g.fill();put(E.im,Xn-w/2,Y-h/2-3*per,E.k*per,Math.sin(ts*30)*0.12,wob>0?1:-1);topY=Y-h;}
  else if(s==='bike'){const E=EX.cbike;drawn=true;const w=E.im.width*E.k*per,h=E.im.height*E.k*per,b=Math.sin(ts*31)*2.5*per;lines();for(let k=0;k<5;k++){const t2=fract(ts*2.2+k/5);puff(Xn-w-t2*90*per,Y-18*per-t2*26*per,(8+t2*26)*per,0.5*(1-t2),'150,150,150');}
   g.beginPath();g.ellipse(Xn-w/2,Y+2*z,w*0.45,7*z,0,0,7);g.fillStyle='rgba(0,0,0,.26)';g.fill();put(E.im,Xn-w/2,Y-h/2+b,E.k*per,-0.06);topY=Y-h;}
  else if(s==='leap'){const E=EX.cride,h=E.im.height*E.k*per,hh=SP[race.types[rideHost]].h0*SP[race.types[rideHost]].k*per;drawn=true;const yy=Y-h/2-(1-p)*hh*0.7-Math.sin(p*Math.PI)*170*per;g.beginPath();g.ellipse(Xn-60*per,Y+2*z,50*per,6*z,0,0,7);g.fillStyle='rgba(0,0,0,.14)';g.fill();put(E.im,Xn-70*per,yy,E.k*per,-0.5+p*1.1);topY=yy-h/2;lines();}
  else if(type==='panda'){ang=x*PPU/(S.h*0.5);dy=-Math.abs(Math.sin(x*0.35))*8*per;if(v>36)lines();dust(9,0.8);}
  else if(type==='turtle'){dy=-Math.abs(sw)*1.5*per;}
  else{gallop(s==='panic'||s==='sprint'||s==='burst'||s==='prop'?1.5:1);dust(S.stride/2,type==='elephant'?1.6:1);if(s==='sprint'||s==='burst'||s==='panic'||s==='prop'||v>52)lines();}
  if(!drawn){const h=img.height*sc;g.beginPath();g.ellipse(cx,Y+2*z,bw*0.42,7*z,0,0,7);g.fillStyle='rgba(0,0,0,'+shadow+')';g.fill();put(img,cx,Y-h/2+dy,sc,ang,fxp,sy);topY=Math.min(Y-h/2+dy-h/2,Y-bh);}
  const by=topY-17*per;chip(cx,by,15.5*per,i+1);
  if(mark==='?')word('?',cx+bw*0.42,by-6*per,40*per);
  if(mark==='*')for(let k=0;k<3;k++){const a=ts*6+k*2.094;star(cx+Math.cos(a)*26*per,by-26*per+Math.sin(a)*8*per,9*per,a,'#ffd92e');}
  if(s==='panic'||mark==='!')word('!',cx+bw*0.4,by-8*per,44*per,'#ff5a4a');
  // 코끼리 코에 잡혀 프로펠러처럼 도는 선수
  for(let j=0;j<n;j++)if(f>=0&&fr(j,f).s==='spun'&&fr(j,f).h===i+1&&(doneF[j]==null||f<=doneF[j])){const V=SP[race.types[j]],vim=V.f[0],vs=V.k*per*0.82,vr=Math.max(vim.width,vim.height)*vs*0.5,px=Xn+vr*0.75,py=Y-bh*0.5+dy;
   g.beginPath();g.arc(px,py,vr*1.05,0,7);g.fillStyle='rgba(255,255,255,.2)';g.fill();g.lineWidth=3*per;g.strokeStyle='rgba(255,255,255,.55)';for(let k=0;k<3;k++){const a0=ts*30+k*2.094;g.beginPath();g.arc(px,py,vr*(0.7+0.12*k),a0,a0+1.1);g.stroke();}
   put(vim,px,py,vs,ts*30);chip(px,py-vr-16*per,15.5*per,j+1);}
  // 등에 올라탄 두 사람
  for(let j=0;j<n;j++)if(f>=0&&fr(j,f).s==='ride'&&fr(j,f).h===i+1&&(doneF[j]==null||f<=doneF[j])){const E=EX.cride,h=E.im.height*E.k*per;put(E.im,cx-bw*0.05,Y-bh*0.78-h*0.32+dy,E.k*per,sw*0.05);chip(cx-bw*0.05,Y-bh*0.78-h*0.82+dy-17*per,15.5*per,j+1);}
 };
 for(let i=0;i<n;i++)drawOne(i);
 // 사건 연출: 부딪침 표시, 생쥐, 캥거루, UFO, 회오리바람
 for(const e of race.events){const d=(f-e.frame)/HZ;if(d<-1.6||d>4.5)continue;const who=i=>{const lf=laneF(i),per=z*(0.8+0.2*lf),S=SP[race.types[i]];return {x:X(dispX(i,f))-S.w*S.k*per/2,y:Yof(lf),per,h:S.h0*S.k*per};};
  if(d>=0&&d<0.55&&['pounce','bowl','trample','shellhit','bounce','ricochet','grab','throwfwd','throwback'].includes(e.kind)){const w=who((e.kind==='bounce'||e.kind==='ricochet'||e.kind==='grab'?e.a:e.b)-1);fx.push({x:w.x+(e.kind==='grab'?w.h*0.9:0),y:w.y-w.h*0.6,r:(46+d*56)*w.per,text:e.kind==='pounce'?'퍽!':e.kind==='ricochet'||e.kind==='bounce'?'팅!':e.kind==='grab'?'휙!':e.kind.startsWith('throw')?'슝!':'쾅!'});}
  if(e.kind==='panic'&&d>=0&&d<3.2){const lf=laneF(e.a-1),per=z*(0.8+0.2*lf),E=EX.mouse;put(E.im,X(e.x),Yof(lf)-E.im.height*E.k*per/2-Math.abs(Math.sin(d*10))*5*per,E.k*per);}
  if(e.kind==='stomp'&&d>-1.5&&d<1.6){const i=e.a-1,lf=laneF(i),per=z*(0.8+0.2*lf),E=EX.kangaroo,h=E.im.height*E.k*per,tx=dispX(i,e.frame),kx=d<0?tx+d*70:tx+d*55,ky=d<0?Math.abs(Math.sin((d+1.5)*Math.PI/0.5))*150*per*(d>-0.5?1:0.7):Math.abs(Math.sin(d*Math.PI/0.55))*170*per+d*40*per;
   put(E.im,X(kx)-10*per,Yof(lf)-h/2-ky-(d>=0?20*per:0),E.k*per,d<0&&d>-0.5?0.25:-0.1);if(d>=0&&d<0.5)fx.push({x:X(tx)-30*per,y:Yof(lf)-40*per,r:(50+d*60)*per,text:'콱!'});}
  if((e.kind==='ufo'||e.kind==='ufofail')&&d>-1){const i=e.a-1,lf=laneF(i),per=z*(0.8+0.2*lf),S=SP[race.types[i]],E=EX.ufo,end=e.kind==='ufo'?3.0:1.5;if(d<end+1){const bx=X(dispX(i,f))-S.w*S.k*per/2,gy=Yof(lf),hover=Math.max(70,gy-Math.min(290*z,gy-120)-70*per);
    let ux=bx,uy=hover;if(d<0){uy=hover-(-d)*(-d)*420;ux=bx-(-d)*260;}else if(d>end){const t2=d-end;uy=hover-t2*t2*500;ux=bx+t2*520;}uy+=Math.sin(ts*7)*4;ux+=e.kind==='ufofail'&&d>0.6&&d<end?Math.sin(ts*40)*5:0;
    const beam=e.kind==='ufofail'?d>=0&&d<end:(d>=0&&d<1.3)||(d>=2.3&&d<3.0);if(beam){const gr=g.createLinearGradient(0,uy,0,gy);gr.addColorStop(0,'rgba(255,245,150,.75)');gr.addColorStop(1,'rgba(255,245,150,.12)');g.beginPath();g.moveTo(ux-34*per,uy+20*per);g.lineTo(ux+34*per,uy+20*per);g.lineTo(ux+120*per,gy+6);g.lineTo(ux-120*per,gy+6);g.closePath();g.fillStyle=gr;g.fill();}
    put(E.im,ux,uy,E.k*per*1.25,Math.sin(ts*3)*0.05);}}
  if(e.kind==='tornado'&&d>=-0.2&&d<2.4){const tx=X(e.x-d*50),a=d<0.3?d/0.3+0.2:d>1.9?(2.4-d)/0.5:1;for(let k=0;k<22;k++){const t2=k/21,yy=hy+250*z-t2*(250*z+hy*0.8),rw=(30+t2*t2*190)*z,ox=Math.sin(ts*9+k*0.5)*rw*0.22+t2*60*z;g.beginPath();g.ellipse(tx+ox,yy,rw,(10+t2*18)*z,0,0,7);g.fillStyle='rgba(150,150,140,'+(0.42*a)+')';g.fill();g.strokeStyle='rgba(70,70,64,'+(0.45*a)+')';g.lineWidth=2.5;g.stroke();
   const da=ts*11+k*1.9;g.fillStyle='rgba(60,90,40,'+(0.8*a)+')';g.fillRect(tx+ox+Math.cos(da)*rw*1.05,yy+Math.sin(da)*8*z,7*z,4*z);}}
 }
 for(const b of fx){if(b.text)burst(b.x,b.y,b.r,b.text);else if(b.say)word(b.say,b.x,b.y,27*b.per);else if(b.zzz)for(let k=0;k<3;k++){const t2=fract(b.t*0.6+k/3);g.globalAlpha=1-t2;word('Z',b.x+t2*46*b.per+k*6,b.y-t2*60*b.per,(16+t2*24)*b.per,'#cfe6ff');g.globalAlpha=1;}}
}
function orderAt(f){const fin=race.events.filter(e=>e.kind==='finish'&&e.frame<=f).map(e=>e.a),rest=[];for(let i=0;i<n;i++)if(!fin.includes(i+1))rest.push(i+1);rest.sort((a,b)=>dispX(b-1,f)-dispX(a-1,f));return [...fin,...rest];}
const LOWKEY=['lead','finish','home','unshell'];
function render(ts,opts={}){ts=clamp(ts,0,total-1e-6);const f=clamp(frameAt(ts),F0,F1-1),k=f-F0,shot=shotAt[k];g=main;
 let shake=0;for(const e of race.events)if(['pounce','bowl','trample','shellhit','stomp','bounce','ricochet','grab','throwfwd','throwback'].includes(e.kind)&&f>=e.frame&&f-e.frame<16)shake=Math.max(shake,1-(f-e.frame)/16);
 g.save();if(shake)g.translate(Math.sin(f*2.1)*8*shake,Math.cos(f*2.7)*6*shake);
 world(f,ts,{L:camX[k]-W/(2*PPU*camZ[k]),z:camZ[k],hy:camH[k]});g.restore();
 // 뒤쪽 카메라일 때는 선두 화면을 작게 함께 보여 줌
 if(shot&&shot.cut){g=offg;world(f,ts,{L:lead.cx[k]-W/(2*PPU*lead.z[k]),z:lead.z[k],hy:HOR});g=main;const pw=352,phh=198,px=W-pw-18,py=100;g.save();rr(px,py,pw,phh,10);g.clip();g.drawImage(off,0,60,W,H-60,px,py,pw,phh*1.0);g.restore();rr(px,py,pw,phh,10);g.lineWidth=4;g.strokeStyle='#fff';g.stroke();
  rr(px+8,py+8,58,26,6);g.fillStyle='rgba(10,20,30,.8)';g.fill();g.fillStyle='#ffd92e';g.font='800 15px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(f>firstF?'결승선':'선두',px+37,py+22);
  g.font='800 21px system-ui,sans-serif';const lw=g.measureText(shot.label).width+54;rr(180,66,lw,36,18);g.fillStyle='rgba(10,20,30,.78)';g.fill();g.beginPath();g.arc(200,84,7,0,7);g.fillStyle=Math.floor(ts*2)%2?'#ff3b2f':'#a01912';g.fill();g.fillStyle='#fff';g.textAlign='left';g.fillText(shot.label,214,85);}
 for(const sf of snaps){const d=f-sf;if(d>=0&&d<6){g.fillStyle='rgba(255,255,255,'+(0.55*(1-d/6))+')';g.fillRect(0,0,W,H);}}
 hud(f,ts,!!(shot&&shot.cut),opts.readRank||0);
 if(f>=0&&f<F&&speedAt[f]>1){rr(W/2-96,112,192,40,20);g.fillStyle='rgba(10,20,30,.78)';g.fill();g.fillStyle='#ffd92e';g.font='800 21px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('▶▶ 빨리 감기',W/2,133);}
}
function hud(f,ts,pip,readRank){const ord=orderAt(Math.max(0,f));
 rr(176,14,1088,42,21);g.fillStyle='rgba(10,20,30,.62)';g.fill();const bx0=206,bx1=1214;g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=4;g.beginPath();g.moveTo(bx0,35);g.lineTo(bx1,35);g.stroke();
 for(let k=0;k<3;k++)for(let r=0;r<3;r++){g.fillStyle=(k+r)&1?'#111':'#fff';g.fillRect(bx1+6+k*8,23+r*8,8,8);}
 for(const no of ord.slice().reverse())chip(bx0+Math.min(1,dispX(no-1,f)/TRACK)*(bx1-bx0),35,12,no);
 rr(16,14,148,42,12);g.fillStyle='rgba(10,20,30,.78)';g.fill();g.fillStyle='#ffd92e';g.font='900 22px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('정통 경마',90,36);
 rr(16,62,148,14+n*25,12);g.fillStyle='rgba(10,20,30,.62)';g.fill();
 ord.forEach((no,r)=>{const y=82+r*25;g.fillStyle=r<3?'#ffd92e':'#dfe6ee';g.font='800 15px system-ui,sans-serif';g.textAlign='right';g.textBaseline='middle';g.fillText((r+1)+'위',56,y);chip(74,y,10,no);g.fillStyle='#fff';g.font='600 14px system-ui,sans-serif';g.textAlign='left';g.fillText(TYPES[race.types[no-1]].name,90,y+1);});
 const left=Math.max(0,Math.round(TRACK-Math.max(...ord.map(no=>Math.min(TRACK,dispX(no-1,f))))));
 if(f>=0&&left>0&&!pip){rr(1104,62,160,30,15);g.fillStyle='rgba(10,20,30,.62)';g.fill();g.fillStyle='#fff';g.font='700 15px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('선두 남은 거리 '+left,1184,78);}
 // 중계 자막(웃긴 사건이 순위 알림에 바로 덮이지 않게 함)
 let ev=null,hi=null;for(const e of race.events){if(e.frame>f)break;if(f-e.frame<3*HZ){ev=e;if(!LOWKEY.includes(e.kind))hi=e;}}
 if(ev&&hi&&LOWKEY.includes(ev.kind)&&f-hi.frame<1.7*HZ)ev=hi;
 if(f<0)ev={text:-f/HZ>COUNTDOWN?(greeting?HELLO:'오늘의 선수들입니다. 누가 몇 번인지 확인하세요!'):READY+' 곧 출발합니다!',frame:-f/HZ>COUNTDOWN?F0-30:-COUNTDOWN*HZ-1};
 if(ev&&f<F+0.6*HZ){g.globalAlpha=Math.min(1,(f-ev.frame)/8+0.2);let size=27;g.font='800 '+size+'px system-ui,sans-serif';let tw=g.measureText(ev.text).width;if(tw>1020){size=Math.floor(27*1020/tw);g.font='800 '+size+'px system-ui,sans-serif';tw=g.measureText(ev.text).width;}
  const bw=tw+124,bx=(W-bw)/2;rr(bx,650,bw,52,10);g.fillStyle='rgba(8,12,20,.82)';g.fill();rr(bx+8,658,70,36,7);g.fillStyle='#d6341f';g.fill();g.fillStyle='#fff';g.font='800 19px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('중계',bx+43,677);g.font='800 '+size+'px system-ui,sans-serif';g.textAlign='left';g.fillText(ev.text,bx+92,677);g.globalAlpha=1;}
 const big=(t,col)=>{g.font='900 190px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=16;g.strokeStyle='rgba(0,0,0,.7)';g.strokeText(t,W/2,300);g.fillStyle=col;g.fillText(t,W/2,300);};
 // 출발 전 선수 소개: 누가 몇 번을 달았는지 보여 줌
 if(f<0&&-f/HZ>COUNTDOWN-0.4){g.globalAlpha=clamp((-f/HZ-(COUNTDOWN-0.4))/0.4,0,1)*clamp((f-F0)/12,0,1);const rows=Math.ceil(n/2),ph=96+rows*64;rr(240,84,800,ph,22);g.fillStyle='rgba(18,28,44,.92)';g.fill();g.strokeStyle='#ffd92e';g.lineWidth=3;g.stroke();
  g.fillStyle='#ffd92e';g.font='900 34px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('오늘의 선수',640,126);
  race.types.forEach((type,i)=>{const col=i<rows?0:1,x=280+col*390,y=186+(i%rows)*64;chip(x+24,y,21,i+1);const im=SP[type].f[0],fit=Math.min(92/im.width,54/im.height),ww=im.width*fit,hh=im.height*fit;g.drawImage(im,x+60+(92-ww)/2,y-hh/2,ww,hh);g.fillStyle='#fff';g.font='700 22px system-ui,sans-serif';g.textAlign='left';g.fillText((i+1)+'번 '+TYPES[type].name,x+166,y+1);});g.globalAlpha=1;}
 if(f<0&&-f/HZ<=COUNTDOWN)big(String(Math.ceil(-f/HZ)),'#fff');else if(f>=0&&f<0.9*HZ)big('출발!','#ffd92e');
 if(f>=F+0.6*HZ){g.globalAlpha=Math.min(1,(f-F-0.6*HZ)/20);g.fillStyle='rgba(5,10,18,.72)';g.fillRect(0,0,W,H);rr(270,60,740,600,22);g.fillStyle='rgba(18,28,44,.96)';g.fill();g.strokeStyle='#ffd92e';g.lineWidth=3;g.stroke();
  g.fillStyle='#ffd92e';g.font='900 40px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('경기 결과',640,112);g.fillStyle='#9fb0c4';g.font='600 17px system-ui,sans-serif';g.fillText('추첨 번호 '+seed+' · '+race.seconds+'초',640,150);
  const rows=Math.ceil(n/2);race.order.forEach((no,r)=>{const col=r<rows?0:1,x=300+col*350,y=205+(r%rows)*(420/rows);if(readRank===r+1){rr(x-6,y-34,340,68,14);g.fillStyle='rgba(255,217,46,.2)';g.fill();g.strokeStyle='#ffd92e';g.lineWidth=2;g.stroke();}g.fillStyle=r<3?'#ffd92e':'#dfe6ee';g.font='900 30px system-ui,sans-serif';g.textAlign='right';g.textBaseline='middle';g.fillText((r+1)+'위',x+70,y);chip(x+106,y,21,no);
   const im=SP[race.types[no-1]].f[0],fit=Math.min(84/im.width,58/im.height),ww=im.width*fit,hh=im.height*fit;g.drawImage(im,x+136+(84-ww)/2,y-hh/2,ww,hh);g.fillStyle='#fff';g.font='700 20px system-ui,sans-serif';g.textAlign='left';g.fillText(TYPES[race.types[no-1]].name,x+230,y-(r>=race.finished?9:0));
   if(r>=race.finished){g.fillStyle='#ff8d7a';g.font='600 14px system-ui,sans-serif';g.fillText('결승선 못 옴',x+230,y+13);}});g.globalAlpha=1;}
}
return {race,tl,seed,n,total,endAt:tl.endAt,render,frameAt,speedAt,shots,F,firstF};
}
