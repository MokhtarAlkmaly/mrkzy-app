import { createFileRoute } from "@tanstack/react-router";
import ExternalCompetition from "@/pages/ExternalCompetition";

export const Route = createFileRoute("/_authenticated/external-competition")({
  head: () => ({
    meta: [
      { title: "المسابقة الخارجية - نظام المسابقة الرمضانية" },
      { name: "description", content: "تسجيل نتائج المسابقات الخارجية للطالبات." },
    ],
  }),
  component: ExternalCompetition,
});
