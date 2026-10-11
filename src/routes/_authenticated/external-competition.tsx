import { createFileRoute } from "@tanstack/react-router";
import ExternalCompetition from "@/pages/ExternalCompetition";

export const Route = createFileRoute("/_authenticated/external-competition")({
  head: () => ({
    meta: [
      { title: "المسابقة الخارجية - مركز إنماء الأهلي الخيري" },
      { name: "description", content: "تسجيل نتائج المسابقات الخارجية للطلاب والطالبات." },
    ],
  }),
  component: ExternalCompetition,
});
