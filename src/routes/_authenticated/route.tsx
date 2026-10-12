import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TrainingSidebar } from "@/components/TrainingSidebar";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import { useLocation } from "@/lib/router-compat";
import { useLocalDatabase } from "@/hooks/useLocalDatabase";
import { isPasswordRecoveryPending, useAuth } from "@/hooks/useAuth";

const TRAINING_PATHS = ["/training", "/trainees", "/courses"];

function AuthenticatedLayout() {
  const location = useLocation();
  const pathname = location?.pathname || "";

  // تهيئة قاعدة البيانات المحلية (SQLite/WASM) تحدث هنا فقط — أي بعد تسجيل
  // الدخول — بدل تحميلها على كل صفحة من الجذر. صفحتا الدخول وبوابة المعلم/ة
  // تبقيان خفيفتين.
  useLocalDatabase();

  // بعد تسجيل الخروج (من أي زر في النظام) ننتقل فوراً لصفحة الدخول، بدل بقاء
  // الصفحة الحالية معروضة حتى أول تنقّل.
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  // تحميل صفحة الدخول مسبقاً في الخلفية حتى يعمل التحويل إليها بعد تسجيل
  // الخروج حتى لو انقطع الاتصال لاحقاً (على الويب تُحمَّل الصفحات عند الطلب).
  useEffect(() => {
    router.preloadRoute({ to: "/auth" }).catch(() => {});
  }, [router]);

  // شاشة اختيار القسم: بلا شريط جانبي، تعرض بكامل الشاشة
  if (pathname === "/") {
    return <Outlet />;
  }

  const isTraining = TRAINING_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  return (
    <SidebarProvider>
      {isTraining ? <TrainingSidebar /> : <AppSidebar />}
      <SidebarInset>
        {/* يظهر فقط أثناء الاطلاع على بيانات مستخدم آخر (قراءة فقط) */}
        <ViewAsBanner />
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/80 px-2 py-1.5 backdrop-blur">
          <SidebarTrigger />
          <span className="text-xs text-muted-foreground">القائمة</span>
        </div>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // getSession تقرأ الجلسة المحفوظة على الجهاز دون طلب شبكة، فيفتح النظام
    // (المبني للعمل دون اتصال) حتى عند انقطاع الإنترنت. سابقاً كانت getUser
    // تتطلب اتصالاً في كل تنقّل، فيُحوَّل المستخدم لصفحة الدخول بلا اتصال.
    const { data, error } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (error || !user) {
      // نحفظ الصفحة المطلوبة للعودة إليها مباشرة بعد تسجيل الدخول.
      const next = location.href && location.href !== "/" ? location.href : null;
      throw redirect({ href: next ? `/auth?next=${encodeURIComponent(next)}` : "/auth" });
    }
    // فُتح رابط استعادة كلمة المرور: يجب تعيين كلمة جديدة قبل دخول النظام.
    if (isPasswordRecoveryPending()) throw redirect({ href: "/auth" });
    return { user };
  },
  component: AuthenticatedLayout,
});
