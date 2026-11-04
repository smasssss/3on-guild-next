// Membership comes from complete stored rosters, independently of power review.
// A game ID joins or leaves the current roster only after the same presence result is seen
// in CONFIRMATIONS consecutive normal hourly collections. A collection is one accepted
// snapshot or one duplicate run of unchanged data; several in the same UTC hour count once,
// so reprocessing, concurrent calls or redeploys cannot add confirmations. Rejected
// responses are not stored as collections, so they neither count nor reset the sequence.
// A user-provided Sunday snapshot participant is current at once; absence from that
// snapshot never removes anyone.
export const CONFIRMATIONS=3;
// Bounded read: one day of hourly snapshots is enough to settle a 3-collection rule.
export const ROSTER_WINDOW=24;
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
export async function rosterHistory(db:D1Database,cutoff?:number){
 const query=`SELECT s.snapshot_id,s.source_as_of,s.received_at,s.accepted_at,s.member_count,s.run_id,r.called_at FROM growth_auto_snapshots s LEFT JOIN growth_auto_runs r ON r.run_id=s.run_id${cutoff===undefined?'':' WHERE s.source_as_of<? AND s.received_at<? AND s.accepted_at<?'} ORDER BY s.source_as_of DESC LIMIT ${ROSTER_WINDOW}`;
 const statement=db.prepare(query);
 const snapshots=(await(cutoff===undefined?statement:statement.bind(cutoff,cutoff,cutoff)).all<SnapshotRow>()).results.reverse();
 if(!snapshots.length)return null;
 const ids=JSON.stringify(snapshots.map(s=>s.snapshot_id));
 const [rowResult,repeatResult]=await Promise.all([
  db.prepare(`SELECT o.snapshot_id,o.game_id,o.source_name,o.rank,o.level,o.status,e.member_id,e.status identity_status,e.departed_at,m.display_name,m.legacy_canonical
  FROM growth_hourly_observations o LEFT JOIN growth_external_ids e ON e.game_id=o.game_id LEFT JOIN growth_members m ON m.member_id=e.member_id
  WHERE o.snapshot_id IN(SELECT value FROM json_each(?))`).bind(ids).all<ObservedRow>(),
  db.prepare(`SELECT run_id,snapshot_id,called_at FROM growth_auto_runs WHERE status='duplicate' AND snapshot_id IN(SELECT value FROM json_each(?))${cutoff===undefined?'':' AND completed_at<? AND called_at<?'}`).bind(...(cutoff===undefined?[ids]:[ids,cutoff,cutoff])).all<{run_id:string;snapshot_id:string;called_at:number}>(),
 ]);
 const bySnapshot=new Map(snapshots.map(s=>[s.snapshot_id,new Set<string>()]));
 const latest=new Map<string,ObservedRow>(),order=new Map(snapshots.map((s,i)=>[s.snapshot_id,i]));
 for(const r of rowResult.results){bySnapshot.get(r.snapshot_id)!.add(r.game_id);const p=latest.get(r.game_id);if(!p||order.get(p.snapshot_id)!<order.get(r.snapshot_id)!)latest.set(r.game_id,r);}
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
 for(const id of latest.keys())sequences.set(id,collections.map(c=>bySnapshot.get(c.snapshot_id)!.has(id)));
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
