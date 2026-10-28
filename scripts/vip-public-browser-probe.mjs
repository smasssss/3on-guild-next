import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const temp=process.env.RUNNER_TEMP;
const {origin}=JSON.parse(readFileSync(join(temp,'3on-probe-origin.json'),'utf8'));
const cli=join(temp,'3on-pw/node_modules/.bin/playwright-cli');
const config=join(temp,'3on-pw-config.json');
writeFileSync(config,JSON.stringify({browser:{browserName:'chromium',isolated:true,launchOptions:{executablePath:process.env.CHROME_BIN,headless:true}}}));
const code=join(temp,'3on-probe-code.js');
writeFileSync(code,'async (page) => {const response=await page.goto('+JSON.stringify(origin+'/api/session')+',{waitUntil:"domcontentloaded",timeout:30000});const status=response.status();let good=false;try{const body=JSON.parse(await response.text());good=status===200&&body.admin===false;}catch{}return {normalBrowserSuccess:good,status};}');
const run=(args)=>execFileSync(cli,['-s=3on-public-probe',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
let good=false;
try {
 run(['open','about:blank','--config',config]);
 const output=run(['run-code','--filename',code,'--raw']);
 const match=output.match(/"normalBrowserSuccess"\s*:\s*(true|false)/);
 good=match?.[1]==='true';
} catch {}
finally {try{run(['close']);}catch{}}
console.log('Standard Playwright browser public connection: '+(good?'PASS':'FAIL'));
process.exitCode=good?0:1;
