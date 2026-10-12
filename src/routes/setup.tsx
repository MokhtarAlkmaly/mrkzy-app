import { createFileRoute } from "@tanstack/react-router";
import Setup from "@/pages/Setup";

const title = "مجلد قاعدة البيانات - مركز إنماء الأهلي الخيري";
const description =
  "اختر مجلد قاعدة البيانات في ذاكرة الهاتف أو على بطاقة SD — التطبيق يعمل بالكامل بدون إنترنت.";

export const Route = createFileRoute("/setup")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Setup,
});
