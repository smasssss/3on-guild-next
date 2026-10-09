import { actor, db, response } from '../../../../lib/store';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{if(!await actor(req))return response(req,{error:'관리자 인증이 필요합니다.'},401);const rows=await db().prepare('SELECT batch_id,observed_date,slot,state,draft_revision,published_revision,validation_json,created_at,updated_at FROM growth_batches ORDER BY created_at DESC LIMIT 30').all<any>();return response(req,{batches:rows.results.map(r=>({...r,validation:JSON.parse(r.validation_json)}))});}catch{return response(req,{error:'성장 묶음 목록을 불러오지 못했습니다.'},503);}}
