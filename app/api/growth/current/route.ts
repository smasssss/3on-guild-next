import { currentMembers } from '../../../../lib/growth';
import { response } from '../../../../lib/store';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{return response(req,await currentMembers());}catch{return response(req,{error:'성장자료를 불러오지 못했습니다.'},503);}}
