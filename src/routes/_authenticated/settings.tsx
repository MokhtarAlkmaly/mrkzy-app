import { createFileRoute } from "@tanstack/react-router";
import Settings from "@/pages/Settings";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات - مركز إنماء الأهلي الخيري" },
      {
        name: "description",
        content: "إعدادات عامة للنظام: العام النشط، اسم المركز، والتوقيعات الافتراضية.",
      },
    ],
  }),
  component: Settings,
});
