import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import Auth from "@/pages/Auth";
import { useAuth, isPasswordRecoveryPending } from "@/hooks/useAuth";
import { getSafeNextPath } from "@/utils/authRedirect";

const title = "تسجيل الدخول - مركز إنماء الأهلي الخيري";
const description = "الدخول إلى نظام إدارة مركز إنماء الأهلي الخيري: قسم القرآن الكريم والتدريب.";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthRoute,
});

function AuthRoute() {
  const { user, loading, passwordRecovery } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // أثناء استعادة كلمة المرور توجد جلسة مؤقتة، لكن يجب أن يعيّن المستخدم
    // كلمة مرور جديدة أولاً — صفحة الدخول تعرض نموذج التعيين بدل التحويل.
    if (loading || !user || passwordRecovery || isPasswordRecoveryPending()) return;
    navigate({ to: (getSafeNextPath() || "/") as never, replace: true });
  }, [user, loading, passwordRecovery, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        جارٍ التحميل...
      </div>
    );
  }

  return <Auth />;
}
