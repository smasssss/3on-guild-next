import { actor, db, response, validOrigin } from '../../../../lib/store';
import { sha, validMutation } from '../../../../lib/growth';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}

async function batchView(batchId:string){
  const batch=await db().prepare('SELECT * FROM growth_batches WHERE batch_id=?').bind(batchId).first<any>();if(!batch)return null;
  const rows=await db().prepare(`SELECT r.*,m.legacy_canonical,m.display_name FROM growth_batch_rows r LEFT JOIN growth_members m ON m.member_id=r.resolved_member_id WHERE r.batch_id=? ORDER BY r.row_index`).bind(batchId).all<any>();
  return {batch:{...batch,validation:JSON.parse(batch.validation_json),source_hashes:JSON.parse(batch.source_hashes_json)},rows:rows.results.map(r=>({...r,source_position:JSON.parse(r.source_position_json||'null'),asset_url:r.crop_asset_id?'/api/growth/review/asset?asset_id='+encodeURIComponent(r.crop_asset_id):null}))};
}
export async function GET(req:Request){try{if(!await actor(req))return response(req,{error:'관리자 인증이 필요합니다.'},401);const id=new URL(req.url).searchParams.get('batch_id')||'';const view=await batchView(id);return view?response(req,view):response(req,{error:'성장 묶음을 찾을 수 없습니다.'},404);}catch{return response(req,{error:'확인 목록을 불러오지 못했습니다.'},503);}}

export async function POST(req:Request){try{
  if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);const user=await actor(req);if(!user)return response(req,{error:'관리자 인증이 필요합니다.'},401);
  const body=await req.json() as any;if(typeof body.batch_id!=='string'||!Number.isSafeInteger(body.draft_revision)||!validMutation(body.mutation))return response(req,{error:'확인 요청 형식을 확인해 주세요.'},400);
  const duplicate=await db().prepare("SELECT result_json FROM growth_mutations WHERE mutation=? AND operation='review'").bind(body.mutation).first<{result_json:string}>();if(duplicate){const view=await batchView(body.batch_id);return response(req,{duplicate:true,...view});}
  const batch=await db().prepare("SELECT * FROM growth_batches WHERE batch_id=? AND state IN ('needs_review','ready')").bind(body.batch_id).first<any>();if(!batch)return response(req,{error:'수정할 수 있는 성장 묶음이 아닙니다.'},409);
  const now=new Date().toISOString(),guard='review_'+body.mutation;const statements:any[]=[];
  statements.push(db().prepare(`INSERT INTO growth_tx_guards(guard_id,ok,created_at) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM growth_batches WHERE batch_id=? AND draft_revision=? AND state IN ('needs_review','ready')) THEN 1 ELSE NULL END,?`).bind(guard,body.batch_id,body.draft_revision,now));
  if(body.action==='accept_warnings'){
    const validation=JSON.parse(batch.validation_json);validation.accepted=true;validation.blocking=[];
    statements.push(db().prepare(`UPDATE growth_batches SET validation_json=?,draft_revision=draft_revision+1,updated_at=? WHERE batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(JSON.stringify(validation),now,body.batch_id,guard));
  }else{
    if(typeof body.row_id!=='string')return response(req,{error:'확인할 항목을 선택해 주세요.'},400);
    const row=await db().prepare('SELECT * FROM growth_batch_rows WHERE row_id=? AND batch_id=?').bind(body.row_id,body.batch_id).first<any>();if(!row)return response(req,{error:'확인할 항목을 찾지 못했습니다.'},404);
    let status:string,memberId:string|null=null,proposedId:string|null=null,display:string|null=null,alias=0,membership='observed';
    let power=body.power??row.power,level=body.level??row.level,rank=body.rank??row.rank;
    if(body.action==='connect'){
      if(typeof body.member_id!=='string'||!await db().prepare('SELECT 1 ok FROM growth_members WHERE member_id=?').bind(body.member_id).first())return response(req,{error:'연결할 기존 길드원을 확인해 주세요.'},400);
      status='resolved';memberId=body.member_id;alias=body.confirm_alias===true?1:0;
    }else if(body.action==='new'||body.action==='direct_new'){
      display=String(body.display_name||'').trim();if(!display||display.length>100)return response(req,{error:'신규 길드원 닉네임을 확인해 주세요.'},400);
      proposedId='new_'+(await sha(body.batch_id+'\0'+body.row_id+'\0'+display)).slice(0,32);status='new';
    }else if(body.action==='direct_connect'){
      if(typeof body.member_id!=='string'||!await db().prepare('SELECT 1 ok FROM growth_members WHERE member_id=?').bind(body.member_id).first())return response(req,{error:'연결할 기존 길드원을 확인해 주세요.'},400);
      status='resolved';memberId=body.member_id;alias=body.confirm_alias===true?1:0;
    }else if(body.action==='unobserved'){
      if(typeof body.member_id!=='string'||!await db().prepare('SELECT 1 ok FROM growth_members WHERE member_id=?').bind(body.member_id).first())return response(req,{error:'미확인으로 유지할 길드원을 확인해 주세요.'},400);
      status='unobserved';memberId=body.member_id;membership='unobserved';power=null;level=null;rank=null;
    }else if(body.action==='hold'){status='held';membership='unknown';}
    else return response(req,{error:'확인 처리 방법을 선택해 주세요.'},400);
    if(['resolved','new'].includes(status)&&(!Number.isSafeInteger(power)||power<0||power>999_999_999_999||!Number.isSafeInteger(level)||level<1||level>999||typeof rank!=='string'||!/^R[1-5]$/.test(rank)))return response(req,{error:'전투력·레벨·등급을 확인해 주세요.'},400);
    statements.push(db().prepare(`UPDATE growth_batch_rows SET resolution_status=?,resolved_member_id=?,proposed_member_id=?,proposed_display_name=?,confirm_alias=?,power=?,level=?,rank=?,membership_state=?,uncertainty_reason=NULL,review_version=review_version+1 WHERE row_id=? AND batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(status,memberId,proposedId,display,alias,power,level,rank,membership,body.row_id,body.batch_id,guard));
    statements.push(db().prepare(`UPDATE growth_batches SET draft_revision=draft_revision+1,updated_at=? WHERE batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(now,body.batch_id,guard));
  }
  statements.push(db().prepare(`UPDATE growth_batches SET state=CASE WHEN NOT EXISTS(SELECT 1 FROM growth_batch_rows WHERE batch_id=? AND resolution_status NOT IN ('resolved','new','unobserved')) AND json_array_length(json_extract(validation_json,'$.blocking'))=0 THEN 'ready' ELSE 'needs_review' END WHERE batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(body.batch_id,body.batch_id,guard));
  statements.push(db().prepare('INSERT INTO growth_mutations(mutation,operation,result_json,created_at) VALUES(?,?,?,?)').bind(body.mutation,'review',JSON.stringify({batch_id:body.batch_id,draft_revision:body.draft_revision+1,actor:user}),now));
  await db().batch(statements);const view=await batchView(body.batch_id);return response(req,{duplicate:false,...view});
}catch(e){return response(req,{error:'다른 기기에서 확인 내용이 변경됐거나 저장을 완료하지 못했습니다.',detail:e instanceof Error?e.message:'unknown'},409);}}
