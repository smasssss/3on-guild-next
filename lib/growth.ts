import { db, hash } from './store';

export const GROWTH_SCHEMA='3on-growth-v1.1';
export const GROWTH_API='3on-growth-api-v1.2';
export const PACKAGE_SCHEMA='3on-growth-package-v1';
export const MAX_PACKAGE_BYTES=1_500_000;
export const MAX_CROP_BYTES=65_536;
export const MAX_BATCH_CROPS=1_048_576;

export type GrowthMeta={growthRevision:number;identityRevision:number};
export type PackageRow={
  raw_name:string; normalized_candidate?:string; power?:number|null; level?:number|null; rank?:string|null;
  uncertain?:boolean; uncertainty_reason?:string; source_position?:unknown; membership_state?:string;
  crop?:{mime_type:string;data_base64:string};
};
export type GrowthPackage={
  schema:string; observed_date:string; slot:string; expected_member_count:number; source_hashes:string[];
  rows:PackageRow[]; package_hash?:string; operation_id?:string; supersedes_batch_id?:string;
};

export function stable(value:any):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
}
export function validDate(s:any){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export function validHash(s:any){return typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);}
export function validMutation(s:any){return typeof s==='string'&&/^[a-f0-9-]{32,80}$/.test(s);}
export async function meta():Promise<GrowthMeta>{
  const rows=await db().prepare("SELECT key,value FROM growth_meta WHERE key IN ('growth_revision','identity_revision')").all<{key:string,value:string}>();
  const values=Object.fromEntries(rows.results.map(r=>[r.key,Number(r.value)]));
  if(!Number.isSafeInteger(values.growth_revision)||!Number.isSafeInteger(values.identity_revision))throw Error('growth meta unavailable');
  return {growthRevision:values.growth_revision,identityRevision:values.identity_revision};
}
export async function sha(value:string){return hash(value);}
export async function packageHashes(pkg:GrowthPackage){
  const clean=structuredClone(pkg) as any;delete clean.package_hash;delete clean.operation_id;
  const packageHash=await sha(stable(clean));
  const semantic={observed_date:pkg.observed_date,slot:pkg.slot,expected_member_count:pkg.expected_member_count,rows:pkg.rows.map(r=>({raw_name:r.raw_name,normalized_candidate:r.normalized_candidate||'',power:r.power??null,level:r.level??null,rank:r.rank??null,membership_state:r.membership_state||'observed'}))};
  return {packageHash,semanticHash:await sha(stable(semantic))};
}
export function parsePackage(raw:string):GrowthPackage{
  if(raw.length>MAX_PACKAGE_BYTES)throw Error('PACKAGE_TOO_LARGE');
  const pkg=JSON.parse(raw) as GrowthPackage;
  if(!pkg||typeof pkg!=='object'||Array.isArray(pkg)||pkg.schema!==PACKAGE_SCHEMA)throw Error('PACKAGE_SCHEMA');
  const topAllowed=new Set(['schema','observed_date','slot','expected_member_count','source_hashes','rows','package_hash','operation_id','supersedes_batch_id']);
  if(Object.keys(pkg).some(k=>!topAllowed.has(k)))throw Error('PACKAGE_SCHEMA');
  if(!validDate(pkg.observed_date)||typeof pkg.slot!=='string'||!/^[a-z0-9_-]{1,24}$/i.test(pkg.slot))throw Error('PACKAGE_SCOPE');
  if(!Number.isSafeInteger(pkg.expected_member_count)||pkg.expected_member_count<1||pkg.expected_member_count>500)throw Error('PACKAGE_COUNT');
  if(!Array.isArray(pkg.source_hashes)||!pkg.source_hashes.length||pkg.source_hashes.length>50||pkg.source_hashes.some(x=>!validHash(x))||new Set(pkg.source_hashes).size!==pkg.source_hashes.length)throw Error('PACKAGE_SOURCE');
  if(!Array.isArray(pkg.rows)||!pkg.rows.length||pkg.rows.length>500)throw Error('PACKAGE_ROWS');
  let cropTotal=0;
  for(const row of pkg.rows){
    if(!row||typeof row!=='object'||typeof row.raw_name!=='string'||!row.raw_name.trim()||row.raw_name.length>100)throw Error('ROW_NAME');
    const rowAllowed=new Set(['raw_name','normalized_candidate','power','level','rank','uncertain','uncertainty_reason','source_position','membership_state','crop']);
    if(Object.keys(row).some(k=>!rowAllowed.has(k)))throw Error('PACKAGE_SCHEMA');
    if(row.normalized_candidate!==undefined&&(typeof row.normalized_candidate!=='string'||row.normalized_candidate.length>100))throw Error('ROW_CANDIDATE');
    if(row.power!==undefined&&row.power!==null&&(!Number.isSafeInteger(row.power)||row.power<0||row.power>999_999_999_999))throw Error('ROW_POWER');
    if(row.level!==undefined&&row.level!==null&&(!Number.isSafeInteger(row.level)||row.level<1||row.level>999))throw Error('ROW_LEVEL');
    if(row.rank!==undefined&&row.rank!==null&&!/^R[1-5]$/.test(row.rank))throw Error('ROW_RANK');
    if(row.uncertainty_reason!==undefined&&(typeof row.uncertainty_reason!=='string'||row.uncertainty_reason.length>500))throw Error('ROW_UNCERTAINTY');
    if(row.membership_state!==undefined&&!['observed','unobserved','missing','unknown'].includes(row.membership_state))throw Error('ROW_MEMBERSHIP');
    if(row.crop){
      if(Object.keys(row.crop).some(k=>!['mime_type','data_base64'].includes(k)))throw Error('ROW_CROP');
      if(!['image/jpeg','image/png','image/webp'].includes(row.crop.mime_type)||typeof row.crop.data_base64!=='string'||row.crop.data_base64.length>100_000)throw Error('ROW_CROP');
      let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(row.crop.data_base64),c=>c.charCodeAt(0));}catch{throw Error('ROW_CROP');}
      if(bytes.length>MAX_CROP_BYTES)throw Error('ROW_CROP');cropTotal+=bytes.length;
    }
  }
  if(cropTotal>MAX_BATCH_CROPS)throw Error('BATCH_CROPS');
  if(pkg.package_hash!==undefined&&!validHash(pkg.package_hash))throw Error('PACKAGE_HASH');
  if(pkg.supersedes_batch_id!==undefined&&(typeof pkg.supersedes_batch_id!=='string'||pkg.supersedes_batch_id.length>100))throw Error('SUPERSEDES');
  return pkg;
}

export async function currentMembers(){
  const latest=await db().prepare("SELECT batch_id,observed_date,published_revision FROM growth_batches WHERE state='published' ORDER BY observed_date DESC,published_revision DESC LIMIT 1").first<{batch_id:string;observed_date:string;published_revision:number}>();
  if(!latest)throw Error('growth publication unavailable');
  const rows=await db().prepare(`SELECT s.member_id,s.membership_state,s.row_order,m.legacy_canonical,m.display_name,e.payload,
    o.observation_id,o.observed_date,o.slot,o.power,o.level,o.rank,o.original_order
    FROM growth_membership_snapshots s
    JOIN growth_members m ON m.member_id=s.member_id
    LEFT JOIN growth_legacy_envelopes e ON e.member_id=m.member_id
    LEFT JOIN growth_observations o ON o.observation_id=(
      SELECT x.observation_id FROM growth_observations x JOIN growth_batches b ON b.batch_id=x.batch_id
      WHERE x.member_id=s.member_id AND x.status='active' AND b.state='published' AND x.observed_date<=?
      ORDER BY x.observed_date DESC,x.original_order DESC LIMIT 1)
    WHERE s.batch_id=? ORDER BY s.row_order`).bind(latest.observed_date,latest.batch_id).all<any>();
  const members=rows.results.filter(r=>!['archived','missing'].includes(r.membership_state)).map(r=>{
    const legacy=r.payload?JSON.parse(r.payload):{};
    return {member_id:r.member_id,canonical:r.legacy_canonical,display_name:r.display_name,rank:r.rank??legacy.rank??null,level:r.level??legacy.level??null,power:r.power??legacy.power??null,observed_date:r.observed_date??null,slot:r.slot??null,membership_state:r.membership_state};
  });
  const m=await meta();
  return {schema:GROWTH_SCHEMA,api:GROWTH_API,revision:m.growthRevision,identity_revision:m.identityRevision,observed_date:latest.observed_date,batch_id:latest.batch_id,members};
}

export async function memberHistory(memberId:string,limit=200,before?:string|null){
  if(!/^[a-z0-9_-]{8,100}$/i.test(memberId))throw Error('MEMBER_ID');
  limit=Math.max(1,Math.min(500,Math.trunc(limit)));
  const sql=`SELECT o.observation_id,o.observed_date,o.slot,o.power,o.level,o.rank,o.label,o.source_type,o.original_order
    FROM growth_observations o JOIN growth_batches b ON b.batch_id=o.batch_id
    WHERE o.member_id=? AND o.status='active' AND b.state='published' ${before?'AND o.observed_date<?':''}
    ORDER BY o.observed_date DESC,o.original_order DESC LIMIT ?`;
  const statement=before?db().prepare(sql).bind(memberId,before,limit):db().prepare(sql).bind(memberId,limit);
  return (await statement.all()).results;
}

export function errorMessage(code:string){return ({
  PACKAGE_TOO_LARGE:'성장자료 파일이 너무 큽니다.',PACKAGE_SCHEMA:'성장자료 파일 형식을 확인해 주세요.',PACKAGE_SCOPE:'관측 날짜 또는 시간대를 확인해 주세요.',
  PACKAGE_COUNT:'예상 인원수를 확인해 주세요.',PACKAGE_SOURCE:'원본 파일 식별값을 확인해 주세요.',PACKAGE_ROWS:'길드원 관측 행을 확인해 주세요.',
  ROW_NAME:'닉네임 형식을 확인해 주세요.',ROW_CANDIDATE:'닉네임 후보 형식을 확인해 주세요.',ROW_POWER:'전투력 형식을 확인해 주세요.',ROW_LEVEL:'레벨 형식을 확인해 주세요.',
  ROW_RANK:'등급 형식을 확인해 주세요.',ROW_UNCERTAINTY:'확인 사유가 너무 깁니다.',ROW_MEMBERSHIP:'명단 상태를 확인해 주세요.',ROW_CROP:'확인 이미지 형식이나 크기를 확인해 주세요.',
  BATCH_CROPS:'확인 이미지 총 크기가 1MB를 넘습니다.',PACKAGE_HASH:'package hash를 확인해 주세요.',SUPERSEDES:'정정 대상 묶음을 확인해 주세요.',MEMBER_ID:'길드원 식별값을 확인해 주세요.'
} as Record<string,string>)[code]||'성장자료를 처리하지 못했습니다.';}
