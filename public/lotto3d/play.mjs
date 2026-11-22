// 로또 추첨기 한 판: 둥근 통 안에서 번호 공이 바람에 날려 섞이다가 하나씩 뽑혀 나옵니다.
// 주소 뒤 #… 에 {seed, from, to, count, expect?:[번호…], hold?} 를 받아 시작합니다. 같은 seed 면 언제나 같은 결과입니다.
import * as THREE from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {LOTTO_V1 as M,MIN_BALLS,MAX_BALLS} from './sim.mjs';
const $=id=>document.getElementById(id),wait=ms=>new Promise(r=>setTimeout(r,ms));
let input;try{input=JSON.parse(decodeURIComponent(location.hash.slice(1)));}catch{input=null;}
const okInt=v=>Number.isSafeInteger(v);
if(!input||!/^[0-9a-f]{8}$/.test(input.seed||'')||!okInt(input.from)||!okInt(input.to)||!okInt(input.count)||input.to-input.from+1<MIN_BALLS||input.to-input.from+1>MAX_BALLS||input.count<1||input.count>input.to-input.from+1){$('waitText').textContent='추첨 정보를 읽지 못했습니다.';document.querySelector('.spin').style.display='none';throw new Error('bad input');}
const {seed,from,to,count}=input,n=to-from+1,fast=!!input.fast;
$('sub').textContent=`${from}~${to} 중 ${count}개`;
const toParent=m=>{try{if(parent!==window)parent.postMessage({source:'lotto3d',...m},location.origin);}catch{}};
// 공 색: 번호대별(한국 로또처럼 1~10 노랑, 11~20 파랑, 21~30 빨강, 31~40 회색, 41~ 초록, 그 뒤는 되풀이)
const COLORS=['#fbc400','#69c8f2','#ff7272','#aaaaaa','#b0d840','#c39bf5'];
export const colorOf=num=>COLORS[Math.floor((Math.max(1,num)-1)/10)%COLORS.length];
const chip=num=>`<span class="num" style="background:${colorOf(num)}">${num}</span>`;

const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
let data=null,failed=null,progress=0;const waiters=[];
worker.onmessage=e=>{const m=e.data;if(m.type==='done')data=m;else if(m.type==='progress')progress=m.drawn;else if(m.type==='error')failed=m.message;for(const w of waiters.splice(0))w();};
worker.onerror=e=>{failed=e.message||'계산 오류';for(const w of waiters.splice(0))w();};
worker.postMessage({seed,from,to,count});

// ---------- 화면 ----------
const stage=$('stage'),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(stage.clientWidth,stage.clientHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;stage.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x1b1d22);
const camera=new THREE.PerspectiveCamera(42,stage.clientWidth/stage.clientHeight,0.01,20);
const frame=()=>{const portrait=stage.clientWidth<stage.clientHeight;camera.aspect=stage.clientWidth/stage.clientHeight;camera.position.set(0,M.cy+0.10,portrait?1.08:0.74);camera.lookAt(0,M.cy-0.075,0.05);camera.updateProjectionMatrix();renderer.setSize(stage.clientWidth,stage.clientHeight);};frame();addEventListener('resize',frame);
const key=new THREE.DirectionalLight(0xfff4e6,2.2);key.position.set(0.5,1.2,0.8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-0.6,right:0.6,top:0.6,bottom:-0.6,near:0.2,far:4});scene.add(key,new THREE.HemisphereLight(0xdfe8ff,0x30262a,0.5));
try{const env=await new EXRLoader().loadAsync('../treadmill3d/assets/hdri/lobby.exr');env.mapping=THREE.EquirectangularReflectionMapping;scene.environment=new THREE.PMREMGenerator(renderer).fromEquirectangular(env).texture;scene.environmentIntensity=0.9;}catch{/* 조명 사진이 없어도 진행 */}
// 받침·통·출구 관·진열대
const dark=new THREE.MeshStandardMaterial({color:0x22252b,roughness:0.5,metalness:0.6}),gold=new THREE.MeshStandardMaterial({color:0xd9a441,roughness:0.25,metalness:1});
const floor=new THREE.Mesh(new THREE.CircleGeometry(1.2,48),new THREE.MeshStandardMaterial({color:0x2a2d34,roughness:0.85}));floor.rotation.x=-Math.PI/2;floor.position.y=-0.105;floor.receiveShadow=true;scene.add(floor);
const base=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.15,0.075,48),dark);base.position.y=M.cy-M.R-0.06;base.castShadow=true;scene.add(base);
const collar=new THREE.Mesh(new THREE.TorusGeometry(0.075,0.012,12,48),gold);collar.rotation.x=Math.PI/2;collar.position.y=M.cy-M.R+0.012;scene.add(collar);
const glass=new THREE.Mesh(new THREE.SphereGeometry(M.R+0.006,64,48),new THREE.MeshPhysicalMaterial({color:0xffffff,transparent:true,opacity:0.13,roughness:0.03,metalness:0,clearcoat:1,side:THREE.DoubleSide,depthWrite:false}));glass.position.y=M.cy;glass.renderOrder=5;scene.add(glass);
const band=new THREE.Mesh(new THREE.TorusGeometry(M.R+0.007,0.006,10,80),gold);band.position.y=M.cy;band.rotation.x=Math.PI/2;scene.add(band);
const tubeMat=new THREE.MeshPhysicalMaterial({color:0xffffff,transparent:true,opacity:0.18,roughness:0.05,clearcoat:1,side:THREE.DoubleSide,depthWrite:false});
const tube=new THREE.Mesh(new THREE.CylinderGeometry(M.ballR*1.35,M.ballR*1.35,0.09,24,1,true),tubeMat);tube.position.y=M.cy+M.R+0.045;tube.renderOrder=5;scene.add(tube);
const cap=new THREE.Mesh(new THREE.TorusGeometry(M.ballR*1.4,0.006,10,32),gold);cap.rotation.x=Math.PI/2;cap.position.y=M.cy+M.R+0.004;scene.add(cap);
// 진열대: 뽑힌 공이 왼쪽부터 놓이는 자리(한 줄에 10개)
const perRow=Math.min(10,count),pitch=M.ballR*2.25,trayY=-0.105+M.ballR,trayZ=0.27;
const slotOf=j=>{const row=Math.floor(j/perRow),col=j%perRow,inRow=Math.min(perRow,count-row*perRow);return new THREE.Vector3((col-(inRow-1)/2)*pitch,trayY,trayZ+row*pitch);};
const rows=Math.ceil(count/perRow),shelf=new THREE.Mesh(new THREE.BoxGeometry(perRow*pitch+0.03,0.008,rows*pitch+0.02),dark);shelf.position.set(0,-0.109,trayZ+(rows-1)*pitch/2);shelf.receiveShadow=true;scene.add(shelf);
// 번호 공
const ballGeo=new THREE.SphereGeometry(M.ballR,32,24);
function ballTex(num){const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');g.fillStyle=colorOf(num);g.fillRect(0,0,256,128);
 for(const cx of [64,192]){g.fillStyle='#fff';g.beginPath();g.arc(cx,64,34,0,7);g.fill();g.fillStyle='#111';g.font=`bold ${String(num).length>2?34:44}px system-ui,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(String(num),cx,66);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
const balls=[];for(let k=0;k<n;k++){const mesh=new THREE.Mesh(ballGeo,new THREE.MeshPhysicalMaterial({map:ballTex(from+k),roughness:0.25,clearcoat:0.8,clearcoatRoughness:0.15}));mesh.castShadow=true;scene.add(mesh);balls.push(mesh);}
// 바람 표시: 통 바닥에서 위로 흐르는 작은 점들
const dust=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(90*3),3)),new THREE.PointsMaterial({color:0xbfe6ff,size:0.006,transparent:true,opacity:0.5,depthWrite:false}));scene.add(dust);
const top=new THREE.Vector3(0,M.cy+M.R+0.1,0),tmp=new THREE.Vector3(),MOVE=46; // 뽑힌 공이 진열대로 옮겨지는 장면 수
function draw(f){
 const {frames,stride,events}=data,o=Math.min(f,frames.length/stride-1)*stride,when=new Map(events.map((e,j)=>[e.i,{frame:e.frame,j}]));
 for(let k=0;k<n;k++){const b=balls[k],w=when.get(k);b.position.set(frames[o+k*7],frames[o+k*7+1],frames[o+k*7+2]);b.quaternion.set(frames[o+k*7+3],frames[o+k*7+4],frames[o+k*7+5],frames[o+k*7+6]);
  if(w&&f>=w.frame){const u=Math.min(1,(f-w.frame)/MOVE),slot=slotOf(w.j);
   if(u<0.35)b.position.lerp(top,u/0.35);else{const v=(u-0.35)/0.65,e=v*v*(3-2*v);tmp.copy(top).lerp(slot,e);tmp.y+=Math.sin(Math.PI*e)*0.06;tmp.z+=Math.sin(Math.PI*e)*0.1;b.position.copy(tmp);}
   if(u>0.6)b.quaternion.set(0,0,0,1);if(u>=1)b.position.copy(slot);}} // 진열대에서는 숫자가 앞을 보게
 const p=dust.geometry.attributes.position;for(let i=0;i<90;i++){const u=((f*0.02+i/90)%1),a=i*2.4;p.setXYZ(i,Math.cos(a)*0.03*(1+u*2.5),M.cy-M.R+0.02+u*M.R*1.7,Math.sin(a)*0.03*(1+u*2.5));}p.needsUpdate=true;
 renderer.render(scene,camera);
}
async function play(){
 $('chips').innerHTML='';$('result').hidden=true;const {events,frames,stride}=data,total=frames.length/stride,speed=fast?6:1,t0=performance.now();let shown=0;
 await new Promise(res=>{const loop=()=>{const f=Math.min(total-1,Math.floor((performance.now()-t0)/1000*60*speed));draw(f);
   while(shown<events.length&&events[shown].frame+MOVE<=f){const e=events[shown];$('chips').insertAdjacentHTML('beforeend',`<li><i>${shown+1}번째</i>${chip(e.number)}</li>`);shown++;}
   $('title').textContent=shown<events.length?`로또 추첨기 · ${shown+1}번째 뽑는 중`:'로또 추첨기 · 추첨 끝';
   if(f>=total-1)res();else requestAnimationFrame(loop);};loop();});
 await wait(fast?100:900);
 $('resultList').innerHTML=data.numbers.map((x,j)=>`<li><i>${j+1}번째</i>${chip(x)}</li>`).join('');$('result').hidden=false;
}
$('again').onclick=play;$('close').onclick=()=>toParent({type:'close'});
try{
 toParent({type:'started',seed});
 while(!data){if(failed)throw new Error(failed);$('waitText').textContent=progress?`추첨 준비 중… (${progress}/${count})`:'추첨 준비 중…';await new Promise(r=>{waiters.push(r);setTimeout(r,400);});}
 const res={type:'result',seed,from,to,count,numbers:data.numbers};window.__result=res;toParent(res);
 if(input.hold){$('waitText').textContent='기록 저장 중…';const ok=await new Promise(r=>{const h=e=>{if(e.origin!==location.origin||!e.data||e.data.source!=='lotto-draw')return;if(e.data.type==='go'||e.data.type==='abort'){removeEventListener('message',h);r(e.data.type==='go');}};addEventListener('message',h);});if(!ok)throw new Error('기록을 저장하지 못해 추첨을 시작하지 않았습니다.');}
 $('wait').hidden=true;
 if(input.expect&&JSON.stringify(input.expect)!==JSON.stringify(data.numbers)){$('sub').textContent+=' · 이 기기의 계산이 기록과 다릅니다';}
 await play();window.__done=true;toParent({type:'finished'});
}catch(err){console.error(err.stack||err);$('wait').hidden=false;document.querySelector('.spin').style.display='none';$('waitText').textContent='문제가 생겼습니다: '+(err.message||err);toParent({type:'error',message:String(err.message||err)});}
