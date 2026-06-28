const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getTasks:    ()         => ipcRenderer.invoke('get-tasks'),
  addTask:     d          => ipcRenderer.invoke('add-task', d),
  toggleTask:  id         => ipcRenderer.invoke('toggle-task', id),
  deleteTask:  id         => ipcRenderer.invoke('delete-task', id),
  getCalDate:   date      => ipcRenderer.invoke('get-cal-date', date),
  getCalRange:  (s,e)     => ipcRenderer.invoke('get-cal-range', {s,e}),
  addCalTask:   d         => ipcRenderer.invoke('add-cal-task', d),
  toggleCal:    id        => ipcRenderer.invoke('toggle-cal', id),
  deleteCal:    id        => ipcRenderer.invoke('delete-cal', id),
  getMonth:     ym        => ipcRenderer.invoke('get-month', ym),
  getDayReport: date      => ipcRenderer.invoke('get-day-report', date),
  addSession:  d          => ipcRenderer.invoke('add-session', d),
  getStats:    ()         => ipcRenderer.invoke('get-stats'),
  notify:      o          => ipcRenderer.invoke('notify', o),
  reschedNotifs: ()       => ipcRenderer.invoke('resched-notifs'),
  clearData:   ()         => ipcRenderer.invoke('clear-data'),
});
