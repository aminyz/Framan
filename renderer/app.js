'use strict';
const CIRC = 2 * Math.PI * 96;
const PERIODS = [
  { id:'morning',   name:'صبح',         icon:'🌅' },
  { id:'afternoon', name:'ظهر',         icon:'☀️' },
  { id:'evening',   name:'شب',          icon:'🌙' },
  { id:'anytime',   name:'انعطاف‌پذیر', icon:'📋' },
];
const PDAY_SHORT = ['ش','ی','د','س','چ','پ','ج'];
const PDAY_FULL  = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];

let allTasks   = [];
let taskFilter = 'all';
let curSection = 'dashboard';
const cal = { view:'daily', dailyDate:todayISO(), weekStart:weekStartOf(new Date()), monthYM:todayISO().slice(0,7) };
let calModalCtx = { date:'', period:'anytime' };
let calModalCb  = null;
let dayModalDate = '';

// ── Timer ────────────────────────────────────────────────────────────────────
const tmr = { status:'idle', totalSec:25*60, taskId:null, distractions:0, iid:null,
               sessStart:0, totalPausedMs:0, pauseStart:0 };

function tmrStudyMs() {
  if (tmr.status==='idle') return 0;
  const pausedNow = tmr.pauseStart ? Date.now()-tmr.pauseStart : 0;
  return Math.max(0, Date.now()-tmr.sessStart-tmr.totalPausedMs-pausedNow);
}
function tmrRemaining() { return Math.max(0, tmr.totalSec - Math.floor(tmrStudyMs()/1000)); }

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setGreeting(); setSidebarDate();
  bindNav(); bindTasks(); bindFocus(); bindCalendar(); bindModals(); bindSettings();
  allTasks = await window.api.getTasks();
  await refreshDashboard();
  renderTasks();
  populateFocusSel();
});

// ── Nav ──────────────────────────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('.ni').forEach(b => b.addEventListener('click', ()=>navTo(b.dataset.sec)));
  $('dash-go-tasks').addEventListener('click', ()=>navTo('tasks'));
  $('dash-add-btn') .addEventListener('click', ()=>navTo('tasks'));
}
function navTo(sec) {
  curSection=sec;
  document.querySelectorAll('.ni').forEach(b=>b.classList.toggle('active',b.dataset.sec===sec));
  document.querySelectorAll('.sec').forEach(s=>{s.classList.remove('active');s.classList.add('hidden');});
  const el=$('sec-'+sec); el.classList.remove('hidden'); el.classList.add('active');
  if(sec==='dashboard') refreshDashboard();
  if(sec==='tasks')     renderTasks();
  if(sec==='focus')     populateFocusSel();
  if(sec==='calendar')  initCalendar();
  if(sec==='settings')  loadSettings();
}

// ── Greeting ─────────────────────────────────────────────────────────────────
function setGreeting() {
  const h=new Date().getHours();
  $('greeting').textContent=(h<12?'صبح بخیر':h<17?'ظهر بخیر':'شب بخیر')+' — بهترین لحظه برای شروع همین الانه 💪';
}
function setSidebarDate() {
  $('sidebar-date').textContent=new Date().toLocaleDateString('fa-IR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
}

// ── Dashboard ────────────────────────────────────────────────────────────────
async function refreshDashboard() {
  const st=await window.api.getStats();
  $('s-tasks').textContent=st.tasksCompleted;
  $('s-study').textContent=st.studyMinutes;
  $('s-sess') .textContent=st.sessionsCount;
  $('s-distr').textContent=st.distractionsCount;
  const pending=allTasks.filter(t=>!t.done).slice(0,6);
  const list=$('dash-list'), empty=$('dash-empty');
  list.innerHTML='';
  if(!pending.length){empty.classList.remove('hidden');return;}
  empty.classList.add('hidden');
  pending.forEach(t=>{
    const d=document.createElement('div'); d.className='dash-item';
    d.innerHTML=`<span class="pb ${pcls(t.priority)}">${plbl(t.priority)}</span><span class="di-title">${esc(t.title)}</span>`;
    list.appendChild(d);
  });
}

// ── Tasks ────────────────────────────────────────────────────────────────────
function bindTasks() {
  const inp=$('task-inp'), btn=$('task-add-btn');
  const doAdd=async()=>{
    const title=inp.value.trim(); if(!title){inp.focus();return;}
    const t=await window.api.addTask({title,priority:$('task-prio').value});
    allTasks.push(t); inp.value=''; inp.focus(); renderTasks(); populateFocusSel();
    if(curSection==='dashboard') refreshDashboard();
  };
  btn.addEventListener('click',doAdd);
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')doAdd();});
  document.querySelectorAll('.fb').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.fb').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); taskFilter=b.dataset.f; renderTasks();
  }));
}
function renderTasks() {
  const list=$('task-list'), empty=$('task-empty');
  const pw={high:0,medium:1,low:2};
  const items=allTasks.filter(t=>taskFilter==='active'?!t.done:taskFilter==='done'?t.done:true)
    .sort((a,b)=>a.done!==b.done?a.done?1:-1:(pw[a.priority]??1)-(pw[b.priority]??1));
  list.innerHTML='';
  if(!items.length){empty.classList.remove('hidden');return;}
  empty.classList.add('hidden');
  items.forEach(t=>list.appendChild(buildTaskEl(t)));
}
function buildTaskEl(task) {
  const el=document.createElement('div'); el.className=`task-item${task.done?' done':''}`;
  el.innerHTML=`<div class="ti-chk">${task.done?'✓':''}</div><span class="ti-title">${esc(task.title)}</span><span class="pb ${pcls(task.priority)}">${plbl(task.priority)}</span><button class="ti-del" title="حذف">🗑</button>`;
  el.querySelector('.ti-chk').addEventListener('click',async()=>{
    const u=await window.api.toggleTask(task.id);
    const i=allTasks.findIndex(x=>x.id===task.id); if(i>=0&&u)allTasks[i]=u;
    renderTasks(); if(curSection==='dashboard')refreshDashboard();
  });
  el.querySelector('.ti-del').addEventListener('click',async()=>{
    await window.api.deleteTask(task.id); allTasks=allTasks.filter(x=>x.id!==task.id);
    renderTasks(); populateFocusSel();
  });
  return el;
}

// ── Focus Timer ───────────────────────────────────────────────────────────────
function bindFocus() {
  document.querySelectorAll('.dur').forEach(b=>b.addEventListener('click',()=>{
    if(tmr.status!=='idle')return;
    document.querySelectorAll('.dur').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); tmr.totalSec=parseInt(b.dataset.min)*60; renderFace(tmr.totalSec);
  }));
  $('btn-start').addEventListener('click',tmrStart);
  $('btn-pause').addEventListener('click',tmrPause);
  $('btn-stop') .addEventListener('click',tmrStop);
  $('btn-distr').addEventListener('click',()=>{
    if(tmr.status!=='running')return;
    tmr.distractions++;
    $('t-distr').textContent=`⚡ ${tmr.distractions} حواس‌پرتی`;
  });
}
function populateFocusSel() {
  const sel=$('focus-task-sel'), prev=sel.value;
  sel.innerHTML='<option value="">— بدون وظیفه —</option>';
  allTasks.filter(t=>!t.done).forEach(t=>{
    const o=document.createElement('option'); o.value=t.id;
    o.textContent=t.title.length>42?t.title.slice(0,42)+'…':t.title; sel.appendChild(o);
  });
  if(prev) sel.value=prev;
}
function tmrStart() {
  if(tmr.status==='running')return;
  if(tmr.status==='idle'){
    tmr.totalSec=parseInt(document.querySelector('.dur.active')?.dataset.min||25)*60;
    tmr.taskId=$('focus-task-sel').value||null;
    tmr.distractions=0; tmr.sessStart=Date.now(); tmr.totalPausedMs=0; tmr.pauseStart=0;
  }
  if(tmr.status==='paused'&&tmr.pauseStart){ tmr.totalPausedMs+=Date.now()-tmr.pauseStart; tmr.pauseStart=0; }
  tmr.status='running'; updateTimerUI();
  tmr.iid=setInterval(()=>{
    const rem=tmrRemaining(); renderFace(rem);
    const studySec=Math.floor(tmrStudyMs()/1000);
    $('t-study').textContent=`📖 مطالعه: ${fmt(Math.floor(studySec/60))}:${fmt(studySec%60)}`;
    if(rem<=0){clearInterval(tmr.iid);finishSession(true);}
  },500);
}
function tmrPause() {
  if(tmr.status!=='running')return;
  clearInterval(tmr.iid); tmr.pauseStart=Date.now(); tmr.status='paused'; updateTimerUI();
}
function tmrStop() {
  if(tmr.status==='idle')return;
  clearInterval(tmr.iid); finishSession(false);
}
async function finishSession(completed) {
  const studySec=Math.floor(tmrStudyMs()/1000);
  const wallSec =Math.floor((Date.now()-tmr.sessStart)/1000);
  if(studySec>=5){
    await window.api.addSession({taskId:tmr.taskId,durationSeconds:wallSec,studySeconds:studySec,distractions:tmr.distractions,completed});
  }
  if(completed){
    window.api.notify({title:'✅ نشست تمرکز تموم شد! — MindDock',body:`مطالعه: ${Math.floor(studySec/60)} دقیقه | حواس‌پرتی: ${tmr.distractions} بار`});
    $('sess-modal-body').innerHTML=`<p>⏱ کل جلسه: <strong>${minsec(wallSec)}</strong></p><p>📖 زمان واقعی مطالعه: <strong>${minsec(studySec)}</strong></p><p>⚡ حواس‌پرتی: <strong>${tmr.distractions} بار</strong></p>`;
    $('sess-modal').classList.remove('hidden');
  }
  Object.assign(tmr,{status:'idle',distractions:0,taskId:null,sessStart:0,totalPausedMs:0,pauseStart:0});
  renderFace(tmr.totalSec); updateTimerUI();
  $('t-distr').textContent=''; $('t-study').textContent='';
  if(curSection==='dashboard')refreshDashboard();
}
function renderFace(rem) {
  $('t-time').textContent=`${fmt(Math.floor(rem/60))}:${fmt(rem%60)}`;
  const ring=$('t-ring');
  ring.style.strokeDashoffset=CIRC*(1-rem/tmr.totalSec);
  ring.style.stroke=(rem<=300&&tmr.status!=='idle')?'#ef4444':'';
}
function updateTimerUI() {
  const {status:s}=tmr;
  tog('btn-start',!(s==='idle'||s==='paused')); tog('btn-pause',s!=='running');
  tog('btn-stop',!(s==='running'||s==='paused')); tog('btn-distr',s!=='running');
  tog('focus-cfg',s!=='idle');
  $('btn-start').textContent=s==='paused'?'▶ ادامه':'▶ شروع';
  $('t-phase').textContent=s==='running'?'🔥 در حال تمرکز':s==='paused'?'⏸ مکث':'آماده';
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function bindCalendar() {
  document.querySelectorAll('.ct').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  $('d-prev').addEventListener('click',()=>{cal.dailyDate=addDays(cal.dailyDate,-1);renderDaily();});
  $('d-next').addEventListener('click',()=>{cal.dailyDate=addDays(cal.dailyDate,+1);renderDaily();});
  $('w-prev').addEventListener('click',()=>{cal.weekStart=addDaysD(cal.weekStart,-7);renderWeekly();});
  $('w-next').addEventListener('click',()=>{cal.weekStart=addDaysD(cal.weekStart,+7);renderWeekly();});
  $('m-prev').addEventListener('click',()=>{cal.monthYM=addMonth(cal.monthYM,-1);renderMonthly();});
  $('m-next').addEventListener('click',()=>{cal.monthYM=addMonth(cal.monthYM,+1);renderMonthly();});
}
async function initCalendar() { switchView(cal.view, false); }
function switchView(view, render=true) {
  cal.view=view;
  document.querySelectorAll('.ct').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  ['daily','weekly','monthly'].forEach(v=>{ const e=$('view-'+v); v===view?e.classList.remove('hidden'):e.classList.add('hidden'); });
  if(render) renderCurrentView();
  else renderCurrentView();
}
function renderCurrentView() {
  if(cal.view==='daily')  renderDaily();
  if(cal.view==='weekly') renderWeekly();
  if(cal.view==='monthly')renderMonthly();
}

async function renderDaily() {
  const date=cal.dailyDate;
  $('d-lbl').textContent=new Date(date+'T12:00:00').toLocaleDateString('fa-IR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const tasks=await window.api.getCalDate(date);
  const body=$('daily-body'); body.innerHTML='';
  PERIODS.forEach(p=>{
    const pt=tasks.filter(t=>t.period===p.id);
    const sec=document.createElement('div'); sec.className='period-sec';
    sec.innerHTML=`<div class="period-hdr"><span class="p-icon">${p.icon}</span><span class="p-name">${p.name}</span><span class="p-count">${pt.length?pt.length+' تسک':''}</span><button class="btn-add-p" data-date="${date}" data-period="${p.id}">+ افزودن</button></div><div class="period-tasks" id="pt-${p.id}"></div>`;
    const cont=sec.querySelector(`#pt-${p.id}`);
    if(!pt.length) cont.innerHTML='<p class="p-empty">تسکی نیست</p>';
    else pt.forEach(t=>cont.appendChild(buildCalItem(t,()=>renderDaily())));
    sec.querySelector('.btn-add-p').addEventListener('click',e=>openCalModal(e.target.dataset.date,e.target.dataset.period,()=>renderDaily()));
    body.appendChild(sec);
  });
}

async function renderWeekly() {
  const ws=cal.weekStart, we=addDaysD(ws,6);
  $('w-lbl').textContent=`${fa(ws,'short')} — ${fa(we,'short')}`;
  const tasks=await window.api.getCalRange(dateStr(ws),dateStr(we));
  const body=$('weekly-body'); body.innerHTML='';
  const today=todayISO();
  const grid=document.createElement('div'); grid.className='week-grid';
  for(let i=0;i<7;i++){
    const d=addDaysD(ws,i), ds=dateStr(d), isT=ds===today;
    const pDay=jsPDay(d.getDay());
    const col=document.createElement('div'); col.className=`wday-col${isT?' today':''}`;
    col.innerHTML=`<div class="wday-hdr"><span class="wd-name">${PDAY_FULL[pDay]}</span><span class="wd-date">${d.toLocaleDateString('fa-IR',{month:'short',day:'numeric'})}</span></div><div class="wday-tasks" id="wt-${ds}"></div>`;
    const wt=col.querySelector(`#wt-${ds}`);
    const dayTasks=tasks.filter(t=>t.date===ds);
    if(!dayTasks.length) wt.innerHTML='<p class="p-empty" style="font-size:11px">خالی</p>';
    else dayTasks.forEach(t=>{
      const el=document.createElement('div'); el.className=`wt${t.done?' done':''}`;
      el.innerHTML=`<span class="wt-chk">${t.done?'✓':'○'}</span><span class="wt-txt">${esc(t.title)}</span>`;
      el.querySelector('.wt-chk').addEventListener('click',async()=>{ await window.api.toggleCal(t.id); t.done=!t.done; el.classList.toggle('done',t.done); el.querySelector('.wt-chk').textContent=t.done?'✓':'○'; if(curSection==='dashboard')refreshDashboard(); });
      wt.appendChild(el);
    });
    const ab=document.createElement('button'); ab.className='btn-add-w'; ab.textContent='+ تسک';
    ab.addEventListener('click',()=>openCalModal(ds,'anytime',()=>renderWeekly()));
    wt.appendChild(ab); grid.appendChild(col);
  }
  body.appendChild(grid);
}

async function renderMonthly() {
  const ym=cal.monthYM; const [y,m]=ym.split('-').map(Number);
  $('m-lbl').textContent=new Date(y,m-1,1).toLocaleDateString('fa-IR',{year:'numeric',month:'long'});
  const stats=await window.api.getMonth(ym);
  const body=$('monthly-body'); body.innerHTML='';
  const today=todayISO();
  const hdr=document.createElement('div'); hdr.className='month-dow-row';
  PDAY_SHORT.forEach(d=>{const e=document.createElement('div');e.className='month-dow';e.textContent=d;hdr.appendChild(e);});
  body.appendChild(hdr);
  const grid=document.createElement('div'); grid.className='month-grid';
  const offset=jsPDay(new Date(y,m-1,1).getDay());
  for(let i=0;i<offset;i++){const e=document.createElement('div');e.className='mc empty';grid.appendChild(e);}
  stats.forEach(({date,day,studyMinutes,tasksTotal,tasksDone})=>{
    const cell=document.createElement('div');
    const isT=date===today, isPast=date<today;
    let cls='mc'; if(isT)cls+=' today';
    if(tasksTotal>0){if(tasksDone===tasksTotal)cls+=' all-done';else if(tasksDone>0)cls+=' partial';else if(isPast)cls+=' missed';}
    cell.className=cls; cell.dataset.date=date;
    cell.innerHTML=`<span class="mc-day">${day.toLocaleString('fa-IR')}</span>${studyMinutes>0?`<span class="mc-time">${studyMinutes.toLocaleString('fa-IR')}م</span>`:''}${tasksTotal>0?`<div class="mc-bar"><span class="done">${tasksDone}</span>/<span class="tot">${tasksTotal}</span></div>`:''}`;
    // ← کلیک روی روز = نمایش گزارش آنالیز، نه فرم
    cell.addEventListener('click',()=>openDayReport(date));
    grid.appendChild(cell);
  });
  body.appendChild(grid);
  const leg=document.createElement('div'); leg.className='month-legend';
  leg.innerHTML=`<span><span class="ld all-done"></span>همه انجام شد</span><span><span class="ld partial"></span>بخشی انجام شد</span><span><span class="ld missed"></span>انجام نشد</span><span style="color:var(--acc2);font-size:11px">عدد = دقیقه مطالعه (م)</span>`;
  body.appendChild(leg);
}

// ── Day Analytics ─────────────────────────────────────────────────────────────
async function openDayReport(date) {
  dayModalDate=date;
  const r=await window.api.getDayReport(date);
  $('day-modal-title').textContent=new Date(date+'T12:00:00').toLocaleDateString('fa-IR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  let html=`<div class="report-stats">
    <div class="rs-item"><span class="rs-val">${r.studyMinutes}</span><span class="rs-lbl">دقیقه مطالعه</span></div>
    <div class="rs-item"><span class="rs-val">${r.totalMinutes}</span><span class="rs-lbl">کل جلسات</span></div>
    <div class="rs-item"><span class="rs-val">${r.sessionsCount}</span><span class="rs-lbl">نشست تمرکز</span></div>
    <div class="rs-item"><span class="rs-val">${r.distractionsTotal}</span><span class="rs-lbl">حواس‌پرتی</span></div>
  </div>`;
  if(!r.calTasks.length){
    html+='<p class="report-empty">📋 هیچ تسکی برای این روز ثبت نشده</p>';
  } else {
    html+='<div class="report-tasks">';
    r.calTasks.forEach(t=>{
      const pName=PERIODS.find(p=>p.id===t.period)?.name||'';
      html+=`<div class="rt-item${t.done?' done':''}"><span class="rt-icon">${t.done?'✅':'⏰'}</span>${t.subject?`<span class="rt-sub">${esc(t.subject)}</span>`:''}<span class="rt-title">${esc(t.title)}</span><span class="rt-prd">${pName}</span></div>`;
    });
    html+='</div>';
  }
  $('day-modal-body').innerHTML=html;
  $('day-modal').classList.remove('hidden');
}

// ── Cal Modal ─────────────────────────────────────────────────────────────────
function openCalModal(date, period, cb) {
  calModalCtx={date,period}; calModalCb=cb||null;
  const p=PERIODS.find(x=>x.id===period);
  const dl=new Date(date+'T12:00:00').toLocaleDateString('fa-IR',{month:'long',day:'numeric'});
  $('cal-modal-title').textContent=`افزودن تسک — ${dl} / ${p?.name||''}`;
  $('cm-title').value=''; $('cm-subject').value=''; $('cm-prio').value='medium'; $('cm-notify').checked=true;
  $('cm-title-err').classList.add('hidden');
  $('cal-modal').classList.remove('hidden');
  setTimeout(()=>$('cm-title').focus(),80);
}
async function saveCalTask() {
  const title=$('cm-title').value.trim();
  if(!title){$('cm-title-err').classList.remove('hidden');$('cm-title').focus();return;}
  $('cm-title-err').classList.add('hidden');
  await window.api.addCalTask({title,date:calModalCtx.date,period:calModalCtx.period,priority:$('cm-prio').value,subject:$('cm-subject').value,notifyEnabled:$('cm-notify').checked});
  await window.api.reschedNotifs();
  $('cal-modal').classList.add('hidden');
  if(calModalCb) calModalCb();
  if(curSection==='dashboard')refreshDashboard();
}

function buildCalItem(task, onRefresh) {
  const el=document.createElement('div'); el.className=`ct-item${task.done?' done':''}`;
  el.innerHTML=`<div class="ct-chk">${task.done?'✓':''}</div>${task.subject?`<span class="ct-sub">${esc(task.subject)}</span>`:''}<span class="ct-title">${esc(task.title)}</span><button class="ct-del">🗑</button>`;
  el.querySelector('.ct-chk').addEventListener('click',async()=>{ await window.api.toggleCal(task.id); task.done=!task.done; el.classList.toggle('done',task.done); el.querySelector('.ct-chk').textContent=task.done?'✓':''; if(curSection==='dashboard')refreshDashboard(); });
  el.querySelector('.ct-del').addEventListener('click',async()=>{ await window.api.deleteCal(task.id); el.remove(); if(onRefresh)onRefresh(); });
  return el;
}

// ── Settings ──────────────────────────────────────────────────────────────────
function bindSettings() {
  $('clear-data-btn').addEventListener('click',()=>$('confirm-modal').classList.remove('hidden'));
  $('confirm-no')    .addEventListener('click',()=>$('confirm-modal').classList.add('hidden'));
  $('confirm-yes')   .addEventListener('click',async()=>{
    await window.api.clearData();
    allTasks=[]; renderTasks(); await refreshDashboard();
    $('confirm-modal').classList.add('hidden');
    loadSettings();
    renderCurrentView();
  });
}
async function loadSettings() {
  const st=await window.api.getStats();
  $('total-stats-row').innerHTML=`<div class="sr-info"><span class="sr-name">آمار کلی امروز</span><span class="sr-desc">📖 ${st.studyMinutes} دقیقه مطالعه &nbsp;|&nbsp; 🎯 ${st.sessionsCount} نشست &nbsp;|&nbsp; ✅ ${st.tasksCompleted} وظیفه انجام‌شده</span></div>`;
}

// ── Modals binding ────────────────────────────────────────────────────────────
function bindModals() {
  $('sess-modal-ok')  .addEventListener('click',()=>$('sess-modal').classList.add('hidden'));
  $('day-modal-close').addEventListener('click',()=>$('day-modal').classList.add('hidden'));
  $('day-modal-add')  .addEventListener('click',()=>{ $('day-modal').classList.add('hidden'); openCalModal(dayModalDate,'anytime',()=>renderCurrentView()); });
  $('cal-modal-close').addEventListener('click',()=>$('cal-modal').classList.add('hidden'));
  $('cm-cancel')      .addEventListener('click',()=>$('cal-modal').classList.add('hidden'));
  $('cm-save')        .addEventListener('click',saveCalTask);
  $('cm-title')       .addEventListener('keydown',e=>{if(e.key==='Enter')saveCalTask();});
  ['sess-modal','day-modal','cal-modal','confirm-modal'].forEach(id=>{
    $(id).addEventListener('click',e=>{if(e.target.id===id)$(id).classList.add('hidden');});
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') ['sess-modal','day-modal','cal-modal','confirm-modal'].forEach(id=>$(id).classList.add('hidden'));
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function tog(id,hide) { $(id).classList.toggle('hidden',hide); }
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(n) { return String(n).padStart(2,'0'); }
function minsec(s) { return `${Math.floor(s/60)} دقیقه و ${s%60} ثانیه`; }
function todayISO() { return new Date().toISOString().slice(0,10); }
function dateStr(d) { return d.toISOString().slice(0,10); }
function addDays(iso,n) { const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+n); return dateStr(d); }
function addDaysD(date,n) { const d=new Date(date); d.setDate(d.getDate()+n); return d; }
function addMonth(ym,n) { const [y,m]=ym.split('-').map(Number); const d=new Date(y,m-1+n,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function jsPDay(jsDay) { return (jsDay+1)%7; }
function weekStartOf(date) { const d=new Date(date); d.setDate(d.getDate()-jsPDay(d.getDay())); d.setHours(0,0,0,0); return d; }
function fa(date,style) { return date.toLocaleDateString('fa-IR',style==='short'?{month:'short',day:'numeric'}:{weekday:'long',year:'numeric',month:'long',day:'numeric'}); }
function pcls(p) { return p==='high'?'ph':p==='low'?'pl':'pm'; }
function plbl(p)  { return p==='high'?'🔴 مهم':p==='low'?'🟢 عادی':'🟡 متوسط'; }
