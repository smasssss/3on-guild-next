// Membership comes from a complete stored roster, independently of power review.
export type RosterMember={member_id:string;game_id:string;display_name:string;legacy_canonical:string|null;source_name:string;rank:string|null;level:number|null};
export async function completeRoster(db:D1Database,cutoff?:number){
 const query='SELECT snapshot_id,source_as_of,received_at,accepted_at,member_count FROM growth_auto_snapshots'+(cutoff===undefined?'':' WHERE source_as_of<? AND received_at<? AND accepted_at<?')+' ORDER BY source_as_of DESC LIMIT 1';
 const statement=db.prepare(query);
 const snapshot=await(cutoff===undefined?statement:statement.bind(cutoff,cutoff,cutoff)).first<{snapshot_id:string;source_as_of:number;received_at:number;accepted_at:number;member_count:number}>();
 if(!snapshot)return null;
 const rows=await db.prepare(`SELECT o.game_id,o.source_name,o.rank,o.level,e.member_id,e.status,e.departed_at,m.display_name,m.legacy_canonical
 FROM growth_hourly_observations o LEFT JOIN growth_external_ids e ON e.game_id=o.game_id LEFT JOIN growth_members m ON m.member_id=e.member_id
 WHERE o.snapshot_id=?`).bind(snapshot.snapshot_id).all<{game_id:string;source_name:string;rank:string|null;level:number|null;member_id:string|null;status:string|null;departed_at:number|null;display_name:string|null;legacy_canonical:string|null}>();
 if(snapshot.member_count<1||rows.results.length!==snapshot.member_count||new Set(rows.results.map(r=>r.game_id)).size!==snapshot.member_count)throw Error('INCOMPLETE_STORED_ROSTER');
 const members=rows.results.filter(r=>r.member_id&&r.display_name&&r.status==='confirmed'&&(r.departed_at===null||(cutoff!==undefined&&r.departed_at>=cutoff))).map(r=>({member_id:r.member_id!,game_id:r.game_id,display_name:r.display_name!,legacy_canonical:r.legacy_canonical,source_name:r.source_name,rank:r.rank,level:r.level}));
 if(new Set(members.map(m=>m.member_id)).size!==members.length)throw Error('ROSTER_IDENTITY_COLLISION');
 return {...snapshot,members,gameIds:rows.results.map(r=>r.game_id)};
}
