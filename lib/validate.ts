/* Historical record properties are preserved; only required fields are constrained. */
export function validate(kind:string,data:any){
  const bad=()=>{throw Error('자료 형식을 확인해 주세요.');};
  const obj=(v:any)=>v&&typeof v==='object'&&!Array.isArray(v);
  const date=(s:any)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
  const id=(s:any)=>typeof s==='string'&&/^(guild:|unverified:).+/.test(s)&&s.length<=200;
  if(!obj(data))bad();
  if(kind==='carriage'){
    if(!Number.isInteger(data.pointer)||data.pointer<0||data.pointer>7||!Array.isArray(data.records)||data.records.length>30000)bad();
    const ids=new Set();
    for(const r of data.records){if(!obj(r)||typeof r.id!=='string'||r.id.length>200||ids.has(r.id)||!date(r.date)||!date(r.weekKey)||!['base','insert'].includes(r.type)||typeof r.leader!=='string')bad();ids.add(r.id);}
    for(const field of ['vipCarry','vipResolution'])if(data[field]!==undefined){if(!obj(data[field]))bad();for(const [k,v]of Object.entries(data[field]))if(['__proto__','constructor','prototype'].includes(k)||!Number.isSafeInteger(Number(v))||Number(v)<0)bad();}
  }else if(kind==='power'){
    if(data.version!==1||!Array.isArray(data.weeks)||data.weeks.length>2000)bad();const dates=new Set();
    for(const w of data.weeks){if(!date(w.date)||dates.has(w.date)||!Array.isArray(w.members)||w.members.length>500)bad();dates.add(w.date);const ids=new Set();
      for(const m of w.members){if(!obj(m)||!id(m.id)||ids.has(m.id)||typeof m.nickname!=='string'||!m.nickname.trim()||m.nickname.length>100||!Number.isSafeInteger(m.power)||m.power<0||m.displayName!==undefined&&(typeof m.displayName!=='string'||m.displayName.length>100))bad();ids.add(m.id);}
      w.members.sort((a:any,b:any)=>b.power-a.power||a.nickname.localeCompare(b.nickname,'ko'));w.members.forEach((m:any,i:number)=>m.rank=i+1);
    }data.weeks.sort((a:any,b:any)=>b.date.localeCompare(a.date));
  }else if(kind==='memos'){
    if(data.version!==1||!obj(data.members)||Object.keys(data.members).length>10000)bad();
    for(const [key,m] of Object.entries(data.members) as [string,any][]){if(!id(key)||!obj(m)||typeof m.text!=='string'||m.text.length>10000||typeof m.updatedAt!=='string'||!Number.isFinite(Date.parse(m.updatedAt)))bad();}
  }else bad();return data;
}
