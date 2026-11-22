const {chromium}=require('playwright');const fs=require('fs');(async()=>{const [seed,...fs_]=process.argv.slice(2);const M=fs.readFileSync('chosen.txt','utf8').trim();
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:540,height:960},deviceScaleFactor:Number(process.env.DSF||1)});p.on('pageerror',e=>console.log('PAGEERROR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,300))});
await p.goto('http://127.0.0.1:8777/index.html?f=0&seed='+seed+'&m='+encodeURIComponent(M)+(process.env.EXTRA||''),{waitUntil:'load'});await p.waitForFunction(()=>window.__drawn,{timeout:180000});
console.log(JSON.stringify(await p.evaluate(()=>({frames:window.__frames,info:window.__info}))));
for(const f of fs_){await p.evaluate(x=>window.__seek(x),Number(f));await p.screenshot({path:'s_'+f+'.jpg',type:'jpeg',quality:85});}
await b.close();})();
