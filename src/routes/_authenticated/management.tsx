import { createFileRoute } from "@tanstack/react-router";
import Management from "@/pages/Management";

export const Route = createFileRoute("/_authenticated/management")({
  head: () => ({
    meta: [
      { title: "الإدارة - نظام المسابقة الرمضانية" },
      { name: "description", content: "لوحة إدارة عامة تجمع إحصائيات كل أقسام النظام مع روابط سريعة." },
    ],
  }),
  component: Management,
});
