// 핀볼 추첨 기록 (2026-11-09 사용자 결정): 누구나 기록을 볼 수 있고, 관리자만 추첨을 돌려 기록을 남깁니다.
// 기록은 운영 자료(carriage/power/memos)와 섞이지 않도록 documents의 별도 종류 'pinball'에 보관합니다.
export const PINBALL_KIND = 'pinball';
export const MAX_DRAWS = 200;
export const MAX_PARTICIPANTS = 150;
export type Participant = {memberId:string;nickname:string;points:number};
export type Draw = {id:string;at:string;actor?:string;seed:string;threshold:number;includeFixed:boolean;mode:'first'|'last';count:number;week:string|null;participants:Participant[];order:string[];picks:string[];timedOut:boolean};
export type PinballData = {version:1;draws:Draw[]};
export const emptyPinball = ():PinballData => ({version:1,draws:[]});

function invalid(message:string):never{throw Error(message);}
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length>0&&v.length<=max;

/** 기록 한 건을 검사합니다. 참가자·골인 순서·뽑힌 사람이 서로 맞아야 저장됩니다. */
export function validateDraw(input:unknown):Draw{
 if(!input||typeof input!=='object')invalid('추첨 기록 형식을 확인해 주세요.');
 const d=input as Record<string,unknown>;
 if(!text(d.id,64)||!/^[a-f0-9-]{16,64}$/.test(String(d.id)))invalid('추첨 기록 번호를 확인해 주세요.');
 if(!text(d.seed,16)||!/^[0-9a-f]{8}$/.test(String(d.seed)))invalid('추첨 번호를 확인해 주세요.');
 if(!Number.isSafeInteger(d.threshold)||(d.threshold as number)<0)invalid('점수 기준을 확인해 주세요.');
 if(typeof d.includeFixed!=='boolean'||typeof d.timedOut!=='boolean')invalid('추첨 설정을 확인해 주세요.');
 if(d.mode!=='first'&&d.mode!=='last')invalid('뽑는 방식을 확인해 주세요.');
 if(d.week!==null&&!(typeof d.week==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.week)))invalid('길드전 주차를 확인해 주세요.');
 if(!Array.isArray(d.participants)||d.participants.length<1||d.participants.length>MAX_PARTICIPANTS)invalid('참가 인원을 확인해 주세요.');
 const ids=new Set<string>();
 const participants=(d.participants as unknown[]).map(p=>{
  const x=p as Record<string,unknown>;
  if(!x||!text(x.memberId,120)||!text(x.nickname,80)||!Number.isSafeInteger(x.points)||(x.points as number)<0||ids.has(String(x.memberId)))invalid('참가자 정보를 확인해 주세요.');
  if((x.points as number)<(d.threshold as number))invalid('점수 기준보다 낮은 참가자가 있습니다.');
  ids.add(String(x.memberId));return {memberId:String(x.memberId),nickname:String(x.nickname),points:x.points as number};
 });
 if(!Number.isSafeInteger(d.count)||(d.count as number)<1||(d.count as number)>participants.length)invalid('뽑는 인원을 확인해 주세요.');
 if(!Array.isArray(d.order)||d.order.length!==participants.length||new Set(d.order).size!==participants.length||!(d.order as unknown[]).every(id=>typeof id==='string'&&ids.has(id)))invalid('골인 순서를 확인해 주세요.');
 const order=d.order as string[],count=d.count as number;
 const expected=d.mode==='first'?order.slice(0,count):order.slice(order.length-count);
 if(!Array.isArray(d.picks)||JSON.stringify(d.picks)!==JSON.stringify(expected))invalid('뽑힌 사람이 골인 순서와 맞지 않습니다.');
 return {id:String(d.id),at:'',seed:String(d.seed),threshold:d.threshold as number,includeFixed:d.includeFixed as boolean,mode:d.mode,count,week:(d.week as string|null),participants,order,picks:expected,timedOut:d.timedOut as boolean};
}

/** 새 기록을 맨 앞에 넣고 최근 MAX_DRAWS건만 남깁니다. 같은 번호의 기록은 다시 넣지 않습니다. */
export function addDraw(data:PinballData,draw:Draw):PinballData{
 if(data.draws.some(x=>x.id===draw.id))return data;
 return {version:1,draws:[draw,...data.draws].slice(0,MAX_DRAWS)};
}
