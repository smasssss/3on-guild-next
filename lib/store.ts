import { env } from 'cloudflare:workers';
import seed from './release-seed.json';
export const ORIGIN = 'https://smasssss.github.io';
export const STAGING_ORIGIN = 'https://threeon-next-staging.alswlgns2.chatgpt.site';
export const FRONTEND = ORIGIN + '/3on-guild-next/?env=staging-v1';
const ALLOWED_ORIGINS=new Set([ORIGIN,STAGING_ORIGIN]);
export const kinds = ['carriage','power','memos'] as const;
export type Kind = typeof kinds[number];
type Row = {kind:Kind;revision:number;payload:string;updated_at:string};
export function db(){if(!env.DB)throw Error('DB unavailable');return env.DB;}
export function defaults(kind:Kind):unknown{return kind==='carriage'?{pointer:0,records:[],vipCarry:{}}:kind==='memos'?{version:1,members:{}}:{version:1,weeks:[]};}
export function effective(kind:Kind,payload:unknown){
  if(kind!=='power')return payload;
  const data=structuredClone(payload) as {version:number;weeks:{date:string;members:unknown[]}[]};
  for(const week of seed.weeks)if(!data.weeks.some(w=>w.date===week.date))data.weeks.push(week);
  data.weeks.sort((a,b)=>b.date.localeCompare(a.date));return data;
}
export async function read(kind:Kind){const row=await db().prepare('SELECT kind, revision, payload, updated_at FROM documents WHERE kind=?').bind(kind).first<Row>();return {kind,revision:row?.revision||0,data:effective(kind,row?JSON.parse(row.payload):defaults(kind)),updatedAt:row?.updated_at||null};}
export async function hash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
export function random(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');}
export function passwordConfig(){return (env as unknown as {ADMIN_PASSWORD_HASH?:string}).ADMIN_PASSWORD_HASH||'';}
export async function actor(request:Request){const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const config=await passwordConfig();if(!config)return null;const row=await db().prepare('SELECT user FROM credentials WHERE hash=? AND type=? AND expires>? AND challenge=?').bind(await hash(token),'password-session-v1',Date.now(),await hash(config)).first<{user:string}>();return row?.user||null;}
export function cors(request:Request){const headers=new Headers({'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','Vary':'Origin','X-Content-Type-Options':'nosniff'});const origin=request.headers.get('Origin');if(origin&&ALLOWED_ORIGINS.has(origin)){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type,Authorization');}return headers;}
export function response(request:Request,data:unknown,status=200){return status===204?new Response(null,{status,headers:cors(request)}):Response.json(data,{status,headers:cors(request)});}
export function validOrigin(request:Request){const origin=request.headers.get('Origin');return !origin||ALLOWED_ORIGINS.has(origin);}
