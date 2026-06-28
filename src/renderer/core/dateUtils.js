const FARSI_WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

export function toDateKey(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatFaDate(dateKey, options = {}) {
  const date = typeof dateKey === "string" ? parseDateKey(dateKey) : dateKey;
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    weekday: options.weekday || undefined,
    year: options.year || "numeric",
    month: options.month || "long",
    day: options.day || "numeric"
  }).format(date);
}

export function formatShortFaDate(dateKey) {
  const date = typeof dateKey === "string" ? parseDateKey(dateKey) : dateKey;
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    month: "short",
    day: "numeric"
  }).format(date);
}

export function addDays(dateKey, amount) {
  const date = typeof dateKey === "string" ? parseDateKey(dateKey) : new Date(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function startOfWeek(dateKey = toDateKey()) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const diffToSaturday = (day + 1) % 7;
  date.setDate(date.getDate() - diffToSaturday);
  return toDateKey(date);
}

export function getWeekDays(dateKey = toDateKey()) {
  const firstDay = startOfWeek(dateKey);
  return Array.from({ length: 7 }, (_, index) => addDays(firstDay, index));
}

export function getMonthDays(dateKey = toDateKey()) {
  const date = parseDateKey(dateKey);
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];

  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(toDateKey(new Date(year, month, day)));
  }

  return {
    days,
    leadingOffset: (first.getDay() + 1) % 7
  };
}

export function weekdayName(dateKey) {
  return FARSI_WEEKDAYS[parseDateKey(dateKey).getDay()];
}
