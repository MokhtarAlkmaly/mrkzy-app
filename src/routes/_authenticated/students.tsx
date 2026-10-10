import { createFileRoute } from "@tanstack/react-router";
import Students from "@/pages/Students";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({
    meta: [
      { title: "الطالبات - نظام المسابقة الرمضانية" },
      { name: "description", content: "الصفحة المركزية للطالبات، مرتبطة بكل صفحات النظام: المعلمات، المتابعة الشهرية، المسابقات، التكريم، الشهادات وغيرها." },
      { property: "og:title", content: "الطالبات - نظام المسابقة الرمضانية" },
      { property: "og:description", content: "الصفحة المركزية للطالبات، مرتبطة بكل صفحات النظام." },
    ],
  }),
  component: Students,
});
