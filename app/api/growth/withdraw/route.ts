import { actor, db, response, validOrigin } from '../../../../lib/store';
import { meta, validMutation } from '../../../../lib/growth';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
  if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);const user=await actor(req);if(!user)return response(req,{error:'관리자 인증이 필요합니다.'},401);
  const b=await req.json() as any;if(typeof b.batch_id!=='string'||!Number.isSafeInteger(b.growth_revision)||!Number.isSafeInteger(b.identity_revision)||!validMutation(b.mutation))return response(req,{error:'철회 요청 형식을 확인해 주세요.'},400);
  const duplicate=await db().prepare("SELECT result_json FROM growth_mutations WHERE mutation=? AND operation='withdraw'").bind(b.mutation).first<{result_json:string}>();if(duplicate)return response(req,{duplicate:true,...JSON.parse(duplicate.result_json)});
  const target=await db().prepare("SELECT supersedes_batch_id FROM growth_batches WHERE batch_id=? AND state='published' AND published_revision>1").bind(b.batch_id).first<{supersedes_batch_id:string|null}>();
  if(!target)return response(req,{error:'철회할 수 있는 공개 성장 묶음이 아닙니다.'},409);
  const current=await meta();
  if(current.growthRevision!==b.growth_revision||current.identityRevision!==b.identity_revision)return response(req,{error:'다른 기기에서 성장 또는 동일인 자료가 변경됐습니다.',current},409);
  const identityChanges=await db().prepare("SELECT COUNT(*) n FROM growth_identity_decisions WHERE batch_id=? AND status='confirmed'").bind(b.batch_id).first<{n:number}>();
  const next=current.growthRevision+1,identityNext=current.identityRevision+(Number(identityChanges?.n||0)>0?1:0),now=new Date().toISOString(),guard='withdraw_'+b.mutation,result={schema:'3on-growth-withdraw-v1',batch_id:b.batch_id,growth_revision:next,identity_revision:identityNext,restored_batch_id:target.supersedes_batch_id||null};
  const statements:any[]=[
    db().prepare(`INSERT INTO growth_tx_guards(guard_id,ok,created_at) SELECT ?,CASE WHEN (SELECT value FROM growth_meta WHERE key='growth_revision')=? AND (SELECT value FROM growth_meta WHERE key='identity_revision')=? AND EXISTS(SELECT 1 FROM growth_batches WHERE batch_id=? AND state='published' AND published_revision>1) THEN 1 ELSE NULL END,?`).bind(guard,String(b.growth_revision),String(b.identity_revision),b.batch_id,now),
    db().prepare("UPDATE growth_batches SET state='withdrawn',updated_at=? WHERE batch_id=? AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(now,b.batch_id,guard),
    db().prepare("UPDATE growth_publications SET status='withdrawn' WHERE batch_id=? AND status='active' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(b.batch_id,guard),
    db().prepare("UPDATE growth_members SET display_name=(SELECT d.raw_value FROM growth_identity_decisions d WHERE d.batch_id=? AND d.member_id=growth_members.member_id AND d.decision_kind='nickname' AND d.status='confirmed' ORDER BY d.created_at DESC LIMIT 1) WHERE member_id IN (SELECT member_id FROM growth_identity_decisions WHERE batch_id=? AND decision_kind='nickname' AND status='confirmed') AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(b.batch_id,b.batch_id,guard),
    db().prepare("UPDATE growth_identity_decisions SET status='withdrawn' WHERE batch_id=? AND status='confirmed' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(b.batch_id,guard),
    db().prepare(`INSERT INTO growth_publications(publication_id,growth_revision,batch_id,identity_revision,status,event_kind,supersedes_publication_id,actor,created_at) VALUES(?,?,?,?,?,'withdraw',(SELECT publication_id FROM growth_publications WHERE batch_id=? ORDER BY growth_revision DESC LIMIT 1),?,?)`).bind('pub_withdraw_'+b.mutation,next,b.batch_id,identityNext,'event',b.batch_id,user,now),
    db().prepare("UPDATE growth_meta SET value=?,updated_at=? WHERE key='growth_revision' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(String(next),now,guard),
    db().prepare("UPDATE growth_meta SET value=?,updated_at=? WHERE key='identity_revision' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(String(identityNext),now,guard),
    db().prepare('INSERT INTO growth_mutations(mutation,operation,result_json,created_at) VALUES(?,?,?,?)').bind(b.mutation,'withdraw',JSON.stringify(result),now),
  ];
  if(target.supersedes_batch_id){
    statements.splice(3,0,
      db().prepare("UPDATE growth_batches SET state='published',updated_at=? WHERE batch_id=? AND state='superseded' AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(now,target.supersedes_batch_id,guard),
      db().prepare("UPDATE growth_publications SET status='active' WHERE publication_id=(SELECT publication_id FROM growth_publications WHERE batch_id=? AND event_kind='publish' ORDER BY growth_revision DESC LIMIT 1) AND EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id=?)").bind(target.supersedes_batch_id,guard)
    );
  }
  await db().batch(statements);return response(req,{duplicate:false,...result});
}catch(e){return response(req,{error:'철회를 완료하지 못했습니다. 기존 공개 상태를 유지합니다.',detail:e instanceof Error?e.message:'unknown'},409);}}
