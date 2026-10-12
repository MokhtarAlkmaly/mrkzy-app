/**
 * فحوص الترويسة الموحّدة (src/components/CenterHeader.tsx) بلا متصفح:
 * تُحمَّل الوحدة عبر Vite (ssrLoadModule) ثم تُصيَّر إلى HTML نصي داخل راوتر
 * ذاكري ونفحص المخرجات — للتأكد من أن كل صفحة تعرض الاسم والعنوان والتواريخ.
 *
 * ما تتحقق منه:
 *   1) اسم المركز كبيراً في الترويسة (h1).
 *   2) عنوان الصفحة تحت اسم المركز (h2) مع السطر التوضيحي.
 *   3) اليوم + التاريخ الهجري + التاريخ الميلادي بتوقيت اليمن.
 *   4) خلو الترويسة من عبارة «نظام إدارة…» ومن أي عام نشط.
 *   5) زر الرجوع ورابطه، وإمكانية إخفاء التواريخ، ونمط قسم التدريب.
 *
 * التشغيل: npm run test:header
 */

import { createServer } from "vite";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";

const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

/** تصيير عنصر داخل راوتر ذاكري (Link يحتاج سياق راوتر). */
async function render(element) {
  const rootRoute = createRootRoute({ component: () => element });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(React.createElement(RouterProvider, { router }));
}

const results = [];
const check = (name, ok) => results.push({ name, ok: !!ok });

try {
  const { CenterHeader } = await server.ssrLoadModule("/src/components/CenterHeader.tsx");
  const { getArabicDateParts } = await server.ssrLoadModule("/src/utils/hijriDates.ts");
  const dates = getArabicDateParts();

  const html = await render(
    React.createElement(CenterHeader, {
      title: "السجل الرسمي للطلاب والطالبات",
      subtitle: "جميع الأعوام — 5 مسجّل",
    }),
  );

  check("اسم المركز ظاهر في الترويسة", html.includes("مركز إنماء الأهلي الخيري"));
  check(
    "اسم المركز بحجم كبير (h1 مع text-2xl و sm:text-3xl)",
    /<h1[^>]*text-2xl[^>]*sm:text-3xl/.test(html) && /<h1[^>]*font-black/.test(html),
  );
  check(
    "عنوان الصفحة أسفل الاسم داخل h2",
    /<h2[^>]*>[\s\S]*?<span[^>]*>السجل الرسمي للطلاب والطالبات<\/span>/.test(html) &&
      html.indexOf("<h1") < html.indexOf("<h2"),
  );
  check("السطر التوضيحي يظهر", html.includes("جميع الأعوام"));
  check("اسم اليوم ظاهر", !!dates.dayName && html.includes(dates.dayName));
  check("التاريخ الهجري ظاهر", !!dates.hijriDate && html.includes(dates.hijriDate));
  check("التاريخ الميلادي ظاهر", !!dates.gregorianDate && html.includes(dates.gregorianDate));
  check("التواريخ بتوقيت اليمن (اليوم الفعلي لليمن)", dates.dayKey === getArabicDateParts().dayKey);
  check("لا توجد عبارة «نظام إدارة»", !html.includes("نظام إدارة"));
  check("لا يظهر أي عام نشط في الترويسة", !/عام\s*\d/.test(html));

  const withBack = await render(
    React.createElement(CenterHeader, {
      title: "الإعدادات",
      backTo: "/students",
      backLabel: "رجوع لصفحة الطلاب والطالبات",
    }),
  );
  check("زر الرجوع يظهر عند تمريره", withBack.includes("رجوع لصفحة الطلاب والطالبات"));
  check("رابط الرجوع صحيح", withBack.includes('href="/students"'));

  const hiddenDates = await render(
    React.createElement(CenterHeader, { title: "الإعدادات", showDates: false }),
  );
  check("يمكن إخفاء التواريخ عند الحاجة", !hiddenDates.includes(dates.gregorianDate));

  const training = await render(
    React.createElement(CenterHeader, { title: "الدورات", variant: "training" }),
  );
  check("نمط قسم التدريب يظهر بلونه الخاص", training.includes("from-amber-600"));
} finally {
  await server.close();
}

let passed = 0;
console.log("\nفحوص الترويسة الموحّدة:\n");
for (const { name, ok } of results) {
  console.log(`  ${ok ? "✅" : "❌"} ${name}`);
  if (ok) passed += 1;
}
console.log(`\nالنتيجة: ${passed} نجحت، ${results.length - passed} فشلت من ${results.length}\n`);

if (passed !== results.length) process.exit(1);
