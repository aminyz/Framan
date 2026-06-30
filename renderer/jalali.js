'use strict';
/**
 * jalali.js — تبدیل دقیق میلادی به شمسی (الگوریتم استاندارد jalaali-js)
 * این فایل جایگزین Intl.toLocaleDateString('fa-IR') می‌شود چون نسخه‌ی
 * تقویم فارسی داخل Electron/Chromium گاهی ۱ تا ۲ روز با تقویم رسمی ایران
 * اختلاف دارد (باگ شناخته‌شده‌ی ICU). این پیاده‌سازی مستقل و همیشه دقیق است.
 */
(function (global) {
  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }

  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
      + div(153 * mod(gm + 9, 12) + 2, 5)
      + gd - 34840408;
    d = d - div(div(gy + div(gm - 8, 6) + 100100, 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }

  const BREAKS = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];

  function jalCal(jy) {
    const bl = BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14, jp = BREAKS[0];
    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('Invalid Jalaali year ' + jy);
    let jump = 0, jm;
    for (let i = 1; i < bl; i += 1) {
      jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    let n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }

  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let jd, jm, k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
      k -= 186;
    } else {
      jy -= 1; k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy, jm, jd };
  }

  /** میلادی → شمسی  ورودی: Date یا (y,m,d) عددی میلادی */
  function toJalaali(gy, gm, gd) {
    if (gy instanceof Date) { const d = gy; gm = d.getMonth() + 1; gd = d.getDate(); gy = d.getFullYear(); }
    return d2j(g2d(gy, gm, gd));
  }

  /** شمسی → میلادی */
  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function toGregorian(jy, jm, jd) {
    const g = d2g(j2d(jy, jm, jd));
    return { gy: g.gy, gm: g.gm, gd: g.gd };
  }
  function isLeapJalaaliYear(jy) { return jalCal(jy).leap === 0; }
  function jalaaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaaliYear(jy) ? 30 : 29;
  }
  /** تبدیل {gy,gm,gd} به رشته‌ی ISO با صفر آغازین — برای کلید ذخیره‌سازی */
  function gregorianToISO(gy, gm, gd) {
    return `${gy}-${String(gm).padStart(2,'0')}-${String(gd).padStart(2,'0')}`;
  }

  const MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const WEEKDAYS_FULL  = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
  const WEEKDAYS_SHORT = ['ش','ی','د','س','چ','پ','ج'];
  const PERSIAN_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

  function toPersianDigits(n) {
    return String(n).replace(/[0-9]/g, d => PERSIAN_DIGITS[+d]);
  }

  /** جزء روز هفته شمسی: ۰=شنبه … ۶=جمعه (از Date.getDay() جاوااسکریپت محاسبه می‌شود) */
  function jWeekday(date) { return (date.getDay() + 1) % 7; }

  /**
   * فرمت‌دهی تاریخ شمسی از روی یک Date جاوااسکریپتی
   * style: 'full' → «سه‌شنبه ۹ تیر ۱۴۰۵» | 'short' → «۹ تیر» | 'monthYear' → «تیر ۱۴۰۵»
   */
  function formatJalali(date, style) {
    const { jy, jm, jd } = toJalaali(date);
    const wd = WEEKDAYS_FULL[jWeekday(date)];
    if (style === 'short')     return `${toPersianDigits(jd)} ${MONTHS[jm-1]}`;
    if (style === 'monthYear') return `${MONTHS[jm-1]} ${toPersianDigits(jy)}`;
    if (style === 'dayNum')    return toPersianDigits(jd);
    return `${wd} ${toPersianDigits(jd)} ${MONTHS[jm-1]} ${toPersianDigits(jy)}`; // full
  }

  global.Jalali = { toJalaali, toGregorian, gregorianToISO, jalaaliMonthLength, isLeapJalaaliYear,
                     formatJalali, toPersianDigits, jWeekday, MONTHS, WEEKDAYS_FULL, WEEKDAYS_SHORT };
})(window);
