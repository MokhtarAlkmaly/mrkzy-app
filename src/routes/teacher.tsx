import { createFileRoute } from "@tanstack/react-router";
import TeacherPortal from "@/pages/TeacherPortal";
import { requireDatabase } from "@/offline/routeGuard";

// بوابة المعلم/ة: /teacher?t=<code>&y=<year>&m=<month>
// في النسخة التي تعمل بدون إنترنت تُفتح على نفس الجهاز (من صفحة «روابط
// المعلمين والمعلمات») ويُحفظ الترسيل في مجلد قاعدة البيانات.
export const Route = createFileRoute("/teacher")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    await requireDatabase(location);
  },
  component: TeacherPortal,
});
