import { db, hash, passwordConfig } from './store';
export const SESSION_MS=60*60*1000;
const WINDOW_MS=15*60*1000;
export async function allowedAttempt(request:Request){
  const now=Date.now(),reset=now+WINDOW_MS;
  const scopes=[['ip:'+await hash(request.headers.get('CF-Connecting-IP')||'unknown'),6],['global',120]] as const;
  await db().batch(scopes.map(([scope])=>db().prepare(`INSERT INTO auth_attempts(scope,count,reset_at) VALUES(?,1,?) ON CONFLICT(scope) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END`).bind(scope,reset,now,now,reset)));
  for(const [scope,limit] of scopes){const r=await db().prepare('SELECT count FROM auth_attempts WHERE scope=?').bind(scope).first<{count:number}>();if(!r||r.count>limit)return false;}
  return true;
}
export async function verifyPassword(password:string,record?:string){
  const config=JSON.parse(record||await passwordConfig()) as {salt:string;hash:string;iterations:number};
  if(!/^[a-f0-9]{32}$/.test(config.salt)||!/^[a-f0-9]{64}$/.test(config.hash)||config.iterations!==100000)throw Error('Authentication unavailable');
  const salt=Uint8Array.from(config.salt.match(/../g)!,x=>parseInt(x,16));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:config.iterations},key,256));
  const expected=Uint8Array.from(config.hash.match(/../g)!,x=>parseInt(x,16));
  let different=0;for(let i=0;i<expected.length;i++)different|=expected[i]^derived[i];
  return different===0;
}
