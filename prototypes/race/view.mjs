// 엉뚱 경주 화면(시안). sim.mjs 가 미리 계산한 경기를 그대로 다시 보여 줍니다.
// 주소 뒤에 #seed=추첨번호&n=선수수 를 붙이면 그 경기를 봅니다. window.__seek(초) 로 원하는 순간을 그릴 수 있습니다.
import {runRace,TYPES,TRACK,HZ} from './sim.mjs';
const W=1280,H=720,PPU=9,HOR=392,PRE=3,POST=5;
const q=new URLSearchParams(location.hash.slice(1)),seed=(q.get('seed')||'00c51d27').padStart(8,'0').slice(-8),n=Math.max(2,Math.min(10,+(q.get('n')||10)||10));
const cv=document.getElementById('cv'),g=cv.getContext('2d');cv.width=W;cv.height=H;
// 화면에 그릴 키(가까운 줄 기준, 픽셀)와 보폭(트랙 단위). 키를 서로 비슷하게 맞춘 값입니다.
const LOOK={horse:{h:142,stride:13},biped:{h:158,stride:9},cheetah:{h:82,stride:15},panda:{h:114,stride:0},ostrich:{h:168,stride:8},costume:{h:152,stride:7}};
const NUMC=['#e53935','#fafafa','#1e5fd0','#f6c915','#2e9e4f','#1b1b1b','#f57c00','#ec6fa7','#27b5c4','#7d4cc2'],NUMT=['#fff','#111','#fff','#111','#fff','#fff','#fff','#111','#111','#fff'];
const load=src=>new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src=src;});
function crop(im){if(!im)return null;const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;
 let x0=c.width,y0=c.height,x1=0,y1=0;for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++)if(d[(y*c.width+i)*4+3]>40){if(i<x0)x0=i;if(i>x1)x1=i;if(y<y0)y0=y;if(y>y1)y1=y;}
 const o=document.createElement('canvas');o.width=x1-x0+1;o.height=y1-y0+1;o.getContext('2d').drawImage(c,-x0,-y0);return o;}
function tileOf(img,sy,sh){const c=document.createElement('canvas');c.width=img.width*2;c.height=sh;const x=c.getContext('2d');x.drawImage(img,0,sy,img.width,sh,0,0,img.width,sh);x.translate(c.width,0);x.scale(-1,1);x.drawImage(img,0,sy,img.width,sh,0,0,img.width,sh);return c;}
const names=Object.keys(TYPES),SP={};
const [track,...imgs]=await Promise.all([load('assets/track.jpg'),...names.flatMap(k=>[load('assets/'+k+'.png'),k==='panda'?null:load('assets/'+k+'_b.png')])]);
names.forEach((k,i)=>{const a=crop(imgs[i*2]),b=crop(imgs[i*2+1]);SP[k]={a,b,k:LOOK[k].h/a.height,...LOOK[k]};});
const FAR=tileOf(track,230,330),FENCE=tileOf(track,560,215),GRASS=tileOf(track,790,234),GRASS2=document.createElement('canvas');
{GRASS2.width=GRASS.width;GRASS2.height=GRASS.height;const x=GRASS2.getContext('2d');x.translate(0,GRASS.height);x.scale(1,-1);x.drawImage(GRASS,0,0);}
// ---- 경기 자료 정리 ----
const race=runRace(seed,n),F=race.frames.length,F0=-PRE*HZ,F1=F+POST*HZ;
const doneF=new Array(n).fill(null);for(const e of race.events)if(e.kind==='finish')doneF[e.a-1]=Math.min(F-1,e.frame);
const st=(i,f)=>race.frames[Math.max(0,Math.min(F-1,f))][i];
const dispX=(i,f)=>{if(f<0)return 0;const d=doneF[i];if(d!=null&&f>d)return TRACK+st(i,d).v*0.8*(f-d)/HZ;return st(i,f).x;};
// 넘어짐·멈춤 구간을 미리 찾아 둠(어떤 까닭인지도 함께)
const segs=Array.from({length:n},()=>[]);
for(let i=0;i<n;i++){let cur=null;for(let f=0;f<F;f++){const s=race.frames[f][i].state,on=s==='down'||s==='gawk';
  if(on&&(!cur||cur.state!==s)){if(cur)cur.f1=f;cur={state:s,f0:f,f1:F,kind:s==='gawk'?'gawk':'fall'};segs[i].push(cur);
   const e=race.events.find(e=>Math.abs(e.frame-f)<=1&&((e.kind==='pounce'&&(e.a===i+1||e.b===i+1))||(e.kind==='bowl'&&e.b===i+1)));
   if(e&&s==='down')cur.kind=e.kind==='bowl'?'bowled':e.a===i+1?'pouncer':'pounced';}
  else if(!on&&cur){cur.f1=f;cur=null;}}}
const segAt=(i,f)=>segs[i].find(s=>f>=s.f0&&f<s.f1);
// 카메라: 선두를 따라가되, 뒤따르는 무리가 보이도록 조금 물러남
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const cam=new Float32Array(F1-F0),zm=new Float32Array(F1-F0);{let c=null,z=1;
 for(let f=F0;f<F1;f++){const xs=[];for(let i=0;i<n;i++)xs.push(Math.min(dispX(i,f),TRACK+26));xs.sort((a,b)=>b-a);const L=xs[0],k=xs[Math.min(n-1,4)];
  const ahead=95-75*smooth(L/170),zt=Math.max(0.84,Math.min(1,W/((L-k+ahead+24)*PPU)));z+=(zt-z)*1.4/HZ;const ct=L+ahead-W/(PPU*z);c=c==null?ct:c+(ct-c)*3/HZ;cam[f-F0]=c;zm[f-F0]=z;}}
const total=PRE+F/HZ+POST;
// ---- 그리기 ----
function strip(tile,dy,dh,scroll){const s=dh/tile.height,tw=tile.width*s;let x=-(((scroll%tw)+tw)%tw);for(;x<W;x+=tw-1)g.drawImage(tile,x,dy,tw,dh);}
function rr(x,y,w,h,r){g.beginPath();g.roundRect(x,y,w,h,r);}
function chip(x,y,r,no){g.beginPath();g.arc(x,y,r,0,7);g.fillStyle=NUMC[no-1];g.fill();g.lineWidth=Math.max(1.5,r*0.14);g.strokeStyle='rgba(0,0,0,.55)';g.stroke();g.fillStyle=NUMT[no-1];g.font='800 '+Math.round(r*1.25)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(no,x,y+r*0.06);}
function star(x,y,r,rot,col){g.beginPath();for(let i=0;i<10;i++){const a=rot+i*Math.PI/5,q=i%2?r*0.45:r;g.lineTo(x+Math.cos(a)*q,y+Math.sin(a)*q);}g.closePath();g.fillStyle=col;g.fill();}
function burst(x,y,r,text){g.beginPath();for(let i=0;i<24;i++){const a=i*Math.PI/12,q=i%2?r*0.62:r;g.lineTo(x+Math.cos(a)*q,y+Math.sin(a)*q*0.8);}g.closePath();g.fillStyle='#ffe14d';g.fill();g.lineWidth=4;g.strokeStyle='#d6341f';g.stroke();
 g.fillStyle='#d6341f';g.font='900 '+Math.round(r*0.62)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,x,y);}
function orderAt(f){const fin=race.events.filter(e=>e.kind==='finish'&&e.frame<=f).map(e=>e.a),rest=[];for(let i=0;i<n;i++)if(!fin.includes(i+1))rest.push(i+1);rest.sort((a,b)=>dispX(b-1,f)-dispX(a-1,f));return [...fin,...rest];}
function render(ts){ts=Math.max(0,Math.min(total-1e-6,ts));const f=Math.floor((ts-PRE)*HZ),c=cam[f-F0],z=zm[f-F0],X=x=>(x-c)*PPU*z;
 let shake=0;for(const e of race.events)if((e.kind==='pounce'||e.kind==='bowl')&&f>=e.frame&&f-e.frame<16)shake=Math.max(shake,1-(f-e.frame)/16);
 g.save();if(shake)g.translate(Math.sin(f*2.1)*7*shake,Math.cos(f*2.7)*5*shake);
 strip(FAR,0,264,c*PPU*0.2);strip(FENCE,264,HOR-264,c*PPU*z*0.9);{const gh=(H-HOR)/2;strip(GRASS,HOR,gh,c*PPU*z);strip(GRASS2,HOR+gh,gh,c*PPU*z);}
 // 잔디 깎은 줄무늬(속도감), 출발선·결승선, 거리 표지
 g.fillStyle='rgba(0,40,0,.085)';for(let k=Math.floor(c/50)-1;k*50<c+W/(PPU*z)+50;k++)if(k&1)g.fillRect(X(k*50),HOR,50*PPU*z,H-HOR);
 for(const [x,col] of [[0,'rgba(255,255,255,.75)'],[TRACK,'#fff']]){g.fillStyle=col;g.fillRect(X(x)-3,HOR,6,H-HOR);}
 for(let m=100;m<TRACK;m+=100){const x=X(m);if(x<-80||x>W+80)continue;g.fillStyle='#e9e9e9';g.fillRect(x-2,HOR-46*z,4,46*z);rr(x-30*z,HOR-70*z,60*z,28*z,5*z);g.fillStyle='#fff';g.fill();g.strokeStyle='#333';g.lineWidth=2;g.stroke();g.fillStyle='#111';g.font='800 '+Math.round(17*z)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText((TRACK-m),x,HOR-56*z);}
 {const x=X(TRACK);if(x>-120&&x<W+120){g.fillStyle='#d8d8d8';g.fillRect(x-4,HOR-150*z,8,150*z);g.beginPath();g.arc(x,HOR-150*z,26*z,0,7);g.fillStyle='#d6341f';g.fill();g.lineWidth=5*z;g.strokeStyle='#fff';g.stroke();g.fillStyle='#fff';g.font='900 '+Math.round(19*z)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('결승',x,HOR-149*z);
   for(let r=0;r<Math.ceil((H-HOR)/14);r++)for(let k=0;k<2;k++){g.fillStyle=(r+k)&1?'#111':'#fff';g.fillRect(x-14+k*14,HOR+r*14,14,14);}}}
 const fx=[];
 for(let i=0;i<n;i++){const type=race.types[i],S=SP[type],s=st(i,f),x=dispX(i,f),lf=(i+0.5+(10-n)/2)/10,sc=z*(0.8+0.2*lf)*S.k,Xn=X(x),Y=HOR+(20+lf*236)*z,run=f>=0&&(doneF[i]==null||f<=doneF[i]||true);
  let img=S.a,ang=0,dy=0,flip=false,mark=null;const seg=f>=0?segAt(i,f):null,ph=S.stride?x/S.stride:0,fr=ph-Math.floor(ph);
  if(seg&&seg.kind==='gawk'){flip=Math.floor((f-seg.f0)/(0.32*HZ))%2===1;mark='?';}
  else if(seg){const tau=(f-seg.f0)/HZ,rem=(seg.f1-f)/HZ,p=(f-seg.f0)/(seg.f1-seg.f0);
   if(seg.kind==='bowled'){dy=-Math.sin(p*Math.PI)*120*sc/S.k;ang=p*Math.PI*4;}
   else{ang=tau<0.3?smooth(tau/0.3)*Math.PI:rem<0.3?Math.PI*(2-smooth(rem/0.3)):Math.PI+Math.sin(tau*16)*0.08;dy=-Math.sin(Math.PI*Math.min(1,tau/0.3))*34*sc/S.k;mark='*';}
   if(tau<0.55&&seg.kind!=='fall'&&seg.kind!=='pouncer')fx.push({x:Xn-S.a.width*sc*0.5,y:Y-S.a.height*sc*0.6,r:(46+tau*50)*z,text:seg.kind==='bowled'?'쾅!':'퍽!'});
   if(tau<0.5&&seg.kind==='fall')for(let k=0;k<5;k++){g.beginPath();g.arc(Xn-S.a.width*sc*(0.1+k*0.2),Y-4-tau*30*(k%2+1),(8+tau*40)*z,0,7);g.fillStyle='rgba(235,225,200,'+(0.5*(1-tau/0.5))+')';g.fill();}}
  else if(type==='panda'){ang=x*PPU/(S.h*0.5);dy=-Math.abs(Math.sin(x*0.35))*7*z;}
  else if(f<0){dy=Math.sin(ts*5+i)*1.5;}
  else{if(S.b){img=fr<0.5?S.a:S.b;dy=-Math.abs(Math.sin(fr*2*Math.PI))*5*z;}else{ang=Math.sin(fr*2*Math.PI)*0.07;dy=-Math.abs(Math.sin(fr*Math.PI))*12*z;}}
  const w=img.width*sc,h=img.height*sc,cx=Xn-w/2,cy=Y-h/2;if(Xn<-60||cx-w>W+60){continue;}
  // 발밑 먼지와 그림자
  if(f>=0&&!seg&&s.v>8){const gap=7,k0=Math.floor(x/gap);for(let j=0;j<4;j++){const xk=(k0-j)*gap,age=(x-xk)/s.v;if(age<0.5){g.beginPath();g.arc(X(xk)-w*0.82,Y-3-age*14,(4+age*30)*sc/S.k,0,7);g.fillStyle='rgba(225,230,200,'+(0.33*(1-age/0.5))+')';g.fill();}}}
  g.beginPath();g.ellipse(cx,Y+2*z,w*0.42,7*z,0,0,7);g.fillStyle='rgba(0,0,0,'+(dy<-30?0.12:0.26)+')';g.fill();
  // 전력질주 바람줄
  if(!seg&&f>=0&&(s.state==='sprint'||s.v>34)){g.strokeStyle='rgba(255,255,255,.7)';g.lineWidth=3*z;for(let k=0;k<4;k++){const yy=Y-h*(0.2+0.2*k),o=((f*7+k*13+i*5)%20)*2*z;g.beginPath();g.moveTo(Xn-w-8*z-o,yy);g.lineTo(Xn-w-(50+k*9)*z-o,yy);g.stroke();}}
  g.save();g.translate(cx,cy+dy);g.rotate(ang);if(flip)g.scale(-1,1);g.drawImage(img,-w/2,-h/2,w,h);g.restore();
  const by=Math.min(cy+dy-h/2,Y-h)-16*z;chip(cx,by,15*z*(0.85+0.15*lf),i+1);
  if(mark==='?'){g.fillStyle='#fff';g.strokeStyle='#111';g.lineWidth=5;g.font='900 '+Math.round(40*z)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';const mx=cx+w*0.42,my=by-6*z;g.strokeText('?',mx,my);g.fillText('?',mx,my);}
  if(mark==='*')for(let k=0;k<3;k++){const a=ts*6+k*2.094;star(cx+Math.cos(a)*26*z,by-26*z+Math.sin(a)*8*z,9*z,a,'#ffd92e');}
 }
 for(const b of fx)burst(b.x,b.y,b.r,b.text);
 g.restore();hud(f,ts);
}
function hud(f,ts){const ord=orderAt(Math.max(0,f));
 // 위쪽 진행 막대
 rr(176,14,1088,42,21);g.fillStyle='rgba(10,20,30,.62)';g.fill();const bx0=206,bx1=1214;g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=4;g.beginPath();g.moveTo(bx0,35);g.lineTo(bx1,35);g.stroke();
 for(let k=0;k<3;k++)for(let r=0;r<3;r++){g.fillStyle=(k+r)&1?'#111':'#fff';g.fillRect(bx1+6+k*8,23+r*8,8,8);}
 for(const no of ord.slice().reverse())chip(bx0+Math.min(1,dispX(no-1,f)/TRACK)*(bx1-bx0),35,12,no);
 // 왼쪽 순위표
 rr(16,14,148,42,12);g.fillStyle='rgba(10,20,30,.78)';g.fill();g.fillStyle='#ffd92e';g.font='900 22px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('엉뚱 경주',90,36);
 rr(16,62,148,14+n*25,12);g.fillStyle='rgba(10,20,30,.62)';g.fill();
 ord.forEach((no,r)=>{const y=82+r*25;g.fillStyle=r<3?'#ffd92e':'#dfe6ee';g.font='800 15px system-ui,sans-serif';g.textAlign='right';g.textBaseline='middle';g.fillText((r+1)+'위',56,y);chip(74,y,10,no);g.fillStyle='#fff';g.font='600 14px system-ui,sans-serif';g.textAlign='left';g.fillText(TYPES[race.types[no-1]].name,90,y+1);});
 const left=Math.max(0,Math.round(TRACK-Math.max(...ord.map(no=>Math.min(TRACK,dispX(no-1,f))))));
 if(f>=0&&left>0){rr(1104,62,160,30,15);g.fillStyle='rgba(10,20,30,.62)';g.fill();g.fillStyle='#fff';g.font='700 15px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('선두 남은 거리 '+left,1184,78);}
 // 중계 자막
 let ev=null;for(const e of race.events){if(e.frame<=f&&f-e.frame<2.8*HZ)ev=e;}
 if(f<0)ev={text:'선수들이 출발선에 섰습니다. 곧 출발합니다!',frame:f};
 if(ev&&f<F+0.6*HZ){const a=Math.min(1,(f-ev.frame)/8+0.2);g.globalAlpha=a;g.font='800 27px system-ui,sans-serif';const tw=g.measureText(ev.text).width,bw=tw+124,bx=(W-bw)/2;rr(bx,650,bw,52,10);g.fillStyle='rgba(8,12,20,.8)';g.fill();rr(bx+8,658,70,36,7);g.fillStyle='#d6341f';g.fill();
  g.fillStyle='#fff';g.font='800 19px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('중계',bx+43,677);g.font='800 27px system-ui,sans-serif';g.textAlign='left';g.fillText(ev.text,bx+92,677);g.globalAlpha=1;}
 // 출발 신호
 const big=(t,col)=>{g.font='900 190px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=16;g.strokeStyle='rgba(0,0,0,.7)';g.strokeText(t,W/2,300);g.fillStyle=col;g.fillText(t,W/2,300);};
 if(f<0)big(String(Math.ceil(-f/HZ)),'#fff');else if(f<0.9*HZ)big('출발!','#ffd92e');
 // 결과판
 if(f>=F+0.6*HZ){const a=Math.min(1,(f-F-0.6*HZ)/20);g.globalAlpha=a;g.fillStyle='rgba(5,10,18,.72)';g.fillRect(0,0,W,H);rr(290,70,700,580,22);g.fillStyle='rgba(18,28,44,.96)';g.fill();g.strokeStyle='#ffd92e';g.lineWidth=3;g.stroke();
  g.fillStyle='#ffd92e';g.font='900 40px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('경기 결과',640,122);g.fillStyle='#9fb0c4';g.font='600 17px system-ui,sans-serif';g.fillText('추첨 번호 '+seed+' · '+race.seconds+'초',640,160);
  const rows=Math.ceil(n/2);race.order.forEach((no,r)=>{const col=r<rows?0:1,x=330+col*330,y=215+(r%rows)*(410/rows);g.fillStyle=r<3?'#ffd92e':'#dfe6ee';g.font='900 30px system-ui,sans-serif';g.textAlign='right';g.textBaseline='middle';g.fillText((r+1)+'위',x+70,y);chip(x+106,y,21,no);
   const S=SP[race.types[no-1]],fit=Math.min(84/S.a.width,56/S.a.height),ww=S.a.width*fit,hh=S.a.height*fit;g.drawImage(S.a,x+136+(84-ww)/2,y-hh/2,ww,hh);g.fillStyle='#fff';g.font='700 20px system-ui,sans-serif';g.textAlign='left';g.fillText(TYPES[race.types[no-1]].name,x+230,y+1);});g.globalAlpha=1;}
}
window.__total=total;window.__race=race;window.__seek=t=>render(t);
let t0=null;function loop(now){if(t0==null)t0=now;const t=(now-t0)/1000;render(t);if(t<total)requestAnimationFrame(loop);}
if(q.get('still')!=null)render(+q.get('still'));else requestAnimationFrame(loop);
cv.addEventListener('click',()=>{t0=null;requestAnimationFrame(loop);});
window.__ready=true;
