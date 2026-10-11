import { createFileRoute } from "@tanstack/react-router";
import MonthlyTrackingSearch from "@/pages/MonthlyTrackingSearch";
import { useLocalDatabase } from "@/hooks/useLocalDatabase";

// مسار عام (بدون تسجيل دخول) لكنه يقرأ من قاعدة البيانات المحلية،
// لذا يهيّئها بنفسه بدل الاعتماد على الجذر.
function MonthlySearchPage() {
  useLocalDatabase();
  return <MonthlyTrackingSearch />;
}

export const Route = createFileRoute("/monthly-search")({
  head: () => ({
    meta: [
      { title: "بحث المتابعة الشهرية - مركز إنماء الأهلي الخيري" },
      {
        name: "description",
        content:
          "سجل المتابعة الشهرية الكامل للطالب/طالبة خلال أشهر العام، بمقارنة نسب التقدم بالحفظ والمراجعة، قابل للطباعة والمشاركة.",
      },
      { property: "og:title", content: "بحث المتابعة الشهرية - مركز إنماء الأهلي الخيري" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MonthlySearchPage,
});
