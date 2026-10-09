import { actor, db, kinds, response } from '../../../lib/store';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}
export async function GET(req:Request){try{
  if(!await actor(req))return response(req,{error:'관리자 비밀번호 인증이 필요합니다.'},401);
  const kind=new URL(req.url).searchParams.get('kind');if(!kinds.includes(kind as any))return response(req,{error:'자료 종류를 확인하세요.'},400);
  const rows=await db().prepare('SELECT mutation,kind,revision,payload,saved_at FROM backups WHERE kind=? ORDER BY revision DESC LIMIT 100').bind(kind).all();
  return response(req,{backups:rows.results.map((r:any)=>({id:r.mutation,kind:r.kind,revision:r.revision,data:JSON.parse(r.payload),savedAt:r.saved_at}))});
}catch{return response(req,{error:'DB 백업을 읽지 못했습니다.'},503);}}
