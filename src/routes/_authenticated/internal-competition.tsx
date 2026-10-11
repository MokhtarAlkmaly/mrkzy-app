import { createFileRoute } from "@tanstack/react-router";
import InternalCompetition from "@/pages/InternalCompetition";

export const Route = createFileRoute("/_authenticated/internal-competition")({
  head: () => ({
    meta: [
      { title: "المسابقة الداخلية - مركز إنماء الأهلي الخيري" },
      { name: "description", content: "تسجيل نتائج المسابقات الداخلية للطلاب والطالبات." },
    ],
  }),
  component: InternalCompetition,
});
