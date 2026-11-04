// Membership comes from complete stored rosters, independently of power review.
// A game ID joins or leaves the current roster only after the same presence result
// is seen in CONFIRMATIONS consecutive accepted collections (a duplicate collection of
// unchanged source data counts as another confirmation). Rejected responses are not
// stored as snapshots, so they neither count nor reset the sequence.
export const CONFIRMATIONS=3;
// Bounded read: one day of hourly snapshots is enough to settle a 3-collection rule.
export const ROSTER_WINDOW=24;
export type RosterMember={member_id:string;game_id:string;display_name:string;legacy_canonical:string|null;source_name:string;rank:string|null;level:number|null};
export type PendingChange={game_id:string;member_id:string|null;name:string;change:'join'|'leave';confirmations:number;required:number};
type SnapshotRow={snapshot_id:string;source_as_of:number;received_at:number;accepted_at:number;member_count:number;repeats:number};
export type ObservedRow={snapshot_id:string;game_id:string;source_name:string;rank:string|null;level:number|null;status:string;member_id:string|null;identity_status:string|null;departed_at:number|null;display_name:string|null;legacy_canonical:string|null};
// Most recent run of CONFIRMATIONS equal results wins; before any such run, the earliest known state.
export function settledPresence(sequence:boolean[],initial=sequence[0]){
 let run=0;
 for(let i=sequence.length-1;i>=0;i--){run=i<sequence.length-1&&sequence[i]===sequence[i+1]?run+1:1;if(run>=CONFIRMATIONS)return sequence[i];}
 return initial;
}
export function trailingRun(sequence:boolean[]){let n=0;for(let i=sequence.length-1;i>=0&&sequence[i]===sequence[sequence.length-1];i--)n++;return n;}
export async function rosterHistory(db:D1Database,cutoff?:number,since?:number){
 const where:string[]=[],values:number[]=[];
 if(cutoff!==undefined){where.push('source_as_of<? AND received_at<? AND accepted_at<?');values.push(cutoff,cutoff,cutoff);}
 if(since!==undefined){where.push('source_as_of>?');values.push(since);}
 const repeat=cutoff===undefined?'':' AND r.completed_at<?';
 const query=`SELECT s.snapshot_id,s.source_as_of,s.received_at,s.accepted_at,s.member_count,(SELECT COUNT(*) FROM growth_auto_runs r WHERE r.snapshot_id=s.snapshot_id AND r.status='duplicate'${repeat}) repeats FROM growth_auto_snapshots s${where.length?' WHERE '+where.join(' AND '):''} ORDER BY s.source_as_of DESC LIMIT ${ROSTER_WINDOW}`;
 const snapshots=(await db.prepare(query).bind(...(cutoff===undefined?[]:[cutoff]),...values).all<SnapshotRow>()).results.reverse();
 if(!snapshots.length)return null;
 const rows=(await db.prepare(`SELECT o.snapshot_id,o.game_id,o.source_name,o.rank,o.level,o.status,e.member_id,e.status identity_status,e.departed_at,m.display_name,m.legacy_canonical
 FROM growth_hourly_observations o LEFT JOIN growth_external_ids e ON e.game_id=o.game_id LEFT JOIN growth_members m ON m.member_id=e.member_id
 WHERE o.snapshot_id IN(SELECT value FROM json_each(?))`).bind(JSON.stringify(snapshots.map(s=>s.snapshot_id))).all<ObservedRow>()).results;
 const bySnapshot=new Map(snapshots.map(s=>[s.snapshot_id,new Set<string>()]));
 const latest=new Map<string,ObservedRow>(),order=new Map(snapshots.map((s,i)=>[s.snapshot_id,i]));
 for(const r of rows){bySnapshot.get(r.snapshot_id)!.add(r.game_id);const p=latest.get(r.game_id);if(!p||order.get(p.snapshot_id)!<order.get(r.snapshot_id)!)latest.set(r.game_id,r);}
 // Every stored roster in the window must be complete; a broken roster cannot prune or add members.
 for(const s of snapshots)if(s.member_count<1||bySnapshot.get(s.snapshot_id)!.size!==s.member_count)throw Error('INCOMPLETE_STORED_ROSTER');
 const sequences=new Map<string,boolean[]>();
 for(const id of latest.keys())sequences.set(id,snapshots.flatMap(s=>Array(1+Number(s.repeats||0)).fill(bySnapshot.get(s.snapshot_id)!.has(id))));
 return {snapshot:snapshots[snapshots.length-1],sequences,latest};
}
export async function completeRoster(db:D1Database,cutoff?:number){
 const history=await rosterHistory(db,cutoff);
 if(!history)return null;
 const {snapshot,sequences,latest}=history;
 const confirmed:ObservedRow[]=[],pending:PendingChange[]=[];
 for(const [id,sequence] of sequences){
  const present=settledPresence(sequence),now=sequence[sequence.length-1],r=latest.get(id)!;
  if(present)confirmed.push(r);
  if(present!==now)pending.push({game_id:id,member_id:r.member_id,name:r.display_name||r.source_name,change:now?'join':'leave',confirmations:trailingRun(sequence),required:CONFIRMATIONS});
 }
 const members=confirmed.filter(r=>r.member_id&&r.display_name&&r.identity_status==='confirmed'&&(r.departed_at===null||(cutoff!==undefined&&r.departed_at>=cutoff))).map(r=>({member_id:r.member_id!,game_id:r.game_id,display_name:r.display_name!,legacy_canonical:r.legacy_canonical,source_name:r.source_name,rank:r.rank,level:r.level}));
 if(new Set(members.map(m=>m.member_id)).size!==members.length)throw Error('ROSTER_IDENTITY_COLLISION');
 return {...snapshot,members,pending,gameIds:confirmed.map(r=>r.game_id),latest};
}
