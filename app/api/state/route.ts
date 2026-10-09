import { actor, db, defaults, kinds, read, response, validOrigin, type Kind } from '../../../lib/store';
import { validate } from '../../../lib/validate';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}
export async function GET(req:Request){try{return response(req,{schema:'3on-shared-v1',documents:await Promise.all(kinds.map(read))});}catch{return response(req,{error:'공유 DB를 읽지 못했습니다. 기존 자료는 유지됩니다.'},503);}}
export async function POST(req:Request){
  try{
    if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);
    const user=await actor(req);if(!user)return response(req,{error:'관리자 비밀번호를 인증해 주세요.'},401);
    if(Number(req.headers.get('Content-Length')||0)>2500000)return response(req,{error:'자료가 너무 큽니다.'},413);
    const bodyText=await req.text();if(bodyText.length>2500000)return response(req,{error:'자료가 너무 큽니다.'},413);
    const b=JSON.parse(bodyText),kind=b.kind as Kind;
    if(!kinds.includes(kind)||!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.mutation!=='string'||! /^[a-f0-9-]{32,64}$/.test(b.mutation))return response(req,{error:'잘못된 저장 요청입니다.'},400);
    const duplicate=await db().prepare('SELECT kind FROM backups WHERE mutation=?').bind(b.mutation).first<{kind:string}>();
    if(duplicate)return duplicate.kind===kind?response(req,{document:await read(kind),duplicate:true}):response(req,{error:'저장 요청 식별자가 중복되었습니다.'},409);
    const data=validate(kind,b.data),payload=JSON.stringify(data),now=new Date().toISOString();
    // D1 batch atomically snapshots and changes only the expected revision.
    const result=await db().batch([
      db().prepare('INSERT INTO documents(kind,revision,payload,updated_at,actor,last_mutation) VALUES(?,0,?,?,?,?) ON CONFLICT(kind) DO NOTHING').bind(kind,JSON.stringify(defaults(kind)),now,user,''),
      db().prepare('INSERT INTO backups(mutation,kind,revision,payload,saved_at,actor) SELECT ?,kind,revision,payload,?,? FROM documents WHERE kind=? AND revision=?').bind(b.mutation,now,user,kind,b.revision),
      db().prepare('UPDATE documents SET payload=?,revision=revision+1,updated_at=?,actor=?,last_mutation=? WHERE kind=? AND revision=? AND EXISTS(SELECT 1 FROM backups WHERE mutation=? AND kind=? AND revision=?)').bind(payload,now,user,b.mutation,kind,b.revision,b.mutation,kind,b.revision),
    ]);
    const document=await read(kind);
    if(result[2].meta.changes!==1)return response(req,{error:'다른 기기에서 자료가 변경되었습니다. 작성 내용을 유지했습니다. 최신 자료를 다시 불러온 뒤 확인해 주세요.',document},409);
    return response(req,{document});
  }catch(e){return response(req,{error:e instanceof Error&&e.message==='자료 형식을 확인해 주세요.'?e.message:'저장을 완료하지 못했습니다. 입력 내용을 유지하고 다시 시도해 주세요.'},400);}
}
