import { actor, db, response, validOrigin } from '../../../../lib/store';
import { currentMembers, errorMessage, meta, packageHashes, parsePackage, validMutation } from '../../../../lib/growth';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}

function placeholders(rows:number,cols:number){return Array.from({length:rows},()=>`(${Array(cols).fill('?').join(',')})`).join(',');}
function chunks<T>(items:T[],size:number){const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;}

export async function POST(req:Request){try{
  if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);
  const user=await actor(req);if(!user)return response(req,{error:'관리자 비밀번호를 인증해 주세요.'},401);
  const raw=await req.text();let pkg;try{pkg=parsePackage(raw);}catch(e){return response(req,{error:errorMessage(e instanceof Error?e.message:'')},400);}
  const operation=pkg.operation_id||crypto.randomUUID();if(!validMutation(operation))return response(req,{error:'작업 식별값을 확인해 주세요.'},400);
  const hashes=await packageHashes(pkg);if(pkg.package_hash&&pkg.package_hash!==hashes.packageHash)return response(req,{error:'파일 내용과 package hash가 일치하지 않습니다.'},400);
  const existing=await db().prepare('SELECT batch_id,state,draft_revision,validation_json,published_revision FROM growth_batches WHERE package_hash=? OR (semantic_hash=? AND observed_date=? AND slot=?) LIMIT 1').bind(hashes.packageHash,hashes.semanticHash,pkg.observed_date,pkg.slot).first<any>();
  if(existing)return response(req,{schema:'3on-growth-upload-v1',duplicate:true,batch:{...existing,validation:JSON.parse(existing.validation_json)}});
  const sourceExisting=await db().prepare(`SELECT b.batch_id,b.observed_date,b.slot FROM growth_batch_sources s JOIN growth_batches b ON b.batch_id=s.batch_id WHERE s.source_hash IN (${pkg.source_hashes.map(()=>'?').join(',')}) LIMIT 1`).bind(...pkg.source_hashes).first<any>();
  if(sourceExisting)return response(req,{error:'같은 원본 파일이 이미 다른 성장 묶음에 사용됐습니다.',existing:sourceExisting},409);
  if(pkg.supersedes_batch_id){const target=await db().prepare("SELECT batch_id,state FROM growth_batches WHERE batch_id=? AND state='published'").bind(pkg.supersedes_batch_id).first();if(!target)return response(req,{error:'정정 대상 묶음을 찾을 수 없습니다.'},409);}
  const gm=await meta(),current=await currentMembers();
  const memberRows=await db().prepare(`SELECT m.member_id,m.legacy_canonical,m.display_name,d.raw_value alias FROM growth_members m LEFT JOIN growth_identity_decisions d ON d.member_id=m.member_id AND d.status='confirmed'`).all<any>();
  const byValue=new Map<string,Set<string>>();
  for(const m of memberRows.results)for(const value of [m.legacy_canonical,m.display_name,m.alias])if(value){if(!byValue.has(value))byValue.set(value,new Set());byValue.get(value)!.add(m.member_id);}
  const currentById=new Map(current.members.map((m:any)=>[m.member_id,m]));
  const rawCounts=new Map<string,number>();for(const row of pkg.rows)rawCounts.set(row.raw_name,(rawCounts.get(row.raw_name)||0)+1);
  const resolvedCounts=new Map<string,number>();
  const prepared=[] as any[];const warnings:any[]=[];const now=new Date().toISOString();
  if(pkg.expected_member_count!==pkg.rows.length)warnings.push({code:'member_count',message:`예상 ${pkg.expected_member_count}명과 파일 ${pkg.rows.length}명이 다릅니다.`,blocking:true});
  for(let i=0;i<pkg.rows.length;i++){
    const row=pkg.rows[i],candidate=(row.normalized_candidate||row.raw_name).trim();const matches=[...(byValue.get(candidate)||new Set())];
    let status='unresolved',memberId:string|null=null,reason=row.uncertainty_reason||'';
    if(matches.length===1){memberId=matches[0];status='resolved';}
    else if(matches.length>1)reason=reason||'동일한 이름 후보가 여러 명입니다.';else reason=reason||'기존 길드원 연결을 확인해 주세요.';
    if(row.uncertain){status='unresolved';reason=reason||'AI 판독 확인이 필요합니다.';}
    if(rawCounts.get(row.raw_name)!==1){status='unresolved';reason='파일 안에 같은 원문 닉네임이 중복되었습니다.';}
    if(memberId){resolvedCounts.set(memberId,(resolvedCounts.get(memberId)||0)+1);const prev=currentById.get(memberId) as any;if(prev&&row.power!=null){const diff=Math.abs(row.power-prev.power),ratio=prev.power?diff/prev.power:0;if(diff>50_000_000||ratio>.75){status='unresolved';reason='이전 전투력과 차이가 커 확인이 필요합니다.';}}}
    if(row.power==null||row.level==null||row.rank==null){status='unresolved';reason=reason||'전투력·레벨·등급 중 확인되지 않은 값이 있습니다.';}
    prepared.push({row,rowIndex:i,candidate,memberId,status,reason});
  }
  for(const item of prepared)if(item.memberId&&resolvedCounts.get(item.memberId)!==1){item.status='unresolved';item.reason='같은 기존 길드원으로 연결된 행이 중복되었습니다.';}
  const unresolved=prepared.filter(x=>x.status!=='resolved').length;
  const validation={warnings,blocking:warnings.filter(x=>x.blocking).map(x=>x.code),accepted:false,unresolved,row_count:pkg.rows.length,expected_count:pkg.expected_member_count};
  const state=unresolved||validation.blocking.length?'needs_review':'ready';
  const batchId='gb_'+hashes.packageHash.slice(0,32);
  const statements:any[]=[];
  statements.push(db().prepare(`INSERT INTO growth_batches(batch_id,package_hash,semantic_hash,operation_id,observed_date,slot,expected_count,source_hashes_json,state,identity_revision,base_growth_revision,draft_revision,validation_json,supersedes_batch_id,created_at,updated_at,published_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).bind(batchId,hashes.packageHash,hashes.semanticHash,operation,pkg.observed_date,pkg.slot,pkg.expected_member_count,JSON.stringify(pkg.source_hashes),state,gm.identityRevision,gm.growthRevision,1,JSON.stringify(validation),pkg.supersedes_batch_id||null,now,now));
  statements.push(db().prepare(`INSERT INTO growth_batch_sources(batch_id,source_hash) VALUES ${placeholders(pkg.source_hashes.length,2)}`).bind(...pkg.source_hashes.flatMap(x=>[batchId,x])));
  for(const part of chunks(prepared,5)){
    const values=part.flatMap(item=>{const row=item.row;return ['grow_'+hashes.packageHash.slice(0,20)+'_'+String(item.rowIndex).padStart(3,'0'),batchId,item.rowIndex,row.raw_name,item.candidate,item.memberId,item.status,item.memberId,null,null,0,row.power??null,row.level??null,row.rank??null,item.reason||null,JSON.stringify(row.source_position??null),row.membership_state||'observed',row.crop?'asset_'+hashes.packageHash.slice(0,16)+'_'+item.rowIndex:null,0];});
    statements.push(db().prepare(`INSERT INTO growth_batch_rows(row_id,batch_id,row_index,raw_name,candidate_name,candidate_member_id,resolution_status,resolved_member_id,proposed_member_id,proposed_display_name,confirm_alias,power,level,rank,uncertainty_reason,source_position_json,membership_state,crop_asset_id,review_version) VALUES ${placeholders(part.length,19)}`).bind(...values));
  }
  const assets=prepared.filter(x=>x.row.crop);for(const part of chunks(assets,10)){
    const values=part.flatMap(item=>{const bytes=Uint8Array.from(atob(item.row.crop.data_base64),(c:string)=>c.charCodeAt(0));const rowId='grow_'+hashes.packageHash.slice(0,20)+'_'+String(item.rowIndex).padStart(3,'0');return ['asset_'+hashes.packageHash.slice(0,16)+'_'+item.rowIndex,batchId,rowId,item.row.crop.mime_type,bytes,bytes.length,new Date(Date.now()+7*86400000).toISOString(),now];});
    statements.push(db().prepare(`INSERT INTO growth_review_assets(asset_id,batch_id,row_id,mime_type,bytes,size_bytes,expires_at,created_at) VALUES ${placeholders(part.length,8)}`).bind(...values));
  }
  await db().batch(statements);
  return response(req,{schema:'3on-growth-upload-v1',duplicate:false,batch:{batch_id:batchId,state,draft_revision:1,base_growth_revision:gm.growthRevision,identity_revision:gm.identityRevision,validation},review_count:unresolved},201);
}catch(e){return response(req,{error:'성장자료 업로드를 완료하지 못했습니다.',detail:e instanceof Error?e.message:'unknown'},400);}}
