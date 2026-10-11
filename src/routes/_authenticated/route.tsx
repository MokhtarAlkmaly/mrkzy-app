import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TrainingSidebar } from "@/components/TrainingSidebar";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import { useLocation } from "@/lib/router-compat";
import { useLocalDatabase } from "@/hooks/useLocalDatabase";

const TRAINING_PATHS = ["/training", "/trainees", "/courses"];

function AuthenticatedLayout() {
  const location = useLocation();
  const pathname = location?.pathname || "";

  // تهيئة قاعدة البيانات المحلية (SQLite/WASM) تحدث هنا فقط — أي بعد تسجيل
  // الدخول — بدل تحميلها على كل صفحة من الجذر. صفحتا الدخول وبوابة المعلم/ة
  // تبقيان خفيفتين.
  useLocalDatabase();

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
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});
