import { createFileRoute } from "@tanstack/react-router";
import Students from "@/pages/Students";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({
    meta: [
      { title: "الطلاب والطالبات - مركز إنماء الأهلي الخيري" },
      {
        name: "description",
        content:
          "السجل الرسمي الشامل لكل الأعوام (غير مرتبط بعام محدد) — مرتبط بالمعلمين والمعلمات، المتابعة الشهرية، المسابقات، التكريم، والشهادات.",
      },
      { property: "og:title", content: "الطلاب والطالبات - مركز إنماء الأهلي الخيري" },
      {
        property: "og:description",
        content: "السجل الرسمي الشامل لكل الأعوام (غير مرتبط بعام محدد).",
      },
    ],
  }),
  component: Students,
});
