import { createFileRoute } from "@tanstack/react-router";
import Reports from "@/pages/Reports";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير - نظام المسابقة الرمضانية" },
      { name: "description", content: "ابحث عن أي طالبة واطبع تقريرًا شاملًا يضم كل بياناتها: المسابقة الرمضانية، المتابعة الشهرية، والتكريم." },
    ],
  }),
  component: Reports,
});
