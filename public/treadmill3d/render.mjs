// 런닝머신 레이스 화면(three.js). 물리 결과(sim.mjs)를 실사 느낌으로 그립니다.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MACHINE,KINDS} from './sim.mjs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';

// 실사 자료(모두 무료·저작권 없음, Poly Haven / pmndrs): 실제 물건을 촬영한 3D 자료와 표면 사진, 실내 조명 사진
export async function loadAssets(base){
 const gl=new GLTFLoader(),tl=new THREE.TextureLoader(),A={};
 const model=async n=>(await gl.loadAsync(`${base}models/${n}/${n}.gltf`)).scene;
 const tex=async(p,srgb,rx=1,ry=1)=>{const x=await tl.loadAsync(base+p);x.wrapS=x.wrapT=THREE.RepeatWrapping;x.repeat.set(rx,ry);x.anisotropy=8;if(srgb)x.colorSpace=THREE.SRGBColorSpace;return x;};
 [A.baseball,A.lime,A.orangeMap,A.rubberN,A.rubberR,A.woodMap,A.woodN,A.woodR,A.terryN,A.env]=await Promise.all([
  model('baseball_01'),model('food_lime_01'),tex('models/food_lime_01/textures/orange_diff.jpg',true),
  tex('tex/rubberized_track/nor_gl.jpg',false,10,22),tex('tex/rubberized_track/Rough.jpg',false,10,22),
  tex('tex/wood_table_001/Diffuse.jpg',true,2,2),tex('tex/wood_table_001/nor_gl.jpg',false,2,2),tex('tex/wood_table_001/Rough.jpg',false,2,2),
  tex('tex/terry_cloth/nor_gl.jpg',false,2,2),new EXRLoader().loadAsync(base+'hdri/lobby.exr')]);
 // GPT 그림(코덱스 내장 그림 생성): 참치캔 상표, 수박 껍질, 휴지 무늬, 인형 뒷모습
 [A.canLabel,A.melon,A.tissue,A.tissueBump,A.dollBack]=await Promise.all([tex('gpt/can_label.jpg',true,2,1),tex('gpt/melon.jpg',true,2,1),tex('gpt/tissue.jpg',true,3,1.2),tex('gpt/tissue.jpg',false,3,1.2),tex('gpt/doll_back.png',true)]);
 A.melon.wrapS=THREE.MirroredRepeatWrapping;A.dollBack.wrapS=A.dollBack.wrapT=THREE.ClampToEdgeWrapping;
 A.orangeMap.flipY=false;A.orangeMap.wrapS=A.orangeMap.wrapT=THREE.ClampToEdgeWrapping;A.orangeMap.repeat.set(1,1);
 return A;
}
// 촬영 자료를 원하는 크기(가로·높이·세로, m)에 맞춰 가운데로 옮겨 넣음
function fit(obj,sx,sy,sz){const m=obj.clone(true);m.position.set(0,0,0);m.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(m),c=b.getCenter(new THREE.Vector3()),z=b.getSize(new THREE.Vector3());
 m.position.sub(c);const g=new THREE.Group();g.add(m);g.scale.set(sx/z.x,sy/z.y,sz/z.z);return g;}


const canvasTex=(w,h,draw,repeat)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;}return t;};
const noise=(g,w,h,base,amp,count,size)=>{g.fillStyle=base;g.fillRect(0,0,w,h);for(let i=0;i<count;i++){const v=Math.random()*amp-amp/2;g.fillStyle=`rgba(${v>0?255:0},${v>0?255:0},${v>0?255:0},${Math.abs(v)})`;g.beginPath();g.arc(Math.random()*w,Math.random()*h,Math.random()*size+0.5,0,7);g.fill();}};
const bumpOf=(w,h,count,size,amp=0.5)=>{const t=canvasTex(w,h,g=>noise(g,w,h,'#808080',amp,count,size));t.colorSpace=THREE.NoColorSpace;return t;};

export function materials(){
 const M={};
 M.orange=new THREE.MeshPhysicalMaterial({map:canvasTex(512,256,(g,w,h)=>{noise(g,w,h,'#f07a10',0.18,9000,1.4);g.fillStyle='#6b8f2a';g.beginPath();g.arc(w*0.5,3,6,0,7);g.fill();}),bumpMap:bumpOf(512,256,14000,1.6,0.9),bumpScale:0.6,roughness:0.55,clearcoat:0.35,clearcoatRoughness:0.5});
 M.baseball=new THREE.MeshStandardMaterial({map:canvasTex(1024,512,(g,w,h)=>{noise(g,w,h,'#f2ede1',0.06,4000,2);g.strokeStyle='#c22';g.lineWidth=3;for(const off of [0,Math.PI]){g.beginPath();for(let x=0;x<=w;x+=4){const u=x/w*Math.PI*2;const y=h/2+Math.sin(u*2+off)*h*0.28;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
   for(let x=0;x<=w;x+=14){const u=x/w*Math.PI*2;const y=h/2+Math.sin(u*2+off)*h*0.28;g.beginPath();g.moveTo(x-5,y-6);g.lineTo(x+5,y+6);g.stroke();}}}),roughness:0.7,bumpMap:bumpOf(512,256,6000,1.5,0.4),bumpScale:0.3});
 M.watermelon=new THREE.MeshPhysicalMaterial({map:canvasTex(1024,512,(g,w,h)=>{noise(g,w,h,'#3f7f2b',0.12,5000,3);for(let i=0;i<14;i++){const x0=i/14*w;g.fillStyle='#173d12';g.beginPath();for(let y=0;y<=h;y+=6){const x=x0+Math.sin(y*0.05+i)*10+Math.sin(y*0.13)*5;y?g.lineTo(x,y):g.moveTo(x,y);}for(let y=h;y>=0;y-=6){const x=x0+22+Math.sin(y*0.05+i)*10;g.lineTo(x,y);}g.fill();}}),roughness:0.35,clearcoat:0.6,clearcoatRoughness:0.25});
 M.canSide=new THREE.MeshStandardMaterial({map:canvasTex(1024,256,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#0d4f8b');gr.addColorStop(1,'#08345e');g.fillStyle=gr;g.fillRect(0,0,w,h);g.fillStyle='#f4c21a';g.fillRect(0,h*0.12,w,h*0.06);g.fillRect(0,h*0.82,w,h*0.06);g.fillStyle='#fff';g.font='bold 70px sans-serif';g.textAlign='center';for(const x of [w*0.25,w*0.75])g.fillText('TUNA',x,h*0.6);g.font='26px sans-serif';for(const x of [w*0.25,w*0.75])g.fillText('LIGHT IN OIL',x,h*0.75);}),metalness:0.3,roughness:0.35});
 M.canMetal=new THREE.MeshStandardMaterial({color:0xd8dadd,metalness:1,roughness:0.28});
 M.tissue=new THREE.MeshStandardMaterial({map:canvasTex(512,256,(g,w,h)=>{noise(g,w,h,'#f7f6f2',0.05,3000,2);g.strokeStyle='rgba(0,0,0,0.05)';for(let x=0;x<w;x+=16){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}}),bumpMap:bumpOf(256,128,4000,1.2,0.8),bumpScale:0.8,roughness:0.95});
 M.core=new THREE.MeshStandardMaterial({color:0x9c7a52,roughness:0.9,side:THREE.DoubleSide});
 M.tape=new THREE.MeshPhysicalMaterial({color:0xe8a7bb,roughness:0.15,transmission:0.35,thickness:0.01,clearcoat:1,clearcoatRoughness:0.1});
 M.tire=new THREE.MeshStandardMaterial({color:0x111111,roughness:0.8});
 M.rim=new THREE.MeshStandardMaterial({color:0xcccccc,metalness:1,roughness:0.25});
 M.glass=new THREE.MeshPhysicalMaterial({color:0x111a22,roughness:0.05,metalness:0.2,clearcoat:1});
 M.belt=new THREE.MeshStandardMaterial({map:canvasTex(256,512,(g,w,h)=>{noise(g,w,h,'#1b1d20',0.08,9000,1.1);g.fillStyle='rgba(255,255,255,0.035)';for(let y=0;y<h;y+=32)g.fillRect(0,y,w,1);},true),roughness:0.85,bumpMap:bumpOf(256,512,12000,1,0.9),bumpScale:0.5});
 M.belt.map.repeat.set(1,3);M.belt.bumpMap.wrapS=M.belt.bumpMap.wrapT=THREE.RepeatWrapping;M.belt.bumpMap.repeat.set(1,3);
 M.frame=new THREE.MeshPhysicalMaterial({color:0xe9ecef,roughness:0.35,clearcoat:0.6});
 M.table=new THREE.MeshStandardMaterial({map:canvasTex(1024,1024,(g,w,h)=>{g.fillStyle='#5b4a3f';g.fillRect(0,0,w,h);for(let i=0;i<220;i++){g.strokeStyle=`rgba(${30+Math.random()*40|0},${20+Math.random()*30|0},${15},${0.15+Math.random()*0.2})`;g.lineWidth=1+Math.random()*3;g.beginPath();const y=Math.random()*h;g.moveTo(0,y);for(let x=0;x<=w;x+=32)g.lineTo(x,y+Math.sin(x*0.01+i)*6);g.stroke();}},true),roughness:0.6});
 M.table.map.repeat.set(2,2);
 return M;
}

function rainbowRail(len){
 const tex=canvasTex(64,1024,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);['#ff2a6d','#ff8a00','#ffe600','#2bff88','#00c8ff','#7a5cff','#ff2a6d'].forEach((c,i,a)=>gr.addColorStop(i/(a.length-1),c));g.fillStyle=gr;g.fillRect(0,0,w,h);});
 tex.wrapT=THREE.RepeatWrapping;
 const m=new THREE.MeshStandardMaterial({color:0x111111,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:2.2,roughness:0.3});
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,len,24,1),m);mesh.rotation.x=Math.PI/2;return {mesh,tex};
}

function makeCar(k,color,M){
 const g=new THREE.Group();
 const paint=new THREE.MeshPhysicalMaterial({color,metalness:0.6,roughness:0.3,clearcoat:1,clearcoatRoughness:0.08});
 const body=new THREE.Mesh(new THREE.BoxGeometry(k.wid,k.hei*0.55,k.len,1,1,1),paint);body.position.y=-k.hei*0.18;g.add(body);
 const cabin=new THREE.Mesh(new THREE.BoxGeometry(k.wid*0.82,k.hei*0.45,k.len*(k.shape==='car'&&k.label==='레이싱카'?0.38:0.5)),M.glass);cabin.position.set(0,k.hei*0.3,k.len*0.06);g.add(cabin);
 const roof=new THREE.Mesh(new THREE.BoxGeometry(k.wid*0.8,k.hei*0.06,k.len*0.42),paint);roof.position.set(0,k.hei*0.54,k.len*0.06);if(k.label!=='레이싱카')g.add(roof);
 if(k.label==='레이싱카'){const wing=new THREE.Mesh(new THREE.BoxGeometry(k.wid*1.05,0.003,0.018),paint);wing.position.set(0,k.hei*0.5,k.len*0.44);g.add(wing);}
 for(const s of [-1,1]){const l=new THREE.Mesh(new THREE.BoxGeometry(0.008,0.004,0.002),new THREE.MeshStandardMaterial({color:0xffffee,emissive:0xffffcc,emissiveIntensity:1}));l.position.set(s*k.wid*0.32,-k.hei*0.15,-k.len/2-0.001);g.add(l);}
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return g;
}
export function makeWheel(M,r=MACHINE.wheelR,w=0.008){const g=new THREE.Group();const t=new THREE.Mesh(new THREE.CylinderGeometry(r,r,w,24),M.tire);t.rotation.z=Math.PI/2;const h=new THREE.Mesh(new THREE.CylinderGeometry(r*0.6,r*0.6,w+0.001,16),M.rim);h.rotation.z=Math.PI/2;g.add(t,h);t.castShadow=true;return g;}

// 솜인형 입체: 앞 그림의 윤곽을 그대로 따서 가장자리에서 멀수록 두껍게 부풀림(몸통은 통통, 볏·팔·꼬리·발은 가늘게 튀어나옴).
// 앞면에는 앞 그림, 뒷면에는 뒤에서 본 그림을 입힘
function makePlush(k,frontTex,backTex,fuzzN){
 const N=200,cv=document.createElement('canvas');cv.width=cv.height=N;const g=cv.getContext('2d',{willReadFrequently:true});
 const alphaOf=img=>{g.clearRect(0,0,N,N);g.drawImage(img,0,0,N,N);const d=g.getImageData(0,0,N,N).data,a=new Uint8Array(N*N);for(let i=0;i<N*N;i++)a[i]=d[i*4+3]>128?1:0;return a;};
 const box=a=>{let x0=N,x1=0,y0=N,y1=0;for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(a[y*N+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}return {x0:x0/N,x1:(x1+1)/N,y0:y0/N,y1:(y1+1)/N};};
 const fa=alphaOf(frontTex.image),fb=box(fa),bb=box(alphaOf(backTex.image));
 // 가장자리까지 거리(칸 수)
 const D=new Float32Array(N*N),BIG=1e6;for(let i=0;i<N*N;i++)D[i]=fa[i]?BIG:0;
 for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){const i=y*N+x;if(!fa[i])continue;D[i]=Math.min(D[i],D[i-1]+1,D[i-N]+1,D[i-N-1]+1.414,D[i-N+1]+1.414);}
 for(let y=N-2;y>0;y--)for(let x=N-2;x>0;x--){const i=y*N+x;if(!fa[i])continue;D[i]=Math.min(D[i],D[i+1]+1,D[i+N]+1,D[i+N+1]+1.414,D[i+N-1]+1.414);}
 const S=0.118/(fb.y1-fb.y0),px=S/N,T=0.034,L=0.013; // 인형 키 약 11.8cm, 몸통 반두께 3.4cm
 let Z=new Float32Array(N*N);for(let i=0;i<N*N;i++)Z[i]=fa[i]?T*(1-Math.exp(-D[i]*px/L)):0;
 for(let pass=0;pass<3;pass++){const Q=new Float32Array(N*N);for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){const i=y*N+x;if(!fa[i]||D[i]<1.5){Q[i]=Z[i];continue;}Q[i]=(Z[i]*4+Z[i-1]+Z[i+1]+Z[i-N]+Z[i+N])/8;}Z=Q;}
 const cx=(fb.x0+fb.x1)/2,yBottom=-(k.r+0.010);
 const build=front=>{const pos=[],uv=[],idx=[],id=new Int32Array(N*N).fill(-1);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!fa[i])continue;id[i]=pos.length/3;const u=(x+0.5)/N,v=(y+0.5)/N;
   pos.push((cx-u)*S,yBottom+(fb.y1-v)*S,front?-Z[i]:Z[i]);
   if(front)uv.push(u,1-v);else uv.push(bb.x0+(1-(u-fb.x0)/(fb.x1-fb.x0))*(bb.x1-bb.x0),1-(bb.y0+(v-fb.y0)/(fb.y1-fb.y0)*(bb.y1-bb.y0)));}
  for(let y=0;y<N-1;y++)for(let x=0;x<N-1;x++){const a=id[y*N+x],b=id[y*N+x+1],c=id[(y+1)*N+x],d=id[(y+1)*N+x+1];if(a<0||b<0||c<0||d<0)continue;
   if(front)idx.push(a,c,b,b,c,d);else idx.push(a,b,c,b,d,c);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();return geo;};
 // 뒤 그림의 빈 곳(윤곽이 살짝 다른 자리)은 솜 빨강으로 채움
 const bc=document.createElement('canvas');bc.width=bc.height=1024;const bg=bc.getContext('2d');bg.fillStyle='#b3221b';bg.fillRect(0,0,1024,1024);bg.drawImage(backTex.image,0,0,1024,1024);
 const backMap=new THREE.CanvasTexture(bc);backMap.colorSpace=THREE.SRGBColorSpace;backMap.anisotropy=8;
 const fuzz=t=>{if(!fuzzN)return null;const n=fuzzN.clone();n.repeat.set(5,5);n.needsUpdate=true;return n;};
 const mat=map=>new THREE.MeshPhysicalMaterial({map,roughness:1,sheen:0.5,sheenColor:new THREE.Color(0xffd0b0),sheenRoughness:0.8,normalMap:fuzz(),normalScale:new THREE.Vector2(0.7,0.7),side:THREE.DoubleSide});
 const grp=new THREE.Group();grp.add(new THREE.Mesh(build(true),mat(frontTex)),new THREE.Mesh(build(false),mat(backMap)));
 grp.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return grp;
}
function makeDoll(k,dollTex,backTex,fuzzN){
 if(backTex)return makePlush(k,dollTex,backTex,fuzzN);
 const g=new THREE.Group();
 const plush=new THREE.MeshPhysicalMaterial({color:0xc8201c,roughness:1,sheen:1,sheenColor:new THREE.Color(0xff8866),sheenRoughness:0.6});
 const body=new THREE.Mesh(new THREE.SphereGeometry(k.r,48,32),plush);body.scale.set(1,1.02,0.9);g.add(body);
 // 앞면: 보내 주신 캐릭터 그림을 둥근 앞면에 그대로 입힘(앞에서 정사영)
 const geo=new THREE.SphereGeometry(k.r*1.004,64,48,0,Math.PI,0,Math.PI);
 const pos=geo.attributes.position,uv=geo.attributes.uv;for(let i=0;i<pos.count;i++){uv.setXY(i,0.5+pos.getX(i)/(k.r*2.25),0.47+pos.getY(i)/(k.r*2.25));}
 const front=new THREE.Mesh(geo,new THREE.MeshPhysicalMaterial({map:dollTex,alphaTest:0.5,roughness:1,sheen:0.35,sheenColor:new THREE.Color(0xffccaa),sheenRoughness:0.8}));
 front.rotation.y=Math.PI;front.scale.copy(body.scale);g.add(front);
 if(backTex){const gb=new THREE.SphereGeometry(k.r*1.004,64,48,0,Math.PI,0,Math.PI),pb=gb.attributes.position,ub=gb.attributes.uv;
  for(let i=0;i<pb.count;i++)ub.setXY(i,0.5+pb.getX(i)/(k.r*2.25)*(k.backFlip??1),0.47+pb.getY(i)/(k.r*2.25));
  const back=new THREE.Mesh(gb,new THREE.MeshPhysicalMaterial({map:backTex,alphaTest:0.5,roughness:1,sheen:0.35,sheenColor:new THREE.Color(0xffccaa),sheenRoughness:0.8}));back.scale.copy(body.scale);g.add(back);}
 if(!backTex){
 const comb=new THREE.Mesh(new THREE.SphereGeometry(k.r*0.35,24,16),plush);comb.scale.set(0.5,1,1.2);comb.position.set(0,k.r*0.95,0);g.add(comb);
 const tail=new THREE.Mesh(new THREE.ConeGeometry(k.r*0.35,k.r*0.8,16),new THREE.MeshStandardMaterial({color:0x1a1414,roughness:1}));tail.position.set(0,k.r*0.2,k.r*0.95);tail.rotation.x=Math.PI*0.65;g.add(tail);
 }
 const foot=new THREE.MeshStandardMaterial({color:0xf29a1e,roughness:0.9});for(const s of [-1,1]){const f=new THREE.Mesh(new THREE.SphereGeometry(k.r*0.22,16,12),foot);f.scale.set(1,0.45,1.3);f.position.set(s*k.r*0.4,-k.r*0.95,-k.r*0.2);g.add(f);}
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return g;
}

export function makeObject(kind,M,dollTex,variant,A){
 const k=KINDS[kind];let mesh;
 if(A&&kind==='baseball')mesh=fit(A.baseball,2*k.r,2*k.r*k.ax,2*k.r);
 else if(A&&kind==='orange'){mesh=fit(A.lime,2*k.r,2*k.r*k.ax,2*k.r);mesh.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.map=A.orangeMap;o.material.roughness=0.5;}});}
 else if(A&&kind==='can'){mesh=new THREE.Group();
  const label=new THREE.MeshPhysicalMaterial({map:A.canLabel,roughness:0.42,clearcoat:0.25,clearcoatRoughness:0.4});
  const side=new THREE.Mesh(new THREE.CylinderGeometry(k.r*0.985,k.r*0.985,k.h*0.86,72,1,true),label);mesh.add(side);
  const rings=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#808080';g.fillRect(0,0,w,h);for(const [r,c] of [[118,'#a8a8a8'],[104,'#606060'],[84,'#9a9a9a'],[60,'#6a6a6a'],[30,'#909090']]){g.strokeStyle=c;g.lineWidth=5;g.beginPath();g.arc(w/2,h/2,r,0,7);g.stroke();}});rings.colorSpace=THREE.NoColorSpace;
  const metal=new THREE.MeshStandardMaterial({color:0xd9dbde,metalness:1,roughness:0.26,bumpMap:rings,bumpScale:1.2});
  for(const sgn of [-1,1]){const lid=new THREE.Mesh(new THREE.CylinderGeometry(k.r*0.97,k.r*0.97,k.h*0.05,72),[M.canMetal,metal,metal]);lid.position.y=sgn*k.h*0.455;mesh.add(lid);
   const rim=new THREE.Mesh(new THREE.TorusGeometry(k.r*0.985,k.h*0.035,12,72),M.canMetal);rim.rotation.x=Math.PI/2;rim.position.y=sgn*k.h*0.455;mesh.add(rim);}}
 else if(kind==='tape'){ // 한국에서 흔히 쓰는 누런(황색) 박스테이프: 반투명 누런 테이프가 겹겹이 감긴 옆면 + 두꺼운 종이 심
  mesh=new THREE.Group();
  const film=new THREE.MeshPhysicalMaterial({color:0xa87424,roughness:0.16,clearcoat:1,clearcoatRoughness:0.08,sheen:0.3,sheenColor:new THREE.Color(0xffe2a0)});
  const outer=new THREE.Mesh(new THREE.CylinderGeometry(k.r,k.r,k.h,72,1,true),film);mesh.add(outer);
  const rings=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#a8772a';g.fillRect(0,0,w,h);const R=w/2,ri=R*k.ri/k.r;for(let r=ri;r<R;r+=1.6){g.strokeStyle=`rgba(${70+Math.random()*60|0},${45+Math.random()*30|0},10,${0.25+Math.random()*0.3})`;g.lineWidth=0.8;g.beginPath();g.arc(R,R,r,0,7);g.stroke();}});
  const sideMat=new THREE.MeshPhysicalMaterial({map:rings,roughness:0.35,clearcoat:0.5,side:THREE.DoubleSide});
  const board=new THREE.MeshStandardMaterial({color:0x9b7a55,roughness:0.95,side:THREE.DoubleSide}),coreR=k.ri,coreIn=k.ri-0.004;
  for(const sgn of [-1,1]){const side=new THREE.Mesh(new THREE.RingGeometry(coreR,k.r,72),sideMat);side.rotation.x=-sgn*Math.PI/2;side.position.y=sgn*k.h/2;mesh.add(side);
   const lip=new THREE.Mesh(new THREE.RingGeometry(coreIn,coreR,72),board);lip.rotation.x=-sgn*Math.PI/2;lip.position.y=sgn*k.h/2;mesh.add(lip);}
  mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(coreIn,coreIn,k.h,72,1,true),board));}
 else if(k.shape==='ball'){mesh=new THREE.Mesh(new THREE.SphereGeometry(k.r,48,32),M[kind]);mesh.scale.set(1,k.ax,1);}
 else if(kind==='can'){mesh=new THREE.Group();mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(k.r,k.r,k.h*0.86,48,1,true),M.canSide));for(const s of [-1,1]){const lid=new THREE.Mesh(new THREE.CylinderGeometry(k.r*1.01,k.r*1.01,k.h*0.07,48),M.canMetal);lid.position.y=s*k.h*0.465;mesh.add(lid);}}
 else if(k.shape==='cyl'){mesh=new THREE.Group();const prof=[[k.ri,-k.h/2],[k.r,-k.h/2],[k.r,k.h/2],[k.ri,k.h/2],[k.ri,-k.h/2]].map(([x,y])=>new THREE.Vector2(x,y));
  mesh.add(new THREE.Mesh(new THREE.LatheGeometry(prof,64),kind==='tissue'?M.tissue:M.tape));
  const core=new THREE.Mesh(new THREE.CylinderGeometry(k.ri,k.ri,k.h*1.001,48,1,true),M.core);mesh.add(core);if(kind==='tape'){const side=new THREE.Mesh(new THREE.RingGeometry(k.ri,k.r,64),new THREE.MeshStandardMaterial({color:0xd98aa5,roughness:0.5,side:THREE.DoubleSide}));for(const sgn of [-1,1]){const r=side.clone();r.rotation.x=Math.PI/2;r.position.y=sgn*k.h/2*1.002;mesh.add(r);}}}
 else if(k.shape==='car'){const colors=[0xd61f26,0x1f5fd6,0xf2c21b,0x1fae5b,0xffffff,0x222222,0xff7a00];mesh=makeCar(k,colors[variant%colors.length],M);}
 else if(k.shape==='doll')mesh=makeDoll(k,dollTex,A&&A.dollBack,A&&A.terryN);
 mesh.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 return mesh;
}

function label(text,us){
 const c=document.createElement('canvas'),g=c.getContext('2d');g.font='bold 44px sans-serif';const w=Math.ceil(g.measureText(text).width)+40;c.width=w;c.height=72;
 g.font='bold 44px sans-serif';g.fillStyle=us?'rgba(214,87,138,0.92)':'rgba(0,0,0,0.78)';g.beginPath();g.roundRect(0,0,w,72,36);g.fill();g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';g.fillText(text,w/2,38);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true,sizeAttenuation:false}));s.renderOrder=10;s.scale.set(0.026*w/72,0.026,1);return s;
}

// 휜 벨트의 높이(m)와 기울기(rad): 물리는 평평한 좌표에서 계산하고, 화면에서만 곡면으로 올려 그림
export function curve(m,z){const zc=Math.max(-m.hoodR,Math.min(m.len+0.1,z));if(m.tiltFarDeg==null)return {h:Math.tan(m.tiltDeg*Math.PI/180)*zc,a:m.tiltDeg*Math.PI/180};
 const k=Math.PI/180,z1=Math.max(0,Math.min(m.len,zc)),a=(m.tiltDeg+(m.tiltFarDeg-m.tiltDeg)*z1/m.len)*k;
 let h=(m.tiltDeg*z1+(m.tiltFarDeg-m.tiltDeg)*z1*z1/(2*m.len))*k;if(zc<0)h+=m.tiltDeg*k*zc;if(zc>m.len)h+=m.tiltFarDeg*k*(zc-m.len);return {h,a};}

export async function createView(container,race,names,opts={}){
 const m=opts.machine||MACHINE,W=container.clientWidth,H=container.clientHeight;
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,opts.low?1:2));renderer.setSize(W,H);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
 container.appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x2a2724);
 const pm=new THREE.PMREMGenerator(renderer);scene.environment=pm.fromScene(new RoomEnvironment(),0.04).texture;scene.environmentIntensity=0.55;const setEnv=A=>{A.env.mapping=THREE.EquirectangularReflectionMapping;scene.environment=pm.fromEquirectangular(A.env).texture;scene.environmentIntensity=0.85;};
 const M=materials();
 const A=opts.plain?null:await loadAssets(opts.assetBase||'assets/');
 if(A){
  setEnv(A);
  M.belt.normalMap=A.rubberN;M.belt.roughnessMap=A.rubberR;M.belt.roughness=1;M.belt.bumpMap=null;M.belt.normalScale.set(0.6,0.6);
  M.table.map=A.woodMap;M.table.normalMap=A.woodN;M.table.roughnessMap=A.woodR;M.table.roughness=1;M.table.color.set(0xb9aea6);
  
  M.watermelon.map=A.melon;M.watermelon.clearcoat=0.45;M.watermelon.clearcoatRoughness=0.35;M.watermelon.roughness=0.5;
  M.tissue.map=A.tissue;M.tissue.normalMap=null;M.tissue.bumpMap=A.tissueBump;M.tissue.bumpScale=1.6;M.tissue.color.set(0xffffff);
 }
 const dollTex=await new THREE.TextureLoader().loadAsync(opts.dollUrl||'assets/doll.png');dollTex.colorSpace=THREE.SRGBColorSpace;dollTex.anisotropy=8;
 const key=new THREE.DirectionalLight(0xfff1e0,2.4);key.position.set(0.7,2.4,0.1);key.target.position.set(0,0,0.8);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
 Object.assign(key.shadow.camera,{left:-1.2,right:1.2,top:1.4,bottom:-1.4,near:0.5,far:5});key.shadow.bias=-0.0004;scene.add(key,key.target);
 scene.add(new THREE.HemisphereLight(0xdde6ff,0x3a2c22,0.35));
 const {len,width,hoodR}=m,loop=race.loop;
 const table=new THREE.Mesh(new THREE.PlaneGeometry(6,6),M.table);table.rotation.x=-Math.PI/2;table.position.set(0,-0.09,len/2);table.receiveShadow=true;scene.add(table);
 // 벨트: 휜 면(세로 띠 무늬가 벨트와 함께 흐름)
 const bg=new THREE.PlaneGeometry(width,len+0.04,m.strips,48);bg.rotateX(-Math.PI/2);bg.translate(0,0,len/2);
 {const p=bg.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,curve(m,p.getZ(i)).h+0.0005);bg.computeVertexNormals();}
 M.belt.map.repeat.set(m.strips/2,3);if(M.belt.bumpMap)M.belt.bumpMap.repeat.set(m.strips/2,3);
 const belt=new THREE.Mesh(bg,M.belt);belt.receiveShadow=true;scene.add(belt);
 const side=new THREE.Shape();side.moveTo(0,-0.08);for(let i=0;i<=40;i++){const z=len*i/40;side.lineTo(z,curve(m,z).h);}side.lineTo(len,-0.08);side.lineTo(0,-0.08);
 const deck=new THREE.Mesh(new THREE.ExtrudeGeometry(side,{depth:width+0.08,bevelEnabled:false}),M.frame);deck.rotation.y=-Math.PI/2;deck.position.set((width+0.08)/2,-0.002,0);deck.receiveShadow=true;deck.castShadow=true;scene.add(deck);
 const hoodMat=new THREE.MeshPhysicalMaterial({color:0x23262b,roughness:0.45,clearcoat:0.5});
 const hood=new THREE.Mesh(new THREE.CylinderGeometry(hoodR,hoodR,width+0.1,64,1,false,0,Math.PI),hoodMat);hood.rotation.z=Math.PI/2;hood.position.set(0,0,-hoodR);hood.castShadow=true;hood.receiveShadow=true;scene.add(hood);
 const hoodBase=new THREE.Mesh(new THREE.BoxGeometry(width+0.1,0.09,hoodR*2),hoodMat);hoodBase.position.set(0,-0.045,-hoodR);scene.add(hoodBase);
 const strip=new THREE.Mesh(new THREE.BoxGeometry(width,0.004,0.008),new THREE.MeshStandardMaterial({color:0x003344,emissive:0x00d8ff,emissiveIntensity:2.5}));strip.position.set(0,0.004,0.006);scene.add(strip);
 const rails=[];for(const sgn of [-1,1]){
  const pts=[];for(let i=0;i<=30;i++){const z=-0.02+(len+0.06)*i/30;pts.push(new THREE.Vector3(sgn*(width/2+0.022),curve(m,z).h+0.05,z));}
  const tex=canvasTex(1024,64,(g,w,h)=>{const gr=g.createLinearGradient(0,0,w,0);['#ff2a6d','#ff8a00','#ffe600','#2bff88','#00c8ff','#7a5cff','#ff2a6d'].forEach((c,i,a)=>gr.addColorStop(i/(a.length-1),c));g.fillStyle=gr;g.fillRect(0,0,w,h);});tex.wrapS=THREE.RepeatWrapping;
  const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),40,0.016,16),new THREE.MeshStandardMaterial({color:0x111111,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:2.2,roughness:0.3}));scene.add(tube);rails.push({tex});
  const wallShape=new THREE.Shape();wallShape.moveTo(-0.02,curve(m,-0.02).h-0.02);for(let i=0;i<=30;i++){const z=-0.02+(len+0.06)*i/30;wallShape.lineTo(z,curve(m,z).h+0.045);}wallShape.lineTo(len+0.04,-0.08);wallShape.lineTo(-0.02,-0.08);
  const wall=new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape,{depth:0.012,bevelEnabled:false}),M.frame);wall.rotation.y=-Math.PI/2;wall.position.set(sgn*(width/2+0.008)+0.006,0,0);wall.receiveShadow=true;scene.add(wall);
  const glow=new THREE.PointLight(sgn<0?0x33aaff:0xff3388,0.35,0.9,2);glow.position.set(sgn*(width/2),0.12,len*0.4);scene.add(glow);}
 // 이음매(턱): 벨트 좌표의 조각들을 매 장면 흐르게 그림
 renderer.localClippingEnabled=true;const clip=[new THREE.Plane(new THREE.Vector3(0,0,-1),len),new THREE.Plane(new THREE.Vector3(0,0,1),0)];
 const seamMat=new THREE.MeshStandardMaterial({color:0x2c2f33,roughness:0.8,clippingPlanes:clip}),barMat=new THREE.MeshStandardMaterial({color:0xffc400,roughness:0.55,emissive:0x332200,clippingPlanes:clip});
 const up=new THREE.Vector3(0,1,0),dir=new THREE.Vector3();
 const seamMeshes=race.seams.map(g=>{const y1=g.h-g.r,y2=(g.h2??g.h)-g.r,dx=g.x2-g.x1,dy=y2-y1,dz=g.z2-g.z1,L=Math.hypot(dx,dy,dz);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(g.r,g.r,L,20,1),g.kind==='cross'?barMat:seamMat);mesh.quaternion.setFromUnitVectors(up,dir.set(dx/L,dy/L,dz/L));
  mesh.userData={x:(g.x1+g.x2)/2,y:(y1+y2)/2,z:(g.z1+g.z2)/2,q:mesh.quaternion.clone(),half:Math.abs(dz)/2+g.r};mesh.receiveShadow=true;if(g.kind==='cross')mesh.castShadow=true;scene.add(mesh);return mesh;});
 // 벨트 면 아래로 내려간 부분은 가려지도록 벨트를 먼저 그림(깊이로 자연히 가려짐)
 const items=race.entries.map((e,i)=>{const obj=makeObject(e.kind,M,dollTex,i,A);scene.add(obj);
  const wheels=(e.wheels||[]).map(()=>{const w=makeWheel(M,m.wheelR);scene.add(w);return w;});
  const tag=label(names[i]||('#'+(i+1)),i===opts.highlight);scene.add(tag);return {e,obj,wheels,tag};});
 const camera=new THREE.PerspectiveCamera(opts.fov||(W<H?46:30),W/H,0.01,30);if(opts.cam==='dollside'){camera.fov=30;camera.updateProjectionMatrix();camera.position.set(0.02,0.22,-0.22);camera.lookAt(0.35,0.05,0.10);}else if(opts.cam==='doll'||opts.cam==='dollback'){camera.fov=30;camera.updateProjectionMatrix();camera.position.set(0.35,0.34,opts.cam==='doll'?-0.38:0.58);camera.lookAt(0.35,0.05,0.10);}else if(opts.cam==='close'){camera.fov=38;camera.updateProjectionMatrix();camera.position.set(0.16,0.42,-0.42);camera.lookAt(0.0,0.03,0.34);}else if(m.len>1.7){camera.position.set(0,2.0,-0.9);camera.lookAt(0,0,0.95);}else{camera.position.set(0,2.2,-0.55);camera.lookAt(0,0,0.72);}
 const qs=new THREE.Quaternion(),xAxis=new THREE.Vector3(1,0,0);
 const place=(o,x,y,z,qx,qy,qz,qw)=>{const c=curve(m,z);qs.setFromAxisAngle(xAxis,-c.a);o.position.set(x,c.h+y*Math.cos(c.a),z-y*Math.sin(c.a));o.quaternion.set(qx,qy,qz,qw).premultiply(qs);};
 function update(snap,beltPos){
  let o=0;for(const it of items){place(it.obj,snap[o],snap[o+1],snap[o+2],snap[o+3],snap[o+4],snap[o+5],snap[o+6]);o+=7;
   for(const w of it.wheels){place(w,snap[o],snap[o+1],snap[o+2],snap[o+3],snap[o+4],snap[o+5],snap[o+6]);o+=7;}
   const k=KINDS[it.e.kind],hgt=k.r?k.r*Math.max(1,k.ax||1):k.hei;const out=it.e.outAt!=null&&snap[o-7*(1+it.wheels.length)+1]<-0.04;
   it.tag.position.set(it.obj.position.x,it.obj.position.y+Math.max(0.07,hgt*1.5),it.obj.position.z);it.tag.visible=!out;it.obj.visible=snap[o-7*(1+it.wheels.length)+1]>-0.3;for(const w of it.wheels)w.visible=it.obj.visible;}
  const z0=beltPos%loop;
  for(const sm of seamMeshes){const u=sm.userData;let z=u.z+z0;if(z-u.half>len)z-=loop;const vis=z+u.half>0&&z-u.half<len;sm.visible=vis;if(vis){const c=curve(m,z);qs.setFromAxisAngle(xAxis,-c.a);sm.position.set(u.x,c.h+u.y,z);sm.quaternion.copy(u.q).premultiply(qs);}}
  M.belt.map.offset.y=beltPos/(len+0.04)*3;if(M.belt.bumpMap)M.belt.bumpMap.offset.y=M.belt.map.offset.y;if(M.belt.normalMap){M.belt.normalMap.offset.y=M.belt.roughnessMap.offset.y=beltPos/(len+0.04)*22;}for(const r of rails)r.tex.offset.x+=0.002;
  renderer.render(scene,camera);
 }
 function resize(){const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
 return {update,resize,renderer,camera,scene};
}
