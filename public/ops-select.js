/* 마차장 목록: 휴대폰 기본 선택 목록 대신 사이트 화면과 같은 모양의 선택 창을 띄웁니다.
   원래 선택 칸(select)은 그대로 두고 값만 바꿔 'change'를 보내므로 기존 기능은 그대로입니다. */
(()=>{'use strict';
 const IDS=['leaderSelect'];
 function attach(sel){
  if(!sel||sel.dataset.opsPicker)return;sel.dataset.opsPicker='1';
  const btn=document.createElement('button');btn.type='button';btn.className='ops-pick';btn.setAttribute('aria-haspopup','dialog');
  if(sel.id){const lab=document.querySelector('label[for="'+sel.id+'"]');if(lab)btn.setAttribute('aria-label',lab.textContent);}
  sel.after(btn);sel.classList.add('ops-pick-native');
  const sync=()=>{const o=sel.options[sel.selectedIndex];btn.textContent=o?o.textContent:'선택하세요';btn.disabled=sel.disabled;};
  sync();new MutationObserver(sync).observe(sel,{childList:true,subtree:true,attributes:true,characterData:true});sel.addEventListener('change',sync);setInterval(sync,700);
  btn.addEventListener('click',()=>openPicker(sel,sync));
 }
 function openPicker(sel,sync){
  const wrap=document.createElement('div');wrap.className='modal show ops-pick-modal';wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');
  const card=document.createElement('div');card.className='modal-card';
  const head=document.createElement('div');head.className='ops-pick-head';const h=document.createElement('h3');h.textContent='마차장 선택';
  const close=document.createElement('button');close.type='button';close.className='smallbtn';close.textContent='닫기';head.append(h,close);
  const list=document.createElement('div');list.className='ops-pick-list';list.setAttribute('role','listbox');
  [...sel.options].forEach((o,i)=>{if(o.disabled&&!o.value)return;const row=document.createElement('button');row.type='button';row.className='ops-pick-row'+(i===sel.selectedIndex?' on':'');row.setAttribute('role','option');row.setAttribute('aria-selected',String(i===sel.selectedIndex));
   const t=document.createElement('span');t.textContent=o.textContent;const dot=document.createElement('span');dot.className='ops-pick-dot';row.append(t,dot);
   row.addEventListener('click',()=>{sel.selectedIndex=i;sel.dispatchEvent(new Event('input',{bubbles:true}));sel.dispatchEvent(new Event('change',{bubbles:true}));sync();done();});list.appendChild(row);});
  card.append(head,list);wrap.appendChild(card);document.body.appendChild(wrap);
  const done=()=>{wrap.remove();document.removeEventListener('keydown',esc);};
  const esc=e=>{if(e.key==='Escape')done();};
  close.onclick=done;wrap.addEventListener('click',e=>{if(e.target===wrap)done();});document.addEventListener('keydown',esc);
  (list.querySelector('.on')||list.firstChild)?.focus();
 }
 const start=()=>IDS.forEach(id=>attach(document.getElementById(id)));
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
