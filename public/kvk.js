// 국가원정 탭 (2026-11-20 사용자 결정): 295서버 길드의 국가원정 전투력 손실, 처치 수, 두 자료를 묶은 통계.
// 자료는 매시간 수집이 lastasylum.gg에서 자동으로 남깁니다(/api/kvk, 읽기 전용).
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // 2026-11-20 사용자 결정: 다른 나라 길드도 볼 수 있게 한국어·영어·러시아어·스페인어. 길드 이름·태그는 번역하지 않고 게임 표기 그대로.
 const LANGS={ko:'한국어',en:'English',ru:'Русский',es:'Español'},LOCALE={ko:'ko-KR',en:'en-US',ru:'ru-RU',es:'es-ES'};
 const I18N={
  ko:{title:'국가원정 (295서버)',intro:'매주 토요일 23시~일요일 새벽(한국시간). 295서버 길드만 기록합니다. 자료: lastasylum.gg, 매시간 자동 기록.',lastError:'⚠ 마지막 수집 실패',loading:'기록을 불러오는 중입니다.',loadFail:'국가원정 기록을 읽지 못했습니다.',lang:'언어',week:'주차',noRecords:'기록 없음',tabLoss:'전투력 손실',tabKills:'처치 수',tabStats:'통계',
   taken:'함락(점령)',held:'방어됨(점령 실패)',none:'미참가',pending:'결과 확인 전',fallAt:'함락 {t}',sat:'토',sun:'일',stale:'⚠ 일요일 낮 12시까지 자료가 다 올라오지 않았습니다',noWeek:'이 주 기록이 없습니다.',
   lossNone:'미참가한 주라 손실 기록이 없습니다.',lossMissing:'이 주 손실표는 사이트에서 더 이상 볼 수 없어 기록하지 못했습니다.',lossYet:'손실 기록이 아직 없습니다.',
   lossNote:'전투 시작(토 23시) 전과 끝난 뒤 첫 갱신 때의 길드 전투력 차이입니다. 그 사이 일반 성장도 섞여 실제 손실은 조금 더 큽니다. 숫자는 사이트에 반올림되어 나온 값입니다. 기록 {at}',
   alliance:'길드',powerLost:'전투력 손실',lossPct:'손실률',before:'이전',after:'이후',total:'295서버 합계 손실 {v} · 길드 {n}개',
   gainTitle:'이번 국가원정 처치 증가',gainNote:'토요일 22시({a})와 국가원정 뒤({b}) 누적 처치 수의 차이입니다.',gain:'처치 증가',killsNoneWeek:'미참가한 주입니다.',killsNeed:'국가원정 전(토 22시)과 뒤의 처치 수가 모두 있어야 계산됩니다. 처치 수 기록은 2026년 11월 21일(토)부터 쌓입니다.',
   totalTitle:'누적 처치 수 (가장 최근 기록)',recorded:'기록 {at}',noneYet:'아직 기록이 없습니다.',totalKills:'누적 처치',
   statsTitle:'길드별 국가원정 성적',statsNone:'이 주는 손실·처치 기록이 없어 통계를 낼 수 없습니다.',
   scoreNote:'<b>기여 점수</b> = (처치 기여도 + 손실 기여도) ÷ 2. 처치 기여도는 295서버 전체 처치 증가 중 그 길드 몫, 손실 기여도는 295서버 전체 전투력 손실 중 그 길드 몫입니다. 많이 잡은 길드와 많이 희생한 길드를 똑같이 쳐 줍니다. 한쪽 자료만 있는 주는 있는 쪽만으로 계산합니다. 효율 = 잃은 전투력 100만당 처치 수(참고용).',
   scoreLossOnly:' 이 주는 처치 증가 기록이 없어 손실 기여도만 반영됩니다.',score:'기여 점수',killShare:'처치 기여도',lossShare:'손실 기여도',eff:'효율',
   cumTitle:'누적 기여 (국가원정 {n}회: {weeks})',cumNote:'평균 기여 점수 = 주마다의 기여 점수 합 ÷ 국가원정 횟수. 참여하지 않은 주는 0점으로 칩니다. 도시 배분처럼 길드 사이 비교에 쓰기 좋은 기준입니다.',avgScore:'평균 기여 점수',weeksRec:'기록된 주',cumGain:'누적 처치 증가',cumLoss:'누적 전투력 손실',
   trendTitle:'주차별 추이',result:'결과',srvLoss:'295 전체 손실',usLoss:'3ON 손실',usPct:'3ON 손실률',usGain:'3ON 처치 증가',usEff:'3ON 효율',
   changesTitle:'길드 변동',renamed:'이름 변경 {at}',gone:'처치 순위 목록에서 사라짐(마지막 확인 {at})',newSeen:'새로 보임 {at}',noChanges:'아직 바뀐 길드가 없습니다.',oldName:'이전 이름'},
  en:{title:'KvK — Server 295',intro:'Every Saturday 23:00 to early Sunday (KST, UTC+9). Only alliances of server 295 are recorded. Source: lastasylum.gg, recorded automatically every hour.',lastError:'⚠ Last collection failed',loading:'Loading records…',loadFail:'Could not load the KvK records.',lang:'Language',week:'Week',noRecords:'No records',tabLoss:'Power lost',tabKills:'Kills',tabStats:'Statistics',
   taken:'Captured',held:'Defended (not captured)',none:'Did not take part',pending:'Result not yet in',fallAt:'captured {t}',sat:'Sat',sun:'Sun',stale:'⚠ Data was still incomplete at Sunday 12:00',noWeek:'No record for this week.',
   lossNone:'No losses: the server did not take part this week.',lossMissing:"This week's loss table is no longer available on the source site.",lossYet:'No loss record yet.',
   lossNote:'Difference in alliance power between the start of the battle (Sat 23:00 KST) and the first update after it ended. Normal growth in between is included, so real losses are slightly larger. Figures are rounded as shown on the source site. Recorded {at}',
   alliance:'Alliance',powerLost:'Power lost',lossPct:'Loss %',before:'Before',after:'After',total:'Server 295 total loss {v} · {n} alliances',
   gainTitle:'Kills gained in this KvK',gainNote:'Difference in total kills between Saturday 22:00 KST ({a}) and after the KvK ({b}).',gain:'Kills gained',killsNoneWeek:'The server did not take part this week.',killsNeed:'Needs kill totals from before (Sat 22:00 KST) and after the KvK. Kill records start on Saturday, 21 Nov 2026.',
   totalTitle:'Total kills (latest record)',recorded:'Recorded {at}',noneYet:'No records yet.',totalKills:'Total kills',
   statsTitle:'Alliance results in this KvK',statsNone:'No loss or kill records this week, so no statistics.',
   scoreNote:"<b>Contribution score</b> = (kill share + loss share) ÷ 2. Kill share is the alliance's part of all kills gained by server 295; loss share is its part of all power lost by server 295. Alliances that killed a lot and alliances that sacrificed a lot count equally. When a week has only one of the two, that one alone is used. Efficiency = kills per 1M power lost (for reference).",
   scoreLossOnly:' This week has no kill record, so only the loss share is used.',score:'Score',killShare:'Kill share',lossShare:'Loss share',eff:'Efficiency',
   cumTitle:'Overall contribution ({n} KvKs: {weeks})',cumNote:'Average score = sum of weekly scores ÷ number of KvKs. Weeks an alliance did not appear count as 0. A fair basis for comparing alliances, e.g. when sharing cities.',avgScore:'Average score',weeksRec:'Weeks recorded',cumGain:'Total kills gained',cumLoss:'Total power lost',
   trendTitle:'Week by week',result:'Result',srvLoss:'Server 295 loss',usLoss:'3ON loss',usPct:'3ON loss %',usGain:'3ON kills gained',usEff:'3ON efficiency',
   changesTitle:'Alliance changes',renamed:'renamed {at}',gone:'no longer in the kills ranking (last seen {at})',newSeen:'new, first seen {at}',noChanges:'No alliance changes yet.',oldName:'Former name'},
  ru:{title:'KvK — сервер 295',intro:'Каждую субботу с 23:00 до раннего утра воскресенья (KST, UTC+9). Учитываются только альянсы сервера 295. Источник: lastasylum.gg, данные записываются автоматически каждый час.',lastError:'⚠ Последний сбор данных не удался',loading:'Загрузка данных…',loadFail:'Не удалось загрузить данные KvK.',lang:'Язык',week:'Неделя',noRecords:'Нет данных',tabLoss:'Потери мощи',tabKills:'Убийства',tabStats:'Статистика',
   taken:'Захвачен',held:'Отбит (не захвачен)',none:'Не участвовал',pending:'Результата ещё нет',fallAt:'захвачен {t}',sat:'сб',sun:'вс',stale:'⚠ К воскресенью 12:00 данные так и не обновились полностью',noWeek:'Нет данных за эту неделю.',
   lossNone:'Потерь нет: сервер не участвовал на этой неделе.',lossMissing:'Таблица потерь за эту неделю больше недоступна на сайте-источнике.',lossYet:'Данных о потерях пока нет.',
   lossNote:'Разница мощи альянса между началом битвы (сб 23:00 KST) и первым обновлением после её окончания. Обычный рост за это время тоже входит, поэтому реальные потери немного больше. Числа округлены, как на сайте-источнике. Записано {at}',
   alliance:'Альянс',powerLost:'Потери мощи',lossPct:'Потери %',before:'До',after:'После',total:'Общие потери сервера 295: {v} · альянсов: {n}',
   gainTitle:'Убийства за этот KvK',gainNote:'Разница общего числа убийств между субботой 22:00 KST ({a}) и после KvK ({b}).',gain:'Прирост убийств',killsNoneWeek:'Сервер не участвовал на этой неделе.',killsNeed:'Нужны данные об убийствах до (сб 22:00 KST) и после KvK. Запись убийств ведётся с субботы 21 ноября 2026 г.',
   totalTitle:'Всего убийств (последняя запись)',recorded:'Записано {at}',noneYet:'Пока нет данных.',totalKills:'Всего убийств',
   statsTitle:'Результаты альянсов в этом KvK',statsNone:'За эту неделю нет данных о потерях и убийствах, статистики нет.',
   scoreNote:'<b>Очки вклада</b> = (доля убийств + доля потерь) ÷ 2. Доля убийств — часть альянса во всех убийствах сервера 295, доля потерь — часть альянса во всей потерянной мощи сервера 295. Много убившие и много пожертвовавшие альянсы учитываются одинаково. Если за неделю есть только одно из двух, используется только оно. Эффективность = убийств на 1 млн потерянной мощи (для справки).',
   scoreLossOnly:' За эту неделю нет данных об убийствах, учитывается только доля потерь.',score:'Очки вклада',killShare:'Доля убийств',lossShare:'Доля потерь',eff:'Эффективность',
   cumTitle:'Общий вклад (KvK: {n} — {weeks})',cumNote:'Средние очки = сумма очков за недели ÷ число KvK. Недели без участия альянса считаются как 0. Честная основа для сравнения альянсов, например при распределении городов.',avgScore:'Средние очки',weeksRec:'Недель с данными',cumGain:'Всего убийств за KvK',cumLoss:'Всего потеряно мощи',
   trendTitle:'По неделям',result:'Результат',srvLoss:'Потери сервера 295',usLoss:'Потери 3ON',usPct:'Потери 3ON %',usGain:'Убийства 3ON',usEff:'Эффективность 3ON',
   changesTitle:'Изменения альянсов',renamed:'переименован {at}',gone:'исчез из рейтинга убийств (последний раз {at})',newSeen:'новый, впервые {at}',noChanges:'Изменений альянсов пока нет.',oldName:'Прежнее название'},
  es:{title:'KvK — servidor 295',intro:'Cada sábado de 23:00 a la madrugada del domingo (KST, UTC+9). Solo se registran las alianzas del servidor 295. Fuente: lastasylum.gg, registro automático cada hora.',lastError:'⚠ Falló la última recogida de datos',loading:'Cargando registros…',loadFail:'No se pudieron cargar los registros de KvK.',lang:'Idioma',week:'Semana',noRecords:'Sin registros',tabLoss:'Poder perdido',tabKills:'Bajas',tabStats:'Estadísticas',
   taken:'Conquistado',held:'Defendido (no conquistado)',none:'No participó',pending:'Resultado pendiente',fallAt:'conquistado {t}',sat:'sáb',sun:'dom',stale:'⚠ A las 12:00 del domingo los datos seguían incompletos',noWeek:'No hay registro de esta semana.',
   lossNone:'Sin pérdidas: el servidor no participó esta semana.',lossMissing:'La tabla de pérdidas de esta semana ya no está disponible en la web de origen.',lossYet:'Aún no hay registro de pérdidas.',
   lossNote:'Diferencia de poder de la alianza entre el inicio de la batalla (sáb 23:00 KST) y la primera actualización tras terminar. Incluye el crecimiento normal de ese tiempo, así que las pérdidas reales son algo mayores. Cifras redondeadas como en la web de origen. Registrado {at}',
   alliance:'Alianza',powerLost:'Poder perdido',lossPct:'Pérdida %',before:'Antes',after:'Después',total:'Pérdida total del servidor 295: {v} · {n} alianzas',
   gainTitle:'Bajas obtenidas en este KvK',gainNote:'Diferencia de bajas totales entre el sábado 22:00 KST ({a}) y después del KvK ({b}).',gain:'Bajas obtenidas',killsNoneWeek:'El servidor no participó esta semana.',killsNeed:'Se necesitan las bajas de antes (sáb 22:00 KST) y después del KvK. El registro de bajas empieza el sábado 21 de noviembre de 2026.',
   totalTitle:'Bajas totales (último registro)',recorded:'Registrado {at}',noneYet:'Aún no hay registros.',totalKills:'Bajas totales',
   statsTitle:'Resultados por alianza en este KvK',statsNone:'Sin registros de pérdidas ni bajas esta semana, no hay estadísticas.',
   scoreNote:'<b>Puntuación de contribución</b> = (cuota de bajas + cuota de pérdidas) ÷ 2. La cuota de bajas es la parte de la alianza en todas las bajas obtenidas por el servidor 295; la cuota de pérdidas, su parte de todo el poder perdido por el servidor 295. Las alianzas que matan mucho y las que se sacrifican mucho cuentan igual. Si una semana solo tiene uno de los dos datos, se usa solo ese. Eficiencia = bajas por cada 1M de poder perdido (referencia).',
   scoreLossOnly:' Esta semana no hay registro de bajas, solo cuenta la cuota de pérdidas.',score:'Puntuación',killShare:'Cuota de bajas',lossShare:'Cuota de pérdidas',eff:'Eficiencia',
   cumTitle:'Contribución total ({n} KvK: {weeks})',cumNote:'Puntuación media = suma de puntuaciones semanales ÷ número de KvK. Las semanas sin participación cuentan como 0. Una base justa para comparar alianzas, por ejemplo al repartir ciudades.',avgScore:'Puntuación media',weeksRec:'Semanas registradas',cumGain:'Bajas totales obtenidas',cumLoss:'Poder total perdido',
   trendTitle:'Semana a semana',result:'Resultado',srvLoss:'Pérdida servidor 295',usLoss:'Pérdida 3ON',usPct:'Pérdida 3ON %',usGain:'Bajas 3ON',usEff:'Eficiencia 3ON',
   changesTitle:'Cambios de alianzas',renamed:'renombrada {at}',gone:'ya no aparece en el ranking de bajas (vista por última vez {at})',newSeen:'nueva, vista por primera vez {at}',noChanges:'Aún no hay cambios de alianzas.',oldName:'Nombre anterior'},
 };
 const pickLang=()=>{let v=null;try{v=new URLSearchParams(location.search).get('lang')||localStorage.getItem('kvkLang');}catch{/* 저장소 사용 불가 */}return LANGS[v]?v:'ko';};
 let lang=typeof location==='undefined'?'ko':pickLang();
 const t=(k,vars)=>String(I18N[lang][k]??I18N.ko[k]??k).replace(/\{(\w+)\}/g,(_,n)=>vars?.[n]??'');
 const num=n=>Number(n||0).toLocaleString(LOCALE[lang]);
 const big=n=>{const a=Math.abs(n),s=n<0?'-':'';return a>=1e9?s+(a/1e9).toFixed(2)+'B':a>=1e6?s+(a/1e6).toFixed(1)+'M':s+num(a);};
 const when=ms=>ms?new Date(ms).toLocaleString(LOCALE[lang],{timeZone:'Asia/Seoul',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'-';
 const dayText=d=>{const [y,m,dd]=d.split('-').map(Number);return lang==='ko'?m+'월 '+dd+'일(토)':new Date(Date.UTC(y,m-1,dd)).toLocaleDateString(LOCALE[lang],{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});};
 const fallKst=x=>{if(!x)return '';const [h,m]=x.split(':').map(Number);const k=(h+9)%24;return t(h+9>=24?'sun':'sat')+' '+String(k).padStart(2,'0')+':'+String(m).padStart(2,'0');};
 const RESULT={taken:'taken',held:'held',none:'none'},resultText=r=>RESULT[r]?t(RESULT[r]):t('pending');
 let data=null,view='loss',week=null;

 function name(id){
  const r=data.alliances[id];if(!r)return esc(id);
  const old=r.history.slice(0,-1).map(h=>'['+h.tag+'] '+h.name);
  return '<b>['+esc(r.tag)+']</b> '+esc(r.name)+(old.length?' <span class="kvk-old" title="'+esc(t('oldName'))+'">('+esc(old.join(', '))+')</span>':'');
 }
 const isUs=id=>id==='50373046';
 function table(head,rows){return '<div class="kvk-scroll"><table class="kvk-table"><thead><tr>'+head.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}
 const tr=(id,cells)=>'<tr'+(isUs(id)?' class="kvk-us"':'')+'>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';

 function weekGain(w){
  if(!w?.killsBefore||!w?.killsAfter)return null;
  const before=new Map(w.killsBefore.rows.map(r=>[r.id,r.kills]));
  return w.killsAfter.rows.filter(r=>before.has(r.id)).map(r=>({id:r.id,gain:r.kills-before.get(r.id)}));
 }
 // 한 주의 길드별 몫: 처치 기여도·손실 기여도(295서버 전체 대비 %)와 그 평균(기여 점수)
 function shares(w){
  const gain=weekGain(w),loss=w?.loss?.rows||[];
  const g=new Map((gain||[]).filter(r=>r.gain>0).map(r=>[r.id,r.gain])),l=new Map(loss.filter(r=>r.loss<0).map(r=>[r.id,r]));
  const gTotal=[...g.values()].reduce((s,v)=>s+v,0),lTotal=[...l.values()].reduce((s,r)=>s-r.loss,0);
  return [...new Set([...g.keys(),...l.keys()])].map(id=>{
   const k=gain?(g.get(id)??0):null,x=l.get(id)||null;
   const kShare=gain&&gTotal?100*(k||0)/gTotal:null,lShare=loss.length&&lTotal?100*(x?-x.loss:0)/lTotal:null;
   const parts=[kShare,lShare].filter(v=>v!=null);
   return {id,k,x,kShare,lShare,score:parts.length?parts.reduce((s,v)=>s+v,0)/parts.length:0,eff:k&&x?k/(-x.loss/1e6):null};
  }).sort((a,b)=>b.score-a.score);
 }
 function summary(w){
  if(!w)return '<p class="sub">'+t('noWeek')+'</p>';
  const parts=[resultText(w.result)];
  if(w.target)parts.push('#295 → #'+w.target);if(w.fallUtc)parts.push(t('fallAt',{t:fallKst(w.fallUtc)}));
  if(w.stale)parts.push(t('stale'));
  return '<p class="kvk-result">'+parts.map(esc).join(' · ')+'</p>';
 }

 function renderLoss(w){
  if(!w?.loss)return summary(w)+'<p class="sub">'+(w?.result==='none'?t('lossNone'):w?.lossMissing?t('lossMissing'):t('lossYet'))+'</p>';
  const rows=w.loss.rows.slice().sort((a,b)=>a.loss-b.loss),total=rows.reduce((s,r)=>s+r.loss,0);
  return summary(w)+'<p class="sub">'+t('lossNote',{at:when(w.loss.at)})+'</p>'
   +table(['#',t('alliance'),t('powerLost'),t('lossPct'),t('before'),t('after')],rows.map((r,i)=>tr(r.id,[i+1,name(r.id),big(r.loss),r.pct.toFixed(1)+'%',big(r.before),big(r.after)])))
   +'<p class="kvk-total">'+t('total',{v:'<b>'+big(total)+'</b>',n:rows.length})+'</p>';
 }
 function renderKills(w){
  let html='';
  const gain=weekGain(w);
  html+='<h3>'+t('gainTitle')+'</h3>'+summary(w);
  if(gain)html+='<p class="sub">'+t('gainNote',{a:when(w.killsBefore.at),b:when(w.killsAfter.at)})+'</p>'+table(['#',t('alliance'),t('gain')],gain.sort((a,b)=>b.gain-a.gain).map((r,i)=>tr(r.id,[i+1,name(r.id),num(r.gain)])));
  else html+='<p class="sub">'+(w?.result==='none'?t('killsNoneWeek'):t('killsNeed'))+'</p>';
  const latest=data.killsLatest;
  html+='<h3>'+t('totalTitle')+'</h3>';
  html+=latest?'<p class="sub">'+t('recorded',{at:when(latest.at)})+'</p>'+table(['#',t('alliance'),t('totalKills')],latest.rows.map((r,i)=>tr(r.id,[i+1,name(r.id),num(r.kills)]))):'<p class="sub">'+t('noneYet')+'</p>';
  return html;
 }
 function renderStats(w){
  let html='<h3>'+t('statsTitle')+'</h3>'+summary(w);
  const gain=weekGain(w),loss=w?.loss?.rows||[];
  if(!gain&&!loss.length)html+='<p class="sub">'+t('statsNone')+'</p>';
  else{
   const rows=shares(w);
   html+='<p class="sub">'+t('scoreNote')+(gain?'':t('scoreLossOnly'))+'</p>'
    +table(['#',t('alliance'),t('score'),t('gain'),t('killShare'),t('powerLost'),t('lossPct'),t('lossShare'),t('eff')],rows.map((r,i)=>tr(r.id,[i+1,name(r.id),'<b>'+r.score.toFixed(1)+'</b>',r.k==null?'-':num(r.k),r.kShare==null?'-':r.kShare.toFixed(1)+'%',r.x?big(r.x.loss):'-',r.x?r.x.pct.toFixed(1)+'%':'-',r.lShare==null?'-':r.lShare.toFixed(1)+'%',r.eff==null?'-':num(Math.round(r.eff))])));
  }
  // 누적 기여: 기록이 있는 모든 국가원정 주
  const fought=Object.keys(data.weeks).filter(k=>{const x=data.weeks[k];return (x.result==='taken'||x.result==='held')&&(x.loss||weekGain(x));}).sort();
  if(fought.length){
   const acc=new Map();
   for(const k of fought)for(const r of shares(data.weeks[k])){const a=acc.get(r.id)||{id:r.id,weeks:0,score:0,k:0,kSeen:false,loss:0};a.weeks++;a.score+=r.score;if(r.k!=null){a.k+=r.k;a.kSeen=true;}if(r.x)a.loss+=r.x.loss;acc.set(r.id,a);}
   const list=[...acc.values()].map(a=>({...a,avg:a.score/fought.length})).sort((a,b)=>b.avg-a.avg);
   html+='<h3>'+t('cumTitle',{n:fought.length,weeks:fought.map(dayText).join(', ')})+'</h3><p class="sub">'+t('cumNote')+'</p>'
    +table(['#',t('alliance'),t('avgScore'),t('weeksRec'),t('cumGain'),t('cumLoss')],list.map((a,i)=>tr(a.id,[i+1,name(a.id),'<b>'+a.avg.toFixed(1)+'</b>',a.weeks+'/'+fought.length,a.kSeen?num(a.k):'-',a.loss?big(a.loss):'-'])));
  }
  // 주차별 추이: 서버 합계와 3ON
  const weeks=Object.keys(data.weeks).filter(k=>data.weeks[k].result).sort().reverse();
  html+='<h3>'+t('trendTitle')+'</h3>'+table([t('week'),t('result'),t('srvLoss'),t('usLoss'),t('usPct'),t('usGain'),t('usEff')],weeks.map(k=>{
   const x=data.weeks[k],us=x.loss?.rows.find(r=>isUs(r.id)),gk=weekGain(x)?.find(r=>isUs(r.id))?.gain;
   const total=x.loss?x.loss.rows.reduce((s,r)=>s+r.loss,0):null;
   return '<tr><td>'+dayText(k)+'</td><td>'+esc(x.result?resultText(x.result):'-')+(x.fallUtc?' '+fallKst(x.fallUtc):'')+'</td><td>'+(total==null?'-':big(total))+'</td><td>'+(us?big(us.loss):'-')+'</td><td>'+(us?us.pct.toFixed(1)+'%':'-')+'</td><td>'+(gk==null?'-':num(gk))+'</td><td>'+(gk!=null&&us&&us.loss<0?num(Math.round(gk/(-us.loss/1e6))):'-')+'</td></tr>';
  }));
  // 길드 변동: 새 길드, 이름 변경, 목록에서 사라진 길드
  // '새로 보임'은 처치 순위를 처음 기록한 뒤에 처음 나타난 길드만(지난 손실표에서 처음 본 길드는 새 길드가 아님)
  const latestAt=data.killsLatest?.at||0,changes=[],firstKills=Math.min(...Object.values(data.weeks).flatMap(x=>[x.killsBefore?.at,x.killsAfter?.at]).filter(Boolean),latestAt||Infinity);
  for(const [id,r] of Object.entries(data.alliances)){
   if(r.history.length>1)changes.push(name(id)+' · '+t('renamed',{at:when(r.history[r.history.length-1].at)}));
   if(latestAt&&r.lastSeen<latestAt)changes.push(name(id)+' · '+t('gone',{at:when(r.lastSeen)}));
   if(Number.isFinite(firstKills)&&r.firstSeen>firstKills)changes.push(name(id)+' · '+t('newSeen',{at:when(r.firstSeen)}));
  }
  html+='<h3>'+t('changesTitle')+'</h3>'+(changes.length?'<ul class="kvk-changes">'+changes.map(c=>'<li>'+c+'</li>').join('')+'</ul>':'<p class="sub">'+t('noChanges')+'</p>');
  return html;
 }
 function render(){
  const page=$('kvk');if(!page)return;
  if(!data){page.innerHTML='<div class="card"><h2>'+t('title')+'</h2><p class="sub">'+t('loading')+'</p></div>';return;}
  if(data.error){page.innerHTML='<div class="card"><h2>'+t('title')+'</h2><p class="sub">'+t('loadFail')+'</p></div>';return;}
  const weeks=Object.keys(data.weeks).sort().reverse();if(!week||!data.weeks[week])week=weeks.find(k=>data.weeks[k].loss)||weeks[0]||null;
  const w=week?data.weeks[week]:null;
  page.innerHTML='<div class="card"><h2>'+t('title')+'</h2><p class="sub">'+t('intro')+(data.lastError?' '+t('lastError')+' '+when(data.lastError.at):'')+'</p>'
   +'<div class="kvk-bar"><label for="kvkLang">'+t('lang')+'</label><select id="kvkLang">'+Object.entries(LANGS).map(([k,v])=>'<option value="'+k+'"'+(k===lang?' selected':'')+'>'+v+'</option>').join('')+'</select>'
   +'<label for="kvkWeek">'+t('week')+'</label><select id="kvkWeek">'+(weeks.length?weeks.map(k=>'<option value="'+k+'"'+(k===week?' selected':'')+'>'+esc(dayText(k))+' · '+esc(resultText(data.weeks[k].result))+'</option>').join(''):'<option>'+t('noRecords')+'</option>')+'</select></div>'
   +'<div class="kvk-tabs" role="tablist">'+[['loss','tabLoss'],['kills','tabKills'],['stats','tabStats']].map(([k,label])=>'<button type="button" role="tab" data-kvk="'+k+'" class="'+(view===k?'active':'')+'" aria-selected="'+(view===k)+'">'+t(label)+'</button>').join('')+'</div>'
   +'<div id="kvkBody">'+(view==='loss'?renderLoss(w):view==='kills'?renderKills(w):renderStats(w))+'</div></div>';
  $('kvkWeek').onchange=e=>{week=e.target.value;render();};
  $('kvkLang').onchange=e=>{lang=LANGS[e.target.value]?e.target.value:'ko';try{localStorage.setItem('kvkLang',lang);}catch{/* 저장소 사용 불가 */}render();};
  page.querySelectorAll('[data-kvk]').forEach(b=>b.onclick=()=>{view=b.dataset.kvk;render();});
 }
 async function load(){try{const r=await fetch('/api/kvk',{cache:'no-store'});data=await r.json();if(!r.ok&&!data.error)data={error:'load'};}catch{data={error:'load'};}render();}
 function init(){const page=$('kvk');if(!page||page.dataset.ready)return;page.dataset.ready='1';render();load();}
 if(typeof module!=='undefined'&&module.exports){module.exports={weekGain,shares,big,fallKst,I18N,setLang:v=>{lang=v;}};return;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
