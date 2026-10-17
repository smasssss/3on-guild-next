// Enhance the built copy while leaving the established operation functions exact.
import {readFileSync,writeFileSync} from 'node:fs';
const path=process.argv[2]||'dist/client/legacy.html';let source=readFileSync(path,'utf8');
const before="frame.srcdoc=new TextDecoder('utf-8').decode(bytes);";
if(!source.includes(before))throw Error('Expected existing growth frame loader is missing');
source=source.replace(before,"frame.srcdoc=new TextDecoder('utf-8').decode(bytes).replace('</body>','<script src=\"/growth-auto.js\" defer><'+'/script></body>');");
source=source.replace('function injectGrowthUpdateLink()',"window.addEventListener('message',async e=>{if(e.source===document.getElementById('growthFrame').contentWindow&&e.data?.kind==='3on-growth-auto-refresh'){await loadProductionGrowth();initGrowthFrame();}});\nfunction injectGrowthUpdateLink()");
source=source.replace('AI 처리 결과를 먼저 확인하고 이상한 닉네임·등급·레벨·전투력만 수정한 뒤 최종 반영합니다. 기존 member 연결과 신규 등록은 자동 처리됩니다.','자동 수집 상태·수집 오류·동일인 연결을 관리하고, 장애 시 수동 JSON 자료를 검토하여 반영합니다.');
writeFileSync(path,source);
