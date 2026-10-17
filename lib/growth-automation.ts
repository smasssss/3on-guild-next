// Deterministic Workers/D1 pipeline. No AI service or connector is used here.
export const ALLIANCE_URL='https://lastasylum.gg/api/alliance/50373046';
export const COLLECT_CRON='0 * * * *';
export const CLOSE_CRON='10 15 * * *';
const HOUR=3_600_000, DAY=24*HOUR;
type Row={id:string;name:string;power:number;castle:number;rank:number;activity:number|null;kills:number|null;joined:number|null};
type Snapshot={id:string;server:number;tag:string;members:number;power:number;asOf:number;roster:Row[]};
type AutoEnv={DB?:D1Database;GROWTH_AUTO_MODE?:string};
export const kstDate=(ms:number)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
export const cutoffFor=(date:string)=>Date.parse(date+'T00:00:00+09:00')+DAY;
const canonical=(x:any):string=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
async function digest(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');}
const number=(n:any,max=999_999_999_999)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const json=(x:any)=>JSON.stringify(x);
const stmt=(db:D1Database,sql:string,...values:any[])=>db.prepare(sql).bind(...values);
const all=async(db:D1Database,sql:string,...v:any[])=>(await stmt(db,sql,...v).all<any>()).results;
const first=async(db:D1Database,sql:string,...v:any[])=>stmt(db,sql,...v).first<any>();
async function approvedLatest(db:D1Database){return all(db,`WITH RECURSIVE l(batch_id) AS(
  SELECT batch_id FROM (SELECT batch_id FROM growth_batches WHERE state='published' ORDER BY observed_date DESC,published_revision DESC LIMIT 1)
  UNION ALL SELECT parent.batch_id FROM growth_batches b JOIN l USING(batch_id) JOIN growth_batches parent ON parent.batch_id=b.supersedes_batch_id WHERE parent.state IN ('published','superseded'))
  SELECT e.member_id,o.power,o.level,o.rank,o.observed_date FROM growth_external_ids e JOIN growth_observations o ON o.observation_id=(SELECT x.observation_id FROM growth_observations x JOIN l USING(batch_id) WHERE x.member_id=e.member_id AND x.status='active' ORDER BY x.observed_date DESC,x.original_order DESC LIMIT 1)`);}

export function validateSnapshot(input:any,calledAt:number):Snapshot {
  if(!input||String(input.id)!=='50373046'||input.server!==295||input.tag!=='3ON')throw Error('WRONG_ALLIANCE');
  if(!number(input.asOf,9_999_999_999)||input.asOf*1000>calledAt+300_000||input.asOf*1000<Date.parse('2026-01-01'))throw Error('INVALID_ASOF');
  if(!number(input.power)||!number(input.members,500)||input.members<1||!Array.isArray(input.roster)||input.roster.length!==input.members)throw Error('INCOMPLETE_ROSTER');
  const ids=new Set<string>();
  for(const r of input.roster){
    if(typeof r.id!=='string'||!/^\d{1,24}$/.test(r.id)||ids.has(r.id))throw Error('DUPLICATE_OR_INVALID_ID');ids.add(r.id);
    if(typeof r.name!=='string'||!r.name.trim()||r.name.length>100||!number(r.power)||!number(r.castle,999)||r.castle<1||!Number.isInteger(r.rank)||r.rank<1||r.rank>5)throw Error('INVALID_PLAYER');
    if(r.activity!=null&&!number(r.activity))throw Error('INVALID_ACTIVITY');
    if(r.kills!=null&&!number(r.kills))throw Error('INVALID_KILLS');
    if(r.joined!=null&&(!number(r.joined,9_999_999_999_999)||r.joined>calledAt+300_000))throw Error('INVALID_JOINED');
  }
  return input;
}

// Compare against the last accepted raw observation, never against a guild total.
export function anomaly(r:Row,previous:any):string|null {
  if(!previous)return null;
  if(r.castle<previous.level)return '성 레벨 하락 · 원본 검토 필요';
  if(previous.power>0&&Math.abs(r.power-previous.power)>5_000_000&&(r.power>previous.power*2||r.power<previous.power*.35))return '전투력 급변 · 원본 검토 필요';
  return null;
}

export async function ingestStored(db:D1Database,runId:string,acceptedAt=Date.now()) {
  const run=await first(db,'SELECT * FROM growth_auto_runs WHERE run_id=?',runId);
  if(!run||!run.raw_json)throw Error('RAW_RESPONSE_UNAVAILABLE');
  if(['accepted','partial','duplicate','invalid','stale'].includes(run.status))return {status:run.status,run_id:runId};
  let source:Snapshot;
  try{source=validateSnapshot(JSON.parse(run.raw_json),run.called_at)}catch(e){
    await stmt(db,"UPDATE growth_auto_runs SET status='invalid',error=?,completed_at=? WHERE run_id=?",String((e as Error).message),acceptedAt,runId).run();return {status:'invalid',run_id:runId};
  }
  const sourceTime=source.asOf*1000;
  const contentHash=await digest(canonical({id:source.id,asOf:source.asOf,members:source.members,power:source.power,roster:[...source.roster].sort((a,b)=>a.id.localeCompare(b.id))}));
  const existing=await first(db,'SELECT s.snapshot_id,r.raw_hash FROM growth_auto_snapshots s JOIN growth_auto_runs r ON r.run_id=s.run_id WHERE s.source_as_of=? AND s.content_hash=?',sourceTime,contentHash);
  if(existing){await stmt(db,"UPDATE growth_auto_runs SET status='duplicate',snapshot_id=?,source_as_of=?,content_hash=?,completed_at=?,raw_json=CASE WHEN raw_hash=? THEN NULL ELSE raw_json END WHERE run_id=?",existing.snapshot_id,sourceTime,contentHash,acceptedAt,existing.raw_hash,runId).run();return {status:'duplicate',run_id:runId};}
  const last=await first(db,'SELECT MAX(source_as_of) t FROM growth_auto_snapshots');
  if(last?.t>sourceTime){await stmt(db,"UPDATE growth_auto_runs SET status='stale',source_as_of=?,content_hash=?,completed_at=?,error='SOURCE_TIME_REGRESSED' WHERE run_id=?",sourceTime,contentHash,acceptedAt,runId).run();return {status:'stale',run_id:runId};}
  if(await first(db,'SELECT snapshot_id FROM growth_auto_snapshots WHERE source_as_of=?',sourceTime)){
    await stmt(db,"UPDATE growth_auto_runs SET status='invalid',source_as_of=?,completed_at=?,error='CHANGED_DATA_WITH_SAME_ASOF' WHERE run_id=?",sourceTime,acceptedAt,runId).run();return {status:'invalid',run_id:runId};
  }
  const snapshotId='auto_'+await digest(sourceTime+':'+contentHash);
  const mappings=await all(db,'SELECT e.*,m.display_name FROM growth_external_ids e LEFT JOIN growth_members m USING(member_id)');
  const byId=new Map(mappings.map(m=>[m.game_id,m]));
  const identities=await all(db,"SELECT member_id,display_name raw FROM growth_members UNION SELECT member_id,legacy_canonical raw FROM growth_members WHERE legacy_canonical IS NOT NULL UNION SELECT member_id,raw_value raw FROM growth_identity_decisions WHERE status='confirmed'");
  const names=new Set(identities.map(r=>r.raw));
  const previous=await all(db,`SELECT o.* FROM growth_external_ids e JOIN growth_hourly_observations o ON o.game_id=e.game_id AND o.snapshot_id=(SELECT x.snapshot_id FROM growth_hourly_observations x WHERE x.game_id=e.game_id AND x.status='valid' ORDER BY x.source_as_of DESC LIMIT 1)`);
  const prev=new Map(previous.map(p=>[p.game_id,p]));
  const approved=new Map((await approvedLatest(db)).map(p=>[p.member_id,p]));
  const revision=await first(db,"SELECT value FROM growth_meta WHERE key='identity_revision'");
  const rows:any[]=[],newMappings:any[]=[],newMembers:any[]=[],events:any[]=[],renames:any[]=[];
  const event=(kind:string,r:any,status:string,before:any,after:any,reason?:string)=>events.push({event_id:snapshotId+'_'+kind+'_'+r.game_id,kind,game_id:r.game_id,member_id:r.member_id,source_as_of:sourceTime,created_at:acceptedAt,status,before_json:before==null?null:json(before),after_json:after==null?null:json(after),reason:reason||null});
  const sameNames=new Map<string,number>();for(const r of source.roster)sameNames.set(r.name,(sameNames.get(r.name)||0)+1);
  for(const r of source.roster){
    let m=byId.get(r.id),reason=anomaly(r,prev.get(r.id)||approved.get(m?.member_id));
    if(!m){
      const collision=names.has(r.name)||sameNames.get(r.name)!==1;
      m={game_id:r.id,member_id:collision?null:'game_50373046_'+r.id,source_name:r.name,status:collision?'review':'confirmed',evidence:collision?'동일 이름의 기존 회원 또는 동명이인 · 수동 연결 필요':'새 게임 ID · 완전한 허가 길드 로스터',departed_at:null};
      newMappings.push(m);byId.set(r.id,m);
      if(m.member_id)newMembers.push({member_id:m.member_id,display_name:r.name});
      event(collision?'identity_review':'new',m,collision?'pending':'recorded',null,{name:r.name,joined_at:r.joined});
    }
    if(m.status!=='confirmed')reason=reason||'게임 ID 연결 검토 필요';
    if(m.departed_at){reason=reason||'탈퇴 확정 후 재관측 · 재가입 검토';event('rejoin_candidate',m,'pending',null,{name:r.name});}
    const row={snapshot_id:snapshotId,game_id:r.id,member_id:m.member_id||null,source_as_of:sourceTime,received_at:run.received_at,accepted_at:acceptedAt,source_name:r.name,power:r.power,level:r.castle,rank:'R'+r.rank,activity:r.activity??null,kills:r.kills??null,joined_at:r.joined??null,status:reason?'review':'valid',reason};rows.push(row);
    if(reason)event('observation_review',m,'pending',prev.get(r.id)||null,row,reason);
    if(!reason&&m.source_name!==r.name){renames.push({...m,source_name:r.name});event('nickname',m,'recorded',{name:m.display_name||m.source_name},{name:r.name});}
    const p=prev.get(r.id)||approved.get(m.member_id);if(!reason&&p?.rank!==undefined&&p.rank!==row.rank)event('rank',m,'recorded',{rank:p.rank},{rank:row.rank});
  }
  const present=new Set(source.roster.map(r=>r.id));
  for(const m of mappings)if(m.status==='confirmed'&&!m.departed_at&&!present.has(m.game_id))event('departure_candidate',m,'pending',null,null,'명단 미관측 · 탈퇴 미확정');
  const guard='auto-ingest-'+runId;
  const statements=[
    stmt(db,"INSERT INTO growth_tx_guards VALUES(?,CASE WHEN NOT EXISTS(SELECT 1 FROM growth_auto_snapshots WHERE source_as_of=? ) AND EXISTS(SELECT 1 FROM growth_auto_runs WHERE run_id=? AND status IN ('received','db_error')) AND (SELECT value FROM growth_meta WHERE key='identity_revision')=? THEN 1 ELSE NULL END,?)",guard,sourceTime,runId,revision.value,new Date(acceptedAt).toISOString()),
    stmt(db,'INSERT INTO growth_auto_snapshots(snapshot_id,source_as_of,content_hash,run_id,received_at,accepted_at,member_count,guild_power) VALUES(?,?,?,?,?,?,?,?)',snapshotId,sourceTime,contentHash,runId,run.received_at,acceptedAt,source.members,source.power),
  ];
  // The explicit column list deliberately keeps all writes out of unrelated tables.
  if(newMembers.length)statements.push(stmt(db,`INSERT INTO growth_members(member_id,legacy_canonical,display_name,source,created_at) SELECT json_extract(value,'$.member_id'),NULL,json_extract(value,'$.display_name'),'lastasylum-game-id',? FROM json_each(?)`,new Date(acceptedAt).toISOString(),json(newMembers)));
  if(newMappings.length)statements.push(stmt(db,`INSERT INTO growth_external_ids(game_id,member_id,source_name,status,evidence,departed_at,created_at,updated_at) SELECT json_extract(value,'$.game_id'),json_extract(value,'$.member_id'),json_extract(value,'$.source_name'),json_extract(value,'$.status'),json_extract(value,'$.evidence'),NULL,?,? FROM json_each(?)`,acceptedAt,acceptedAt,json(newMappings)));
  statements.push(stmt(db,`INSERT INTO growth_hourly_observations SELECT json_extract(value,'$.snapshot_id'),json_extract(value,'$.game_id'),json_extract(value,'$.member_id'),json_extract(value,'$.source_as_of'),json_extract(value,'$.received_at'),json_extract(value,'$.accepted_at'),json_extract(value,'$.source_name'),json_extract(value,'$.power'),json_extract(value,'$.level'),json_extract(value,'$.rank'),json_extract(value,'$.activity'),json_extract(value,'$.kills'),json_extract(value,'$.joined_at'),json_extract(value,'$.status'),json_extract(value,'$.reason') FROM json_each(?)`,json(rows)));
  if(renames.length){
    statements.push(stmt(db,`INSERT OR IGNORE INTO growth_identity_decisions(decision_id,identity_revision,raw_value,decision_kind,member_id,display_name,source,status,created_at)
      SELECT ?||'_'||json_extract(value,'$.game_id'),?,json_extract(value,'$.display_name'),'alias',json_extract(value,'$.member_id'),json_extract(value,'$.source_name'),'lastasylum-game-id','confirmed',? FROM json_each(?) WHERE json_extract(value,'$.display_name') IS NOT NULL`,snapshotId,Number(revision.value)+1,new Date(acceptedAt).toISOString(),json(renames)));
    statements.push(stmt(db,`UPDATE growth_members SET display_name=(SELECT json_extract(value,'$.source_name') FROM json_each(?) WHERE json_extract(value,'$.member_id')=growth_members.member_id) WHERE member_id IN(SELECT json_extract(value,'$.member_id') FROM json_each(?))`,json(renames),json(renames)));
    statements.push(stmt(db,`UPDATE growth_external_ids SET source_name=(SELECT json_extract(value,'$.source_name') FROM json_each(?) WHERE json_extract(value,'$.game_id')=growth_external_ids.game_id),updated_at=? WHERE game_id IN(SELECT json_extract(value,'$.game_id') FROM json_each(?))`,json(renames),acceptedAt,json(renames)));
  }
  if(newMembers.length||renames.length)statements.push(stmt(db,"UPDATE growth_meta SET value=CAST(value AS INTEGER)+1,updated_at=? WHERE key='identity_revision'",new Date(acceptedAt).toISOString()));
  if(events.length)statements.push(stmt(db,`INSERT OR IGNORE INTO growth_auto_events SELECT json_extract(value,'$.event_id'),json_extract(value,'$.kind'),json_extract(value,'$.game_id'),json_extract(value,'$.member_id'),json_extract(value,'$.source_as_of'),json_extract(value,'$.created_at'),json_extract(value,'$.status'),json_extract(value,'$.before_json'),json_extract(value,'$.after_json'),json_extract(value,'$.reason'),NULL FROM json_each(?)`,json(events)));
  // A later complete roster resolves only absence candidates; it never confirms a departure.
  statements.push(stmt(db,`UPDATE growth_auto_events SET status='resolved' WHERE kind='departure_candidate' AND status='pending' AND game_id IN(SELECT json_extract(value,'$.id') FROM json_each(?))`,json(source.roster)));
  const reviewCount=rows.filter(r=>r.status!=='valid').length;
  statements.push(stmt(db,'UPDATE growth_auto_runs SET status=?,source_as_of=?,content_hash=?,snapshot_id=?,completed_at=?,validation_json=? WHERE run_id=?',reviewCount?'partial':'accepted',sourceTime,contentHash,snapshotId,acceptedAt,json({members:source.members,valid:rows.length-reviewCount,review:reviewCount}),runId));
  await db.batch(statements);
  return {status:reviewCount?'partial':'accepted',run_id:runId,snapshot_id:snapshotId,members:rows.length,review:reviewCount};
}

export async function collect(env:AutoEnv,triggerKind='cron',now=Date.now(),fetcher:typeof fetch=fetch){
  if(env.GROWTH_AUTO_MODE!=='production')return {status:'fixture_only'};
  if(!env.DB)throw Error('DB_UNAVAILABLE');const db=env.DB;
  const hour=new Date(now).toISOString().slice(0,13),runId='collect_'+crypto.randomUUID();
  // A persisted compare-and-set prevents concurrent requests and redeploy retries.
  // 59 minutes tolerates Cron clock jitter; the UTC-hour key still limits one call/hour.
  const reservation=await stmt(db,`UPDATE growth_auto_control SET last_call_at=?,last_hour=?,last_run_id=?,updated_at=? WHERE id=1 AND enabled=1 AND (last_hour IS NULL OR last_hour<>?) AND (last_call_at IS NULL OR last_call_at<=?) RETURNING id`,now,hour,runId,now,hour,now-59*60_000).first();
  if(!reservation)return {status:'throttled_or_paused'};
  await stmt(db,"INSERT INTO growth_auto_runs(run_id,trigger_kind,called_at,status) VALUES(?,?,?,'calling')",runId,triggerKind,now).run();
  try{
    const response=await fetcher(ALLIANCE_URL,{headers:{Accept:'application/json','User-Agent':'3ON-Guild/1.0 (295/50373046; authorized hourly collection)'},redirect:'error',signal:AbortSignal.timeout(25_000)});
    if(!response.ok)throw Error('HTTP_'+response.status);
    const raw=await response.text();if(new TextEncoder().encode(raw).length>1_000_000)throw Error('RESPONSE_TOO_LARGE');
    const received=Date.now();await stmt(db,"UPDATE growth_auto_runs SET status='received',received_at=?,http_status=?,raw_json=?,raw_hash=? WHERE run_id=?",received,response.status,raw,await digest(raw),runId).run();
    return await ingestStored(db,runId);
  }catch(e){
    const error=(e as Error).message.slice(0,300);
    await stmt(db,"UPDATE growth_auto_runs SET status=CASE WHEN raw_json IS NULL THEN 'failed' ELSE 'db_error' END,error=?,completed_at=? WHERE run_id=?",error,Date.now(),runId).run();
    throw Error('COLLECTION_FAILED: '+error);
  }
}

export async function fixture(db:D1Database,raw:string,calledAt=Date.now()){
  const runId='fixture_'+crypto.randomUUID();
  await stmt(db,"INSERT INTO growth_auto_runs(run_id,trigger_kind,called_at,received_at,status,raw_json,raw_hash) VALUES(?,'fixture',?,?,'received',?,?)",runId,calledAt,calledAt,raw,await digest(raw)).run();
  return ingestStored(db,runId,calledAt);
}

export async function closeDay(db:D1Database,date:string,now=Date.now()){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(cutoffFor(date))||kstDate(cutoffFor(date)-DAY)!==date||cutoffFor(date)>now)throw Error('INVALID_CLOSE_DATE');
  const done=await first(db,'SELECT * FROM growth_daily_closes WHERE date=?',date);if(done)return {duplicate:true,...done};
  const control=await first(db,'SELECT * FROM growth_auto_control WHERE id=1');if(!control||date<control.start_date)throw Error('BEFORE_AUTOMATION_START');
  const cutoff=cutoffFor(date),latest=await first(db,"SELECT * FROM growth_batches WHERE state='published' ORDER BY observed_date DESC,published_revision DESC LIMIT 1");if(!latest)throw Error('PUBLICATION_UNAVAILABLE');
  if(latest.observed_date>=date){await stmt(db,"INSERT OR IGNORE INTO growth_daily_closes VALUES(?,?,?,'manual_preserved',0,0,?,?)",date,cutoff,latest.batch_id,now,json({reason:'기존 확정자료 유지'})).run();return {status:'manual_preserved'};}
  const selected=await all(db,`SELECT o.*,e.member_id mapped_member_id FROM growth_external_ids e JOIN growth_hourly_observations o ON o.game_id=e.game_id AND o.snapshot_id=(
    SELECT n.snapshot_id FROM growth_hourly_observations n WHERE n.game_id=e.game_id AND n.status='valid' AND n.source_as_of<? AND n.received_at<? AND n.accepted_at<? AND (n.joined_at IS NULL OR n.joined_at<?) ORDER BY n.source_as_of DESC,n.accepted_at DESC LIMIT 1)
    WHERE e.status='confirmed' AND (e.departed_at IS NULL OR e.departed_at>=?)`,cutoff,cutoff,cutoff,cutoff,cutoff);
  if(!selected.length)throw Error('NO_ELIGIBLE_PREMIDNIGHT_DATA');
  const previous=await all(db,'SELECT * FROM growth_membership_snapshots WHERE batch_id=? ORDER BY row_order',latest.batch_id);
  const ids=new Set(selected.map(r=>r.mapped_member_id));if(ids.size!==selected.length)throw Error('IDENTITY_COLLISION');
  const revisions=Object.fromEntries((await all(db,"SELECT key,value FROM growth_meta WHERE key IN ('growth_revision','identity_revision')")).map(r=>[r.key,Number(r.value)]));
  const growthNext=revisions.growth_revision+1,batchId='auto_close_'+date,guard='close_'+date,iso=new Date(now).toISOString();
  const rows=selected.map((r,index)=>({...r,member_id:r.mapped_member_id,row_index:index,row_id:batchId+'_'+r.game_id,stale:cutoff-r.source_as_of>2*HOUR?1:0}));
  const priorPower=await all(db,`WITH RECURSIVE lineage(batch_id) AS(SELECT ? UNION ALL SELECT b.supersedes_batch_id FROM growth_batches b JOIN lineage l ON l.batch_id=b.batch_id WHERE b.supersedes_batch_id IS NOT NULL) SELECT o.* FROM growth_observations o JOIN lineage USING(batch_id) WHERE o.status='active' ORDER BY observed_date,original_order`,latest.batch_id);
  const membershipInfo=await all(db,'SELECT e.member_id,e.departed_at,m.display_name FROM growth_external_ids e JOIN growth_members m USING(member_id)');
  const memberInfo=new Map(membershipInfo.map(m=>[m.member_id,m]));
  const departed=previous.filter(p=>['current','observed','unobserved','new'].includes(p.membership_state)&&memberInfo.get(p.member_id)?.departed_at&&memberInfo.get(p.member_id).departed_at<cutoff).map(p=>({member_id:p.member_id,display_name:memberInfo.get(p.member_id).display_name,before:p.membership_state,after:'missing'}));
  const returned=previous.filter(p=>['missing','archived'].includes(p.membership_state)&&ids.has(p.member_id)).map(p=>({member_id:p.member_id,display_name:memberInfo.get(p.member_id)?.display_name||p.member_id,before:p.membership_state,after:'observed'}));
  const previousDate=kstDate(cutoff-2*DAY);
  const powers=new Map<string,number>();for(const p of priorPower)if(p.observed_date===previousDate)powers.set(p.member_id,p.power);
  const daily=rows.map(r=>({...r,previous_power:powers.get(r.member_id)??null,delta:powers.has(r.member_id)?r.power-powers.get(r.member_id)!:null}));
  const stale=rows.filter(r=>r.stale).length;
  const details={timezone:'Asia/Seoul',cutoff_at:cutoff,previous_date:previousDate,selection:'source_as_of,received_at,accepted_at strictly before cutoff',source:'lastasylum-alliance-asOf',individual_timestamp:false,stale_count:stale,unobserved:previous.filter(p=>['current','observed','unobserved','new'].includes(p.membership_state)&&!ids.has(p.member_id)&&!departed.some(d=>d.member_id===p.member_id)).length};
  const hash=await digest(json({date,rows:daily.map(r=>[r.member_id,r.snapshot_id,r.power])}));
  const statements=[
    stmt(db,`INSERT INTO growth_tx_guards VALUES(?,CASE WHEN NOT EXISTS(SELECT 1 FROM growth_daily_closes WHERE date=?) AND (SELECT value FROM growth_meta WHERE key='growth_revision')=? AND (SELECT value FROM growth_meta WHERE key='identity_revision')=? AND EXISTS(SELECT 1 FROM growth_batches WHERE batch_id=? AND state='published') THEN 1 ELSE NULL END,?)`,guard,date,String(revisions.growth_revision),String(revisions.identity_revision),latest.batch_id,iso),
    stmt(db,`INSERT INTO growth_batches(batch_id,package_hash,semantic_hash,operation_id,observed_date,slot,expected_count,source_hashes_json,state,identity_revision,base_growth_revision,draft_revision,validation_json,supersedes_batch_id,created_at,updated_at,published_revision) VALUES(?,?,?,?,?,'auto_close',?,?,'published',?,?,1,?,?,?,?,?)`,batchId,hash,hash,guard,date,rows.length,json([...new Set(rows.map(r=>r.snapshot_id.slice(5)))]),revisions.identity_revision,revisions.growth_revision,json(details),latest.batch_id,iso,iso,growthNext),
    stmt(db,`INSERT INTO growth_batch_rows(row_id,batch_id,row_index,raw_name,resolution_status,resolved_member_id,power,level,rank,source_position_json,membership_state) SELECT json_extract(value,'$.row_id'),?,json_extract(value,'$.row_index'),json_extract(value,'$.source_name'),'resolved',json_extract(value,'$.member_id'),json_extract(value,'$.power'),json_extract(value,'$.level'),json_extract(value,'$.rank'),value,'observed' FROM json_each(?)`,batchId,json(daily)),
    stmt(db,`INSERT INTO growth_observations(observation_id,member_id,batch_id,observed_date,slot,power,level,rank,label,source_type,original_order,status,created_at) SELECT 'obs_'||json_extract(value,'$.row_id'),json_extract(value,'$.member_id'),?,?,'auto_close',json_extract(value,'$.power'),json_extract(value,'$.level'),json_extract(value,'$.rank'),?,'automatic',?+json_extract(value,'$.row_index'),'active',? FROM json_each(?)`,batchId,date,Number(date.slice(5,7))+'/'+Number(date.slice(8)),growthNext*1000,iso,json(daily)),
    stmt(db,`INSERT INTO growth_membership_snapshots SELECT ?,member_id,CASE WHEN EXISTS(SELECT 1 FROM growth_external_ids e WHERE e.member_id=growth_membership_snapshots.member_id AND e.departed_at<?) THEN 'missing' WHEN membership_state IN ('current','observed','unobserved','new') THEN 'unobserved' ELSE membership_state END,row_order+500 FROM growth_membership_snapshots WHERE batch_id=? AND member_id NOT IN(SELECT json_extract(value,'$.member_id') FROM json_each(?))`,batchId,cutoff,latest.batch_id,json(daily)),
    stmt(db,`INSERT INTO growth_membership_snapshots SELECT ?,json_extract(value,'$.member_id'),'observed',json_extract(value,'$.row_index') FROM json_each(?)`,batchId,json(daily)),
    stmt(db,"UPDATE growth_batches SET state='superseded',updated_at=? WHERE batch_id=?",iso,latest.batch_id),
    stmt(db,"UPDATE growth_publications SET status='inactive' WHERE batch_id=? AND status='active'",latest.batch_id),
    stmt(db,`INSERT INTO growth_publications VALUES(?,?,?,?, 'active','publish',(SELECT publication_id FROM growth_publications WHERE batch_id=? ORDER BY growth_revision DESC LIMIT 1),'cloudflare-cron',?)`,'pub_'+guard,growthNext,batchId,revisions.identity_revision,latest.batch_id,iso),
    stmt(db,"UPDATE growth_meta SET value=?,updated_at=? WHERE key='growth_revision'",String(growthNext),iso),
    stmt(db,`INSERT INTO growth_daily_sources SELECT ?,json_extract(value,'$.member_id'),json_extract(value,'$.game_id'),json_extract(value,'$.snapshot_id'),json_extract(value,'$.source_as_of'),json_extract(value,'$.received_at'),json_extract(value,'$.accepted_at'),json_extract(value,'$.power'),json_extract(value,'$.previous_power'),json_extract(value,'$.delta'),json_extract(value,'$.stale') FROM json_each(?)`,date,json(daily)),
    stmt(db,'INSERT INTO growth_daily_closes VALUES(?,?,?,?,?,?,?,?)',date,cutoff,batchId,stale||details.unobserved?'delayed':'closed',rows.length,stale,now,json(details)),
    stmt(db,'INSERT INTO growth_mutations VALUES(?,?,?,?)',guard,'automatic_close',json({date,batch_id:batchId,growth_revision:growthNext,...details}),iso),
  ];
  statements.push(stmt(db,`INSERT INTO growth_batch_sources(batch_id,source_hash) SELECT DISTINCT ?,substr(json_extract(value,'$.snapshot_id'),6) FROM json_each(?)`,batchId,json(daily)));
  if(departed.length||returned.length)statements.push(stmt(db,'INSERT INTO growth_mutations VALUES(?,?,?,?)',guard+'_membership','membership_correction',json({batch_id:batchId,observed_date:date,departed,returned,source:'confirmed-game-id-membership'}),iso));
  await db.batch(statements);return {status:stale||details.unobserved?'delayed':'closed',date,batch_id:batchId,members:rows.length,stale};
}

async function scheduledWork(controller:{cron:string;scheduledTime:number},env:AutoEnv){
  if(env.GROWTH_AUTO_MODE!=='production'||!env.DB)return;
  const db=env.DB;
  // Closing has no reference to collect/fetch. Failed days remain retryable.
  if(controller.cron===CLOSE_CRON){
    return closeDay(db,kstDate(controller.scheduledTime-DAY),Date.now());
  }
  if(controller.cron!==COLLECT_CRON)return;
  const pending=await all(db,"SELECT run_id FROM growth_auto_runs WHERE status IN ('received','db_error') ORDER BY called_at LIMIT 2");
  for(const r of pending)await ingestStored(db,r.run_id);
  // An hourly recovery closes a failed previous day without any extra API call.
  const yesterday=kstDate(controller.scheduledTime-DAY),control=await first(db,'SELECT start_date FROM growth_auto_control WHERE id=1');
  const closed=await first(db,'SELECT MAX(date) date FROM growth_daily_closes');
  let day=closed?.date?kstDate(cutoffFor(closed.date)):control?.start_date;
  for(let i=0;day&&day<=yesterday&&i<7;i++){
    try{await closeDay(db,day)}catch(e){console.error('Daily close pending:',day,(e as Error).message);break;}
    day=kstDate(cutoffFor(day));
  }
  return collect(env,'cron');
}

export async function scheduledAutomation(controller:{cron:string;scheduledTime:number},env:AutoEnv){
  if(env.GROWTH_AUTO_MODE!=='production'||!env.DB)return;
  const id=controller.cron+'_'+controller.scheduledTime,db=env.DB;
  await stmt(db,"INSERT OR IGNORE INTO growth_auto_executions(execution_id,cron,scheduled_at,started_at,status) VALUES(?,?,?,?,'running')",id,controller.cron,controller.scheduledTime,Date.now()).run();
  try{const result=await scheduledWork(controller,env);await stmt(db,"UPDATE growth_auto_executions SET completed_at=?,status='success',result_json=?,error=NULL WHERE execution_id=?",Date.now(),json(result??null),id).run();return result;}
  catch(e){await stmt(db,"UPDATE growth_auto_executions SET completed_at=?,status='failed',error=? WHERE execution_id=?",Date.now(),(e as Error).message.slice(0,300),id).run();throw e;}
}

export async function automaticStatus(db:D1Database,admin=false){
  const [control,lastRun,lastGood,close,pending]=await Promise.all([
    first(db,'SELECT enabled,start_date,last_call_at FROM growth_auto_control WHERE id=1'),
    first(db,'SELECT run_id,trigger_kind,called_at,received_at,source_as_of,status,error,http_status,validation_json FROM growth_auto_runs ORDER BY called_at DESC LIMIT 1'),
    first(db,'SELECT * FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 1'),
    first(db,'SELECT * FROM growth_daily_closes ORDER BY date DESC LIMIT 1'),
    first(db,"SELECT COUNT(*) n FROM growth_auto_events WHERE status='pending'"),
  ]);
  const members=await all(db,`SELECT e.game_id,e.member_id,m.display_name,e.source_name,e.status identity_status,e.departed_at,o.*,p.power closed_power,p.date closed_date,
    CASE WHEN p.power IS NULL THEN NULL ELSE o.power-p.power END delta
    FROM growth_external_ids e LEFT JOIN growth_members m USING(member_id)
    LEFT JOIN growth_hourly_observations o ON o.game_id=e.game_id AND o.snapshot_id=(SELECT snapshot_id FROM growth_hourly_observations x WHERE x.game_id=e.game_id AND x.status='valid' ORDER BY x.source_as_of DESC LIMIT 1)
    LEFT JOIN growth_daily_sources p ON p.member_id=e.member_id AND p.date=(SELECT MAX(date) FROM growth_daily_sources x WHERE x.member_id=e.member_id)
    WHERE e.departed_at IS NULL ORDER BY o.power DESC`);
  // The first day uses the existing approved daily observation as its baseline.
  const baseline=await approvedLatest(db);
  const powers=new Map<string,any>();for(const r of baseline)powers.set(r.member_id,r);
  for(const m of members)if(powers.has(m.member_id)){
    const p=powers.get(m.member_id);
    if(m.closed_power==null){m.closed_power=p.power;m.closed_date=p.observed_date;m.delta=m.power==null?null:m.power-p.power;}
    if(m.power==null){m.power=p.power;m.level=p.level;m.rank=p.rank;m.delta=0;m.last_valid_kind='previous_confirmed_record';m.observed_date=p.observed_date;}
  }
  const counts=await first(db,"SELECT COUNT(*) calls FROM growth_auto_runs WHERE trigger_kind<>'fixture'");
  const changes=await all(db,`SELECT e.kind,e.game_id,e.member_id,e.source_as_of,e.before_json,e.after_json,e.status,m.display_name FROM growth_auto_events e LEFT JOIN growth_members m USING(member_id) WHERE e.kind IN ('nickname','rank','new','departure_candidate') ORDER BY e.created_at DESC LIMIT 30`);
  const lastExecution=await first(db,'SELECT cron,scheduled_at,started_at,completed_at,status,result_json,error FROM growth_auto_executions ORDER BY scheduled_at DESC LIMIT 1');
  const base={schema:'3on-growth-automation-v1',timezone:'Asia/Seoul',collector_cron:COLLECT_CRON,close_cron:CLOSE_CRON,ai_calls:0,control,last_run:lastRun,last_good:lastGood,last_close:close,last_execution:lastExecution,pending_count:pending?.n||0,external_calls:counts?.calls||0,delayed:!lastGood||Date.now()-lastGood.source_as_of>2*HOUR,members,changes};
  if(!admin)return base;
  return {...base,all_members:await all(db,'SELECT member_id,display_name,legacy_canonical FROM growth_members ORDER BY display_name'),runs:await all(db,'SELECT run_id,trigger_kind,called_at,source_as_of,status,error,validation_json,raw_hash FROM growth_auto_runs ORDER BY called_at DESC LIMIT 48'),events:await all(db,'SELECT * FROM growth_auto_events ORDER BY created_at DESC LIMIT 150'),mappings:await all(db,'SELECT e.*,m.display_name FROM growth_external_ids e LEFT JOIN growth_members m USING(member_id)'),closes:await all(db,'SELECT * FROM growth_daily_closes ORDER BY date DESC LIMIT 31')};
}
