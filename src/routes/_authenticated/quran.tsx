import { createFileRoute } from "@tanstack/react-router";
import Home from "@/pages/Home";

const title = "قسم القرآن الكريم - مركز إنماء";
const description =
  "الصفحة الرئيسية لقسم القرآن الكريم: الطلاب، المعلمين، المتابعة الشهرية، والمسابقات.";

export const Route = createFileRoute("/_authenticated/quran")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Home,
});
