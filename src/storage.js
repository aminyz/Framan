'use strict';
const { app } = require('electron');
const path    = require('path');
const fs      = require('fs');

let dataDir = '';
function init() {
  dataDir = app.getPath('userData');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}
const fp  = n => path.join(dataDir, n);
function read(n, d) {
  try { const f = fp(n); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; }
  catch { return d; }
}
function wr(n, d) {
  try { fs.writeFileSync(fp(n), JSON.stringify(d, null, 2), 'utf8'); }
  catch(e) { console.error('[Storage]', e); }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
function getTasks()       { return read('tasks.json', []); }
function saveTasks(tasks) { wr('tasks.json', tasks); }

function addTask({ title, priority }) {
  const tasks = getTasks();
  const t = { id:`t${Date.now()}`, title:title.trim(), priority:priority||'medium',
               done:false, createdAt:new Date().toISOString(), completedAt:null };
  tasks.push(t);
  saveTasks(tasks);
  return t;
}
function toggleTask(id) {
  const tasks = getTasks(), t = tasks.find(x=>x.id===id);
  if(!t) return null;
  t.done = !t.done;
  t.completedAt = t.done ? new Date().toISOString() : null;
  saveTasks(tasks);
  return t;
}
function deleteTask(id) { saveTasks(getTasks().filter(t=>t.id!==id)); return true; }

// ── Calendar Tasks ────────────────────────────────────────────────────────────
function getCalTasks()     { return read('cal-tasks.json', []); }
function saveCalTasks(arr) { wr('cal-tasks.json', arr); }

function addCalTask({ title, date, period, priority, subject, notifyEnabled }) {
  const arr = getCalTasks();
  const t = { id:`c${Date.now()}`, title:title.trim(), date, period:period||'anytime',
               priority:priority||'medium', subject:subject||'', done:false,
               completedAt:null, notifyEnabled:notifyEnabled!==false,
               createdAt:new Date().toISOString() };
  arr.push(t);
  saveCalTasks(arr);
  return t;
}
function toggleCalTask(id) {
  const arr = getCalTasks(), t = arr.find(x=>x.id===id);
  if(!t) return null;
  t.done = !t.done;
  t.completedAt = t.done ? new Date().toISOString() : null;
  saveCalTasks(arr);
  return t;
}
function deleteCalTask(id) { saveCalTasks(getCalTasks().filter(t=>t.id!==id)); return true; }
function getCalByDate(date)       { return getCalTasks().filter(t=>t.date===date); }
function getCalByRange(s,e)       { return getCalTasks().filter(t=>t.date>=s&&t.date<=e); }

// ── Sessions ──────────────────────────────────────────────────────────────────
function getSessions() { return read('sessions.json', []); }

/**
 * studySeconds  = زمان واقعی مطالعه (بدون مکث)  — این مقدار در آمار نمایش داده می‌شود
 * durationSeconds = کل زمان جلسه (شامل مکث)
 */
function addSession({ taskId, durationSeconds, studySeconds, distractions, completed }) {
  const arr = getSessions();
  const s = { id:`s${Date.now()}`, taskId:taskId||null,
               durationSeconds:durationSeconds||0,
               studySeconds:studySeconds!=null ? studySeconds : (durationSeconds||0),
               distractions:distractions||0, completed:!!completed,
               date:new Date().toISOString().slice(0,10),
               createdAt:new Date().toISOString() };
  arr.push(s);
  wr('sessions.json', arr);
  return s;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function getTodayStats() {
  const today = new Date().toISOString().slice(0,10);
  const tasks  = getTasks();
  const sess   = getSessions().filter(s=>s.date===today);
  return {
    tasksCompleted: tasks.filter(t=>t.done&&t.completedAt?.startsWith(today)).length,
    studyMinutes:   Math.floor(sess.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),
    sessionsCount:  sess.length,
    distractionsCount: sess.reduce((a,s)=>a+(s.distractions||0),0),
  };
}

function getMonthStats(yearMonth) {
  const [y,m] = yearMonth.split('-').map(Number);
  const days  = new Date(y,m,0).getDate();
  const sess  = getSessions();
  const cal   = getCalTasks();
  return Array.from({length:days},(_,i)=>{
    const day  = i+1;
    const date = `${yearMonth}-${String(day).padStart(2,'0')}`;
    const ds   = sess.filter(s=>s.date===date);
    const dt   = cal.filter(t=>t.date===date);
    return { date, day,
             studyMinutes: Math.floor(ds.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),
             sessionsCount: ds.length,
             tasksTotal: dt.length,
             tasksDone:  dt.filter(t=>t.done).length };
  });
}

function getDayReport(date) {
  const sess = getSessions().filter(s=>s.date===date);
  const cal  = getCalByDate(date);
  return {
    studyMinutes:   Math.floor(sess.reduce((a,s)=>a+(s.studySeconds??s.durationSeconds??0),0)/60),
    totalMinutes:   Math.floor(sess.reduce((a,s)=>a+(s.durationSeconds||0),0)/60),
    sessionsCount:  sess.length,
    distractionsTotal: sess.reduce((a,s)=>a+(s.distractions||0),0),
    calTasks: cal,
    sessions: sess,
  };
}

module.exports = {
  init,
  getTasks, addTask, toggleTask, deleteTask,
  getCalTasks, addCalTask, toggleCalTask, deleteCalTask, getCalByDate, getCalByRange,
  getSessions, addSession,
  getTodayStats, getMonthStats, getDayReport,
};

function clearAllData() {
  wr('tasks.json', []);
  wr('cal-tasks.json', []);
  wr('sessions.json', []);
  return true;
}
module.exports.clearAllData = clearAllData;
