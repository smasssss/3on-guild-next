const {chromium}=require('playwright');const fs=require('fs');(async()=>{const seed=process.argv[2];const M=fs.readFileSync('chosen.txt','utf8').trim();
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:540,height:960},deviceScaleFactor:1});p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:8777/index.html?f=0&seed='+seed+'&m='+encodeURIComponent(M),{waitUntil:'load'});await p.waitForFunction(()=>window.__drawn,{timeout:180000});
const n=await p.evaluate(()=>window.__frames);fs.rmSync('frames',{recursive:true,force:true});fs.mkdirSync('frames');let k=0;const t0=Date.now();
for(let f=0;f<n;f+=2){await p.evaluate(x=>window.__seek(x),f);await p.screenshot({path:'frames/f'+String(k++).padStart(4,'0')+'.jpg',type:'jpeg',quality:85});}
console.log('frames',k,'sec',((Date.now()-t0)/1000).toFixed(0));await b.close();})();
