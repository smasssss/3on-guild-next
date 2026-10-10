import { actor, db, response, validOrigin } from '../../../../lib/store';
import { currentMembers, errorMessage, meta, packageHashes, parsePackage, sha, validMutation } from '../../../../lib/growth';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}

function placeholders(rows:number,cols:number){return Array.from({length:rows},()=>`(${Array(cols).fill('?').join(',')})`).join(',');}
function chunks<T>(items:T[],size:number){const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;}
function compactName(value:string){return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]/gu,'');}
function editDistance(a:string,b:string){
  if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
  const prev=Array.from({length:b.length+1},(_,i)=>i),next=Array(b.length+1).fill(0);
  for(let i=1;i<=a.length;i++){next[0]=i;for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));for(let j=0;j<=b.length;j++)prev[j]=next[j];}
  return prev[b.length];
}
function nameSimilarity(a:string,b:string){const x=compactName(a),y=compactName(b);return !x.length||!y.length?0:1-editDistance(x,y)/Math.max(x.length,y.length);}
function identityScore(row:any,member:any,candidate:string){
  let score=0;const levelDiff=row.level==null||member.level==null?99:Math.abs(row.level-member.level);
  if(levelDiff===0)score+=4;else if(levelDiff===1)score+=1;
  if(row.rank&&member.rank===row.rank)score+=3;
  const ratio=row.power==null||member.power==null||!member.power?99:Math.abs(row.power-member.power)/member.power;
  if(ratio<=.03)score+=6;else if(ratio<=.08)score+=5;else if(ratio<=.2)score+=3;else if(ratio<=.4)score+=1;
  const similarity=Math.max(nameSimilarity(candidate,member.display_name||''),nameSimilarity(candidate,member.canonical||''));
  if(similarity>=.8)score+=4;else if(similarity>=.6)score+=2;
  return {score,levelDiff,ratio,similarity};
}

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
  const gm=await meta(),current=await currentMembers();
  const supersedesBatchId=pkg.supersedes_batch_id||current.batch_id||null;
  if(supersedesBatchId){const target=await db().prepare("SELECT batch_id,state FROM growth_batches WHERE batch_id=? AND state='published'").bind(supersedesBatchId).first();if(!target)return response(req,{error:'이전 공개 성장 묶음을 찾을 수 없습니다.'},409);}
  const memberRows=await db().prepare(`SELECT m.member_id,m.legacy_canonical,m.display_name,d.raw_value alias FROM growth_members m LEFT JOIN growth_identity_decisions d ON d.member_id=m.member_id AND d.status='confirmed'`).all<any>();
  const byValue=new Map<string,Set<string>>(),byCompact=new Map<string,Set<string>>();
  for(const m of memberRows.results)for(const value of [m.legacy_canonical,m.display_name,m.alias])if(value){
    if(!byValue.has(value))byValue.set(value,new Set());byValue.get(value)!.add(m.member_id);
    const key=compactName(value);if(key){if(!byCompact.has(key))byCompact.set(key,new Set());byCompact.get(key)!.add(m.member_id);}
  }
  const currentById=new Map(current.members.map((m:any)=>[m.member_id,m]));
  const rawCounts=new Map<string,number>();for(const row of pkg.rows)rawCounts.set(row.raw_name,(rawCounts.get(row.raw_name)||0)+1);
  const resolvedCounts=new Map<string,number>();
  const prepared=[] as any[];const warnings:any[]=[];const now=new Date().toISOString();
  if(pkg.expected_member_count!==pkg.rows.length)warnings.push({code:'member_count',message:`예상 ${pkg.expected_member_count}명과 파일 ${pkg.rows.length}명이 다릅니다.`,blocking:true});
  for(let i=0;i<pkg.rows.length;i++){
    const row=pkg.rows[i],candidate=(row.normalized_candidate||row.raw_name).trim();
    const exact=new Set([...(byValue.get(candidate)||new Set()),...(byCompact.get(compactName(candidate))||new Set())]);const matches=[...exact];
    let status='unresolved',memberId:string|null=null,proposedId:string|null=null,display:string|null=null,reason=row.uncertainty_reason||'';
    if(matches.length===1){memberId=matches[0];status='resolved';}
    else if(matches.length>1)reason=reason||'동일한 이름 후보가 여러 명입니다.';else reason=reason||'기존 길드원 연결을 확인해 주세요.';
    if(!memberId&&matches.length===0&&row.power!=null&&row.level!=null&&row.rank!=null){
      const scored=current.members.map((m:any)=>({member:m,...identityScore(row,m,candidate)})).sort((a:any,b:any)=>b.score-a.score||a.member.member_id.localeCompare(b.member.member_id));
      const best=scored[0],second=scored[1];
      if(best&&best.score>=10&&best.score-(second?.score??0)>=3&&best.levelDiff<=1&&best.ratio<=.4){memberId=best.member.member_id;status='resolved';reason='레벨·전투력·등급·이력을 종합해 기존 member에 자동 연결했습니다.';}
      else if(!row.uncertain&&(!best||best.score<8)){status='new';display=candidate;reason='연결 가능한 기존 member가 없어 신규 member로 자동 분류했습니다.';}
      else reason=row.uncertainty_reason||'기존 member 후보가 서로 비슷하거나 닉네임 판독을 확정할 수 없습니다.';
    }
    if(rawCounts.get(row.raw_name)!==1){status='unresolved';reason='파일 안에 같은 원문 닉네임이 중복되었습니다.';}
    if(memberId){resolvedCounts.set(memberId,(resolvedCounts.get(memberId)||0)+1);const prev=currentById.get(memberId) as any;if(prev&&row.power!=null){const diff=Math.abs(row.power-prev.power),ratio=prev.power?diff/prev.power:0;if(diff>50_000_000||ratio>.75){status='unresolved';reason='이전 전투력과 차이가 커 확인이 필요합니다.';}}}
    if(row.power==null||row.level==null||row.rank==null){status='unresolved';reason=reason||'전투력·레벨·등급 중 확인되지 않은 값이 있습니다.';}
    if(status==='new'){display=display||candidate;proposedId='new_'+(await sha(hashes.packageHash+'\0'+i+'\0'+display)).slice(0,32);}
    prepared.push({row,rowIndex:i,candidate,memberId,proposedId,display,status,reason});
  }
  for(const item of prepared)if(item.memberId&&resolvedCounts.get(item.memberId)!==1){item.status='unresolved';item.reason='같은 기존 길드원으로 연결된 행이 중복되었습니다.';}
  const unresolved=prepared.filter(x=>!['resolved','new'].includes(x.status)).length;
  const validation={warnings,blocking:warnings.filter(x=>x.blocking).map(x=>x.code),accepted:false,unresolved,row_count:pkg.rows.length,expected_count:pkg.expected_member_count};
  const state=unresolved||validation.blocking.length?'needs_review':'ready';
  const batchId='gb_'+hashes.packageHash.slice(0,32);
  const statements:any[]=[];
  statements.push(db().prepare(`INSERT INTO growth_batches(batch_id,package_hash,semantic_hash,operation_id,observed_date,slot,expected_count,source_hashes_json,state,identity_revision,base_growth_revision,draft_revision,validation_json,supersedes_batch_id,created_at,updated_at,published_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).bind(batchId,hashes.packageHash,hashes.semanticHash,operation,pkg.observed_date,pkg.slot,pkg.expected_member_count,JSON.stringify(pkg.source_hashes),state,gm.identityRevision,gm.growthRevision,1,JSON.stringify(validation),supersedesBatchId,now,now));
  statements.push(db().prepare(`INSERT INTO growth_batch_sources(batch_id,source_hash) VALUES ${placeholders(pkg.source_hashes.length,2)}`).bind(...pkg.source_hashes.flatMap(x=>[batchId,x])));
  for(const part of chunks(prepared,5)){
    const values=part.flatMap(item=>{const row=item.row;return ['grow_'+hashes.packageHash.slice(0,20)+'_'+String(item.rowIndex).padStart(3,'0'),batchId,item.rowIndex,row.raw_name,item.candidate,item.memberId,item.status,item.memberId,item.proposedId,item.display,0,row.power??null,row.level??null,row.rank??null,item.reason||null,JSON.stringify(row.source_position??null),row.membership_state||'observed',row.crop?'asset_'+hashes.packageHash.slice(0,16)+'_'+item.rowIndex:null,0];});
    statements.push(db().prepare(`INSERT INTO growth_batch_rows(row_id,batch_id,row_index,raw_name,candidate_name,candidate_member_id,resolution_status,resolved_member_id,proposed_member_id,proposed_display_name,confirm_alias,power,level,rank,uncertainty_reason,source_position_json,membership_state,crop_asset_id,review_version) VALUES ${placeholders(part.length,19)}`).bind(...values));
  }
  const assets=prepared.filter(x=>x.row.crop);for(const part of chunks(assets,10)){
    const values=part.flatMap(item=>{const bytes=Uint8Array.from(atob(item.row.crop.data_base64),(c:string)=>c.charCodeAt(0));const rowId='grow_'+hashes.packageHash.slice(0,20)+'_'+String(item.rowIndex).padStart(3,'0');return ['asset_'+hashes.packageHash.slice(0,16)+'_'+item.rowIndex,batchId,rowId,item.row.crop.mime_type,bytes,bytes.length,new Date(Date.now()+7*86400000).toISOString(),now];});
    statements.push(db().prepare(`INSERT INTO growth_review_assets(asset_id,batch_id,row_id,mime_type,bytes,size_bytes,expires_at,created_at) VALUES ${placeholders(part.length,8)}`).bind(...values));
  }
  await db().batch(statements);
  return response(req,{schema:'3on-growth-upload-v1',duplicate:false,batch:{batch_id:batchId,state,draft_revision:1,base_growth_revision:gm.growthRevision,identity_revision:gm.identityRevision,validation},review_count:unresolved},201);
}catch(e){return response(req,{error:'성장자료 업로드를 완료하지 못했습니다.',detail:e instanceof Error?e.message:'unknown'},400);}}
