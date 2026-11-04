// Membership comes from complete stored rosters, independently of power review.
// A game ID joins or leaves the current roster only after the same presence result is seen
// in CONFIRMATIONS consecutive normal hourly collections. A collection is one accepted
// snapshot or one duplicate run of unchanged data; several in the same UTC hour count once,
// so reprocessing, concurrent calls or redeploys cannot add confirmations. Rejected
// responses are not stored as collections, so they neither count nor reset the sequence.
// A user-provided Sunday snapshot participant is current at once; absence from that
// snapshot never removes anyone.
export const CONFIRMATIONS=3;
// Bounded read: twelve stored rosters are enough to settle a 3-collection rule.
export const ROSTER_WINDOW=12;
const HOUR=3_600_000;
export type RosterMember={member_id:string;game_id:string;display_name:string;legacy_canonical:string|null;source_name:string;rank:string|null;level:number|null};
export type Collection={key:string;snapshot_id:string;run_id:string|null;called_at:number|null;source_as_of:number};
export type Evidence={run_id:string|null;snapshot_id:string;called_at:number|null};
export type PendingChange={game_id:string;member_id:string|null;name:string;change:'join'|'leave';confirmations:number;required:number;evidence:Evidence[]};
type SnapshotRow={snapshot_id:string;source_as_of:number;received_at:number;accepted_at:number;member_count:number;run_id:string;called_at:number|null};
export type ObservedRow={snapshot_id:string;game_id:string;source_name:string;rank:string|null;level:number|null;status:string;member_id:string|null;identity_status:string|null;departed_at:number|null;display_name:string|null;legacy_canonical:string|null};
// Most recent run of CONFIRMATIONS equal results wins; before any such run, the initial state.
export function settledPresence(sequence:boolean[],initial=sequence[0]){
 let run=0;
 for(let i=sequence.length-1;i>=0;i--){run=i<sequence.length-1&&sequence[i]===sequence[i+1]?run+1:1;if(run>=CONFIRMATIONS)return sequence[i];}
 return initial;
}
export function trailingRun(sequence:boolean[]){let n=0;for(let i=sequence.length-1;i>=0&&sequence[i]===sequence[sequence.length-1];i--)n++;return n;}
const evidenceOf=(collections:Collection[],n:number)=>collections.slice(collections.length-n).map(c=>({run_id:c.run_id,snapshot_id:c.snapshot_id,called_at:c.called_at}));
// D1 bills every row read. Presence (which game IDs each stored roster held) is cached per
// database until a new snapshot or collection run appears; identity details are re-read each time
// through primary-key lookups only, so departures and renames are never served stale.
type Presence={snapshots:SnapshotRow[];collections:Collection[];sequences:Map<string,boolean[]>;where:Map<string,string>};
const presenceCache=new WeakMap<object,Map<string,Presence>>();
export async function rosterHistory(db:D1Database,cutoff?:number){
 const scope=cutoff===undefined?'':' WHERE source_as_of<? AND received_at<? AND accepted_at<?';
 const bindCut=(st:D1PreparedStatement,...before:unknown[])=>st.bind(...before,...(cutoff===undefined?[]:[cutoff,cutoff,cutoff]));
 // Cheap change key: newest snapshot, its stored row count, and the newest collection run.
 const key=await bindCut(db.prepare(`SELECT s.snapshot_id,s.member_count,(SELECT COUNT(*) FROM growth_hourly_observations o WHERE o.snapshot_id=s.snapshot_id) stored,(SELECT MAX(called_at) FROM growth_auto_runs) last_run FROM (SELECT snapshot_id,member_count FROM growth_auto_snapshots${scope} ORDER BY source_as_of DESC LIMIT 1) s`)).first<{snapshot_id:string;member_count:number;stored:number;last_run:number|null}>();
 if(!key)return null;
 if(key.stored!==key.member_count)throw Error('INCOMPLETE_STORED_ROSTER');
 const cacheKey=[cutoff??'',key.snapshot_id,key.stored,key.last_run??''].join('|');
 let byDb=presenceCache.get(db as object);if(!byDb){byDb=new Map();presenceCache.set(db as object,byDb);}
 let presence=byDb.get(cacheKey);
 if(!presence){
  const snapshots=(await bindCut(db.prepare(`SELECT s.snapshot_id,s.source_as_of,s.received_at,s.accepted_at,s.member_count,s.run_id,r.called_at FROM growth_auto_snapshots s LEFT JOIN growth_auto_runs r ON r.run_id=s.run_id${scope.replaceAll('source_as_of','s.source_as_of').replaceAll('received_at','s.received_at').replaceAll('accepted_at','s.accepted_at')} ORDER BY s.source_as_of DESC LIMIT ${ROSTER_WINDOW}`)).all<SnapshotRow>()).results.reverse();
  const ids=JSON.stringify(snapshots.map(s=>s.snapshot_id)),oldest=Math.min(...snapshots.map(s=>s.received_at));
  const [rowResult,repeatResult]=await Promise.all([
   // Covered by the (snapshot_id, game_id) primary-key index: no observation payload is read.
   db.prepare('SELECT snapshot_id,game_id FROM growth_hourly_observations WHERE snapshot_id IN(SELECT value FROM json_each(?))').bind(ids).all<{snapshot_id:string;game_id:string}>(),
   // Bounded by the called_at index to the window's own time span.
   db.prepare(`SELECT run_id,snapshot_id,called_at FROM growth_auto_runs WHERE called_at>=? AND status='duplicate' AND snapshot_id IN(SELECT value FROM json_each(?))${cutoff===undefined?'':' AND completed_at<? AND called_at<?'}`).bind(...(cutoff===undefined?[oldest,ids]:[oldest,ids,cutoff,cutoff])).all<{run_id:string;snapshot_id:string;called_at:number}>(),
  ]);
  const bySnapshot=new Map(snapshots.map(s=>[s.snapshot_id,new Set<string>()]));
  const where=new Map<string,string>(),order=new Map(snapshots.map((s,i)=>[s.snapshot_id,i]));
  for(const r of rowResult.results){bySnapshot.get(r.snapshot_id)!.add(r.game_id);const p=where.get(r.game_id);if(p===undefined||order.get(p)!<order.get(r.snapshot_id)!)where.set(r.game_id,r.snapshot_id);}
  // Every stored roster in the window must be complete; a broken roster cannot prune or add members.
  for(const s of snapshots)if(s.member_count<1||bySnapshot.get(s.snapshot_id)!.size!==s.member_count)throw Error('INCOMPLETE_STORED_ROSTER');
  const hourKey=(at:number|null,fallback:string)=>at==null?'snapshot:'+fallback:'hour:'+Math.floor(at/HOUR);
  const raw:Collection[]=[];
  for(const s of snapshots){
   raw.push({key:hourKey(s.called_at,s.snapshot_id),snapshot_id:s.snapshot_id,run_id:s.called_at==null?null:s.run_id,called_at:s.called_at,source_as_of:s.source_as_of});
   for(const d of repeatResult.results.filter(d=>d.snapshot_id===s.snapshot_id).sort((a,b)=>a.called_at-b.called_at))raw.push({key:hourKey(d.called_at,d.run_id),snapshot_id:s.snapshot_id,run_id:d.run_id,called_at:d.called_at,source_as_of:s.source_as_of});
  }
  // One confirmation per UTC hour: the last collection of that hour represents it.
  const collections=raw.filter((c,i)=>raw[i+1]?.key!==c.key);
  const sequences=new Map<string,boolean[]>();
  for(const id of where.keys())sequences.set(id,collections.map(c=>bySnapshot.get(c.snapshot_id)!.has(id)));
  presence={snapshots,collections,sequences,where};
  byDb.clear();byDb.set(cacheKey,presence);
 }
 // Identity details: one primary-key lookup per game ID at its newest observation in the window.
 const pairs=JSON.stringify([...presence.where].map(([g,sid])=>[sid,g]));
 const details=(await db.prepare(`SELECT o.snapshot_id,o.game_id,o.source_name,o.rank,o.level,o.status,e.member_id,e.status identity_status,e.departed_at,m.display_name,m.legacy_canonical
 FROM json_each(?) j JOIN growth_hourly_observations o ON o.snapshot_id=json_extract(j.value,'$[0]') AND o.game_id=json_extract(j.value,'$[1]')
 LEFT JOIN growth_external_ids e ON e.game_id=o.game_id LEFT JOIN growth_members m ON m.member_id=e.member_id`).bind(pairs).all<ObservedRow>()).results;
 const latest=new Map(details.map(r=>[r.game_id,r]));
 if(latest.size!==presence.where.size)throw Error('INCOMPLETE_STORED_ROSTER');
 const {snapshots,collections,sequences}=presence;
 return {snapshot:snapshots[snapshots.length-1],collections,sequences,latest};
}
// Sunday snapshot participants (real point rows) and the time each snapshot was saved.
export async function snapshotParticipants(db:D1Database,cutoff?:number){
 const doc=await db.prepare("SELECT payload FROM documents WHERE kind='vip-weekly'").first<{payload:string}>();
 const since=new Map<string,number>();if(!doc)return since;
 const data=JSON.parse(doc.payload) as {current?:{updatedAt:string;rows:{memberId:string;participation?:string}[]}|null;pending?:{updatedAt:string;rows:{memberId:string;participation?:string}[]}|null};
 for(const w of [data.current,data.pending])if(w)for(const r of w.rows)if(r.participation!=='not_participated'){
  const t=Date.parse(w.updatedAt);if(Number.isFinite(t)&&(cutoff===undefined||t<cutoff)&&!(since.get(r.memberId)!>t))since.set(r.memberId,t);
 }
 return since;
}
export async function completeRoster(db:D1Database,cutoff?:number){
 const [history,since]=await Promise.all([rosterHistory(db,cutoff),snapshotParticipants(db,cutoff)]);
 if(!history)return null;
 const {snapshot,collections,sequences,latest}=history;
 const confirmed:ObservedRow[]=[],pending:PendingChange[]=[],snapshotAdded:string[]=[];
 for(const [id,sequence] of sequences){
  const r=latest.get(id)!,now=sequence[sequence.length-1],present=settledPresence(sequence);
  // A Sunday snapshot participant stays until 3 absent collections follow the upload.
  if(!present&&r.member_id&&since.has(r.member_id)){
   const after=collections.map((c,i)=>[c,sequence[i]] as const).filter(([c])=>(c.called_at??c.source_as_of)>since.get(r.member_id!)!);
   if(settledPresence(after.map(([,p])=>p),true)){
    snapshotAdded.push(r.member_id);confirmed.push(r);
    if(!now){const n=trailingRun(after.map(([,p])=>p));pending.push({game_id:id,member_id:r.member_id,name:r.display_name||r.source_name,change:'leave',confirmations:n,required:CONFIRMATIONS,evidence:evidenceOf(after.map(([c])=>c),n)});}
    continue;
   }
  }
  if(present)confirmed.push(r);
  if(present!==now){const n=trailingRun(sequence);pending.push({game_id:id,member_id:r.member_id,name:r.display_name||r.source_name,change:now?'join':'leave',confirmations:n,required:CONFIRMATIONS,evidence:evidenceOf(collections,n)});}
 }
 const members=confirmed.filter(r=>r.member_id&&r.display_name&&r.identity_status==='confirmed'&&(r.departed_at===null||(cutoff!==undefined&&r.departed_at>=cutoff))).map(r=>({member_id:r.member_id!,game_id:r.game_id,display_name:r.display_name!,legacy_canonical:r.legacy_canonical,source_name:r.source_name,rank:r.rank,level:r.level}));
 if(new Set(members.map(m=>m.member_id)).size!==members.length)throw Error('ROSTER_IDENTITY_COLLISION');
 // Settled changes keep the 3 collections that confirmed them as evidence.
 const settledEvidence=(gameId:string)=>{const s=sequences.get(gameId);return s?evidenceOf(collections,Math.min(trailingRun(s),CONFIRMATIONS)):[];};
 return {...snapshot,members,pending,snapshotAdded,gameIds:confirmed.map(r=>r.game_id),latest,settledEvidence};
}
