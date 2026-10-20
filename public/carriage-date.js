/* Scoped fallback for browsers that do not open the native carriage date picker. */
(()=>{'use strict';
 const date=document.getElementById('runDate');if(!date||document.getElementById('chooseRunDate'))return;
 const button=document.createElement('button');button.id='chooseRunDate';button.type='button';button.className='btn ghost';button.textContent='날짜 선택';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','runDateChoice');button.style.marginTop='8px';
 const panel=document.createElement('div');panel.id='runDateChoice';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label','운행일 날짜 선택');panel.style.cssText='margin-top:8px;padding:12px;border:1px solid #45617b;border-radius:10px;background:#102030';
 panel.innerHTML='<div style="display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:6px"><label>연도<input id="runDateYear" aria-label="운행일 연도" type="number" min="100" max="9999" step="1" inputmode="numeric"></label><label>월<select id="runDateMonth" aria-label="운행일 월"></select></label><label>일<select id="runDateDay" aria-label="운행일 일"></select></label></div><p id="runDateError" role="status" style="font-size:12px;color:#ffb3b3;margin:6px 0"></p><div style="display:flex;gap:8px"><button id="applyRunDate" type="button" class="btn green">날짜 적용</button><button id="cancelRunDate" type="button" class="btn ghost">취소</button></div>';
 date.insertAdjacentElement('afterend',button);button.insertAdjacentElement('afterend',panel);
 const year=panel.querySelector('#runDateYear'),month=panel.querySelector('#runDateMonth'),day=panel.querySelector('#runDateDay'),error=panel.querySelector('#runDateError');
 const pad=n=>String(n).padStart(2,'0');
 const days=(y,m)=>m===2?(y%4===0&&(y%100!==0||y%400===0)?29:28):[4,6,9,11].includes(m)?30:31;
 month.innerHTML=Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'월</option>').join('');
 function refreshDays(selected=Number(day.value)||1){const count=days(Number(year.value),Number(month.value));day.innerHTML=Array.from({length:count},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'일</option>').join('');day.value=String(Math.min(selected,count));}
 function close(){panel.hidden=true;button.setAttribute('aria-expanded','false');}
 button.onclick=()=>{
  if(!panel.hidden){close();return;}
  const current=date.value||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),parts=current.split('-').map(Number);
  year.value=String(parts[0]);month.value=String(parts[1]);refreshDays(parts[2]);error.textContent='';panel.hidden=false;button.setAttribute('aria-expanded','true');
 };
 year.onchange=()=>refreshDays();month.onchange=()=>refreshDays();
 panel.querySelector('#cancelRunDate').onclick=close;
 panel.querySelector('#applyRunDate').onclick=()=>{
  const y=Number(year.value),m=Number(month.value),d=Number(day.value);
  if(!Number.isInteger(y)||y<100||y>9999||!Number.isInteger(m)||m<1||m>12||!Number.isInteger(d)||d<1||d>days(y,m)){error.textContent='올바른 운행일을 선택해 주세요.';return;}
  date.value=String(y).padStart(4,'0')+'-'+pad(m)+'-'+pad(d);
  date.dispatchEvent(new Event('input',{bubbles:true}));date.dispatchEvent(new Event('change',{bubbles:true}));close();
 };
})();
