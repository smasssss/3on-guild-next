import { actor,db,read,response,validOrigin } from '../../../../lib/store';
import { VIP_KIND,THRESHOLD,ROSTER_GUARD_SQL,emptyWeekly,readWeekly,readRoster,weeklyView,prepareWeekly,replaceWeekly,sameSnapshot,eligibility } from '../../../../lib/vip-weekly';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}
export async function GET(req:Request){try{
 const database=db();
 if(new URL(req.url).searchParams.has('backups')){
  if(!await actor(req))return response(req,{error:'관리자 인증이 필요합니다.'},401);
  const rows=await database.prepare('SELECT revision,payload,saved_at FROM backups WHERE kind=? ORDER BY revision DESC LIMIT 2').bind(VIP_KIND).all<{revision:number;payload:string;saved_at:string}>();
  return response(req,{backups:rows.results.map(r=>({revision:r.revision,data:JSON.parse(r.payload),savedAt:r.saved_at}))});
 }
 const [roster,document,carriage]=await Promise.all([readRoster(database),readWeekly(database),read('carriage')]);
 const now=Date.now(),view=weeklyView(document.data,now);
 return response(req,{schema:'3on-vip-weekly-v1',threshold:THRESHOLD,timezone:'Asia/Seoul',serverTime:new Date(now).toISOString(),revision:document.revision,...view,roster:{snapshotId:roster.snapshotId,sourceAsOf:roster.sourceAsOf,receivedAt:roster.receivedAt},members:roster.members.map(m=>({...m,eligibility:eligibility(m,carriage.data as {vipExcludedMembers?:Record<string,number>},view.active,now)}))});
 }catch{return response(req,{error:'마차 명단·주간 점수를 확인하지 못했습니다. VIP 선택을 보류합니다.'},503);}}
export async function POST(req:Request){try{
 if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);
 const user=await actor(req);if(!user)return response(req,{error:'관리자 인증이 필요합니다.'},401);
 if(Number(req.headers.get('Content-Length')||0)>250000)return response(req,{error:'자료가 너무 큽니다.'},413);
 const text=await req.text();if(text.length>250000)return response(req,{error:'자료가 너무 큽니다.'},413);
 const b=JSON.parse(text);
 if(!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.mutation!=='string'||!/^[a-f0-9-]{32,64}$/.test(b.mutation))return response(req,{error:'주간 저장 요청을 확인해 주세요.'},400);
 const database=db(),duplicate=await database.prepare('SELECT kind FROM backups WHERE mutation=?').bind(b.mutation).first<{kind:string}>();
 if(duplicate)return duplicate.kind===VIP_KIND?response(req,{...await readWeekly(database),duplicate:true}):response(req,{error:'저장 요청 식별자가 중복되었습니다.'},409);
 const [roster,current]=await Promise.all([readRoster(database),readWeekly(database)]),now=Date.now();
 if(current.revision!==b.revision)return response(req,{error:'다른 기기에서 점수가 변경되었습니다. 최신 자료를 다시 확인해 주세요.',revision:current.revision},409);
 const next=prepareWeekly(b.snapshot,roster.members,now);
 if([current.data.current,current.data.pending].some(w=>sameSnapshot(w,next)))return response(req,{...current,duplicate:true});
 const data=replaceWeekly(current.data,next,now),stamp=new Date(now).toISOString();
 const results=await database.batch([
  database.prepare('INSERT INTO documents(kind,revision,payload,updated_at,actor,last_mutation) VALUES(?,0,?,?,?,?) ON CONFLICT(kind) DO NOTHING').bind(VIP_KIND,JSON.stringify(emptyWeekly()),stamp,user,''),
  database.prepare('INSERT INTO backups(mutation,kind,revision,payload,saved_at,actor) SELECT ?,kind,revision,payload,?,? FROM documents WHERE kind=? AND revision=?').bind(b.mutation,stamp,user,VIP_KIND,b.revision),
  database.prepare(`UPDATE documents SET payload=CASE WHEN (SELECT snapshot_id FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 1) IS ? AND (SELECT value FROM growth_meta WHERE key='identity_revision') IS ? AND ${ROSTER_GUARD_SQL} THEN ? ELSE NULL END,revision=revision+1,updated_at=?,actor=?,last_mutation=? WHERE kind=? AND revision=? AND EXISTS(SELECT 1 FROM backups WHERE mutation=? AND kind=? AND revision=?)`).bind(roster.snapshotId,roster.identityRevision,JSON.stringify(roster.members.filter(m=>next.rows.some(r=>r.memberId===m.memberId))),roster.snapshotId,next.rows.length,JSON.stringify(data),stamp,user,b.mutation,VIP_KIND,b.revision,b.mutation,VIP_KIND,b.revision),
  database.prepare('DELETE FROM backups WHERE kind=? AND revision<(SELECT revision-2 FROM documents WHERE kind=?)').bind(VIP_KIND,VIP_KIND),
 ]);
 if(results[2].meta.changes!==1)return response(req,{error:'명단 또는 점수가 변경되었습니다. 최신 자료로 다시 확인해 주세요.'},409);
 return response(req,await readWeekly(database));
 }catch(e){if(e instanceof Error&&e.message.includes('NOT NULL constraint failed: documents.payload'))return response(req,{error:'명단이 변경되었습니다. 다시 확인해 주세요.'},409);return response(req,{error:e instanceof Error?e.message:'주간 점수를 저장하지 못했습니다.'},400);}}
