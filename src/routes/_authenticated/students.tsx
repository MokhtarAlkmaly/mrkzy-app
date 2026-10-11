import { createFileRoute } from "@tanstack/react-router";
import Students from "@/pages/Students";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({
    meta: [
      { title: "الطلاب والطالبات - مركز إنماء الأهلي الخيري" },
      {
        name: "description",
        content:
          "الصفحة المركزية للطلاب والطالبات، مرتبطة بكل صفحات النظام: المعلمون والمعلمات، المتابعة الشهرية، المسابقات، التكريم، الشهادات وغيرها.",
      },
      { property: "og:title", content: "الطلاب والطالبات - مركز إنماء الأهلي الخيري" },
      {
        property: "og:description",
        content: "الصفحة المركزية للطلاب والطالبات، مرتبطة بكل صفحات النظام.",
      },
    ],
  }),
  component: Students,
});
