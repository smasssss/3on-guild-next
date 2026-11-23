// 정통 경마 기록 (2026-11-23 사용자 결정): 번호를 단 선수 2~10명이 달려 들어온 순서를 기록합니다.
// 누가 몇 번을 다는지(선수 종류)와 순위는 추첨 번호로 정해지고, 다시 보기는 추첨 번호로 같은 경기를 다시 계산합니다.
// 누구나 기록을 볼 수 있고 관리자만 경기를 돌려 기록을 남깁니다. 다른 기록·운영 자료와 섞이지 않도록 documents의 별도 종류 'race'에 보관합니다.
export const RACE_KIND = 'race';
export const MAX_RACE_RECORDS = 200;
export const MIN_RACERS = 2;
export const MAX_RACERS = 10;
// 경기 규칙 판 번호: 화면 쪽 계산(public/race/sim.mjs 의 RACE_VERSION)과 짝입니다. 규칙을 바꾸면 새 번호를 씁니다.
export const RACE_VERSIONS = [1] as const;
export const RACER_TYPES = ['horse','biped','cheetah','panda','ostrich','costume','giraffe','elephant','cow','zebra','turtle'] as const;
export type RaceRecord = {id:string;at:string;actor?:string;seed:string;version:1;n:number;types:string[];order:number[]};
export type RaceData = {version:1;races:RaceRecord[]};
export const emptyRaces = ():RaceData => ({version:1,races:[]});

function invalid(message:string):never{throw Error(message);}
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length>0&&v.length<=max;

/** 기록 한 건을 검사합니다. 선수 종류는 서로 달라야 하고, 순위는 1~n번이 한 번씩 들어 있어야 합니다. */
export function validateRace(input:unknown):RaceRecord{
 if(!input||typeof input!=='object')invalid('경기 기록 형식을 확인해 주세요.');
 const d=input as Record<string,unknown>;
 if(!text(d.id,64)||!/^[a-f0-9-]{16,64}$/.test(String(d.id)))invalid('경기 기록 번호를 확인해 주세요.');
 if(!text(d.seed,16)||!/^[0-9a-f]{8}$/.test(String(d.seed)))invalid('추첨 번호를 확인해 주세요.');
 if(!RACE_VERSIONS.includes(d.version as 1))invalid('경기 규칙 판을 확인해 주세요.');
 const n=d.n as number;
 if(!Number.isSafeInteger(n)||n<MIN_RACERS||n>MAX_RACERS)invalid('선수 수를 확인해 주세요.');
 if(!Array.isArray(d.types)||d.types.length!==n||new Set(d.types).size!==n||!(d.types as unknown[]).every(x=>(RACER_TYPES as readonly unknown[]).includes(x)))invalid('선수 종류를 확인해 주세요.');
 if(!Array.isArray(d.order)||d.order.length!==n||new Set(d.order).size!==n||!(d.order as unknown[]).every(x=>Number.isSafeInteger(x)&&(x as number)>=1&&(x as number)<=n))invalid('순위를 확인해 주세요.');
 return {id:String(d.id),at:'',seed:String(d.seed),version:1,n,types:(d.types as string[]).slice(),order:(d.order as number[]).slice()};
}

/** 새 기록을 맨 앞에 넣고 최근 MAX_RACE_RECORDS건만 남깁니다. 같은 번호의 기록은 다시 넣지 않습니다. */
export function addRace(data:RaceData,race:RaceRecord):RaceData{
 if(data.races.some(x=>x.id===race.id))return data;
 return {version:1,races:[race,...data.races].slice(0,MAX_RACE_RECORDS)};
}
