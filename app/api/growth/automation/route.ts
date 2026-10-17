import { env } from 'cloudflare:workers';
import { actor,db,response,validOrigin } from '../../../../lib/store';
import { automaticStatus,collect,fixture,closeDay,ingestStored,kstDate } from '../../../../lib/growth-automation';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}
export async function GET(req:Request){try{
  const url=new URL(req.url),admin=url.searchParams.get('admin')==='1';
  if(admin&&!await actor(req))return response(req,{error:'관리자 인증이 필요합니다.'},401);
  const gameId=url.searchParams.get('game_id');
  if(gameId){if(!/^\d{1,24}$/.test(gameId))return response(req,{error:'게임 ID 형식 오류'},400);
    return response(req,{schema:'3on-hourly-history-v1',observations:(await db().prepare('SELECT source_as_of,received_at,accepted_at,source_name,power,rank,level,activity,kills,status,reason,snapshot_id FROM growth_hourly_observations WHERE game_id=? ORDER BY source_as_of DESC LIMIT 168').bind(gameId).all()).results});}
  const date=url.searchParams.get('date');if(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return response(req,{error:'날짜 형식 오류'},400);
    return response(req,{close:await db().prepare('SELECT * FROM growth_daily_closes WHERE date=?').bind(date).first(),sources:(await db().prepare('SELECT * FROM growth_daily_sources WHERE date=? ORDER BY member_id').bind(date).all()).results});
  }
  if(url.searchParams.has('raw')){
    if(!await actor(req))return response(req,{error:'관리자 인증이 필요합니다.'},401);
    const row=await db().prepare('SELECT raw_json,raw_hash,status,validation_json FROM growth_auto_runs WHERE run_id=?').bind(url.searchParams.get('raw')).first();return response(req,row||{},row?200:404);
  }
  return response(req,{...await automaticStatus(db(),admin),mode:env.GROWTH_AUTO_MODE||'disabled'});
}catch(e){return response(req,{error:'자동 수집 상태를 읽지 못했습니다.',detail:(e as Error).message},503);}}
export async function POST(req:Request){try{
  if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);
  const user=await actor(req);if(!user)return response(req,{error:'관리자 인증이 필요합니다.'},401);
  const body=await req.text();if(body.length>1_100_000)return response(req,{error:'요청이 너무 큽니다.'},413);
  const b=JSON.parse(body),database=db(),now=Date.now();let result:any;
  if(b.action==='bootstrap'){
    if(!Array.isArray(b.mappings)||b.mappings.length<1||b.mappings.length>500)throw Error('초기 연결표 형식 오류');
    if(await database.prepare('SELECT game_id FROM growth_external_ids LIMIT 1').first())throw Error('초기 연결표가 이미 있습니다. 개별 연결 정정을 사용하세요.');
    const ids=new Set(),members=new Set();
    for(const m of b.mappings){if(!/^\d{1,24}$/.test(m.game_id)||typeof m.member_id!=='string'||typeof m.source_name!=='string'||!m.source_name||m.source_name.length>100||typeof m.evidence!=='string'||m.evidence.length>500||ids.has(m.game_id)||members.has(m.member_id))throw Error('초기 연결표 중복 또는 형식 오류');ids.add(m.game_id);members.add(m.member_id);}
    const known=await database.prepare("SELECT COUNT(*) n FROM growth_members WHERE member_id IN(SELECT json_extract(value,'$.member_id') FROM json_each(?))").bind(JSON.stringify(b.mappings)).first<any>();if(known.n!==members.size)throw Error('기존 회원 ID를 찾지 못했습니다.');
    const guard='bootstrap_'+crypto.randomUUID();
    await database.batch([
      database.prepare('INSERT INTO growth_tx_guards VALUES(?,CASE WHEN NOT EXISTS(SELECT 1 FROM growth_external_ids) THEN 1 ELSE NULL END,?)').bind(guard,new Date(now).toISOString()),
      database.prepare(`INSERT INTO growth_external_ids SELECT json_extract(value,'$.game_id'),json_extract(value,'$.member_id'),json_extract(value,'$.source_name'),'confirmed',json_extract(value,'$.evidence'),NULL,?,? FROM json_each(?)`).bind(now,now,JSON.stringify(b.mappings)),
      database.prepare('UPDATE growth_auto_control SET enabled=1,updated_at=? WHERE id=1').bind(now),
      database.prepare("INSERT INTO growth_auto_events VALUES(?,'bootstrap',NULL,NULL,?,?,'recorded',NULL,?,'관리자 검증 연결표 등록',?)").bind(guard,now,now,JSON.stringify({count:b.mappings.length}),user),
    ]);result={mappings:b.mappings.length,enabled:true};
  }else if(b.action==='collect')result=await collect(env,'admin');
  else if(b.action==='fixture'){
    if(env.GROWTH_AUTO_MODE!=='fixture')return response(req,{error:'테스트 응답은 Staging에서만 사용할 수 있습니다.'},403);
    const called=Number.isSafeInteger(b.called_at)?b.called_at:now;
    result=await fixture(database,JSON.stringify(b.data),called);
  }else if(b.action==='close'){
    // Production cannot forge the clock or create an unfinished day's close.
    const clock=env.GROWTH_AUTO_MODE==='fixture'&&Number.isSafeInteger(b.now)?b.now:now;
    result=await closeDay(database,b.date||kstDate(clock-86400000),clock);
  }else if(b.action==='retry')result=await ingestStored(database,b.run_id);
  else if(b.action==='enabled'){
    if(typeof b.enabled!=='boolean')throw Error('설정값 오류');
    await database.prepare('UPDATE growth_auto_control SET enabled=?,updated_at=? WHERE id=1').bind(b.enabled?1:0,now).run();result={enabled:b.enabled};
  }else if(b.action==='mapping'){
    if(!/^\d{1,24}$/.test(b.game_id)||typeof b.member_id!=='string'||typeof b.reason!=='string'||b.reason.trim().length<5)throw Error('게임 ID, 연결 대상, 정정 사유를 확인하세요.');
    const before=await database.prepare('SELECT * FROM growth_external_ids WHERE game_id=?').bind(b.game_id).first<any>();if(!before)throw Error('게임 ID가 없습니다.');
    const id=b.member_id==='new'?'game_50373046_'+b.game_id:b.member_id;
    const member=await database.prepare('SELECT member_id FROM growth_members WHERE member_id=?').bind(id).first();if(!member&&b.member_id!=='new')throw Error('기존 회원 ID가 없습니다.');
    const mutation='mapping_'+crypto.randomUUID(),statements:D1PreparedStatement[]=[database.prepare("INSERT INTO growth_tx_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM growth_external_ids WHERE game_id=? AND updated_at=?) THEN 1 ELSE NULL END,?)").bind(mutation,b.game_id,before.updated_at,new Date(now).toISOString())];
    if(!member)statements.push(database.prepare("INSERT INTO growth_members VALUES(?,NULL,?,'admin-game-id',?)").bind(id,before.source_name,new Date(now).toISOString()));
    statements.push(database.prepare("UPDATE growth_external_ids SET member_id=?,status='confirmed',departed_at=NULL,evidence=?,updated_at=? WHERE game_id=? AND updated_at=?").bind(id,b.reason,now,b.game_id,before.updated_at));
    statements.push(database.prepare("UPDATE growth_hourly_observations SET member_id=?,status=CASE WHEN reason='게임 ID 연결 검토 필요' THEN 'valid' ELSE status END WHERE game_id=? AND NOT EXISTS(SELECT 1 FROM growth_daily_sources d WHERE d.snapshot_id=growth_hourly_observations.snapshot_id AND d.game_id=growth_hourly_observations.game_id)").bind(id,b.game_id));
    statements.push(database.prepare("UPDATE growth_meta SET value=CAST(value AS INTEGER)+1,updated_at=? WHERE key='identity_revision'").bind(new Date(now).toISOString()));
    statements.push(database.prepare("INSERT INTO growth_auto_events VALUES(?,'mapping',?,?,?,?,'recorded',?,?,?,?)").bind(mutation,b.game_id,id,now,now,JSON.stringify(before),JSON.stringify({member_id:id,future_closes_only:true}),b.reason,user));
    await database.batch(statements);result={member_id:id,future_closes_only:true};
  }else if(b.action==='review'){
    if(!['approve_observation','dismiss','confirm_departure'].includes(b.decision)||typeof b.reason!=='string'||b.reason.trim().length<5)throw Error('처리 방식과 사유를 확인하세요.');
    const event=await database.prepare("SELECT * FROM growth_auto_events WHERE event_id=? AND status='pending'").bind(b.event_id).first<any>();if(!event)throw Error('미처리 검토 항목이 없습니다.');
    const statements:D1PreparedStatement[]=[database.prepare("INSERT INTO growth_tx_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM growth_auto_events WHERE event_id=? AND status='pending') THEN 1 ELSE NULL END,?)").bind('review_'+crypto.randomUUID(),event.event_id,new Date(now).toISOString())];
    if(b.decision==='approve_observation'){
      if(event.kind!=='observation_review')throw Error('관측 검토 항목만 승인할 수 있습니다.');
      const row=JSON.parse(event.after_json);const identity=await database.prepare("SELECT member_id FROM growth_external_ids WHERE game_id=? AND status='confirmed'").bind(event.game_id).first<any>();if(!identity?.member_id)throw Error('동일인 연결을 먼저 확인하세요.');
      statements.push(database.prepare("UPDATE growth_hourly_observations SET status='valid',reason=?,accepted_at=? WHERE game_id=? AND snapshot_id=?").bind('관리자 승인: '+b.reason,now,event.game_id,row.snapshot_id));
    }
    if(b.decision==='confirm_departure'){
      if(event.kind!=='departure_candidate')throw Error('탈퇴 후보 항목만 확정할 수 있습니다.');
      statements.push(database.prepare('UPDATE growth_external_ids SET departed_at=?,updated_at=? WHERE game_id=?').bind(now,now,event.game_id));
    }
    statements.push(database.prepare("UPDATE growth_auto_events SET status='resolved',actor=?,reason=COALESCE(reason,'')||?,after_json=json_set(COALESCE(after_json,'{}'),'$.decision',?) WHERE event_id=? AND status='pending'").bind(user,' / '+b.reason,b.decision,event.event_id));
    await database.batch(statements);result={event_id:event.event_id,decision:b.decision};
  }else return response(req,{error:'알 수 없는 작업입니다.'},400);
  return response(req,{result});
}catch(e){return response(req,{error:(e as Error).message||'자동 수집 작업에 실패했습니다.'},409);}}
