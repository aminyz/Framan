'use strict';
const CIRC = 2 * Math.PI * 96;
const PERIODS = [
  { id:'morning',   name:'صبح',         icon:'🌅' },
  { id:'afternoon', name:'ظهر',         icon:'☀️' },
  { id:'evening',   name:'شب',          icon:'🌙' },
  { id:'anytime',   name:'انعطاف‌پذیر', icon:'📋' },
];
const NOTE_COLORS = { yellow:'#92400e', blue:'#1e3a8a', green:'#14532d', purple:'#4c1d95' };

let allTasks   = [];
let taskFilter = 'all';
let curSection = 'dashboard';
const cal = { view:'daily', dailyDate:todayISO(), weekStart:weekStartOf(new Date()), monthYM: initJalaliYM() };
function initJalaliYM() {
  const j = Jalali.toJalaali(new Date());
  return `${j.jy}-${String(j.jm).padStart(2,'0')}`;
}
let calModalCtx = { date:'', period:'anytime' };
let calModalCb  = null;
let dayModalDate = '';
let anDays = 7;
let activeNoteId = null;
let allNotes = [];
let activeFeedId = null;
let breakMode = false;

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
  bindNav(); bindTasks(); bindFocus(); bindCalendar(); bindAnalytics();
  bindNotes(); bindNews(); bindModals(); bindSettings();

  allTasks = await window.api.getTasks();
  await refreshDashboard();
  await refreshGamifBar();
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
  if(sec==='dashboard') { refreshDashboard(); refreshGamifBar(); }
  if(sec==='tasks')     renderTasks();
  if(sec==='focus')     populateFocusSel();
  if(sec==='calendar')  initCalendar();
  if(sec==='analytics') renderAnalytics();
  if(sec==='notes')     loadNotes();
  if(sec==='news')      loadFeeds();
  if(sec==='settings')  loadSettings();
}

// ── Greeting / Date (با تقویم شمسی دقیق Jalali.js) ────────────────────────────
function setGreeting() {
  const h=new Date().getHours();
  $('greeting').textContent=(h<12?'صبح بخیر':h<17?'ظهر بخیر':'شب بخیر')+' — بهترین لحظه برای شروع همین الانه 💪';
}
function setSidebarDate() {
  $('sidebar-date').textContent = Jalali.formatJalali(new Date(), 'full');
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

async function refreshGamifBar() {
  const g = await window.api.getGamif();
  const goal = await window.api.getGoal();
  const weekMin = await window.api.getWeeklyMin();

  $('gf-level').querySelector('.gf-badge').textContent = `Lv.${g.level}`;
  $('gf-level-name').textContent = g.levelName;
  $('gf-streak').textContent = g.currentStreak;
  $('sb-streak-val').textContent = g.currentStreak;

  const LEVELS=[0,200,500,1000,2000,5000,99999];
  const curMin = LEVELS[g.level-1] ?? 0;
  const nextMin = LEVELS[g.level] ?? (curMin+1000);
  const pct = Math.min(100, Math.round(((g.xp-curMin)/(nextMin-curMin))*100));
  $('gf-xp-fill').style.width = pct+'%';
  $('gf-xp-text').textContent = `${g.xp} XP`;

  const goalPct = Math.min(100, Math.round((weekMin/goal.weeklyMinutes)*100));
  $('gf-goal-fill').style.width = goalPct+'%';
  $('gf-goal-text').textContent = `هدف هفتگی: ${weekMin}/${goal.weeklyMinutes} دقیقه`;
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
  document.querySelectorAll('.fb[data-f]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.fb[data-f]').forEach(x=>x.classList.remove('active'));
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
    const wasUndone = !task.done;
    const u=await window.api.toggleTask(task.id);
    const i=allTasks.findIndex(x=>x.id===task.id); if(i>=0&&u)allTasks[i]=u;
    if(wasUndone && u && u.done) { await window.api.taskXP(); refreshGamifBar(); checkLevelUp(); }
    renderTasks(); if(curSection==='dashboard'){refreshDashboard();refreshGamifBar();}
  });
  el.querySelector('.ti-del').addEventListener('click',async()=>{
    await window.api.deleteTask(task.id); allTasks=allTasks.filter(x=>x.id!==task.id);
    renderTasks(); populateFocusSel();
  });
  return el;
}

let lastKnownLevel = null;
async function checkLevelUp() {
  const g = await window.api.getGamif();
  if (lastKnownLevel !== null && g.level > lastKnownLevel) {
    $('levelup-text').innerHTML = `تبریک! به سطح <strong>Lv.${g.level} — ${g.levelName}</strong> رسیدی 🎉`;
    $('levelup-modal').classList.remove('hidden');
  }
  lastKnownLevel = g.level;
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
    if(!breakMode){
      tmr.totalSec=parseInt(document.querySelector('.dur.active')?.dataset.min||25)*60;
      tmr.taskId=$('focus-task-sel').value||null;
    }
    tmr.distractions=0; tmr.sessStart=Date.now(); tmr.totalPausedMs=0; tmr.pauseStart=0;
  }
  if(tmr.status==='paused'&&tmr.pauseStart){ tmr.totalPausedMs+=Date.now()-tmr.pauseStart; tmr.pauseStart=0; }
  tmr.status='running'; updateTimerUI();
  tmr.iid=setInterval(()=>{
    const rem=tmrRemaining(); renderFace(rem);
    if(!breakMode){
      const studySec=Math.floor(tmrStudyMs()/1000);
      $('t-study').textContent=`📖 مطالعه: ${fmt(Math.floor(studySec/60))}:${fmt(studySec%60)}`;
    }
    if(rem<=0){clearInterval(tmr.iid); breakMode? finishBreak() : finishSession(true);}
  },500);
}
function tmrPause() {
  if(tmr.status!=='running')return;
  clearInterval(tmr.iid); tmr.pauseStart=Date.now(); tmr.status='paused'; updateTimerUI();
}
function tmrStop() {
  if(tmr.status==='idle')return;
  clearInterval(tmr.iid);
  if(breakMode){ breakMode=false; resetTimerVisual(); }
  else finishSession(false);
}
async function finishSession(completed) {
  const studySec=Math.floor(tmrStudyMs()/1000);
  const wallSec =Math.floor((Date.now()-tmr.sessStart)/1000);
  if(studySec>=5){
    await window.api.addSession({taskId:tmr.taskId,durationSeconds:wallSec,studySeconds:studySec,distractions:tmr.distractions,completed});
    await checkLevelUp();
  }
  if(completed){
    window.api.notify({title:'✅ نشست تمرکز تموم شد! — MindDock',body:`مطالعه: ${Math.floor(studySec/60)} دقیقه | حواس‌پرتی: ${tmr.distractions} بار`});
    $('sess-emoji').textContent='🎉';
    $('sess-modal-h').textContent='نشست تموم شد!';
    $('sess-modal-body').innerHTML=`<p>⏱ کل جلسه: <strong>${minsec(wallSec)}</strong></p><p>📖 زمان واقعی مطالعه: <strong>${minsec(studySec)}</strong></p><p>⚡ حواس‌پرتی: <strong>${tmr.distractions} بار</strong></p>`;
    $('sess-break-btn').classList.remove('hidden');
    $('sess-modal').classList.remove('hidden');
  }
  Object.assign(tmr,{status:'idle',distractions:0,taskId:null,sessStart:0,totalPausedMs:0,pauseStart:0});
  resetTimerVisual();
  if(curSection==='dashboard'){refreshDashboard();refreshGamifBar();}
}
function startBreak(minutes) {
  breakMode = true;
  tmr.totalSec = minutes*60;
  tmr.distractions = 0; tmr.sessStart = Date.now(); tmr.totalPausedMs = 0; tmr.pauseStart = 0;
  tmr.status = 'running';
  $('t-ring').classList.add('break-mode');
  $('focus-cfg').classList.add('hidden');
  updateTimerUI();
  renderFace(tmr.totalSec);
  tmr.iid = setInterval(()=>{
    const rem = tmrRemaining(); renderFace(rem);
    if(rem<=0){ clearInterval(tmr.iid); finishBreak(); }
  },500);
}
function finishBreak() {
  window.api.notify({title:'⏰ وقت استراحت تموم شد!',body:'آماده‌ای یه نشست تمرکز دیگه شروع کنی؟'});
  breakMode=false;
  Object.assign(tmr,{status:'idle',distractions:0,taskId:null,sessStart:0,totalPausedMs:0,pauseStart:0});
  resetTimerVisual();
}
function resetTimerVisual() {
  tmr.totalSec = parseInt(document.querySelector('.dur.active')?.dataset.min||25)*60;
  $('t-ring').classList.remove('break-mode');
  renderFace(tmr.totalSec); updateTimerUI();
  $('t-distr').textContent=''; $('t-study').textContent='';
}
function renderFace(rem) {
  $('t-time').textContent=`${fmt(Math.floor(rem/60))}:${fmt(rem%60)}`;
  const ring=$('t-ring');
  ring.style.strokeDashoffset=CIRC*(1-rem/tmr.totalSec);
  if(!breakMode) ring.style.stroke=(rem<=300&&tmr.status!=='idle')?'#ef4444':'';
}
function updateTimerUI() {
  const {status:s}=tmr;
  tog('btn-start',!(s==='idle'||s==='paused')); tog('btn-pause',s!=='running');
  tog('btn-stop',!(s==='running'||s==='paused')); tog('btn-distr',s!=='running'||breakMode);
  tog('focus-cfg',s!=='idle'||breakMode);
  $('btn-start').textContent=s==='paused'?'▶ ادامه':(breakMode?'▶ شروع استراحت':'▶ شروع');
  $('t-phase').textContent=breakMode?(s==='running'?'☕ در حال استراحت':'آماده استراحت'):(s==='running'?'🔥 در حال تمرکز':s==='paused'?'⏸ مکث':'آماده');
}

// ── Calendar (با Jalali دقیق) ───────────────────────────────────────────────
function bindCalendar() {
  document.querySelectorAll('.ct').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  $('d-prev').addEventListener('click',()=>{cal.dailyDate=addDays(cal.dailyDate,-1);renderDaily();});
  $('d-next').addEventListener('click',()=>{cal.dailyDate=addDays(cal.dailyDate,+1);renderDaily();});
  $('w-prev').addEventListener('click',()=>{cal.weekStart=addDaysD(cal.weekStart,-7);renderWeekly();});
  $('w-next').addEventListener('click',()=>{cal.weekStart=addDaysD(cal.weekStart,+7);renderWeekly();});
  $('m-prev').addEventListener('click',()=>{cal.monthYM=addMonth(cal.monthYM,-1);renderMonthly();});
  $('m-next').addEventListener('click',()=>{cal.monthYM=addMonth(cal.monthYM,+1);renderMonthly();});
}
async function initCalendar() { switchView(cal.view); }
function switchView(view) {
  cal.view=view;
  document.querySelectorAll('.ct').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  ['daily','weekly','monthly'].forEach(v=>{ const e=$('view-'+v); v===view?e.classList.remove('hidden'):e.classList.add('hidden'); });
  renderCurrentView();
}
function renderCurrentView() {
  if(cal.view==='daily')  renderDaily();
  if(cal.view==='weekly') renderWeekly();
  if(cal.view==='monthly')renderMonthly();
}

async function renderDaily() {
  const date=cal.dailyDate;
  $('d-lbl').textContent = Jalali.formatJalali(new Date(date+'T12:00:00'), 'full');
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
  $('w-lbl').textContent=`${Jalali.formatJalali(ws,'short')} — ${Jalali.formatJalali(we,'short')}`;
  const tasks=await window.api.getCalRange(dateStr(ws),dateStr(we));
  const body=$('weekly-body'); body.innerHTML='';
  const today=todayISO();
  const grid=document.createElement('div'); grid.className='week-grid';
  for(let i=0;i<7;i++){
    const d=addDaysD(ws,i), ds=dateStr(d), isT=ds===today;
    const wd = Jalali.jWeekday(d);
    const col=document.createElement('div'); col.className=`wday-col${isT?' today':''}`;
    col.innerHTML=`<div class="wday-hdr"><span class="wd-name">${Jalali.WEEKDAYS_FULL[wd]}</span><span class="wd-date">${Jalali.formatJalali(d,'short')}</span></div><div class="wday-tasks" id="wt-${ds}"></div>`;
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
  const [jy,jm]=cal.monthYM.split('-').map(Number);
  $('m-lbl').textContent = `${Jalali.MONTHS[jm-1]} ${Jalali.toPersianDigits(jy)}`;

  const monthLen = Jalali.jalaaliMonthLength(jy,jm);
  // محاسبه‌ی تاریخ میلادی متناظر هر روز این ماه جلالی
  const dayDates = [];
  for(let d=1; d<=monthLen; d++){
    const g = Jalali.toGregorian(jy,jm,d);
    dayDates.push(Jalali.gregorianToISO(g.gy,g.gm,g.gd));
  }
  const firstGreg = Jalali.toGregorian(jy,jm,1);
  const firstDateObj = new Date(firstGreg.gy, firstGreg.gm-1, firstGreg.gd);
  const offset = Jalali.jWeekday(firstDateObj);

  const stats = await window.api.getDateRangeStats(dayDates);
  const statsMap = {}; stats.forEach(s=>statsMap[s.date]=s);

  const body=$('monthly-body'); body.innerHTML='';
  const today=todayISO();
  const hdr=document.createElement('div'); hdr.className='month-dow-row';
  Jalali.WEEKDAYS_SHORT.forEach(d=>{const e=document.createElement('div');e.className='month-dow';e.textContent=d;hdr.appendChild(e);});
  body.appendChild(hdr);

  const grid=document.createElement('div'); grid.className='month-grid';
  for(let i=0;i<offset;i++){const e=document.createElement('div');e.className='mc empty';grid.appendChild(e);}

  dayDates.forEach((date,idx)=>{
    const day=idx+1;
    const {studyMinutes=0,tasksTotal=0,tasksDone=0} = statsMap[date]||{};
    const cell=document.createElement('div');
    const isT=date===today, isPast=date<today;
    let cls='mc'; if(isT)cls+=' today';
    if(tasksTotal>0){if(tasksDone===tasksTotal)cls+=' all-done';else if(tasksDone>0)cls+=' partial';else if(isPast)cls+=' missed';}
    cell.className=cls; cell.dataset.date=date;
    cell.innerHTML=`<span class="mc-day">${Jalali.toPersianDigits(day)}</span>${studyMinutes>0?`<span class="mc-time">${Jalali.toPersianDigits(studyMinutes)}م</span>`:''}${tasksTotal>0?`<div class="mc-bar"><span class="done">${Jalali.toPersianDigits(tasksDone)}</span>/<span class="tot">${Jalali.toPersianDigits(tasksTotal)}</span></div>`:''}`;
    cell.addEventListener('click',()=>openDayReport(date));
    grid.appendChild(cell);
  });
  body.appendChild(grid);

  const leg=document.createElement('div'); leg.className='month-legend';
  leg.innerHTML=`<span><span class="ld all-done"></span>همه انجام شد</span><span><span class="ld partial"></span>بخشی انجام شد</span><span><span class="ld missed"></span>انجام نشد</span><span style="color:var(--acc2);font-size:11px">عدد = دقیقه مطالعه (م)</span>`;
  body.appendChild(leg);
}

async function openDayReport(date) {
  dayModalDate=date;
  const r=await window.api.getDayReport(date);
  $('day-modal-title').textContent = Jalali.formatJalali(new Date(date+'T12:00:00'), 'full');
  let html=`<div class="report-stats">
    <div class="rs-item"><span class="rs-val">${r.studyMinutes}</span><span class="rs-lbl">دقیقه مطالعه</span></div>
    <div class="rs-item"><span class="rs-val">${r.totalMinutes}</span><span class="rs-lbl">کل جلسات</span></div>
    <div class="rs-item"><span class="rs-val">${r.sessionsCount}</span><span class="rs-lbl">نشست تمرکز</span></div>
    <div class="rs-item"><span class="rs-val">${r.distractionsTotal}</span><span class="rs-lbl">حواس‌پرتی</span></div>
  </div>`;
  if(!r.calTasks.length){ html+='<p class="report-empty">📋 هیچ تسکی برای این روز ثبت نشده</p>'; }
  else {
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

function openCalModal(date, period, cb) {
  calModalCtx={date,period}; calModalCb=cb||null;
  const p=PERIODS.find(x=>x.id===period);
  const dl = Jalali.formatJalali(new Date(date+'T12:00:00'), 'short');
  $('cal-modal-title').textContent=`افزودن تسک — ${dl} / ${p?.name||''}`;
  const sel=$('cm-task-ref');
  sel.innerHTML='<option value="">— از وظایف موجود انتخاب کن (اختیاری) —</option>';
  allTasks.filter(t=>!t.done).forEach(t=>{
    const o=document.createElement('option'); o.value=t.title;
    o.textContent=t.title.length>50?t.title.slice(0,50)+'…':t.title; sel.appendChild(o);
  });
  $('cm-title').value=''; $('cm-prio').value='medium'; $('cm-notify').checked=true;
  $('cm-title-err').classList.add('hidden');
  $('cal-modal').classList.remove('hidden');
  setTimeout(()=>$('cm-title').focus(),80);
}
async function saveCalTask() {
  const taskRef=$('cm-task-ref').value;
  if(taskRef && !$('cm-title').value.trim()) $('cm-title').value=taskRef;
  const title=$('cm-title').value.trim();
  if(!title){$('cm-title-err').classList.remove('hidden');$('cm-title').focus();return;}
  $('cm-title-err').classList.add('hidden');
  await window.api.addCalTask({title,date:calModalCtx.date,period:calModalCtx.period,priority:$('cm-prio').value,subject:taskRef||'',notifyEnabled:$('cm-notify').checked});
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

// ── Analytics ────────────────────────────────────────────────────────────────
function bindAnalytics() {
  document.querySelectorAll('.an-range-row .fb').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.an-range-row .fb').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); anDays=parseInt(b.dataset.days); renderAnalytics();
  }));
}
async function renderAnalytics() {
  const data = await window.api.getAnalytics(anDays);
  const total = data.reduce((a,d)=>a+d.studyMinutes,0);
  const sessions = data.reduce((a,d)=>a+d.sessions,0);
  const best = Math.max(0,...data.map(d=>d.studyMinutes));
  const avg = Math.round(total/data.length) || 0;
  $('an-total-lbl').textContent = `مجموع: ${total} دقیقه`;
  $('an-best').textContent = best;
  $('an-avg').textContent = avg;
  $('an-total').textContent = total;
  $('an-sessions').textContent = sessions;
  renderChart(data);
}
function renderChart(data) {
  const wrap=$('chart-main'); wrap.innerHTML='';
  const max=Math.max(1,...data.map(d=>d.studyMinutes));
  const w=800, h=180, padB=28, padT=10, barGap=8;
  const barW = (w - barGap*(data.length-1)) / data.length;
  let svg=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`;
  data.forEach((d,i)=>{
    const bh = d.studyMinutes>0 ? Math.max(3,((h-padB-padT)*d.studyMinutes/max)) : 0;
    const x = i*(barW+barGap);
    const y = h-padB-bh;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="url(#g1)"><title>${d.label}: ${d.studyMinutes} دقیقه</title></rect>`;
    svg += `<text x="${x+barW/2}" y="${h-8}" font-size="10" fill="#8892a4" text-anchor="middle">${d.label}</text>`;
  });
  svg += `<defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient></defs>`;
  svg += '</svg>';
  wrap.innerHTML = svg;
}

// ── Notes ────────────────────────────────────────────────────────────────────
function bindNotes() {
  $('new-note-btn').addEventListener('click', async ()=>{
    const n = await window.api.addNote({title:'یادداشت جدید',content:'',color:'yellow'});
    allNotes.unshift(n); renderNotesList(); selectNote(n.id);
  });
  $('note-save-btn').addEventListener('click', saveActiveNote);
  $('note-delete-btn').addEventListener('click', async ()=>{
    if(!activeNoteId) return;
    await window.api.deleteNote(activeNoteId);
    allNotes = allNotes.filter(n=>n.id!==activeNoteId);
    activeNoteId=null; renderNotesList(); showEmptyEditor();
  });
  document.querySelectorAll('.nc-btn').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.nc-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  }));
}
async function loadNotes() { allNotes = await window.api.getNotes(); renderNotesList(); }
function renderNotesList() {
  const list=$('notes-list'); list.innerHTML='';
  if(!allNotes.length){ list.innerHTML='<p class="p-empty">یادداشتی نداری، یکی بساز!</p>'; return; }
  allNotes.forEach(n=>{
    const el=document.createElement('div'); el.className=`note-card${n.id===activeNoteId?' active':''}`;
    el.innerHTML=`<div class="note-color-bar" style="background:${NOTE_COLORS[n.color]||NOTE_COLORS.yellow}"></div><div class="note-card-title">${esc(n.title||'بدون عنوان')}</div><div class="note-card-preview">${esc(n.content||'')}</div><div class="note-card-date">${new Date(n.updatedAt).toLocaleDateString('fa-IR')}</div>`;
    el.addEventListener('click',()=>selectNote(n.id));
    list.appendChild(el);
  });
}
function selectNote(id) {
  activeNoteId=id;
  const n=allNotes.find(x=>x.id===id); if(!n) return;
  $('note-edit-empty').classList.add('hidden');
  $('note-editor').classList.remove('hidden');
  $('note-title-inp').value=n.title;
  $('note-textarea').value=n.content;
  document.querySelectorAll('.nc-btn').forEach(b=>b.classList.toggle('active',b.dataset.color===n.color));
  $('note-saved-msg').textContent='';
  renderNotesList();
}
function showEmptyEditor() {
  $('note-editor').classList.add('hidden');
  $('note-edit-empty').classList.remove('hidden');
}
async function saveActiveNote() {
  if(!activeNoteId) return;
  const color = document.querySelector('.nc-btn.active')?.dataset.color || 'yellow';
  const updated = await window.api.updateNote({id:activeNoteId,title:$('note-title-inp').value.trim()||'بدون عنوان',content:$('note-textarea').value,color});
  const i=allNotes.findIndex(n=>n.id===activeNoteId); if(i>=0) allNotes[i]=updated;
  renderNotesList();
  $('note-saved-msg').textContent='✓ ذخیره شد';
  setTimeout(()=>{ if($('note-saved-msg')) $('note-saved-msg').textContent=''; },2000);
}

// ── News (RSS) ───────────────────────────────────────────────────────────────
function bindNews() {
  $('add-feed-btn').addEventListener('click', async ()=>{
    const name=$('feed-name-inp').value.trim(), url=$('feed-url-inp').value.trim();
    if(!name||!url){ return; }
    const f = await window.api.addFeed({name,url});
    $('feed-name-inp').value=''; $('feed-url-inp').value='';
    await loadFeeds();
    selectFeed(f.id, f.url);
  });
}
async function loadFeeds() {
  const feeds = await window.api.getFeeds();
  const list=$('feeds-list'); list.innerHTML='';
  if(!feeds.length){ list.innerHTML='<p class="p-empty">هنوز خوراکی اضافه نکردی</p>'; return; }
  feeds.forEach(f=>{
    const el=document.createElement('div'); el.className=`feed-item${f.id===activeFeedId?' active':''}`;
    el.innerHTML=`<span class="feed-name">${esc(f.name)}</span><button class="feed-refresh" title="بروزرسانی">🔄</button><button class="feed-del" title="حذف">🗑</button>`;
    el.querySelector('.feed-name').addEventListener('click',()=>selectFeed(f.id,f.url));
    el.addEventListener('click',e=>{ if(e.target.tagName!=='BUTTON') selectFeed(f.id,f.url); });
    el.querySelector('.feed-refresh').addEventListener('click',async e=>{ e.stopPropagation(); await loadArticles(f.id,f.url,true); });
    el.querySelector('.feed-del').addEventListener('click',async e=>{
      e.stopPropagation(); await window.api.deleteFeed(f.id);
      if(activeFeedId===f.id){ activeFeedId=null; $('news-articles').innerHTML='<div class="news-empty-state"><div class="empty-icon">📰</div><p>یه خوراک از سمت راست انتخاب کن</p></div>'; }
      loadFeeds();
    });
    list.appendChild(el);
  });
}
async function selectFeed(id, url) {
  activeFeedId = id;
  loadFeeds();
  await loadArticles(id, url, false);
}
async function loadArticles(id, url, forceRefresh) {
  $('news-articles').innerHTML = '<div class="news-loading">⏳ در حال دریافت اخبار…</div>';
  const res = await window.api.fetchFeed({id, url});
  if(!res.ok) {
    $('news-articles').innerHTML = `<div class="news-error">⚠️ ${esc(res.error||'خطا در دریافت اخبار')}</div>`;
    return;
  }
  const wrap = $('news-articles'); wrap.innerHTML='';
  if(!res.articles.length){ wrap.innerHTML='<div class="news-empty-state"><p>مقاله‌ای یافت نشد</p></div>'; return; }
  res.articles.forEach(a=>{
    const card=document.createElement('div'); card.className='article-card';
    card.innerHTML=`<div class="article-title">${esc(a.title)}</div>${a.desc?`<div class="article-desc">${esc(a.desc)}</div>`:''}<div class="article-date">${esc(a.date||'')}</div>`;
    card.addEventListener('click',()=>{ if(a.link) window.api.openURL(a.link); });
    wrap.appendChild(card);
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────
function bindSettings() {
  $('clear-data-btn').addEventListener('click',()=>$('confirm-modal').classList.remove('hidden'));
  $('confirm-no')    .addEventListener('click',()=>$('confirm-modal').classList.add('hidden'));
  $('confirm-yes')   .addEventListener('click',async()=>{
    await window.api.clearData();
    allTasks=[]; allNotes=[]; activeNoteId=null;
    renderTasks(); await refreshDashboard(); await refreshGamifBar();
    $('confirm-modal').classList.add('hidden');
    loadSettings(); renderCurrentView();
  });
  $('test-notif-btn').addEventListener('click', async ()=>{ await window.api.testNotify(); });
  $('goal-save-btn').addEventListener('click', async ()=>{
    const v = parseInt($('goal-inp').value)||300;
    await window.api.setGoal(v);
    refreshGamifBar();
  });
}
async function loadSettings() {
  const st = await window.api.getStats();
  const goal = await window.api.getGoal();
  $('goal-inp').value = goal.weeklyMinutes;
  $('total-stats-row').innerHTML = `<div class="sr-info"><span class="sr-name">آمار امروز</span><span class="sr-desc">📖 ${st.studyMinutes} دقیقه مطالعه &nbsp;|&nbsp; 🎯 ${st.sessionsCount} نشست &nbsp;|&nbsp; ✅ ${st.tasksCompleted} وظیفه انجام‌شده</span></div>`;
}

// ── Modals ────────────────────────────────────────────────────────────────────
function bindModals() {
  $('sess-modal-ok').addEventListener('click',()=>{$('sess-modal').classList.add('hidden');$('sess-break-btn').classList.remove('hidden');});
  $('sess-break-btn').addEventListener('click',()=>{ $('sess-modal').classList.add('hidden'); navTo('focus'); startBreak(5); });
  $('day-modal-close').addEventListener('click',()=>$('day-modal').classList.add('hidden'));
  $('day-modal-add')  .addEventListener('click',()=>{ $('day-modal').classList.add('hidden'); openCalModal(dayModalDate,'anytime',()=>renderCurrentView()); });
  $('cal-modal-close').addEventListener('click',()=>$('cal-modal').classList.add('hidden'));
  $('cm-cancel')      .addEventListener('click',()=>$('cal-modal').classList.add('hidden'));
  $('cm-save')        .addEventListener('click',saveCalTask);
  $('cm-title')       .addEventListener('keydown',e=>{if(e.key==='Enter')saveCalTask();});
  $('cm-task-ref').addEventListener('change',e=>{ if(e.target.value) $('cm-title').value=e.target.value; });
  $('levelup-ok').addEventListener('click',()=>$('levelup-modal').classList.add('hidden'));
  ['sess-modal','day-modal','cal-modal','confirm-modal','levelup-modal'].forEach(id=>{
    $(id).addEventListener('click',e=>{if(e.target.id===id)$(id).classList.add('hidden');});
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') ['sess-modal','day-modal','cal-modal','confirm-modal','levelup-modal'].forEach(id=>$(id).classList.add('hidden'));
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function tog(id,hide) { $(id).classList.toggle('hidden',hide); }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(n) { return String(n).padStart(2,'0'); }
function minsec(s) { return `${Math.floor(s/60)} دقیقه و ${s%60} ثانیه`; }
function todayISO() { return new Date().toISOString().slice(0,10); }
function dateStr(d) { return d.toISOString().slice(0,10); }
function addDays(iso,n) { const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+n); return dateStr(d); }
function addDaysD(date,n) { const d=new Date(date); d.setDate(d.getDate()+n); return d; }
function addMonth(jym,n) {
  let [jy,jm]=jym.split('-').map(Number);
  jm+=n;
  while(jm>12){jm-=12;jy++;}
  while(jm<1){jm+=12;jy--;}
  return `${jy}-${String(jm).padStart(2,'0')}`;
}
function weekStartOf(date) { const d=new Date(date); d.setDate(d.getDate()-Jalali.jWeekday(d)); d.setHours(0,0,0,0); return d; }
function pcls(p) { return p==='high'?'ph':p==='low'?'pl':'pm'; }
function plbl(p)  { return p==='high'?'🔴 مهم':p==='low'?'🟢 عادی':'🟡 متوسط'; }
