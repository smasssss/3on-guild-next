// 국가원정 기록 (2026-11-20 사용자 결정): 295서버 길드의 국가원정 전투력 손실과 처치 수를 lastasylum.gg 공개 페이지에서 읽어
// documents의 별도 종류 'kvk'에 쌓습니다. 295서버 길드만 저장하고 상대 서버 길드는 버립니다.
// 길드는 이름이 아니라 페이지의 길드 고유 번호로 기록해 이름·태그 변경, 새 길드, 사라진 길드를 이력으로 남깁니다.
// 수집 시각(한국시간): 토요일 22시 처치 수(국가원정 전). 일요일 1시~12시 매시간, 그 주 결과·손실표가 올라왔는지 확인해
// 올라오면 저장하고, 처치 수가 토요일 22시와 달라지면 국가원정 후 처치 수로 저장합니다. 그 밖의 시간에는 부르지 않습니다.
// 지난 주 손실표는 처음 한 번만, 한 시간에 한 주씩 가져옵니다.
export const KVK_KIND = 'kvk';
export const SERVER = 295;
export const KILLS_URL = 'https://lastasylum.gg/ko/leaderboard/servers/295/alliance-kills';
export const kvkUrl = (week?:string) => 'https://lastasylum.gg/ko/leaderboard/kings/kvk?s=295'+(week?'&w='+week:'');
const HOUR = 3_600_000, DAY = 24*HOUR, KST = 9*HOUR;

export type Alliance = {id:string;tag:string;name:string};
export type KillRow = {id:string;kills:number};
export type LossRow = {id:string;loss:number;pct:number;before:number;after:number};
export type Week = {
 result?:'taken'|'held'|'none';fallUtc?:string|null;target?:number|null;resultAt?:number;
 loss?:{at:number;rows:LossRow[]};lossMissing?:boolean;
 killsBefore?:{at:number;rows:KillRow[]};killsAfter?:{at:number;rows:KillRow[]};
 stale?:boolean;
};
export type Registry = {tag:string;name:string;firstSeen:number;lastSeen:number;history:{tag:string;name:string;at:number}[]};
export type KvkData = {version:1;alliances:Record<string,Registry>;weeks:Record<string,Week>;killsLatest:{at:number;rows:KillRow[]}|null;backfill:{done:boolean;tried:string[]};lastError:{at:number;message:string}|null};
export const emptyKvk = ():KvkData => ({version:1,alliances:{},weeks:{},killsLatest:null,backfill:{done:false,tried:[]},lastError:null});

const text = (s:string) => s.replace(/<!-- -->/g,'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").trim();
const integer = (s:string) => {const n=Number(text(s).replace(/,/g,''));if(!Number.isSafeInteger(n))throw Error('KVK_BAD_NUMBER');return n;};
// "-250.6M", "5.1B", "977.5M", "-4.9" → 숫자(페이지에 반올림되어 나온 값 그대로)
export function amount(s:string){
 const m=/^(-?[\d.]+)\s*([KMB]?)$/.exec(text(s).replace(/,/g,''));if(!m)throw Error('KVK_BAD_AMOUNT');
 return Math.round(Number(m[1])*({'':1,K:1e3,M:1e6,B:1e9} as Record<string,number>)[m[2]]);
}
const rowsOf = (table:string) => [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c=>c[1]));
const allianceOf = (cell:string):Alliance => {
 const tag=/<span class="tag">\[([\s\S]*?)\]<\/span>/.exec(cell),link=/href="\/[a-z]{2}\/leaderboard\/alliance\/(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(cell);
 if(!link)throw Error('KVK_NO_ALLIANCE');return {id:link[1],tag:tag?text(tag[1]):'',name:text(link[2])};
};
const tableAfter = (html:string,heading:RegExp) => {const h=heading.exec(html);if(!h)return null;const rest=html.slice(h.index);const t=/<tbody>([\s\S]*?)<\/tbody>/.exec(rest);return t?{heading:h,body:t[1]}:null;};

// 처치 순 길드(295서버): 순위대로 [길드, 처치 수]
export function parseKills(html:string){
 const t=tableAfter(html,/<h2>처치 순 길드<\/h2>/);if(!t)throw Error('KVK_NO_KILLS_TABLE');
 const rows=rowsOf(t.body).map(c=>{if(c.length<3)throw Error('KVK_BAD_ROW');return {...allianceOf(c[1]),kills:integer(c[2])};});
 if(!rows.length||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('KVK_BAD_KILLS');
 return rows;
}
// 국가원정 주간 결과(295서버 줄만): 날짜("11월 7일"), 결과, 함락 시각(UTC), 공격한 서버
export function parseResults(html:string){
 const t=tableAfter(html,/<th>날짜<\/th>/);if(!t)throw Error('KVK_NO_RESULTS');
 return rowsOf('<tbody>'+t.body).filter(c=>c.length>=3).map(c=>{
  const d=/(\d{1,2})월 (\d{1,2})일/.exec(text(c[0]));if(!d)throw Error('KVK_BAD_DATE');
  const servers=[...c[1].matchAll(/\/servers\/(\d+)"/g)].map(m=>Number(m[1]));
  const cell=c[2].replace(/<!-- -->/g,''),result=/kvk-idle/.test(cell)?'none':/kvk-taken/.test(cell)?'taken':/kvk-held/.test(cell)?'held':null;
  if(!result)throw Error('KVK_BAD_RESULT');
  const fall=/kvk-taken">[^<]*<\/span><span class="muted">\s*(\d{1,2}:\d{2})/.exec(cell);
  return {month:Number(d[1]),day:Number(d[2]),result:result as 'taken'|'held'|'none',fallUtc:fall?.[1]??null,attacker:servers[0]??null,target:servers[1]??null};
 }).filter(r=>r.attacker===SERVER);
}
// 길드 전투력 손실표: 제목의 날짜와 295서버 길드 줄만
export function parseLosses(html:string){
 const t=tableAfter(html,/<h2>길드 전투력 손실 (\d{4})년 (\d{1,2})월 (\d{1,2})일/);if(!t)return null;
 const week=`${t.heading[1]}-${t.heading[2].padStart(2,'0')}-${t.heading[3].padStart(2,'0')}`;
 const rows=rowsOf(t.body).filter(c=>c.length>=7&&new RegExp('/servers/'+SERVER+'"').test(c[4])).map(c=>({...allianceOf(c[1]),loss:amount(c[2]),pct:Number(text(c[3])),before:amount(c[5]),after:amount(c[6])}));
 if(rows.some(r=>!Number.isFinite(r.pct))||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('KVK_BAD_LOSSES');
 return {week,rows};
}

// 한국시간 기준 토요일 날짜(국가원정 주차 열쇠)
export const kstParts = (ms:number) => {const d=new Date(ms+KST);return {date:d.toISOString().slice(0,10),day:d.getUTCDay(),hour:d.getUTCHours()};};
const addDays = (date:string,n:number) => new Date(Date.parse(date+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
// "11월 7일" → 가장 가까운 과거의 그 날짜
export function dateOf(month:number,day:number,now:number){
 const today=kstParts(now).date;let year=Number(today.slice(0,4));
 const make=(y:number)=>`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 if(make(year)>addDays(today,1))year--;return make(year);
}

export function remember(data:KvkData,list:Alliance[],at:number){
 for(const a of list){
  const r=data.alliances[a.id];
  if(!r){data.alliances[a.id]={tag:a.tag,name:a.name,firstSeen:at,lastSeen:at,history:[{tag:a.tag,name:a.name,at}]};continue;}
  if(at>=r.lastSeen){if(r.tag!==a.tag||r.name!==a.name){r.history.push({tag:a.tag,name:a.name,at});r.tag=a.tag;r.name=a.name;}r.lastSeen=at;}
 }
}
const sameKills = (a:KillRow[],b:KillRow[]) => {const m=new Map(a.map(r=>[r.id,r.kills]));return b.every(r=>m.get(r.id)===r.kills)&&a.length===b.length;};

type Fetch = (url:string,init:RequestInit)=>Promise<{ok:boolean;status:number;text():Promise<string>}>;
const AGENT = '3ON-Guild/1.0 (server 295 kvk record; at most hourly)';
async function page(fetcher:Fetch,url:string){
 const r=await fetcher(url,{headers:{Accept:'text/html','User-Agent':AGENT},redirect:'follow',signal:AbortSignal.timeout(20_000)});
 if(!r.ok)throw Error('KVK_HTTP_'+r.status);const body=await r.text();if(body.length>2_000_000)throw Error('KVK_TOO_LARGE');return body;
}
function applyResults(data:KvkData,html:string,now:number){
 for(const r of parseResults(html)){
  const week=dateOf(r.month,r.day,now),w=data.weeks[week]||(data.weeks[week]={});
  w.result=r.result;w.fallUtc=r.fallUtc;w.target=r.target;w.resultAt=w.resultAt??now;
 }
}
function applyLosses(data:KvkData,html:string,now:number,week:string){
 const losses=parseLosses(html);if(!losses||losses.week!==week)return false;
 remember(data,losses.rows,now);
 (data.weeks[week]||(data.weeks[week]={})).loss={at:now,rows:losses.rows.map(({id,loss,pct,before,after})=>({id,loss,pct,before,after}))};
 return true;
}

// 매시간 수집 때 한 번 불립니다. 할 일이 없는 시간에는 아무 곳도 부르지 않습니다. 바뀐 자료가 있을 때만 돌려줍니다.
export async function kvkTick(data:KvkData,now:number,fetcher:Fetch):Promise<{changed:boolean;calls:number}>{
 const {date,day,hour}=kstParts(now);let calls=0,changed=false;
 const killsNow=async()=>{calls++;const rows=parseKills(await page(fetcher,KILLS_URL));remember(data,rows,now);data.killsLatest={at:now,rows:rows.map(({id,kills})=>({id,kills}))};changed=true;return data.killsLatest;};
 if(day===6&&hour===22){const w=data.weeks[date]||(data.weeks[date]={});if(!w.killsBefore){w.killsBefore=await killsNow();}}
 if(day===0&&hour>=1&&hour<=12){
  const sat=addDays(date,-1),w=data.weeks[sat]||(data.weeks[sat]={});
  const needResult=!w.result||(w.result!=='none'&&!w.loss);
  if(needResult){calls++;const html=await page(fetcher,kvkUrl(sat));applyResults(data,html,now);if(w.result&&w.result!=='none')applyLosses(data,html,now,sat);changed=true;}
  if(w.result!=='none'&&!w.killsAfter){const k=await killsNow();if(!w.killsBefore||!sameKills(w.killsBefore.rows,k.rows)||hour>=12)w.killsAfter=k;}
  const stale=hour>=12&&(!w.result||(w.result!=='none'&&(!w.loss||!w.killsAfter)));if(!!w.stale!==stale){w.stale=stale;changed=true;}
 }
 // 지난 손실표: 처음 한 번만, 한 시간에 한 주씩
 if(!data.backfill.done){
  if(!data.backfill.tried.includes('latest')){calls++;const html=await page(fetcher,kvkUrl());applyResults(data,html,now);const latest=parseLosses(html);if(latest)applyLosses(data,html,now,latest.week);data.backfill.tried.push('latest');changed=true;}
  else{
   const todo=Object.keys(data.weeks).sort().reverse().find(k=>{const w=data.weeks[k];return (w.result==='taken'||w.result==='held')&&!w.loss&&!data.backfill.tried.includes(k);});
   if(todo){calls++;const ok=applyLosses(data,await page(fetcher,kvkUrl(todo)),now,todo);if(!ok)data.weeks[todo].lossMissing=true;data.backfill.tried.push(todo);changed=true;}
   else{data.backfill.done=true;changed=true;}
  }
 }
 return {changed,calls};
}

type Row={revision:number;payload:string};
export async function readKvk(db:D1Database){const row=await db.prepare('SELECT revision,payload FROM documents WHERE kind=?').bind(KVK_KIND).first<Row>();return {revision:row?.revision??-1,data:row?JSON.parse(row.payload) as KvkData:emptyKvk()};}
// 수집 실패는 성장 수집을 막지 않습니다. 실패 사유만 남기고 다음 시간에 다시 합니다.
export async function collectKvk(db:D1Database,now:number,fetcher:Fetch){
 const current=await readKvk(db),data=structuredClone(current.data);let result;
 try{result=await kvkTick(data,now,fetcher);if(result.changed)data.lastError=null;}
 catch(e){data.lastError={at:now,message:(e as Error).message.slice(0,120)};result={changed:true,calls:-1};}
 if(!result.changed)return result;
 const stamp=new Date(now).toISOString(),payload=JSON.stringify(data);
 if(current.revision<0)await db.prepare("INSERT INTO documents(kind,revision,payload,updated_at,actor,last_mutation) VALUES(?,1,?,?,'kvk-collector',?) ON CONFLICT(kind) DO NOTHING").bind(KVK_KIND,payload,stamp,'kvk-'+now).run();
 else await db.prepare("UPDATE documents SET payload=?,revision=revision+1,updated_at=?,actor='kvk-collector',last_mutation=? WHERE kind=? AND revision=?").bind(payload,stamp,'kvk-'+now,KVK_KIND,current.revision).run();
 return result;
}

// Worker의 매시간 예약 작업에서 불립니다: 운영 모드에서 매시 정각(성장 수집과 같은 시각)에만 동작합니다.
export async function scheduledKvk(controller:{scheduledTime:number},env:{DB?:D1Database;GROWTH_AUTO_MODE?:string}){
 if(env.GROWTH_AUTO_MODE!=='production'||!env.DB||new Date(controller.scheduledTime).getUTCMinutes()!==0)return;
 try{await collectKvk(env.DB,controller.scheduledTime,fetch);}catch(e){console.error('KVK record pending:',(e as Error).message);}
}
