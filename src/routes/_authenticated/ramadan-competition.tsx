import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";

const title = "كشف المسابقة الرمضانية - مركز إنماء";
const description = "كشف المسابقة الرمضانية لحفظ القرآن الكريم - مركز إنماء الأهلي الخيري.";

export const Route = createFileRoute("/_authenticated/ramadan-competition")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Index,
});
