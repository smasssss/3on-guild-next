/* 선택 칸·날짜 칸: 휴대폰 기본 목록(아래 화살표 메뉴) 대신 사이트 화면과 같은 모양의 선택 창을 띄웁니다.
   원래 칸(select, input[type=date])은 숨겨 두고 값만 바꿔 'input'·'change'를 보내므로 기존 기능은 그대로입니다.
   나중에 그려지는 칸도 자동으로 바꿉니다. 여러 개를 고르는 칸은 그대로 둡니다. */
(()=>{'use strict';
 const DOW=['일','월','화','수','목','금','토'];
 const linked=new Set();
 const titleOf=el=>{
  const lab=(el.id&&document.querySelector('label[for="'+el.id+'"]'))||el.closest('.field')?.querySelector('label');
  const t=(lab?.textContent||el.getAttribute('aria-label')||'').trim();
  return t&&t!==' '?t:(el.type==='date'?'날짜 선택':'선택하세요');
 };
 const pad=n=>String(n).padStart(2,'0');
 const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const dateText=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return '날짜를 고르세요';const d=new Date(v+'T00:00:00');return v+' ('+DOW[d.getDay()]+')';};
 const fire=el=>{el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
 function attach(el){
  if(!el||el.dataset.opsPicker||el.closest('.ops-pick-modal'))return;
  const isDate=el.tagName==='INPUT';
  if(!isDate&&(el.multiple||el.size>1))return;
  el.dataset.opsPicker='1';
  const btn=document.createElement('button');btn.type='button';btn.className='ops-pick'+(isDate?' date':'');btn.setAttribute('aria-haspopup','dialog');btn.setAttribute('aria-label',titleOf(el));
  el.after(btn);el.classList.add('ops-pick-native');
  const sync=()=>{
   if(!el.isConnected){btn.remove();linked.delete(sync);return;}
   const text=isDate?dateText(el.value):(el.options[el.selectedIndex]?.textContent||'선택하세요');
   if(btn.textContent!==text)btn.textContent=text;
   btn.disabled=el.disabled||el.readOnly;btn.hidden=el.hidden||el.style.display==='none';
  };
  el._opsSync=sync;linked.add(sync);sync();el.addEventListener('change',sync);el.addEventListener('input',sync);
  btn.addEventListener('click',()=>isDate?openCalendar(el,sync):openList(el,sync));
 }
 function shell(title){
  const wrap=document.createElement('div');wrap.className='modal show ops-pick-modal';wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');
  const card=document.createElement('div');card.className='modal-card';
  const head=document.createElement('div');head.className='ops-pick-head';const h=document.createElement('h3');h.textContent=title;
  const close=document.createElement('button');close.type='button';close.className='smallbtn';close.textContent='닫기';head.append(h,close);
  card.appendChild(head);wrap.appendChild(card);document.body.appendChild(wrap);
  const back=document.activeElement;
  const done=()=>{wrap.remove();document.removeEventListener('keydown',esc);back?.focus?.();};
  const esc=e=>{if(e.key==='Escape')done();};
  close.onclick=done;wrap.addEventListener('click',e=>{if(e.target===wrap)done();});document.addEventListener('keydown',esc);
  h.id='opsPickTitle'+Date.now();wrap.setAttribute('aria-labelledby',h.id);
  return {card,done};
 }
 function openList(sel,sync){
  const {card,done}=shell(titleOf(sel));
  const list=document.createElement('div');list.className='ops-pick-list';list.setAttribute('role','listbox');
  [...sel.options].forEach((o,i)=>{if(o.disabled&&!o.value)return;const row=document.createElement('button');row.type='button';row.className='ops-pick-row'+(i===sel.selectedIndex?' on':'');row.setAttribute('role','option');row.setAttribute('aria-selected',String(i===sel.selectedIndex));row.disabled=o.disabled;
   const t=document.createElement('span');t.textContent=o.textContent;const dot=document.createElement('span');dot.className='ops-pick-dot';row.append(t,dot);
   row.addEventListener('click',()=>{done();if(sel.selectedIndex!==i){sel.selectedIndex=i;fire(sel);}sync();});list.appendChild(row);});
  card.appendChild(list);(list.querySelector('.on')||list.firstChild)?.focus();
 }
 function openCalendar(input,sync){
  const {card,done}=shell(titleOf(input));
  const valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'');
  const today=iso(new Date());let view=new Date((valid(input.value)?input.value:today).slice(0,7)+'-01T00:00:00');
  const nav=document.createElement('div');nav.className='ops-cal-nav';
  const prev=document.createElement('button');prev.type='button';prev.textContent='‹';prev.setAttribute('aria-label','이전 달');
  const next=document.createElement('button');next.type='button';next.textContent='›';next.setAttribute('aria-label','다음 달');
  const label=document.createElement('b');nav.append(prev,label,next);
  const grid=document.createElement('div');grid.className='ops-cal-grid';
  const foot=document.createElement('div');foot.className='ops-cal-foot';
  const todayBtn=document.createElement('button');todayBtn.type='button';todayBtn.className='smallbtn';todayBtn.textContent='오늘';foot.appendChild(todayBtn);
  const allowed=v=>(!input.min||v>=input.min)&&(!input.max||v<=input.max);
  const pick=v=>{done();if(input.value!==v){input.value=v;fire(input);}sync();};
  todayBtn.disabled=!allowed(today);todayBtn.onclick=()=>pick(today);
  function draw(){
   label.textContent=view.getFullYear()+'년 '+(view.getMonth()+1)+'월';grid.replaceChildren();
   DOW.forEach(d=>{const s=document.createElement('span');s.textContent=d;grid.appendChild(s);});
   for(let i=0;i<view.getDay();i++)grid.appendChild(document.createElement('i'));
   const last=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
   for(let day=1;day<=last;day++){const v=iso(new Date(view.getFullYear(),view.getMonth(),day));const b=document.createElement('button');b.type='button';b.textContent=day;
    b.className=(v===input.value?'on ':'')+(v===today?'today':'');b.disabled=!allowed(v);b.setAttribute('aria-label',v);if(v===input.value)b.setAttribute('aria-pressed','true');b.onclick=()=>pick(v);grid.appendChild(b);}
  }
  prev.onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);draw();};
  next.onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);draw();};
  card.append(nav,grid,foot);draw();(grid.querySelector('.on')||grid.querySelector('.today')||grid.querySelector('button'))?.focus();
 }
 const scan=root=>{if(root.matches?.('select,input[type="date"]'))attach(root);root.querySelectorAll?.('select,input[type="date"]').forEach(attach);};
 const start=()=>{
  scan(document);
  new MutationObserver(list=>list.forEach(m=>m.addedNodes.forEach(n=>n.nodeType===1&&scan(n)))).observe(document.body,{childList:true,subtree:true});
  // 다른 기능이 값만 바꾼 경우(예: 날짜 자동 입력)도 버튼 글자를 맞춥니다.
  setInterval(()=>linked.forEach(f=>f()),700);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
