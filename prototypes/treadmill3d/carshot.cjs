// 자동차가 잘 보이는 판을 가까이서 찍어 봅니다(개발용).
const {chromium}=require('playwright');(async()=>{
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:540,height:960},deviceScaleFactor:2});p.on('pageerror',e=>console.log('PAGEERROR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,300))});
await p.goto('http://127.0.0.1:8780/prototypes/treadmill3d/carshot.html',{waitUntil:'load'});await p.waitForFunction(()=>window.__drawn,{timeout:120000});await p.waitForTimeout(500);
await p.screenshot({path:process.argv[2]||'carshot.jpg',type:'jpeg',quality:88});await b.close();})();
