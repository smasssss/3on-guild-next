/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS runner that reuses the site's own TypeScript code. */
// 2026-11-08 (user-approved "VIP 기록 되돌리기와 Production 배포 승인"): the 11-08 import replaced the
// week in force (2026-11-02 points) at once. Rule: last week's points stay in force until Monday 11:00 KST.
// This puts the 2026-11-02 week (from the automatic backup taken just before the import) back as the
// current week and keeps the uploaded 2026-11-09 week as pending. Backup + revision guard, nothing else changes.
const crypto=require('node:crypto'),{remoteD1,loader}=require('./vip-weekly-import.cjs');
async function holdLastWeek(db,{now=Date.now(),actor='guild-war-hold',log=console.log}={}){
 const v=loader({DB:db})('lib/vip-weekly.ts');
 const doc=await db.prepare("SELECT revision,payload FROM documents WHERE kind='vip-weekly'").first();
 if(!doc)throw Error('주간 기록 문서가 없습니다.');
 const data=JSON.parse(doc.payload);
 if(data.current?.appliesOn==='2026-11-02'&&data.pending?.appliesOn==='2026-11-09'){log('Already held: nothing to do');return {status:'duplicate'};}
 if(data.current?.appliesOn!=='2026-11-09'||data.pending)throw Error('예상과 다른 주간 기록 상태라 바꾸지 않았습니다.');
 const backup=await db.prepare("SELECT payload FROM backups WHERE kind='vip-weekly' AND revision=? AND actor LIKE 'guild-war-import%'").bind(doc.revision-1).first();
 const last=backup&&JSON.parse(backup.payload);const previous=last?.current?.appliesOn==='2026-11-02'?last.current:last?.pending?.appliesOn==='2026-11-02'?last.pending:null;
 if(!previous)throw Error('백업에서 2026-11-02 주차 기록을 찾지 못했습니다.');
 const next={current:previous,pending:data.current};
 const view=v.weeklyView(next,now);
 if(now<v.effectiveAt(data.current)&&view.active?.appliesOn!=='2026-11-02')throw Error('되돌린 뒤에도 지난주 기록이 적용되지 않습니다.');
 log('Last week rows '+previous.rows.length+' · this week rows '+data.current.rows.length+' · in force now '+(view.active?.appliesOn||'none')+' · switches at '+new Date(v.effectiveAt(data.current)).toISOString());
 const stamp=new Date(now).toISOString(),mutation=crypto.randomUUID();
 const results=await db.batch([
  db.prepare('INSERT INTO backups(mutation,kind,revision,payload,saved_at,actor) SELECT ?,kind,revision,payload,?,? FROM documents WHERE kind=? AND revision=?').bind(mutation,stamp,actor,v.VIP_KIND,doc.revision),
  db.prepare('UPDATE documents SET payload=?,revision=revision+1,updated_at=?,actor=?,last_mutation=? WHERE kind=? AND revision=? AND payload=? AND EXISTS(SELECT 1 FROM backups WHERE mutation=? AND kind=? AND revision=?)').bind(JSON.stringify(next),stamp,actor,mutation,v.VIP_KIND,doc.revision,doc.payload,mutation,v.VIP_KIND,doc.revision),
 ]);
 if(results[1].meta.changes!==1)throw Error('그 사이 주간 기록이 바뀌어 저장하지 않았습니다.');
 log('HELD: revision '+doc.revision+' -> '+(doc.revision+1)+' (previous version backed up)');
 return {status:'held'};
}
module.exports={holdLastWeek};
if(require.main===module){
 const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token}=process.env;
 holdLastWeek(remoteD1(account,'31e3bbb6-2860-40cb-9390-d989d37f11c2',token),{actor:'guild-war-hold (user-approved 2026-11-08)'})
  .then(r=>console.log('Result: '+r.status)).catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
}
