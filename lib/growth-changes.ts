// Rebuild display history from the approved lineage; never write or infer departures.
export function growthChanges(input:{metadata:any;members:any[];archived:any[];envelopes:Map<string,any>;observations:any[];batches:any[];rows:any[];mutations:any[];snapshots:any[]}){
  const {metadata,members,archived,envelopes,observations,batches,rows,mutations,snapshots}=input;
  const batchMap=new Map(batches.map(b=>[b.batch_id,b]));
  const info=new Map([...members,...archived].map(m=>[m.member_id,m]));
  const names=new Map<string,string>();for(const [id,e] of envelopes)names.set(id,e.data.displayName||e.data.name);
  const history:any[]=[],nicknameChanges=[...(metadata.nicknameChanges||[])];
  const scopes=new Set(observations.filter(o=>o.source_type!=='legacy').map(o=>`${o.batch_id}\0${o.member_id}`));
  const renameRows=rows.filter(r=>batchMap.has(r.batch_id)&&scopes.has(`${r.batch_id}\0${r.resolved_member_id}`)).sort((a,b)=>batchMap.get(a.batch_id).lineage_depth-batchMap.get(b.batch_id).lineage_depth).reverse();
  for(const r of renameRows){
    const id=r.resolved_member_id,to=r.proposed_display_name,from=names.get(id);
    if(!to||!from||from===to)continue;
    const b=batchMap.get(r.batch_id),m=info.get(id);const event={kind:'nickname',member_id:id,name:m?.name||id,displayName:to,date:b.observed_date,from,to};
    history.push(event);nicknameChanges.push(event);names.set(id,to);
  }
  const previous=new Map<string,any>();
  for(const o of observations){
    if(o.source_type==='legacy'){const env=envelopes.get(o.member_id)?.data;previous.set(o.member_id,{rank:o.rank??env?.rank,level:o.level??env?.level});continue;}
    const m=info.get(o.member_id);if(!m)continue;
    const prev=previous.get(o.member_id),event={member_id:o.member_id,name:m.name,displayName:m.displayName,date:o.observed_date};
    if(!prev&&!envelopes.has(o.member_id))history.push({...event,kind:'new'});
    if(prev?.rank&&o.rank&&prev.rank!==o.rank)history.push({...event,kind:'rank',from:prev.rank,to:o.rank});
    if(prev?.level!=null&&o.level!=null&&prev.level<o.level)history.push({...event,kind:'level',from:prev.level,to:o.level});
    previous.set(o.member_id,{rank:o.rank??prev?.rank,level:o.level??prev?.level});
  }
  const departures=new Map<string,any>();
  for(const mutation of mutations){
    const result=JSON.parse(mutation.result_json);if(!batchMap.has(result.batch_id))continue;
    for(const d of result.departed||[]){if(d.after!=='missing')continue;
      const event={kind:'departure',member_id:d.member_id,name:info.get(d.member_id)?.name||d.member_id,displayName:d.display_name,date:result.observed_date};
      history.push(event);departures.set(d.member_id,event);
    }
  }
  const currentNames=new Set(members.filter(m=>m.observedToday!==false).flatMap(m=>[m.name,m.displayName]));
  const missing=new Map<string,any>();
  for(const m of metadata.missing||[])if(!currentNames.has(m.name)&&!currentNames.has(m.displayName))missing.set(m.name,{...m});
  const state=new Map(snapshots.map(s=>[s.member_id,s.membership_state]));
  for(const m of [...archived,...members.filter(m=>m.observedToday===false)]){
    const departed=departures.get(m.member_id),confirmed=departed&&state.get(m.member_id)==='missing';
    missing.set(m.name,{...(missing.get(m.name)||{}),name:m.name,displayName:m.displayName,rank:m.rank,level:m.level,power:m.power,confirmedDeparture:!!confirmed,...(confirmed?{date:departed.date,status:`${departed.date} 탈퇴 확인`}:missing.has(m.name)?{}:{status:'최신 자료에서 명단 미확인 · 확인 필요'})});
  }
  history.sort((a,b)=>b.date.localeCompare(a.date)||a.kind.localeCompare(b.kind)||a.displayName.localeCompare(b.displayName,'ko'));
  return {missing:[...missing.values()],nicknameChanges,changeHistory:history};
}
