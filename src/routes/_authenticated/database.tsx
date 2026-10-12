import { createFileRoute } from "@tanstack/react-router";
import Database from "@/pages/Database";

export const Route = createFileRoute("/_authenticated/database")({
  head: () => ({
    meta: [
      { title: "قاعدة البيانات - مركز إنماء الأهلي الخيري" },
      {
        name: "description",
        content:
          "مجلد قاعدة البيانات المحلية، النسخ الاحتياطية، التصدير والاستيراد، ونقل البيانات من النسخة السحابية.",
      },
    ],
  }),
  component: Database,
});
