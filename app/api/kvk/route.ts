import { db,response } from '../../../lib/store';
import { readKvk } from '../../../lib/kvk';
export const dynamic='force-dynamic';
export function OPTIONS(req:Request){return response(req,{},204);}
// 국가원정 기록은 누구나 볼 수 있습니다. 기록은 매시간 수집이 자동으로 남기며 화면에서 고치지 않습니다.
export async function GET(req:Request){try{const doc=await readKvk(db());return response(req,{schema:'3on-kvk-v1',server:295,...doc.data});}catch{return response(req,{error:'국가원정 기록을 읽지 못했습니다.'},500);}}
