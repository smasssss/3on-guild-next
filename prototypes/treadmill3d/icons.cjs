const {chromium}=require('playwright');const fs=require('fs');(async()=>{
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:400,height:400}});
p.on('pageerror',e=>console.log('PAGEERROR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,200))});
await p.goto('http://127.0.0.1:8778/icons.html');await p.waitForFunction(()=>window.__icons,{timeout:120000});const o=await p.evaluate(()=>window.__icons);
fs.mkdirSync('assets/icons',{recursive:true});for(const [k,v] of Object.entries(o))fs.writeFileSync('assets/icons/'+k+'.png',Buffer.from(v.split(',')[1],'base64'));console.log(Object.keys(o).join(' '));await b.close();})();
