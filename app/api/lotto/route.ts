import { actor,db,response,validOrigin } from '../../../lib/store';
import { LOTTO_KIND,emptyLotto,validateLotto,addLotto,type LottoData } from '../../../lib/lotto';
export const dynamic='force-dynamic';
type Row={revision:number;payload:string;updated_at:string};
async function readLotto(){const row=await db().prepare('SELECT revision,payload,updated_at FROM documents WHERE kind=?').bind(LOTTO_KIND).first<Row>();return {revision:row?.revision||0,data:row?JSON.parse(row.payload) as LottoData:emptyLotto(),updatedAt:row?.updated_at||null};}
export function OPTIONS(req:Request){return response(req,{},204);}
// 누구나 볼 수 있습니다(기록 목록).
export async function GET(req:Request){try{const doc=await readLotto();return response(req,{schema:'3on-lotto-v1',revision:doc.revision,draws:doc.data.draws});}catch{return response(req,{error:'로또 추첨기 기록을 읽지 못했습니다.'},503);}}
// 관리자만 추첨 기록을 남깁니다. 저장 전 자료는 자동 백업하고, 다른 기기와 동시에 저장하면 한쪽만 들어갑니다.
export async function POST(req:Request){
 let committed:(()=>Promise<Response|null>)|null=null;
 try{
  if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);
  const user=await actor(req);if(!user)return response(req,{error:'관리자 인증이 필요합니다.'},401);
  const body=await req.text();if(body.length>200000)return response(req,{error:'자료가 너무 큽니다.'},413);
  const b=JSON.parse(body);
  if(!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.mutation!=='string'||!/^[a-f0-9-]{32,64}$/.test(b.mutation))return response(req,{error:'저장 요청을 확인해 주세요.'},400);
  committed=async()=>await db().prepare('SELECT 1 FROM documents WHERE kind=? AND last_mutation=?').bind(LOTTO_KIND,b.mutation).first()?response(req,{...(await readLotto()),recovered:true}):null;
  const draw=validateLotto(b.draw);
  const current=await readLotto();
  if(current.revision!==b.revision)return response(req,{error:'다른 기기에서 추첨 기록이 바뀌었습니다. 다시 시도해 주세요.',revision:current.revision},409);
  const stamp=new Date().toISOString(),data=addLotto(current.data,{...draw,at:stamp,actor:user});
  const results=await db().batch([
   db().prepare('INSERT INTO documents(kind,revision,payload,updated_at,actor,last_mutation) VALUES(?,0,?,?,?,?) ON CONFLICT(kind) DO NOTHING').bind(LOTTO_KIND,JSON.stringify(emptyLotto()),stamp,user,''),
   db().prepare('INSERT INTO backups(mutation,kind,revision,payload,saved_at,actor) SELECT ?,kind,revision,payload,?,? FROM documents WHERE kind=? AND revision=?').bind(b.mutation,stamp,user,LOTTO_KIND,b.revision),
   db().prepare('UPDATE documents SET payload=?,revision=revision+1,updated_at=?,actor=?,last_mutation=? WHERE kind=? AND revision=? AND EXISTS(SELECT 1 FROM backups WHERE mutation=? AND kind=? AND revision=?)').bind(JSON.stringify(data),stamp,user,b.mutation,LOTTO_KIND,b.revision,b.mutation,LOTTO_KIND,b.revision),
   db().prepare('DELETE FROM backups WHERE kind=? AND revision<(SELECT revision-2 FROM documents WHERE kind=?)').bind(LOTTO_KIND,LOTTO_KIND),
  ]);
  if(results[2].meta.changes!==1)return response(req,{error:'다른 기기에서 추첨 기록이 바뀌었습니다. 다시 시도해 주세요.'},409);
  const after=await readLotto();
  return response(req,{schema:'3on-lotto-v1',revision:after.revision,draws:after.data.draws});
 }catch(e){try{const saved=await committed?.();if(saved)return saved;}catch{/* 원래 오류를 알립니다 */}
  return response(req,{error:e instanceof Error&&/확인해 주세요/.test(e.message)?e.message:'추첨 기록을 저장하지 못했습니다. 다시 시도해 주세요.'},400);}
}
