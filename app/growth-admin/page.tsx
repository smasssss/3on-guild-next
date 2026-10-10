'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';

const SESSION_KEY='3on_admin_session_v2_staging';
const mutation=()=>crypto.randomUUID();
const complete=(row:any)=>['resolved','new'].includes(row.resolution_status);
const fmt=(value:any)=>value==null?'—':Number(value).toLocaleString('ko-KR');

function token(){try{const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return value&&value.expires>Date.now()?value.token:''}catch{return''}}
async function call(path:string,options:RequestInit={}):Promise<any>{
  const response=await fetch(path,{...options,cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(token()?{Authorization:'Bearer '+token()}:{}),...options.headers}});
  const data:any=await response.json().catch(()=>({error:'응답을 읽지 못했습니다.'}));
  if(!response.ok)throw new Error(data.error||'요청을 완료하지 못했습니다.');return data;
}

function badge(row:any){
  if(!complete(row))return {text:'판독 실패',kind:'fail'};
  if(row.review_version>0&&row.confirm_alias===1)return {text:'닉변',kind:'rename'};
  if(row.review_version>0&&row.proposed_display_name)return {text:'OCR 수정',kind:'ocr'};
  if(row.review_version>0)return {text:'수정',kind:'edit'};
  if(row.resolution_status==='new')return {text:'NEW',kind:'new'};
  if(row.nickname_change_guess)return {text:'닉변 추정',kind:'rename'};
  return null;
}

function Crop({url}:{url:string}){
  const [src,setSrc]=useState('');
  useEffect(()=>{let object='';fetch(url,{headers:{Authorization:'Bearer '+token()},cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.blob()}).then(blob=>{object=URL.createObjectURL(blob);setSrc(object)}).catch(()=>setSrc(''));return()=>{if(object)URL.revokeObjectURL(object)}},[url]);
  return src?<img className="editCrop" src={src} alt="판독 대상"/>:null;
}

function Editor({row,members,busy,onClose,onSave,onReset}:{row:any;members:any[];busy:boolean;onClose:()=>void;onSave:(value:any)=>void;onReset:()=>void}){
  const initialMember=row.resolved_member_id||row.candidate_member_id||'';
  const [name,setName]=useState(row.proposed_display_name||row.member_display_name||row.candidate_name||row.raw_name||'');
  const [level,setLevel]=useState(row.level==null?'':String(row.level));
  const [power,setPower]=useState(row.power==null?'':String(row.power));
  const [rank,setRank]=useState(row.rank||'R1');
  const [memberId,setMemberId]=useState(initialMember);
  const [rename,setRename]=useState(false);
  const selected=members.find(member=>member.member_id===memberId);
  const valid=name.trim()&&Number.isSafeInteger(Number(level))&&Number(level)>0&&Number.isSafeInteger(Number(power))&&Number(power)>=0&&/^R[1-5]$/.test(rank);
  return <div className="simpleOverlay" role="dialog" aria-modal="true" aria-labelledby="editTitle"><div className="simpleSheet">
    <header><div><span>성장자료 직접 수정</span><h2 id="editTitle">{row.member_display_name||row.proposed_display_name||row.raw_name}</h2></div><button className="closeButton" onClick={onClose} aria-label="닫기">×</button></header>
    <div className="sheetContent">
      {row.asset_url&&<Crop url={row.asset_url}/>}<div className="readInfo"><span>AI 판독</span><b>{row.raw_name}</b><small>{row.uncertainty_reason||'자동 처리 결과'}</small></div>
      <label>닉네임<input value={name} maxLength={100} onChange={event=>setName(event.target.value)}/></label>
      <div className="editFields"><label>등급<select value={rank} onChange={event=>setRank(event.target.value)}>{['R5','R4','R3','R2','R1'].map(value=><option key={value}>{value}</option>)}</select></label><label>레벨<input inputMode="numeric" value={level} onChange={event=>setLevel(event.target.value)}/></label><label>전투력<input inputMode="numeric" value={power} onChange={event=>setPower(event.target.value)}/></label></div>
      <details className="advanced"><summary>고급 수정 · 연결 대상 변경</summary><p>자동 연결이 틀린 경우에만 사용하세요.</p><label>현재 연결<select value={memberId} onChange={event=>{setMemberId(event.target.value);setRename(false)}}><option value="">기존 연결 없음 · 신규 member</option>{members.map(member=><option key={member.member_id} value={member.member_id}>{member.display_name} · {member.canonical||'canonical 없음'} · Lv.{member.level}</option>)}</select></label>{memberId&&<label className="check"><input type="checkbox" checked={rename} onChange={event=>setRename(event.target.checked)}/><span>OCR 수정이 아니라 실제 닉네임 변경으로 기록</span></label>}<small>OCR 오독 수정은 alias로 저장하지 않습니다. 실제 닉네임 변경을 선택한 경우에만 nickname history와 이전 이름 연결을 남깁니다.</small></details>
      {selected&&<p className="selectedMember">연결 대상: <b>{selected.display_name}</b> · {selected.rank} · Lv.{selected.level} · {fmt(selected.power)}</p>}
    </div>
    <div className="editDock"><button className="secondary" disabled={busy} onClick={onClose}>취소</button>{row.review_version>0&&<button className="dangerGhost" disabled={busy} onClick={onReset}>수정 취소</button>}<button disabled={busy||!valid} onClick={()=>onSave({display_name:name.trim(),level:Number(level),power:Number(power),rank,member_id:memberId,nickname_mode:rename?'rename':'ocr_correction'})}>{busy?'저장 중…':'저장'}</button></div>
  </div></div>;
}

export default function GrowthAdmin(){
  const [admin,setAdmin]=useState(false),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[current,setCurrent]=useState<any>(null),[batches,setBatches]=useState<any[]>([]),[batchId,setBatchId]=useState(''),[review,setReview]=useState<any>(null),[changedOnly,setChangedOnly]=useState(false),[editing,setEditing]=useState<any>(null),[publishOpen,setPublishOpen]=useState(false),[published,setPublished]=useState<any>(null);
  const loadCurrent=useCallback(async()=>{try{setCurrent(await call('/api/growth/current'))}catch(e:any){setNotice(e.message)}},[]);
  const loadReview=useCallback(async(id:string)=>{if(!id)return;try{const value=await call('/api/growth/review?batch_id='+encodeURIComponent(id));setReview(value);setBatchId(id)}catch(e:any){setNotice(e.message)}},[]);
  const loadBatches=useCallback(async(preferred='')=>{const list=(await call('/api/growth/batches')).batches;setBatches(list);const chosen=preferred||list.find((item:any)=>['needs_review','ready'].includes(item.state))?.batch_id||list[0]?.batch_id||'';if(chosen)await loadReview(chosen)},[loadReview]);
  useEffect(()=>{loadCurrent();call('/api/session').then(value=>{setAdmin(!!value.admin);if(value.admin)loadBatches()}).catch(()=>setAdmin(false))},[loadCurrent,loadBatches]);
  const members=current?.members||[];
  const rows=useMemo(()=>{
    const list=[...(review?.rows||[])].sort((a:any,b:any)=>Number(!!badge(b))-Number(!!badge(a))||a.row_index-b.row_index);
    return changedOnly?list.filter(row=>!!badge(row)):list;
  },[review,changedOnly]);
  const summary=review?.summary||{};

  async function login(event:React.FormEvent){event.preventDefault();setBusy(true);try{const value=await call('/api/session',{method:'POST',body:JSON.stringify({password})});sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));setAdmin(true);setPassword('');setNotice('관리자 인증 완료');await loadBatches()}catch(e:any){setNotice(e.message)}finally{setBusy(false)}}
  async function logout(){try{await call('/api/session',{method:'POST',body:JSON.stringify({action:'logout'})})}catch{}sessionStorage.removeItem(SESSION_KEY);setAdmin(false);setReview(null)}
  async function upload(event:React.ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file)return;setBusy(true);setNotice('AI 처리 결과를 검사하고 있습니다…');try{const result=await call('/api/growth/upload',{method:'POST',body:await file.text(),headers:{'Content-Type':'application/json'}});await loadBatches(result.batch.batch_id);setNotice(result.duplicate?'이미 등록된 결과를 열었습니다.':'AI 처리 결과를 만들었습니다. 이상한 항목만 수정하세요.')}catch(e:any){setNotice(e.message)}finally{setBusy(false);event.target.value=''}}
  async function saveEdit(value:any){if(!editing||!review)return;setBusy(true);try{const action=value.member_id?'direct_connect':'direct_new';const result=await call('/api/growth/review',{method:'POST',body:JSON.stringify({batch_id:review.batch.batch_id,row_id:editing.row_id,draft_revision:review.batch.draft_revision,mutation:mutation(),action,...value})});setReview(result);setEditing(null);setNotice('수정했습니다. 아직 Draft이며 공개자료에는 반영되지 않았습니다.')}catch(e:any){setNotice(e.message)}finally{setBusy(false)}}
  async function resetEdit(){if(!editing||!review)return;setBusy(true);try{const result=await call('/api/growth/review',{method:'POST',body:JSON.stringify({batch_id:review.batch.batch_id,row_id:editing.row_id,draft_revision:review.batch.draft_revision,mutation:mutation(),action:'reset'})});setReview(result);setEditing(null);setNotice('수정을 취소했습니다.')}catch(e:any){setNotice(e.message)}finally{setBusy(false)}}
  async function acceptWarnings(){if(!review)return;setBusy(true);try{const result=await call('/api/growth/review',{method:'POST',body:JSON.stringify({batch_id:review.batch.batch_id,draft_revision:review.batch.draft_revision,mutation:mutation(),action:'accept_warnings'})});setReview(result);setNotice('검증 경고를 확인했습니다.')}catch(e:any){setNotice(e.message)}finally{setBusy(false)}}
  async function publish(){if(!review)return;setBusy(true);try{const result=await call('/api/growth/publish',{method:'POST',body:JSON.stringify({batch_id:review.batch.batch_id,growth_revision:review.batch.base_growth_revision,identity_revision:review.batch.identity_revision,draft_revision:review.batch.draft_revision,mutation:mutation()})});setPublished(result);setPublishOpen(false);setNotice('성장자료를 최종 반영했습니다.');await loadCurrent();await loadBatches(review.batch.batch_id)}catch(e:any){setNotice(e.message)}finally{setBusy(false)}}

  return <main className="simpleAdmin">
    <div className="stagingBanner"><b>STAGING · 테스트 환경</b><span>이 화면의 변경은 Production에 반영되지 않습니다.</span></div>
    <header className="adminHeader"><a href="../legacy.html#settings">← 운영센터</a><div><span>3ON 관리설정</span><h1>성장자료 업데이트</h1></div>{admin&&<button className="secondary" onClick={logout}>로그아웃</button>}</header>
    {notice&&<div className="simpleNotice" role="status">{notice}</div>}
    {!admin?<form className="simpleCard loginCard" onSubmit={login}><h2>관리자 확인</h2><p>Staging 관리자 비밀번호를 입력하세요.</p><input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password"/><button disabled={busy}>{busy?'확인 중…':'인증'}</button></form>:<>
      <section className="simpleCard uploadCard"><div><h2>성장자료 입력</h2><p>AI가 만든 업데이트 파일을 선택하면 기존 member 연결과 신규 등록을 자동 처리합니다.</p></div><label className="fileButton">{busy?'처리 중…':'파일 선택'}<input type="file" accept=".json,application/json" disabled={busy} onChange={upload}/></label></section>
      {batches.length>0&&<label className="batchPicker">확인할 자료<select value={batchId} onChange={event=>loadReview(event.target.value)}>{batches.map(item=><option key={item.batch_id} value={item.batch_id}>{item.observed_date} · {item.slot}{item.slot.includes('test')?' · TEST':''} · {item.state}</option>)}</select></label>}
      {review&&<>
        <section className="resultHead simpleCard"><div className="resultTitle"><div><span>{review.batch.observed_date} 성장자료 {review.batch.slot.includes('test')&&<b className="testBadge">TEST</b>}</span><h2>AI 처리 결과</h2></div><span className="draftBadge">{review.batch.state==='published'?'Published':'Draft'}</span></div><div className="resultCounts"><div><b>{summary.total||0}</b><span>전체</span></div><div><b>{summary.auto_connections||0}</b><span>기존 자동연결</span></div><div><b>{summary.new_members||0}</b><span>신규</span></div><div><b>{summary.nickname_changes||0}</b><span>닉변 추정</span></div><div className={summary.failures?'warnCount':''}><b>{summary.failures||0}</b><span>판독 실패</span></div></div><p>현재 공개자료: {current?.observed_date||'—'} · revision {current?.revision??'—'}</p><div className="viewButtons"><button className={!changedOnly?'active':''} onClick={()=>setChangedOnly(false)}>전체 결과 보기</button><button className={changedOnly?'active':''} onClick={()=>setChangedOnly(true)}>이번 변경만 보기 · {summary.changed_members||0}</button></div></section>
        {review.batch.validation?.blocking?.length>0&&<div className="blocking"><b>인원수 또는 자료 범위 경고가 있습니다.</b><span>내용을 확인한 경우에만 계속하세요.</span><button disabled={busy} onClick={acceptWarnings}>경고 확인</button></div>}
        {summary.failures>0&&<div className="failureGuide"><b>⚠ 판독 실패 {summary.failures}건</b><span>보류하지 않고 해당 항목을 눌러 닉네임·등급·레벨·전투력을 즉시 수정해 주세요.</span></div>}
        <section className="resultList">{rows.map((row:any)=>{const mark=badge(row);return <button className={'resultRow '+(mark?.kind||'normal')} key={row.row_id} onClick={()=>setEditing(row)}><div>{mark&&<span className={'rowBadge '+mark.kind}>{mark.text}</span>}<strong>{row.proposed_display_name||row.member_display_name||row.candidate_name||row.raw_name}</strong>{row.raw_name!==(row.proposed_display_name||row.member_display_name)&&<small>AI: {row.raw_name}</small>}</div><div className="rowStats"><span>{row.rank||'—'}</span><span>Lv.{row.level??'—'}</span><b>{fmt(row.power)}</b></div><span className="chevron">›</span></button>})}{!rows.length&&<p className="empty">표시할 항목이 없습니다.</p>}</section>
        {review.batch.state!=='published'&&<section className="publishBar"><div><b>{summary.failures?`판독 실패 ${summary.failures}건을 먼저 수정하세요.`:'최종 반영 준비 완료'}</b><span>기존 연결 {summary.connections||0} · 신규 {summary.new_members||0} · 직접수정 {summary.user_edits||0}</span></div><button disabled={busy||summary.failures>0||review.batch.validation?.blocking?.length>0||review.batch.state!=='ready'} onClick={()=>setPublishOpen(true)}>최종 반영</button></section>}
      </>}
    </>}
    {editing&&<Editor row={editing} members={members} busy={busy} onClose={()=>setEditing(null)} onSave={saveEdit} onReset={resetEdit}/>} 
    {publishOpen&&review&&<div className="simpleOverlay" role="alertdialog" aria-modal="true"><div className="publishCard"><span>최종 반영</span><h2>{review.batch.observed_date} 성장자료</h2><dl><div><dt>기존 연결</dt><dd>{summary.connections||0}</dd></div><div><dt>신규</dt><dd>{summary.new_members||0}</dd></div><div><dt>닉네임 수정·추정</dt><dd>{summary.nickname_changes||0}</dd></div><div><dt>수치 직접수정</dt><dd>{summary.user_edits||0}</dd></div><div><dt>판독 실패</dt><dd>{summary.failures||0}</dd></div></dl><p>반영 후 모든 Staging 화면에 새 성장자료가 표시됩니다. Production은 변경되지 않습니다.</p><div><button className="secondary" disabled={busy} onClick={()=>setPublishOpen(false)}>취소</button><button disabled={busy} onClick={publish}>{busy?'반영 중…':'최종 반영'}</button></div></div></div>}
    {published&&<div className="publishedToast"><b>✅ 성장자료 반영 완료</b><span>growth revision {published.growth_revision}</span><a href="../legacy.html#growth">성장추적 보기</a></div>}
  </main>;
}
