/**
 * تواريخ الترويسة: اسم اليوم + التاريخ الهجري (أم القرى) + التاريخ الميلادي،
 * محسوبة **بتوقيت اليمن** (Asia/Aden) حتى تظهر صحيحة على أي جهاز مهما كان
 * توقيت الجهاز، وتُحدَّث تلقائياً عند تغيّر اليوم.
 */

export const YEMEN_TIME_ZONE = "Asia/Aden";

export type ArabicDateParts = {
  /** اسم اليوم، مثل: السبت */
  dayName: string;
  /** التاريخ الهجري، مثل: 20 ربيع الآخر 1447هـ */
  hijriDate: string;
  /** التاريخ الميلادي، مثل: 11 أكتوبر 2025م */
  gregorianDate: string;
  /** مفتاح اليوم بتوقيت اليمن (YYYY-MM-DD) — لكشف تغيّر اليوم بلا إعادة رسم */
  dayKey: string;
  /** سطر واحد جاهز للطباعة: اليوم · الهجري · الميلادي */
  fullLine: string;
};

/** تقاويم هجرية مرتّبة: أم القرى أولاً ثم بدائل احتياطية */
const HIJRI_LOCALES = ["ar-SA-u-ca-islamic-umalqura", "ar-SA-u-ca-islamic", "ar-SA"];

/** توحيد كتابة اللاحقة: "١٤٤٧ هـ" → "١٤٤٧هـ" وإزالة الفراغات المزدوجة */
function tidyArabic(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s*هـ\s*$/, "هـ")
    .trim();
}

/** اسم اليوم بتوقيت اليمن (يُرجع نصاً فارغاً لو لم يدعم الجهاز التقويم) */
export function getArabicDayName(date: Date, timeZone: string = YEMEN_TIME_ZONE): string {
  try {
    return date.toLocaleDateString("ar-EG", { weekday: "long", timeZone });
  } catch {
    return "";
  }
}

/** التاريخ الميلادي بالعربية، مثل: 11 أكتوبر 2025م */
export function getGregorianDate(date: Date, timeZone: string = YEMEN_TIME_ZONE): string {
  try {
    const value = date.toLocaleDateString("ar-EG", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    });
    return value ? `${tidyArabic(value)}م` : "";
  } catch {
    return "";
  }
}

/**
 * أول لغة يدعمها الجهاز مع تقويم هجري فعلي (islamic-umalqura).
 * مهم: بعض الأجهزة تُرجع التاريخ الميلادي عند طلب "ar-SA" وحدها، ولهذا نتحقق من
 * التقويم المُحلّ فعلياً (resolvedOptions().calendar) قبل استخدامه.
 */
function resolveHijriLocale(timeZone: string): string | null {
  for (const locale of HIJRI_LOCALES) {
    try {
      const resolved = new Intl.DateTimeFormat(locale, {
        timeZone,
        calendar: "islamic-umalqura",
      }).resolvedOptions().calendar;
      if (typeof resolved === "string" && resolved.startsWith("islamic")) return locale;
    } catch {
      // لغة/تقويم غير مدعوم على هذا الجهاز — نجرّب البديل التالي.
    }
  }
  return null;
}

/** التاريخ الهجري (أم القرى)، مثل: 20 ربيع الآخر 1447هـ */
export function getHijriDate(date: Date, timeZone: string = YEMEN_TIME_ZONE): string {
  const locale = resolveHijriLocale(timeZone);
  if (!locale) return "";
  try {
    const value = date.toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
      calendar: "islamic-umalqura",
    });
    if (!value) return "";
    return `${tidyArabic(value).replace(/هـ$/, "")}هـ`;
  } catch {
    return "";
  }
}

/** مفتاح اليوم (YYYY-MM-DD) بتوقيت اليمن */
export function getDayKey(date: Date, timeZone: string = YEMEN_TIME_ZONE): string {
  try {
    return date.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** كل أجزاء التاريخ التي تحتاجها الترويسة */
export function getArabicDateParts(
  date: Date = new Date(),
  timeZone: string = YEMEN_TIME_ZONE,
): ArabicDateParts {
  const dayName = getArabicDayName(date, timeZone);
  const hijriDate = getHijriDate(date, timeZone);
  const gregorianDate = getGregorianDate(date, timeZone);
  return {
    dayName,
    hijriDate,
    gregorianDate,
    dayKey: getDayKey(date, timeZone),
    fullLine: [dayName, hijriDate, gregorianDate].filter(Boolean).join(" · "),
  };
}
