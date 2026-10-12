import { createFileRoute } from "@tanstack/react-router";
import MonthlyTrackingSearch from "@/pages/MonthlyTrackingSearch";
import { requireDatabase } from "@/offline/routeGuard";

// يقرأ من قاعدة بيانات المجلد المحلية، لذا يتأكد من فتحها أولاً.
export const Route = createFileRoute("/monthly-search")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    await requireDatabase(location);
  },
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
  component: MonthlyTrackingSearch,
});
