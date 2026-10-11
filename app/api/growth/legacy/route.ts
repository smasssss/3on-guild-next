import { db, response } from '../../../../lib/store';
import { GROWTH_API, GROWTH_SCHEMA, meta } from '../../../../lib/growth';
export const dynamic='force-dynamic';

export async function GET(req:Request){try{
  const latest=await db().prepare("SELECT batch_id,observed_date FROM growth_batches WHERE state='published' ORDER BY observed_date DESC,published_revision DESC LIMIT 1").first<{batch_id:string;observed_date:string}>();if(!latest)throw Error();
  const [memberResult,envelopeResult,observationResult,snapshotResult,metadataResult]=await Promise.all([
    db().prepare('SELECT member_id,legacy_canonical,display_name FROM growth_members').all<any>(),
    db().prepare('SELECT member_id,original_order,current_state,payload FROM growth_legacy_envelopes ORDER BY original_order').all<any>(),
    db().prepare(`WITH RECURSIVE valid_lineage(batch_id,lineage_depth) AS (
      SELECT batch_id,0 FROM growth_batches WHERE batch_id=? AND state='published'
      UNION ALL
      SELECT parent.batch_id,lineage.lineage_depth+1 FROM valid_lineage lineage
      JOIN growth_batches child ON child.batch_id=lineage.batch_id
      JOIN growth_batches parent ON parent.batch_id=child.supersedes_batch_id
      WHERE parent.state IN ('published','superseded')
    ) SELECT o.*,lineage.lineage_depth FROM growth_observations o
      JOIN valid_lineage lineage ON lineage.batch_id=o.batch_id
      WHERE o.status='active' ORDER BY o.observed_date,o.original_order`).bind(latest.batch_id).all<any>(),
    db().prepare('SELECT member_id,membership_state,row_order FROM growth_membership_snapshots WHERE batch_id=? ORDER BY row_order').bind(latest.batch_id).all<any>(),
    db().prepare('SELECT key,payload FROM growth_legacy_metadata').all<any>(),
  ]);
  const memberInfo=new Map(memberResult.results.map((r:any)=>[r.member_id,r]));
  const envelopes=new Map(envelopeResult.results.map((r:any)=>[r.member_id,{...r,data:JSON.parse(r.payload)}]));
  const correctionDepth=new Map<string,number>();for(const o of observationResult.results as any[]){if(o.source_type==='legacy')continue;const key=`${o.member_id}\0${o.observed_date}\0${o.slot}`,depth=correctionDepth.get(key);if(depth===undefined||o.lineage_depth<depth)correctionDepth.set(key,o.lineage_depth);}
  const effective=(observationResult.results as any[]).filter((o:any)=>o.source_type==='legacy'||o.lineage_depth===correctionDepth.get(`${o.member_id}\0${o.observed_date}\0${o.slot}`));
  const observations=new Map<string,any[]>();for(const o of effective){if(!observations.has(o.member_id))observations.set(o.member_id,[]);observations.get(o.member_id)!.push(o);}
  const makeMember=(memberId:string)=>{
    const info:any=memberInfo.get(memberId),env:any=envelopes.get(memberId);const item=env?structuredClone(env.data):{name:info.legacy_canonical||memberId,displayName:info.display_name,history:[],isNew:true};
    item.name=info.legacy_canonical||item.name||memberId;item.displayName=info.display_name;
    const all=observations.get(memberId)||[];const newer=all.filter(o=>o.source_type!=='legacy');
    for(const o of newer)item.history.push({label:o.label||o.observed_date,date:o.observed_date,slot:o.slot,power:o.power});
    if(all.length){const last=all[all.length-1],prev=all.length>1?all[all.length-2]:null;item.power=last.power;item.prevPower=prev?.power??null;const rank=[...all].reverse().find(o=>o.rank)?.rank;const level=[...all].reverse().find(o=>o.level)?.level;if(rank)item.rank=rank;if(level)item.level=level;}
    return item;
  };
  const activeStates=new Set(['current','observed','unobserved','new']);const current:any[]=[];const currentIds=new Set<string>();
  for(const s of snapshotResult.results as any[]){if(activeStates.has(s.membership_state)){const m=makeMember(s.member_id);m.observedToday=s.membership_state!=='unobserved';current.push(m);currentIds.add(s.member_id);}}
  const archived:any[]=[];for(const [memberId] of envelopes)if(!currentIds.has(memberId))archived.push(makeMember(memberId));
  const metadata=Object.fromEntries(metadataResult.results.map((r:any)=>[r.key,JSON.parse(r.payload)]));
  const data={...metadata,date:latest.observed_date,guildCount:current.length,members:current,archivedMembers:archived};
  const revision=await meta();return response(req,{schema:GROWTH_SCHEMA,api:GROWTH_API,revision:revision.growthRevision,identity_revision:revision.identityRevision,data});
}catch{return response(req,{error:'호환 성장자료를 만들지 못했습니다.'},503);}}
