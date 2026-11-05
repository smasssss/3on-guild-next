/* eslint-disable @typescript-eslint/no-require-imports -- Existing VM harness style. */
// Special-character nicknames (어⃢서) are framed for display only; the text stays identical.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={module:{exports:{}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/ops-names.js','utf8'),ctx);
const {splitEnclosed}=ctx.module.exports;
const parts=JSON.parse(JSON.stringify(splitEnclosed('VIP 어⃢서 · 일⃢리')));
assert.deepEqual(parts,[{text:'VIP '},{base:'어',mark:'⃢',next:'서',shape:'screen'},{text:' · '},{base:'일',mark:'⃢',next:'리',shape:'screen'}]);
assert.equal(parts.map(p=>p.text??(p.base+p.mark+p.next)).join(''),'VIP 어⃢서 · 일⃢리','display split keeps every character');
assert.deepEqual(JSON.parse(JSON.stringify(splitEnclosed('꧁ᬊ두리ᬊ꧂'))),[{text:'꧁ᬊ두리ᬊ꧂'}],'other decorative names untouched');
for(const name of ['어⃢서','으⃢나','일⃢리','용⃢팝','나⃢나','링⃢ɞ','워⃢워','두⃢콩','죠⃢팝','가⃢라'])assert.equal(splitEnclosed(name).length,1,name);
assert(fs.readFileSync('public/legacy.html','utf8').includes('<script src="/ops-names.js" defer></script>'));
assert(fs.readFileSync('public/growth-auto.js','utf8').includes("n.src='/ops-names.js'"));
console.log('PASS: enclosed nicknames are framed for display only, text unchanged, all 10 Production names recognised');
