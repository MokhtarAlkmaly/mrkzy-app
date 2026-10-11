import { createFileRoute } from "@tanstack/react-router";
import Search from "@/pages/Search";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "بحث عن طالب/طالبة - مركز إنماء الأهلي الخيري" },
      {
        name: "description",
        content:
          "بحث عن الطالب/الطالبة وعرض سجلها الشامل لكل الأعوام مع الطباعة والتصدير والمشاركة.",
      },
      { property: "og:title", content: "بحث عن طالب/طالبة - مركز إنماء الأهلي الخيري" },
      {
        property: "og:description",
        content: "سجل الطالب/الطالبة الكامل لجميع الأعوام قابل للتعديل والطباعة والتصدير.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Search,
});
