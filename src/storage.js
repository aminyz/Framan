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

// ── Tasks ─────────────────────────────────────────────────────────────────────
function getTasks()       { return read('tasks.json',[]); }
function addTask({title,priority}) {
  const tasks=getTasks();
  const t={id:`t${Date.now()}`,title:title.trim(),priority:priority||'medium',done:false,createdAt:new Date().toISOString(),completedAt:null};
  tasks.push(t); wr('tasks.json',tasks); return t;
}
function toggleTask(id) {
  const tasks=getTasks(), t=tasks.find(x=>x.id===id); if(!t) return null;
  t.done=!t.done; t.completedAt=t.done?new Date().toISOString():null;
  wr('tasks.json',tasks); return t;
}
function deleteTask(id) { wr('tasks.json',getTasks().filter(t=>t.id!==id)); return true; }

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
  const s={id:`s${Date.now()}`,taskId:taskId||null,durationSeconds:durationSeconds||0,studySeconds:studySeconds!=null?studySeconds:(durationSeconds||0),distractions:distractions||0,completed:!!completed,date:new Date().toISOString().slice(0,10),hour:new Date().getHours(),createdAt:new Date().toISOString()};
  arr.push(s); wr('sessions.json',arr); return s;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function getTodayStats() {
  const today=new Date().toISOString().slice(0,10);
  const tasks=getTasks(), sess=getSessions().filter(s=>s.date===today);
  return { tasksCompleted:tasks.filter(t=>t.done&&t.completedAt?.startsWith(today)).length, studyMinutes:Math.floor(sess.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60), sessionsCount:sess.length, distractionsCount:sess.reduce((a,s)=>a+(s.distractions||0),0) };
}
function getMonthStats(yearMonth) {
  const [y,m]=yearMonth.split('-').map(Number);
  const days=new Date(y,m,0).getDate(), sess=getSessions(), cal=getCalTasks();
  return Array.from({length:days},(_,i)=>{
    const day=i+1, date=`${yearMonth}-${String(day).padStart(2,'0')}`;
    const ds=sess.filter(s=>s.date===date), dt=cal.filter(t=>t.date===date);
    return {date,day,studyMinutes:Math.floor(ds.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),sessionsCount:ds.length,tasksTotal:dt.length,tasksDone:dt.filter(t=>t.done).length};
  });
}
/** آمار برای یک لیست دلخواه از تاریخ‌های میلادی (ISO) — برای نمایش ماه جلالی واقعی */
function getDateRangeStats(dates) {
  const sess=getSessions(), cal=getCalTasks();
  return dates.map(date=>{
    const ds=sess.filter(s=>s.date===date), dt=cal.filter(t=>t.date===date);
    return {date,studyMinutes:Math.floor(ds.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),sessionsCount:ds.length,tasksTotal:dt.length,tasksDone:dt.filter(t=>t.done).length};
  });
}
function getDayReport(date) {
  const sess=getSessions().filter(s=>s.date===date), cal=getCalByDate(date);
  return {studyMinutes:Math.floor(sess.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),totalMinutes:Math.floor(sess.reduce((a,s)=>a+(s.durationSeconds||0),0)/60),sessionsCount:sess.length,distractionsTotal:sess.reduce((a,s)=>a+(s.distractions||0),0),calTasks:cal,sessions:sess};
}
function getAnalyticsData(days=7) {
  const sess=getSessions(), result=[];
  for(let i=days-1;i>=0;i--) {
    const d=new Date(); d.setDate(d.getDate()-i);
    const date=d.toISOString().slice(0,10);
    const ds=sess.filter(s=>s.date===date);
    result.push({date,label:d.toLocaleDateString('fa-IR',{month:'short',day:'numeric'}),studyMinutes:Math.floor(ds.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),sessions:ds.length});
  }
  return result;
}
function getWeeklyStudyMinutes() {
  const today=new Date(), day=today.getDay();
  const daysFromSat=(day+1)%7;
  const weekStart=new Date(today); weekStart.setDate(today.getDate()-daysFromSat); weekStart.setHours(0,0,0,0);
  const ws=weekStart.toISOString().slice(0,10);
  return Math.floor(getSessions().filter(s=>s.date>=ws).reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60);
}

// ── Gamification ──────────────────────────────────────────────────────────────
const LEVELS=[{l:1,name:'مبتدی',min:0},{l:2,name:'در حال رشد',min:200},{l:3,name:'متمرکز',min:500},{l:4,name:'حرفه‌ای',min:1000},{l:5,name:'استاد',min:2000},{l:6,name:'افسانه',min:5000}];
function getGamif() { return read('gamif.json',{xp:0,level:1,levelName:'مبتدی',currentStreak:0,longestStreak:0,lastStudyDate:null}); }
function addXP(amount) {
  const g=getGamif(); g.xp+=amount;
  const today=new Date().toISOString().slice(0,10);
  if(!g.lastStudyDate) { g.currentStreak=1; g.lastStudyDate=today; }
  else {
    const diff=Math.floor((new Date(today)-new Date(g.lastStudyDate))/(86400000));
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
  const arr=getNotes(), n=arr.find(x=>x.id===id); if(!n)return null;
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

// ── Weekly Goal ───────────────────────────────────────────────────────────────
function getGoal()    { return read('goal.json',{weeklyMinutes:300}); }
function setGoal(weeklyMinutes) { wr('goal.json',{weeklyMinutes}); return {weeklyMinutes}; }

// ── Clear All ─────────────────────────────────────────────────────────────────
function clearAllData() {
  ['tasks.json','cal-tasks.json','sessions.json','gamif.json','notes.json','goal.json'].forEach(f=>{try{const p=fp(f);if(fs.existsSync(p))fs.unlinkSync(p);}catch{}});
  // clear feed caches
  getFeeds().forEach(f=>{try{const p=fp(`feed-${f.id}.json`);if(fs.existsSync(p))fs.unlinkSync(p);}catch{}});
  return true;
}

module.exports = {
  init,
  getTasks,addTask,toggleTask,deleteTask,
  getCalTasks,addCalTask,toggleCalTask,deleteCalTask,getCalByDate,getCalByRange,
  getSessions,addSession,
  getTodayStats,getMonthStats,getDateRangeStats,getDayReport,getAnalyticsData,getWeeklyStudyMinutes,
  getGamif,addXP,
  getNotes,addNote,updateNote,deleteNote,
  getFeeds,addFeed,deleteFeed,getCachedFeed,setCachedFeed,
  getGoal,setGoal,
  clearAllData,
};
