// VIP policy uses stored observations only. Never fetches or modifies growth data.
export const VIP_KIND = 'vip-weekly';
export const THRESHOLD = 21_720_000;
const DAY = 86_400_000;
const TEMPORARY = new Set(['언데드킬러','Fallwarrior','Natasha21','호야호야','백구김구','Bogui','MJ2012','레녹스','lina12bwina','수영민트','DrBillX','디디뽀','파츠','봉근대','반달gh','СкульпторДуш']);
export type Member = { memberId:string; gameId:string; canonical:string; nickname:string; rank:string|null; level:number|null; current:boolean; temporary:boolean };
export type ScoreRow = {memberId:string; nickname:string; points:number};
export type Weekly = {providedOn:string; appliesOn:string; coverage:'full'|'partial'; rows:ScoreRow[]; updatedAt:string};
export type WeeklyData = {current:Weekly|null; pending:Weekly|null};
type Carriage = {vipExcludedMembers?:Record<string,number>};
export const emptyWeekly = ():WeeklyData => ({current:null,pending:null});
export const kstDay = (now:number) => new Date(now+9*3_600_000).toISOString().slice(0,10);
export function weekOf(now:number){const d=new Date(kstDay(now)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
export function weeklyView(data:WeeklyData,now=Date.now()){
 const week=weekOf(now);
 const active=[data.pending,data.current].filter((w):w is Weekly=>!!w&&w.appliesOn<=week).sort((a,b)=>b.appliesOn.localeCompare(a.appliesOn))[0]||null;
 return {week,active,carriedForward:!!active&&active.appliesOn<week,pending:data.pending&&data.pending.appliesOn>week?data.pending:null};
}
function invalid(message:string):never{throw Error(message);}
function date(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function prepareWeekly(input:unknown,members:Member[],now=Date.now(),retainedWeek?:string):Weekly{
 if(!input||typeof input!=='object')return invalid('주간 자료 형식을 확인해 주세요.');
 const b=input as Record<string,unknown>;
 if(!date(b.providedOn)||!date(b.appliesOn)||new Date(b.providedOn).getUTCDay()!==6||new Date(Date.parse(b.providedOn)+2*DAY).toISOString().slice(0,10)!==b.appliesOn||b.providedOn>kstDay(now)||b.appliesOn<'2026-11-02'||(b.appliesOn<weekOf(now)&&b.appliesOn!==retainedWeek))return invalid('자료 제공일은 토요일, 적용일은 다음 월요일로 지정해 주세요. 미래 제공일과 현재 사용하지 않는 과거 주차는 저장할 수 없습니다.');
 if(!['full','partial'].includes(String(b.coverage))||!Array.isArray(b.rows)||b.rows.length<1||b.rows.length>500)return invalid('전체/일부 명단 여부와 점수 행을 확인해 주세요.');
 const byId=new Map(members.filter(m=>m.current).map(m=>[m.memberId,m])),ids=new Set<string>(),names=new Set<string>();
 const rows:ScoreRow[]=b.rows.map((value:unknown)=>{
  if(!value||typeof value!=='object')return invalid('점수 행 형식을 확인해 주세요.');
  const r=value as ScoreRow,m=byId.get(r.memberId);
  if(!m||r.nickname!==m.nickname||ids.has(r.memberId)||names.has(r.nickname))return invalid('회원 ID·닉네임·현재 소속·중복을 확인해 주세요. 이름은 자동 보정하지 않습니다.');
  if(!Number.isSafeInteger(r.points)||r.points<0)return invalid('점수는 0 이상의 정확한 정수로 입력해 주세요.');
  ids.add(r.memberId);names.add(r.nickname);return {memberId:r.memberId,nickname:r.nickname,points:r.points};
 }).sort((a,b)=>a.memberId.localeCompare(b.memberId));
 if(b.coverage==='full'&&ids.size!==byId.size)return invalid('전체 명단에 누락된 회원이 있습니다. 일부 명단으로 확인하거나 자료를 보완해 주세요.');
 return {providedOn:b.providedOn,appliesOn:b.appliesOn,coverage:b.coverage as Weekly['coverage'],rows,updatedAt:new Date(now).toISOString()};
}
export function replaceWeekly(data:WeeklyData,next:Weekly,now=Date.now()):WeeklyData{
 const view=weeklyView(data,now);
 return next.appliesOn<=view.week?{current:next,pending:view.pending}:{current:view.active,pending:next};
}
export function sameSnapshot(a:Weekly|null,b:Weekly){return !!a&&JSON.stringify({...a,updatedAt:''})===JSON.stringify({...b,updatedAt:''});}
export function eligibility(member:Member|undefined,carriage:Carriage,weekly:Weekly|null,now=Date.now()){
 // Permanent exclusion always wins, including when membership/weekly data are missing.
 if(member&&carriage.vipExcludedMembers?.[member.memberId]===1)return {eligible:false,reason:'permanent'};
 if(!member?.current)return {eligible:false,reason:'membership'};
 const week=weekOf(now);
 if(week==='2026-10-26'&&member.temporary)return {eligible:false,reason:'temporary'};
 if(week<'2026-11-02')return {eligible:true,reason:'eligible'};
 if(!weekly||weekly.appliesOn>week)return {eligible:false,reason:'week_missing'};
 const row=weekly.rows.find(r=>r.memberId===member.memberId);
 if(!row)return {eligible:false,reason:'score_missing'};
 return row.points>=THRESHOLD?{eligible:true,reason:'eligible'}:{eligible:false,reason:'score_low'};
}
type Observed = {member_id:string|null;game_id:string;legacy_canonical:string|null;display_name:string|null;source_name:string;rank:string|null;level:number|null;status:string;identity_status:string;departed_at:number|null;aliases:string|null};
// Recheck live mapping, membership and observation inside the same D1 transaction.
// A departure approval need not bump identity_revision, so that revision alone is insufficient.
export const ROSTER_GUARD_SQL = `(SELECT COUNT(*) FROM json_each(?) j
 JOIN growth_external_ids e ON e.member_id=json_extract(j.value,'$.memberId') AND e.game_id=json_extract(j.value,'$.gameId')
 JOIN growth_members m ON m.member_id=e.member_id
 JOIN growth_hourly_observations o ON o.game_id=e.game_id AND o.snapshot_id=?
 WHERE e.status='confirmed' AND e.departed_at IS NULL AND o.status='valid'
 AND COALESCE(m.display_name,o.source_name)=json_extract(j.value,'$.nickname'))=?`;
export async function readRoster(db:D1Database){
 const latest=await db.prepare("SELECT snapshot_id,source_as_of,received_at,(SELECT value FROM growth_meta WHERE key='identity_revision') identity_revision FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 1").first<{snapshot_id:string;source_as_of:number;received_at:number;identity_revision:string}>();
 if(!latest)return {snapshotId:null,sourceAsOf:null,receivedAt:null,identityRevision:null,members:[] as Member[]};
 const result=await db.prepare(`SELECT o.game_id,e.member_id,e.status identity_status,e.departed_at,m.legacy_canonical,m.display_name,o.source_name,o.rank,o.level,o.status,
   a.aliases
   FROM growth_hourly_observations o JOIN growth_external_ids e ON e.game_id=o.game_id
   LEFT JOIN growth_members m ON m.member_id=e.member_id LEFT JOIN (SELECT member_id,json_group_array(raw_value) aliases FROM growth_identity_decisions WHERE status='confirmed' GROUP BY member_id) a ON a.member_id=e.member_id WHERE o.snapshot_id=?`).bind(latest.snapshot_id).all<Observed>();
 const members=result.results.filter(r=>!!r.member_id).map(r=>({memberId:r.member_id!,gameId:r.game_id,canonical:r.legacy_canonical||r.member_id!,nickname:r.display_name||r.source_name,rank:r.rank,level:r.level,current:r.identity_status==='confirmed'&&r.departed_at===null&&r.status==='valid',temporary:[r.legacy_canonical,r.source_name,r.display_name,...JSON.parse(r.aliases||'[]')].some(n=>TEMPORARY.has(n))}));
 return {snapshotId:latest.snapshot_id,sourceAsOf:latest.source_as_of,receivedAt:latest.received_at,identityRevision:latest.identity_revision,members};
}
export async function readWeekly(db:D1Database){
 const row=await db.prepare('SELECT revision,payload,updated_at FROM documents WHERE kind=?').bind(VIP_KIND).first<{revision:number;payload:string;updated_at:string}>();
 return {revision:row?.revision||0,data:row?JSON.parse(row.payload) as WeeklyData:emptyWeekly(),updatedAt:row?.updated_at||null};
}

type Ride = {id:string;vip?:string;vipCanonical?:string;vipMemberId?:string};
export function protectExclusions(previous:Carriage,next:Carriage){
 const saved=previous.vipExcludedMembers||{};
 if(Object.keys(saved).length)next.vipExcludedMembers={...next.vipExcludedMembers,...saved};
}
export function validateAssignments(previous:{records:Ride[]},next:{records:Ride[]}&Carriage,members:Member[],weekly:Weekly|null,now=Date.now()){
 const assigned:Member[]=[];
 const old=new Map(previous.records.map(r=>[r.id,r]));
 for(const r of next.records){
  if(!r.vip&&!r.vipCanonical&&!r.vipMemberId)continue;
  const before=old.get(r.id);
  if(before&&['vip','vipCanonical','vipMemberId'].every(k=>before[k as keyof Ride]===r[k as keyof Ride]))continue;
  const matches=members.filter(m=>r.vipMemberId?m.memberId===r.vipMemberId:m.canonical===(r.vipCanonical||r.vip));
  const member=matches.length===1?matches[0]:undefined;
  if(!member||(r.vipCanonical&&r.vipCanonical!==member.canonical)||(!r.vipCanonical&&r.vip!==member.nickname&&r.vip!==member.canonical))throw Error('VIP_IDENTITY');
  const result=eligibility(member,next,weekly,now);
  if(!result.eligible)throw Error('VIP_'+result.reason);
  r.vipMemberId=member.memberId;assigned.push(member);
 }
 return assigned;
}
