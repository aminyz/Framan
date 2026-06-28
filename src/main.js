'use strict';
const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path    = require('path');
const storage = require('./storage');

let win;
const pending = new Map(); // scheduled notification timeouts

// ── Notifications ─────────────────────────────────────────────────────────────
// فقط بر اساس زمان بخش‌های روز (نه هر ساعت)
function scheduleNotifications() {
  pending.forEach(t => clearTimeout(t));
  pending.clear();

  const today = new Date().toISOString().slice(0, 10);
  const tasks  = storage.getCalByDate(today).filter(t => !t.done && t.notifyEnabled !== false);
  if (!tasks.length) return;

  const slots = {
    morning:   { h:8,  m:0,  label:'صبح' },
    afternoon: { h:13, m:0,  label:'ظهر' },
    evening:   { h:19, m:0,  label:'شب'  },
  };

  const now = Date.now();

  Object.entries(slots).forEach(([period, { h, m, label }]) => {
    const grp = tasks.filter(t => t.period === period);
    if (!grp.length) return;

    const at  = new Date(); at.setHours(h, m, 0, 0);
    const ms  = at.getTime() - now;

    const send = () => {
      if (!Notification.isSupported()) return;
      const body = grp.slice(0,5).map(t=>`• ${t.title}`).join('\n')
                 + (grp.length>5 ? `\nو ${grp.length-5} مورد دیگر…` : '');
      new Notification({ title:`📚 تسک‌های ${label} — MindDock`, body }).show();
    };

    if (ms > 1000) {
      pending.set(period, setTimeout(send, ms));     // آینده
    } else if (ms > -2*60*60*1000) {
      pending.set(period, setTimeout(send, 4000));   // شروع شده، هنگام باز شدن اپ نشان بده
    }
  });
}

function scheduleDaily() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0,1,0);
  setTimeout(() => { scheduleNotifications(); scheduleDaily(); }, midnight.getTime()-Date.now());
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width:1300, height:860, minWidth:960, minHeight:640,
    backgroundColor:'#0d0d0d', title:'MindDock',
    webPreferences:{
      preload: path.join(__dirname,'preload.js'),
      contextIsolation:true, nodeIntegration:false,
    },
  });
  win.loadFile(path.join(__dirname,'../renderer/index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  storage.init();
  createWindow();
  scheduleNotifications();
  scheduleDaily();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform!=='darwin') app.quit(); });

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('get-tasks',    ()      => storage.getTasks());
ipcMain.handle('add-task',     (_,d)   => storage.addTask(d));
ipcMain.handle('toggle-task',  (_,id)  => storage.toggleTask(id));
ipcMain.handle('delete-task',  (_,id)  => storage.deleteTask(id));

ipcMain.handle('get-cal-date', (_,date)  => storage.getCalByDate(date));
ipcMain.handle('get-cal-range',(_,{s,e}) => storage.getCalByRange(s,e));
ipcMain.handle('add-cal-task', (_,d)     => storage.addCalTask(d));
ipcMain.handle('toggle-cal',   (_,id)    => storage.toggleCalTask(id));
ipcMain.handle('delete-cal',   (_,id)    => storage.deleteCalTask(id));
ipcMain.handle('get-month',    (_,ym)    => storage.getMonthStats(ym));
ipcMain.handle('get-day-report',(_,date) => storage.getDayReport(date));

ipcMain.handle('add-session',  (_,d)   => storage.addSession(d));
ipcMain.handle('get-stats',    ()      => storage.getTodayStats());

ipcMain.handle('notify',       (_,{title,body}) => {
  if (Notification.isSupported()) new Notification({title,body}).show();
});
ipcMain.handle('resched-notifs', () => scheduleNotifications());

ipcMain.handle('clear-data', () => storage.clearAllData());
