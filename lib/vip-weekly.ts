// VIP policy uses stored observations only. Never fetches or modifies growth data.
import { completeRoster, type PendingChange } from './growth-roster';
export const VIP_KIND = 'vip-weekly';
// Weekly guild-war points needed for VIP. Stored as carriage.vipThreshold (Admin Settings); this is the default.
export const THRESHOLD = 55_000_000;
export const thresholdOf = (carriage:{vipThreshold?:number}) => Number.isSafeInteger(carriage.vipThreshold)&&carriage.vipThreshold!>0?carriage.vipThreshold!:THRESHOLD;
const DAY = 86_400_000;
const TEMPORARY = new Set(['언데드킬러','Fallwarrior','Natasha21','호야호야','백구김구','Bogui','MJ2012','레녹스','lina12bwina','수영민트','DrBillX','디디뽀','파츠','봉근대','반달gh','СкульпторДуш']);
export type Member = { memberId:string; gameId:string; canonical:string; nickname:string; rank:string|null; level:number|null; current:boolean; temporary:boolean };
export type ScoreMember = Pick<Member,'memberId'|'gameId'|'nickname'|'current'>;
export type ScoreRow = {memberId:string; nickname:string; points:number; participation?:'participated'|'not_participated'; evidence?:'user_screenshot'|'user_confirmation'};
export type Weekly = {providedOn:string; appliesOn:string; coverage:'full'|'partial'; rows:ScoreRow[]; updatedAt:string};
export type WeeklyData = {current:Weekly|null; pending:Weekly|null};
type Carriage = {vipExcludedMembers?:Record<string,number>;rotationMembers?:{memberId:string}[];vipThreshold?:number};
export const emptyWeekly = ():WeeklyData => ({current:null,pending:null});
export const kstDay = (now:number) => new Date(now+9*3_600_000).toISOString().slice(0,10);
export function weekOf(now:number){const d=new Date(kstDay(now)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
// appliesOn is the Monday cycle key. 2026-11-08 user rule: VIP eligibility starts that Monday
// (until then the previous week's points apply). Previously it started the preceding Sunday.
export const effectiveOn = (weekly:Weekly) => weekly.appliesOn;
export function weeklyView(data:WeeklyData,now=Date.now()){
 const week=weekOf(now),scoreWeek=weekOf(now+DAY),today=kstDay(now);
 const active=[data.pending,data.current].filter((w):w is Weekly=>!!w&&effectiveOn(w)<=today).sort((a,b)=>b.appliesOn.localeCompare(a.appliesOn))[0]||null;
 const pending=data.pending&&effectiveOn(data.pending)>today?data.pending:null;
 return {week,scoreWeek,active,effectiveOn:active?effectiveOn(active):null,awaitingFirstSnapshot:!active,carriedForward:!!active&&active.appliesOn<scoreWeek,pending,pendingEffectiveOn:pending?effectiveOn(pending):null};
}
function invalid(message:string):never{throw Error(message);}
function date(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function prepareWeekly(input:unknown,members:Member[],now=Date.now(),retainedWeek?:string,scoreMembers:ScoreMember[]=members):Weekly{
 if(!input||typeof input!=='object')return invalid('주간 자료 형식을 확인해 주세요.');
 const b=input as Record<string,unknown>;
 if(!date(b.providedOn)||!date(b.appliesOn))return invalid('자료 제공일과 적용일을 확인해 주세요.');
 const day=new Date(b.providedOn).getUTCDay(),daysUntilMonday=day===6?2:day===0?1:0;
 if(!daysUntilMonday||new Date(Date.parse(b.providedOn)+daysUntilMonday*DAY).toISOString().slice(0,10)!==b.appliesOn||b.providedOn>kstDay(now)||b.appliesOn<'2026-11-02'||(b.appliesOn<weekOf(now+DAY)&&b.appliesOn!==retainedWeek))return invalid('자료 제공일은 실제 토요일 또는 일요일, 주차 기준일은 바로 다음 월요일로 지정해 주세요. VIP 자격은 그 월요일부터 적용합니다. 미래 제공일과 현재 사용하지 않는 과거 주차는 저장할 수 없습니다.');
 if(!['full','partial'].includes(String(b.coverage))||!Array.isArray(b.rows)||b.rows.length<1||b.rows.length>500)return invalid('전체/일부 명단 여부와 점수 행을 확인해 주세요.');
 const byId=new Map(scoreMembers.map(m=>[m.memberId,m])),ids=new Set<string>(),names=new Set<string>();
 const rows:ScoreRow[]=b.rows.map((value:unknown)=>{
  if(!value||typeof value!=='object')return invalid('점수 행 형식을 확인해 주세요.');
  const r=value as ScoreRow,m=byId.get(r.memberId);
  if(!m||r.nickname!==m.nickname||ids.has(r.memberId)||names.has(r.nickname))return invalid('회원 ID·닉네임·현재 소속·중복을 확인해 주세요. 이름은 자동 보정하지 않습니다.');
  if(!Number.isSafeInteger(r.points)||r.points<0)return invalid('점수는 0 이상의 정확한 정수로 입력해 주세요.');
  if(r.participation!==undefined||r.evidence!==undefined){
   if(typeof r.participation!=='string'||typeof r.evidence!=='string'||!['participated','not_participated'].includes(r.participation)||!['user_screenshot','user_confirmation'].includes(r.evidence)||(r.participation==='not_participated'&&(r.points!==0||r.evidence!=='user_confirmation')))return invalid('미참여는 관리자 확인 근거와 0점을 함께 입력해 주세요.');
  }
  // A person listed in the Sunday snapshot joins the VIP roster immediately (readRoster),
  // so a confirmed, non-departed identity may carry points even before 3 hourly confirmations.
  ids.add(r.memberId);names.add(r.nickname);return {memberId:r.memberId,nickname:r.nickname,points:r.points,...(r.participation?{participation:r.participation,evidence:r.evidence}:{})};
 }).sort((a,b)=>a.memberId.localeCompare(b.memberId));
 if(b.coverage==='full'&&members.some(m=>m.current&&!ids.has(m.memberId)))return invalid('전체 명단에 누락된 회원이 있습니다. 일부 명단으로 확인하거나 자료를 보완해 주세요.');
 return {providedOn:b.providedOn,appliesOn:b.appliesOn,coverage:b.coverage as Weekly['coverage'],rows,updatedAt:new Date(now).toISOString()};
}
export function replaceWeekly(data:WeeklyData,next:Weekly,now=Date.now()):WeeklyData{
 const view=weeklyView(data,now);
 return next.appliesOn<=view.scoreWeek?{current:next,pending:view.pending}:{current:view.active,pending:next};
}
export function sameSnapshot(a:Weekly|null,b:Weekly){return !!a&&JSON.stringify({...a,updatedAt:''})===JSON.stringify({...b,updatedAt:''});}
// VIP selection (2026-11-05): fixed carriage drivers and permanent exclusions never qualify;
// everyone else qualifies with this week's guild-war points at or above the threshold.
// No waiting period for new or returning members; no consecutive-selection block (queue order handles it).
export function eligibility(member:Member|undefined,carriage:Carriage,weekly:Weekly|null,now=Date.now()){
 if(member&&carriage.vipExcludedMembers?.[member.memberId]===1)return {eligible:false,reason:'permanent'};
 if(member&&carriage.rotationMembers?.some(e=>e.memberId===member.memberId))return {eligible:false,reason:'rotation'};
 if(!member?.current)return {eligible:false,reason:'membership'};
 const active=weekly&&effectiveOn(weekly)<=kstDay(now)?weekly:null;
 const points=active?.rows.find(r=>r.memberId===member.memberId)?.points??0;
 return points>=thresholdOf(carriage)?{eligible:true,reason:'eligible'}:{eligible:false,reason:'score_low'};
}
// Recheck live mapping, membership and observation inside the same D1 transaction.
// A departure approval need not bump identity_revision, so that revision alone is insufficient.
// Each member's latest observation up to the roster snapshot is checked; a member awaiting
// 3-collection removal is no longer in the newest snapshot but is still current.
// D1 read budget (2026-11-08): CROSS JOIN fixes the order (listed members first, then one
// rowid lookup each). The old JOIN let D1 scan every valid hourly row and re-read each
// member's whole history per row: about 16M rows per weekly save or VIP carriage save.
// Rows of one snapshot share its source_as_of, so ordering by x.source_as_of (indexed) is the same order.
export const ROSTER_GUARD_SQL = `(SELECT COUNT(*) FROM json_each(?) j
 CROSS JOIN growth_external_ids e ON e.member_id=json_extract(j.value,'$.memberId') AND e.game_id=json_extract(j.value,'$.gameId')
 CROSS JOIN growth_members m ON m.member_id=e.member_id
 CROSS JOIN growth_hourly_observations o ON o.rowid=(SELECT x.rowid FROM growth_hourly_observations x JOIN growth_auto_snapshots s ON s.snapshot_id=x.snapshot_id WHERE x.game_id=e.game_id AND s.source_as_of<=(SELECT source_as_of FROM growth_auto_snapshots WHERE snapshot_id=?) ORDER BY x.source_as_of DESC LIMIT 1)
 WHERE e.status='confirmed' AND e.departed_at IS NULL AND o.status='valid'
 AND COALESCE(m.display_name,o.source_name)=json_extract(j.value,'$.nickname'))=?`;
// Score references preserve confirmed history only; they never grant selection membership.
export const SCORE_REFERENCE_GUARD_SQL = `(SELECT COUNT(*) FROM json_each(?) j
 JOIN growth_external_ids e ON e.member_id=json_extract(j.value,'$.memberId') AND e.game_id=json_extract(j.value,'$.gameId')
 JOIN growth_members m ON m.member_id=e.member_id
 WHERE e.status='confirmed' AND e.departed_at IS NULL
 AND COALESCE(m.display_name,e.source_name)=json_extract(j.value,'$.nickname')
 AND EXISTS(SELECT 1 FROM growth_hourly_observations o WHERE o.game_id=e.game_id AND o.status='valid'))=?`;
export async function readScoreRoster(db:D1Database,members:Member[]):Promise<ScoreMember[]>{
 const rows=await db.prepare(`SELECT e.member_id,e.game_id,COALESCE(m.display_name,e.source_name) nickname
 FROM growth_external_ids e JOIN growth_members m ON m.member_id=e.member_id
 WHERE e.status='confirmed' AND e.departed_at IS NULL AND EXISTS(
 SELECT 1 FROM growth_hourly_observations o WHERE o.game_id=e.game_id AND o.status='valid')`).all<{member_id:string;game_id:string;nickname:string}>();
 const current=new Set(members.filter(m=>m.current).map(m=>m.memberId));
 return rows.results.map(r=>({memberId:r.member_id,gameId:r.game_id,nickname:r.nickname,current:current.has(r.member_id)}));
}
// Same confirmed roster as growth (incl. Sunday snapshot participants, see growth-roster.ts).
// Eligibility (permanent exclusion, weekly score, temporary restriction) stays separate.
export async function readRoster(db:D1Database){
 const latest=await db.prepare("SELECT snapshot_id,source_as_of,received_at,(SELECT value FROM growth_meta WHERE key='identity_revision') identity_revision FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 1").first<{snapshot_id:string;source_as_of:number;received_at:number;identity_revision:string}>();
 if(!latest)return {snapshotId:null,sourceAsOf:null,receivedAt:null,identityRevision:null,members:[] as Member[],pending:[] as PendingChange[],snapshotAdded:[] as string[]};
 const roster=await completeRoster(db);
 const confirmed=new Set(roster?.gameIds||[]);
 // Rows already loaded for the roster window: each game ID's newest observation.
 const rows=[...(roster?.latest.values()||[])].filter(r=>r.member_id&&(r.snapshot_id===latest.snapshot_id||confirmed.has(r.game_id)));
 const aliases=new Map((await db.prepare("SELECT member_id,json_group_array(raw_value) aliases FROM growth_identity_decisions WHERE status='confirmed' AND member_id IN(SELECT value FROM json_each(?)) GROUP BY member_id").bind(JSON.stringify(rows.map(r=>r.member_id))).all<{member_id:string;aliases:string}>()).results.map(r=>[r.member_id,JSON.parse(r.aliases) as string[]]));
 const members:Member[]=rows.map(r=>({memberId:r.member_id!,gameId:r.game_id,canonical:r.legacy_canonical||r.member_id!,nickname:r.display_name||r.source_name,rank:r.rank,level:r.level,current:confirmed.has(r.game_id)&&r.identity_status==='confirmed'&&r.departed_at===null&&r.status==='valid',temporary:[r.legacy_canonical,r.source_name,r.display_name,...(aliases.get(r.member_id!)||[])].some(n=>!!n&&TEMPORARY.has(n))}));
 return {snapshotId:latest.snapshot_id,sourceAsOf:latest.source_as_of,receivedAt:latest.received_at,identityRevision:latest.identity_revision,members,pending:roster?.pending||[],snapshotAdded:roster?.snapshotAdded||[]};
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
