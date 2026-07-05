'use strict';
const { app } = require('electron');
const path = require('path');
const fs   = require('fs');

let dataDir = '';
function init() {
  dataDir = app.getPath('userData');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}
const fp = n => path.join(dataDir, n);
function read(n, d) {
  try { const f=fp(n); return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):d; }
  catch { return d; }
}
function wr(n, d) {
  try { fs.writeFileSync(fp(n), JSON.stringify(d,null,2),'utf8'); }
  catch(e) { console.error('[Storage]',e); }
}

// ── Tasks (با deadline) ───────────────────────────────────────────────────────
function getTasks()       { return read('tasks.json',[]); }
function addTask({title, priority, deadline}) {
  const tasks = getTasks();
  const t = {
    id: `t${Date.now()}`, title: title.trim(), priority: priority||'medium',
    deadline: deadline||null,
    done: false, createdAt: new Date().toISOString(), completedAt: null
  };
  tasks.push(t); wr('tasks.json', tasks); return t;
}
function toggleTask(id) {
  const tasks=getTasks(), t=tasks.find(x=>x.id===id); if(!t) return null;
  t.done=!t.done; t.completedAt=t.done?new Date().toISOString():null;
  wr('tasks.json',tasks); return t;
}
function deleteTask(id) { wr('tasks.json',getTasks().filter(t=>t.id!==id)); return true; }
function updateTaskDeadline(id, deadline) {
  const tasks=getTasks(), t=tasks.find(x=>x.id===id); if(!t) return null;
  t.deadline=deadline||null; wr('tasks.json',tasks); return t;
}

// ── Calendar Tasks ────────────────────────────────────────────────────────────
function getCalTasks()    { return read('cal-tasks.json',[]); }
function addCalTask({title,date,period,priority,subject,notifyEnabled}) {
  const arr=getCalTasks();
  const t={id:`c${Date.now()}`,title:title.trim(),date,period:period||'anytime',priority:priority||'medium',subject:subject||'',done:false,completedAt:null,notifyEnabled:notifyEnabled!==false,createdAt:new Date().toISOString()};
  arr.push(t); wr('cal-tasks.json',arr); return t;
}
function toggleCalTask(id) {
  const arr=getCalTasks(), t=arr.find(x=>x.id===id); if(!t) return null;
  t.done=!t.done; t.completedAt=t.done?new Date().toISOString():null;
  wr('cal-tasks.json',arr); return t;
}
function deleteCalTask(id) { wr('cal-tasks.json',getCalTasks().filter(t=>t.id!==id)); return true; }
function getCalByDate(date)  { return getCalTasks().filter(t=>t.date===date); }
function getCalByRange(s,e)  { return getCalTasks().filter(t=>t.date>=s&&t.date<=e); }

// ── Sessions ──────────────────────────────────────────────────────────────────
function getSessions() { return read('sessions.json',[]); }
function addSession({taskId,durationSeconds,studySeconds,distractions,completed}) {
  const arr=getSessions();
  const s={id:`s${Date.now()}`,taskId:taskId||null,durationSeconds:durationSeconds||0,
            studySeconds:studySeconds!=null?studySeconds:(durationSeconds||0),
            distractions:distractions||0,completed:!!completed,
            date:localDateISO(),hour:new Date().getHours(),createdAt:new Date().toISOString()};
  arr.push(s); wr('sessions.json',arr); return s;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function getTodayStats() {
  const today=localDateISO();
  const tasks=getTasks(), sess=getSessions().filter(s=>s.date===today);
  return {
    tasksCompleted: tasks.filter(t=>t.done&&t.completedAt?.startsWith(today)).length,
    studyMinutes:   Math.floor(sess.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),
    sessionsCount:  sess.length,
    distractionsCount: sess.reduce((a,s)=>a+(s.distractions||0),0)
  };
}

function getMonthStats(yearMonth) {
  const [y,m]=yearMonth.split('-').map(Number);
  const days=new Date(y,m,0).getDate(), sess=getSessions(), cal=getCalTasks();
  return Array.from({length:days},(_,i)=>{
    const day=i+1, date=`${yearMonth}-${String(day).padStart(2,'0')}`;
    const ds=sess.filter(s=>s.date===date), dt=cal.filter(t=>t.date===date);
    return {date,day,
      studyMinutes:Math.floor(ds.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),
      sessionsCount:ds.length,tasksTotal:dt.length,tasksDone:dt.filter(t=>t.done).length};
  });
}

function getDateRangeStats(dates) {
  const sess=getSessions(), cal=getCalTasks();
  return dates.map(date=>{
    const ds=sess.filter(s=>s.date===date), dt=cal.filter(t=>t.date===date);
    return {date,
      studyMinutes:Math.floor(ds.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),
      sessionsCount:ds.length,tasksTotal:dt.length,tasksDone:dt.filter(t=>t.done).length};
  });
}

function getDayReport(date) {
  const sess=getSessions().filter(s=>s.date===date), cal=getCalByDate(date);
  return {
    studyMinutes:Math.floor(sess.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),
    totalMinutes:Math.floor(sess.reduce((a,s)=>a+(s.durationSeconds||0),0)/60),
    sessionsCount:sess.length,
    distractionsTotal:sess.reduce((a,s)=>a+(s.distractions||0),0),
    calTasks:cal, sessions:sess
  };
}

function getAnalyticsData(days=7) {
  const sess=getSessions(), result=[];
  for(let i=days-1;i>=0;i--) {
    const date=localDateMinus(i);
    const ds=sess.filter(s=>s.date===date);
    result.push({date,
      studyMinutes:Math.floor(ds.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),
      sessions:ds.length});
  }
  return result;
}

function getWeeklyStudyMinutes() {
  // هفته شمسی: شنبه تا جمعه
  const today=new Date(), todayISO=localDateISO();
  // پیدا کردن شنبه این هفته
  const jDay=(today.getDay()+1)%7; // 0=شنبه
  const weekStart=new Date(today); weekStart.setDate(today.getDate()-jDay);
  const wsISO=localDateFromDate(weekStart);
  return Math.floor(getSessions().filter(s=>s.date>=wsISO&&s.date<=todayISO)
    .reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60);
}

// ── گزارش هفتگی ───────────────────────────────────────────────────────────────
function getWeeklyReport(startISO, endISO) {
  const sess    = getSessions().filter(s=>s.date>=startISO&&s.date<=endISO);
  const calTasks= getCalTasks().filter(t=>t.date>=startISO&&t.date<=endISO);
  const stdTasks= getTasks().filter(t=>t.done&&t.completedAt&&t.completedAt.slice(0,10)>=startISO&&t.completedAt.slice(0,10)<=endISO);

  // آمار روزانه
  const byDay={};
  for(let d=new Date(startISO+'T12:00:00'); d.toISOString().slice(0,10)<=endISO; d.setDate(d.getDate()+1)) {
    const iso=localDateFromDate(d);
    const ds=sess.filter(s=>s.date===iso);
    const ct=calTasks.filter(t=>t.date===iso);
    byDay[iso]={
      studyMinutes:Math.floor(ds.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),
      sessions:ds.length,
      distractions:ds.reduce((a,s)=>a+(s.distractions||0),0),
      tasksDone:ct.filter(t=>t.done).length,
      tasksTotal:ct.length
    };
  }

  // آمار درس‌ها (از subject تسک‌های تقویم)
  const subjectMap={};
  calTasks.filter(t=>t.done&&t.subject).forEach(t=>{
    if(!subjectMap[t.subject]) subjectMap[t.subject]={done:0,total:0};
    subjectMap[t.subject].done++;
  });
  calTasks.filter(t=>t.subject).forEach(t=>{
    if(!subjectMap[t.subject]) subjectMap[t.subject]={done:0,total:0};
    subjectMap[t.subject].total++;
  });
  const subjects=Object.entries(subjectMap).map(([name,v])=>({name,...v}))
    .sort((a,b)=>b.done-a.done);

  return {
    totalStudyMinutes:Math.floor(sess.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),
    totalSessions:    sess.length,
    totalDistractions:sess.reduce((a,s)=>a+(s.distractions||0),0),
    calTasksDone:     calTasks.filter(t=>t.done).length,
    calTasksTotal:    calTasks.length,
    stdTasksDone:     stdTasks.length,
    byDay, subjects,
    completedStdTasks: stdTasks.slice(0,20).map(t=>({title:t.title,completedAt:t.completedAt}))
  };
}

// ── Gamification ──────────────────────────────────────────────────────────────
const LEVELS=[{l:1,name:'مبتدی',min:0},{l:2,name:'در حال رشد',min:200},{l:3,name:'متمرکز',min:500},{l:4,name:'حرفه‌ای',min:1000},{l:5,name:'استاد',min:2000},{l:6,name:'افسانه',min:5000}];
function getGamif() { return read('gamif.json',{xp:0,level:1,levelName:'مبتدی',currentStreak:0,longestStreak:0,lastStudyDate:null}); }
function addXP(amount) {
  const g=getGamif(); g.xp+=amount;
  const today=localDateISO();
  if(!g.lastStudyDate){g.currentStreak=1;g.lastStudyDate=today;}
  else {
    const diff=Math.floor((new Date(today+' 00:00')-new Date(g.lastStudyDate+' 00:00'))/(86400000));
    if(diff===1){g.currentStreak++;if(g.currentStreak>g.longestStreak)g.longestStreak=g.currentStreak;g.lastStudyDate=today;}
    else if(diff>1){g.currentStreak=1;g.lastStudyDate=today;}
  }
  const lv=LEVELS.slice().reverse().find(l=>g.xp>=l.min)||LEVELS[0];
  const leveled=lv.l>g.level; g.level=lv.l; g.levelName=lv.name;
  wr('gamif.json',g); return {gamif:g,leveled,newLevel:lv};
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function getNotes()    { return read('notes.json',[]); }
function addNote({title,content,color}) {
  const arr=getNotes(); const now=new Date().toISOString();
  const n={id:`n${Date.now()}`,title:(title||'یادداشت جدید').trim(),content:content||'',color:color||'yellow',createdAt:now,updatedAt:now};
  arr.unshift(n); wr('notes.json',arr); return n;
}
function updateNote(id,{title,content,color}) {
  const arr=getNotes(), n=arr.find(x=>x.id===id); if(!n) return null;
  if(title!==undefined)n.title=title; if(content!==undefined)n.content=content; if(color!==undefined)n.color=color;
  n.updatedAt=new Date().toISOString(); wr('notes.json',arr); return n;
}
function deleteNote(id) { wr('notes.json',getNotes().filter(n=>n.id!==id)); return true; }

// ── News Feeds ────────────────────────────────────────────────────────────────
function getFeeds()   { return read('news-feeds.json',[]); }
function addFeed({name,url}) {
  const arr=getFeeds();
  const f={id:`f${Date.now()}`,name:name.trim(),url:url.trim(),addedAt:new Date().toISOString()};
  arr.push(f); wr('news-feeds.json',arr); return f;
}
function deleteFeed(id) { wr('news-feeds.json',getFeeds().filter(f=>f.id!==id)); return true; }
function getCachedFeed(id) { return read(`feed-${id}.json`,null); }
function setCachedFeed(id,data) { wr(`feed-${id}.json`,data); }

// ── Goal ──────────────────────────────────────────────────────────────────────
function getGoal()    { return read('goal.json',{weeklyMinutes:300}); }
function setGoal(weeklyMinutes) { wr('goal.json',{weeklyMinutes}); return {weeklyMinutes}; }

// ── Cleanup Settings ──────────────────────────────────────────────────────────
function getCleanupSettings() { return read('cleanup.json',{daysToKeep:90,autoCleanup:true}); }
function setCleanupSettings(s){ wr('cleanup.json',s); return s; }

/**
 * پاک‌سازی هوشمند: داده‌های قدیمی‌تر از daysToKeep روز رو حذف می‌کنه
 * - تسک‌های انجام‌شده: حذف
 * - تسک‌های انجام‌نشده (deadline گذشته): نگه‌داری
 * - جلسات تمرکز و تسک‌های تقویم: حذف
 * - یادداشت‌ها: هیچ‌وقت حذف نمیشن
 * برمی‌گردونه آمار حذف
 */
function cleanupOldData(daysToKeep) {
  const cutoff = localDateMinus(daysToKeep);
  let removedSessions=0, removedCalTasks=0, removedTasks=0;

  // جلسات قدیمی
  const sess = getSessions();
  const newSess = sess.filter(s=>s.date>=cutoff);
  removedSessions = sess.length - newSess.length;
  if(removedSessions>0) wr('sessions.json',newSess);

  // تسک‌های تقویم قدیمی
  const cal = getCalTasks();
  const newCal = cal.filter(t=>t.date>=cutoff);
  removedCalTasks = cal.length - newCal.length;
  if(removedCalTasks>0) wr('cal-tasks.json',newCal);

  // تسک‌های انجام‌شده‌ی قدیمی
  const tasks = getTasks();
  const newTasks = tasks.filter(t=>!t.done||!t.completedAt||t.completedAt.slice(0,10)>=cutoff);
  removedTasks = tasks.length - newTasks.length;
  if(removedTasks>0) wr('tasks.json',newTasks);

  // cache فیدهای خبری
  getFeeds().forEach(f=>{
    const cached = getCachedFeed(f.id);
    if(cached&&cached.fetchedAt) {
      const diff=Math.floor((Date.now()-new Date(cached.fetchedAt).getTime())/(86400000));
      if(diff>1) { try{const p=fp(`feed-${f.id}.json`);if(fs.existsSync(p))fs.unlinkSync(p);}catch{} }
    }
  });

  return {removedSessions, removedCalTasks, removedTasks, cutoff};
}

// ── Clear All ─────────────────────────────────────────────────────────────────
function clearAllData() {
  ['tasks.json','cal-tasks.json','sessions.json','gamif.json','notes.json','goal.json'].forEach(f=>{
    try{const p=fp(f);if(fs.existsSync(p))fs.unlinkSync(p);}catch{}
  });
  getFeeds().forEach(f=>{try{const p=fp(`feed-${f.id}.json`);if(fs.existsSync(p))fs.unlinkSync(p);}catch{}});
  return true;
}

// ── Date Helpers (timezone-safe) ──────────────────────────────────────────────
function localDateISO() {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function localDateFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function localDateMinus(n) {
  const d=new Date(); d.setDate(d.getDate()-n);
  return localDateFromDate(d);
}

module.exports = {
  init,
  getTasks,addTask,toggleTask,deleteTask,updateTaskDeadline,
  getCalTasks,addCalTask,toggleCalTask,deleteCalTask,getCalByDate,getCalByRange,
  getSessions,addSession,
  getTodayStats,getMonthStats,getDateRangeStats,getDayReport,getAnalyticsData,getWeeklyStudyMinutes,
  getWeeklyReport,
  getGamif,addXP,
  getNotes,addNote,updateNote,deleteNote,
  getFeeds,addFeed,deleteFeed,getCachedFeed,setCachedFeed,
  getGoal,setGoal,
  getCleanupSettings,setCleanupSettings,cleanupOldData,
  clearAllData,
  localDateISO,
};

// ── Recurring / Batch Cal Tasks ───────────────────────────────────────────────
/**
 * افزودن یک تسک به چند روز پشت سر هم
 * dates: آرایه‌ای از رشته‌های ISO مثل ['2026-06-30', '2026-07-01', ...]
 */
function addRecurringCalTasks({ title, period, priority, subject, notifyEnabled, dates }) {
  const arr = getCalTasks();
  const now  = new Date().toISOString();
  const added = [];
  for (const date of dates) {
    // جلوگیری از تکراری شدن (همون عنوان + همون روز + همون دوره)
    const dup = arr.find(t => t.date === date && t.title === title.trim() && t.period === (period||'anytime'));
    if (dup) continue;
    const t = {
      id: `c${Date.now()}_${date}`, title: title.trim(), date,
      period: period||'anytime', priority: priority||'medium',
      subject: subject||'', done: false, completedAt: null,
      notifyEnabled: notifyEnabled !== false,
      recurring: true, createdAt: now,
    };
    arr.push(t); added.push(t);
  }
  wr('cal-tasks.json', arr);
  return { count: added.length };
}

module.exports.addRecurringCalTasks = addRecurringCalTasks;
