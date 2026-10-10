import { actor, db, response, validOrigin } from '../../../../lib/store';
import { sha, validMutation } from '../../../../lib/growth';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}

const completedStates=new Set(['resolved','new','unobserved']);
const stateFields=['resolution_status','resolved_member_id','proposed_member_id','proposed_display_name','confirm_alias','power','level','rank','membership_state','uncertainty_reason'] as const;
function snapshot(row:any){return Object.fromEntries(stateFields.map(key=>[key,row[key]??null]));}
function parseState(raw:string){const value=JSON.parse(raw);for(const key of stateFields)if(!(key in value))value[key]=null;return value;}
function restoreSql(state:any,rowId:string,batchId:string,guard:string){return db().prepare(`UPDATE growth_batch_rows SET resolution_status=?,resolved_member_id=?,proposed_member_id=?,proposed_display_name=?,confirm_alias=?,power=?,level=?,rank=?,membership_state=?,uncertainty_reason=?,review_version=review_version+1 WHERE row_id=? AND batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(state.resolution_status,state.resolved_member_id,state.proposed_member_id,state.proposed_display_name,Number(state.confirm_alias||0),state.power,state.level,state.rank,state.membership_state,state.uncertainty_reason,rowId,batchId,guard);}
function stateRefresh(batchId:string,guard:string){return db().prepare(`UPDATE growth_batches SET state=CASE WHEN NOT EXISTS(SELECT 1 FROM growth_batch_rows WHERE batch_id=? AND resolution_status NOT IN ('resolved','new','unobserved')) AND json_array_length(json_extract(validation_json,'$.blocking'))=0 THEN 'ready' ELSE 'needs_review' END WHERE batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(batchId,batchId,guard);}

async function batchView(batchId:string){
  const batch=await db().prepare('SELECT * FROM growth_batches WHERE batch_id=?').bind(batchId).first<any>();if(!batch)return null;
  const [rowResult,eventResult]=await Promise.all([
    db().prepare(`SELECT r.*,m.legacy_canonical AS member_canonical,m.display_name AS member_display_name FROM growth_batch_rows r LEFT JOIN growth_members m ON m.member_id=COALESCE(r.resolved_member_id,r.candidate_member_id) WHERE r.batch_id=? ORDER BY r.row_index`).bind(batchId).all<any>(),
    db().prepare("SELECT event_id,mutation,row_id,action,before_json,after_json,draft_revision,actor,created_at FROM growth_review_events WHERE batch_id=? AND status='active' ORDER BY created_at,event_id").bind(batchId).all<any>(),
  ]);
  const rows=rowResult.results.map(r=>({...r,source_position:JSON.parse(r.source_position_json||'null'),asset_url:r.crop_asset_id?'/api/growth/review/asset?asset_id='+encodeURIComponent(r.crop_asset_id):null}));
  const latest=new Map<string,any>();
  for(const event of eventResult.results)latest.set(event.row_id,{...event,before:JSON.parse(event.before_json),after:JSON.parse(event.after_json)});
  const changes=rows.filter(r=>latest.has(r.row_id)).map(r=>({row:r,decision:latest.get(r.row_id)}));
  const remaining=rows.filter(r=>!completedStates.has(r.resolution_status));
  const byAction=(...actions:string[])=>changes.filter(x=>actions.includes(x.decision.action)).length;
  const summary={total:rows.length,automatic:rows.filter(r=>r.review_version===0&&r.resolution_status==='resolved').length,user_confirmed:changes.length,processed:rows.length-remaining.length,review_required:remaining.filter(r=>r.resolution_status!=='held').length,held:remaining.filter(r=>r.resolution_status==='held').length,unobserved:rows.filter(r=>r.resolution_status==='unobserved').length,new_members:byAction('new','direct_new'),connections:byAction('connect'),direct_edits:byAction('direct_connect'),changed_members:changes.length};
  return {batch:{...batch,validation:JSON.parse(batch.validation_json),source_hashes:JSON.parse(batch.source_hashes_json)},summary,rows,changes};
}

export async function GET(req:Request){try{if(!await actor(req))return response(req,{error:'관리자 인증이 필요합니다.'},401);const id=new URL(req.url).searchParams.get('batch_id')||'';const view=await batchView(id);return view?response(req,view):response(req,{error:'성장 묶음을 찾을 수 없습니다.'},404);}catch{return response(req,{error:'확인 목록을 불러오지 못했습니다.'},503);}}

export async function POST(req:Request){try{
  if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);const user=await actor(req);if(!user)return response(req,{error:'관리자 인증이 필요합니다.'},401);
  const body=await req.json() as any;if(typeof body.batch_id!=='string'||!Number.isSafeInteger(body.draft_revision)||!validMutation(body.mutation))return response(req,{error:'확인 요청 형식을 확인해 주세요.'},400);
  const duplicate=await db().prepare("SELECT result_json FROM growth_mutations WHERE mutation=? AND operation='review'").bind(body.mutation).first<{result_json:string}>();if(duplicate){const view=await batchView(body.batch_id);return response(req,{duplicate:true,result:JSON.parse(duplicate.result_json),...view});}
  const batch=await db().prepare("SELECT * FROM growth_batches WHERE batch_id=? AND state IN ('needs_review','ready')").bind(body.batch_id).first<any>();if(!batch)return response(req,{error:'수정할 수 있는 Draft가 아닙니다.'},409);
  const now=new Date().toISOString(),guard='review_'+body.mutation;const statements:any[]=[];
  statements.push(db().prepare(`INSERT INTO growth_tx_guards(guard_id,ok,created_at) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM growth_batches WHERE batch_id=? AND draft_revision=? AND state IN ('needs_review','ready')) THEN 1 ELSE NULL END,?`).bind(guard,body.batch_id,body.draft_revision,now));
  let result:any={batch_id:body.batch_id,draft_revision:body.draft_revision+1,actor:user,action:body.action};
  if(body.action==='accept_warnings'){
    const validation=JSON.parse(batch.validation_json);validation.accepted=true;validation.blocking=[];
    statements.push(db().prepare(`UPDATE growth_batches SET validation_json=?,draft_revision=draft_revision+1,updated_at=? WHERE batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(JSON.stringify(validation),now,body.batch_id,guard));
  }else{
    if(typeof body.row_id!=='string')return response(req,{error:'확인할 항목을 선택해 주세요.'},400);
    const row=await db().prepare('SELECT * FROM growth_batch_rows WHERE row_id=? AND batch_id=?').bind(body.row_id,body.batch_id).first<any>();if(!row)return response(req,{error:'확인할 항목을 찾지 못했습니다.'},404);
    if(body.action==='undo'||body.action==='reset'){
      const event=body.action==='undo'
        ?await db().prepare("SELECT * FROM growth_review_events WHERE event_id=? AND batch_id=? AND row_id=? AND status='active'").bind(body.event_id||'',body.batch_id,body.row_id).first<any>()
        :await db().prepare("SELECT * FROM growth_review_events WHERE batch_id=? AND row_id=? AND status='active' ORDER BY created_at,event_id LIMIT 1").bind(body.batch_id,body.row_id).first<any>();
      if(!event)return response(req,{error:'되돌릴 Draft 변경을 찾지 못했습니다.'},409);
      if(body.action==='undo'){
        const latest=await db().prepare("SELECT event_id FROM growth_review_events WHERE batch_id=? AND row_id=? AND status='active' ORDER BY created_at DESC,event_id DESC LIMIT 1").bind(body.batch_id,body.row_id).first<{event_id:string}>();
        if(latest?.event_id!==event.event_id)return response(req,{error:'가장 최근 변경부터 되돌려 주세요.'},409);
      }
      const previous=parseState(event.before_json);
      statements.push(restoreSql(previous,body.row_id,body.batch_id,guard));
      statements.push(body.action==='undo'
        ?db().prepare("UPDATE growth_review_events SET status='undone' WHERE event_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(event.event_id,guard)
        :db().prepare("UPDATE growth_review_events SET status='cancelled' WHERE batch_id=? AND row_id=? AND status='active' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(body.batch_id,body.row_id,guard));
      result={...result,row_id:body.row_id,event_id:event.event_id,restored:previous};
    }else{
      let status:string,memberId:string|null=null,proposedId:string|null=null,display:string|null=null,alias=0,membership='observed';
      let power=body.power??row.power,level=body.level??row.level,rank=body.rank??row.rank;
      if(body.action==='connect'||body.action==='direct_connect'){
        if(typeof body.member_id!=='string'||!await db().prepare('SELECT 1 ok FROM growth_members WHERE member_id=?').bind(body.member_id).first())return response(req,{error:'연결할 기존 길드원을 확인해 주세요.'},400);
        status='resolved';memberId=body.member_id;alias=body.confirm_alias===true?1:0;
      }else if(body.action==='new'||body.action==='direct_new'){
        display=String(body.display_name||'').trim();if(!display||display.length>100)return response(req,{error:'신규 길드원 닉네임을 확인해 주세요.'},400);
        proposedId='new_'+(await sha(body.batch_id+'\0'+body.row_id+'\0'+display)).slice(0,32);status='new';
      }else if(body.action==='unobserved'){
        if(typeof body.member_id!=='string'||!await db().prepare('SELECT 1 ok FROM growth_members WHERE member_id=?').bind(body.member_id).first())return response(req,{error:'미확인으로 유지할 길드원을 확인해 주세요.'},400);
        status='unobserved';memberId=body.member_id;membership='unobserved';power=null;level=null;rank=null;
      }else if(body.action==='hold'){status='held';membership='unknown';}
      else return response(req,{error:'확인 처리 방법을 선택해 주세요.'},400);
      if(['resolved','new'].includes(status)&&(!Number.isSafeInteger(power)||power<0||power>999_999_999_999||!Number.isSafeInteger(level)||level<1||level>999||typeof rank!=='string'||!/^R[1-5]$/.test(rank)))return response(req,{error:'전투력·레벨·등급을 확인해 주세요.'},400);
      const after={resolution_status:status,resolved_member_id:memberId,proposed_member_id:proposedId,proposed_display_name:display,confirm_alias:alias,power,level,rank,membership_state:membership,uncertainty_reason:status==='held'?row.uncertainty_reason:null};
      const eventId='grev_'+body.mutation;
      statements.push(restoreSql(after,body.row_id,body.batch_id,guard));
      statements.push(db().prepare(`INSERT INTO growth_review_events(event_id,mutation,batch_id,row_id,action,before_json,after_json,status,draft_revision,actor,created_at) SELECT ?,?,?,?,?,?,?,'active',?,?,? WHERE EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(eventId,body.mutation,body.batch_id,body.row_id,body.action,JSON.stringify(snapshot(row)),JSON.stringify(after),body.draft_revision+1,user,now,guard));
      result={...result,row_id:body.row_id,event_id:eventId,before:snapshot(row),after};
    }
    statements.push(db().prepare(`UPDATE growth_batches SET draft_revision=draft_revision+1,updated_at=? WHERE batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(now,body.batch_id,guard));
  }
  statements.push(stateRefresh(body.batch_id,guard));
  statements.push(db().prepare('INSERT INTO growth_mutations(mutation,operation,result_json,created_at) VALUES(?,?,?,?)').bind(body.mutation,'review',JSON.stringify(result),now));
  await db().batch(statements);const view=await batchView(body.batch_id);return response(req,{duplicate:false,result,...view});
}catch(e){return response(req,{error:'다른 기기에서 Draft가 변경됐거나 저장을 완료하지 못했습니다.',detail:e instanceof Error?e.message:'unknown'},409);}}
