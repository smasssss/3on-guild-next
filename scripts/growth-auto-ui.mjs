// Enhance the built copy while leaving the established operation functions exact.
import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
const path=process.argv[2]||'dist/client/legacy.html';let source=readFileSync(path,'utf8');
const before="frame.srcdoc=new TextDecoder('utf-8').decode(bytes);";
if(!source.includes(before))throw Error('Expected existing growth frame loader is missing');
source=source.replace(before,"frame.srcdoc=new TextDecoder('utf-8').decode(bytes).replace('</head>','<link rel=\"stylesheet\" href=\"/ops-theme-growth.css?v=11\"><script>(()=>{const d=document.documentElement;d.classList.add(\\\"ops-wait\\\");const done=()=>d.classList.remove(\\\"ops-wait\\\");setTimeout(done,1000);if(document.fonts)document.fonts.load(\\\"16px Cafe24Syongsyong\\\",\\\"가\\\").then(done,done);else done();})()<'+'/script></head>').replace('</body>','<script src=\"/growth-auto.js?v=11\" defer><'+'/script></body>');");
source=source.replace('function injectGrowthUpdateLink()',"window.addEventListener('message',async e=>{if((e.source===window||e.source===document.getElementById('growthFrame').contentWindow)&&e.data?.kind==='3on-growth-auto-refresh'){await loadProductionGrowth();initGrowthFrame();}});\nfunction injectGrowthUpdateLink()");
source=source.replace('AI 처리 결과를 먼저 확인하고 이상한 닉네임·등급·레벨·전투력만 수정한 뒤 최종 반영합니다. 기존 member 연결과 신규 등록은 자동 처리됩니다.','자동 수집 상태·수집 오류·동일인 연결을 관리하고, 장애 시 수동 JSON 자료를 검토하여 반영합니다.');
// VIP renderer now owns permanent + temporary + weekly conditions. Fail closed if
// an old renderer accidentally reaches the artifact; never inject an obsolete filter.
if(!source.includes('function renderVipResults(){renderCarriageVipResults();}')||source.split('src="/carriage-vip.js"').length!==2)throw Error('Expected one weekly VIP integration');
const carriageEnd=source.lastIndexOf('</body>');
if(carriageEnd<0)throw Error('Existing carriage page is missing its body');
source=source.slice(0,carriageEnd)+'<script src="/carriage-date.js" defer><'+'/script>'+source.slice(carriageEnd);
writeFileSync(path,source);
// The font is referenced only with a version query (?v=N), so phones may keep it for a year without asking again.
const headers=join(dirname(path),'_headers');
const rule='\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n';
if(existsSync(headers)&&!readFileSync(headers,'utf8').includes('/fonts/*'))appendFileSync(headers,rule);
