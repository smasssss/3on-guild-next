import { actor, db, response, validOrigin } from '../../../../lib/store';
import { meta, validMutation } from '../../../../lib/growth';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}

export async function POST(req:Request){try{
  if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);const user=await actor(req);if(!user)return response(req,{error:'관리자 인증이 필요합니다.'},401);
  const b=await req.json() as any;if(typeof b.batch_id!=='string'||!Number.isSafeInteger(b.growth_revision)||!Number.isSafeInteger(b.identity_revision)||!Number.isSafeInteger(b.draft_revision)||!validMutation(b.mutation))return response(req,{error:'공개 요청 형식을 확인해 주세요.'},400);
  const duplicate=await db().prepare("SELECT result_json FROM growth_mutations WHERE mutation=? AND operation='publish'").bind(b.mutation).first<{result_json:string}>();if(duplicate)return response(req,{duplicate:true,...JSON.parse(duplicate.result_json)});
  const batch=await db().prepare("SELECT * FROM growth_batches WHERE batch_id=? AND state='ready'").bind(b.batch_id).first<any>();if(!batch)return response(req,{error:'공개 준비가 끝난 성장 묶음이 아닙니다.'},409);
  const current=await meta();if(current.growthRevision!==b.growth_revision||current.identityRevision!==b.identity_revision)return response(req,{error:'다른 기기에서 성장 또는 동일인 자료가 변경됐습니다.',current},409);
  const changes=await db().prepare("SELECT COUNT(*) n FROM growth_batch_rows WHERE batch_id=? AND (resolution_status='new' OR confirm_alias=1)").bind(b.batch_id).first<{n:number}>();
  const identityNext=current.identityRevision+(Number(changes?.n||0)>0?1:0),growthNext=current.growthRevision+1,now=new Date().toISOString(),publicationId='pub_'+b.mutation,guard='publish_'+b.mutation;
  const result={schema:'3on-growth-publish-v1',batch_id:b.batch_id,growth_revision:growthNext,identity_revision:identityNext,publication_id:publicationId};
  const statements:any[]=[];
  statements.push(db().prepare(`INSERT INTO growth_tx_guards(guard_id,ok,created_at) SELECT ?,CASE WHEN
    (SELECT value FROM growth_meta WHERE key='growth_revision')=? AND
    (SELECT value FROM growth_meta WHERE key='identity_revision')=? AND
    EXISTS(SELECT 1 FROM growth_batches WHERE batch_id=? AND state='ready' AND draft_revision=? AND base_growth_revision=? AND identity_revision=?) AND
    NOT EXISTS(SELECT 1 FROM growth_batch_rows WHERE batch_id=? AND resolution_status NOT IN ('resolved','new','unobserved')) AND
    NOT EXISTS(SELECT 1 FROM growth_batch_rows WHERE batch_id=? AND COALESCE(resolved_member_id,proposed_member_id) IS NOT NULL GROUP BY COALESCE(resolved_member_id,proposed_member_id) HAVING COUNT(*)>1)
    THEN 1 ELSE NULL END,?`).bind(guard,String(current.growthRevision),String(current.identityRevision),b.batch_id,b.draft_revision,current.growthRevision,current.identityRevision,b.batch_id,b.batch_id,now));
  statements.push(db().prepare(`INSERT INTO growth_members(member_id,legacy_canonical,display_name,source,created_at)
    SELECT proposed_member_id,NULL,proposed_display_name,'review-new',? FROM growth_batch_rows WHERE batch_id=? AND resolution_status='new' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(now,b.batch_id,guard));
  statements.push(db().prepare(`INSERT INTO growth_identity_decisions(decision_id,identity_revision,raw_value,decision_kind,member_id,display_name,source,batch_id,status,created_at)
    SELECT 'idec_new_'||row_id,?,proposed_display_name,'new',proposed_member_id,proposed_display_name,'user-review',batch_id,'confirmed',? FROM growth_batch_rows WHERE batch_id=? AND resolution_status='new' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(identityNext,now,b.batch_id,guard));
  statements.push(db().prepare(`INSERT INTO growth_identity_decisions(decision_id,identity_revision,raw_value,decision_kind,member_id,display_name,source,batch_id,status,created_at)
    SELECT 'idec_alias_'||row_id,?,raw_name,'alias',resolved_member_id,(SELECT display_name FROM growth_members WHERE member_id=resolved_member_id),'user-review',batch_id,'confirmed',? FROM growth_batch_rows r
    WHERE batch_id=? AND confirm_alias=1 AND resolution_status='resolved' AND NOT EXISTS(SELECT 1 FROM growth_identity_decisions d WHERE d.raw_value=r.raw_name AND d.member_id=r.resolved_member_id AND d.status='confirmed') AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(identityNext,now,b.batch_id,guard));
  statements.push(db().prepare(`INSERT INTO growth_observations(observation_id,member_id,batch_id,observed_date,slot,power,level,rank,label,source_type,legacy_index,legacy_source_fingerprint,original_order,supersedes_observation_id,status,created_at)
    SELECT 'obs_'||r.row_id,COALESCE(r.resolved_member_id,r.proposed_member_id),r.batch_id,b.observed_date,b.slot,r.power,r.level,r.rank,
      CAST(CAST(substr(b.observed_date,6,2) AS INTEGER) AS TEXT)||'/'||CAST(CAST(substr(b.observed_date,9,2) AS INTEGER) AS TEXT),
      'package',NULL,NULL,?+r.row_index,
      (SELECT old.observation_id FROM growth_observations old WHERE old.batch_id=b.supersedes_batch_id AND old.member_id=COALESCE(r.resolved_member_id,r.proposed_member_id) ORDER BY old.original_order DESC LIMIT 1),
      'active',?
    FROM growth_batch_rows r JOIN growth_batches b ON b.batch_id=r.batch_id
    WHERE r.batch_id=? AND r.resolution_status IN ('resolved','new') AND r.membership_state='observed' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(growthNext*1000,now,b.batch_id,guard));
  statements.push(db().prepare(`INSERT INTO growth_membership_snapshots(batch_id,member_id,membership_state,row_order)
    SELECT ?,s.member_id,CASE WHEN s.membership_state IN ('current','observed','unobserved','new') THEN 'unobserved' ELSE s.membership_state END,s.row_order
    FROM growth_membership_snapshots s WHERE s.batch_id=(SELECT batch_id FROM growth_batches WHERE state='published' ORDER BY observed_date DESC,published_revision DESC LIMIT 1)
    AND NOT EXISTS(SELECT 1 FROM growth_batch_rows r WHERE r.batch_id=? AND COALESCE(r.resolved_member_id,r.proposed_member_id)=s.member_id)
    AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(b.batch_id,b.batch_id,guard));
  statements.push(db().prepare(`INSERT OR REPLACE INTO growth_membership_snapshots(batch_id,member_id,membership_state,row_order)
    SELECT batch_id,COALESCE(resolved_member_id,proposed_member_id),CASE WHEN resolution_status='new' THEN 'new' ELSE membership_state END,row_index
    FROM growth_batch_rows WHERE batch_id=? AND resolution_status IN ('resolved','new','unobserved') AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)`).bind(b.batch_id,guard));
  if(batch.supersedes_batch_id){
    statements.push(db().prepare("UPDATE growth_batches SET state='superseded',updated_at=? WHERE batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(now,batch.supersedes_batch_id,guard));
    statements.push(db().prepare("UPDATE growth_publications SET status='inactive' WHERE batch_id=? AND status='active' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(batch.supersedes_batch_id,guard));
  }
  statements.push(db().prepare(`INSERT INTO growth_publications(publication_id,growth_revision,batch_id,identity_revision,status,event_kind,supersedes_publication_id,actor,created_at)
    VALUES(?,?,?,?,?,'publish',(SELECT publication_id FROM growth_publications WHERE batch_id=? ORDER BY growth_revision DESC LIMIT 1),?,?)`).bind(publicationId,growthNext,b.batch_id,identityNext,'active',batch.supersedes_batch_id||'',user,now));
  statements.push(db().prepare("UPDATE growth_batches SET state='published',published_revision=?,updated_at=? WHERE batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(growthNext,now,b.batch_id,guard));
  statements.push(db().prepare("UPDATE growth_meta SET value=?,updated_at=? WHERE key='growth_revision' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(String(growthNext),now,guard));
  statements.push(db().prepare("UPDATE growth_meta SET value=?,updated_at=? WHERE key='identity_revision' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(String(identityNext),now,guard));
  statements.push(db().prepare("UPDATE growth_review_assets SET expires_at=? WHERE batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(new Date(Date.now()+2*86400000).toISOString(),b.batch_id,guard));
  statements.push(db().prepare('INSERT INTO growth_mutations(mutation,operation,result_json,created_at) VALUES(?,?,?,?)').bind(b.mutation,'publish',JSON.stringify(result),now));
  await db().batch(statements);return response(req,{duplicate:false,...result});
}catch(e){return response(req,{error:'공개 중 충돌이 발생했습니다. 일부 자료는 공개되지 않았습니다.',detail:e instanceof Error?e.message:'unknown'},409);}}
