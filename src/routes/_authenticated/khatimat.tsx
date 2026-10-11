import { createFileRoute } from "@tanstack/react-router";
import Khatimat from "@/pages/Khatimat";

export const Route = createFileRoute("/_authenticated/khatimat")({
  head: () => ({
    meta: [
      { title: "كشف الخاتمين والخاتمات - مركز إنماء الأهلي الخيري" },
      {
        name: "description",
        content: "قائمة الطلاب والطالبات الذين ختموا القرآن الكريم عبر جميع الأعوام.",
      },
      { property: "og:title", content: "كشف الخاتمين والخاتمات - مركز إنماء الأهلي الخيري" },
      {
        property: "og:description",
        content: "قائمة الطلاب والطالبات الذين ختموا القرآن الكريم عبر جميع الأعوام.",
      },
    ],
  }),
  component: Khatimat,
});
