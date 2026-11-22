// 런닝머신 레이스 기록 (2026-11-22 사용자 결정): 누구나 기록을 볼 수 있고, 관리자만 경기를 돌려 기록을 남깁니다.
// 핀볼 추첨 기록·운영 자료와 섞이지 않도록 documents의 별도 종류 'treadmill3d'에 보관합니다.
// 한 판 = 물건 정하기(1번 자리부터) → 자리 정하기(단순 핀볼, 들어간 순서대로 1번 자리부터 주인) → 런닝머신 경기(떨어진 순서가 최하위부터).
export const TREADMILL_KIND = 'treadmill3d';
export const MAX_RACES = 200;
export const MIN_RACERS = 2;
export const MAX_RACERS = 15;
// 물건 종류. 인형(doll)은 한 판에 최대 1개(걸리면 불리한 물건).
export const ITEMS = ['orange','baseball','watermelon','can','tissue','tape','sedan','racer','kei','doll'] as const;
// 경기 설정 판 번호: 화면 쪽 물리 설정(public/treadmill3d/sim.mjs 의 RACE_V1)과 짝입니다. 설정을 바꾸면 새 번호를 씁니다.
// 2판(2026-11-23 사용자 결정): 자리 정하기 핀볼 앞에 섞는 통(바람으로 공을 날려 섞은 뒤 문이 열림)을 넣음. 경기 설정은 1판과 같음.
// 3판(2026-11-23 사용자 결정): 10초 재출발을 없애고, 오목한 바닥 대신 평평한 벨트 + 뒤쪽의 높은 경사로 + 가운데로 살짝 기운 양옆,
// 낮은 이음매, 10초마다 벨트가 조금 빨라지고 경사로가 조금 내려옴(RACE_V3). 자리 정하기는 2판과 같음.
export const VERSIONS = [1,2,3] as const;
export type Racer = {memberId:string;nickname:string};
export type Race = {id:string;at:string;actor?:string;seed:string;version:1|2|3;source:'manual'|'pinball';pinballDrawId?:string;participants:Racer[];items:string[];slots:string[];order:string[];restarts:number;seconds:number;timedOut:boolean};
export type TreadmillData = {version:1;races:Race[]};
export const emptyTreadmill = ():TreadmillData => ({version:1,races:[]});

function invalid(message:string):never{throw Error(message);}
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length>0&&v.length<=max;

/** 기록 한 건을 검사합니다. 참가자·자리 주인·탈락 순서가 서로 맞아야 저장됩니다. */
export function validateRace(input:unknown):Race{
 if(!input||typeof input!=='object')invalid('경기 기록 형식을 확인해 주세요.');
 const d=input as Record<string,unknown>;
 if(!text(d.id,64)||!/^[a-f0-9-]{16,64}$/.test(String(d.id)))invalid('경기 기록 번호를 확인해 주세요.');
 if(!text(d.seed,16)||!/^[0-9a-f]{8}$/.test(String(d.seed)))invalid('추첨 번호를 확인해 주세요.');
 if(!VERSIONS.includes(d.version as 1))invalid('경기 설정 판을 확인해 주세요.');
 if(d.source!=='manual'&&d.source!=='pinball')invalid('참가자 고르는 방법을 확인해 주세요.');
 if(d.source==='pinball'&&!(text(d.pinballDrawId,64)&&/^[a-f0-9-]{16,64}$/.test(String(d.pinballDrawId))))invalid('가져온 핀볼 기록을 확인해 주세요.');
 if(d.source==='manual'&&d.pinballDrawId!==undefined)invalid('가져온 핀볼 기록을 확인해 주세요.');
 if(!Array.isArray(d.participants)||d.participants.length<MIN_RACERS||d.participants.length>MAX_RACERS)invalid('참가 인원을 확인해 주세요.');
 const ids=new Set<string>();
 const participants=(d.participants as unknown[]).map(p=>{
  const x=p as Record<string,unknown>;
  if(!x||!text(x.memberId,120)||!text(x.nickname,80)||ids.has(String(x.memberId)))invalid('참가자 정보를 확인해 주세요.');
  ids.add(String(x.memberId));return {memberId:String(x.memberId),nickname:String(x.nickname)};
 });
 const n=participants.length;
 if(!Array.isArray(d.items)||d.items.length!==n||!(d.items as unknown[]).every(k=>typeof k==='string'&&(ITEMS as readonly string[]).includes(k))||(d.items as string[]).filter(k=>k==='doll').length>1)invalid('물건 정보를 확인해 주세요.');
 const permutation=(v:unknown)=>Array.isArray(v)&&v.length===n&&new Set(v).size===n&&(v as unknown[]).every(id=>typeof id==='string'&&ids.has(id));
 if(!permutation(d.slots))invalid('자리 주인을 확인해 주세요.');
 if(!permutation(d.order))invalid('탈락 순서를 확인해 주세요.');
 if(!Number.isSafeInteger(d.restarts)||(d.restarts as number)<0||(d.restarts as number)>50)invalid('재출발 횟수를 확인해 주세요.');
 if(typeof d.seconds!=='number'||!Number.isFinite(d.seconds)||d.seconds<=0||d.seconds>600)invalid('경기 시간을 확인해 주세요.');
 if(typeof d.timedOut!=='boolean')invalid('경기 설정을 확인해 주세요.');
 return {id:String(d.id),at:'',seed:String(d.seed),version:d.version as 1|2|3,source:d.source,...(d.source==='pinball'?{pinballDrawId:String(d.pinballDrawId)}:{}),participants,items:(d.items as string[]).slice(),slots:(d.slots as string[]).slice(),order:(d.order as string[]).slice(),restarts:d.restarts as number,seconds:Math.round((d.seconds as number)*10)/10,timedOut:d.timedOut as boolean};
}

/** 새 기록을 맨 앞에 넣고 최근 MAX_RACES건만 남깁니다. 같은 번호의 기록은 다시 넣지 않습니다. */
export function addRace(data:TreadmillData,race:Race):TreadmillData{
 if(data.races.some(x=>x.id===race.id))return data;
 return {version:1,races:[race,...data.races].slice(0,MAX_RACES)};
}
