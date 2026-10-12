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

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "vite";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";

const root = process.cwd();

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const server = await createServer({
  root,
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
    "اسم المركز بحجم كبير وسائل يتدرّج مع كل الشاشات (h1 مع clamp)",
    /<h1[^>]*text-\[clamp\([^)]*vw[^)]*\)\]/.test(html) && /<h1[^>]*font-black/.test(html),
  );
  check(
    "الشعار داخل إطار أبيض (دائرة أو مربع بزوايا دائرية)",
    /<div[^>]*bg-white[^>]*(rounded-full|rounded-\[\d+%\])[^>]*>[\s\S]*?<img/.test(html),
  );
  check(
    "مكان الشعار ثابت في وسط الصف الأعلى (عمود auto بين طرفين مرنين)",
    html.includes("grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"),
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

  // فحوص اتساق في المصادر عبر صفحات النظام
  const unifiedHeaderPages = [
    "Awards.tsx",
    "Certificates.tsx",
    "Courses.tsx",
    "Donors.tsx",
    "ExamQuestions.tsx",
    "Expenses.tsx",
    "Halaqat.tsx",
    "Home.tsx",
    "Management.tsx",
    "Media.tsx",
    "Settings.tsx",
    "StudentCompetition.tsx",
    "Students.tsx",
    "Teachers.tsx",
    "Trainees.tsx",
    "TrainingHome.tsx",
    "Users.tsx",
  ];
  check(
    "جميع الصفحات الـ17 الموحّدة تستعمل <CenterHeader",
    unifiedHeaderPages.every((file) =>
      readFileSync(join(root, "src/pages", file), "utf8").includes("<CenterHeader"),
    ),
  );

  const deptSelectSrc = readFileSync(join(root, "src/pages/DepartmentSelect.tsx"), "utf8");
  check(
    "صفحة اختيار القسم تعرض اسم المركز والتاريخين وأسماء الأقسام الموحّدة",
    deptSelectSrc.includes("CENTER_NAME") &&
      deptSelectSrc.includes("QURAN_DEPARTMENT_NAME") &&
      deptSelectSrc.includes("TRAINING_DEPARTMENT_NAME") &&
      deptSelectSrc.includes("useArabicDates") &&
      deptSelectSrc.includes("hijriDate") &&
      deptSelectSrc.includes("gregorianDate"),
  );

  const submissionsSrc = readFileSync(join(root, "src/pages/Submissions.tsx"), "utf8");
  const teacherLinksSrc = readFileSync(join(root, "src/pages/TeacherLinks.tsx"), "utf8");
  check(
    "صفحتا «وارد المعلمين» و«روابط المعلمين» تعرضان اسم المركز والتاريخين",
    submissionsSrc.includes("CENTER_NAME") &&
      submissionsSrc.includes("useArabicDates") &&
      teacherLinksSrc.includes("CENTER_NAME") &&
      teacherLinksSrc.includes("useArabicDates"),
  );

  const indexSrc = readFileSync(join(root, "src/pages/Index.tsx"), "utf8");
  check(
    "صفحة كشف المسابقة تعرض اسم المركز وقسم القرآن الكريم وتاريخ اليوم بتوقيت اليمن",
    indexSrc.includes("مركز إنماء الأهلي الخيري") &&
      indexSrc.includes("QURAN_DEPARTMENT_NAME") &&
      indexSrc.includes("useArabicDates"),
  );

  const allSrcFiles = collectSourceFiles(join(root, "src"));
  check(
    "خلو جميع ملفات src/ من عبارة «نظام إدارة»",
    allSrcFiles.every((f) => !readFileSync(f, "utf8").includes("نظام إدارة")),
  );

  const allowedHeaderFiles = new Set([
    join(root, "src/components/CenterHeader.tsx"),
    join(root, "src/pages/Index.tsx"),
    join(root, "src/pages/TeacherPortal.tsx"),
  ]);
  check(
    "لا توجد ترويسات <header قديمة خارج المكوّن الموحّد والصفحات المخصّصة",
    allSrcFiles.every(
      (f) => allowedHeaderFiles.has(f) || !readFileSync(f, "utf8").includes("<header"),
    ),
  );

  const homeSrc = readFileSync(join(root, "src/pages/Home.tsx"), "utf8");
  check(
    "ترويسة الرئيسية خالية من عرض العام النشط",
    !homeSrc.includes("activeYear") && !homeSrc.includes("العام النشط:"),
  );

  const studentsSrc = readFileSync(join(root, "src/pages/Students.tsx"), "utf8");
  check("خلو صفحة الطلاب من عمود «سنوات التسجيل»", !studentsSrc.includes("سنوات التسجيل"));

  check(
    "تسمية «الصف الدراسي» مستخدمة وخلو src/ من «السنة الدراسية»",
    studentsSrc.includes("الصف الدراسي") &&
      allSrcFiles.every((f) => !readFileSync(f, "utf8").includes("السنة الدراسية")),
  );

  check(
    "صفحة الطلاب لا تسجّل الطالب تلقائياً في عام ولا تعرض منتقي سنة التسجيل ولا زر حذف بيانات عام",
    !studentsSrc.includes("سنة التسجيل") &&
      !studentsSrc.includes("saveStudentsForYear") &&
      !studentsSrc.includes("deleteYearData") &&
      !studentsSrc.includes("enrollYear"),
  );

  const studentsRouteSrc = readFileSync(
    join(root, "src/routes/_authenticated/students.tsx"),
    "utf8",
  );
  check(
    "وصف مسار الطلاب يوضّح أنه السجل الرسمي الشامل لكل الأعوام (غير مرتبط بعام محدد)",
    studentsRouteSrc.includes("السجل الرسمي الشامل لكل الأعوام (غير مرتبط بعام محدد)"),
  );
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
