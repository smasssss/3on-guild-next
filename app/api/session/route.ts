import { actor, db, hash, passwordConfig, random, response, validOrigin } from '../../../lib/store';
import { allowedAttempt, SESSION_MS, verifyPassword } from '../../../lib/password';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}
export async function GET(req:Request){try{return response(req,{admin:!!await actor(req)});}catch{return response(req,{error:'관리자 인증 상태를 확인하지 못했습니다.'},503);}}
export async function POST(req:Request){try{
  if(!validOrigin(req))return response(req,{error:'허용되지 않은 주소입니다.'},403);
  if(!req.headers.get('Content-Type')?.startsWith('application/json'))return response(req,{error:'잘못된 인증 요청입니다.'},400);
  const raw=await req.text();if(raw.length>1024)return response(req,{error:'잘못된 인증 요청입니다.'},400);
  const body=JSON.parse(raw);
  if(body.action==='logout'){
    const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
    if(token)await db().prepare('DELETE FROM credentials WHERE hash=? AND type=?').bind(await hash(token),'password-session-v1').run();
    return response(req,{admin:false});
  }
  if(typeof body.password!=='string'||!body.password||body.password.length>128)return response(req,{error:'관리자 비밀번호를 입력해 주세요.'},400);
  const config=await passwordConfig();if(!config)return response(req,{error:'관리자 인증 설정을 확인해 주세요.'},503);
  if(!await allowedAttempt(req))return response(req,{error:'인증 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.'},429);
  if(!await verifyPassword(body.password,config))return response(req,{error:'비밀번호가 올바르지 않습니다.'},401);
  const token=random(),expires=Date.now()+SESSION_MS;
  await db().batch([
    db().prepare('INSERT INTO credentials(hash,type,user,challenge,expires) VALUES(?,?,?,?,?)').bind(await hash(token),'password-session-v1','administrator',await hash(config),expires),
    db().prepare('DELETE FROM credentials WHERE expires<?').bind(Date.now()),
    db().prepare('DELETE FROM auth_attempts WHERE reset_at<?').bind(Date.now()),
  ]);
  return response(req,{token,expires,scheme:'3on-password-session-v1'});
}catch{return response(req,{error:'관리자 인증을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}}
