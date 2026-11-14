import { actor,db,read,response,validOrigin } from '../../../../lib/store';
import { VIP_KIND,thresholdOf,ROSTER_GUARD_SQL,SCORE_REFERENCE_GUARD_SQL,emptyWeekly,readWeekly,readRoster,readScoreRoster,weeklyView,prepareWeekly,replaceWeekly,sameSnapshot,eligibility } from '../../../../lib/vip-weekly';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}
export async function GET(req:Request){try{
 const database=db();
 if(new URL(req.url).searchParams.has('backups')){
  if(!await actor(req))return response(req,{error:'관리자 인증이 필요합니다.'},401);
  const rows=await database.prepare('SELECT revision,payload,saved_at FROM backups WHERE kind=? ORDER BY revision DESC LIMIT 2').bind(VIP_KIND).all<{revision:number;payload:string;saved_at:string}>();
  return response(req,{backups:rows.results.map(r=>({revision:r.revision,data:JSON.parse(r.payload),savedAt:r.saved_at}))});
 }
 const [document,carriage]=await Promise.all([readWeekly(database),read('carriage')]),roster=await readRoster(database);
 const now=Date.now(),view=weeklyView(document.data,now),scoreMembers=await readScoreRoster(database,roster.members);
 // 2026-11-12 사용자 결정: 신규 인원은 가입한 날(수집기가 처음 명단에 등록한 날, KST)에 VIP 1회 받은 것으로 칩니다.
 const kst=(v:number|string|null)=>{const t=typeof v==='number'?v:Date.parse(String(v));return Number.isFinite(t)?new Date(t+9*3_600_000).toISOString().slice(0,10):null;};
 const registered=new Map((await database.prepare('SELECT member_id,MIN(created_at) first FROM growth_external_ids GROUP BY member_id').all<{member_id:string;first:number|string|null}>()).results.map(r=>[r.member_id,kst(r.first)]));
 // 다시 들어온 사람(2026-11-12 사용자 결정): VIP 횟수는 이어 가고, 마지막 VIP는 다시 들어온 날로 봅니다.
 // 명단 합류(roster_join)가 그 전의 명단 이탈(roster_leave)보다 하루 이상 뒤에 있어야 다시 들어온 것입니다(2026-11-14 사용자 결정:
 // 잠깐 빠졌다 돌아온 수집 오류는 재가입이 아님). 수집 오류로 확인돼 무효(void) 표시한 이탈 기록은 보지 않습니다.
 const moves=(await database.prepare("SELECT member_id,kind,MAX(source_as_of) at FROM growth_auto_events WHERE kind IN ('roster_join','roster_leave') AND member_id IS NOT NULL AND status<>'void' GROUP BY member_id,kind").all<{member_id:string;kind:string;at:number}>()).results;
 const lastJoin=new Map(moves.filter(r=>r.kind==='roster_join').map(r=>[r.member_id,r.at])),lastLeave=new Map(moves.filter(r=>r.kind==='roster_leave').map(r=>[r.member_id,r.at]));
 const joinOf=(id:string)=>{const at=lastJoin.get(id),first=registered.get(id)??null;if(at===undefined)return {joinedOn:first,rejoinedOn:null};const day=kst(at),left=lastLeave.get(id);
  const back=left!==undefined&&at-left>=86_400_000;return {joinedOn:back?day:(first??day),rejoinedOn:back?day:null};};
 return response(req,{schema:'3on-vip-weekly-v1',threshold:thresholdOf(carriage.data as {vipThreshold?:number}),timezone:'Asia/Seoul',serverTime:new Date(now).toISOString(),revision:document.revision,...view,scoreMembers,roster:{snapshotId:roster.snapshotId,sourceAsOf:roster.sourceAsOf,receivedAt:roster.receivedAt},rosterPending:roster.pending,snapshotAdded:roster.snapshotAdded,members:roster.members.map(m=>({...m,...joinOf(m.memberId),eligibility:eligibility(m,carriage.data as {vipExcludedMembers?:Record<string,number>},view.active,now)}))});
 }catch{return response(req,{error:'마차 명단·주간 점수를 확인하지 못했습니다. VIP 선택을 보류합니다.'},503);}}
export async function POST(req:Request){
 // If D1 commits the batch but the reply fails (slow or busy), report the save that did happen.
 let committed:(()=>Promise<Response|null>)|null=null;
 try{
 if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);
 const user=await actor(req);if(!user)return response(req,{error:'관리자 인증이 필요합니다.'},401);
 if(Number(req.headers.get('Content-Length')||0)>250000)return response(req,{error:'자료가 너무 큽니다.'},413);
 const text=await req.text();if(text.length>250000)return response(req,{error:'자료가 너무 큽니다.'},413);
 const b=JSON.parse(text);
 committed=async()=>typeof b.mutation==='string'&&await db().prepare('SELECT 1 FROM documents WHERE kind=? AND last_mutation=?').bind(VIP_KIND,b.mutation).first()?response(req,{...await readWeekly(db()),recovered:true}):null;
 if(!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.mutation!=='string'||!/^[a-f0-9-]{32,64}$/.test(b.mutation))return response(req,{error:'주간 저장 요청을 확인해 주세요.'},400);
 const database=db(),duplicate=await database.prepare('SELECT kind FROM backups WHERE mutation=?').bind(b.mutation).first<{kind:string}>();
 if(duplicate)return duplicate.kind===VIP_KIND?response(req,{...await readWeekly(database),duplicate:true}):response(req,{error:'저장 요청 식별자가 중복되었습니다.'},409);
 const current=await readWeekly(database),roster=await readRoster(database),now=Date.now();
 if(current.revision!==b.revision)return response(req,{error:'다른 기기에서 점수가 변경되었습니다. 최신 자료를 다시 확인해 주세요.',revision:current.revision},409);
 const scoreMembers=await readScoreRoster(database,roster.members);
 const next=prepareWeekly(b.snapshot,roster.members,now,weeklyView(current.data,now).active?.appliesOn,scoreMembers);
 if([current.data.current,current.data.pending].some(w=>sameSnapshot(w,next)))return response(req,{...current,duplicate:true});
 const data=replaceWeekly(current.data,next,now),stamp=new Date(now).toISOString();
 const selected=roster.members.filter(m=>m.current&&next.rows.some(r=>r.memberId===m.memberId));
 const references=scoreMembers.filter(m=>next.rows.some(r=>r.memberId===m.memberId));
 const results=await database.batch([
  database.prepare('INSERT INTO documents(kind,revision,payload,updated_at,actor,last_mutation) VALUES(?,0,?,?,?,?) ON CONFLICT(kind) DO NOTHING').bind(VIP_KIND,JSON.stringify(emptyWeekly()),stamp,user,''),
  database.prepare('INSERT INTO backups(mutation,kind,revision,payload,saved_at,actor) SELECT ?,kind,revision,payload,?,? FROM documents WHERE kind=? AND revision=?').bind(b.mutation,stamp,user,VIP_KIND,b.revision),
  database.prepare(`UPDATE documents SET payload=CASE WHEN (SELECT snapshot_id FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 1) IS ? AND (SELECT value FROM growth_meta WHERE key='identity_revision') IS ? AND ${ROSTER_GUARD_SQL} AND ${SCORE_REFERENCE_GUARD_SQL} THEN ? ELSE NULL END,revision=revision+1,updated_at=?,actor=?,last_mutation=? WHERE kind=? AND revision=? AND EXISTS(SELECT 1 FROM backups WHERE mutation=? AND kind=? AND revision=?)`).bind(roster.snapshotId,roster.identityRevision,JSON.stringify(selected),roster.snapshotId,selected.length,JSON.stringify(references),references.length,JSON.stringify(data),stamp,user,b.mutation,VIP_KIND,b.revision,b.mutation,VIP_KIND,b.revision),
  database.prepare('DELETE FROM backups WHERE kind=? AND revision<(SELECT revision-2 FROM documents WHERE kind=?)').bind(VIP_KIND,VIP_KIND),
 ]);
 if(results[2].meta.changes!==1)return response(req,{error:'명단 또는 점수가 변경되었습니다. 최신 자료로 다시 확인해 주세요.'},409);
 return response(req,await readWeekly(database));
 }catch(e){try{const saved=await committed?.();if(saved)return saved;}catch{/* fall through to the original error */}
 if(e instanceof Error&&e.message.includes('NOT NULL constraint failed: documents.payload'))return response(req,{error:'명단이 변경되었습니다. 다시 확인해 주세요.'},409);return response(req,{error:e instanceof Error?e.message:'주간 점수를 저장하지 못했습니다.'},400);}}
