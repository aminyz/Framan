'use strict';
const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const path    = require('path');
const https   = require('https');
const http    = require('http');
const storage = require('./storage');

let win, hourlyInterval=null;

// ── RSS Fetcher ───────────────────────────────────────────────────────────────
function fetchURL(url, redirects=0) {
  return new Promise((resolve,reject) => {
    if(redirects>5) return reject(new Error('too many redirects'));
    try {
      const client=url.startsWith('https')?https:http;
      const req=client.get(url,{timeout:12000,headers:{'User-Agent':'MindDock RSS Reader 1.0'}},res=>{
        if(res.statusCode>=300&&res.statusCode<400&&res.headers.location)
          return fetchURL(res.headers.location,redirects+1).then(resolve).catch(reject);
        let data=''; res.setEncoding('utf8');
        res.on('data',c=>data+=c); res.on('end',()=>resolve(data));
      });
      req.on('error',reject);
      req.on('timeout',()=>{req.destroy();reject(new Error('timeout'));});
    } catch(e){reject(e);}
  });
}
function parseRSS(xml) {
  const clean=s=>(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
  const get=(src,tag)=>{const m=new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i').exec(src);return m?clean(m[1]):'';};
  const attr=(src,tag,a)=>{const m=new RegExp(`<${tag}[^>]*\\s${a}="([^"]*)"`,'i').exec(src);return m?m[1].trim():'';};
  const items=[], rss=(xml.match(/<item[\s>]([\s\S]*?)<\/item>/gi)||[]);
  if(rss.length){
    for(const item of rss.slice(0,10)){
      items.push({title:get(item,'title')||'بدون عنوان',link:(get(item,'link')||attr(item,'link','href')).trim(),date:get(item,'pubDate')||get(item,'dc:date')||'',desc:clean(get(item,'description')||get(item,'summary')).slice(0,200)});
    }
    return items;
  }
  for(const entry of (xml.match(/<entry[\s>]([\s\S]*?)<\/entry>/gi)||[]).slice(0,10)){
    items.push({title:get(entry,'title')||'بدون عنوان',link:(attr(entry,'link','href')||get(entry,'link')).trim(),date:get(entry,'updated')||get(entry,'published')||'',desc:clean(get(entry,'summary')||get(entry,'content')).slice(0,200)});
  }
  return items;
}

// ── Notifications ─────────────────────────────────────────────────────────────
function sendReminder() {
  if(!Notification.isSupported()) return;
  const today=storage.localDateISO();
  const tasks=storage.getCalByDate(today).filter(t=>!t.done);
  if(!tasks.length) return;
  const body=tasks.slice(0,6).map(t=>`• ${t.title}`).join('\n')+(tasks.length>6?`\nو ${tasks.length-6} مورد دیگر…`:'');
  new Notification({title:`📚 یادآوری MindDock — ${tasks.length} تسک باقی‌مانده`,body}).show();
}
function startHourly() {
  if(hourlyInterval) clearInterval(hourlyInterval);
  hourlyInterval=setInterval(()=>{const h=new Date().getHours();if(h>=8&&h<=22)sendReminder();},3600000);
}
function scheduleMidnight() {
  const now=new Date(), next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,1,0);
  setTimeout(()=>{startHourly();scheduleMidnight();},next.getTime()-Date.now());
}

// ── Window ─────────────────────────────────────────────────────────────────────
function createWindow() {
  win=new BrowserWindow({width:1350,height:880,minWidth:960,minHeight:640,backgroundColor:'#0a0a0f',title:'MindDock',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});
  win.loadFile(path.join(__dirname,'../renderer/index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(()=>{
  storage.init();
  // اجرای cleanup خودکار هنگام شروع
  const cs=storage.getCleanupSettings();
  if(cs.autoCleanup) storage.cleanupOldData(cs.daysToKeep);

  createWindow();
  setTimeout(()=>{const h=new Date().getHours();if(h>=8&&h<=22)sendReminder();},5000);
  startHourly(); scheduleMidnight();
  app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

// ── IPC ────────────────────────────────────────────────────────────────────────
ipcMain.handle('get-tasks',       ()         => storage.getTasks());
ipcMain.handle('add-task',        (_,d)      => storage.addTask(d));
ipcMain.handle('toggle-task',     (_,id)     => storage.toggleTask(id));
ipcMain.handle('delete-task',     (_,id)     => storage.deleteTask(id));
ipcMain.handle('update-deadline', (_,{id,deadline}) => storage.updateTaskDeadline(id,deadline));

ipcMain.handle('get-cal-date',    (_,date)   => storage.getCalByDate(date));
ipcMain.handle('get-cal-range',   (_,{s,e})  => storage.getCalByRange(s,e));
ipcMain.handle('add-cal-task',    (_,d)      => storage.addCalTask(d));
ipcMain.handle('toggle-cal',      (_,id)     => storage.toggleCalTask(id));
ipcMain.handle('delete-cal',      (_,id)     => storage.deleteCalTask(id));
ipcMain.handle('get-month',       (_,ym)     => storage.getMonthStats(ym));
ipcMain.handle('get-date-range-stats',(_,d)  => storage.getDateRangeStats(d));
ipcMain.handle('get-day-report',  (_,date)   => storage.getDayReport(date));
ipcMain.handle('get-weekly-report',(_,{s,e}) => storage.getWeeklyReport(s,e));

ipcMain.handle('add-session',     (_,d)      => { const s=storage.addSession(d); storage.addXP(d.completed?(d.studySeconds>=600?50:20):10); return s; });
ipcMain.handle('get-stats',       ()         => storage.getTodayStats());
ipcMain.handle('get-analytics',   (_,days)   => storage.getAnalyticsData(days||7));
ipcMain.handle('get-gamif',       ()         => storage.getGamif());
ipcMain.handle('get-weekly-min',  ()         => storage.getWeeklyStudyMinutes());
ipcMain.handle('task-xp',         ()         => storage.addXP(15));

ipcMain.handle('get-notes',       ()         => storage.getNotes());
ipcMain.handle('add-note',        (_,d)      => storage.addNote(d));
ipcMain.handle('update-note',     (_,{id,...d}) => storage.updateNote(id,d));
ipcMain.handle('delete-note',     (_,id)     => storage.deleteNote(id));

ipcMain.handle('get-feeds',       ()         => storage.getFeeds());
ipcMain.handle('add-feed',        (_,d)      => storage.addFeed(d));
ipcMain.handle('delete-feed',     (_,id)     => storage.deleteFeed(id));
ipcMain.handle('fetch-feed',      async(_,{id,url})=>{
  try {
    const cached=storage.getCachedFeed(id);
    if(cached&&(Date.now()-new Date(cached.fetchedAt).getTime())<15*60*1000) return {ok:true,...cached};
    const xml=await fetchURL(url);
    const articles=parseRSS(xml);
    if(!articles.length) return {ok:false,error:'مقاله‌ای یافت نشد. لطفاً آدرس RSS را بررسی کن.'};
    const data={articles,fetchedAt:new Date().toISOString()};
    storage.setCachedFeed(id,data); return {ok:true,...data};
  } catch(e){ return {ok:false,error:`خطا: ${e.message}`}; }
});

ipcMain.handle('get-goal',             ()      => storage.getGoal());
ipcMain.handle('set-goal',             (_,min) => storage.setGoal(min));
ipcMain.handle('get-cleanup-settings', ()      => storage.getCleanupSettings());
ipcMain.handle('set-cleanup-settings', (_,s)   => storage.setCleanupSettings(s));
ipcMain.handle('run-cleanup',          (_,days)=> storage.cleanupOldData(days));
ipcMain.handle('clear-data',           ()      => storage.clearAllData());

ipcMain.handle('notify',         (_,{title,body}) => { if(Notification.isSupported()) new Notification({title,body}).show(); });
ipcMain.handle('test-notify',    ()        => sendReminder());
ipcMain.handle('resched-notifs', ()        => startHourly());
ipcMain.handle('open-url',       (_,url)   => shell.openExternal(url));

// ── Recurring tasks ───────────────────────────────────────────────────────────
ipcMain.handle('add-recurring-cal', (_, d) => storage.addRecurringCalTasks(d));

// ── AI Assistant (OpenRouter) ─────────────────────────────────────────────────
ipcMain.handle('ai-chat', async (_, { messages, apiKey, aiModel }) => {
  if (!apiKey) return { ok: false, error: 'کلید API وارد نشده — از تنظیمات اضافه کن.' };
  try {
    const https = require('https');
    const body  = JSON.stringify({
      model: aiModel || 'meta-llama/llama-3.3-70b-instruct:free',
      messages,
      max_tokens: 600,
    });
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'openrouter.ai', path: '/api/v1/chat/completions',
        method: 'POST', timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/aminyz/MindDock',
          'X-Title': 'MindDock Productivity Assistant',
        },
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('parse error')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body); req.end();
    });
    if (result.error) return { ok: false, error: result.error.message || 'خطای API' };
    const text = result.choices?.[0]?.message?.content || '';
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── AI Settings ───────────────────────────────────────────────────────────────
const { safeStorage } = require('electron');
ipcMain.handle('save-api-key', (_, key) => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(key);
      require('fs').writeFileSync(require('path').join(app.getPath('userData'), 'ai-key.enc'), buf);
    } else {
      require('fs').writeFileSync(require('path').join(app.getPath('userData'), 'ai-key.txt'), key, 'utf8');
    }
    return { ok: true };
  } catch(e) { return { ok: false }; }
});
ipcMain.handle('load-api-key', () => {
  try {
    const p1 = require('path').join(app.getPath('userData'), 'ai-key.enc');
    const p2 = require('path').join(app.getPath('userData'), 'ai-key.txt');
    const fs = require('fs');
    if (fs.existsSync(p1) && safeStorage.isEncryptionAvailable())
      return safeStorage.decryptString(fs.readFileSync(p1));
    if (fs.existsSync(p2)) return fs.readFileSync(p2, 'utf8');
    return '';
  } catch { return ''; }
});

ipcMain.handle('save-ai-model', (_, model) => {
  try { require('fs').writeFileSync(require('path').join(app.getPath('userData'), 'ai-model.txt'), model, 'utf8'); return {ok:true}; }
  catch { return {ok:false}; }
});
ipcMain.handle('load-ai-model', () => {
  try { const p=require('path').join(app.getPath('userData'),'ai-model.txt'); const fs=require('fs'); return fs.existsSync(p)?fs.readFileSync(p,'utf8'):'meta-llama/llama-3.3-70b-instruct:free'; }
  catch { return 'meta-llama/llama-3.3-70b-instruct:free'; }
});
