// node playshot.cjs <seed> <인원> <빠르게 0|1> <찍을 시각(초)…>
const {chromium}=require('playwright');(async()=>{const [seed,n,fast,...times]=process.argv.slice(2);
const names=['니니','어서³ᴼᴺ','아일리³ᴼᴺ','용팝','두리³ᴼᴺ','제시³ᴼᴺ','핵불잙³ᴼᴺ','키위','HUK333','공 주','Надя696','얼음많이','waweloo','댕댕댕이','야옹이대장'].slice(0,Number(n));
const hash=encodeURIComponent(JSON.stringify({seed,fast:fast==='1',racers:names.map((name,i)=>({id:'m'+i,name}))}));
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:405,height:720},deviceScaleFactor:Number(process.env.DSF||1)});p.on('pageerror',e=>console.log('PAGEERROR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,300))});
const t0=Date.now();await p.goto('http://127.0.0.1:8780/public/treadmill3d/play.html#'+hash,{waitUntil:'load'});
for(const t of times){const ms=Number(t)*1000-(Date.now()-t0);if(ms>0)await p.waitForTimeout(ms);await p.screenshot({path:'ps_'+t+'.jpg',type:'jpeg',quality:85});console.log('shot',t);}
if(process.env.WAITDONE){await p.waitForFunction(()=>window.__done,{timeout:300000});await p.screenshot({path:'ps_done.jpg',type:'jpeg',quality:85});console.log(JSON.stringify(await p.evaluate(()=>window.__result)));}
await b.close();})();
