import { memberHistory } from '../../../../lib/growth';
import { response } from '../../../../lib/store';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{const u=new URL(req.url);return response(req,{observations:await memberHistory(u.searchParams.get('member_id')||'',Number(u.searchParams.get('limit')||200),u.searchParams.get('before'))});}catch{return response(req,{error:'개인 성장기록을 불러오지 못했습니다.'},400);}}
