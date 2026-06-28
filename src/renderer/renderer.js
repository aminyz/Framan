import { createAppRegistry } from "./core/appRegistry.js";
import { createEventBus } from "./core/eventBus.js";
import {
  addDays,
  formatFaDate,
  formatShortFaDate,
  getMonthDays,
  getWeekDays,
  parseDateKey,
  toDateKey,
  weekdayName
} from "./core/dateUtils.js";

const state = {
  data: null,
  activeAppId: "today",
  calendarMode: "day",
  selectedDate: toDateKey(),
  focus: {
    secondsLeft: 25 * 60,
    durationMinutes: 25,
    running: false,
    timerId: null,
    startedAt: null
  }
};

const bus = createEventBus();
const registry = createAppRegistry();

const elements = {
  appNav: document.querySelector("#appNav"),
  appRoot: document.querySelector("#appRoot"),
  appTitle: document.querySelector("#appTitle"),
  todayLabel: document.querySelector("#todayLabel"),
  saveState: document.querySelector("#saveState"),
  quickAddButton: document.querySelector("#quickAddButton"),
  notifyNowButton: document.querySelector("#notifyNowButton"),
  taskDialog: document.querySelector("#taskDialog"),
  taskForm: document.querySelector("#taskForm"),
  taskDialogTitle: document.querySelector("#taskDialogTitle"),
  taskId: document.querySelector("#taskId"),
  taskTitle: document.querySelector("#taskTitle"),
  taskDate: document.querySelector("#taskDate"),
  taskPriority: document.querySelector("#taskPriority"),
  taskProject: document.querySelector("#taskProject"),
  taskNote: document.querySelector("#taskNote"),
  deleteTaskButton: document.querySelector("#deleteTaskButton"),
  closeTaskDialogButton: document.querySelector("#closeTaskDialogButton"),
  cancelTaskButton: document.querySelector("#cancelTaskButton")
};

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function priorityLabel(priority) {
  return {
    low: "کم",
    medium: "متوسط",
    high: "زیاد"
  }[priority || "medium"];
}

function setSaveState(text) {
  elements.saveState.textContent = text;
}

async function saveData() {
  setSaveState("در حال ذخیره...");
  state.data = await window.minddock.saveData(state.data);
  setSaveState("ذخیره شد");
  setTimeout(() => setSaveState("آماده"), 1300);
  bus.emit("data:changed", state.data);
}

function tasksForDate(dateKey) {
  return (state.data.tasks || [])
    .filter((task) => task.date === dateKey)
    .sort((a, b) => {
      const weight = { high: 0, medium: 1, low: 2 };
      return (weight[a.priority] ?? 1) - (weight[b.priority] ?? 1);
    });
}

function taskStats(tasks = state.data.tasks || []) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const todo = total - done;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, todo, percent };
}

function renderMetric(label, value, detail) {
  return `
    <div class="metric">
      <span class="metric-label">${label}</span>
      <strong>${value}</strong>
      <span class="metric-label">${detail || ""}</span>
    </div>
  `;
}

function renderProgress(percent) {
  return `<div class="progress" aria-label="${percent}%"><span style="width: ${percent}%"></span></div>`;
}

function renderEmpty(text) {
  return `<div class="empty-state">${text}</div>`;
}


function plannedFocusMinutes(session) {
  return Number(session.plannedMinutes ?? session.minutes ?? 0);
}

function spentFocusMinutes(session) {
  return Number(session.spentMinutes ?? session.minutes ?? 0);
}

function focusSessionsForDate(dateKey) {
  return (state.data.focusSessions || []).filter((session) => session.date === dateKey);
}

function focusSummaryForDate(dateKey) {
  const sessions = focusSessionsForDate(dateKey);
  return {
    count: sessions.length,
    planned: sessions.reduce((sum, session) => sum + plannedFocusMinutes(session), 0),
    spent: sessions.reduce((sum, session) => sum + spentFocusMinutes(session), 0)
  };
}

function formatMinutes(value) {
  const minutes = Number(value) || 0;
  if (minutes < 60) return `${minutes} دقیقه`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ساعت و ${rest} دقیقه` : `${hours} ساعت`;
}
function renderTaskList(tasks, options = {}) {
  if (tasks.length === 0) {
    return renderEmpty(options.emptyText || "تسکی ثبت نشده است.");
  }

  const compactClass = options.compact ? " compact" : "";

  return `
    <div class="task-list${compactClass}">
      ${tasks
        .map(
          (task) => `
          <article class="task-row${compactClass} ${task.status === "done" ? "done" : ""}" data-task-id="${task.id}">
            <input class="status-toggle" type="checkbox" ${task.status === "done" ? "checked" : ""} aria-label="تغییر وضعیت" />
            <div class="task-main">
              <span class="task-title">${escapeHtml(task.title)}</span>
              <span class="task-meta">${formatShortFaDate(task.date)}${task.project ? ` · ${escapeHtml(task.project)}` : ""}</span>
            </div>
            <span class="priority ${task.priority || "medium"}">${priorityLabel(task.priority)}</span>
          </article>
        `
        )
        .join("")}
    </div>
  `;
}

function bindTaskRows(root = elements.appRoot) {
  root.querySelectorAll(".task-row").forEach((row) => {
    row.addEventListener("dblclick", () => openTaskDialog(row.dataset.taskId));
    row.querySelector(".status-toggle").addEventListener("change", async (event) => {
      const task = state.data.tasks.find((item) => item.id === row.dataset.taskId);
      task.status = event.target.checked ? "done" : "todo";
      await saveData();
      renderActiveApp();
    });
  });
}

function openTaskDialog(taskId = null, dateKey = state.selectedDate) {
  const task = state.data.tasks.find((item) => item.id === taskId);
  elements.taskDialogTitle.textContent = task ? "ویرایش تسک" : "تسک جدید";
  elements.taskId.value = task?.id || "";
  elements.taskTitle.value = task?.title || "";
  elements.taskDate.value = task?.date || dateKey || toDateKey();
  elements.taskPriority.value = task?.priority || "medium";
  elements.taskProject.value = task?.project || "";
  elements.taskNote.value = task?.note || "";
  elements.deleteTaskButton.hidden = !task;
  elements.taskDialog.showModal();
  elements.taskTitle.focus();
}

async function deleteTask(taskId) {
  state.data.tasks = state.data.tasks.filter((task) => task.id !== taskId);
  await saveData();
  elements.taskDialog.close();
  renderActiveApp();
}

function switchApp(appId) {
  state.activeAppId = appId;
  renderShell();
  renderActiveApp();
}

function renderShell() {
  const apps = registry.list();
  elements.appNav.innerHTML = apps
    .map(
      (app) => `
      <button class="nav-button ${app.id === state.activeAppId ? "active" : ""}" type="button" data-app-id="${app.id}">
        <span>${app.icon}</span>
        <span>${app.title}</span>
        <small>${app.badge ? app.badge(state) : ""}</small>
      </button>
    `
    )
    .join("");

  elements.appNav.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchApp(button.dataset.appId));
  });

  const app = registry.get(state.activeAppId);
  elements.appTitle.textContent = app?.title || "MindDock";
  elements.todayLabel.textContent = formatFaDate(toDateKey(), { weekday: "long" });
}

function renderActiveApp() {
  const app = registry.get(state.activeAppId);
  if (!app) return;
  elements.appRoot.innerHTML = app.render(state);
  app.bind?.(elements.appRoot, state);
  renderShell();
}

function registerApps() {
  registry.register({
    id: "today",
    title: "امروز",
    icon: "◐",
    order: 1,
    badge: () => taskStats(tasksForDate(toDateKey())).todo || "",
    render: () => {
      const todayTasks = tasksForDate(toDateKey());
      const stats = taskStats(todayTasks);
      return `
        <div class="page-grid">
          <section class="panel">
            <div class="panel-header">
              <h2>${formatFaDate(toDateKey(), { weekday: "long" })}</h2>
              <button class="primary-button" id="addTodayTask" type="button">تسک جدید</button>
            </div>
            <div class="panel-body">
              ${renderTaskList(todayTasks, { emptyText: "برای امروز هنوز تسکی نداری." })}
            </div>
          </section>
          <aside class="panel">
            <div class="panel-header"><h2>وضعیت روز</h2></div>
            <div class="panel-body form-row">
              ${renderMetric("کل تسک‌ها", stats.total, `${stats.done} انجام شده`)}
              ${renderProgress(stats.percent)}
              ${renderMetric("مانده", stats.todo, "تسک باز امروز")}
            </div>
          </aside>
        </div>
      `;
    },
    bind: (root) => {
      root.querySelector("#addTodayTask").addEventListener("click", () => openTaskDialog(null, toDateKey()));
      bindTaskRows(root);
    }
  });

  registry.register({
    id: "tasks",
    title: "تسک‌ها",
    icon: "✓",
    order: 2,
    badge: () => taskStats().todo || "",
    render: () => {
      const stats = taskStats();
      return `
        <section class="section-header">
          <h2>Inbox</h2>
          <button class="primary-button" id="addTask" type="button">تسک جدید</button>
        </section>
        <div class="wide-grid">
          ${renderMetric("کل", stats.total, "تسک ثبت شده")}
          ${renderMetric("باز", stats.todo, "نیازمند اقدام")}
          ${renderMetric("انجام شده", stats.done, `${stats.percent}% پیشرفت`)}
          ${renderMetric("امروز", tasksForDate(toDateKey()).length, formatShortFaDate(toDateKey()))}
        </div>
        <div class="panel" style="margin-top: 18px;">
          <div class="panel-body">${renderTaskList(state.data.tasks || [])}</div>
        </div>
      `;
    },
    bind: (root) => {
      root.querySelector("#addTask").addEventListener("click", () => openTaskDialog(null, toDateKey()));
      bindTaskRows(root);
    }
  });

  registry.register({
    id: "calendar",
    title: "تقویم",
    icon: "□",
    order: 3,
    render: () => `
      <section class="panel">
        <div class="panel-header">
          <div class="tabs">
            <button class="${state.calendarMode === "day" ? "active" : ""}" data-calendar-mode="day" type="button">روزانه</button>
            <button class="${state.calendarMode === "week" ? "active" : ""}" data-calendar-mode="week" type="button">هفتگی</button>
            <button class="${state.calendarMode === "month" ? "active" : ""}" data-calendar-mode="month" type="button">ماهانه</button>
          </div>
          <input id="calendarDate" type="date" value="${state.selectedDate}" />
        </div>
        <div class="panel-body">${renderCalendarMode()}</div>
      </section>
    `,
    bind: (root) => {
      root.querySelectorAll("[data-calendar-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          state.calendarMode = button.dataset.calendarMode;
          renderActiveApp();
        });
      });
      root.querySelector("#calendarDate").addEventListener("change", (event) => {
        state.selectedDate = event.target.value || toDateKey();
        renderActiveApp();
      });
      root.querySelectorAll("[data-add-date]").forEach((button) => {
        button.addEventListener("click", () => openTaskDialog(null, button.dataset.addDate));
      });
      bindTaskRows(root);
    }
  });

  registry.register({
    id: "focus",
    title: "تمرکز",
    icon: "◎",
    order: 4,
    render: () => {
      const minutes = Math.floor(state.focus.secondsLeft / 60).toString().padStart(2, "0");
      const seconds = (state.focus.secondsLeft % 60).toString().padStart(2, "0");
      return `
        <div class="page-grid">
          <section class="panel">
            <div class="panel-header"><h2>جلسه تمرکز</h2></div>
            <div class="panel-body timer">
              <div class="timer-face">${minutes}:${seconds}</div>
              <div class="segmented">
                ${[15, 25, 45, 60].map((minute) => `<button class="${state.focus.durationMinutes === minute ? "active" : ""}" data-duration="${minute}" type="button">${minute}</button>`).join("")}
              </div>
              <div class="timer-controls">
                <button id="toggleFocus" class="primary-button" type="button">${state.focus.running ? "توقف" : "شروع"}</button>
                <button id="resetFocus" class="ghost-button" type="button">ریست</button>
                <button id="completeFocus" class="ghost-button" type="button">ثبت جلسه</button>
              </div>
            </div>
          </section>
          <aside class="panel">
            <div class="panel-header"><h2>جلسه‌ها</h2></div>
            <div class="panel-body">
              ${renderFocusHistory()}
            </div>
          </aside>
        </div>
      `;
    },
    bind: bindFocus
  });

  registry.register({
    id: "habits",
    title: "عادت‌ها",
    icon: "◇",
    order: 5,
    render: () => `
      <div class="page-grid">
        <section class="panel">
          <div class="panel-header">
            <h2>ردیاب عادت</h2>
            <button id="addHabit" class="primary-button" type="button">عادت جدید</button>
          </div>
          <div class="panel-body">${renderHabits()}</div>
        </section>
        <aside class="panel">
          <div class="panel-header"><h2>امروز</h2></div>
          <div class="panel-body">${renderMetric("تکمیل", habitCompletionToday(), "عادت امروز")}</div>
        </aside>
      </div>
    `,
    bind: bindHabits
  });

  registry.register({
    id: "notes",
    title: "یادداشت‌ها",
    icon: "✎",
    order: 6,
    render: () => `
      <div class="page-grid">
        <section class="panel">
          <div class="panel-header">
            <h2>یادداشت‌ها</h2>
            <button id="addNote" class="primary-button" type="button">یادداشت جدید</button>
          </div>
          <div class="panel-body">${renderNotes()}</div>
        </section>
        <aside class="panel">
          <div class="panel-header"><h2>ویرایش</h2></div>
          <div class="panel-body form-row">
            <input id="noteTitle" placeholder="عنوان" />
            <textarea id="noteBody" rows="12" placeholder="متن"></textarea>
            <button id="saveNote" class="primary-button" type="button">ذخیره</button>
          </div>
        </aside>
      </div>
    `,
    bind: bindNotes
  });

  registry.register({
    id: "analytics",
    title: "تحلیل",
    icon: "▣",
    order: 7,
    render: () => {
      const stats = taskStats();
      const weekDays = getWeekDays(toDateKey());
      const weekTasks = state.data.tasks.filter((task) => weekDays.includes(task.date));
      const weekStats = taskStats(weekTasks);
      return `
        <div class="wide-grid">
          ${renderMetric("پیشرفت کل", `${stats.percent}%`, `${stats.done} از ${stats.total}`)}
          ${renderMetric("این هفته", `${weekStats.percent}%`, `${weekStats.done} از ${weekStats.total}`)}
          ${renderMetric("جلسه تمرکز", state.data.focusSessions.length, "ثبت شده")}
          ${renderMetric("یادداشت", state.data.notes.length, "مورد")}
        </div>
        <section class="panel" style="margin-top: 18px;">
          <div class="panel-header"><h2>تحلیل ماه جاری</h2></div>
          <div class="panel-body">${renderMonthAnalytics()}</div>
        </section>
      `;
    }
  });

  registry.register({
    id: "settings",
    title: "تنظیمات",
    icon: "⚙",
    order: 8,
    render: () => `
      <section class="panel">
        <div class="panel-header"><h2>Workspace</h2></div>
        <div class="panel-body settings-grid">
          <label>
            نوتیفیکیشن
            <select id="reminderEnabled">
              <option value="true" ${state.data.settings.reminderEnabled ? "selected" : ""}>فعال</option>
              <option value="false" ${!state.data.settings.reminderEnabled ? "selected" : ""}>غیرفعال</option>
            </select>
          </label>
          <label>
            فاصله یادآوری
            <select id="reminderInterval">
              ${[15, 30, 60, 120].map((value) => `<option value="${value}" ${state.data.settings.reminderIntervalMinutes === value ? "selected" : ""}>هر ${value} دقیقه</option>`).join("")}
            </select>
          </label>
          <label>
            ظاهر
            <select id="themeSource">
              <option value="system" ${state.data.settings.theme === "system" ? "selected" : ""}>سیستم</option>
              <option value="light" ${state.data.settings.theme === "light" ? "selected" : ""}>روشن</option>
              <option value="dark" ${state.data.settings.theme === "dark" ? "selected" : ""}>تاریک سیستم</option>
            </select>
          </label>
          <div class="metric">
            <span class="metric-label">ذخیره‌سازی</span>
            <strong>Local</strong>
            <span id="dataPath" class="metric-label">...</span>
          </div>
        </div>
      </section>
    `,
    bind: bindSettings
  });
}

function renderCalendarMode() {
  if (state.calendarMode === "week") {
    const days = getWeekDays(state.selectedDate);
    return `
      <div class="week-grid">
        ${days
          .map(
            (dateKey) => `
            <section class="day-column">
              <header>
                <div>
                  <strong>${weekdayName(dateKey)}</strong>
                  <small>${formatShortFaDate(dateKey)}</small>
                </div>
                <button class="icon-button" data-add-date="${dateKey}" type="button" aria-label="افزودن">+</button>
              </header>
              ${renderTaskList(tasksForDate(dateKey), { emptyText: "خالی" })}
            </section>
          `
          )
          .join("")}
      </div>
    `;
  }

  if (state.calendarMode === "month") {
    const month = getMonthDays(state.selectedDate);
    return `
      <div class="month-grid">
        ${Array.from({ length: month.leadingOffset }, () => `<div class="month-spacer"></div>`).join("")}
        ${month.days
          .map((dateKey) => {
            const stats = taskStats(tasksForDate(dateKey));
            return `
              <button class="month-cell ${dateKey === toDateKey() ? "today" : ""}" data-add-date="${dateKey}" type="button">
                <strong>${new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric" }).format(parseDateKey(dateKey))}</strong>
                <span class="metric-label">${weekdayName(dateKey)}</span>
                <span class="month-stats">
                  <span class="chip done">${stats.done}</span>
                  <span class="chip todo">${stats.todo}</span>
                </span>
                ${renderProgress(stats.percent)}
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  const stats = taskStats(tasksForDate(state.selectedDate));
  return `
    <div class="page-grid">
      <section>
        <div class="section-header">
          <h2>${formatFaDate(state.selectedDate, { weekday: "long" })}</h2>
          <button class="primary-button" data-add-date="${state.selectedDate}" type="button">تسک جدید</button>
        </div>
        ${renderTaskList(tasksForDate(state.selectedDate))}
      </section>
      <aside class="metric">
        <span class="metric-label">تحلیل روز</span>
        <strong>${stats.percent}%</strong>
        <span class="metric-label">${stats.done} انجام شده، ${stats.todo} باز</span>
        ${renderProgress(stats.percent)}
      </aside>
    </div>
  `;
}

function renderFocusHistory() {
  const sessions = [...state.data.focusSessions].reverse().slice(0, 8);
  if (sessions.length === 0) return renderEmpty("جلسه‌ای ثبت نشده است.");
  return `
    <div class="focus-history">
      ${sessions
        .map(
          (session) => `
          <div class="focus-row">
            <span class="task-title">${session.minutes} دقیقه</span>
            <span class="task-meta">${formatFaDate(session.date)}</span>
            <span class="chip done">تمرکز</span>
          </div>
        `
        )
        .join("")}
    </div>
  `;
}

function bindFocus(root) {
  root.querySelectorAll("[data-duration]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.focus.running) return;
      state.focus.durationMinutes = Number(button.dataset.duration);
      state.focus.secondsLeft = state.focus.durationMinutes * 60;
      renderActiveApp();
    });
  });

  root.querySelector("#toggleFocus").addEventListener("click", () => {
    state.focus.running = !state.focus.running;
    if (state.focus.running) {
      state.focus.timerId = setInterval(() => {
        state.focus.secondsLeft -= 1;
        if (state.focus.secondsLeft <= 0) {
          completeFocusSession();
        }
        renderActiveApp();
      }, 1000);
    } else {
      clearInterval(state.focus.timerId);
    }
    renderActiveApp();
  });

  root.querySelector("#resetFocus").addEventListener("click", () => {
    clearInterval(state.focus.timerId);
    state.focus.running = false;
    state.focus.secondsLeft = state.focus.durationMinutes * 60;
    renderActiveApp();
  });

  root.querySelector("#completeFocus").addEventListener("click", completeFocusSession);
}

async function completeFocusSession() {
  clearInterval(state.focus.timerId);
  state.focus.running = false;
  state.data.focusSessions.push({
    id: uid("focus"),
    minutes: state.focus.durationMinutes,
    date: toDateKey(),
    createdAt: new Date().toISOString()
  });
  state.focus.secondsLeft = state.focus.durationMinutes * 60;
  await saveData();
  renderActiveApp();
}

function habitCompletionToday() {
  const today = toDateKey();
  return (state.data.habits || []).filter((habit) => habit.completions?.[today]).length;
}

function renderHabits() {
  if (state.data.habits.length === 0) return renderEmpty("عادتی ثبت نشده است.");
  const weekDays = getWeekDays(toDateKey());
  return `
    <div class="habit-list">
      ${state.data.habits
        .map(
          (habit) => `
          <article class="habit-row" data-habit-id="${habit.id}">
            <span style="width: 14px; height: 14px; border-radius: 50%; background: ${habit.color};"></span>
            <div>
              <span class="habit-title">${escapeHtml(habit.title)}</span>
              <span class="task-meta">${weekDays.filter((day) => habit.completions?.[day]).length} از ۷ روز</span>
            </div>
            <input class="status-toggle" type="checkbox" ${habit.completions?.[toDateKey()] ? "checked" : ""} aria-label="امروز" />
          </article>
        `
        )
        .join("")}
    </div>
  `;
}

function bindHabits(root) {
  root.querySelector("#addHabit").addEventListener("click", async () => {
    const title = prompt("عنوان عادت");
    if (!title?.trim()) return;
    state.data.habits.push({
      id: uid("habit"),
      title: title.trim(),
      color: ["#2f7d6d", "#386fa4", "#c6553d", "#b98221"][state.data.habits.length % 4],
      completions: {}
    });
    await saveData();
    renderActiveApp();
  });

  root.querySelectorAll(".habit-row").forEach((row) => {
    row.querySelector(".status-toggle").addEventListener("change", async (event) => {
      const habit = state.data.habits.find((item) => item.id === row.dataset.habitId);
      habit.completions[toDateKey()] = event.target.checked;
      await saveData();
      renderActiveApp();
    });
  });
}

function renderNotes() {
  if (state.data.notes.length === 0) return renderEmpty("یادداشتی ثبت نشده است.");
  return `
    <div class="note-list">
      ${state.data.notes
        .map(
          (note) => `
          <button class="note-row" data-note-id="${note.id}" type="button">
            <span class="note-title">${escapeHtml(note.title)}</span>
            <span class="note-meta">${formatShortFaDate(note.updatedAt.slice(0, 10))}</span>
            <span class="chip">باز</span>
          </button>
        `
        )
        .join("")}
    </div>
  `;
}

function bindNotes(root) {
  let activeNoteId = state.data.notes[0]?.id || null;
  const titleInput = root.querySelector("#noteTitle");
  const bodyInput = root.querySelector("#noteBody");

  function loadNote(noteId) {
    activeNoteId = noteId;
    const note = state.data.notes.find((item) => item.id === activeNoteId);
    titleInput.value = note?.title || "";
    bodyInput.value = note?.body || "";
  }

  root.querySelector("#addNote").addEventListener("click", async () => {
    const note = {
      id: uid("note"),
      title: "یادداشت جدید",
      body: "",
      updatedAt: new Date().toISOString()
    };
    state.data.notes.unshift(note);
    await saveData();
    renderActiveApp();
  });

  root.querySelectorAll(".note-row").forEach((row) => {
    row.addEventListener("click", () => loadNote(row.dataset.noteId));
  });

  root.querySelector("#saveNote").addEventListener("click", async () => {
    if (!activeNoteId) return;
    const note = state.data.notes.find((item) => item.id === activeNoteId);
    note.title = titleInput.value.trim() || "بدون عنوان";
    note.body = bodyInput.value;
    note.updatedAt = new Date().toISOString();
    await saveData();
    renderActiveApp();
  });

  loadNote(activeNoteId);
}

function renderMonthAnalytics() {
  const month = getMonthDays(toDateKey());
  const rows = month.days.map((dateKey) => {
    const stats = taskStats(tasksForDate(dateKey));
    return { dateKey, ...stats };
  });
  const bestDay = [...rows].sort((a, b) => b.percent - a.percent || b.total - a.total)[0];
  const busyDay = [...rows].sort((a, b) => b.total - a.total)[0];

  return `
    <div class="wide-grid">
      ${renderMetric("بهترین روز", bestDay ? formatShortFaDate(bestDay.dateKey) : "-", bestDay ? `${bestDay.percent}%` : "")}
      ${renderMetric("شلوغ‌ترین روز", busyDay ? formatShortFaDate(busyDay.dateKey) : "-", busyDay ? `${busyDay.total} تسک` : "")}
      ${renderMetric("روزهای فعال", rows.filter((row) => row.total > 0).length, "در ماه جاری")}
      ${renderMetric("تسک‌های مانده", rows.reduce((sum, row) => sum + row.todo, 0), "در ماه جاری")}
    </div>
  `;
}

async function bindSettings(root) {
  root.querySelector("#reminderEnabled").addEventListener("change", async (event) => {
    state.data.settings.reminderEnabled = event.target.value === "true";
    await saveData();
  });
  root.querySelector("#reminderInterval").addEventListener("change", async (event) => {
    state.data.settings.reminderIntervalMinutes = Number(event.target.value);
    await saveData();
  });
  root.querySelector("#themeSource").addEventListener("change", async (event) => {
    state.data.settings.theme = event.target.value;
    await saveData();
  });

  const meta = await window.minddock.getMeta();
  root.querySelector("#dataPath").textContent = meta.dataFilePath;
}

elements.quickAddButton.addEventListener("click", () => openTaskDialog(null, toDateKey()));
elements.notifyNowButton.addEventListener("click", async () => {
  await window.minddock.notifyToday();
  setSaveState("یادآوری ارسال شد");
});

elements.deleteTaskButton.addEventListener("click", () => {
  if (elements.taskId.value) {
    deleteTask(elements.taskId.value);
  }
});

elements.taskForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();

  const id = elements.taskId.value || uid("task");
  const existing = state.data.tasks.find((task) => task.id === id);
  const nextTask = {
    id,
    title: elements.taskTitle.value.trim(),
    date: elements.taskDate.value,
    priority: elements.taskPriority.value,
    project: elements.taskProject.value.trim(),
    note: elements.taskNote.value.trim(),
    status: existing?.status || "todo",
    createdAt: existing?.createdAt || new Date().toISOString()
  };

  if (existing) {
    Object.assign(existing, nextTask);
  } else {
    state.data.tasks.unshift(nextTask);
  }

  await saveData();
  elements.taskDialog.close();
  renderActiveApp();
});

async function boot() {
  state.data = await window.minddock.getData();
  state.data.tasks ||= [];
  state.data.habits ||= [];
  state.data.notes ||= [];
  state.data.focusSessions ||= [];
  state.data.settings ||= {};
  registerApps();
  renderShell();
  renderActiveApp();
}

boot().catch((error) => {
  elements.appRoot.innerHTML = `<div class="empty-state">خطا در اجرای MindDock: ${escapeHtml(error.message)}</div>`;
});


