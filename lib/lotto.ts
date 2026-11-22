// 로또 추첨기 기록 (2026-11-23 사용자 결정): 숫자 공을 넣고 원하는 만큼 뽑아, 첫 번째·두 번째… 뽑힌 순서대로 기록합니다.
// 누구나 기록을 볼 수 있고 관리자만 추첨을 돌려 기록을 남깁니다. 다른 기록·운영 자료와 섞이지 않도록 documents의 별도 종류 'lotto'에 보관합니다.
export const LOTTO_KIND = 'lotto';
export const MAX_LOTTO_DRAWS = 200;
export const MIN_BALLS = 2;
export const MAX_BALLS = 60; // 통에 넣는 공의 수(끝 번호 - 시작 번호 + 1)
export const MAX_NUMBER = 999;
// 추첨기 설정 판 번호: 화면 쪽 물리 설정(public/lotto3d/sim.mjs 의 LOTTO_V1)과 짝입니다. 설정을 바꾸면 새 번호를 씁니다.
export const LOTTO_VERSIONS = [1] as const;
export type LottoDraw = {id:string;at:string;actor?:string;seed:string;version:1;from:number;to:number;count:number;numbers:number[]};
export type LottoData = {version:1;draws:LottoDraw[]};
export const emptyLotto = ():LottoData => ({version:1,draws:[]});

function invalid(message:string):never{throw Error(message);}
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length>0&&v.length<=max;

/** 기록 한 건을 검사합니다. 뽑힌 숫자는 범위 안의 서로 다른 숫자여야 하고, 개수가 맞아야 합니다. */
export function validateLotto(input:unknown):LottoDraw{
 if(!input||typeof input!=='object')invalid('추첨 기록 형식을 확인해 주세요.');
 const d=input as Record<string,unknown>;
 if(!text(d.id,64)||!/^[a-f0-9-]{16,64}$/.test(String(d.id)))invalid('추첨 기록 번호를 확인해 주세요.');
 if(!text(d.seed,16)||!/^[0-9a-f]{8}$/.test(String(d.seed)))invalid('추첨 번호를 확인해 주세요.');
 if(!LOTTO_VERSIONS.includes(d.version as 1))invalid('추첨기 설정 판을 확인해 주세요.');
 const from=d.from as number,to=d.to as number,count=d.count as number;
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to>MAX_NUMBER||to-from+1<MIN_BALLS||to-from+1>MAX_BALLS)invalid('번호 범위를 확인해 주세요.');
 if(!Number.isSafeInteger(count)||count<1||count>to-from+1)invalid('뽑는 개수를 확인해 주세요.');
 if(!Array.isArray(d.numbers)||d.numbers.length!==count||new Set(d.numbers).size!==count||!(d.numbers as unknown[]).every(x=>Number.isSafeInteger(x)&&(x as number)>=from&&(x as number)<=to))invalid('뽑힌 번호를 확인해 주세요.');
 return {id:String(d.id),at:'',seed:String(d.seed),version:1,from,to,count,numbers:(d.numbers as number[]).slice()};
}

/** 새 기록을 맨 앞에 넣고 최근 MAX_LOTTO_DRAWS건만 남깁니다. 같은 번호의 기록은 다시 넣지 않습니다. */
export function addLotto(data:LottoData,draw:LottoDraw):LottoData{
 if(data.draws.some(x=>x.id===draw.id))return data;
 return {version:1,draws:[draw,...data.draws].slice(0,MAX_LOTTO_DRAWS)};
}
