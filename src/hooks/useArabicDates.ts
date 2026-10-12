import { useEffect, useState } from "react";

import { getArabicDateParts, type ArabicDateParts } from "@/utils/hijriDates";

/**
 * تواريخ الترويسة (اليوم + الهجري + الميلادي) بتوقيت اليمن، وتُحدَّث تلقائياً
 * عند تغيّر اليوم: فحص كل دقيقة، وفحص فوري عند رجوع المستخدم إلى التطبيق
 * (مهم على الهاتف حيث تبقى الصفحة مفتوحة في الخلفية).
 */
export function useArabicDates(): ArabicDateParts {
  const [parts, setParts] = useState<ArabicDateParts>(() => getArabicDateParts());

  useEffect(() => {
    const refreshIfDayChanged = () => {
      setParts((prev) => {
        const next = getArabicDateParts();
        // نفس اليوم: نُبقي الكائن نفسه فلا تُعاد عملية الرسم بلا داعٍ.
        return next.dayKey === prev.dayKey ? prev : next;
      });
    };

    const interval = window.setInterval(refreshIfDayChanged, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfDayChanged();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refreshIfDayChanged);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refreshIfDayChanged);
    };
  }, []);

  return parts;
}
