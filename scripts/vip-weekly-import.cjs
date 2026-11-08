/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS runner that reuses the site's own TypeScript code. */
// Weekly guild-war points from the in-game ranking screenshots (user-approved 2026-11-08).
// Uses the exact same rules as 관리설정 > 길드전 주간 포인트 (lib/vip-weekly.ts and the
// /api/carriage/vip POST route): exact member IDs and nicknames are taken from the database
// by game ID, prepareWeekly validates, and the save keeps the automatic backup, the revision
// guard and the roster guards. With "apply": false it only checks and prints counts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');

function loader(env){
 const ts=require('typescript'),cache=new Map();
 return function load(file){file=path.resolve(root,file);if(cache.has(file))return cache.get(file).exports;
  const mod={exports:{}};cache.set(file,mod);
  const requireLocal=name=>name==='cloudflare:workers'?{env}:name.startsWith('.')?load(path.resolve(path.dirname(file),name)+(path.extname(name)?'':'.ts')):require(name);
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',source)(requireLocal,mod,mod.exports);return mod.exports;};
}

// Cloudflare D1 over its HTTP API, shaped like the Workers binding the site code expects.
function remoteD1(account,database,token){
 const call=async body=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database+'/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json();if(!j.success)throw Error('D1 '+r.status+' '+JSON.stringify(j.errors||[]).slice(0,300));return j.result;};
 const shape=r=>({results:r.results||[],meta:r.meta||{}});
 return {
  prepare(sql){let params=[];const s={sql,get params(){return params},bind(...v){params=v;return s},
   async first(){return (await call({sql,params}))[0].results?.[0]??null},async all(){return shape((await call({sql,params}))[0])},async run(){return shape((await call({sql,params}))[0])}};return s;},
  async batch(list){return (await call({batch:list.map(s=>({sql:s.sql,params:s.params}))})).map(shape);},
 };
}

async function importWeekly(db,input,{now=Date.now(),actor='guild-war-import',log=console.log}={}){
 const load=loader({DB:db}),v=load('lib/vip-weekly.ts');
 const current=await v.readWeekly(db),roster=await v.readRoster(db),score=await v.readScoreRoster(db,roster.members);
 const byGame=new Map(score.map(m=>[m.gameId,m])),missing=[],seen=new Set();
 const rows=input.rows.map(r=>{const m=byGame.get(String(r.gameId));if(!m){missing.push(r.name||r.gameId);return null;}
  if(seen.has(m.memberId))throw Error('같은 회원이 두 번 들어 있습니다: '+(r.name||r.gameId));seen.add(m.memberId);
  return {memberId:m.memberId,nickname:m.nickname,points:r.points};}).filter(Boolean);
 const currentIds=new Set(roster.members.filter(m=>m.current).map(m=>m.memberId));
 const notListed=roster.members.filter(m=>m.current&&!seen.has(m.memberId)).map(m=>m.nickname);
 const notCurrent=rows.filter(r=>!currentIds.has(r.memberId)).map(r=>r.nickname);
 log('Screenshot rows '+input.rows.length+' · matched '+rows.length+' · not in database '+missing.length+(missing.length?' ('+missing.join(', ')+')':''));
 log('Current roster '+currentIds.size+' · not in screenshots '+notListed.length+(notListed.length?' ('+notListed.join(', ')+')':''));
 log('Matched but not on current roster '+notCurrent.length+(notCurrent.length?' ('+notCurrent.join(', ')+')':''));
 if(missing.length)throw Error('사진의 일부 회원을 명단에서 찾지 못했습니다.');
 const snapshot={providedOn:input.providedOn,appliesOn:input.appliesOn,coverage:'partial',rows};
 const next=v.prepareWeekly(snapshot,roster.members,now,v.weeklyView(current.data,now).active?.appliesOn,score);
 log('Validated with the site rules: '+next.rows.length+' rows · provided '+next.providedOn+' · week '+next.appliesOn+' · VIP from '+v.effectiveOn(next));
 if([current.data.current,current.data.pending].some(w=>v.sameSnapshot(w,next))){log('Already saved: nothing to do');return {status:'duplicate'};}
 if(input.apply!==true){log('CHECK ONLY: nothing was written');return {status:'checked'};}
 const data=v.replaceWeekly(current.data,next,now),stamp=new Date(now).toISOString(),mutation=crypto.randomUUID();
 const selected=roster.members.filter(m=>m.current&&next.rows.some(r=>r.memberId===m.memberId));
 const references=score.filter(m=>next.rows.some(r=>r.memberId===m.memberId));
 const results=await db.batch([
  db.prepare('INSERT INTO documents(kind,revision,payload,updated_at,actor,last_mutation) VALUES(?,0,?,?,?,?) ON CONFLICT(kind) DO NOTHING').bind(v.VIP_KIND,JSON.stringify(v.emptyWeekly()),stamp,actor,''),
  db.prepare('INSERT INTO backups(mutation,kind,revision,payload,saved_at,actor) SELECT ?,kind,revision,payload,?,? FROM documents WHERE kind=? AND revision=?').bind(mutation,stamp,actor,v.VIP_KIND,current.revision),
  db.prepare(`UPDATE documents SET payload=CASE WHEN (SELECT snapshot_id FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 1) IS ? AND (SELECT value FROM growth_meta WHERE key='identity_revision') IS ? AND ${v.ROSTER_GUARD_SQL} AND ${v.SCORE_REFERENCE_GUARD_SQL} THEN ? ELSE NULL END,revision=revision+1,updated_at=?,actor=?,last_mutation=? WHERE kind=? AND revision=? AND EXISTS(SELECT 1 FROM backups WHERE mutation=? AND kind=? AND revision=?)`).bind(roster.snapshotId,roster.identityRevision,JSON.stringify(selected),roster.snapshotId,selected.length,JSON.stringify(references),references.length,JSON.stringify(data),stamp,actor,mutation,v.VIP_KIND,current.revision,mutation,v.VIP_KIND,current.revision),
  db.prepare('DELETE FROM backups WHERE kind=? AND revision<(SELECT revision-2 FROM documents WHERE kind=?)').bind(v.VIP_KIND,v.VIP_KIND),
 ]);
 if(results[2].meta.changes!==1)throw Error('명단 또는 점수가 그 사이 바뀌어 저장하지 않았습니다. 다시 실행해 주세요.');
 const after=await v.readWeekly(db);
 log('SAVED: revision '+current.revision+' -> '+after.revision+' (previous version backed up)');
 return {status:'saved',revision:after.revision};
}
module.exports={importWeekly};

if(require.main===module){
 const file=process.argv[2];const input=JSON.parse(fs.readFileSync(file,'utf8'));
 const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token}=process.env;
 const database='31e3bbb6-2860-40cb-9390-d989d37f11c2'; // 3on-guild-production-db
 importWeekly(remoteD1(account,database,token),input,{actor:'guild-war-import (user-approved 2026-11-08)'})
  .then(r=>console.log('Result: '+r.status))
  .catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
}
